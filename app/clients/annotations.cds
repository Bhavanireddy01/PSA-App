using PSAService as service from '../../srv/service';

annotate service.Clients with @(
    Common.SemanticKey: [clientName],
    UI: {
        HeaderInfo: {
            TypeName: 'Client', TypeNamePlural: 'Clients',
            Title: { Value: clientName }, Description: { Value: industry }
        },
        SelectionFields: [ clientName, country, industry, status ],
        LineItem: [
            { Value: clientName, ![@UI.Importance]: #High },
            { Value: contactPerson },
            { Value: email },
            { Value: phoneNo },
            { Value: country },
            { Value: industry },
            { Value: status, ![@UI.Importance]: #High },
            { $Type: 'UI.DataFieldForAction', Action: 'PSAService.ActivateClient',   Label: 'Activate' },
            { $Type: 'UI.DataFieldForAction', Action: 'PSAService.DeactivateClient', Label: 'Deactivate' }
        ],
        Identification: [
            { $Type: 'UI.DataFieldForAction', Action: 'PSAService.ActivateClient',         Label: 'Activate' },
            { $Type: 'UI.DataFieldForAction', Action: 'PSAService.DeactivateClient',       Label: 'Deactivate' },
            { $Type: 'UI.DataFieldForAction', Action: 'PSAService.CreateProjectForClient', Label: 'Create Project' }
        ],
        DataPoint #Status: { Value: status, Title: 'Status' },
        HeaderFacets: [ { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#Status' } ],
        FieldGroup #General: { Data: [
            { Value: clientName }, { Value: industry }, { Value: country }, { Value: status }
        ]},
        FieldGroup #Contact: { Data: [
            { Value: contactPerson }, { Value: email }, { Value: phoneNo }, { Value: address }
        ]},
        Facets: [
            { $Type: 'UI.ReferenceFacet', ID: 'General',  Label: 'General Information', Target: '@UI.FieldGroup#General' },
            { $Type: 'UI.ReferenceFacet', ID: 'Contact',  Label: 'Contact',             Target: '@UI.FieldGroup#Contact' },
            { $Type: 'UI.ReferenceFacet', ID: 'Projects', Label: 'Projects',            Target: 'projects/@UI.LineItem#ClientProjects' }
        ]
    }
);

annotate service.Projects with @(
    UI.LineItem #ClientProjects: [
        { Value: projectCode }, { Value: projectName }, { Value: manager_ID },
        { Value: billingType }, { Value: startDate }, { Value: endDate },
        { Value: status, Criticality: statusCriticality }
    ]
);