const React = require("react");
const { registerRootComponent } = require("expo");
const { ExpoRoot } = require("expo-router");

function App() {
  const context = require.context("./app");
  return React.createElement(ExpoRoot, { context });
}

registerRootComponent(App);

module.exports = { App };
