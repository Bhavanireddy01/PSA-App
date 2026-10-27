sap.ui.define([
    "sap/m/Dialog", "sap/m/Button", "sap/m/Select", "sap/m/Label", "sap/m/Text",
    "sap/m/MessageToast", "sap/m/MessageBox", "sap/ui/core/Item",
    "sap/ui/layout/form/SimpleForm", "sap/ui/core/Component"
], function (Dialog, Button, Select, Label, Text, MessageToast, MessageBox, Item, SimpleForm, Component) {
    "use strict";

    const BASE = "/odata/v4/psa/";
    let csrf = null;

    async function token() {
        if (csrf !== null) return csrf;
        try {
            const r = await fetch(BASE, { headers: { "X-CSRF-Token": "Fetch" } });
            csrf = r.headers.get("X-CSRF-Token") || "";
        } catch (e) { csrf = ""; }
        return csrf;
    }
    async function api(method, path, body) {
        const h = { "Content-Type": "application/json", "Accept": "application/json" };
        if (method !== "GET") { const t = await token(); if (t) h["X-CSRF-Token"] = t; }
        const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j.error && j.error.message) || r.statusText);
        return j;
    }
    function refreshAll() {
        Component.registry.forEach(function (c) {
            const m = c.getModel && c.getModel();
            if (m && m.isA && m.isA("sap.ui.model.odata.v4.ODataModel")) { m.refresh(); }
        });
    }

    async function openDialog(ids) {
        const managers = await api("GET", "Employees?$select=ID,fullName&$filter=role eq 'Manager' and status eq 'Active'&$orderby=firstName");
        const fApprover = new Select({
            width: "100%", forceSelection: false,
            items: managers.value.map(m => new Item({ key: m.ID, text: m.fullName }))
        });

        const dlg = new Dialog({
            title: "Approve Timesheet" + (ids.length > 1 ? "s (" + ids.length + ")" : ""),
            contentWidth: "28rem",
            content: [new SimpleForm({
                editable: true, layout: "ResponsiveGridLayout", labelSpanL: 4, labelSpanM: 4,
                content: [new Label({ text: "Approved By", required: true }), fApprover]
            })],
            beginButton: new Button({
                text: "Approve", type: "Accept",
                press: async function () {
                    const approver = fApprover.getSelectedKey();
                    if (!approver) { MessageBox.warning("Select the approving manager."); return; }
                    dlg.setBusy(true);
                    const errors = [];
                    let ok = 0;
                    for (const id of ids) {
                        try {
                            await api("POST", "Timesheets(" + id + ")/PSAService.ApproveTimesheet", { approvedBy: approver });
                            ok++;
                        } catch (e) { errors.push(e.message); }
                    }
                    dlg.setBusy(false);
                    dlg.close();
                    refreshAll();
                    if (errors.length) {
                        MessageBox.error(ok + " approved, " + errors.length + " failed:\n" + errors.join("\n"));
                    } else {
                        MessageToast.show(ok + " timesheet(s) approved");
                    }
                }
            }),
            endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
            afterClose: () => dlg.destroy()
        });
        dlg.open();
    }

    return {
        // list report: (undefined, selectedContexts) – object page: (boundContext)
        onApprove: function (oBindingContext, aSelectedContexts) {
            const ctxs = (aSelectedContexts && aSelectedContexts.length) ? aSelectedContexts : [oBindingContext];
            const ids = ctxs.filter(Boolean).map(c => c.getProperty("ID"));
            if (!ids.length) { MessageToast.show("Select at least one timesheet"); return; }
            openDialog(ids).catch(e => MessageBox.error(e.message));
        }
    };
});