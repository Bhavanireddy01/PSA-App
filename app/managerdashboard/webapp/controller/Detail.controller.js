sap.ui.define([
    "sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast", "sap/m/MessageBox", "../util/Helper"
], function (Controller, JSONModel, MessageToast, MessageBox, H) {
    "use strict";

    const STATUSES = ["Draft", "Active", "OnHold", "Completed", "Cancelled"];
    const PRIORITIES = ["Low", "Medium", "High", "Critical"];
    const TASK_STATUSES = ["ToDo", "InProgress", "Done", "Blocked"];

    return Controller.extend("psa.projects.controller.Detail", {

        onInit: function () {
            this._ui = new JSONModel({ p: {}, b: {}, ms: [], tasks: [], selMs: null, busy: false });
            this.getView().setModel(this._ui, "ui");
            this.getOwnerComponent().getRouter().getRoute("detail").attachPatternMatched(e => {
                this._id = e.getParameter("arguments").id;
                this._ui.setProperty("/selMs", null);
                this.load();
            });
        },

        onBack() { this.getOwnerComponent().getRouter().navTo("list"); },

        async load() {
            const m = this._ui, id = this._id;
            m.setProperty("/busy", true);
            try {
                const [p, b, ms] = await Promise.all([
                    H.api("GET", `Projects(${id})?$expand=client($select=clientName),manager($select=fullName)`),
                    H.api("GET", `Budgets?$filter=project_ID eq ${id}`),
                    H.api("GET", `Milestones?$filter=project_ID eq ${id}&$expand=tasks($expand=assignedTo($select=fullName))&$orderby=startDate`)
                ]);
                p.clientName = p.client ? p.client.clientName : "";
                p.managerName = p.manager ? p.manager.fullName : "";
                p.burn = Number(p.plannedHours) > 0 ? Math.round(Number(p.consumedHours || 0) / Number(p.plannedHours) * 100) : 0;
                m.setProperty("/p", p);
                m.setProperty("/b", b.value[0] || {});

                ms.value.forEach(x => (x.tasks || []).forEach(t => { t.assigneeName = t.assignedTo ? t.assignedTo.fullName : ""; }));
                const sel = ms.value.find(x => x.ID === m.getProperty("/selMs"));
                m.setProperty("/selMs", sel ? sel.ID : null);
                m.setProperty("/tasks", sel ? sel.tasks : []);
                m.setProperty("/ms", ms.value);
            } catch (e) { H.err(e); }
            finally { m.setProperty("/busy", false); }
        },

        // keep the selected milestone highlighted after a reload
        onMsUpdated() {
            const t = this.byId("msTable"), id = this._ui.getProperty("/selMs");
            t.getItems().forEach(i => { if (i.getBindingContext("ui").getProperty("ID") === id) t.setSelectedItem(i); });
        },
        onMsSelect(e) {
            const o = e.getParameter("listItem").getBindingContext("ui").getObject();
            this._ui.setProperty("/selMs", o.ID);
            this._ui.setProperty("/tasks", o.tasks || []);
        },

        // ---------- project ----------
        onEdit() {
            const p = this._ui.getProperty("/p");
            H.openForm("Edit Project", [
                { key: "projectName", label: "Project Name", required: true, value: p.projectName, max: 100 },
                { key: "description", label: "Description", value: p.description, max: 500 },
                { key: "status", label: "Status", type: "select", value: p.status, options: H.opts(STATUSES) },
                { key: "priority", label: "Priority", type: "select", value: p.priority, options: H.opts(PRIORITIES) },
                { key: "startDate", label: "Start Date", type: "date", value: p.startDate },
                { key: "endDate", label: "End Date", type: "date", value: p.endDate },
                { key: "plannedHours", label: "Planned Hours", type: "number", value: p.plannedHours }
            ], async (v) => {
                const r = await H.api("POST", "UpdateProject", { ProjectID: this._id, ...v });
                MessageToast.show(r.value);
                this.load();
            });
        },

        async onRecalc() {
            try {
                const r = await H.api("POST", `Projects(${this._id})/PSAService.RecalculateBudget`, {});
                MessageToast.show(r.value);
                this.load();
            } catch (e) { H.err(e); }
        },

        onDelete() {
            MessageBox.confirm("Delete this project with all its milestones and tasks?", {
                onClose: async (a) => {
                    if (a !== MessageBox.Action.OK) return;
                    try {
                        await H.api("POST", "DeleteProject", { ProjectID: this._id });
                        MessageToast.show("Project deleted");
                        this.onBack();
                    } catch (e) { H.err(e); }
                }
            });
        },

        // ---------- milestones ----------
        onAddMilestone() {
    H.openForm("Add Milestone", [
        { key: "milestoneName", label: "Milestone", required: true, max: 100 },
        { key: "startDate", label: "Start Date", type: "date" },
        { key: "endDate", label: "End Date", type: "date" },
        { key: "priority", label: "Priority", type: "select", value: "Medium", options: H.opts(PRIORITIES) }
    ], async (v) => {
        await H.api("POST", "Milestones", { project_ID: this._id, ...v });
        MessageToast.show("Milestone added");
        this.load();
    }, "Add");
},

        // ---------- tasks ----------
        async _employeeOptions() {
            const r = await H.api("GET", "Employees?$select=ID,fullName&$filter=status eq 'Active'&$orderby=firstName");
            return r.value.map(x => ({ key: x.ID, text: x.fullName }));
        },

       async onAddTask() {
    const emps = await this._employeeOptions();
    const msID = this._ui.getProperty("/selMs");
    H.openForm("Add Task", [
        { key: "taskName", label: "Task", required: true, max: 100 },
        { key: "assignedTo_ID", label: "Assigned To", type: "select", options: emps },
        { key: "priority", label: "Priority", type: "select", value: "Medium", options: H.opts(PRIORITIES) },
        { key: "estimatedHours", label: "Estimated Hours", type: "number", required: true }
    ], async (v) => {
        await H.api("POST", "Tasks", { milestone_ID: msID, ...v });
        MessageToast.show("Task added");
        this.load();
    }, "Add");
},
        async onEditTask(e) {
            const t = e.getSource().getBindingContext("ui").getObject();
            try {
                const emps = await this._employeeOptions();
                H.openForm("Edit Task", [
                    { key: "taskName", label: "Task", required: true, value: t.taskName, max: 100 },
                    { key: "assignedTo_ID", label: "Assigned To", type: "select", value: t.assignedTo_ID, options: emps },
                    { key: "status", label: "Status", type: "select", value: t.status, options: H.opts(TASK_STATUSES) },
                    { key: "priority", label: "Priority", type: "select", value: t.priority, options: H.opts(PRIORITIES) },
                    { key: "estimatedHours", label: "Estimated Hours", type: "number", value: t.estimatedHours }
                ], async (v) => {
                    await H.api("PATCH", `Tasks(${t.ID})`, v);
                    // refresh milestone completion / budget roll-up (ignored if the project has no budget)
                    try { await H.api("POST", `Projects(${this._id})/PSAService.RecalculateBudget`, {}); } catch (x) { /* no budget */ }
                    MessageToast.show("Task updated");
                    this.load();
                });
            } catch (err) { H.err(err); }
        }
    });
});