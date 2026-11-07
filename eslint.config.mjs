import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/next-env.d.ts", "artifacts/**", "test-results/**", "playwright-report/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly", fetch: "readonly" } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-syntax": ["error", { selector: "CallExpression[callee.name='eval']", message: "eval is forbidden" }],
    },
  },
  {
    // Node CommonJS measurement script; code inside page.evaluate/addInitScript runs in the browser.
    files: ["scripts/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { require: "readonly", module: "readonly", process: "readonly", console: "readonly", window: "readonly", PerformanceObserver: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
