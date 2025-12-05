import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const commonRules = {
	'no-undef': 'error',
	'no-unused-vars': 'off',
	'no-useless-escape': 'off',
	'no-case-declarations': 'off',
	'no-useless-catch': 'off',
	'no-prototype-builtins': 'off',
	'no-empty': 'off',
	'prefer-const': 'off',
	'no-fallthrough': 'off',
	'no-constant-condition': 'off',
	'no-unreachable': 'off',
	'@typescript-eslint/no-unsafe-call': 'off',
	'@typescript-eslint/no-unsafe-assignment': 'off',
	'@typescript-eslint/no-unsafe-member-access': 'off',
	'@typescript-eslint/no-unsafe-return': 'off',
	'@typescript-eslint/no-unsafe-argument': 'off',
	'@typescript-eslint/no-explicit-any': 'off',
	'@typescript-eslint/no-unused-vars': 'off',
	'@typescript-eslint/no-for-in-array': 'off',
	'@typescript-eslint/no-floating-promises': 'off',
	'@typescript-eslint/no-base-to-string': 'off',
	'@typescript-eslint/restrict-template-expressions': 'off',
	'@typescript-eslint/no-unnecessary-type-assertion': 'off',
	'@typescript-eslint/no-misused-promises': 'off',
	'@typescript-eslint/no-require-imports': 'off',
	'@typescript-eslint/require-await': 'off',
	'@typescript-eslint/prefer-promise-reject-errors': 'off',
	'@typescript-eslint/no-redundant-type-constituents': 'off',
	'@typescript-eslint/no-unsafe-function-type': 'off',
	'@typescript-eslint/unbound-method': 'off',
	'@typescript-eslint/restrict-plus-operands': 'off',
	'@typescript-eslint/no-empty-object-type': 'off',
	'@typescript-eslint/only-throw-error': 'off',
	'@typescript-eslint/no-array-delete': 'off',
	'@typescript-eslint/no-unused-expressions': 'off',
	'@typescript-eslint/no-this-alias': 'off',
	'@typescript-eslint/await-thenable': 'off',
	'@typescript-eslint/ban-ts-comment': 'off',
};

export default defineConfig([
	{
		ignores: ['node_modules/**', 'dist/**', 'unitTests/**'],
	},

	{
		files: ['**/*.{js,mjs,cjs}'],
		plugins: {
			js,
		},
		extends: ['js/recommended'],

		languageOptions: {
			globals: {
				...globals.node,
				server: 'readonly',
				databases: 'readonly',
			},
		},

		rules: { ...commonRules },
	},

	{
		files: ['**/*.js'],
		languageOptions: { sourceType: 'commonjs' },
		rules: { ...commonRules },
	},

	{
		files: ['**/*.{ts,mts,cts}'],
		extends: [...tseslint.configs.recommendedTypeChecked],
		languageOptions: {
			globals: {
				...globals.node,
				NodeJS: 'readonly',
				server: 'readonly',
				databases: 'readonly',
				createBlob: 'readonly',
				Resource: 'readonly',
				lockdown: 'readonly',
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		// it is not recommended to use no-undef for TS code:
		// https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
		rules: { ...commonRules },
	},

	prettier,
]);
