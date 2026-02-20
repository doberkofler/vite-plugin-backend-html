  [![NPM Version][npm-image]][npm-url]
  [![NPM Downloads][downloads-image]][downloads-url]
  [![Node.js CI](https://github.com/doberkofler/vite-plugin-backend-html/actions/workflows/node.js.yml/badge.svg)](https://github.com/doberkofler/vite-plugin-backend-html/actions/workflows/node.js.yml)
  [![Coverage Status](https://coveralls.io/repos/github/doberkofler/vite-plugin-backend-html/badge.svg?branch=main)](https://coveralls.io/github/doberkofler/vite-plugin-backend-html?branch=main)

# vite-plugin-backend-html

Vite plugin for proxying backend HTML responses with dynamic asset injection.

## Key Features

- **Backend Proxying**: Filters and forwards requests to the Vite dev server to a backend.
- **Dynamic Asset Injection**: Automatically injects Vite dev assets (JS and CSS) into backend HTML responses.
- **Production Asset Stripping**: Automatically removes production asset tags (e.g., from `/assets/` or `/q/p/` paths) to prevent conflicts during development.
- **Module Extraction**: Helpers to extract module names from HTML meta tags or URL patterns for module-specific asset injection.
- **Flexible Handlers**: Support for custom backend handlers, including a built-in fetch-based handler.

## Installation

```bash
npm install vite-plugin-backend-html --save-dev
```

## Usage

```typescript
import {defineConfig} from 'vite';
import {backendProxyPlugin, createFetchBackendHandler, extractModuleFromMeta} from 'vite-plugin-backend-html';

export default defineConfig({
	plugins: [
		backendProxyPlugin({
			backendBaseUrl: 'http://localhost:8080',
			bypass: (url) => url.startsWith('/api/v2/'),
			backendHandler: createFetchBackendHandler({
				extractModule: (_url, html) => extractModuleFromMeta(html, 'vite-module'),
			}),
			assetConfig: {
				globalEntryPoints: {
					js: '/src/main.ts',
				},
				getModuleEntryPoints: (module) => ({
					js: `/src/modules/${module}/index.ts`,
				}),
			},
		}),
	],
});
```

## API

### `backendProxyPlugin(config: ProxyConfig)`

The main Vite plugin.

#### `ProxyConfig`

- `backendBaseUrl`: Base URL of the backend server.
- `bypass`: Function to skip proxying for specific URLs.
- `backendHandler`: Function to handle the actual backend request.
- `assetConfig`: Configuration for asset injection.
- `rewrites`: Optional URL path rewrites.
- `debug`: Optional logging level (`error`, `info`, `debug`).

### `createFetchBackendHandler(options)`

A built-in handler using `fetch` to communicate with the backend.

### `extractModuleFromMeta(html, metaName?)`

Extracts a module name from a `<meta name="vite-module" content="...">` tag.

### `extractModuleFromUrl(url, pattern)`

Extracts a module name from the URL using a regular expression with a capture group.

## Testing

The plugin includes a comprehensive test suite with >90% coverage.

```bash
npm test
```


[npm-image]: https://img.shields.io/npm/v/vite-plugin-backend-html.svg
[npm-url]: https://npmjs.org/package/vite-plugin-backend-html

[downloads-image]: https://img.shields.io/npm/dm/vite-plugin-backend-html.svg
[downloads-url]: https://npmjs.org/package/vite-plugin-backend-html
