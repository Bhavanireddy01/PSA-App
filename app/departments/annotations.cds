using PSAService as service from '../../srv/service';

annotate service.Departments with @(
    Common.SemanticKey: [departmentName],
    UI: {
        HeaderInfo: {
            TypeName: 'Department', TypeNamePlural: 'Departments',
            Title: { Value: departmentName }, Description: { Value: description }
        },
        SelectionFields: [ departmentName, status ],
        LineItem: [
            { Value: departmentName, ![@UI.Importance]: #High },
            { Value: description },
            { Value: status, ![@UI.Importance]: #High }
        ],
        DataPoint #Status: { Value: status, Title: 'Status' },
        HeaderFacets: [ { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Status' } ],
        FieldGroup #General: { Data: [
            { Value: departmentName }, { Value: description }, { Value: status }
        ]},
        Facets: [
            { $Type: 'UI.ReferenceFacet', ID: 'General',   Label: 'General Information', Target: '@UI.FieldGroup#General' },
            { $Type: 'UI.ReferenceFacet', ID: 'Employees', Label: 'Employees', Target: 'employees/@UI.LineItem#DeptEmployees' }
        ]
    }
);

annotate service.Employees with @(
    UI.LineItem #DeptEmployees: [
        { Value: fullName }, { Value: email }, { Value: jobTitle }, { Value: role }, { Value: status }
    ]
);