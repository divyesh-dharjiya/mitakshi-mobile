// onnxruntime-react-native asks Gradle for `onnxruntime-android:latest.integration`, i.e. whatever is newest on
// Maven Central. Releases after 1.22 grew the arm64 runtime from 6.6 MB to 12.9 MB (compressed) with nothing
// this app uses, so the build is pinned to 1.22.0. Raise it only after checking the APK size and the models.
const { withProjectBuildGradle } = require('expo/config-plugins');

const VERSION = '1.22.0';
const MARK = '// mitakshi: pin onnxruntime';
const RULE = `
${MARK}
allprojects {
  configurations.all {
    resolutionStrategy.eachDependency { d ->
      if (d.requested.group == 'com.microsoft.onnxruntime' && d.requested.name == 'onnxruntime-android') d.useVersion '${VERSION}'
    }
  }
}
`;

module.exports = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARK)) cfg.modResults.contents += RULE;
    return cfg;
  });
