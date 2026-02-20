import eslint from '@eslint/js';
import {defineConfig} from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import vitest from '@vitest/eslint-plugin';
import pluginRegExp from 'eslint-plugin-regexp';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

export default defineConfig([
	{
		ignores: ['**/.*', 'node_modules/**', 'coverage/**', 'dist/**', 'eslint.config.js', 'commitlint.config.js'],
	},

	{
		linterOptions: {
			reportUnusedDisableDirectives: 'error',
			reportUnusedInlineConfigs: 'error',
		},
	},

	eslint.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	eslintPluginUnicorn.configs.recommended,
	pluginRegExp.configs['flat/recommended'],

	// ================================================================================
	// GENERAL
	// ================================================================================
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
			globals: {
				...globals.node,
			},
		},
		plugins: {
			jsdoc,
			vitest,
		},
		settings: {
			jsdoc: {
				mode: 'typescript',
			},
			react: {
				version: 'detect',
			},
		},
		rules: {
			// typescript
			curly: 'error',
			'@typescript-eslint/no-deprecated': 'error',
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
			'@typescript-eslint/restrict-template-expressions': 'off',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					caughtErrors: 'none',
					argsIgnorePattern: '^_',
				},
			],

			// jsdoc
			...jsdoc.configs['flat/recommended-error'].rules,
			'jsdoc/lines-before-block': 'off',
			'jsdoc/tag-lines': 'off',
			'jsdoc/require-param-description': 'error',
			'jsdoc/require-property-description': 'error',
			'jsdoc/require-returns-description': 'error',
			'jsdoc/require-param-type': 'off',
			'jsdoc/require-returns-type': 'off',
			'jsdoc/require-property-type': 'off',
			'jsdoc/require-throws-type': 'off',

			// vitest
			...vitest.configs.recommended.rules,

			// unicorn
			'unicorn/no-useless-undefined': [
				'error',
				{
					checkArrowFunctionBody: false,
				},
			],
			'unicorn/filename-case': 'off',
			'unicorn/prevent-abbreviations': 'off',
			'unicorn/no-array-reduce': 'off',
			'unicorn/no-null': 'off',
		},
	},

	// ================================================================================
	// UNIT TESTS
	// ================================================================================
	{
		files: ['**/*.test.ts'],
		rules: {
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/dot-notation': 'off',
			'@typescript-eslint/prefer-nullish-coalescing': 'off',
			'@typescript-eslint/no-unnecessary-condition': 'off',
			'@typescript-eslint/unbound-method': 'off',
			'unicorn/no-useless-undefined': 'off',
			'unicorn/consistent-function-scoping': 'off',
			'unicorn/no-await-expression-member': 'off',
		},
	},
]);
