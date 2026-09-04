// Flat config. No shared presets are imported so the dependency allowlist
// (AGENTS.md) stays exact: eslint itself is the only lint dependency.
const rules = {
  "no-undef": "error",
  "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  "no-var": "error",
  "prefer-const": "error",
  eqeqeq: ["error", "always"],
  "no-implicit-globals": "error",
  "no-console": "off",
  curly: ["error", "all"],
  "no-throw-literal": "error",
};

const nodeGlobals = {
  process: "readonly",
  console: "readonly",
  fetch: "readonly",
  URL: "readonly",
  AbortController: "readonly",
  AbortSignal: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  structuredClone: "readonly",
};

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  console: "readonly",
  fetch: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Intl: "readonly",
  localStorage: "readonly",
  requestAnimationFrame: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", "_site/**", "fixtures/**"],
  },
  {
    files: ["scrapers/**/*.js", "test/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: nodeGlobals,
    },
    rules,
  },
  {
    files: ["site/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "script",
      globals: browserGlobals,
    },
    rules: { ...rules, "no-implicit-globals": "off" },
  },
];
