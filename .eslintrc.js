module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    extends: ['airbnb-base'],
    root: true,
    settings: {
        'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts', '.tsx'],
        },
        'import/resolver': {
            node: {
                extensions: ['.js', '.jsx', '.ts', '.tsx'],
            },
        },
        'import/core-modules': ['aws-sdk'],
    },
    rules: {
        'linebreak-style': 0,
        'max-len': ['error', { code: 300, ignoreUrls: true }],
        'no-new': 'off',
        indent: ['error', 4],
        'max-classes-per-file': 'off',
        'no-unused-vars': 'off',
        'no-console': 'off',
        'import/extensions': 'off',
        '@typescript-eslint/member-delimiter-style': 'error',
    },
};
