// Keeps the APK small without touching what the app does:
//  - only English resources are packaged (the app has no translations; libraries ship strings in ~80 languages);
//  - three image-library helpers the app never loads are left out: animated GIF decoding, a WebP decoder that only
//    Android 4 needed (the app requires Android 8) and native blur filters.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// mitakshi: slim apk';
const RULE = `
${MARK}
android {
    defaultConfig {
        resourceConfigurations += ['en']
    }
    packagingOptions {
        jniLibs {
            excludes += ['**/libgifimage.so', '**/libstatic-webp.so', '**/libnative-filters.so']
        }
    }
}
`;

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARK)) cfg.modResults.contents += RULE;
    return cfg;
  });
