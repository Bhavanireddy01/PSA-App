sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/List",
    "sap/m/StandardListItem",
    "../util/Helper"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, List, StandardListItem, H) {
    "use strict";

    return Controller.extend("psa.admin.controller.Main", {

        onInit: function () {
            this._ui = new JSONModel({
                employees: [],
                clients: [],
                departments: [],
                projects: [],
                allSheets: [],
                selEmp: null,
                selClient: null,
                selProj: null,
                selSheet: null,
                selDep: null,
                kpis: {},
                busy: false
            });
            this.getView().setModel(this._ui, "ui");
            this.load();
        },

        async load() {
            const m = this._ui;
            m.setProperty("/busy", true);
            try {
                const [
                    empRes,
                    cliRes,
                    projRes,
                    deptRes,
                    sheetRes
                ] = await Promise.all([
                    H.api("GET", "Employees?$orderby=firstName"),
                    H.api("GET", "Clients?$orderby=clientName"),
                    H.api("GET", "Projects?$expand=manager($select=fullName),client($select=clientName)&$orderby=projectCode"),
                    H.api("GET", "Departments?$orderby=departmentName"),
                    // Fetch ALL timesheets across all employees for monitoring (no filter by status)
                    H.api("GET", "Timesheets?$expand=employee($select=fullName,email)&$orderby=weekStartDate desc").catch(() => ({ value: [] }))
                ]);

                const emps = empRes.value || [];
                const clis = cliRes.value || [];
                const deps = deptRes.value || [];
                const sheets = sheetRes.value || [];

                const projs = (projRes.value || []).map(p => ({
                    ...p,
                    managerName: p.manager ? p.manager.fullName : "",
                    clientName: p.client ? p.client.clientName : "",
                    burn: Number(p.plannedHours) > 0 ? Math.round(Number(p.consumedHours || 0) / Number(p.plannedHours) * 100) : 0
                }));

                m.setProperty("/employees", emps);
                m.setProperty("/clients", clis);
                m.setProperty("/departments", deps);
                m.setProperty("/projects", projs);
                m.setProperty("/allSheets", sheets.map(s => ({
                    ...s,
                    employeeName: s.employee ? s.employee.fullName : (s.employee_ID || "-"),
                    employeeEmail: s.employee ? s.employee.email : ""
                })));

                m.setProperty("/kpis", {
                    totalEmployees: emps.length,
                    totalClients: clis.length,
                    totalManagers: emps.filter(e => e.role === "Manager").length,
                    totalDepartments: deps.length,
                    activeProjects: projs.filter(p => p.status === "Active").length,
                    totalSheets: sheets.length,
                    inactiveEmployees: emps.filter(e => e.status === "Inactive").length
                });

                m.setProperty("/selEmp", null);
                m.setProperty("/selClient", null);
                m.setProperty("/selProj", null);
                m.setProperty("/selSheet", null);
                m.setProperty("/selDep", null);

                this.byId("empTbl")?.removeSelections(true);
                this.byId("clientTbl")?.removeSelections(true);
                this.byId("projTbl")?.removeSelections(true);
                this.byId("sheetTbl")?.removeSelections(true);
                this.byId("depTbl")?.removeSelections(true);

            } catch (e) {
                H.err(e);
            } finally {
                m.setProperty("/busy", false);
            }
        },

        // ================= NAVIGATION =================
        onOpenManagerDashboard() {
            window.open("/managerdashboard/index.html", "_blank");
        },

        onOpenBillingWorkbench() {
            window.open("/billingworkbench/index.html", "_blank");
        },

        // ================= SELECTION EVENTS =================
        onEmpSelect(e) {
            this._ui.setProperty("/selEmp", e.getParameter("listItem").getBindingContext("ui").getObject());
        },

        onClientSelect(e) {
            this._ui.setProperty("/selClient", e.getParameter("listItem").getBindingContext("ui").getObject());
        },

        onProjSelect(e) {
            this._ui.setProperty("/selProj", e.getParameter("listItem").getBindingContext("ui").getObject());
        },

        onSheetSelect(e) {
            this._ui.setProperty("/selSheet", e.getParameter("listItem").getBindingContext("ui").getObject());
        },

        onDepSelect(e) {
            this._ui.setProperty("/selDep", e.getParameter("listItem").getBindingContext("ui").getObject());
        },

        // ================= PROJECT ACTIONS (CREATE, EDIT, DELETE) =================
        onCreateProject() {
            const clients = this._ui.getProperty("/clients") || [];
            const managers = (this._ui.getProperty("/employees") || []).filter(e => e.role === "Manager");

            const today = new Date().toISOString().slice(0, 10);

            H.openForm("Create New Project", [
                { key: "projectCode", label: "Project Code", required: true },
                { key: "projectName", label: "Project Name", required: true },
                { key: "description", label: "Description", required: false },
                { key: "clientID", label: "Client", type: "select", required: true,
                  options: clients.map(c => ({ key: c.ID, text: c.clientName })) },
                { key: "managerID", label: "Project Manager", type: "select", required: true,
                  options: managers.map(m => ({ key: m.ID, text: m.fullName })) },
                { key: "billingType", label: "Billing Type", type: "select", required: true, value: "TimeAndMaterials",
                  options: [{ key: "TimeAndMaterials", text: "Time and Materials" }, { key: "FixedPrice", text: "Fixed Price" }, { key: "Retainer", text: "Retainer" }] },
                { key: "priority", label: "Priority", type: "select", required: true, value: "Medium",
                  options: [{ key: "High", text: "High" }, { key: "Medium", text: "Medium" }, { key: "Low", text: "Low" }] },
                { key: "startDate", label: "Start Date", type: "date", required: true, value: today },
                { key: "endDate", label: "End Date", type: "date", required: true },
                { key: "plannedHours", label: "Planned Hours", type: "number", required: true, value: 160 },
                { key: "budgetAmt", label: "Budget Amount", type: "number", required: true, value: 50000 },
                { key: "billingRateHr", label: "Billing Rate / Hr", type: "number", required: true, value: 500 },
                { key: "currencyCode", label: "Currency", value: "INR" }
            ], async (v) => {
                await H.api("POST", "CreateProject", {
                    clientID: v.clientID,
                    managerID: v.managerID,
                    projectCode: v.projectCode,
                    projectName: v.projectName,
                    description: v.description || "",
                    billingType: v.billingType,
                    startDate: v.startDate,
                    endDate: v.endDate,
                    priority: v.priority,
                    plannedHours: Number(v.plannedHours),
                    budgetAmt: Number(v.budgetAmt),
                    billingRateHr: Number(v.billingRateHr),
                    currencyCode: v.currencyCode || "INR"
                });
                MessageToast.show("Project created successfully");
                this.load();
            }, "Create");
        },

        onEditProject() {
            const p = this._ui.getProperty("/selProj");
            if (!p) return;

            H.openForm(`Edit Project: ${p.projectCode}`, [
                { key: "projectName", label: "Project Name", required: true, value: p.projectName },
                { key: "description", label: "Description", required: false, value: p.description },
                { key: "status", label: "Status", type: "select", required: true, value: p.status,
                  options: [{ key: "Active", text: "Active" }, { key: "OnHold", text: "OnHold" }, { key: "Completed", text: "Completed" }, { key: "Cancelled", text: "Cancelled" }] },
                { key: "priority", label: "Priority", type: "select", required: true, value: p.priority,
                  options: [{ key: "High", text: "High" }, { key: "Medium", text: "Medium" }, { key: "Low", text: "Low" }] },
                { key: "startDate", label: "Start Date", type: "date", required: true, value: p.startDate },
                { key: "endDate", label: "End Date", type: "date", required: true, value: p.endDate },
                { key: "plannedHours", label: "Planned Hours", type: "number", required: true, value: p.plannedHours }
            ], async (v) => {
                await H.api("POST", "UpdateProject", {
                    ProjectID: p.ID,
                    projectName: v.projectName,
                    description: v.description || "",
                    status: v.status,
                    priority: v.priority,
                    startDate: v.startDate,
                    endDate: v.endDate,
                    plannedHours: Number(v.plannedHours)
                });
                MessageToast.show("Project updated successfully");
                this.load();
            }, "Update");
        },

        onDeleteProject() {
            const p = this._ui.getProperty("/selProj");
            if (!p) return;
            MessageBox.confirm(`Delete project "${p.projectName}" (${p.projectCode})?`, {
                onClose: async (action) => {
                    if (action !== MessageBox.Action.OK) return;
                    try {
                        await H.api("POST", "DeleteProject", { ProjectID: p.ID });
                        MessageToast.show("Project deleted");
                        this.load();
                    } catch (e) { H.err(e); }
                }
            });
        },

        // ================= TIMESHEET MONITORING (VIEW ENTRIES ONLY) =================
        async onViewEntries() {
            const sheet = this._ui.getProperty("/selSheet");
            if (!sheet) return;
            try {
                const res = await H.api("GET", `TimesheetEntries?$filter=timesheet_ID eq ${sheet.ID}&$expand=task($select=taskName)&$orderby=workDate`);
                const list = new List({
                    noDataText: "No task hours logged for this period",
                    items: (res.value || []).map(entry => new StandardListItem({
                        title: entry.task ? entry.task.taskName : "Task Entry",
                        description: `Date: ${entry.workDate} | Billable: ${entry.isBillable ? "Yes" : "No"}`,
                        info: `${entry.hours} h`
                    }))
                });

                const dlg = new Dialog({
                    title: `Timesheet Logs - ${sheet.employeeName} (${sheet.weekStartDate} to ${sheet.weekEndDate})`,
                    contentWidth: "28rem",
                    content: [list],
                    endButton: new Button({ text: "Close", press: () => dlg.close() }),
                    afterClose: () => dlg.destroy()
                });
                dlg.open();
            } catch (err) { H.err(err); }
        },

        // ================= EMPLOYEE ACTIONS =================
        async onCreateEmployee() {
            const managers = (this._ui.getProperty("/employees") || []).filter(e => e.role === "Manager");

            H.openForm("Create Employee", [
                { key: "firstName", label: "First Name", required: true },
                { key: "lastName", label: "Last Name", required: true },
                { key: "email", label: "Email", required: true },
                { key: "jobTitle", label: "Job Title", required: true },
                { key: "role", label: "Role", type: "select", required: true, value: "Employee",
                  options: [{ key: "Employee", text: "Employee" }, { key: "Manager", text: "Manager" }, { key: "Finance", text: "Finance" }, { key: "Admin", text: "Admin" }] },
                { key: "managerID", label: "Manager", type: "select",
                  options: managers.map(m => ({ key: m.ID, text: m.fullName })) },
                { key: "hourlyRate", label: "Hourly Rate", type: "number", value: 500 }
            ], async (v) => {
                const r = await H.api("POST", "CreateEmployee", v);
                MessageToast.show(r.value || "Employee created");
                this.load();
            }, "Create");
        },

        onEditEmployee() {
            const emp = this._ui.getProperty("/selEmp");
            if (!emp) return;
            H.openForm(`Edit Employee: ${emp.fullName}`, [
                { key: "firstName", label: "First Name", required: true, value: emp.firstName },
                { key: "lastName", label: "Last Name", required: true, value: emp.lastName },
                { key: "jobTitle", label: "Job Title", required: true, value: emp.jobTitle },
                { key: "role", label: "Role", type: "select", value: emp.role,
                  options: [{ key: "Employee", text: "Employee" }, { key: "Manager", text: "Manager" }, { key: "Finance", text: "Finance" }, { key: "Admin", text: "Admin" }] },
                { key: "hourlyRate", label: "Hourly Rate", type: "number", value: emp.hourlyRate },
                { key: "status", label: "Status", type: "select", value: emp.status,
                  options: [{ key: "Active", text: "Active" }, { key: "Inactive", text: "Inactive" }, { key: "OnLeave", text: "OnLeave" }] }
            ], async (v) => {
                const r = await H.api("POST", "UpdateEmployee", { EmployeeID: emp.ID, ...v });
                MessageToast.show(r.value || "Employee updated");
                this.load();
            });
        },

        onDeleteEmployee() {
            const emp = this._ui.getProperty("/selEmp");
            if (!emp) return;
            MessageBox.confirm(`Delete ${emp.fullName}? (Cannot be deleted if timesheets exist)`, {
                onClose: async (action) => {
                    if (action !== MessageBox.Action.OK) return;
                    try {
                        const r = await H.api("POST", "DeleteEmployee", { EmployeeID: emp.ID });
                        MessageToast.show(r.value || "Employee deleted");
                        this.load();
                    } catch (e) { H.err(e); }
                }
            });
        },

        // ================= CLIENT ACTIONS =================
        async onActivateClient() {
            const c = this._ui.getProperty("/selClient");
            if (!c) return;
            try {
                const r = await H.api("POST", `Clients('${c.ID}')/PSAService.ActivateClient`, {});
                MessageToast.show(r.value || "Client Activated");
                this.load();
            } catch (e) { H.err(e); }
        },

        async onDeactivateClient() {
            const c = this._ui.getProperty("/selClient");
            if (!c) return;
            try {
                const r = await H.api("POST", `Clients('${c.ID}')/PSAService.DeactivateClient`, {});
                MessageToast.show(r.value || "Client Deactivated");
                this.load();
            } catch (e) { H.err(e); }
        }
    });
});