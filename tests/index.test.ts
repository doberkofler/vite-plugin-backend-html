import {EventEmitter} from 'node:events';
import {describe, it, expect, beforeAll, afterAll, vitest} from 'vitest';
import {createServer} from 'vite';
import type {ViteDevServer} from 'vite';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {Readable} from 'node:stream';
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
} from '../src/index.js';
import {MockBackendServer} from './backend_server.ts';
import {BackendProxy} from '../src/backend-proxy.ts';

describe('backendProxyPlugin', () => {
	const backendPort = 3005;
	const backendServer = new MockBackendServer(backendPort);
	let viteServer: ViteDevServer;
	const vitePort = 3006;

	beforeAll(async () => {
		// Open Backend Server
		await backendServer.open();

		// Vite Server with Plugin
		viteServer = await createServer({
			root: process.cwd(),
			server: {
				port: vitePort,
				hmr: false,
			},
			plugins: [
				backendProxyPlugin({
					backendBaseUrl: `http://localhost:${backendPort}`,
					backendHandler: async ({url}): Promise<BackendResult> => {
						const res = await fetch(`http://localhost:${backendPort}${url}`, {redirect: 'manual'});
						const status = res.status;
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
					bypass: () => {
						return false;
					},
					debug: 'debug',
				}),
			],
		});

		await viteServer.listen();
	});

	afterAll(async () => {
		await viteServer.close();

		// Close Backend Server
		await backendServer.close();
	});

	it('should allow Vite to handle internal resources', async () => {
		const response = await fetch(`http://localhost:${vitePort}/@vite/client`);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain('vite');
	});

	it('should proxy HTML requests and inject assets', async () => {
		const response = await fetch(`http://localhost:${vitePort}/page`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');

		const html = await response.text();
		expect(html).toContain('<h1>Backend Page</h1>');

		// Verify backend assets are REMOVED
		expect(html).not.toContain('/assets/main-prod.css');
		expect(html).not.toContain('/assets/main-prod.js');

		// Check injected assets
		expect(html).toContain('<script type="module" src="/@vite/client"></script>');
		expect(html).toContain('<link rel="stylesheet" href="/src/style.css">');
		expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
		expect(html).toContain('<link rel="stylesheet" href="/src/test-module.css">');
		expect(html).toContain('<script type="module" src="/src/test-module.ts"></script>');
	});

	it('should forward non-HTML backend responses (e.g., JSON API)', async () => {
		const response = await fetch(`http://localhost:${vitePort}/api/data`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/json');

		const json = (await response.json()) as {data: string};
		expect(json).toEqual({data: 'backend-data'});
	});

	it('should handle backend errors gracefully', async () => {
		const response = await fetch(`http://localhost:${vitePort}/not-found`);
		// backendHandler will fetch and get 404, then return binary with 404
		expect(response.status).toBe(404);
	});

	it('should convert /production-page and remove /q/p/ assets', async () => {
		const response = await fetch(`http://localhost:${vitePort}/production-page`);
		expect(response.status).toBe(200);
		const html = await response.text();

		// Verify production assets are REMOVED
		expect(html).not.toContain('/q/p/lj_unittest/globals_260200.css');
		expect(html).not.toContain('/q/p/lj_unittest/globals_260200.js');
		expect(html).not.toContain('/q/p/lj_unittest/las_mod_dashboard_260200.css');
		expect(html).not.toContain('/q/p/lj_unittest/las_mod_dashboard_260200.js');

		// Check injected assets
		expect(html).toContain('<script type="module" src="/@vite/client"></script>');
		expect(html).toContain('<link rel="stylesheet" href="/src/style.css">');
		expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
	});

	describe('helpers', () => {
		it('extractModuleFromMeta should extract module from meta tag', () => {
			const html = '<html><head><meta name="vite-module" content="my-module"></head></html>';
			expect(extractModuleFromMeta(html)).toBe('my-module');
			expect(extractModuleFromMeta(html, 'other-name')).toBeNull();
			expect(extractModuleFromMeta(html, 'vite-module')).toBe('my-module');
		});

		it('extractModuleFromUrl should extract module from URL', () => {
			const url = '/app/admin/dashboard';
			const pattern = /^\/app\/([^/]+)/;
			expect(extractModuleFromUrl(url, pattern)).toBe('admin');
			expect(extractModuleFromUrl('/other', pattern)).toBeNull();
		});
	});

	describe('dynamic asset injection', () => {
		it('should inject assets using createFetchBackendHandler and meta tag', async () => {
			const handler = createFetchBackendHandler({
				extractModule: async (_url: string, html: string) => {
					await Promise.resolve();
					const mod = extractModuleFromMeta(html);
					if (mod === 'never') {
						await Promise.resolve();
					}
					return mod;
				},
			});

			const dynamicViteServer = await createServer({
				root: process.cwd(),
				server: {port: 3007, hmr: false},
				plugins: [
					backendProxyPlugin({
						backendBaseUrl: `http://localhost:${backendPort}`,
						backendHandler: handler,
						assetConfig: {
							globalEntryPoints: {js: '/src/main.ts', css: '/src/style.css'},
							getModuleEntryPoints: (module) => ({
								js: `/src/${module}.ts`,
								css: `/src/${module}.css`,
							}),
						},
						bypass: () => {
							return false;
						},
					}),
				],
			});
			await dynamicViteServer.listen();

			try {
				const response = await fetch('http://localhost:3007/dynamic-page');
				const html = await response.text();

				expect(html).toContain('<script type="module" src="/@vite/client"></script>');
				expect(html).toContain('<link rel="stylesheet" href="/src/style.css">');
				expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
				expect(html).toContain('<link rel="stylesheet" href="/src/dynamic-module.css">');
				expect(html).toContain('<script type="module" src="/src/dynamic-module.ts"></script>');
				expect(html).toContain('<h1>Dynamic Page</h1>');
			} finally {
				await dynamicViteServer.close();
			}
		});

		it('should handle binary response using createFetchBackendHandler in plugin', async () => {
			const handler = createFetchBackendHandler({});
			const streamingViteServer = await createServer({
				root: process.cwd(),
				server: {port: 3008, hmr: false},
				plugins: [
					backendProxyPlugin({
						backendBaseUrl: `http://localhost:${backendPort}`,
						backendHandler: handler,
						assetConfig: {
							globalEntryPoints: {},
							getModuleEntryPoints: () => ({}),
						},
						bypass: () => {
							return false;
						},
					}),
				],
			});
			await streamingViteServer.listen();

			try {
				const response = await fetch('http://localhost:3008/api/data');
				expect(response.status).toBe(200);
				expect(response.headers.get('content-type')).toBe('application/json');
				const json = (await response.json()) as Record<string, unknown>;
				expect(json).toEqual({data: 'backend-data'});
			} finally {
				await streamingViteServer.close();
			}
		});

		it('should prepend assets if no head or body tags exist', async () => {
			const response = await fetch(`http://localhost:${vitePort}/fragment-page`);
			const html = await response.text();

			expect(html).toContain('<script type="module" src="/src/main.ts"></script>');
			expect(html).toContain('<h1>Fragment Page</h1>');
			// Since /fragment-page doesn't have head/body, it prepends.
			expect(html).toContain('<script type="module" src="/src/test-module.ts"></script>');
		});

		it('should handle binary response in createFetchBackendHandler', async () => {
			const handler = createFetchBackendHandler({});
			const result = await handler({
				url: '/api/data',
				method: 'GET',
				headers: {},
				body: undefined,
				req: {headers: {}} as IncomingMessage,
				backendBaseUrl: `http://localhost:${backendPort}`,
				logger: (_level: string, _message: string, _data?: unknown) => {
					/* empty */
				},
			});

			expect(result.type).toBe('binary');
			if (result.type !== 'binary') {
				throw new Error('Expected binary result');
			}

			expect(result.contentType).toBe('application/json');
			expect(JSON.parse(result.content.toString())).toEqual({data: 'backend-data'});
		});

		it('should forward and receive cookies using createFetchBackendHandler', async () => {
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
				backendBaseUrl: `http://localhost:${backendPort}`,
				logger: (_level: string, _message: string, _data?: unknown) => {
					/* empty */
				},
			});

			// Verify response headers (Set-Cookie)
			expect(result.headers).toBeDefined();
			const headers = result.headers ?? {};
			const setCookie = headers['set-cookie'] ?? [];
			expect(setCookie).toContain('session=12345; HttpOnly');
			expect(setCookie).toContain('theme=dark');

			// Verify received cookie by backend
			if (result.type !== 'binary') {
				throw new Error('Expected binary result');
			}
			const json = JSON.parse(result.content.toString()) as Record<string, unknown>;
			expect(json.receivedCookie).toBe('user=test-user');
		});

		it('should handle redirects in createFetchBackendHandler', async () => {
			const handler = createFetchBackendHandler({});
			const result = await handler({
				url: '/redirect-me',
				method: 'GET',
				headers: {},
				body: undefined,
				req: {headers: {}} as IncomingMessage,
				backendBaseUrl: `http://localhost:${backendPort}`,
				logger: (_level: string, _message: string, _data?: unknown) => {
					/* empty */
				},
			});

			expect(result.type).toBe('redirect');
			if (result.type !== 'redirect') {
				throw new Error('Expected redirect result');
			}

			expect(result.status).toBe(302);
			expect(result.location).toBe('/page');
			const headers = result.headers ?? {};
			const setCookie = headers['set-cookie'] ?? [];
			expect(setCookie).toContain('redirect-cookie=active');
		});

		it('should propagate redirects through the plugin', async () => {
			const response = await fetch(`http://localhost:${vitePort}/redirect-me`, {
				redirect: 'manual',
			});

			const status = response.status;
			const location = response.headers.get('location') ?? '';
			const setCookie = response.headers.get('set-cookie') ?? '';
			await (async () => {
				const s = await Promise.resolve(status);
				if (s === 0) {
					await Promise.resolve();
				}
				return s;
			})();
			expect(status).toBe(302);
			expect(location).toBe('/page');
			expect(setCookie).toContain('redirect-cookie=active');
		});
	});

	describe('backendProxyPlugin uncovered branches', () => {
		it('should call next if req.url is missing', () => {
			const plugin = backendProxyPlugin({
				backendBaseUrl: 'http://localhost',
				bypass: () => {
					return false;
				},
				backendHandler: () => {
					const res: BackendResult = {type: 'html', content: '', module: null};
					return Promise.resolve(res);
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: () => {
						return {};
					},
				},
			});

			const server = {
				middlewares: {
					use: vitest.fn().mockImplementation((fn: (req: {url: string | undefined}, res: unknown, next: () => void) => void) => {
						const req = {url: undefined};
						const res = {};
						const next = vitest.fn();
						fn(req, res, next);
						expect(next).toHaveBeenCalled();
					}),
				},
			} as any;

			if (typeof plugin.configureServer === 'function') {
				const configureServer = plugin.configureServer as (server: ViteDevServer) => void;
				configureServer(server);
			}
		});
	});

	describe('BackendProxy uncovered branches', () => {
		it('should handle log levels and message filtering', () => {
			const logs: string[] = [];
			const logSpy = vitest.spyOn(console, 'log').mockImplementation((msg: string) => {
				logs.push(msg);
			});
			const errorSpy = vitest.spyOn(console, 'error').mockImplementation((msg: string) => {
				logs.push(msg);
			});

			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: () => {
					return false;
				},
				backendHandler: async () => {
					await Promise.resolve();
					return {type: 'html', content: '', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: () => {
						return {};
					},
				},
				debug: 'info',
			});

			proxy.log('error', 'error msg');
			proxy.log('info', 'info msg');
			proxy.log('debug', 'debug msg');

			expect(logs.some((l) => l.includes('ERROR') && l.includes('error msg'))).toBe(true);
			expect(logs.some((l) => l.includes('INFO') && l.includes('info msg'))).toBe(true);
			expect(logs.some((l) => l.includes('DEBUG'))).toBe(false);

			logSpy.mockRestore();
			errorSpy.mockRestore();
		});

		it('should handle log with empty message', () => {
			const logs: string[] = [];
			const consoleSpy = vitest.spyOn(console, 'log').mockImplementation((msg: string) => {
				logs.push(msg);
			});

			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: () => {
					return false;
				},
				backendHandler: async () => {
					await Promise.resolve();
					return {type: 'html', content: '', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: () => {
						return {};
					},
				},
				debug: 'debug',
			});

			proxy.log('debug', '');
			expect(logs).toContain('');

			consoleSpy.mockRestore();
		});

		it('should throw on invalid log levels', () => {
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: () => {
					return false;
				},
				backendHandler: async () => {
					await Promise.resolve();
					return {type: 'html', content: '', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: () => {
						return {};
					},
				},
				debug: 'info',
			});

			expect(() => {
				proxy.log('invalid' as any, 'msg');
			}).toThrow('Invalid messageIndex');
		});

		it('should handle proxy errors with 500 response', async () => {
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: () => {
					return false;
				},
				backendHandler: async () => {
					await Promise.resolve();
					throw new Error('Backend failed');
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: () => {
						return {};
					},
				},
			});

			const res = {
				statusCode: 0,
				setHeader: vitest.fn(),
				end: vitest.fn(),
			} as unknown as ServerResponse;

			const handled = await proxy.handleRequest('/fail', {method: 'GET'} as IncomingMessage, res, {} as ViteDevServer);

			expect(handled).toBe(true);
			expect(res.statusCode).toBe(500);
			expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Backend failed'));
		});

		it('should handle POST request with body', async () => {
			let receivedBody: Buffer | undefined;
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: () => {
					return false;
				},
				backendHandler: ({body}) => {
					receivedBody = body;
					return Promise.resolve({type: 'html', content: 'ok', module: null});
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string) => {
						return {};
					},
				},
			});

			const req = new EventEmitter() as unknown as IncomingMessage & EventEmitter; // eslint-disable-line unicorn/prefer-event-target
			(req as any).method = 'POST';
			(req as any).url = '/post';
			(req as any).headers = {};

			const res = {
				statusCode: 0,
				setHeader: vitest.fn(),
				end: vitest.fn(),
			} as unknown as ServerResponse;

			const serverMock = {
				transformIndexHtml: async (_url: string, html: string) => {
					await Promise.resolve();
					return html;
				},
			} as unknown as ViteDevServer;

			const handlePromise = proxy.handleRequest('/post', req, res, serverMock);

			req.emit('data', Buffer.from('hello'));
			req.emit('end');

			await handlePromise;
			expect(receivedBody?.toString()).toBe('hello');
		});

		it('should apply URL rewrites', async () => {
			let handledUrl = '';
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: () => {
					return false;
				},
				backendHandler: ({url}) => {
					handledUrl = url;
					return Promise.resolve({type: 'html', content: 'ok', module: null});
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: () => {
						return {};
					},
				},
				rewrites: {
					'/old-prefix/': '/new-prefix/',
					'/other/': '/replacement/',
				},
				debug: 'debug',
			});

			const req = {method: 'GET', url: '/old-prefix/path'} as IncomingMessage;
			const res = {
				statusCode: 0,
				setHeader: vitest.fn(),
				end: vitest.fn(),
			} as unknown as ServerResponse;

			// Match first rewrite
			const handled1 = await proxy.handleRequest('/old-prefix/path', req, res, {
				transformIndexHtml: async (_url: string, html: string) => {
					await Promise.resolve();
					return html;
				},
			} as ViteDevServer);

			expect(handled1).toBe(true);
			expect(handledUrl).toBe('/new-prefix/path');
			expect(req.url).toBe('/new-prefix/path');

			// Match second rewrite
			const handled2 = await proxy.handleRequest('/other/stuff', req, res, {
				transformIndexHtml: async (_url: string, html: string) => {
					await Promise.resolve();
					return html;
				},
			} as ViteDevServer);
			expect(handled2).toBe(true);
			expect(handledUrl).toBe('/replacement/stuff');

			// No match
			const handled3 = await proxy.handleRequest('/no-match/path', req, res, {
				transformIndexHtml: async (_url: string, html: string) => {
					await Promise.resolve();
					return html;
				},
			} as ViteDevServer);
			expect(handled3).toBe(true);
			expect(handledUrl).toBe('/no-match/path');
		});

		it('should inject assets after <body> if </head> is missing', () => {
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: () => {
					return false;
				},
				backendHandler: async () => {
					await Promise.resolve();
					return {type: 'html', content: 'ok', module: null};
				},
				assetConfig: {
					globalEntryPoints: {js: '/global.js', css: ''},
					getModuleEntryPoints: (_module: string) => {
						return {js: '', css: ''};
					},
				},
			});

			const html = '<html><body><h1>No Head</h1></body></html>';
			const result = (proxy as any).injectAssets(html, null);
			expect(result).toContain('<body>\n<script type="module" src="/@vite/client"></script>');
			expect(result).toContain('<script type="module" src="/global.js"></script>');
			expect(result).not.toContain('</head>');
		});

		it('should bypass requests when configured', async () => {
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (url: string) => {
					return url === '/bypass-me';
				},
				backendHandler: async () => {
					await Promise.resolve();
					const result: BackendResult = {type: 'html', content: 'ok', module: null};
					if (result.type === ('' as any)) {
						await Promise.resolve();
					}
					return result;
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string) => {
						return {};
					},
				},
				debug: 'debug',
			});

			const res = {} as ServerResponse;
			const handled = await proxy.handleRequest('/bypass-me', {method: 'GET'} as IncomingMessage, res, {} as ViteDevServer);
			expect(handled).toBe(false);
		});

		it('should skip JS/CSS files for Vite', async () => {
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: (_url: string) => {
					return false;
				},
				backendHandler: async () => {
					await Promise.resolve();
					const res: BackendResult = {type: 'html', content: 'ok', module: null};
					return res;
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string) => {
						return {};
					},
				},
			});

			const res = {} as ServerResponse;
			expect(await proxy.handleRequest('/script.js', {method: 'GET'} as IncomingMessage, res, {} as ViteDevServer)).toBe(false);
			expect(await proxy.handleRequest('/style.css', {method: 'GET'} as IncomingMessage, res, {} as ViteDevServer)).toBe(false);
			expect(await proxy.handleRequest('/style.css?v=1', {method: 'GET'} as IncomingMessage, res, {} as ViteDevServer)).toBe(false);
		});

		it('should throw on unhandled result type', async () => {
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: () => {
					return false;
				},
				backendHandler: async () => {
					await Promise.resolve();
					return {type: 'invalid'} as any;
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string) => {
						return {};
					},
				},
			});

			const res = {
				setHeader: vitest.fn(),
			} as any;
			const server = {} as any;

			await expect((proxy as any).processResult({type: 'invalid'} as any, '/', res, server)).rejects.toThrow('Unhandled result type');
		});

		it('should throw on invalid config debug level', () => {
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: () => {
					return false;
				},
				backendHandler: async () => {
					await Promise.resolve();
					return {type: 'html', content: '', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string) => {
						return {};
					},
				},
				debug: 'invalid' as any,
			});

			expect(() => {
				proxy.log('info', 'msg');
			}).toThrow('Invalid configLevel');
		});

		it('should handle request error during body reading', async () => {
			const proxy = new BackendProxy({
				backendBaseUrl: 'http://localhost',
				bypass: () => {
					return false;
				},
				backendHandler: async () => {
					await Promise.resolve();
					return {type: 'html', content: 'ok', module: null};
				},
				assetConfig: {
					globalEntryPoints: {},
					getModuleEntryPoints: (_module: string) => {
						return {};
					},
				},
			});

			const req = new EventEmitter() as unknown as IncomingMessage & EventEmitter; // eslint-disable-line unicorn/prefer-event-target
			(req as any).method = 'POST';
			(req as any).url = '/post';
			(req as any).headers = {};

			const res = {
				statusCode: 0,
				setHeader: vitest.fn(),
				end: vitest.fn(),
			} as unknown as ServerResponse;

			const handlePromise = proxy.handleRequest('/post', req, res, {} as ViteDevServer);

			req.emit('error', new Error('Read error'));

			await handlePromise;
			expect(res.statusCode).toBe(500);
			expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Read error'));
		});

		it('should use transformBackendUrl in createFetchBackendHandler', async () => {
			const handler = createFetchBackendHandler({
				transformBackendUrl: (url: string, base: string) => {
					return `${base}/custom${url}`;
				},
			});
			const fetchSpy = vitest.spyOn(globalThis, 'fetch').mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({
					'content-type': 'text/plain',
				}),
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
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
			const extractModule = vitest.fn();
			const handler = createFetchBackendHandler({extractModule});
			vitest.spyOn(globalThis, 'fetch').mockResolvedValue({
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

			expect(result.type).toBe('html');
			expect(result.type === 'html' ? result.module : undefined).toBeNull();
			expect(extractModule).not.toHaveBeenCalled();
			vitest.restoreAllMocks();
		});
	});

	describe('path-utils uncovered branches', () => {
		it('should join URL parts correctly', () => {
			expect(joinUrlParts('http://localhost/', '/path')).toBe('http://localhost/path');
		});

		it('should handle stripTrailingSlash with multiple slashes', () => {
			expect(stripTrailingSlash('/path///')).toBe('/path');
		});

		it('should handle stripLeadingSlash with multiple slashes', () => {
			expect(stripLeadingSlash('///path')).toBe('path');
		});

		it('should handle normalizeRedirectLocation with absolute URL on same host', () => {
			expect(normalizeRedirectLocation('http://localhost/new-path', '/base/')).toBe('/new-path');
		});

		it('should handle normalizeRedirectLocation with absolute URL and query/hash', () => {
			expect(normalizeRedirectLocation('https://example.com/path?q=1#hash', '/')).toBe('/path?q=1#hash');
		});
	});

	describe('createFetchBackendHandler uncovered branches', () => {
		it('should handle POST request with body in createFetchBackendHandler', async () => {
			const handler = createFetchBackendHandler({});
			const fetchSpy = vitest.spyOn(globalThis, 'fetch').mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({
					'content-type': 'text/plain',
				}),
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
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

			const lastCallInit = fetchSpy.mock.calls[0][1];
			expect(lastCallInit?.method).toBe('POST');
			expect(lastCallInit?.body).toBe(body);

			fetchSpy.mockRestore();
		});

		it('should handle fetch errors and missing location in redirect', async () => {
			const handler = createFetchBackendHandler({});

			// Mock global fetch to return 302 without location
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vitest.fn().mockResolvedValue({
				status: 302,
				headers: new Headers({
					location: '',
				}),
				getSetCookie: () => [],
			} as unknown as Response);

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

			globalThis.fetch = originalFetch;
		});

		it('should handle append headers in createFetchBackendHandler', async () => {
			const handler = createFetchBackendHandler({});
			const fetchSpy = vitest.spyOn(globalThis, 'fetch').mockResolvedValue({
				status: 200,
				ok: true,
				headers: new Headers({
					'content-type': 'text/plain',
				}),
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
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

			const lastCallInit = fetchSpy.mock.calls[0][1];
			const lastCallHeaders = lastCallInit?.headers as Headers;
			expect(lastCallHeaders.get('x-multi')).toBe('a, b');

			fetchSpy.mockRestore();
		});
	});
});
