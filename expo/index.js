/**
 * Registers the Expo Router root after installing the tiny native runtime
 * compatibility shim needed by Survey Core. Keep this free of any Survey Core
 * import so the engine stays out of the cold-start path.
 */
if (typeof window !== "undefined") {
  if (typeof window.addEventListener !== "function") {
    window.addEventListener = () => {};
  }
  if (typeof window.removeEventListener !== "function") {
    window.removeEventListener = () => {};
  }
}

const React = require("react");
const { registerRootComponent } = require("expo");
const { ExpoRoot } = require("expo-router");

function App() {
  const context = require.context("./app");
  return React.createElement(ExpoRoot, { context });
}

registerRootComponent(App);

module.exports = { App };
