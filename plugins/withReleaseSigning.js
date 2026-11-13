// Signs release builds (APK and Play Store AAB) with the Mitakshi upload key when it is set up,
// and falls back to the debug key otherwise. The key's location and passwords are read at build
// time from Gradle properties (normally ~/.gradle/gradle.properties, written by
// `npm run upload-key`), so no secret ever lands in the project folder.
const { withAppBuildGradle } = require('expo/config-plugins');

const DEBUG_CONFIG = `    signingConfigs {
        debug {`;
const RELEASE_CONFIG = `    signingConfigs {
        release {
            if (project.hasProperty('MITAKSHI_UPLOAD_STORE_FILE')) {
                storeFile file(MITAKSHI_UPLOAD_STORE_FILE)
                storePassword MITAKSHI_UPLOAD_STORE_PASSWORD
                keyAlias MITAKSHI_UPLOAD_KEY_ALIAS
                keyPassword MITAKSHI_UPLOAD_KEY_PASSWORD
            }
        }
        debug {`;
const RELEASE_USES_DEBUG = /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/;
const RELEASE_USES_UPLOAD = "$1signingConfig project.hasProperty('MITAKSHI_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug";

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes('MITAKSHI_UPLOAD_STORE_FILE')) return cfg;
    if (!src.includes(DEBUG_CONFIG) || !RELEASE_USES_DEBUG.test(src)) {
      throw new Error('withReleaseSigning: could not find the signing config anchors in app/build.gradle');
    }
    src = src.replace(DEBUG_CONFIG, RELEASE_CONFIG).replace(RELEASE_USES_DEBUG, RELEASE_USES_UPLOAD);
    cfg.modResults.contents = src;
    return cfg;
  });
