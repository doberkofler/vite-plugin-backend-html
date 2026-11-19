import {strict as assert} from 'node:assert';
import {type IncomingMessage, type ServerResponse} from 'node:http';
import {Readable} from 'node:stream';
import {createServer, type Plugin, type ViteDevServer} from 'vite';
import {describe, it, expect, vi} from 'vitest';
import {
	backendProxyPlugin,
	extractModuleFromMeta,
	extractModuleFromUrl,
	createFetchBackendHandler,
	stripTrailingSlash,
	stripLeadingSlash,
	joinUrlParts,
	normalizeRedirectLocation,
	type BackendResult,
	type LoggingLevel,
} from '../src/index.js';
import {MockBackendServer} from './backend_server.ts';
import {BackendProxy} from '../src/backend-proxy.ts';

type Middleware = (req: IncomingMessage, res: ServerResponse, next: (error?: Error) => void) => void;

const captureMiddleware = async (plugin: Plugin): Promise<Middleware> => {
	const hook = plugin.configureServer;
	assert.ok(typeof hook === 'function', 'Expected a configureServer hook');

	const use = vi.fn<(middleware: Middleware) => void>();
	const server = {middlewares: {use}} as unknown as ViteDevServer;
	const configureServer: OmitThisParameter<typeof hook> = hook;
	await configureServer(server);

	const call = use.mock.lastCall;
	assert.ok(call !== undefined, 'Expected a registered middleware');
	return call[0];
};

const integrationTest = it
	.extend('backendPort', {scope: 'file'}, 3005)
	.extend('backendBaseUrl', {scope: 'file'}, async ({backendPort}, {onCleanup}) => {
		const backendServer = new MockBackendServer(backendPort);
		onCleanup(async () => {
			await backendServer.close();
		});
		await backendServer.open();
		return `http://localhost:${backendPort}`;
	})
	.extend('viteBaseUrl', {scope: 'file'}, async ({backendBaseUrl}, {onCleanup}) => {
		const vitePort = 3006;
		const viteServer = await createServer({
			root: process.cwd(),
			server: {
				port: vitePort,
				strictPort: true,
				hmr: false,
			},
			plugins: [
				backendProxyPlugin({
					backendBaseUrl,
					backendHandler: async ({url}): Promise<BackendResult> => {
						const res = await fetch(`${backendBaseUrl}${url}`, {redirect: 'manual'});
						const {status} = res;
						const responseHeaders: Record<string, string | string[]> = {};
						const setCookie = res.headers.getSetCookie();
						if (setCookie.length > 0) {
							responseHeaders['set-cookie'] = setCookie;
						}

						if (status >= 300 && status < 400) {
							return {
								type: 'redirect',
								status,
								location: res.headers.get('location') ?? '/',
								headers: responseHeaders,
							};
						}

						const contentType = res.headers.get('content-type') ?? '';
						if (contentType.includes('text/html')) {
							const html = await res.text();
							return {
								type: 'html',
								content: html,
								module: extractModuleFromMeta(html) ?? 'test-module',
								headers: responseHeaders,
							};
						}
						return {
							type: 'binary',
							content: Buffer.from(await res.arrayBuffer()),
							contentType,
							status: res.status,
							headers: responseHeaders,
						};
					},
					assetConfig: {
						globalEntryPoints: {js: '/src/main.ts', css: '/src/style.css'},
						getModuleEntryPoints: (module) => ({
							js: `/src/${module}.ts`,
							css: `/src/${module}.css`,
						}),
					},
					bypass: (): boolean => false,
					debug: 'debug',
				}),
			],
		});
		onCleanup(async () => {
			await viteServer.close();
		});
		await viteServer.listen();
		return `http://localhost:${vitePort}`;
	})
	.extend('dynamicViteBaseUrl', {scope: 'file'}, async ({backendBaseUrl}, {onCleanup}) => {
		const vitePort = 3007;
		const handler = createFetchBackendHandler({
			extractModule: async (_url, html) => {
				await Promise.resolve();
				return extractModuleFromMeta(html);
			},
		});
		const viteServer = await createServer({
			root: process.cwd(),
			server: {port: vitePort, strictPort: true, hmr: false},
			plugins: [
				backendProxyPlugin({
					backendBaseUrl,
					backendHandler: handler,
					assetConfig: {
						globalEntryPoints: {js: '/src/main.ts', css: '/src/style.css'},
						getModuleEntryPoints: (module) => ({
							js: `/src/${module}.ts`,
							css: `/src/${module}.css`,
						}),
					},
					bypass: (): boolean => false,
				}),
			],
		});
		onCleanup(async () => {
			await viteServer.close();
		});
		await viteServer.listen();
		return `http://localhost:${vitePort}`;
	});

describe('backendProxyPlugin', () => {
	integrationTest('should allow Vite to handle internal resources', async ({viteBaseUrl}) => {
		expect.assertions(2);
		const response = await fetch(`${viteBaseUrl}/@vite/client`);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain('vite');
	});

	integrationTest('should proxy HTML requests without backend asset tags', async ({viteBaseUrl}) => {
		expect.assertions(5);
		const response = await fetch(`${viteBaseUrl}/page`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');

		const html = await response.text();
		expect(html).toContain('<h1>Backend Page</h1>');

		expect(html).not.toContain('/assets/main-prod.css');
		expect(html).not.toContain('/assets/main-prod.js');
	});

	integrationTest('should inject Vite, global, and module asset tags into backend HTML', async ({viteBaseUrl}) => {
		expect.assertions(5);
		const response = await fetch(`${viteBaseUrl}/page`);
		const html = await response.text();
		expect(html).toContain('<script type="module" src="/@vite/client"></script>');
		expect(html).toContain('<link rel="stylesheet" href="/src/style.css">');
		expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
		expect(html).toContain('<link rel="stylesheet" href="/src/test-module.css">');
		expect(html).toContain('<script type="module" src="/src/test-module.ts"></script>');
	});

	integrationTest('should forward non-HTML backend responses (e.g., JSON API)', async ({viteBaseUrl}) => {
		expect.assertions(3);
		const response = await fetch(`${viteBaseUrl}/api/data`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/json');

		await expect(response.text()).resolves.toBe(JSON.stringify({data: 'backend-data'}));
	});

	integrationTest('should handle backend errors gracefully', async ({viteBaseUrl}) => {
		expect.assertions(1);
		const response = await fetch(`${viteBaseUrl}/not-found`);
		// backendHandler will fetch and get 404, then return binary with 404
		expect(response.status).toBe(404);
	});

	integrationTest('should remove /q/p/ assets from the production page', async ({viteBaseUrl}) => {
		expect.assertions(5);
		const response = await fetch(`${viteBaseUrl}/production-page`);
		expect(response.status).toBe(200);
		const html = await response.text();

		expect(html).not.toContain('/q/p/lj_unittest/globals_260200.css');
		expect(html).not.toContain('/q/p/lj_unittest/globals_260200.js');
		expect(html).not.toContain('/q/p/lj_unittest/las_mod_dashboard_260200.css');
		expect(html).not.toContain('/q/p/lj_unittest/las_mod_dashboard_260200.js');
	});

	integrationTest('should inject Vite and global assets into the production page', async ({viteBaseUrl}) => {
		expect.assertions(3);
		const response = await fetch(`${viteBaseUrl}/production-page`);
		const html = await response.text();
		expect(html).toContain('<script type="module" src="/@vite/client"></script>');
		expect(html).toContain('<link rel="stylesheet" href="/src/style.css">');
		expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
	});

	describe('helpers', () => {
		it('extractModuleFromMeta should extract module from meta tag', () => {
			expect.assertions(3);
			const html = '<html><head><meta name="vite-module" content="my-module"></head></html>';
			expect(extractModuleFromMeta(html)).toBe('my-module');
			expect(extractModuleFromMeta(html, 'other-name')).toBeNull();
			expect(extractModuleFromMeta(html, 'vite-module')).toBe('my-module');
		});

		it('extractModuleFromUrl should extract module from URL', () => {
			expect.assertions(2);
			const url = '/app/admin/dashboard';
			const pattern = /^\/app\/(?<module>[^/]+)/u;
			expect(extractModuleFromUrl(url, pattern)).toBe('admin');
			expect(extractModuleFromUrl('/other', pattern)).toBeNull();
		});
	});

	describe('dynamic asset injection', () => {
		integrationTest('should preserve dynamic page content while injecting global assets', async ({dynamicViteBaseUrl}) => {
			expect.assertions(4);
			const response = await fetch(`${dynamicViteBaseUrl}/dynamic-page`);
			const html = await response.text();
			expect(html).toContain('<h1>Dynamic Page</h1>');
			expect(html).toContain('<script type="module" src="/@vite/client"></script>');
			expect(html).toContain('<link rel="stylesheet" href="/src/style.css">');
			expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
		});

		integrationTest('should inject module assets from a backend meta tag', async ({dynamicViteBaseUrl}) => {
			expect.assertions(2);
			const response = await fetch(`${dynamicViteBaseUrl}/dynamic-page`);
			const html = await response.text();
			expect(html).toContain('<link rel="stylesheet" href="/src/dynamic-module.css">');
			expect(html).toContain('<script type="module" src="/src/dynamic-module.ts"></script>');
		});

		integrationTest('should handle binary response using createFetchBackendHandler in plugin', async ({backendBaseUrl}) => {
			expect.assertions(3);
			const handler = createFetchBackendHandler({});
			const streamingViteServer = await createServer({
				root: process.cwd(),
				server: {port: 3008, strictPort: true, hmr: false},
				plugins: [
					backendProxyPlugin({
						backendBaseUrl,
						backendHandler: handler,
						assetConfig: {
							globalEntryPoints: {},
							getModuleEntryPoints: () => ({}),
						},
						bypass: (): boolean => false,
					}),
				],
			});
			await streamingViteServer.listen();

			try {
				const response = await fetch('http://localhost:3008/api/data');
				expect(response.status).toBe(200);
				expect(response.headers.get('content-type')).toBe('application/json');
				await expect(response.text()).resolves.toBe(JSON.stringify({data: 'backend-data'}));
			} finally {
				await streamingViteServer.close();
			}
		});

		integrationTest('should prepend assets if no head or body tags exist', async ({viteBaseUrl}) => {
			expect.assertions(3);
			const response = await fetch(`${viteBaseUrl}/fragment-page`);
			const html = await response.text();

			expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
			expect(html).toContain('<h1>Fragment Page</h1>');
			// Since /fragment-page doesn't have head/body, it prepends.
			expect(html).toContain('<script type="module" src="/src/test-module.ts"></script>');
		});

		integrationTest('should handle binary response in createFetchBackendHandler', async ({backendBaseUrl}) => {
			expect.assertions(2);
			const handler = createFetchBackendHandler({});
			const result = await handler({
				url: '/api/data',
				method: 'GET',
				headers: {},
				body: undefined,
				req: {headers: {}} as IncomingMessage,
				backendBaseUrl,
				logger: (_level: string, _message: string, _data?: unknown) => {
					/* empty */
				},
			});

			assert.ok(result.type === 'binary', 'Expected binary result');
			expect(result.contentType).toBe('application/json');
			expect(result.content.toString()).toBe(JSON.stringify({data: 'backend-data'}));
		});

		integrationTest('should forward and receive cookies using createFetchBackendHandler', async ({backendBaseUrl}) => {
			expect.assertions(3);
			const handler = createFetchBackendHandler({});
			const result = await handler({
				url: '/api/cookies',
				method: 'GET',
				headers: {
					cookie: 'user=test-user',
				},
				body: undefined,
				req: {
					headers: {
						cookie: 'user=test-user',
					},
				} as unknown as IncomingMessage,
				backendBaseUrl,
				logger: (_level: string, _message: string, _data?: unknown) => {
					/* empty */
				},
			});

			assert.ok(result.headers !== undefined, 'Expected response headers');
			const setCookie = result.headers['set-cookie'];
			expect(setCookie).toContain('session=12345; HttpOnly');
			expect(setCookie).toContain('theme=dark');

			assert.ok(result.type === 'binary', 'Expected binary result');
			expect(result.content.toString()).toBe(JSON.stringify({receivedCookie: 'user=test-user'}));
		});

		integrationTest('should handle redirects in createFetchBackendHandler', async ({backendBaseUrl}) => {
			expect.assertions(3);
			const handler = createFetchBackendHandler({});
			const result = await handler({
				url: '/redirect-me',
				method: 'GET',
				headers: {},
				body: undefined,
				req: {headers: {}} as IncomingMessage,
				backendBaseUrl,
				logger: (_level: string, _message: string, _data?: unknown) => {
					/* empty */
				},
			});

			assert.ok(result.type === 'redirect', 'Expected redirect result');
			expect(result.status).toBe(302);
			expect(result.location).toBe('/page');
			assert.ok(result.headers !== undefined, 'Expected redirect headers');
			expect(result.headers['set-cookie']).toContain('redirect-cookie=active');
		});

		integrationTest('should propagate redirects through the plugin', async ({viteBaseUrl}) => {
			expect.assertions(3);
			const response = await fetch(`${viteBaseUrl}/redirect-me`, {
				redirect: 'manual',
			});

			expect(response.status).toBe(302);
			expect(response.headers.get('location')).toBe('/page');
			expect(response.headers.getSetCookie()).toContain('redirect-cookie=active');
		});
	});

	describe('backendProxyPlugin uncovered branches', () => {
		it('should call next if req.url is missing', async () => {
			expect.assertions(1);
			const plugin = backendProxyPlugin({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					return {type: 'html', content: '', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (): Record<string, never> => ({}),
				},
			});

			const middleware = await captureMiddleware(plugin);
			const next = vi.fn<() => void>();
			middleware({} as IncomingMessage, {} as ServerResponse, next);
			expect(next).toHaveBeenCalledWith();
		});

		it('should forward middleware errors to next', async ({onTestFinished}) => {
			expect.assertions(1);
			const plugin = backendProxyPlugin({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					return {type: 'html', content: '', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (): Record<string, never> => ({}),
				},
			});

			const failure = new Error('middleware failure');
			const handleRequestSpy = vi.spyOn(BackendProxy.prototype, 'handleRequest').mockRejectedValueOnce(failure);
			onTestFinished(() => {
				handleRequestSpy.mockRestore();
			});

			const middleware = await captureMiddleware(plugin);
			const next = vi.fn<(error?: Error) => void>();
			middleware({url: '/boom'} as IncomingMessage, {} as ServerResponse, next);
			await Promise.resolve();

			expect(next).toHaveBeenCalledWith(failure);
		});
	});

	describe('backend proxy uncovered branches', () => {
		it('should handle log levels and message filtering', () => {
			expect.assertions(3);
			const logs: string[] = [];
			const logSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
				logs.push(msg);
			});
			const errorSpy = vi.spyOn(console, 'error').mockImplementation((msg: string) => {
				logs.push(msg);
			});

			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					return {type: 'html', content: '', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (): Record<string, never> => ({}),
				},
				debug: 'info',
			});

			proxy.log('error', 'error msg');
			proxy.log('info', 'info msg');
			proxy.log('debug', 'debug msg');

			expect(logs).toContainEqual(expect.stringMatching(/ERROR.*error msg/u));
			expect(logs).toContainEqual(expect.stringMatching(/INFO.*info msg/u));
			expect(logs).not.toContainEqual(expect.stringContaining('DEBUG'));

			logSpy.mockRestore();
			errorSpy.mockRestore();
		});

		it('should handle log with empty message', () => {
			expect.assertions(1);
			const logs: string[] = [];
			const consoleSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
				logs.push(msg);
			});

			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					return {type: 'html', content: '', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (): Record<string, never> => ({}),
				},
				debug: 'debug',
			});

			proxy.log('debug', '');
			expect(logs).toContain('');

			consoleSpy.mockRestore();
		});

		it('should throw on invalid log levels', () => {
			expect.assertions(1);
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					return {type: 'html', content: '', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (): Record<string, never> => ({}),
				},
				debug: 'info',
			});

			expect(() => {
				proxy.log('invalid' as unknown as LoggingLevel, 'msg');
			}).toThrow('Invalid messageIndex');
		});

		it('should handle proxy errors with 500 response', async () => {
			expect.assertions(3);
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					throw new Error('Backend failed');
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (): Record<string, never> => ({}),
				},
			});

			const end = vi.fn<(...args: unknown[]) => unknown>();
			const res = {
				statusCode: 0,
				setHeader: vi.fn<(...args: unknown[]) => unknown>(),
				end,
			} as unknown as ServerResponse;

			const handled = await proxy.handleRequest('/fail', {method: 'GET'} as IncomingMessage, res, {} as ViteDevServer);

			expect(handled).toBe(true);
			expect(res.statusCode).toBe(500);
			expect(end).toHaveBeenCalledWith(expect.stringContaining('Backend failed'));
		});

		it('should handle POST request with body', async () => {
			expect.assertions(1);
			let receivedBody: Buffer | undefined;
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async ({body}): Promise<BackendResult> => {
					receivedBody = body;
					await Promise.resolve();
					return {type: 'html', content: 'ok', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string): Record<string, never> => ({}),
				},
			});

			const req = Readable.from([Buffer.from('he'), 'llo']) as unknown as IncomingMessage;
			req.method = 'POST';
			req.url = '/post';
			req.headers = {};

			const end = vi.fn<(...args: unknown[]) => unknown>();
			const res = {
				statusCode: 0,
				setHeader: vi.fn<(...args: unknown[]) => unknown>(),
				end,
			} as unknown as ServerResponse;

			const serverMock = {
				transformIndexHtml: async (_url: string, html: string) => {
					await Promise.resolve();
					return html;
				},
			} as unknown as ViteDevServer;

			await proxy.handleRequest('/post', req, res, serverMock);
			assert.ok(receivedBody !== undefined, 'Expected a forwarded POST body');
			expect(receivedBody.toString()).toBe('hello');
		});

		it.each([
			['/old-prefix/path', '/new-prefix/path'],
			['/other/stuff', '/replacement/stuff'],
			['/no-match/path', '/no-match/path'],
		])('should handle URL rewrite for %s', async (requestUrl, expectedUrl) => {
			expect.assertions(3);
			let handledUrl = '';
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async ({url}): Promise<BackendResult> => {
					handledUrl = url;
					await Promise.resolve();
					return {type: 'html', content: 'ok', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (): Record<string, never> => ({}),
				},
				rewrites: {
					'/old-prefix/': '/new-prefix/',
					'/other/': '/replacement/',
				},
				debug: 'debug',
			});

			const req = {method: 'GET', url: requestUrl} as IncomingMessage;
			const end = vi.fn<(...args: unknown[]) => unknown>();
			const res = {
				statusCode: 0,
				setHeader: vi.fn<(...args: unknown[]) => unknown>(),
				end,
			} as unknown as ServerResponse;

			const handled = await proxy.handleRequest(requestUrl, req, res, {
				transformIndexHtml: async (_url: string, html: string) => {
					await Promise.resolve();
					return html;
				},
			} as ViteDevServer);
			expect(handled).toBe(true);
			expect(handledUrl).toBe(expectedUrl);
			expect(req.url).toBe(expectedUrl);
		});

		it('should inject assets after <body> if </head> is missing', () => {
			expect.assertions(3);
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					return {type: 'html', content: 'ok', module: null};
				},
				assetConfig: {
					globalEntryPoints: {js: '/global.js', css: ''},
					getModuleEntryPoints: (_module: string): {js: string; css: string} => ({js: '', css: ''}),
				},
			});

			const html = '<html><body><h1>No Head</h1></body></html>';
			const proxyWithInjectAssets = proxy as unknown as {
				injectAssets: (htmlInput: string, module: string | null) => string;
			};
			const result = proxyWithInjectAssets.injectAssets(html, null);
			expect(result).toContain('<body>\n<script type="module" src="/@vite/client"></script>');
			expect(result).toContain('<script type="module" src="/global.js"></script>');
			expect(result).not.toContain('</head>');
		});

		it('should bypass requests when configured', async () => {
			expect.assertions(1);
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (url: string): boolean => url === '/bypass-me',
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					return {type: 'html', content: 'ok', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string): Record<string, never> => ({}),
				},
				debug: 'debug',
			});

			const res = {} as ServerResponse;
			const handled = await proxy.handleRequest('/bypass-me', {method: 'GET'} as IncomingMessage, res, {} as ViteDevServer);
			expect(handled).toBe(false);
		});

		it('should skip JS/CSS files for Vite', async () => {
			expect.assertions(3);
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (_url: string): boolean => false,
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					const res: BackendResult = {type: 'html', content: 'ok', module: null};
					return res;
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string): Record<string, never> => ({}),
				},
			});

			const res = {} as ServerResponse;
			await expect(proxy.handleRequest('/script.js', {method: 'GET'} as IncomingMessage, res, {} as ViteDevServer)).resolves.toBe(false);
			await expect(proxy.handleRequest('/style.css', {method: 'GET'} as IncomingMessage, res, {} as ViteDevServer)).resolves.toBe(false);
			await expect(proxy.handleRequest('/style.css?v=1', {method: 'GET'} as IncomingMessage, res, {} as ViteDevServer)).resolves.toBe(false);
		});

		it('should throw on unhandled result type', async () => {
			expect.assertions(1);
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					return {type: 'html', content: '', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string): Record<string, never> => ({}),
				},
			});

			const res = {
				setHeader: vi.fn<(...args: unknown[]) => unknown>(),
			} as unknown;
			const server = {} as unknown;

			const proxyWithProcessResult = proxy as unknown as {
				processResult: (result: {type: 'invalid'}, url: string, response: unknown, viteServer: unknown) => Promise<boolean>;
			};
			await expect(proxyWithProcessResult.processResult({type: 'invalid'}, '/', res, server)).rejects.toThrow('Unhandled result type');
		});

		it('should throw on invalid config debug level', () => {
			expect.assertions(1);
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					return {type: 'html', content: '', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string): Record<string, never> => ({}),
				},
				debug: 'invalid' as LoggingLevel,
			});

			expect(() => {
				proxy.log('info', 'msg');
			}).toThrow('Invalid configLevel');
		});

		it('should handle request error during body reading', async () => {
			expect.assertions(2);
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (): boolean => false,
				backendHandler: async (): Promise<BackendResult> => {
					await Promise.resolve();
					return {type: 'html', content: 'ok', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string): Record<string, never> => ({}),
				},
			});

			const req = new Readable({
				read(): void {
					this.destroy(new Error('Read error'));
				},
			}) as unknown as IncomingMessage;
			req.method = 'POST';
			req.url = '/post';
			req.headers = {};

			const end = vi.fn<(...args: unknown[]) => unknown>();
			const res = {
				statusCode: 0,
				setHeader: vi.fn<(...args: unknown[]) => unknown>(),
				end,
			} as unknown as ServerResponse;

			await proxy.handleRequest('/post', req, res, {} as ViteDevServer);
			expect(res.statusCode).toBe(500);
			expect(end).toHaveBeenCalledWith(expect.stringContaining('Read error'));
		});

		it('should use transformBackendUrl in createFetchBackendHandler', async () => {
			expect.assertions(1);
			const handler = createFetchBackendHandler({
				transformBackendUrl: (url: string, base: string): string => `${base}/custom${url}`,
			});
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({
					'content-type': 'text/plain',
				}),
				arrayBuffer: async () => {
					await Promise.resolve();
					return new ArrayBuffer(0);
				},
			} as unknown as Response);

			await handler({
				url: '/api',
				method: 'GET',
				headers: {},
				body: undefined,
				req: {headers: {}} as IncomingMessage,
				backendBaseUrl: 'http://localhost',
				logger: (_level: string, _message: string, _data?: unknown) => {
					/* empty */
				},
			});

			expect(fetchSpy).toHaveBeenCalledWith('http://localhost/custom/api', expect.anything());
			fetchSpy.mockRestore();
		});

		it('should not extract module if response is not ok', async () => {
			expect.assertions(2);
			const extractModule = vi.fn<(url: string, html: string, headers: Headers) => string | null>();
			const handler = createFetchBackendHandler({extractModule});
			vi.spyOn(globalThis, 'fetch').mockResolvedValue({
				status: 404,
				ok: false,
				headers: new Headers({
					'content-type': 'text/html',
				}),
				text: async () => {
					await Promise.resolve();
					return 'not found';
				},
			} as unknown as Response);

			const result = await handler({
				url: '/404',
				method: 'GET',
				headers: {},
				body: undefined,
				req: {headers: {}} as IncomingMessage,
				backendBaseUrl: 'http://localhost',
				logger: (_level: string, _message: string, _data?: unknown) => {
					/* empty */
				},
			});

			expect(result).toMatchObject({type: 'html', module: null});
			expect(extractModule).not.toHaveBeenCalled();
			vi.restoreAllMocks();
		});
	});

	describe('path-utils uncovered branches', () => {
		it('should join URL parts correctly', () => {
			expect.assertions(1);
			expect(joinUrlParts('http://localhost/', '/path')).toBe('http://localhost/path');
		});

		it('should handle stripTrailingSlash with multiple slashes', () => {
			expect.assertions(1);
			expect(stripTrailingSlash('/path///')).toBe('/path');
		});

		it('should handle stripLeadingSlash with multiple slashes', () => {
			expect.assertions(1);
			expect(stripLeadingSlash('///path')).toBe('path');
		});

		it('should handle normalizeRedirectLocation with absolute URL on same host', () => {
			expect.assertions(1);
			expect(normalizeRedirectLocation('http://localhost/new-path', '/base/')).toBe('/new-path');
		});

		it('should handle normalizeRedirectLocation with absolute URL and query/hash', () => {
			expect.assertions(1);
			expect(normalizeRedirectLocation('https://example.com/path?q=1#hash', '/')).toBe('/path?q=1#hash');
		});
	});

	describe('createFetchBackendHandler uncovered branches', () => {
		it('should handle POST request with body in createFetchBackendHandler', async () => {
			expect.assertions(2);
			const handler = createFetchBackendHandler({});
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({
					'content-type': 'text/plain',
				}),
				arrayBuffer: async () => {
					await Promise.resolve();
					return new ArrayBuffer(0);
				},
			} as unknown as Response);

			const body = Buffer.from('post body');
			await handler({
				url: '/api',
				method: 'POST',
				headers: {},
				body,
				req: {headers: {}} as IncomingMessage,
				backendBaseUrl: 'http://localhost',
				logger: (_level: string, _message: string, _data?: unknown) => {
					/* empty */
				},
			});

			const call = fetchSpy.mock.lastCall;
			assert.ok(call !== undefined, 'Expected a fetch call');
			const [, requestOptions] = call;
			assert.ok(requestOptions !== undefined, 'Expected fetch request options');
			expect(requestOptions.method).toBe('POST');
			expect(requestOptions.body).toBe(body);

			fetchSpy.mockRestore();
		});

		it('should reject a redirect with an empty location', async ({onTestFinished}) => {
			expect.assertions(1);
			const handler = createFetchBackendHandler({});
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {status: 302, headers: {location: ''}}));
			onTestFinished(() => {
				fetchSpy.mockRestore();
			});

			await expect(
				handler({
					url: '/redirect',
					method: 'GET',
					headers: {},
					body: undefined,
					req: {headers: {}} as IncomingMessage,
					backendBaseUrl: 'http://localhost',
					logger: (_level: string, _message: string, _data?: unknown) => {
						/* empty */
					},
				}),
			).rejects.toThrow('Redirect 302 missing Location header');
		});

		it('should handle append headers in createFetchBackendHandler', async () => {
			expect.assertions(1);
			const handler = createFetchBackendHandler({});
			const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({
					'content-type': 'text/plain',
				}),
				arrayBuffer: async () => {
					await Promise.resolve();
					return new ArrayBuffer(0);
				},
			} as unknown as Response);

			await handler({
				url: '/api',
				method: 'GET',
				headers: {
					'x-multi': ['a', 'b'],
				},
				body: undefined,
				req: {headers: {}} as IncomingMessage,
				backendBaseUrl: 'http://localhost',
				logger: (_level: string, _message: string, _data?: unknown) => {
					/* empty */
				},
			});

			const call = fetchSpy.mock.lastCall;
			assert.ok(call !== undefined, 'Expected a fetch call');
			const [, requestOptions] = call;
			assert.ok(requestOptions !== undefined, 'Expected fetch request options');
			assert.ok(requestOptions.headers instanceof Headers, 'Expected fetch request headers');
			expect(requestOptions.headers.get('x-multi')).toBe('a, b');

			fetchSpy.mockRestore();
		});
	});
});
