import {type IncomingMessage, type ServerResponse} from 'node:http';
import type {ViteDevServer} from 'vite';

import {normalizeRedirectLocation} from './path-utils.ts';

/**
 * Logging levels supported by the proxy
 * @public
 */
export type LoggingLevel = 'error' | 'info' | 'debug';

/**
 * Result from backend handler - only actual backend responses
 * @public
 */
export type BackendResult =
	| {
			/** HTML response */
			type: 'html';
			/** HTML content */
			content: string;
			/** Optional module name for asset injection */
			module: string | null;
			/** Optional headers to forward (e.g. set-cookie) */
			headers?: Record<string, string | string[]>;
	  }
	| {
			/** Binary response */
			type: 'binary';
			/** Binary content */
			content: Buffer;
			/** Content type */
			contentType: string;
			/** HTTP status code */
			status: number;
			/** Optional headers to forward (e.g. set-cookie) */
			headers?: Record<string, string | string[]>;
	  }
	| {
			/** Redirect response */
			type: 'redirect';
			/** HTTP status code */
			status: number;
			/** Redirect location */
			location: string;
			/** Optional headers to forward (e.g. set-cookie) */
			headers?: Record<string, string | string[]>;
	  };

/**
 * Request handler - only invoked for non-Vite requests
 * @public
 */
export type BackendHandler = (context: {
	/** Request URL */
	url: string;
	/** Node request object */
	req: IncomingMessage;
	/** HTTP method */
	method: string;
	/** Request headers */
	headers: Record<string, string | string[] | undefined>;
	/** Request body for POST requests */
	body: Buffer | undefined;
	/** Backend base URL */
	backendBaseUrl: string;
	/** Logging function */
	logger: (level: LoggingLevel, message: string, data?: unknown) => void;
}) => Promise<BackendResult>;

type EntryPoints = {
	js?: string;
	css?: string;
};

/**
 * Asset injection configuration
 * @public
 */
export type AssetConfig = {
	/**
	 * Global entry points (e.g. main.js, global.css)
	 */
	globalEntryPoints: EntryPoints;
	/**
	 * Get module-specific entry points
	 * @param module - Module name
	 * @returns Entry points
	 */
	getModuleEntryPoints: (module: string) => EntryPoints;
};

/**
 * Plugin configuration
 * @public
 */
export type ProxyConfig = {
	/**
	 * Backend base URL
	 */
	backendBaseUrl: string;
	/**
	 * Custom bypass function to skip proxying for specific URLs
	 * @param url - Request URL
	 * @returns True if the request should be skipped (handled by Vite), false otherwise
	 */
	bypass: (url: string) => boolean;
	/**
	 * Backend request handler
	 */
	backendHandler: BackendHandler;
	/**
	 * Asset injection configuration
	 */
	assetConfig: AssetConfig;
	/**
	 * URL path rewrites
	 * Map of URL prefix to new path prefix
	 * @example {'/legacy/path/': '/new/path/'}
	 */
	rewrites?: Record<string, string>;
	/**
	 * Enable debug logging level
	 */
	debug?: LoggingLevel;
};

/**
 * Core backend proxy logic
 * @public
 */
export class BackendProxy {
	private readonly config: ProxyConfig;

	/**
	 * Creates a new backend proxy instance
	 * @param config - Proxy configuration
	 */
	public constructor(config: ProxyConfig) {
		this.config = config;
	}

	/**
	 * Logs a debug message
	 * @param level - Log level
	 * @param message - Message to log
	 * @param data - Optional data to log
	 */
	public log(level: LoggingLevel, message: string, data?: unknown): void {
		if (!this.config.debug) {
			return;
		}

		const configLevel = this.config.debug;
		const levels = ['error', 'info', 'debug'];
		const configIndex = levels.indexOf(configLevel);
		if (configIndex === -1) {
			throw new Error(`Invalid configLevel ${configLevel}`);
		}
		const messageIndex = levels.indexOf(level);
		if (messageIndex === -1) {
			throw new Error(`Invalid messageIndex ${messageIndex}`);
		}

		if (messageIndex <= configIndex) {
			if (message.length > 0) {
				const prefix = `${nowUtcCompact()} [backend-proxy] ${level.toUpperCase().padEnd(5)} ${message}`;
				if (level === 'error') {
					console.error(prefix, data ?? '');
				} else {
					console.log(prefix, data ?? '');
				}
			} else {
				console.log('');
			}
		}
	}

	/**
	 * Handles a request from Vite and proxies it to the backend if appropriate
	 * @param url - Request URL
	 * @param req - Node request object
	 * @param res - Node response object
	 * @param server - Vite dev server
	 * @returns True if the request was handled, false otherwise
	 */
	public async handleRequest(url: string, req: IncomingMessage, res: ServerResponse, server: ViteDevServer): Promise<boolean> {
		try {
			let currentUrl = url;
			// Apply rewrites
			if (this.config.rewrites) {
				for (const [prefix, replacement] of Object.entries(this.config.rewrites)) {
					if (currentUrl.startsWith(prefix)) {
						const newUrl = currentUrl.replace(prefix, replacement);
						this.log('debug', `Rewrite URL: ${currentUrl} -> ${newUrl}`);
						currentUrl = newUrl;
						req.url = newUrl;
						break;
					}
				}
			}

			const {method, headers: reqHeaders} = req;
			if (this.shouldSkipForVite(currentUrl)) {
				this.log('debug', `Vite handles: ${currentUrl}`);
				return false;
			}

			// Read body for POST requests
			let body: Buffer | undefined;
			if (method === 'POST') {
				body = await new Promise<Buffer>((resolve, reject) => {
					const chunks: Buffer[] = [];
					req.on('data', (chunk: Buffer) => {
						chunks.push(chunk);
					});
					req.on('end', () => {
						resolve(Buffer.concat(chunks));
					});
					req.on('error', (err) => {
						reject(err);
					});
				});
			}

			const result = await this.config.backendHandler({
				url: currentUrl,
				req,
				method: method ?? 'GET',
				headers: reqHeaders,
				body,
				backendBaseUrl: this.config.backendBaseUrl,
				logger: (level: LoggingLevel, message: string, data?: unknown): void => {
					this.log(level, message, data);
				},
			});

			this.log('info', `Proxying to backend [${method ?? 'GET'}] ${currentUrl}`);

			return await this.processResult(result, currentUrl, res, server);
		} catch (error) {
			this.log('error', `Proxy error for: ${url}`, error);
			res.statusCode = 500;
			res.setHeader('content-type', 'text/plain');
			const message = error instanceof Error ? error.message : String(error);
			res.end(`Proxy error: ${message}`);
			return true;
		}
	}

	/**
	 * Processes the result and sends it to the response
	 * @param result - Result from backend handler
	 * @param url - Request URL
	 * @param res - Node response object
	 * @param server - Vite dev server
	 * @returns True if handled
	 */
	private async processResult(result: BackendResult, url: string, res: ServerResponse, server: ViteDevServer): Promise<boolean> {
		// Forward headers from backend (e.g. set-cookie)
		if (result.headers) {
			for (const [key, value] of Object.entries(result.headers)) {
				res.setHeader(key, value);
			}
		}

		switch (result.type) {
			case 'html': {
				this.log('info', `-> HTML response: length=${result.content.length}`);
				if (this.config.debug === 'debug') {
					console.log('-'.repeat(80));
					console.log(result.content);
					console.log('-'.repeat(80));
				}

				let html = this.injectAssets(result.content, result.module);
				res.statusCode = 200;
				res.setHeader('content-type', 'text/html; charset=utf-8');
				html = await server.transformIndexHtml(url, html);

				res.end(html);
				return true;
			}

			case 'binary': {
				this.log('info', `-> Binary response: status=${result.status}, contentType=${result.contentType}, length=${result.content.length}`);
				res.statusCode = result.status;
				res.setHeader('content-type', result.contentType);
				res.end(result.content);
				return true;
			}

			case 'redirect': {
				this.log('info', `-> Redirect response: status=${result.status}, location=${result.location}`);
				res.statusCode = result.status;
				res.setHeader('location', result.location);
				res.end();
				return true;
			}

			default: {
				const _exhaustive: never = result;
				throw new Error(`Unhandled result type: ${JSON.stringify(_exhaustive)}`);
			}
		}
	}

	/**
	 * Injects assets into HTML
	 * @param html - HTML content
	 * @param module - Optional module name
	 * @returns Processed HTML
	 */
	private injectAssets(html: string, module: string | null): string {
		const injection: string[] = [];

		const inject = (entryPoints: EntryPoints): void => {
			if (entryPoints.css) {
				injection.push(`<link rel="stylesheet" href="${entryPoints.css}">`);
			}
			if (entryPoints.js) {
				injection.push(`<script type="module" src="${entryPoints.js}"></script>`);
			}
		};

		const {globalEntryPoints, getModuleEntryPoints} = this.config.assetConfig;

		inject({js: '/@vite/client'});
		inject(globalEntryPoints);
		if (module) {
			inject(getModuleEntryPoints(module));
		}

		let processedHtml = html.replaceAll(/<link [^>]*href="(?:\/assets\/|\/q\/p\/)[^"]+"[^>]*>/g, '');
		processedHtml = processedHtml.replaceAll(/<script [^>]*src="(?:\/assets\/|\/q\/p\/)[^"]+"[^>]*><\/script>/g, '');

		if (processedHtml.includes('</head>')) {
			return processedHtml.replace('</head>', `${injection.join('\n')}\n</head>`);
		}

		if (processedHtml.includes('<body>')) {
			return processedHtml.replace('<body>', `<body>\n${injection.join('\n')}`);
		}

		return injection.join('\n') + processedHtml;
	}

	/**
	 * Checks if the URL should be skipped (handled by Vite)
	 * @param url - Request URL
	 * @returns True if skipped
	 */
	private shouldSkipForVite(url: string): boolean {
		if (this.config.bypass(url)) {
			return true;
		}
		if (url.startsWith('/@') || url.startsWith('/node_modules/')) {
			return true;
		}
		if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(url) || /\.css(?:\?|$)/.test(url)) {
			return true;
		}
		return false;
	}
}

/**
 * Helper: Create fetch-based backend handler
 * @param options - Handler options
 * @param options.extractModule - Optional module extraction function
 * @param options.transformBackendUrl - Optional function to transform the backend URL
 * @returns Backend handler
 * @public
 */
export function createFetchBackendHandler(options: {
	extractModule?: (url: string, html: string, headers: Headers) => string | null | Promise<string | null>;
	transformBackendUrl?: (url: string, backendBaseUrl: string) => string;
}): BackendHandler {
	return async ({url, method, headers, body, backendBaseUrl, logger}): Promise<BackendResult> => {
		const backendUrl = options.transformBackendUrl ? options.transformBackendUrl(url, backendBaseUrl) : `${backendBaseUrl}${url}`;

		logger('debug', `backendBaseUrl="${backendBaseUrl}" args.url="${url}" url="${backendUrl}"`);

		// Forward headers
		const fetchHeaders = new Headers();
		for (const [key, value] of Object.entries(headers)) {
			if (value !== undefined) {
				if (Array.isArray(value)) {
					for (const v of value) {
						fetchHeaders.append(key, v);
					}
				} else {
					fetchHeaders.set(key, value);
				}
			}
		}

		// Fetch options
		const fetchOptions: RequestInit = {
			method,
			headers: fetchHeaders,
			redirect: 'manual',
		};

		if (method === 'POST' && body !== undefined) {
			fetchOptions.body = body;
		}

		const response = await fetch(backendUrl, fetchOptions);

		logger('debug', 'fetch results', {
			ok: response.ok,
			statusText: response.statusText,
			redirected: response.redirected,
		});

		const status = response.status;
		const contentType = response.headers.get('content-type') ?? 'application/octet-stream';

		// Extract response headers (set-cookie)
		const responseHeaders: Record<string, string | string[]> = {};
		const setCookie = response.headers.getSetCookie();
		if (setCookie.length > 0) {
			logger('debug', `setCookie="${setCookie.join(', ')}"`);
			responseHeaders['set-cookie'] = setCookie;
		}

		// Handle redirects (300-399)
		if (status >= 300 && status < 400) {
			const rawLocation = response.headers.get('location');
			if (!rawLocation) {
				throw new Error(`Redirect ${status} missing Location header`);
			}

			// Extract base path from baseUrl and normalize redirect
			const baseUrlObj = new URL(backendBaseUrl);
			const location = normalizeRedirectLocation(rawLocation, baseUrlObj.pathname);
			logger('debug', `redirect="${location}"`);

			return {
				type: 'redirect',
				status,
				location,
				headers: responseHeaders,
			};
		}

		if (contentType.includes('text/html')) {
			const html = await response.text();
			let module: string | null = null;

			if (response.ok) {
				const result = options.extractModule?.(url, html, response.headers);
				module = (result instanceof Promise ? await result : result) ?? null;
			}
			logger('debug', `extracted module "${module}"`);

			return {
				type: 'html',
				content: html,
				module,
				headers: responseHeaders,
			};
		}

		return {
			type: 'binary',
			content: Buffer.from(await response.arrayBuffer()),
			contentType,
			status,
			headers: responseHeaders,
		};
	};
}

/**
 * Helper: Extract module from HTML meta tag
 * @param html - HTML content
 * @param metaName - Name of meta tag
 * @returns Extracted module or null
 * @public
 */
export function extractModuleFromMeta(html: string, metaName = 'vite-module'): string | null {
	const regex = new RegExp(`<meta name="${metaName}" content="([^"]+)">`);
	const match = regex.exec(html);
	return match?.[1] ?? null;
}

/**
 * Helper: Extract module from URL based on pattern
 * @param url - Request URL
 * @param pattern - Regex pattern with capture group
 * @returns Extracted module or null
 * @public
 */
export function extractModuleFromUrl(url: string, pattern: RegExp): string | null {
	const match = pattern.exec(url);
	return match?.[1] ?? null;
}

/**
 * Returns current date-time in format: HH24:MI:SS.MS
 * @returns Formatted timestamp.
 */
function nowUtcCompact(): string {
	const now = new Date();

	const hh = now.getUTCHours().toString().padStart(2, '0');
	const mi = now.getUTCMinutes().toString().padStart(2, '0');
	const ss = now.getUTCSeconds().toString().padStart(2, '0');
	const ms = now.getUTCMilliseconds().toString().padStart(3, '0');

	return `${hh}:${mi}:${ss}.${ms}`;
}
