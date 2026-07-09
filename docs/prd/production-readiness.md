# PRD: Production Readiness Improvements

## Problem Statement

As Splat prepares for production release on iOS and Android, there are several user experience, stability, and developer operation gaps that need to be resolved. Specifically:
1. **OCR Failures**: If scanning fails, users are locked out from adding items manually during that flow.
2. **Network Resilience**: Poor connectivity blocks initialization of key APIs and the billing SDK, leading to potential app crashes or poor feedback.
3. **Regional Limits**: Users in different countries cannot split bills in their local currencies when entering manually or when OCR misidentifies symbols.
4. **Data Loss Risks**: Actions like resetting the app or running a new scan immediately overwrite current splits without user confirmation.
5. **Typescript Warnings**: Isolated Vercel serverless builds generate compiler warnings due to missing Node process type scope references.

## Solution

Implement a series of stabilization features and guardrails across the app to secure production quality:
- Add a "Skip & Edit Manually" flow to allow creating splits without receipt scanning.
- Detect connection state and degrade gracefully when billing or OCR is offline.
- Add a manual currency override menu to configure local currency symbols.
- Introduce user confirmation dialogs before complete split resets or scan overrides.
- Silence compilation warnings in isolated serverless functions.

## User Stories

1. As a Splat user, I want to quickly skip receipt scanning if my receipt is crumpled or unreadable, so that I can type in my items manually and still split the bill.
2. As a traveler in Europe, I want to override the default dollar symbol to Euro (€), so that my shared summary text prints the correct currency denomination.
3. As an active app user, I want a warning prompt before the app resets, so that I don't lose 10 minutes of manual item allocation by an accidental misclick.
4. As a developer, I want a clean build execution report on Vercel with zero TypeScript type warnings.

## Implementation Decisions

### Modules to Build/Modify

#### 1. Client-Side (Vue 3 App)
- **Manual Skip Action**: Add a fallback button next to the camera capture section to bypass OCR and jump directly to Step 2.
- **Offline / Error State Indicators**: Monitor connection states and disable the "Scan Receipt" trigger if offline, alerting users with clean feedback.
- **Currency Dropdown Selector**: Add a PrimeVue-styled dropdown containing standard global currency symbols next to the bill name input in Step 2.
- **Confirmation Alerts**: Update the reset action handler and scan upload paths to check for existing items/participants and show confirmation prompts if true.

#### 2. Backend / Types (Vercel Serverless)
- **Typings Scope**: Add local typings scope declarations (`declare const process: any;`) at the top of serverless handler entry points to satisfy Vercel's independent compilation engine.

## Testing Decisions

- **Flow Validation**: Verify that skipping OCR populates an empty split state and transitions to Step 2 correctly.
- **Prompt Verification**: Verify confirmation modals appear when attempting to scan a new bill or reset while active splits are present.
- **Local Dev Checks**: Ensure the mock billing flow behaves gracefully under network emulation limits.

## Out of Scope

- Multi-currency conversions and real-time exchange rate calculations.
