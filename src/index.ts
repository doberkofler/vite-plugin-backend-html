import {type Plugin, type ViteDevServer} from 'vite';
import {type IncomingMessage, type ServerResponse} from 'node:http';
import {BackendProxy, type ProxyConfig} from './backend-proxy.ts';

/** @public */
export {
	type BackendHandler,
	type AssetConfig,
	type ProxyConfig,
	type BackendResult,
	type LoggingLevel,
	createFetchBackendHandler,
	extractModuleFromMeta,
	extractModuleFromUrl,
} from './backend-proxy.ts';
/** @public */
export {stripTrailingSlash, stripLeadingSlash, ensureLeadingSlash, joinUrlParts, normalizeRedirectLocation} from './path-utils.ts';

/**
 * Backend Proxy Plugin
 * @param {ProxyConfig} config - Plugin configuration
 * @returns {Plugin} Vite plugin
 */
export const backendProxyPlugin = (config: ProxyConfig): Plugin => {
	const proxy = new BackendProxy(config);

	const handleRequest = async (url: string, req: IncomingMessage, res: ServerResponse, server: ViteDevServer, next: (error?: Error) => void): Promise<void> => {
		try {
			const handled = await proxy.handleRequest(url, req, res, server);
			if (!handled) {
				next();
			}
		} catch (error) {
			next(error instanceof Error ? error : new Error(String(error)));
		}
	};

	return {
		name: 'backend-proxy-plugin',

		configureServer(server: ViteDevServer): void {
			proxy.log('info', 'Plugin vite-plugin-backend-htmlconfigured', {
				backendBaseUrl: config.backendBaseUrl,
			});

			server.middlewares.use((req, res, next): void => {
				const {url} = req;
				if (typeof url !== 'string') {
					next();
					return;
				}

				// eslint-disable-next-line typescript-eslint/no-floating-promises
				handleRequest(url, req, res, server, next);
			});
		},
	} satisfies Plugin;
};
