# Issue: Integrate Native Back Button Support

Status: closed

## Parent

PRD: `docs/prd/mobile-status-and-paywall-improvements.md`

## What to build

Install the `@capacitor/app` package and register a listener inside `src/App.vue`'s `onMounted` hook to intercept system back button presses on mobile devices.
- If the current step is `'capture'` (homepage), call `App.exitApp()` to let the app close.
- If the current step is not `'capture'`, call the internal `goBack()` navigation method to move to the previous split step.

Ensure the listener is properly wrapped in `Capacitor.isNativePlatform()` checks to avoid browser console errors.

## Acceptance criteria

- [ ] `@capacitor/app` package is added to dependencies and platform project files are synced.
- [ ] Pressing the native back button on Android/iOS when on the homepage (Capture step) closes/exits the app.
- [ ] Pressing the native back button on Android/iOS when on any other step (Edit, Participants, Allocation) goes back one step instead of closing the app.
- [ ] Application compiles and works correctly on web and native platforms.

## Blocked by

None - can start immediately.
