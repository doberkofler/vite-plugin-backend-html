import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		exclude: ['**/node_modules/**', '**/dist/**'],
		testTimeout: 20_000,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			thresholds: {
				lines: 100,
				functions: 100,
				statements: 100,
				branches: 90,
			},
		},
	},
	esbuild: {
		target: 'node20',
	},
});
