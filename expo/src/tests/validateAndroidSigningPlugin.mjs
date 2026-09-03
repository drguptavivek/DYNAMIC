import assert from "node:assert/strict";
import pluginModule from "../../plugins/withAndroidReleaseSigning.js";

const { applyReleaseSigningToBuildGradle } = pluginModule;

// Fixture copied verbatim from the shape of the real generated
// expo/android/app/build.gradle signingConfigs / buildTypes section
// (`android {}` block, ~lines 100-123 of a fresh `expo prebuild` output).
const buildGradleFixture = `android {
    ndkVersion rootProject.ext.ndkVersion

    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace 'com.drguptavivek.dynamicfieldapp'
    defaultConfig {
        applicationId 'com.drguptavivek.dynamicfieldapp'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "0.1.0"

        buildConfigField "String", "REACT_NATIVE_RELEASE_LEVEL", "\\"\${findProperty('reactNativeReleaseLevel') ?: 'stable'}\\""
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
            def enablePngCrunchInRelease = findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true'
            crunchPngs enablePngCrunchInRelease.toBoolean()
        }
    }
    packagingOptions {
        jniLibs {
            def enableLegacyPackaging = findProperty('expo.useLegacyPackaging') ?: 'false'
            useLegacyPackaging enableLegacyPackaging.toBoolean()
        }
    }
}
`;

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function buildTypesBlock(source) {
  const match = source.match(/buildTypes\s*\{[\s\S]*?\n\s*\}\n\s*packagingOptions/);
  assert.ok(match, "expected to find a buildTypes {} block");
  return match[0];
}

function debugBuildTypeBlock(source) {
  const match = buildTypesBlock(source).match(/debug\s*\{[^}]*?\}/);
  assert.ok(match, "expected to find a debug {} buildType block");
  return match[0];
}

function releaseBuildTypeBlock(source) {
  const match = buildTypesBlock(source).match(/release\s*\{[^}]*?\}/);
  assert.ok(match, "expected to find a release {} buildType block");
  return match[0];
}

// 1. The release signingConfig block is inserted exactly once.
{
  const updated = applyReleaseSigningToBuildGradle(buildGradleFixture);
  assert.equal(
    countOccurrences(updated, "BEGIN dynamic-release-signing"),
    1,
    "release signingConfig marker should be inserted exactly once"
  );
  assert.match(updated, /signingConfigs\s*\{\n\s*\/\/ BEGIN dynamic-release-signing/);
  assert.match(updated, /storeFile file\(DYNAMIC_RELEASE_STORE_FILE\)/);
  assert.match(updated, /storePassword DYNAMIC_RELEASE_STORE_PASSWORD/);
  assert.match(updated, /keyAlias DYNAMIC_RELEASE_KEY_ALIAS/);
  assert.match(updated, /keyPassword DYNAMIC_RELEASE_KEY_PASSWORD/);
}

// 2. `signingConfig signingConfigs.debug` inside `release {}` becomes
//    `signingConfigs.release`, while `debug {}` keeps `signingConfigs.debug`.
{
  const updated = applyReleaseSigningToBuildGradle(buildGradleFixture);

  const releaseBlock = releaseBuildTypeBlock(updated);
  assert.match(releaseBlock, /signingConfig signingConfigs\.release/);
  assert.doesNotMatch(releaseBlock, /signingConfig signingConfigs\.debug/);

  const debugBlock = debugBuildTypeBlock(updated);
  assert.match(debugBlock, /signingConfig signingConfigs\.debug/);
}

// 3. Applying the transformation twice is idempotent.
{
  const once = applyReleaseSigningToBuildGradle(buildGradleFixture);
  const twice = applyReleaseSigningToBuildGradle(once);
  assert.equal(twice, once, "applying the transform a second time should not change the output");
  assert.equal(
    countOccurrences(twice, "BEGIN dynamic-release-signing"),
    1,
    "release signingConfig marker should still appear exactly once after a second pass"
  );
}

// Gradle JVM heap: replaces Expo's default org.gradle.jvmargs and is idempotent.
{
  const { applyGradleJvmArgs, GRADLE_JVM_ARGS } = pluginModule;
  assert.match(GRADLE_JVM_ARGS, /-Xmx4096m/);
  const items = [
    { type: "property", key: "org.gradle.jvmargs", value: "-Xmx2048m -XX:MaxMetaspaceSize=512m" },
    { type: "property", key: "android.useAndroidX", value: "true" },
  ];
  const once = applyGradleJvmArgs(items);
  assert.equal(once.filter((item) => item.key === "org.gradle.jvmargs").length, 1);
  assert.equal(once.find((item) => item.key === "org.gradle.jvmargs").value, GRADLE_JVM_ARGS);
  assert.equal(once.find((item) => item.key === "android.useAndroidX").value, "true");
  assert.deepEqual(applyGradleJvmArgs(once), once);
  assert.equal(applyGradleJvmArgs([]).length, 1, "added when absent");
}

console.log("validateAndroidSigningPlugin: all assertions passed");
