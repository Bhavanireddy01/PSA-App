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

    return Controller.extend("psa.billingworkbench.controller.Main", {

        onInit: function () {
            this._ui = new JSONModel({ rows: [], kpi: {}, status: "", sel: null, busy: false });
            this.getView().setModel(this._ui, "ui");
            this.load();
        },

        async load() {
    const m = this._ui;
    const st = m.getProperty("/status");
    let url = "Invoices?$expand=project($select=projectCode,projectName)&$orderby=invoiceDate desc";
    if (st) {
        url += `&$filter=status eq '${st}'`;
    }
    
    m.setProperty("/busy", true);
    try {
        const [inv, k] = await Promise.all([
            H.api("GET", url), 
            H.api("GET", "GetBillingKPIs()").catch(() => ({}))
        ]);

        const invoiceList = Array.isArray(inv?.value) ? inv.value : [];
        m.setProperty("/rows", invoiceList.map(i => ({
            ...i, 
            projectName: i.project ? `${i.project.projectCode} – ${i.project.projectName}` : ""
        })));
        m.setProperty("/kpi", k || {});
        m.setProperty("/sel", null);

        this.byId("tbl")?.removeSelections(true);
    } catch (e) { 
        H.err(e); 
    } finally { 
        m.setProperty("/busy", false); 
    }
},
        onSelect(e) {
            this._ui.setProperty("/sel", e.getParameter("listItem").getBindingContext("ui").getObject());
        },

        // ---------- generate ----------
        async onGenerate() {
            try {
                const pr = await H.api("GET", "Projects?$select=ID,projectCode,projectName&$filter=status ne 'Cancelled'&$orderby=projectCode");
                H.openForm("Generate Invoice", [
                    { key: "projectID", label: "Project", type: "select", required: true,
                      options: pr.value.map(p => ({ key: p.ID, text: p.projectCode + " – " + p.projectName })) },
                    { key: "periodFrom", label: "Period From", type: "date", required: true },
                    { key: "periodTo", label: "Period To", type: "date", required: true }
                ], async (v) => {
                    const r = await H.api("POST", "GenerateInvoice", v);
                    MessageBox.success(r.value || "Invoice generated");
                    this.load();
                }, "Generate");
            } catch (e) { H.err(e); }
        },

        // ---------- status actions ----------
        async _act(name, confirmText) {
            const id = this._ui.getProperty("/sel/ID");
            const run = async () => {
                try {
                    const r = await H.api("POST", `Invoices(${id})/PSAService.${name}`, {});
                    MessageToast.show(r.value || "Done");
                    this.load();
                } catch (e) { H.err(e); }
            };
            if (!confirmText) return run();
            MessageBox.confirm(confirmText, { onClose: a => { if (a === MessageBox.Action.OK) run(); } });
        },
        onIssue()  { this._act("IssueInvoice"); },
        onPaid()   { this._act("MarkInvoicePaid"); },
        onCancel() { this._act("CancelInvoice", "Cancel this invoice? Its timesheets will be released for re-billing."); },

        // ---------- included timesheets ----------
        async onSheets() {
            const inv = this._ui.getProperty("/sel");
            try {
                const r = await H.api("GET", `Timesheets?$filter=invoice_ID eq ${inv.ID}&$expand=employee($select=fullName)&$orderby=weekStartDate`);
                const list = new List({
                    noDataText: "No timesheets linked to this invoice",
                    items: r.value.map(t => new StandardListItem({
                        title: t.employee ? t.employee.fullName : t.employee_ID,
                        description: `${t.weekStartDate} → ${t.weekEndDate}`,
                        info: `${t.totalBillableHours} h`
                    }))
                });
                const dlg = new Dialog({
                    title: "Timesheets in " + inv.invoiceNumber, contentWidth: "30rem", content: [list],
                    endButton: new Button({ text: "Close", press: () => dlg.close() }),
                    afterClose: () => dlg.destroy()
                });
                dlg.open();
            } catch (e) { H.err(e); }
        }
    });
});