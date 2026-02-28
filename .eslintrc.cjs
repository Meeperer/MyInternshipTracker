module.exports = {
  root: true,
  env: { node: true, es2022: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  overrides: [
    {
      files: ['client/**/*.svelte', 'client/**/*.js'],
      env: { browser: true },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' }
    }
  ],
  ignorePatterns: ['node_modules', '.svelte-kit', 'build', 'dist']
};
