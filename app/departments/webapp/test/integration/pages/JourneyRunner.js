sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"departments/test/integration/pages/DepartmentsList.gen",
	"departments/test/integration/pages/DepartmentsObjectPage.gen"
], function (JourneyRunner, DepartmentsListGenerated, DepartmentsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('departments') + '/test/flp.html#app-preview',
        pages: {
			onTheDepartmentsListGenerated: DepartmentsListGenerated,
			onTheDepartmentsObjectPageGenerated: DepartmentsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

