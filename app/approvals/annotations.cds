using PSAService as service from '../../srv/service';
annotate service.Timesheets with @(
    Capabilities: {
        InsertRestrictions: { Insertable: false },   // created from "My Timesheet"
        UpdateRestrictions: { Updatable: false },
        DeleteRestrictions: { Deletable: false }
    },
    UI: {
        HeaderInfo: {
            TypeName: 'Timesheet', TypeNamePlural: 'Timesheets',
            Title: { Value: employee_ID }, Description: { Value: weekStartDate }
        },
        SelectionFields: [ status, employee_ID, weekStartDate, approvedBy_ID ],

        // default filter = Pending approval
        SelectionPresentationVariant #Default: {
            Text: 'Pending Approval',
            SelectionVariant: {
                $Type: 'UI.SelectionVariantType',
                SelectOptions: [{
                    $Type: 'UI.SelectOptionType', PropertyName: status,
                    Ranges: [{ $Type: 'UI.SelectionRangeType', Sign: #I, Option: #EQ, Low: 'Submitted' }]
                }]
            },
            PresentationVariant: {
                $Type: 'UI.PresentationVariantType',
                Visualizations: [ '@UI.LineItem' ],
                SortOrder: [{ Property: submittedDate, Descending: true }]
            }
        },

        LineItem: [
            { Value: employee_ID, ![@UI.Importance]: #High },
            { Value: weekStartDate, ![@UI.Importance]: #High },
            { Value: weekEndDate },
            { Value: totalBillableHours },
            { Value: submittedDate },
            { Value: status, Criticality: statusCriticality, ![@UI.Importance]: #High },
            { Value: approvedBy_ID },
            { Value: approvedDate },
            { $Type: 'UI.DataFieldForAction', Action: 'PSAService.RejectTimesheet', Label: 'Reject' }
        ],

        Identification: [
            { $Type: 'UI.DataFieldForAction', Action: 'PSAService.RejectTimesheet', Label: 'Reject' }
        ],
        DataPoint #Status: { Value: status, Title: 'Status', Criticality: statusCriticality },
        DataPoint #Hours:  { Value: totalBillableHours, Title: 'Billable Hours' },
        HeaderFacets: [
            { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Status' },
            { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Hours' }
        ],

        FieldGroup #General: { Data: [
            { Value: employee_ID }, { Value: weekStartDate }, { Value: weekEndDate },
            { Value: totalBillableHours }, { Value: status },
            { Value: submittedDate }, { Value: approvedBy_ID }, { Value: approvedDate },
            { Value: rejectionReason }, { Value: invoice_ID }
        ]},
        Facets: [
            { $Type: 'UI.ReferenceFacet', ID: 'TsGeneral', Label: 'General Information', Target: '@UI.FieldGroup#General' },
            { $Type: 'UI.ReferenceFacet', ID: 'TsEntries', Label: 'Time Entries', Target: 'entries/@UI.LineItem#TimesheetEntries' }
        ]
    }
);

annotate service.TimesheetEntries with @(
    UI.LineItem #TimesheetEntries: [
        { Value: workDate }, { Value: task_ID }, { Value: hours }, { Value: isBillable }, { Value: notes }
    ]
);