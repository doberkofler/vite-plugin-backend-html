# Coding Agent Guidelines

## Project Overview
**vite-plugin-backend-html** - Vite plugin for proxying backend HTML responses with dynamic asset injection.
**Target:** Node 20.19+ / 22.12+, ES2022, strict TypeScript.

## Build & Validation
```bash
npm run build          # Build with tsdown
npm run dev            # Watch mode
npm test               # Run vitest tests with coverage
npm run lint           # Format check + eslint + tsc
npx vitest run <pattern> # Run specific test (e.g. npx vitest run inject)
```

### Coverage Requirements
- **Asset Injection:** Verify `injectAssets` with various HTML structures and production asset tag replacement.
- **Module Extraction:** Verify `extractModuleFromMeta` and `extractModuleFromUrl`.
- **Backend Handlers:** Verify `createFetchBackendHandler` (HTML & binary).

## Code Style (Prettier & ESLint Enforced)
- **Formatting:** Tabs, single quotes, no bracket spacing, 160 char width.
- **Semicolons:** Required.
- **Naming:** `camelCase` (vars/funcs), `PascalCase` (types), `SCREAMING_SNAKE` (consts).
- **No Abbreviations:** Use descriptive names (`unicorn/prevent-abbreviations` is OFF).
- **Boolean Prefixes:** `is`, `has`, `should`.

### Imports
- **Named exports only** - no default exports.
- **ESM only** (`type: "module"`).
- **Order:** Node built-ins → External → Internal → Types.
```typescript
import type {Plugin} from 'vite';
import type {IncomingMessage} from 'http';
```

### TypeScript Rules
- **Strict Mode:** All strict checks enabled (null checks, no implicit any).
- **Target:** ES2022, ESNext modules.
- **Types:** Prefer `type` over `interface`. **No `any`**.
- **Exhaustive Switch:** Use `never` for exhaustive checks.
```typescript
default: {
	const _exhaustive: never = result;
	throw new Error(`Unhandled: ${JSON.stringify(_exhaustive)}`);
}
```
- **Unused:** Prefix with `_` if intentionally unused.

### JSDoc (Mandatory)
- Required for **all exported** functions/types.
- **Descriptions:** Mandatory for params, returns, properties.
- **No Types:** Types are handled by TS, do not duplicate in JSDoc.
```typescript
/**
 * Cache entry with metadata
 */
type CacheEntry = {
	result: BackendResult;
	timestamp: number;
	url: string;
};
```

### Error Handling
- **Throw** on error conditions.
- **Catch** at boundaries (e.g., plugin middleware).
- **Store errors** in state for debugging.
```typescript
try {
	// operation
} catch (err) {
	state.lastError = err as Error;
	log(`ERROR: ${url}`, err);
	res.statusCode = 500;
	res.end(`Proxy error: ${(err as Error).message}`);
}
```

### Async/Await
- Prefer **async/await** over Promise chains.
- **Explicit return types** for async functions.
```typescript
const handleRequest = async (url: string): Promise<boolean> => { /* ... */ };
```

## ESLint & Testing
- **Plugins:** `@eslint/js`, `typescript-eslint` (strict+stylistic), `unicorn` (some overrides), `jsdoc`, `vitest`.
- **Overrides:**
  - `unicorn/filename-case: off` (flexible naming)
  - `unicorn/no-null: off` (null allowed)
  - `restrict-template-expressions: off` (flexible templates)
- **Tests:** Strict rules apply. No relaxed type safety in `*.test.ts`.

## Development Workflow
1. **Lint First:** `npm run lint` must pass before committing. Always fix errors proactively.
2. **Test:** `npm test` for coverage.
3. **Commit:** Conventional commits (`feat:`, `fix:`, `chore:`, etc.).
4. **Version:** Follow `DEVELOPMENT.md` (lint -> test -> build -> bump -> commit -> changelog -> tag).

## Common Patterns

### Plugin Structure
```typescript
export function pluginName(config: PluginConfig): Plugin {
	// State, cache, helpers
	return {
		name: 'plugin-name',
		configureServer(server: ViteDevServer): void {
			// Middleware logic
		},
	} satisfies Plugin;
}
```

### Type Guards
```typescript
switch (result.type) {
	case 'html': { /* ... */ break; }
	case 'binary': { /* ... */ break; }
	default: {
		const _exhaustive: never = result;
		throw new Error(`Unhandled: ${JSON.stringify(_exhaustive)}`);
	}
}
```

### Debugging
- Use `log()` helper with `debug` flag.
- Expose debug API on server object.
- Include state metrics (hits/misses/calls).

## Validation Sources
- TypeScript docs
- Vite plugin API docs
- Node.js docs
- RFC, W3C, ECMA standards

## Anti-Patterns
- ❌ Default exports
- ❌ `any` type
- ❌ Missing JSDoc on exports
- ❌ Implicit return types
- ❌ Abbreviations in names
- ❌ Spaces instead of tabs
- ❌ Double quotes in TypeScript
- ❌ Missing error handling
- ❌ Non-exhaustive switch statements
