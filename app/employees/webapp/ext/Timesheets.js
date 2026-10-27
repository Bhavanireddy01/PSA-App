sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/m/Dialog", "sap/m/Button", "sap/m/Input", "sap/m/Select", "sap/m/DatePicker",
    "sap/m/Label", "sap/m/MessageBox", "sap/m/MessageToast", "sap/ui/core/Item",
    "sap/ui/layout/form/SimpleForm"
], function (ControllerExtension, Dialog, Button, Input, Select, DatePicker, Label, MessageBox, MessageToast, Item, SimpleForm) {
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
        if (method !== "GET") { 
            const t = await token(); 
            if (t) h["X-CSRF-Token"] = t; 
        }
        const r = await fetch(BASE + encodeURI(path), {
            method, 
            headers: h, 
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j.error && j.error.message) || r.statusText);
        return j;
    }

    function getEmployeeId(oContext) {
        let id = null;

        // Check if context has getProperty
        if (oContext && typeof oContext.getProperty === "function") {
            id = oContext.getProperty("ID") || oContext.getProperty("employee_ID");
        }

        // Check parent/view binding context
        if (!id && oContext && typeof oContext.getBindingContext === "function") {
            const bCtx = oContext.getBindingContext();
            id = bCtx && typeof bCtx.getProperty === "function" ? (bCtx.getProperty("ID") || bCtx.getProperty("employee_ID")) : null;
        }

        // Fallback: URL hash
        if (!id) {
            const hash = decodeURIComponent(window.location.hash || "");
            const m = hash.match(/Employees\((?:ID=)?['"]?([0-9a-fA-F-]+|\d+)['"]?\)/);
            if (m && m[1]) {
                id = m[1];
            }
        }
        return id;
    }

    function refreshTable(oContext) {
        if (oContext && typeof oContext.requestRefresh === "function") {
            oContext.requestRefresh();
        } else if (oContext && typeof oContext.refresh === "function") {
            oContext.refresh();
        } else {
            const h = window.location.hash;
            window.location.hash = "";
            setTimeout(() => { window.location.hash = h; }, 50);
        }
    }

    const pad = n => String(n).padStart(2, "0");
    const utc = s => { const p = s.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); };
    const iso = d => d.toISOString().slice(0, 10);
    const addDays = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
    const monday = s => addDays(s, -((utc(s).getUTCDay() + 6) % 7));
    const todayLocal = () => { const t = new Date(); return t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate()); };

    function openForm(title, fields, onSave) {
        const ctl = {}, content = [];
        fields.forEach(f => {
            let c;
            if (f.type === "select") {
                c = new Select({
                    width: "100%", forceSelection: false, selectedKey: f.value || "",
                    items: (f.options || []).map(o => new Item({ key: o.key, text: o.text }))
                });
            } else if (f.type === "date") {
                c = new DatePicker({ valueFormat: "yyyy-MM-dd", displayFormat: "medium", value: f.value || "" });
            } else {
                c = new Input({ type: f.type === "number" ? "Number" : "Text", value: f.value == null ? "" : String(f.value) });
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
            title, 
            contentWidth: "32rem",
            content: [new SimpleForm({ editable: true, layout: "ResponsiveGridLayout", labelSpanL: 4, labelSpanM: 4, content })],
            beginButton: new Button({
                text: "Create", 
                type: "Emphasized",
                press: async function () {
                    const v = read();
                    const miss = fields.find(f => f.required && (v[f.key] == null || v[f.key] === ""));
                    if (miss) { MessageBox.warning(miss.label + " is required"); return; }
                    dlg.setBusy(true);
                    try { 
                        await onSave(v); 
                        dlg.close(); 
                    } catch (e) { 
                        MessageBox.error(e.message || String(e)); 
                    } finally { 
                        dlg.setBusy(false); 
                    }
                }
            }),
            endButton: new Button({ text: "Cancel", press: () => dlg.close() }),
            afterClose: () => dlg.destroy()
        });
        dlg.open();
    }

    const TimesheetsExtension = ControllerExtension.extend("employees.ext.Timesheets", {
        // Empty extension skeleton to register without errors in controllerExtensions
    });

    // Attach static handler functions to the class object so Fiori elements can resolve them directly:
    TimesheetsExtension.onCreateTimesheet = async function (oContext) {
        try {
            const empId = getEmployeeId(oContext);
            if (!empId) {
                MessageBox.error("Could not find Employee ID. Please reload the Employee page.");
                return;
            }

            const defaultStart = monday(todayLocal());
            const defaultEnd = addDays(defaultStart, 6);

            const statusOptions = [
                { key: "Draft", text: "Draft" },
                { key: "Submitted", text: "Submitted" },
                { key: "Approved", text: "Approved" }
            ];

            openForm("Create Timesheet", [
                { key: "weekStartDate", label: "Week Start Date", type: "date", required: true, value: defaultStart },
                { key: "weekEndDate", label: "Week End Date", type: "date", required: true, value: defaultEnd },
                { key: "totalBillableHours", label: "Total Billable Hours", type: "number", required: true, value: 0 },
                { key: "status", label: "Status", type: "select", required: true, value: "Draft", options: statusOptions },
                { key: "submittedDate", label: "Submitted Date", type: "date", required: false, value: "" }
            ], async (v) => {
                if (v.weekEndDate < v.weekStartDate) {
                    throw new Error("Week End Date cannot be before Week Start Date");
                }
                if (Number(v.totalBillableHours) < 0) {
                    throw new Error("Total Billable Hours cannot be negative");
                }

                let subDate = v.submittedDate;
                if ((v.status === "Submitted" || v.status === "Approved") && !subDate) {
                    subDate = todayLocal();
                }

                const empFilter = isNaN(empId) ? `employee_ID eq '${empId}'` : `employee_ID eq ${empId}`;
                const dup = await api("GET", `Timesheets?$select=ID&$filter=${empFilter} and weekStartDate eq ${v.weekStartDate}`);
                if (dup.value && dup.value.length > 0) {
                    throw new Error("A timesheet for the week of " + v.weekStartDate + " already exists.");
                }

                const r = await api("POST", "CreateTimesheet", {
                    employeeID: empId,
                    weekStartDate: v.weekStartDate,
                    weekEndDate: v.weekEndDate,
                    totalBillableHours: Number(v.totalBillableHours),
                    status: v.status,
                    submittedDate: subDate || null
                });

                MessageToast.show(r.value || "Timesheet created successfully");
                refreshTable(oContext);
            });

        } catch (err) {
            MessageBox.error(err.message || String(err));
        }
    };

    TimesheetsExtension.onSubmitSelected = function (oContext, aSelected) {
        const contexts = Array.isArray(aSelected) && aSelected.length > 0
            ? aSelected
            : (Array.isArray(oContext) ? oContext : (oContext ? [oContext] : []));

        const ids = contexts.map(c => {
            if (typeof c.getProperty === "function") return c.getProperty("ID");
            if (c.getObject && typeof c.getObject === "function") return c.getObject().ID;
            return null;
        }).filter(Boolean);

        if (!ids.length) {
            MessageToast.show("Please select at least one timesheet row using the checkbox");
            return;
        }

        MessageBox.confirm(`Submit ${ids.length} selected timesheet(s) for manager approval?`, {
            onClose: async (action) => {
                if (action !== MessageBox.Action.OK) return;
                let successCount = 0;
                const errors = [];

                for (const id of ids) {
                    try {
                        const qId = isNaN(id) ? `'${id}'` : id;
                        await api("POST", `Timesheets(${qId})/PSAService.SubmitTimesheet`, {});
                        successCount++;
                    } catch (e) {
                        errors.push(e.message || String(e));
                    }
                }

                if (errors.length) {
                    MessageBox.error(`${successCount} submitted, but errors occurred:\n` + errors.join("\n"));
                } else {
                    MessageToast.show("Timesheet(s) submitted successfully");
                }
                refreshTable(oContext);
            }
        });
    };

    TimesheetsExtension.onDeleteSelected = function (oContext, aSelected) {
        const contexts = Array.isArray(aSelected) && aSelected.length > 0
            ? aSelected
            : (Array.isArray(oContext) ? oContext : (oContext ? [oContext] : []));

        const ids = contexts.map(c => {
            if (typeof c.getProperty === "function") return c.getProperty("ID");
            if (c.getObject && typeof c.getObject === "function") return c.getObject().ID;
            return null;
        }).filter(Boolean);

        if (!ids.length) {
            MessageToast.show("Please select at least one draft timesheet to delete");
            return;
        }

        MessageBox.confirm(`Delete ${ids.length} selected timesheet(s)?`, {
            onClose: async (action) => {
                if (action !== MessageBox.Action.OK) return;
                for (const id of ids) {
                    try {
                        await api("POST", "DeleteTimesheet", { TimesheetID: id });
                    } catch (e) {
                        MessageBox.error(e.message || String(e));
                    }
                }
                MessageToast.show("Timesheet(s) deleted");
                refreshTable(oContext);
            }
        });
    };

    // Also mirror methods on the prototype for compatibility
    TimesheetsExtension.prototype.onCreateTimesheet = TimesheetsExtension.onCreateTimesheet;
    TimesheetsExtension.prototype.onSubmitSelected = TimesheetsExtension.onSubmitSelected;
    TimesheetsExtension.prototype.onDeleteSelected = TimesheetsExtension.onDeleteSelected;

    return TimesheetsExtension;
});