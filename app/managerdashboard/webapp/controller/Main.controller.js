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

    return Controller.extend("psa.projects.controller.Main", {

        onInit: function () {
            this._ui = new JSONModel({ 
                projects: [], 
                kpi: {}, 
                pendingSheets: [],
                budgetAlerts: [],
                selSheet: null,
                q: "", 
                status: "", 
                busy: false 
            });
            this.getView().setModel(this._ui, "ui");
            this.load();
        },
        

        async load() {
            const m = this._ui, d = m.getData(), f = [];
            if (d.status) f.push(`status eq '${d.status}'`);
            if (d.q) {
                const q = d.q.replace(/'/g, "''");
                f.push(`(contains(projectName,'${q}') or contains(projectCode,'${q}'))`);
            }
            let url = "Projects?$expand=client($select=clientName),manager($select=fullName)&$orderby=projectCode";
            if (f.length) url += "&$filter=" + f.join(" and ");

            m.setProperty("/busy", true);
            try {
                const [p, k, sheets, budgets] = await Promise.all([
                    H.api("GET", url),
                    H.api("GET", "GetManagerKPIs()").catch(() => ({})),
                    // Only Submitted timesheets for approval view
                    H.api("GET", "Timesheets?$filter=status eq 'Submitted'&$expand=employee($select=fullName,email)&$orderby=submittedDate desc").catch(() => ({ value: [] })),
                    // Threshold alerts (AtRisk >= 80%, Breached > 100%)
                    H.api("GET", "Budgets?$filter=status eq 'AtRisk' or status eq 'Breached'&$expand=project($select=projectCode,projectName)").catch(() => ({ value: [] }))
                ]);

                // Map Projects
                m.setProperty("/projects", (p.value || []).map(x => ({
                    ...x,
                    clientName: x.client ? x.client.clientName : "",
                    managerName: x.manager ? x.manager.fullName : "",
                    burn: Number(x.plannedHours) > 0 ? Math.round(Number(x.consumedHours || 0) / Number(x.plannedHours) * 100) : 0
                })));

                // Map Timesheets
                m.setProperty("/pendingSheets", (sheets.value || []).map(s => ({
                    ...s,
                    employeeName: s.employee ? s.employee.fullName : s.employee_ID,
                    employeeEmail: s.employee ? s.employee.email : ""
                })));

                // Map Budget Alerts
                m.setProperty("/budgetAlerts", (budgets.value || []).map(b => {
                    const total = Number(b.budgetAmt || 0);
                    const consumed = Number(b.consumedAmt || 0);
                    return {
                        ...b,
                        projectCode: b.project ? b.project.projectCode : "",
                        projectName: b.project ? b.project.projectName : "",
                        burnPercent: total > 0 ? Math.round((consumed / total) * 100) : 0
                    };
                }));

                m.setProperty("/kpi", k || {});
                m.setProperty("/selSheet", null);
                this.byId("approvalTbl")?.removeSelections(true);

            } catch (e) { 
                H.err(e); 
            } finally { 
                m.setProperty("/busy", false); 
            }
        },

        onOpen(e) {
            const id = e.getSource().getBindingContext("ui").getProperty("ID");
            this.getOwnerComponent().getRouter().navTo("detail", { id });
        },

        onSelectTimesheet(e) {
            this._ui.setProperty("/selSheet", e.getParameter("listItem").getBindingContext("ui").getObject());
        },

        // Read-only Entries viewer for Manager
        async onViewEntries() {
            const sheet = this._ui.getProperty("/selSheet");
            try {
                const res = await H.api("GET", `TimesheetEntries?$filter=timesheet_ID eq '${sheet.ID}'&$expand=task($select=taskName)&$orderby=workDate`);
                const list = new List({
                    noDataText: "No entries logged",
                    items: (res.value || []).map(entry => new StandardListItem({
                        title: entry.task ? entry.task.taskName : "Task",
                        description: `Date: ${entry.workDate} | Billable: ${entry.isBillable ? 'Yes' : 'No'}`,
                        info: `${entry.hours} h`
                    }))
                });

                const dlg = new Dialog({
                    title: `Timesheet Entries - ${sheet.employeeName}`,
                    contentWidth: "28rem",
                    content: [list],
                    endButton: new Button({ text: "Close", press: () => dlg.close() }),
                    afterClose: () => dlg.destroy()
                });
                dlg.open();
            } catch (err) { H.err(err); }
        },

        // Approve Action
        async onApproveTimesheet() {
            const sheet = this._ui.getProperty("/selSheet");
            MessageBox.confirm(`Approve timesheet for ${sheet.employeeName}?`, {
                onClose: async (action) => {
                    if (action !== MessageBox.Action.OK) return;
                    try {
                        const r = await H.api("POST", `Timesheets('${sheet.ID}')/PSAService.ApproveTimesheet`, {});
                        MessageToast.show(r.value || "Timesheet Approved");
                        this.load();
                    } catch (e) { H.err(e); }
                }
            });
        },

        // Reject Action
        onRejectTimesheet() {
            const sheet = this._ui.getProperty("/selSheet");
            H.openForm("Reject Timesheet", [
                { key: "rejectionReason", label: "Reason", required: true, max: 255 }
            ], async (v) => {
                const r = await H.api("POST", `Timesheets('${sheet.ID}')/PSAService.RejectTimesheet`, v);
                MessageToast.show(r.value || "Timesheet Rejected");
                this.load();
            }, "Reject");
        },

        async onCreate() {
            try {
                const [cl, mg] = await Promise.all([
                    H.api("GET", "Clients?$select=ID,clientName&$filter=status eq 'Active'&$orderby=clientName"),
                    H.api("GET", "Employees?$select=ID,fullName&$filter=role eq 'Manager' and status eq 'Active'&$orderby=firstName")
                ]);
                H.openForm("Create Project", [
                    { key: "clientID", label: "Client", type: "select", required: true,
                      options: cl.value.map(c => ({ key: c.ID, text: c.clientName })) },
                    { key: "managerID", label: "Project Manager", type: "select",
                      options: mg.value.map(x => ({ key: x.ID, text: x.fullName })) },
                    { key: "projectCode", label: "Project Code", required: true, max: 20 },
                    { key: "projectName", label: "Project Name", required: true, max: 100 },
                    { key: "description", label: "Description", max: 500 },
                    { key: "billingType", label: "Billing Type", type: "select", value: "TM", options: H.opts(["Fixed", "TM", "Retainer"]) },
                    { key: "priority", label: "Priority", type: "select", value: "Medium", options: H.opts(["Low", "Medium", "High", "Critical"]) },
                    { key: "startDate", label: "Start Date", type: "date" },
                    { key: "endDate", label: "End Date", type: "date" },
                    { key: "plannedHours", label: "Planned Hours", type: "number" },
                    { key: "budgetAmt", label: "Budget Amount", type: "number", required: true },
                    { key: "billingRateHr", label: "Billing Rate / Hr", type: "number" },
                    { key: "currencyCode", label: "Currency", value: "INR", max: 3 }
                ], async (v) => {
                    const r = await H.api("POST", "CreateProject", v);
                    MessageToast.show(r.value || "Project created");
                    this.load();
                }, "Create");
            } catch (e) { H.err(e); }
        }
    });
});