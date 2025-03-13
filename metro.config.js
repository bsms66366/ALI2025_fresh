const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add asset directories to the asset include patterns
config.resolver.assetExts.push('glb', 'gltf', 'obj', 'mtl');

// Configure how Metro looks for modules and assets
config.watchFolders = [
  ...config.watchFolders || [],
  `${__dirname}/assets`,
  `${__dirname}/app/assets`, // Add the app/assets directory
];

// Add any additional asset roots (if your assets are in non-standard locations)
config.resolver.assetRoots = [
  ...config.resolver.assetRoots || [],
  `${__dirname}/assets`,
  `${__dirname}/app/assets`, // Add the app/assets directory
];

module.exports = config;
