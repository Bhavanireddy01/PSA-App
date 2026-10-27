sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"clients/test/integration/pages/ClientsList.gen",
	"clients/test/integration/pages/ClientsObjectPage.gen"
], function (JourneyRunner, ClientsListGenerated, ClientsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('clients') + '/test/flp.html#app-preview',
        pages: {
			onTheClientsListGenerated: ClientsListGenerated,
			onTheClientsObjectPageGenerated: ClientsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

