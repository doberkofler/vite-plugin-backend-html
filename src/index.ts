import type {Plugin, ViteDevServer} from 'vite';
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
 * @param config - Plugin configuration
 * @returns Vite plugin
 */
export function backendProxyPlugin(config: ProxyConfig): Plugin {
	const proxy = new BackendProxy(config);

	return {
		name: 'backend-proxy-plugin',

		configureServer(server: ViteDevServer): void {
			proxy.log('info', 'Plugin vite-plugin-backend-htmlconfigured', {
				backendBaseUrl: config.backendBaseUrl,
			});

			server.middlewares.use((req, res, next) => {
				const url = req.url;
				if (!url) {
					next();
					return;
				}

				void proxy.handleRequest(url, req, res, server).then((handled) => {
					if (!handled) {
						next();
					}
				});
			});
		},
	} satisfies Plugin;
}
