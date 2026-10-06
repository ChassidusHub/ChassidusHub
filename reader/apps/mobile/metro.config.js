const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
// npm workspaces hoist dependencies (and symlink the @chassidushub-reader/*
// packages) into the repo root's node_modules, which Metro can't see unless
// the workspace root is a watch folder - without this, release bundling
// fails on the very first import.
const workspaceRoot = path.resolve(projectRoot, '../..');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')],
    // tweetnacl (the pack signature check in packages/pack-format) probes
    // `require('crypto')` for a random source it only needs to make keys;
    // the app only verifies, so Node's crypto resolves to an empty module.
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'crypto') return { type: 'empty' };
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
