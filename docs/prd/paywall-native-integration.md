# PRD: Native Paywall Integration (RevenueCat Only)

## Problem Statement

The current paywall and scan limitation mechanism is hardcoded and mocked in the frontend client. Users are presented with a mock overlay dialogue, and clicking purchase makes a client-initiated mock purchase call. This does not allow processing real payments through Apple App Store (iOS) or Google Play Store (Android) and is vulnerable to client-side spoofing.

## Solution

Integrate a native billing pipeline using **RevenueCat** (for processing native App Store and Google Play transactions and receipt validation).
- Use the Capacitor plugin for RevenueCat (`@revenuecat/purchases-capacitor`).
- Keep the current custom HTML/CSS paywall interface in `App.vue` instead of using external paywall rendering tools.
- Maintain a simple anonymous layout using the device ID as the user identifier.
- Securely update purchase and subscription status via a RevenueCat webhook targeting our Vercel serverless backend.

## User Stories

1. As a mobile app user on iOS/Android, I want to purchase a 7-Day Pass or Yearly subscription natively using Apple In-App Purchase or Google Play Billing, so that my checkout is fast, secure, and familiar.
2. As a mobile app user, I want my active purchases to be loaded instantly when the app boots, so that I don't experience paywall lockouts when I have active scans.
3. As a developer, I want purchase fulfillment to be verified securely on the server, so that users cannot bypass scan limits.

## Implementation Decisions

### Modules to Build/Modify

#### 1. Client-Side (Capacitor Vue 3 App)
- **SDK Initialization**:
  - Register and initialize `@revenuecat/purchases-capacitor` inside `App.vue` `onMounted`.
  - Pass the Capacitor anonymous device ID as the App User ID to RevenueCat.
- **Paywall Interception**:
  - Keep the current PrimeVue custom paywall Dialog in `App.vue`.
  - When the user taps a purchase button inside the paywall Dialog, invoke `Purchases.purchasePackage` or `Purchases.purchaseDiscountedProduct` from the RevenueCat Capacitor SDK.
  - On purchase success, refresh usage limits from the backend API.
- **Subscription State Sync**:
  - Update `store.usageInfo` based on the purchase success callbacks.

#### 2. Backend (Vercel API)
- **Fulfillment Webhook**:
  - Create a new serverless endpoint `/api/revenuecat-webhook`.
  - Listen to RevenueCat events (e.g. `INITIAL_PURCHASE`, `RENEWAL`, `EXPIRATION`, `RESTORE`).
  - Read the `app_user_id` (device ID) and entitlement states.
  - Securely update the user's `passType` and subscription state in the database.

## Testing Decisions

- **Direct Sandbox Testing**:
  - Use Apple Sandbox testing accounts on iOS simulator/device and Google License Test accounts on Android emulator/device to verify native purchase sheets.
- **Webhook Simulation**:
  - Verify webhook signature validation and database entitlement updates using local mock requests.
- **Regression Tests**:
  - Verify that mock development modes (`dev_unlimited` in simulated usage) still function properly for local development.

## Out of Scope

- User authentication accounts (logins via email, Google, Apple) — billing remains tied to the physical device ID.
- Web-based Stripe checkout on the mobile platform.
