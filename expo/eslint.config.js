// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "android/*", "ios/*", ".expo/*", "node_modules/*"],
  },
  {
    languageOptions: { ecmaVersion: "latest" },
    rules: {
      // React Compiler advisory rules. The renderers and survey screens
      // mutate SurveyJS question objects and read refs during render by
      // design; keep these as warnings until that layer is refactored.
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["*.config.js", "*.config.cjs", "plugins/**/*.js", "src/tests/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
]);
