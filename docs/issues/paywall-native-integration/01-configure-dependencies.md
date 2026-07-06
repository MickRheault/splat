# Issue: Configure SDK Dependencies for RevenueCat

Status: closed

## Parent

PRD: `docs/prd/paywall-native-integration.md`

## What to build

Install the required Capacitor plugin for processing native store transactions:
- Install `@revenuecat/purchases-capacitor` via npm.
- Sync iOS and Android platforms via `npx cap sync` using the correct environment.

## Acceptance criteria

- [ ] `@revenuecat/purchases-capacitor` added to `package.json`.
- [ ] `npx cap sync` executes successfully for both iOS and Android.
- [ ] Native platform configurations (CocoaPods on iOS, Gradle plugins on Android) build without compilation errors.

## Blocked by

None - can start immediately.
