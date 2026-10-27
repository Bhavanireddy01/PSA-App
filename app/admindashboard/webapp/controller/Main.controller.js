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
                pendingSheets: [],
                selEmp: null,
                selClient: null,
                selProj: null,
                selSheet: null,
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
H.api("GET", "Timesheets?$filter=status eq 'Submitted'&$expand=employee($select=fullName,email)&$orderby=submittedDate desc").catch(() => ({ value: [] }))
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
                m.setProperty("/pendingSheets", sheets.map(s => ({
                    ...s,
                    employeeName: s.employee ? s.employee.fullName : s.employee_ID,
                    employeeEmail: s.employee ? s.employee.email : ""
                })));

                m.setProperty("/kpis", {
    totalEmployees: emps.length,

    totalClients: clis.length,

    totalManagers: emps.filter(
        e => e.role === "Manager"
    ).length,

    totalDepartments: deps.length,

    activeProjects: projs.filter(
        p => p.status === "Active"
    ).length,

    inactiveEmployees: emps.filter(
        e => e.status === "Inactive"
    ).length
});

                m.setProperty("/selEmp", null);
                m.setProperty("/selClient", null);
                m.setProperty("/selProj", null);
                m.setProperty("/selSheet", null);

                this.byId("empTbl")?.removeSelections(true);
                this.byId("clientTbl")?.removeSelections(true);
                this.byId("projTbl")?.removeSelections(true);
                this.byId("sheetTbl")?.removeSelections(true);

            } catch (e) {
                H.err(e);
            } finally {
                m.setProperty("/busy", false);
            }
        },

        // ================= NAVIGATION TO ATTACHED APPS =================
        onOpenManagerDashboard() {
            window.open("/managerdashboard/index.html", "_blank");
        },

        onOpenBillingWorkbench() {
            window.open("/billingworkbench/index.html", "_blank");
        },

        onOpenProjectInManager() {
            const p = this._ui.getProperty("/selProj");
            if (!p) return;
            window.open(`/managerdashboard/index.html#/project/${p.ID}`, "_blank");
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

        // ================= PROJECT ACTIONS =================
        async onRecalcBudget() {
            const p = this._ui.getProperty("/selProj");
            try {
                const r = await H.api("POST", `Projects(${p.ID})/PSAService.RecalculateBudget`, {});
                MessageToast.show(r.value || "Budget recalculated");
                this.load();
            } catch (e) { H.err(e); }
        },

        onDeleteProject() {
            const p = this._ui.getProperty("/selProj");
            MessageBox.confirm(`Delete project ${p.projectCode}?`, {
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

        // ================= TIMESHEET ACTIONS =================
        async onViewEntries() {
            const sheet = this._ui.getProperty("/selSheet");
            try {
                const res = await H.api("GET", `TimesheetEntries?$filter=timesheet_ID eq '${sheet.ID}'&$expand=task($select=taskName)&$orderby=workDate`);
                const list = new List({
                    noDataText: "No entries logged",
                    items: (res.value || []).map(entry => new StandardListItem({
                        title: entry.task ? entry.task.taskName : "Task",
                        description: `Date: ${entry.workDate} | Billable: ${entry.isBillable ? "Yes" : "No"}`,
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
            try {
                const r = await H.api("POST", `Clients('${c.ID}')/PSAService.ActivateClient`, {});
                MessageToast.show(r.value || "Client Activated");
                this.load();
            } catch (e) { H.err(e); }
        },

        async onDeactivateClient() {
            const c = this._ui.getProperty("/selClient");
            try {
                const r = await H.api("POST", `Clients('${c.ID}')/PSAService.DeactivateClient`, {});
                MessageToast.show(r.value || "Client Deactivated");
                this.load();
            } catch (e) { H.err(e); }
        }
        
    });
});