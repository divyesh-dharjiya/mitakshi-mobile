// Bundles the self-hosted ONNX models into the native app.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('onnx');

module.exports = config;
