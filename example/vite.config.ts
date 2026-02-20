import {defineConfig} from 'vite';
import {backendProxyPlugin, createFetchBackendHandler, extractModuleFromMeta, extractModuleFromUrl} from '../src/index.js';

export default defineConfig({
	server: {port: 5173},
	plugins: [
		backendProxyPlugin({
			backendBaseUrl: 'http://localhost:8080',

			// Custom API only decides: HTML or binary + module extraction
			backendHandler: createFetchBackendHandler({
				extractModule: (url, html, headers) => {
					// Meta tag priority
					const metaModule = extractModuleFromMeta(html);
					if (metaModule) {
						return metaModule;
					}

					// Header fallback
					const headerModule = headers.get('x-vite-module');
					if (headerModule) {
						return headerModule;
					}

					// URL pattern fallback
					const urlModule = extractModuleFromUrl(url, /p=\d+:([^:&]+)/);
					if (urlModule) {
						return urlModule.toLowerCase().replaceAll('_', '-');
					}

					return null;
				},
			}),

			assetConfig: {
				globalEntryPoints: {
					js: '/src/global.ts',
					css: '/src/global.css',
				},
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
