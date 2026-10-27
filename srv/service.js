const cds = require('@sap/cds');
const LOG = cds.log('psa');

// ---------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------
const TAX_RATE = Number(process.env.PSA_TAX_RATE ?? 0.18);   // configurable tax
const COUNTED_STATUSES = ['Submitted', 'Approved', 'Invoiced']; // hours that count towards roll-up
const EDITABLE_STATUSES = ['Draft', 'Rejected'];                // timesheet can be edited / (re)submitted
const EMPLOYEE_ROLES = ['Employee', 'Manager', 'Finance', 'Admin'];
const EMPLOYEE_STATUSES = ['Active', 'Inactive', 'OnLeave'];
const PROJECT_STATUSES = ['Draft', 'Active', 'OnHold', 'Completed', 'Cancelled'];
const BILLING_TYPES = ['Fixed', 'TM', 'Retainer'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const toISO = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
const today = () => toISO(new Date());
const num = v => Number(v || 0);
const round2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
// bound action key can arrive as a plain value or as { ID }
const keyOf = p => (p && typeof p === 'object' ? p.ID : p);
const unique = arr => [...new Set(arr.filter(Boolean))];

module.exports = cds.service.impl(async function () {

    const {
        Clients, Employees, Projects, Budgets, Milestones, Tasks,
        Timesheets, TimesheetEntries, Invoices
    } = this.entities;

    // =================================================================
    // ROLL-UP ENGINE  (Entry hours > Task actual > Project consumed > Budget)
    // =================================================================

    /** Entries that sit on Submitted / Approved / Invoiced timesheets for the given tasks */
    async function validEntries(taskIDs) {
        if (!taskIDs.length) return [];
        const entries = await SELECT.from(TimesheetEntries).where({ task_ID: { in: taskIDs } });
        const sheetIDs = unique(entries.map(e => e.timesheet_ID));
        if (!sheetIDs.length) return [];
        const sheets = await SELECT.from(Timesheets).columns('ID')
            .where({ ID: { in: sheetIDs }, status: { in: COUNTED_STATUSES } });
        const ok = new Set(sheets.map(s => s.ID));
        return entries.filter(e => ok.has(e.timesheet_ID));
    }

    /** All task IDs (and milestones) of a project */
    async function projectStructure(projectID) {
        const milestones = await SELECT.from(Milestones).where({ project_ID: projectID });
        const msIDs = milestones.map(m => m.ID);
        const tasks = msIDs.length
            ? await SELECT.from(Tasks).where({ milestone_ID: { in: msIDs } })
            : [];
        return { milestones, tasks };
    }

    /** Recompute Task.actualHours, Milestone.completionPercent, Project.consumedHours, Budget amounts/status */
    async function recalcProject(projectID) {
        const { milestones, tasks } = await projectStructure(projectID);
        const entries = await validEntries(tasks.map(t => t.ID));

        const hoursByTask = {};
        let billableHours = 0;
        for (const e of entries) {
            hoursByTask[e.task_ID] = (hoursByTask[e.task_ID] || 0) + num(e.hours);
            if (e.isBillable) billableHours += num(e.hours);
        }

        // Task level (FR-008: warning 80%, error 100%)
        let consumedHours = 0;
        for (const t of tasks) {
            const actual = round2(hoursByTask[t.ID] || 0);
            consumedHours += actual;
            if (num(t.actualHours) !== actual) {
                await UPDATE(Tasks).set({ actualHours: actual }).where({ ID: t.ID });
            }
            const est = num(t.estimatedHours);
            if (est > 0) {
                const pct = (actual / est) * 100;
                if (pct >= 100) LOG.error(`Task ${t.taskName} reached 100% of estimate (${pct.toFixed(0)}%)`);
                else if (pct >= 80) LOG.warn(`Task ${t.taskName} reached 80% of estimate (${pct.toFixed(0)}%)`);
            }
        }

        // Milestone level
        for (const m of milestones) {
            const mTasks = tasks.filter(t => t.milestone_ID === m.ID);
            const done = mTasks.filter(t => t.status === 'Done').length;
            const pct = mTasks.length ? round2((done / mTasks.length) * 100) : 0;
            await UPDATE(Milestones).set({ completionPercent: pct }).where({ ID: m.ID });
        }

        // Project level
        await UPDATE(Projects).set({ consumedHours: round2(consumedHours) }).where({ ID: projectID });

        // Budget level (FR-007, FR-009)
        const budget = await SELECT.one.from(Budgets).where({ project_ID: projectID });
        if (budget) {
            const consumedAmt = round2(billableHours * num(budget.billingRateHr));
            const remainingAmt = round2(num(budget.budgetAmt) - consumedAmt);
            const ratio = num(budget.budgetAmt) > 0 ? consumedAmt / num(budget.budgetAmt) : 0;

            let status = 'WithinBudget';
            if (ratio > 1) status = 'Breached';
            else if (ratio >= 0.8) status = 'AtRisk';

            await UPDATE(Budgets)
                .set({ consumedAmt, remainingAmt, status })
                .where({ ID: budget.ID });

            // FR-009 thresholds 75 / 90 / 100 (replace with Alert Notification service later)
            if (ratio >= 1) LOG.error(`Project ${projectID}: budget 100% consumed`);
            else if (ratio >= 0.9) LOG.warn(`Project ${projectID}: budget 90% consumed`);
            else if (ratio >= 0.75) LOG.warn(`Project ${projectID}: budget 75% consumed`);
        }
    }

    /** Find every project touched by a timesheet and recalc it */
    async function rollUpTimesheet(timesheetID) {
        const entries = await SELECT.from(TimesheetEntries).where({ timesheet_ID: timesheetID });
        const taskIDs = unique(entries.map(e => e.task_ID));
        if (!taskIDs.length) return;
        const tasks = await SELECT.from(Tasks).columns('ID', 'milestone_ID').where({ ID: { in: taskIDs } });
        const msIDs = unique(tasks.map(t => t.milestone_ID));
        if (!msIDs.length) return;
        const milestones = await SELECT.from(Milestones).columns('ID', 'project_ID').where({ ID: { in: msIDs } });
        for (const pID of unique(milestones.map(m => m.project_ID))) {
            await recalcProject(pID);
        }
    }

    // =================================================================
    // TIMESHEET ENTRY VALIDATION
    // =================================================================
    this.before(['CREATE', 'UPDATE'], 'TimesheetEntries', async (req) => {
        const { hours } = req.data;
        if (hours !== undefined && hours !== null && (num(hours) < 0.25 || num(hours) > 24)) {
            return req.reject(400, 'Hours must be between 0.25 and 24');
        }

        let tsID = req.data.timesheet_ID;
        if (!tsID && req.data.ID) {
            const e = await SELECT.one.from(TimesheetEntries).columns('timesheet_ID').where({ ID: req.data.ID });
            tsID = e?.timesheet_ID;
        }
        if (tsID) {
            const ts = await SELECT.one.from(Timesheets).columns('status').where({ ID: tsID });
            if (ts && !EDITABLE_STATUSES.includes(ts.status)) {
                return req.reject(400, `Entries are locked while the timesheet is ${ts.status}`);
            }
        }
    });

    // =================================================================
    // TIMESHEETS
    // =================================================================

    // Create (unbound)
    // Create (unbound)
    this.on('CreateTimesheet', async (req) => {
        const { employeeID, weekStartDate, weekEndDate, totalBillableHours, status, submittedDate } = req.data;

        const emp = await SELECT.one.from(Employees).where({ ID: employeeID });
        if (!emp) return req.reject(404, 'Employee not found');
        if (emp.status !== 'Active') return req.reject(400, 'Inactive employees cannot log time');
        if (weekStartDate && weekEndDate && weekEndDate < weekStartDate) {
            return req.reject(400, 'weekEndDate must be on or after weekStartDate');
        }

        const timesheetStatus = status || 'Draft';
        const timesheetId = cds.utils.uuid();

        await INSERT.into(Timesheets).entries({
            ID: timesheetId,
            employee_ID: employeeID,
            weekStartDate,
            weekEndDate,
            totalBillableHours: totalBillableHours ?? 0,
            status: timesheetStatus,
            submittedDate: submittedDate || (timesheetStatus === 'Submitted' ? today() : null),
            approvedBy_ID: timesheetStatus === 'Approved' ? emp.reportingManager_ID : null,
            approvedDate: timesheetStatus === 'Approved' ? today() : null
        });

        // If created directly in an approved or submitted state with hours, run the roll-up engine
        if (COUNTED_STATUSES.includes(timesheetStatus)) {
            await rollUpTimesheet(timesheetId);
        }

        return 'Timesheet Created Successfully';
    });
    // Update (unbound) - only Draft / Rejected; status is controlled by the workflow actions
    this.on('UpdateTimesheet', async (req) => {
        const { TimesheetID, employeeID, weekStartDate, weekEndDate, totalBillableHours } = req.data;

        const ts = await SELECT.one.from(Timesheets).where({ ID: TimesheetID });
        if (!ts) return req.reject(404, 'Timesheet not found');
        if (!EDITABLE_STATUSES.includes(ts.status)) {
            return req.reject(400, `A ${ts.status} timesheet cannot be changed`);
        }

        await UPDATE(Timesheets)
            .set({
                employee_ID: employeeID ?? ts.employee_ID,
                weekStartDate: weekStartDate ?? ts.weekStartDate,
                weekEndDate: weekEndDate ?? ts.weekEndDate,
                totalBillableHours: totalBillableHours ?? ts.totalBillableHours
            })
            .where({ ID: TimesheetID });
        return 'Timesheet Updated Successfully';
    });

    // Delete (unbound) - only Draft
    this.on('DeleteTimesheet', async (req) => {
        const { TimesheetID } = req.data;
        const ts = await SELECT.one.from(Timesheets).where({ ID: TimesheetID });
        if (!ts) return req.reject(404, 'Timesheet not found');
        if (ts.status !== 'Draft') return req.reject(400, 'Only Draft timesheets can be deleted');

        await DELETE.from(TimesheetEntries).where({ timesheet_ID: TimesheetID });
        await DELETE.from(Timesheets).where({ ID: TimesheetID });
        return 'Timesheet Deleted Successfully';
    });

    // Submit (bound) - validates 24h cap, locks entries, triggers roll-up
   this.on('SubmitTimesheet', 'Timesheets', async (req) => {
    // 1. In a bound action, retrieve the ID from req.params
    // req.params can look like: [{ ID: '...' }] or [{ ID: 'employee-id' }, { ID: 'timesheet-id' }]
    const timesheetKey = req.params[req.params.length - 1];
    const timesheetId = timesheetKey?.ID || timesheetKey;

    if (!timesheetId) {
        return req.error(400, 'Could not determine timesheet ID');
    }

    // 2. Query the timesheet using the resolved ID
    const ts = await SELECT.one.from('sprint.TimeManagement.Timesheets').where({ ID: timesheetId });
    if (!ts) {
        return req.error(404, 'Timesheet not found');
    }

    // 3. Update the status to 'Submitted'
    await UPDATE('sprint.TimeManagement.Timesheets')
        .set({ status: 'Submitted', submittedDate: new Date().toISOString().slice(0, 10) })
        .where({ ID: timesheetId });

    return 'Timesheet submitted successfully';
});
    // Approve (bound)
    this.on('ApproveTimesheet', 'Timesheets', async (req) => {
        const { approvedBy } = req.data;
        const id = keyOf(req.params[0]);

        const ts = await SELECT.one.from(Timesheets).where({ ID: id });
        if (!ts) return req.reject(404, 'Timesheet not found');
        if (ts.status !== 'Submitted') return req.reject(400, 'Only submitted timesheets can be approved');
        if (!approvedBy) return req.reject(400, 'approvedBy is required');
        if (approvedBy === ts.employee_ID) {
            return req.reject(400, 'Employees cannot approve their own timesheet');
        }

        const approver = await SELECT.one.from(Employees).where({ ID: approvedBy });
        if (!approver) return req.reject(404, 'Approver not found');
        if (approver.role !== 'Manager') return req.reject(403, 'Only managers can approve timesheets');

        await UPDATE(Timesheets)
            .set({ status: 'Approved', approvedBy_ID: approvedBy, approvedDate: today() })
            .where({ ID: id });

        await rollUpTimesheet(id);
        return 'Timesheet Approved Successfully';
    });

    // Reject (bound)
    this.on('RejectTimesheet', 'Timesheets', async (req) => {
        const { rejectionReason } = req.data;
        const id = keyOf(req.params[0]);

        const ts = await SELECT.one.from(Timesheets).where({ ID: id });
        if (!ts) return req.reject(404, 'Timesheet not found');
        if (ts.status !== 'Submitted') return req.reject(400, 'Only submitted timesheets can be rejected');
        if (!rejectionReason || !rejectionReason.trim()) {
            return req.reject(400, 'Rejection reason is required');
        }

        await UPDATE(Timesheets)
            .set({ status: 'Rejected', rejectionReason: rejectionReason.trim() })
            .where({ ID: id });

        await rollUpTimesheet(id);   // rejected hours drop out of the roll-up
        return 'Timesheet Rejected Successfully';
    });

    // =================================================================
    // PROJECTS
    // =================================================================

    // Create project + exactly one budget (FR-002)
    this.on('CreateProject', async (req) => {
        const {
            clientID, managerID, projectCode, projectName, description, billingType,
            startDate, endDate, priority, plannedHours, budgetAmt, billingRateHr, currencyCode
        } = req.data;

        if (!projectCode || !projectName) return req.reject(400, 'projectCode and projectName are required');
        if (startDate && endDate && endDate < startDate) return req.reject(400, 'endDate must be on or after startDate');
        if (billingType && !BILLING_TYPES.includes(billingType)) {
            return req.reject(400, `billingType must be one of ${BILLING_TYPES.join(', ')}`);
        }
        if (priority && !PRIORITIES.includes(priority)) {
            return req.reject(400, `priority must be one of ${PRIORITIES.join(', ')}`);
        }
        if (budgetAmt !== undefined && budgetAmt !== null && num(budgetAmt) <= 0) {
            return req.reject(400, 'budgetAmt must be greater than 0');
        }

        const client = await SELECT.one.from(Clients).where({ ID: clientID });
        if (!client) return req.reject(404, 'Client not found');

        const dup = await SELECT.one.from(Projects).where({ projectCode });
        if (dup) return req.reject(409, `Project code ${projectCode} already exists`);

        const projectID = cds.utils.uuid();
        await INSERT.into(Projects).entries({
            ID: projectID,
            client_ID: clientID,
            manager_ID: managerID,
            projectCode, projectName, description, billingType,
            startDate, endDate, priority, plannedHours,
            consumedHours: 0,
            status: 'Draft'
        });

        if (budgetAmt) {
            await INSERT.into(Budgets).entries({
                project_ID: projectID,
                budgetAmt,
                consumedAmt: 0,
                remainingAmt: budgetAmt,
                billingRateHr: billingRateHr ?? 0,
                currencyCode: currencyCode ?? 'INR',
                status: 'WithinBudget'
            });
        }
        return 'Project Created Successfully';
    });

    this.on('UpdateProject', async (req) => {
        const { ProjectID, projectName, description, startDate, endDate, status, priority, plannedHours } = req.data;

        const p = await SELECT.one.from(Projects).where({ ID: ProjectID });
        if (!p) return req.reject(404, 'Project not found');
        if (status && !PROJECT_STATUSES.includes(status)) {
            return req.reject(400, `status must be one of ${PROJECT_STATUSES.join(', ')}`);
        }
        if (priority && !PRIORITIES.includes(priority)) {
            return req.reject(400, `priority must be one of ${PRIORITIES.join(', ')}`);
        }
        const s = startDate ?? p.startDate, e = endDate ?? p.endDate;
        if (s && e && e < s) return req.reject(400, 'endDate must be on or after startDate');

        await UPDATE(Projects)
            .set({
                projectName: projectName ?? p.projectName,
                description: description ?? p.description,
                startDate: s,
                endDate: e,
                status: status ?? p.status,
                priority: priority ?? p.priority,
                plannedHours: plannedHours ?? p.plannedHours
            })
            .where({ ID: ProjectID });
        return 'Project Updated Successfully';
    });

    this.on('DeleteProject', async (req) => {
        const { ProjectID } = req.data;
        const p = await SELECT.one.from(Projects).where({ ID: ProjectID });
        if (!p) return req.reject(404, 'Project not found');

        const inv = await SELECT.one.from(Invoices).where({ project_ID: ProjectID });
        if (inv) return req.reject(400, 'Project has invoices and cannot be deleted');
        if (num(p.consumedHours) > 0) return req.reject(400, 'Project has booked hours and cannot be deleted');

        const { milestones, tasks } = await projectStructure(ProjectID);
        if (tasks.length) await DELETE.from(Tasks).where({ ID: { in: tasks.map(t => t.ID) } });
        if (milestones.length) await DELETE.from(Milestones).where({ project_ID: ProjectID });
        await DELETE.from(Budgets).where({ project_ID: ProjectID });
        await DELETE.from(Projects).where({ ID: ProjectID });
        return 'Project Deleted Successfully';
    });

    // Recalculate Budget (bound)
    this.on('RecalculateBudget', 'Projects', async (req) => {
        const id = keyOf(req.params[0]);
        const budget = await SELECT.one.from(Budgets).where({ project_ID: id });
        if (!budget) return req.reject(404, 'No Budget Found');
        await recalcProject(id);
        return 'Budget Recalculated Successfully';
    });

    // Burn summary (bound function)
    this.on('GetBurnSummary', 'Projects', async (req) => {
        const id = keyOf(req.params[0]);
        const p = await SELECT.one.from(Projects).where({ ID: id });
        if (!p) return req.reject(404, 'Project not found');
        const b = await SELECT.one.from(Budgets).where({ project_ID: id });

        const planned = num(p.plannedHours), consumed = num(p.consumedHours);
        const burnPercent = planned > 0 ? Math.round((consumed / planned) * 100) : 0;

        // projected end = today + remaining hours / average daily burn since start
        let projectedEndDate = null;
        if (p.startDate && consumed > 0 && planned > consumed) {
            const days = Math.max(1, (Date.now() - new Date(p.startDate).getTime()) / 86400000);
            const perDay = consumed / days;
            projectedEndDate = toISO(new Date(Date.now() + ((planned - consumed) / perDay) * 86400000));
        }

        return {
            budgetAmt: num(b?.budgetAmt),
            consumedAmt: num(b?.consumedAmt),
            remainingAmt: num(b?.remainingAmt),
            plannedHours: planned,
            consumedHours: consumed,
            burnPercent,
            projectedEndDate
        };
    });

    // Virtual field for list / ALP / object page
    this.after('READ', 'Projects', (projects) => {
        const data = Array.isArray(projects) ? projects : [projects];
        data.forEach(project => {
            if (!project || project.plannedHours === undefined) return;   // column not selected (e.g. aggregation)
            project.budgetBurnPercent = num(project.plannedHours) > 0
                ? Math.round((num(project.consumedHours) / num(project.plannedHours)) * 100)
                : 0;
        });
    });

    // =================================================================
    // KPI FUNCTIONS
    // =================================================================
    async function unbilledApprovedHours() {
        const sheets = await SELECT.from(Timesheets).columns('totalBillableHours', 'invoice_ID')
            .where({ status: 'Approved' });
        return round2(sheets
            .filter(t => !t.invoice_ID)
            .reduce((sum, t) => sum + num(t.totalBillableHours), 0));
    }

    this.on('GetManagerKPIs', async () => {
        const active = await SELECT.from(Projects).columns('ID').where({ status: 'Active' });
        const atRisk = await SELECT.from(Budgets).columns('ID').where({ status: 'AtRisk' });
        const pending = await SELECT.from(Timesheets).columns('ID').where({ status: 'Submitted' });
        return {
            activeProjects: active.length,
            atRiskBudgets: atRisk.length,
            pendingApprovals: pending.length,
            unbilledHours: await unbilledApprovedHours()
        };
    });

    this.on('GetBillingKPIs', async () => {
        const drafts = await SELECT.from(Invoices).columns('ID').where({ status: 'Draft' });
        const open = await SELECT.from(Invoices).where({ status: { in: ['Issued', 'Overdue'] } });
        const t = today();
        const overdueAmount = open
            .filter(i => i.status === 'Overdue' || (i.dueDate && i.dueDate < t))
            .reduce((sum, i) => sum + num(i.totalAmt), 0);
        return {
            unbilledHours: await unbilledApprovedHours(),
            draftInvoices: drafts.length,
            overdueAmount: round2(overdueAmount)
        };
    });

    // =================================================================
    // INVOICES
    // =================================================================

    // Generate invoice from approved, un-invoiced timesheets (FR-010)
    this.on('GenerateInvoice', async (req) => {
        const { projectID, periodFrom, periodTo } = req.data;
        if (!periodFrom || !periodTo || periodTo < periodFrom) {
            return req.reject(400, 'A valid billing period is required');
        }

        const project = await SELECT.one.from(Projects).where({ ID: projectID });
        if (!project) return req.reject(404, 'Project not found');
        const budget = await SELECT.one.from(Budgets).where({ project_ID: projectID });
        if (!budget) return req.reject(400, 'Project has no budget');

        const { tasks } = await projectStructure(projectID);
        const taskIDs = tasks.map(t => t.ID);
        if (!taskIDs.length) return req.reject(400, 'Project has no tasks');

        const billableEntries = await SELECT.from(TimesheetEntries)
            .where({ task_ID: { in: taskIDs }, isBillable: true });
        const sheetIDs = unique(billableEntries.map(e => e.timesheet_ID));
        if (!sheetIDs.length) return req.reject(400, 'No billable hours found');

        const candidates = await SELECT.from(Timesheets).where({
            ID: { in: sheetIDs },
            status: 'Approved',
            weekStartDate: { '>=': periodFrom },
            weekEndDate: { '<=': periodTo }
        });
        const sheets = candidates.filter(s => !s.invoice_ID);   // no double billing (FR-011)
        if (!sheets.length) return req.reject(400, 'No approved, un-invoiced timesheets in this period');

        const sheetSet = new Set(sheets.map(s => s.ID));
        const billableHours = round2(billableEntries
            .filter(e => sheetSet.has(e.timesheet_ID))
            .reduce((sum, e) => sum + num(e.hours), 0));

        // amount by billing type
        let net = 0;
        if (project.billingType === 'TM') {
            net = billableHours * num(budget.billingRateHr);
        } else if (project.billingType === 'Retainer') {
            net = num(budget.budgetAmt);                       // periodic retainer fee
        } else {                                               // Fixed: bill what is left of the contract value
            const prior = await SELECT.from(Invoices).where({ project_ID: projectID, status: { '!=': 'Cancelled' } });
            const billed = prior.reduce((s, i) => s + (num(i.totalAmt) - num(i.taxAmt)), 0);
            net = Math.max(0, num(budget.budgetAmt) - billed);
        }
        net = round2(net);
        const taxAmt = round2(net * TAX_RATE);
        const totalAmt = round2(net + taxAmt);

        const countRow = await SELECT.one.from(Invoices).columns('count(*) as n');
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(num(countRow?.n) + 1).padStart(4, '0')}`;
        const invoiceID = cds.utils.uuid();
        const due = new Date(); due.setDate(due.getDate() + 30);

        await INSERT.into(Invoices).entries({
            ID: invoiceID,
            invoiceNumber,
            project_ID: projectID,
            invoiceDate: today(),
            dueDate: toISO(due),
            billableHours,
            totalAmt,
            taxAmt,
            currencyCode: budget.currencyCode,
            status: 'Draft'
        });

        await UPDATE(Timesheets)
            .set({ invoice_ID: invoiceID, status: 'Invoiced' })   // locks the timesheets
            .where({ ID: { in: sheets.map(s => s.ID) } });

        return `Invoice ${invoiceNumber} generated (${billableHours} h, total ${totalAmt} ${budget.currencyCode})`;
    });

    async function changeInvoiceStatus(req, allowedFrom, to, message) {
        const id = keyOf(req.params[0]);
        const inv = await SELECT.one.from(Invoices).where({ ID: id });
        if (!inv) return req.reject(404, 'Invoice not found');
        if (!allowedFrom.includes(inv.status)) {
            return req.reject(400, `Invoice in status ${inv.status} cannot move to ${to}`);
        }
        await UPDATE(Invoices).set({ status: to }).where({ ID: id });
        return { inv, message };
    }

    this.on('IssueInvoice', 'Invoices', async (req) => {
        const r = await changeInvoiceStatus(req, ['Draft'], 'Issued', 'Invoice Issued');
        return r?.message;
        // TODO: generate PDF and store in Document Information Management, notify client
    });

    this.on('MarkInvoicePaid', 'Invoices', async (req) => {
        const r = await changeInvoiceStatus(req, ['Issued', 'Overdue'], 'Paid', 'Invoice Marked as Paid');
        return r?.message;
    });

    this.on('CancelInvoice', 'Invoices', async (req) => {
        const r = await changeInvoiceStatus(req, ['Draft', 'Issued'], 'Cancelled', 'Invoice Cancelled');
        if (!r) return;
        // release timesheets so they can be billed again
        await UPDATE(Timesheets)
            .set({ invoice_ID: null, status: 'Approved' })
            .where({ invoice_ID: r.inv.ID });
        return r.message;
    });

    // =================================================================
    // CLIENTS  (status values must match the ClientStatus enum)
    // =================================================================
    this.on('ActivateClient', 'Clients', async (req) => {
        const id = keyOf(req.params[0]);
        const c = await SELECT.one.from(Clients).where({ ID: id });
        if (!c) return req.reject(404, 'Client not found');
        await UPDATE(Clients).set({ status: 'Active' }).where({ ID: id });
        return 'Client Activated Successfully';
    });

    this.on('DeactivateClient', 'Clients', async (req) => {
        const id = keyOf(req.params[0]);
        const c = await SELECT.one.from(Clients).where({ ID: id });
        if (!c) return req.reject(404, 'Client not found');
        await UPDATE(Clients).set({ status: 'Inactive' }).where({ ID: id });
        return 'Client Deactivated Successfully';
    });

    this.on('CreateProjectForClient', 'Clients', async (req) => {
        const id = keyOf(req.params[0]);
        const c = await SELECT.one.from(Clients).where({ ID: id });
        if (!c) return req.reject(404, 'Client not found');
        if (c.status !== 'Active') return req.reject(400, 'Projects can only be created for Active clients');
        return `Create Project initiated for client ${c.clientName}`;
    });

    // =================================================================
    // EMPLOYEES
    // =================================================================
    this.on('CreateEmployee', async (req) => {
        const {
            firstName, lastName, email, phoneNo, jobTitle, role,
            departmentID, managerID, joinDate, hourlyRate
        } = req.data;

        if (!firstName || !lastName || !email) return req.reject(400, 'firstName, lastName and email are required');
        if (role && !EMPLOYEE_ROLES.includes(role)) {
            return req.reject(400, `role must be one of ${EMPLOYEE_ROLES.join(', ')}`);
        }
        const dup = await SELECT.one.from(Employees).where({ email });
        if (dup) return req.reject(409, `Email ${email} already exists`);

        await INSERT.into(Employees).entries({
            firstName, lastName, email, phoneNo, jobTitle,
            role: role ?? 'Employee',
            department_ID: departmentID,
            reportingManager_ID: managerID,
            joinDate, hourlyRate,
            status: 'Active'
        });
        return 'Employee Created Successfully';
    });

    this.on('UpdateEmployee', async (req) => {
        const {
            EmployeeID, firstName, lastName, phoneNo, jobTitle, role,
            departmentID, managerID, hourlyRate, status
        } = req.data;

        const e = await SELECT.one.from(Employees).where({ ID: EmployeeID });
        if (!e) return req.reject(404, 'Employee not found');
        if (role && !EMPLOYEE_ROLES.includes(role)) {
            return req.reject(400, `role must be one of ${EMPLOYEE_ROLES.join(', ')}`);
        }
        if (status && !EMPLOYEE_STATUSES.includes(status)) {
            return req.reject(400, `status must be one of ${EMPLOYEE_STATUSES.join(', ')}`);
        }
        if (managerID && managerID === EmployeeID) {
            return req.reject(400, 'An employee cannot report to themselves');
        }

        await UPDATE(Employees)
            .set({
                firstName: firstName ?? e.firstName,
                lastName: lastName ?? e.lastName,
                phoneNo: phoneNo ?? e.phoneNo,
                jobTitle: jobTitle ?? e.jobTitle,
                role: role ?? e.role,
                department_ID: departmentID ?? e.department_ID,
                reportingManager_ID: managerID ?? e.reportingManager_ID,
                hourlyRate: hourlyRate ?? e.hourlyRate,
                status: status ?? e.status
            })
            .where({ ID: EmployeeID });
        return 'Employee Updated Successfully';
    });

    this.on('DeleteEmployee', async (req) => {
        const { EmployeeID } = req.data;
        const e = await SELECT.one.from(Employees).where({ ID: EmployeeID });
        if (!e) return req.reject(404, 'Employee not found');

        const ts = await SELECT.one.from(Timesheets).columns('ID').where({ employee_ID: EmployeeID });
        if (ts) return req.reject(400, 'Employee has timesheets - set status to Inactive instead of deleting');

        await DELETE.from(Employees).where({ ID: EmployeeID });
        return 'Employee Deleted Successfully';
    });
});
