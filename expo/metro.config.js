const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  "@dynamic/event-core": path.resolve(workspaceRoot, "packages/event-core"),
  "@dynamic/shared-context": path.resolve(workspaceRoot, "packages/shared-context"),
  "@dynamic/shared-domain": path.resolve(workspaceRoot, "packages/shared-domain"),
  "@dynamic/shared-workflow": path.resolve(workspaceRoot, "packages/shared-workflow"),
};

module.exports = config;
