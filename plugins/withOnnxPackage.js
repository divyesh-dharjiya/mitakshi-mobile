// onnxruntime-react-native is compiled into the app but Expo's autolinking does not add its
// package to the app's package list, so NativeModules.Onnxruntime is null and the app crashes at
// startup. This registers OnnxruntimePackage in MainApplication.kt each time the project is generated.
const { withMainApplication } = require('expo/config-plugins');

const ENTRY = 'add(ai.onnxruntime.reactnative.OnnxruntimePackage())';
const ANCHOR = '// add(MyReactNativePackage())';

module.exports = (config) =>
  withMainApplication(config, (cfg) => {
    const src = cfg.modResults.contents;
    if (src.includes(ENTRY)) return cfg;
    if (!src.includes(ANCHOR)) throw new Error('withOnnxPackage: could not find the manual-package anchor in MainApplication.kt');
    cfg.modResults.contents = src.replace(ANCHOR, `${ANCHOR}\n          ${ENTRY}`);
    return cfg;
  });
