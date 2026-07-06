# Issue: Configure SDK Dependencies for RevenueCat and Superwall

Status: ready-for-agent

## Parent

PRD: `docs/prd/paywall-native-integration.md`

## What to build

Install the required Capacitor plugins for processing native transactions and displaying paywalls:
- Install `@revenuecat/purchases-capacitor`.
- Install `superwall-capacitor`.
- Sync iOS and Android platforms via `npx cap sync` using the correct environment.

## Acceptance criteria

- [ ] `@revenuecat/purchases-capacitor` added to `package.json`.
- [ ] `superwall-capacitor` added to `package.json`.
- [ ] `npx cap sync` executes successfully for both iOS and Android.
- [ ] Native platform configurations (CocoaPods on iOS, Gradle plugins on Android) build without compilation errors.

## Blocked by

None - can start immediately.
