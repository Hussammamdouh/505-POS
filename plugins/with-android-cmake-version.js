const { withAppBuildGradle } = require('expo/config-plugins');

// The default CMake (3.22.1) ships ninja 1.10, which fails on Windows once React Native's C++ object
// paths pass 260 characters. CMake 3.31.x from the Android SDK has a long-path-aware ninja.
// Gradle installs the requested version automatically.
const MARKER = '// cmake-version: with-android-cmake-version';

module.exports = function withAndroidCmakeVersion(config, { version = '3.31.6' } = {}) {
  return withAppBuildGradle(config, (gradleConfig) => {
    const block = `    ${MARKER}\n    externalNativeBuild {\n        cmake {\n            version "${version}"\n        }\n    }\n`;
    let contents = gradleConfig.modResults.contents;
    const existing = new RegExp(`    ${MARKER}\\n    externalNativeBuild \\{[\\s\\S]*?\\n    \\}\\n`);

    contents = existing.test(contents)
      ? contents.replace(existing, block)
      : contents.replace(/^android \{\n/m, (match) => match + block);

    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
};
