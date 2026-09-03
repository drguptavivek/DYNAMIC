# Android CI builds

The `expo` workspace has no `eas.json` / EAS Build. Android builds run entirely
in `.github/workflows/android-build.yml` on GitHub-hosted `ubuntu-latest`
runners, using Expo's Continuous Native Generation: `expo/android` is
gitignored, and every job regenerates it with

```
npx expo prebuild --platform android --no-install
```

before invoking Gradle. Nothing about the native Android project is
hand-maintained or committed.

## The two jobs

- **`debug`** — runs on every push to `main` and on every pull request.
  Produces a debug-signed APK (the stock Expo `debug.keystore`, no secrets
  needed) and uploads it as a workflow artifact for 14 days.
- **`release`** — runs when a tag matching `v*.*.*` is pushed (e.g. `v0.2.0`).
  Produces a release-signed APK **and** AAB using a real keystore from
  repository secrets, uploads both as workflow artifacts, and publishes a
  GitHub Release for the tag with both files attached.

Both jobs can also be triggered manually via **Actions → Android Build → Run
workflow**, choosing `debug` or `release` from the `build_type` input. A
manual `release` run not on a `v*.*.*` tag still builds and signs an APK/AAB,
but does not create a GitHub Release (there is no tag to attach one to).

Debug pushes and PR pushes share a `concurrency` group per ref, so pushing new
commits automatically cancels an in-flight debug build for the same
branch/PR. Release builds are never auto-cancelled.

## Release signing

Release signing is handled by the Expo config plugin at
`expo/plugins/withAndroidReleaseSigning.js`, registered in `expo/app.json`
under `"plugins"`. At `expo prebuild` time it looks for four environment
variables:

- `ANDROID_RELEASE_KEYSTORE_PATH`
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

If all four are present, the plugin writes them into
`android/gradle.properties` as `DYNAMIC_RELEASE_STORE_FILE` /
`DYNAMIC_RELEASE_STORE_PASSWORD` / `DYNAMIC_RELEASE_KEY_ALIAS` /
`DYNAMIC_RELEASE_KEY_PASSWORD`, adds a `release` `signingConfig` to
`android/app/build.gradle` that reads those properties, and switches the
`release` buildType from `signingConfigs.debug` to `signingConfigs.release`.

If any of the four env vars is missing (the normal case for local
development and for the `debug` CI job), the plugin is a complete no-op: the
generated `release` buildType keeps signing with the bundled debug keystore,
exactly as a fresh `expo prebuild` produces it.

### Generating a release keystore

Generate this **once** and keep it safe — every future release build must be
signed with the same key, or the Play Store / users' devices will refuse the
update (a new keystore means a new, incompatible app, and existing installs
cannot be upgraded in place).

```bash
keytool -genkeypair -v \
  -keystore dynamic-release.keystore \
  -alias dynamic-release-key \
  -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` will prompt for a keystore password, a key password (can be the
same as the keystore password), and your name/org details for the
certificate. Store the resulting `dynamic-release.keystore` file and both
passwords in a password manager — **do not commit it to the repository.**

Base64-encode it for storage as a GitHub secret:

```bash
base64 -i dynamic-release.keystore | pbcopy   # macOS
base64 -w0 dynamic-release.keystore           # Linux, prints to stdout
```

### GitHub configuration

Configure a `release` GitHub Environment (Settings → Environments →
`release`) with these **secrets**:

| Secret                              | Value                                   |
| ------------------------------------ | ---------------------------------------- |
| `ANDROID_RELEASE_KEYSTORE_BASE64`    | base64 output from the command above     |
| `ANDROID_RELEASE_KEYSTORE_PASSWORD`  | the keystore password                    |
| `ANDROID_RELEASE_KEY_ALIAS`          | `dynamic-release-key` (or your alias)    |
| `ANDROID_RELEASE_KEY_PASSWORD`       | the key password                         |

The `release` job base64-decodes `ANDROID_RELEASE_KEYSTORE_BASE64` to a
temporary file at build time and points `ANDROID_RELEASE_KEYSTORE_PATH` at
it; the file never touches the repository or a workflow artifact.

### API base URL

`expo/src/modules/sync/apiConfig.js` reads the API base URL from
`process.env.EXPO_PUBLIC_API_BASE_URL` (an Expo public env var, inlined into
the JS bundle at build time), falling back to `http://localhost:3310/api/v1`
if unset.

The workflow wires this per-environment so debug and release builds can
point at different backends:

- Set an `API_BASE_URL` **variable** (not secret) on the `debug` GitHub
  Environment — e.g. `https://api-staging.example.org/api/v1` (placeholder;
  replace with your real staging URL).
- Set an `API_BASE_URL` **variable** on the `release` GitHub Environment —
  e.g. `https://api.example.org/api/v1` (placeholder; replace with your real
  production URL).

If a `API_BASE_URL` variable is left unset for an environment, the build
falls back to `apiConfig.js`'s own default (`http://localhost:3310/api/v1`),
which is only useful for local testing — set both before relying on real
release/debug builds against a hosted API.

## Tagging a release

```bash
git tag v0.2.0
git push --tags
```

Pushing a `v*.*.*` tag triggers the `release` job. The tag **wins** over
`expo/app.json`'s `expo.version`: the workflow strips the leading `v` and
uses that as the Android `versionName`. If the tag's base version (ignoring
any `-rc.N` suffix) doesn't match `expo/app.json`, the workflow logs a
`::warning::` annotation but still builds — it does not fail the build. Keep
`app.json`'s `version` and your tags in sync as a matter of process; the
warning is a safety net, not a substitute.

Prerelease tags (any tag containing a `-`, e.g. `v0.3.0-rc.1`) are marked as
a GitHub prerelease automatically.

### versionCode scheme

Android `versionCode` must be a strictly increasing integer across releases
that can be installed as upgrades of each other. This workflow derives it
deterministically from the tag:

```
versionCode = MAJOR * 1000000 + MINOR * 10000 + PATCH * 100 + suffix
```

where `suffix` orders builds of the same `MAJOR.MINOR.PATCH`:

| Tag                  | suffix | versionCode |
| -------------------- | ------ | ----------- |
| `v0.2.0-alpha.1`     | 1      | 20001       |
| `v0.2.0-rc.3`        | 3      | 20003       |
| `v0.2.0`             | 99     | 20099       |
| `v0.2.1`             | 99     | 20199       |
| `v1.0.0`             | 99     | 1000099     |

So every prerelease installs as an upgrade over the previous version and the
final release installs over all of its own prereleases. A prerelease number
is capped at 98; a prerelease suffix with no number (e.g. `-beta`) counts
as 1.

**Limits:** `MINOR` and `PATCH` must each be `< 100` and `MAJOR <= 2000`
(Android's `versionCode` ceiling is `2147483647`). The workflow's
version-computation step fails loudly (before any build work) if these are
exceeded or if the tag doesn't match `vMAJOR.MINOR.PATCH[-prerelease]`.
Re-tagging the same prerelease number produces the same versionCode, so
bump `N` for each new `-rc` build.

Debug builds use a much simpler scheme: `versionCode` is the GitHub Actions
run number, and `versionName` is
`<app.json version>-debug.<run_number>+<short sha>`.

## Where things land

- **Debug APK**: workflow artifact named `android-debug-apk-<versionName>` on
  the `debug` job's run, retained for 14 days.
- **Release APK/AAB**: workflow artifacts named `android-release-apk-<versionName>`
  and `android-release-aab-<versionName>` on the `release` job's run (default
  90-day retention), **and** attached to the GitHub Release for the pushed
  tag under the repository's **Releases** page.

## Losing the keystore

If `dynamic-release.keystore` (or its passwords) is lost, there is no
recovery: you cannot sign a new release with the same identity, so you
cannot ship an in-place update to any device that already has a
release-signed build installed. Users would have to uninstall and reinstall
under a new signing identity. Treat the keystore file and its passwords with
the same care as a production database credential — back them up somewhere
durable and access-controlled outside of GitHub Actions.
