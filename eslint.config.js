'use strict';

const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
  {
    files: ['assets/js/*.js', 'animation-pieces/*.js'],
    ignores: ['assets/js/*.test.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2021,
      globals: {
        ...globals.browser,
        module: 'writable',
        require: 'readonly',
        Calc: 'readonly',
        Budgets: 'readonly',
        UI: 'readonly',
        BudgetState: 'readonly',
        Prefs: 'readonly',
        Docx: 'readonly',
        PdfLink: 'readonly',
        Report: 'readonly',
        CoinStory: 'readonly',
        Flash: 'readonly',
        PlacementData: 'readonly',
        Fiche: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
    },
  },
  {
    files: ['assets/js/*.test.js'],
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 2021,
      globals: {
        ...globals.node,
      },
    },
  },
];
