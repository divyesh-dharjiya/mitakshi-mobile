// app.json is the real configuration. This only adds what a local test build needs:
//   MITAKSHI_TEST_BUILD=1 allows plain-http model downloads (for example from a laptop on the same Wi-Fi).
// Release builds never set it, so they stay HTTPS-only.
module.exports = ({ config }) => {
  if (!process.env.MITAKSHI_TEST_BUILD) return config;
  return {
    ...config,
    plugins: config.plugins.map((p) =>
      Array.isArray(p) && p[0] === 'expo-build-properties' ? ['expo-build-properties', { android: { ...p[1].android, usesCleartextTraffic: true } }] : p,
    ),
  };
};
