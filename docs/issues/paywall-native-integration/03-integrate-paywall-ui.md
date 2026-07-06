# Issue: Integrate Superwall Paywall UI

Status: ready-for-agent

## Parent

PRD: `docs/prd/paywall-native-integration.md`

## What to build

Hook the UI triggers to present Superwall instead of the custom HTML dialog on native platforms:
- In `src/App.vue`, update `triggerCamera` and `triggerGallery` when `isScanLimitReached` is true.
- Replace calls to `store.showPaywall = true` with `Superwall.present()` on native platforms.
- Wire purchase event handlers: when Superwall registers a successful checkout transaction, refresh usage limits from the backend API.
- Keep the current PrimeVue custom paywall Dialog as a fallback for web platform development.

## Acceptance criteria

- [ ] Native platform camera/gallery locked clicks trigger Superwall paywall display.
- [ ] Successful purchases update local `store.usageInfo` state.
- [ ] Web/browser platform falls back gracefully to the existing custom PrimeVue paywall dialog.

## Blocked by

- `docs/issues/paywall-native-integration/02-initialize-sdk-client.md`
