# Issue: Offline and Billing SDK Initialization Resilience

Status: open

## Parent

PRD: `docs/prd/production-readiness.md`

## What to build

Improve stability and user feedback when offline or when the billing SDK fails to initialize:
- Monitor network connectivity state or catch RevenueCat initialization errors.
- If offline or billing initialization fails, display a clean, non-intrusive warning notice.
- Disable camera scan triggers and alert the user: "Network Connection Required to Scan. Tap 'Enter Manually' instead."
- Disable or hide buy actions on the paywall screen if the billing client is offline.

## Acceptance criteria

- [ ] App catches and handles RevenueCat initialization failures gracefully without crashing.
- [ ] Scanning actions are disabled when offline or when API dependencies are unreachable.
- [ ] Paywall purchase options show an explanatory message and disable action buttons if the network is unavailable.
