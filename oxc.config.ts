import {defineConfig} from 'oxlint';
import {configs as regexpConfigs} from 'eslint-plugin-regexp';

/** Filter out core ESLint rules bundled into eslint-plugin-regexp recommended config */
const regexpPluginRules = Object.fromEntries(Object.entries(regexpConfigs.recommended.rules).filter(([key]) => key.startsWith('regexp/')));

const commonIgnore = ['**/.*', 'node_modules/**', 'dist/**', 'build/**', 'coverage/**', 'temp/**', 'public/**', '**/*.md', 'example/**'];

export const linter = defineConfig({
	options: {
		typeAware: true,
		typeCheck: true,
	},
	plugins: ['unicorn', 'typescript', 'oxc', 'import', 'react', 'jsdoc', 'promise', 'vitest'],
	jsPlugins: ['eslint-plugin-regexp'],
	categories: {
		correctness: 'error',
		nursery: 'error',
		pedantic: 'error',
		perf: 'error',
		restriction: 'error',
		style: 'error',
		suspicious: 'error',
	},
	rules: {
		...regexpPluginRules,
		'eslint/complexity': 'off', // TODO: consider enabling
		'eslint/curly': ['error', 'all'],
		'eslint/id-length': 'off',
		'eslint/init-declarations': 'off', // TODO: consider enabling
		'eslint/max-depth': 'off', // TODO: consider enabling
		'eslint/max-lines': 'off', // TODO: consider enabling
		'eslint/max-lines-per-function': 'off', // TODO: consider enabling
		'eslint/max-params': 'off', // TODO: consider enabling
		'eslint/max-statements': 'off', // TODO: consider enabling
		'eslint/capitalized-comments': 'off', // TODO: consider enabling
		'eslint/no-await-in-loop': 'warn',
		'eslint/no-console': 'off',
		'eslint/no-continue': 'off',
		'eslint/no-inline-comments': 'off',
		'eslint/no-magic-numbers': 'off',
		'eslint/no-negated-condition': 'off', // TODO: consider enabling
		'eslint/no-nested-ternary': 'off',
		'eslint/no-warning-comments': 'off',
		'eslint/no-undefined': 'off', // TODO: consider enabling
		'eslint/no-plusplus': 'off',
		'eslint/sort-imports': 'off',
		'eslint/sort-keys': 'off',
		'eslint/no-ternary': 'off',
		'typescript/no-unused-vars': [
			'error',
			{
				caughtErrors: 'none',
				argsIgnorePattern: '^_',
			},
		],
		'typescript/consistent-type-definitions': ['error', 'type'],
		'typescript/no-import-type-side-effects': 'off',
		'typescript/prefer-readonly-parameter-types': 'off',
		'import/consistent-type-specifier-style': ['error', 'prefer-inline'],
		'import/exports-last': 'off',
		'import/group-exports': 'off',
		'import/max-dependencies': 'off',
		'import/no-named-export': 'off',
		'import/no-namespace': 'off', // TODO: consider enabling
		'import/no-nodejs-modules': 'off',
		'import/prefer-default-export': 'off',
		'import/no-default-export': 'off',
		// FIXME: remove all jest rules
		'jest/consistent-test-it': 'off',
		'jest/expect-expect': 'off',
		'jest/max-expects': 'off',
		'jest/max-nested-describe': 'off',
		'jest/no-alias-methods': 'off',
		'jest/no-commented-out-tests': 'off',
		'jest/no-conditional-expect': 'off',
		'jest/no-conditional-in-test': 'off',
		'jest/no-confusing-set-timeout': 'off',
		'jest/no-deprecated-functions': 'off',
		'jest/no-disabled-tests': 'off',
		'jest/no-done-callback': 'off',
		'jest/no-duplicate-hooks': 'off',
		'jest/no-export': 'off',
		'jest/no-focused-tests': 'off',
		'jest/no-hooks': 'off',
		'jest/no-identical-title': 'off',
		'jest/no-interpolation-in-snapshots': 'off',
		'jest/no-jasmine-globals': 'off',
		'jest/no-large-snapshots': 'off',
		'jest/no-mocks-import': 'off',
		'jest/no-restricted-jest-methods': 'off',
		'jest/no-restricted-matchers': 'off',
		'jest/no-standalone-expect': 'off',
		'jest/no-test-prefixes': 'off',
		'jest/no-test-return-statement': 'off',
		'jest/no-unneeded-async-expect-function': 'off',
		'jest/no-untyped-mock-factory': 'off',
		//'jest/padding-around-after-all-blocks': 'off',
		'jest/padding-around-test-blocks': 'off',
		'jest/prefer-called-with': 'off',
		'jest/prefer-comparison-matcher': 'off',
		'jest/prefer-each': 'off',
		'jest/prefer-equality-matcher': 'off',
		'jest/prefer-expect-resolves': 'off',
		'jest/prefer-hooks-in-order': 'off',
		'jest/prefer-hooks-on-top': 'off',
		'jest/prefer-jest-mocked': 'off',
		'jest/prefer-lowercase-title': 'off',
		'jest/prefer-mock-promise-shorthand': 'off',
		'jest/prefer-mock-return-shorthand': 'off',
		//'jest/prefer-snapshot-hint': 'off',
		'jest/prefer-spy-on': 'off',
		'jest/prefer-strict-equal': 'off',
		'jest/prefer-to-be': 'off',
		'jest/prefer-to-contain': 'off',
		'jest/prefer-to-have-been-called': 'off',
		'jest/prefer-to-have-been-called-times': 'off',
		'jest/prefer-to-have-length': 'off',
		'jest/prefer-todo': 'off',
		'jest/require-hook': 'off',
		'jest/require-to-throw-message': 'off',
		'jest/require-top-level-describe': 'off',
		'jest/valid-describe-callback': 'off',
		'jest/valid-expect': 'off',
		'jest/valid-title': 'off',
		'oxc/no-async-await': 'off',
		'oxc/no-map-spread': 'off', // TODO: consider enabling
		'oxc/no-rest-spread-properties': 'off',
		'unicorn/escape-case': 'off',
		'unicorn/filename-case': 'off', // TODO: consider enabling
		'unicorn/no-array-reduce': 'off', // TODO: consider enabling
		'unicorn/no-array-sort': 'off', // TODO: consider enabling
		'unicorn/no-hex-escape': 'off',
		'unicorn/no-immediate-mutation': 'off',
		'unicorn/no-nested-ternary': 'off',
		'unicorn/no-null': 'off', // TODO: consider enabling
		'unicorn/no-process-exit': 'off', // TODO: consider enabling
		'unicorn/no-typeof-undefined': 'off', // TODO: consider enabling
		'unicorn/prefer-module': 'off', // TODO: consider enabling
		'react/jsx-filename-extension': 'off',
		'react/react-in-jsx-scope': 'off',
		'vitest/no-importing-vitest-globals': 'off',
		'vitest/prefer-describe-function-title': 'off',
		'vitest/prefer-to-be-falsy': 'off',
		'vitest/prefer-to-be-truthy': 'off', // FIXME: Conflict Detected: prefer-strict-boolean-matchers enforces toBe(true), but prefer-to-be-truthy enforces toBeTruthy().
		'vitest/require-test-timeout': 'off',
	},
	overrides: [
		{
			files: ['tests/e2e/**/*.e2e-test.ts', '**/*.e2e-test.ts'],
			rules: {
				'vitest/prefer-importing-vitest-globals': 'off',
			},
		},
		{
			files: ['tests/**/*.ts'],
			rules: {
				'import/no-relative-parent-imports': 'off',
				'typescript/no-unsafe-type-assertion': 'off',
				'typescript/no-explicit-any': 'off',
				'typescript/no-unsafe-assignment': 'off',
				'typescript/no-unsafe-member-access': 'off',
			},
		},
	],
	settings: {
		'jsx-a11y': {
			polymorphicPropName: undefined,
			components: {},
			attributes: {},
		},
		next: {
			rootDir: [],
		},
		react: {
			formComponents: [],
			linkComponents: [],
			version: undefined,
		},
		jsdoc: {
			ignorePrivate: false,
			ignoreInternal: false,
			ignoreReplacesDocs: true,
			overrideReplacesDocs: true,
			augmentsExtendsReplacesDocs: false,
			implementsReplacesDocs: false,
			exemptDestructuredRootsFromChecks: false,
			tagNamePreference: {},
		},
		vitest: {
			typecheck: false,
		},
	},
	env: {
		builtin: true,
		node: true,
	},
	globals: {},
	ignorePatterns: commonIgnore,
});

export const formatter = {
	printWidth: 160,
	embeddedLanguageFormatting: 'off',
	useTabs: true,
	singleQuote: true,
	bracketSpacing: false,
	ignorePatterns: commonIgnore,
	overrides: [
		{
			files: ['src/**/*.{scss,css}'],
			options: {
				singleQuote: false,
			},
		},
	],
};
