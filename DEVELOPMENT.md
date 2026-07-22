# DYNAMIC Development Guide

This guide covers the practical local-development workflow for DYNAMIC. For domain rules and design decisions, use the [architecture and policy documentation](docs/README.md); do not treat this file as a competing source of product behavior.

## Prerequisites

- Node.js with npm 10
- Docker Desktop with Docker Compose
- Git

Install all workspace dependencies from the repository root:

```bash
npm install
```

The repository is an npm workspace monorepo. Run root Make targets and workspace scripts from the repository root unless a command says otherwise.

## Start the Application

The canonical full-stack command is:

```bash
make dev-up
```

It starts PostgreSQL and Redis, pushes the current development schema, seeds development data, starts the Nginx edge, and then runs the API, Admin, and Expo web development servers in the foreground. Their live logs remain in that terminal; press `Ctrl+C` to stop the foreground servers.

To prepare the supporting services first and start hot-reload servers separately:

```bash
make dev-prepare
make hmr-up
```

Individual frontend/backend targets are also available:

```bash
make backend-up
make app-up
make expo-up
```

Use `make help` for the complete, current target list. Do not hand-roll Docker startup or port cleanup when a Make target already exists.

## Local Endpoints and Accounts

| Surface | Address |
| --- | --- |
| API | `http://localhost:3310` |
| Admin | `http://localhost:5317` |
| Expo web | `http://localhost:8088` |
| Nginx edge | `http://localhost:58080` |
| PostgreSQL | `localhost:55432` |
| Redis | `localhost:56379` |
| Drizzle Studio | `http://localhost:4983` after `make drizzle-studio` |

Seeded development accounts:

| Role | Username | Password |
| --- | --- | --- |
| Field worker | `dev-field-worker` | `dev-password` |
| Central admin | `dev-central-admin` | `dev-admin-password` |

These credentials are for local development only.

## Environment Configuration

The Makefile supplies working local API and database defaults. Use the checked-in examples when a workspace needs its own environment file:

```bash
cp apps/api/.env.example apps/api/.env
cp expo/.env.example expo/.env
```

Expo client values must use the `EXPO_PUBLIC_` prefix and are bundled into the client, so never place secrets in them. The API base URL depends on the client:

- web and iOS Simulator: `http://localhost:3310/api/v1`
- Android Emulator: `http://10.0.2.2:3310/api/v1`
- physical device: use the development computer's LAN address

## Database Workflow

This is a development repository with no requirement to preserve local data. Prefer a full reset or schema push over creating migration churn:

```bash
make db-reset-full
make db-status
make db-smoke
```

`make db-reset-full` deletes local development database and Redis volumes, recreates them, pushes the full schema, and reseeds development data. Use `make db-push` when a full reset is unnecessary. `make db-migrate` is retained only as a legacy path.

## Development Workflow

Before changing backend schema, sync, events/replay, offline forms, scheduling, questionnaire routing, or admin corrections, read the relevant current documentation:

- [domain glossary](CONTEXT.md)
- [architecture](docs/architecture.md)
- [active policies](docs/README.md)
- [testing guide](docs/testing.md)

Keep these boundaries intact:

- finalized CRFs are immutable evidence;
- backend processing is authoritative;
- offline Expo behavior must converge with backend processing after sync;
- shared domain, event, context, and workflow rules belong in `packages/` rather than being duplicated across apps;
- archived documentation under `docs/archive/` is historical, not current policy.

## Verification

Run the smallest relevant checks for the change. Common commands are:

```bash
npm --workspace @dynamic/api test
npm --workspace @dynamic/api run typecheck
npm --workspace @dynamic/event-core test
npm --workspace @dynamic/event-core run typecheck
npm --workspace expo test
```

Repository-wide entry points are also available:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Database, schema, sync, or runtime changes should additionally pass:

```bash
make db-reset-full
make db-smoke
```

For UI changes, verify the affected workflow in the browser or app as well as running automated checks. See [docs/testing.md](docs/testing.md) for the command matrix and backend integration-test setup.

## Build and Run the Android App

### Prerequisites

In addition to the general project prerequisites, install:

- Android Studio and the Android SDK;
- Android SDK Platform 36 and Build Tools 36.0.0;
- JDK 17 or 21 (the documented build was verified with OpenJDK 21); and
- an Android Virtual Device or a USB-connected Android device.

Confirm that the command-line tools can see the SDK and any running device:

```bash
echo "$ANDROID_HOME"
adb devices -l
emulator -list-avds
```

On macOS, the default SDK path is usually `$HOME/Library/Android/sdk`. Add its `platform-tools` and `emulator` directories to `PATH` if `adb` or `emulator` cannot be found.

### Configure the API address

Create the local Expo environment file from the checked-in template:

```bash
cp expo/.env.example expo/.env
```

For the standard Android Emulator, set:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3310/api/v1
```

Android uses `10.0.2.2` to reach the development computer's localhost. A physical device must instead use the computer's LAN address and be able to reach that address over the local network. `EXPO_PUBLIC_` values are embedded in the app bundle and must never contain secrets.

Start the supporting services and API before testing login or sync:

```bash
make dev-prepare
make backend-up
```

### Generate the native Android project

From the repository root, generate `expo/android` when it does not already exist:

```bash
cd expo
npx expo prebuild --platform android --no-install
cd ..
```

Expo reads the Android application ID from `expo.android.package` in `expo/app.json`. Confirm that identifier before distributing a build. Prebuild generates native files from Expo configuration; do not use `--clean` if the native project contains intentional manual changes that have not been preserved elsewhere.

### Compile a test release APK

Build the Android release variant from the generated native project:

```bash
cd expo/android
NODE_ENV=production ./gradlew assembleRelease
cd ../..
```

The APK is written to:

```text
expo/android/app/build/outputs/apk/release/app-release.apk
```

A successful build ends with `BUILD SUCCESSFUL`. The current generated release configuration signs this APK with the Android debug key. It is suitable for local testing and internal verification, but it is not a Play Store production artifact. A production release requires a protected upload keystore or an EAS Build signing configuration.

### Install and launch on an emulator

Start an available AVD in one terminal. The repository has been verified with `Pixel_7_API_36`:

```bash
emulator -avd Pixel_7_API_36
```

After the emulator finishes booting, install and launch the APK from another terminal:

```bash
adb devices -l
adb install -r expo/android/app/build/outputs/apk/release/app-release.apk
adb shell monkey \
  -p com.drguptavivek.dynamicfieldapp \
  -c android.intent.category.LAUNCHER \
  1
```

If the application ID changes in `expo/app.json`, replace `com.drguptavivek.dynamicfieldapp` in the launch command with the new ID. Use `adb logcat` to investigate startup or runtime failures.

### Rebuild after changes

JavaScript and asset changes are bundled again by `assembleRelease`. When native dependencies or Expo plugins change, rerun Expo prebuild before Gradle:

```bash
cd expo
npx expo prebuild --platform android --no-install
cd android
NODE_ENV=production ./gradlew assembleRelease
```

## Status, Logs, and Shutdown

```bash
make dev-status
make dev-logs
make dev-stop
```

PostgreSQL, Redis, and Nginx logs are available through Make targets. API, Admin, and Expo are host-run during development, so their logs stream in the foreground terminal and are not written to host log files.

If a service is already using a development port, check `make dev-status` and use the corresponding `*-stop` or `*-restart` target. If database ports are not bound correctly, run `make db-recreate`.

## Before Hand-off

Before handing a change to another developer:

1. Run the checks appropriate to the changed area.
2. Verify affected UI behavior at the rendered application layer.
3. Review the diff and avoid including unrelated worktree changes.
4. Update architecture, policy, testing, or changelog documentation when behavior or developer expectations changed.
