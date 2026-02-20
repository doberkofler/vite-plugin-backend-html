import http from 'node:http';

export class MockBackendServer {
	private readonly port: number;
	private server: http.Server | null = null;

	constructor(port: number) {
		this.port = port;
	}

	public async open(): Promise<void> {
		const server = http.createServer((req, res) => {
			if (req.url === '/api/data') {
				res.writeHead(200, {'Content-Type': 'application/json'});
				res.end(JSON.stringify({data: 'backend-data'}));
				return;
			}

			if (req.url === '/page') {
				res.writeHead(200, {'Content-Type': 'text/html'});
				res.end(
					'<html><head><link rel="stylesheet" href="/assets/main-prod.css"><script src="/assets/main-prod.js"></script></head><body><h1>Backend Page</h1></body></html>',
				);
				return;
			}

			if (req.url === '/dynamic-page') {
				res.writeHead(200, {'Content-Type': 'text/html'});
				res.end('<html><head><meta name="vite-module" content="dynamic-module"></head><body><h1>Dynamic Page</h1></body></html>');
				return;
			}

			if (req.url === '/fragment-page') {
				res.writeHead(200, {'Content-Type': 'text/html'});
				res.end('<h1>Fragment Page</h1>');
				return;
			}

			if (req.url === '/custom-meta-page') {
				res.writeHead(200, {'Content-Type': 'text/html'});
				res.end('<html><head><meta name="custom-module" content="custom-module-val"></head><body><h1>Custom Meta Page</h1></body></html>');
				return;
			}

			if (req.url === '/api/cookies') {
				const cookie = req.headers.cookie;
				res.writeHead(200, {
					'Content-Type': 'application/json',
					'Set-Cookie': ['session=12345; HttpOnly', 'theme=dark'],
				});
				res.end(JSON.stringify({receivedCookie: cookie}));
				return;
			}

			if (req.url === '/redirect-me') {
				res.writeHead(302, {
					Location: '/page',
					'Set-Cookie': 'redirect-cookie=active',
				});
				res.end();
				return;
			}

			if (req.url === '/production-page') {
				res.writeHead(200, {'Content-Type': 'text/html'});
				res.end(`<!DOCTYPE html>
<html lang="en" class=" mode-light" data-theme="light">
<head>
<title>Dashboard</title>
<meta charset="utf-8">
<meta name="theme-color" content="#6699cc">
<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="application-name" content="Leading Job - TEST DATABASE">
<meta name="msapplication-TileColor" content="#2d89ef">
<meta name="msapplication-TileImage" content="/q/p/lj_unittest/mstile-150x150.png?v=260200">
<link rel="icon" href="/q/p/lj_unittest/favicon.ico?v=260200">
<link rel="icon" type="image/png" sizes="32x32" href="/q/p/lj_unittest/favicon-32x32.png?v=260200">
<link rel="icon" type="image/png" sizes="16x16" href="/q/p/lj_unittest/favicon-16x16.png?v=260200">
<link rel="apple-touch-icon" sizes="180x180" href="/q/p/lj_unittest/apple-touch-icon.png?v=260200" />
<link rel="mask-icon" href="/q/p/lj_unittest/safari-pinned-tab.svg?v=260200" color="#ec8710" />
<link rel="icon" type="image/png" sizes="192x192" href="/q/p/lj_unittest/android-chrome-192x192.png?v=260200">
<link rel="icon" type="image/png" sizes="512x512" href="/q/p/lj_unittest/android-chrome-512x512.png?v=260200">
<noscript><meta http-equiv="refresh" content="0;url=LAS_DLG_Error.page?errCode=JSDISABLED"></noscript>
<link rel="stylesheet" type="text/css" href="/q/p/lj_unittest/globals_260200.css" />
<link rel="stylesheet" type="text/css" href="/q/p/lj_unittest/las_mod_dashboard_260200.css" />
<script id="data-global" type="application/json">
{"session":{"applicationVersion":"260200","applicationVersionString":"26.2.0","pageTitle":"Dashboard","helpId":200,"isTestDatabase":false,"serverCharset":"UTF8","sessionKey":"F836109B35AECDE5CC2D6F3D1B6AF44B","logLevel":7,"agencyID":1,"agencyName":"QUALIANT","userID":10,"userCode":"CGABLE","userName":"Clark Gable","isAdmin":true,"isTestMode":true,"languageCodeA2":"EN","territoryCodeA2":"US","decimalSeparator":".","thousandsSeparator":",","resourcePath":"/q/p/lj_unittest/","isMobile":false,"dashboardUrl":"las_dlg_main.page","isLoggedIn":true,"hasLogout":true,"hasChangeAgency":true,"hasChangeUser":false,"menu":[{"title":"Communication","icon":"picons-menu-communication","url":"las_mod_communication.page_showcommunication?theShowAllProjects=0","class":"","items":[]},{"title":"Timesheet","icon":"","url":"","class":"submenu","items":[{"title":"Timesheet weekly","icon":"","url":"las_mod_ts_weekly.page","class":""},{"title":"Timesheet stopwatch","icon":"","url":"las_mod_ts_stopwatch.page","class":""},{"title":"Generate timesheets in time range","icon":"","url":"las_mod_ts_bulk.page","class":""},{"title":"Timesheet administration","icon":"","url":"las_mod_ts_admin.page","class":""},{"title":"Timesheet approvals","icon":"","url":"las_mod_ts_approval.page","class":""}]},{"title":"Campaign","icon":"picons-menu-campaign","url":"las_mod_camp.page","class":"","items":[]},{"title":"Job","icon":"picons-menu-job","url":"las_mod_job_dlg.page","class":"","items":[]},{"title":"Cost estimate","icon":"picons-menu-costestimate","url":"las_mod_ceheader_dlg.page","class":"","items":[]},{"title":"Purchase order","icon":"picons-menu-order","url":"las_mod_order.page","class":"","items":[]},{"title":"Supplier invoice","icon":"picons-menu-supplierinvoice","url":"las_mod_siheader_dlg.page","class":"","items":[]},{"title":"Client invoice draft","icon":"picons-menu-clientinvoicedraft","url":"las_mod_ciheader_dlg.page?listMode=1","class":"","items":[]},{"title":"Client invoice","icon":"picons-menu-clientinvoice","url":"las_mod_ciheader_dlg.page?listMode=0","class":"","items":[]},{"title":"Collaboration","icon":"picons-menu-collaboration","url":"las_mod_collaboration.page","class":"","items":[]},{"title":"Project management","icon":"","url":"","class":"submenu","items":[{"title":"Project status","icon":"","url":"las_mod_projectstatus.page?allProjects=0","class":""},{"title":"Project timeline","icon":"","url":"las_mod_projecttimeline.page","class":""},{"title":"Project report","icon":"","url":"las_mod_projectreport.page","class":""},{"title":"Current tasks","icon":"","url":"las_mod_projecttask.page","class":""},{"title":"Employee workload","icon":"","url":"las_mod_pm_emplworkload.page","class":""},{"title":"Team overview","icon":"","url":"las_mod_pm_teamoverview.page","class":""},{"title":"Workplan","icon":"","url":"las_mod_pm_workplan.page","class":""},{"title":"Kanban Board","icon":"","url":"las_mod_pm_kanbanboard_page.page","class":""}]},{"title":"Reports","icon":"picons-menu-reports","url":"las_mod_reports_dlg.page","class":"","items":[]},{"title":"Administration","icon":"","url":"","class":"submenu","items":[{"title":"Master data","icon":"","url":"las_mod_masterdata_page.page","class":""},{"title":"Import/Export","icon":"","url":"#","class":"openimpexp js-link"},{"title":"System","icon":"","url":"#","class":"opensystem js-link"}]},{"title":"Test suite","icon":"picons-menu-science-outline","url":"tst_examples.page","class":"","items":[]}],"supportTitle":"Support request","supportLink":"las_mod_adminsupport.page","manualUrl":"https://www.qualiant.com/leading-job/manual/en/","releaseNoteUrl":"https://www.qualiant.com/blog/detail/LEADINGJob-ReleaseNote-26.2.0-en","releaseNoteAlert":false,"userPreferences":{"notifyInfoMessage":true,"notifySuccessMessage":true,"notifyWarningMessage":true,"notifyNoSaveNeeded":false,"notifyCancelChanges":true,"notifySendEmailMessage":true,"autoAdjustColWidth":false,"experimentalFeatures":true,"tableEngine":"DEFAULT","printOutputMode":"dialog","setShowOnlyAssigned":false}},"moduleOptions":{"addPublicDashboardPrivilege":true,"delPublicDashboardPrivilege":true}}
</script>
<script src="/q/p/lj_unittest/globals_260200.js" type="module"></script>
<script src="/q/p/lj_unittest/las_mod_dashboard_260200.js" type="module"></script>
</head>
<body>
<div id="header"></div>
<div id="contentWrapper"><div id="content" style="padding: 0px;">
</div></div>
</body>
</html>`);
				return;
			}

			res.writeHead(404);
			res.end();
		});

		await new Promise<void>((resolve) => {
			server.listen(this.port, resolve);
		});

		this.server = server;
	}

	public async close(): Promise<void> {
		return new Promise<void>((resolve) => {
			if (this.server) {
				this.server.close(() => {
					resolve();
				});
			}
		});
	}
}
