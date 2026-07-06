# Issue: Initialize SDK Clients on App Mount

Status: ready-for-agent

## Parent

PRD: `docs/prd/paywall-native-integration.md`

## What to build

Implement initialization logic for the RevenueCat and Superwall clients inside the application:
- Load the Capacitor anonymous device ID as early as possible.
- In `src/App.vue`'s `onMounted` hook, configure and initialize the `Purchases` client from `@revenuecat/purchases-capacitor`.
- Initialize the `Superwall` client from `superwall-capacitor` using the active API keys.
- Set the active User ID in RevenueCat and Superwall to be the anonymous device ID.

Ensure that all initialization calls are protected with Capacitor native platform checks to avoid breaking browser/web environments.

## Acceptance criteria

- [ ] RevenueCat SDK is initialized with valid API keys for iOS/Android inside Vue lifecycle hooks.
- [ ] Superwall SDK is initialized with valid API keys for iOS/Android.
- [ ] User ID for billing sessions matches the device UUID.
- [ ] Application mounts and runs on web platform without throwing "missing native plugin" errors.

## Blocked by

- `docs/issues/paywall-native-integration/01-configure-dependencies.md`
