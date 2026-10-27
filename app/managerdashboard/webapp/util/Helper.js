sap.ui.define([
    "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/DatePicker",
    "sap/m/Label", "sap/m/MessageBox", "sap/ui/core/Item", "sap/ui/layout/form/SimpleForm"
], function (Dialog, Button, Input, Select, DatePicker, Label, MessageBox, Item, SimpleForm) {
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
        const r = await fetch(BASE + encodeURI(path), {
            method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j.error && j.error.message) || r.statusText);
        return j;
    }

    const opts = arr => arr.map(x => ({ key: x, text: x }));

    // fields: [{key,label,type:'text'|'number'|'date'|'select',required,value,options:[{key,text}],max}]
    function openForm(title, fields, onSave, okText) {
        const ctl = {}, content = [];
        fields.forEach(f => {
            let c;
            if (f.type === "select") {
                c = new Select({
                    width: "100%", forceSelection: false, selectedKey: f.value || "",
                    items: [new Item({ key: "", text: "" })]
                        .concat((f.options || []).map(o => new Item({ key: o.key, text: o.text })))
                });
            } else if (f.type === "date") {
                c = new DatePicker({ valueFormat: "yyyy-MM-dd", displayFormat: "medium", value: f.value || "" });
            } else {
                c = new Input({ type: f.type === "number" ? "Number" : "Text", value: f.value == null ? "" : String(f.value) });
                if (f.max) c.setMaxLength(f.max);
            }
            ctl[f.key] = c;
            content.push(new Label({ text: f.label, required: !!f.required }), c);
        });

        const read = () => {
            const o = {};
            fields.forEach(f => {
                const c = ctl[f.key];
                let v = f.type === "select" ? c.getSelectedKey() : c.getValue();
                if (v === "" || v == null) v = null;
                else if (f.type === "number") v = Number(v);
                o[f.key] = v;
            });
            return o;
        };

        const dlg = new Dialog({
            title, contentWidth: "34rem",
            content: [new SimpleForm({
                editable: true, layout: "ResponsiveGridLayout", labelSpanL: 4, labelSpanM: 4, content
            })],
            beginButton: new Button({
                text: okText || "Save", type: "Emphasized",
                press: async function () {
                    const v = read();
                    const miss = fields.find(f => f.required && v[f.key] == null);
                    if (miss) { MessageBox.warning(miss.label + " is required"); return; }
                    dlg.setBusy(true);
                    try { await onSave(v); dlg.close(); }
                    catch (e) { MessageBox.error(e.message); }
                    finally { dlg.setBusy(false); }
                }
            }),
            endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
            afterClose: () => dlg.destroy()
        });
        dlg.open();
    }

    return { api, opts, openForm, err: e => MessageBox.error(e.message) };
});