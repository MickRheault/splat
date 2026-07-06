# Issue: Initialize RevenueCat SDK Client on App Mount

Status: closed

## Parent

PRD: `docs/prd/paywall-native-integration.md`

## What to build

Implement initialization logic for the RevenueCat client inside the application:
- Load the Capacitor anonymous device ID as early as possible.
- In `src/App.vue`'s `onMounted` hook, configure and initialize the `Purchases` client from `@revenuecat/purchases-capacitor`.
- Set the active User ID in RevenueCat to be the anonymous device ID.

Ensure that all initialization calls are protected with Capacitor native platform checks to avoid breaking browser/web environments.

## Acceptance criteria

- [ ] RevenueCat SDK is initialized with valid API keys for iOS/Android inside Vue lifecycle hooks.
- [ ] User ID for billing sessions matches the device UUID.
- [ ] Application mounts and runs on web platform without throwing "missing native plugin" errors.

## Blocked by

- `docs/issues/paywall-native-integration/01-configure-dependencies.md`
