const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo: watch the whole workspace
config.watchFolders = [monorepoRoot];

// Resolve from both project and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// ESM-only packages that lack a "main" field — manually map to their dist entry
const esmPackages = {
  "copy-anything": path.join(
    monorepoRoot,
    "node_modules/.pnpm/copy-anything@4.0.5/node_modules/copy-anything/dist/index.js"
  ),
  "is-what": path.join(
    monorepoRoot,
    "node_modules/.pnpm/is-what@5.5.0/node_modules/is-what/dist/index.js"
  ),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (esmPackages[moduleName]) {
    return { type: "sourceFile", filePath: esmPackages[moduleName] };
  }
  return context.resolveRequest(
    { ...context, resolveRequest: undefined },
    moduleName,
    platform
  );
};

module.exports = config;
