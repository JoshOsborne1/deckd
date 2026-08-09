const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  {
    ignores: [
      'node_modules/**',
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
    ],
  },
  ...expoConfig,
  {
    rules: {
      'import/no-unresolved': 'off',
    },
  },
];
