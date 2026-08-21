const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      '.worktrees/**',
      'dist/**',
      'dist-*/**',
      'ios/**',
      'android/**',
      '.expo/**',
      'web-build/**',
      'build/**',
      'coverage/**',
      'server/**',
      'app-serve/**',
      '.vischeck/**',
      '.vischeck-sweep/**',
      'tmp-animation-audit/**',
    ],
  },
  ...expoConfig,
  {
    rules: {
      'import/no-unresolved': 'off',
    },
  },
];
