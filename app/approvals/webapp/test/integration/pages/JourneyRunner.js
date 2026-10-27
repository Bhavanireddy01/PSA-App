sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"approvals/test/integration/pages/TimesheetsList.gen",
	"approvals/test/integration/pages/TimesheetsObjectPage.gen"
], function (JourneyRunner, TimesheetsListGenerated, TimesheetsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('approvals') + '/test/flp.html#app-preview',
        pages: {
			onTheTimesheetsListGenerated: TimesheetsListGenerated,
			onTheTimesheetsObjectPageGenerated: TimesheetsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

