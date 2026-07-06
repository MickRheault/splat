# Issue: Integrate RevenueCat Billing UI Actions

Status: closed

## Parent

PRD: `docs/prd/paywall-native-integration.md`

## What to build

Hook the current custom PrimeVue paywall dialog buttons to execute native purchases on mobile platforms:
- In `src/App.vue`, update the click handlers for the purchase option items (e.g. 7-Day Pass, Yearly Pro).
- When a user clicks a purchase button on native platforms:
  - Invoke `Purchases.purchasePackage` or `Purchases.purchaseProduct` using the package/product configuration from RevenueCat.
  - On transaction success, update local store usage information.
- Provide a "Restore Purchases" button inside the paywall Dialog that calls `Purchases.restoreTransactions()` to sync past transactions.
- Keep current client-side mock purchase validation logic intact as a fallback for local web-development.

## Acceptance criteria

- [ ] Custom paywall Dialog option buttons trigger native purchase flows on iOS/Android platforms.
- [ ] Successful purchases update local `store.usageInfo` state.
- [ ] "Restore Purchases" button is present and executes native entitlement restoration.
- [ ] Web/browser platform falls back gracefully to the existing mock purchase endpoint.

## Blocked by

- `docs/issues/paywall-native-integration/02-initialize-sdk-client.md`
