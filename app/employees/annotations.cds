using PSAService as service from '../../srv/service';

annotate service.Employees with @(
    Capabilities.FilterRestrictions: {
        FilterExpressionRestrictions: [
            {
                Property: 'role',
                AllowedExpressions: 'SingleOrMultiValue'
            },
            {
                Property: 'status',
                AllowedExpressions: 'SingleOrMultiValue'
            }
        ],
                Identification: [
            {
                $Type: 'UI.DataFieldForAction',
                Label: 'Create Timesheet',
                Action: 'PSAService.CreateTimesheet'
            }
        ]
    },
    Common.SemanticKey: [email],
    UI: {
        HeaderInfo: {
            TypeName: 'Employee',
            TypeNamePlural: 'Employees',
            Title: { Value: fullName },
            Description: { Value: jobTitle }
        },
        SelectionFields: [ role, department_ID, status, reportingManager_ID ],
        LineItem: [
            { Value: fullName, ![@UI.Importance]: #High },
            { Value: email },
            { Value: jobTitle },
            { Value: role, ![@UI.Importance]: #High },
            { Value: department_ID },
            { Value: reportingManager_ID },
            { Value: hourlyRate },
            { Value: status, ![@UI.Importance]: #High }
        ],
        DataPoint #Role:   { Value: role,   Title: 'Role' },
        DataPoint #Status: { Value: status, Title: 'Status' },
        HeaderFacets: [
            { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Role' },
            { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Status' }
        ],
        FieldGroup #Personal: { Data: [
            { Value: firstName },
            { Value: lastName },
            { Value: email },
            { Value: phoneNo }
        ]},
        FieldGroup #Employment: { Data: [
            { Value: jobTitle },
            { Value: role },
            { Value: department_ID },
            { Value: reportingManager_ID },
            { Value: joinDate },
            { Value: hourlyRate },
            { Value: status }
        ]},
        Facets: [
            { $Type: 'UI.ReferenceFacet', ID: 'Personal',   Label: 'Personal Information',   Target: '@UI.FieldGroup#Personal' },
            { $Type: 'UI.ReferenceFacet', ID: 'Employment', Label: 'Employment Details', Target: '@UI.FieldGroup#Employment' },
            { $Type: 'UI.ReferenceFacet', ID: 'Timesheets', Label: 'Timesheets', Target: 'timesheets/@UI.LineItem#EmpTimesheets' }
            // Note: If assignedTasks association is not present in schema.cds, keep this commented out to prevent $batch crash:
            // { $Type: 'UI.ReferenceFacet', ID: 'Assigned',   Label: 'Assigned Tasks', Target: 'assignedTasks/@UI.LineItem#Assigned' }
        ]
    }
);

annotate service.Timesheets with @(
    UI.LineItem #EmpTimesheets: [
        { Value: weekStartDate, ![@UI.Importance]: #High },
        { Value: weekEndDate },
        { Value: totalBillableHours },
        { Value: submittedDate },
        { Value: status, Criticality: statusCriticality, ![@UI.Importance]: #High },
        { Value: approvedBy_ID },
        { Value: rejectionReason },
         {
    $Type: 'UI.DataFieldForAction',
    Label: 'Create Timesheet',
    Action: 'PSAService.CreateTimesheet'
},
        {
    $Type: 'UI.DataFieldForAction',
    Label: 'Submit',
    Action: 'PSAService.SubmitTimesheet'
},

    ],
    
);

annotate service.Tasks with @(
    UI.LineItem #Assigned: [
        { Value: taskName },
        { Value: milestone_ID },
        { Value: priority },
        { Value: status },
        { Value: estimatedHours },
        { Value: actualHours }
    ]
);

// -------------------------------------------------------------
// Value Help and Text Arrangements
// -------------------------------------------------------------
