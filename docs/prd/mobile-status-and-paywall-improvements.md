# PRD: Native Back Button, Final Splits Spacing, and Paywall Overlay Improvements

## Problem Statement

Users encounter three distinct friction points when using the app:
1. **Accidental App Exits**: On mobile platforms (Android/iOS), pressing the system back button immediately exits the app regardless of what split step they are currently on. This causes accidental loss of split progress.
2. **Cluttered Final Splits**: On Step 4 (Final Splits screen), participant totals are visually crowded and stack on top of each other, making the neobrutalist block shadows hard to distinguish and creating visual noise.
3. **Distracting Paywall Overlay**: When the paywall popup appears, the background content remains highly visible and distracting, drawing focus away from the upgrade/subscription actions.

## Solution

1. **System Back Button Interception**: Integrate the Capacitor `@capacitor/app` plugin to listen to system back button presses. If the user is on any screen other than the Capture step (homepage), navigate them back one step. If they are on the Capture step, exit the app.
2. **Spacious Final Splits**: Increase the vertical gap between rows on the Final Splits screen to `gap-5` (20px) to ensure clear separation and make the neobrutalist box shadows fully visible. (Note: Spacing already pre-implemented in client codebase).
3. **Darkened and Blurred Paywall Backdrop**: Style the Dialog mask overlay to be darker (`rgba(0, 0, 0, 0.75)`) and add a modern blur effect (`backdrop-filter: blur(4px)`) to completely obscure background content and draw focus to the paywall.

## User Stories

1. As a mobile app user, I want the system back button to go back one step when I am on the Edit Items, Participants, or Cost Allocation screens, so that I can correct errors without losing my current split data.
2. As a mobile app user, I want the system back button to close the app when I am on the Capture screen, so that I can exit the app normally.
3. As a user viewing the final splits on Step 4, I want sufficient vertical space between each participant's row, so that I can easily distinguish individual totals and appreciate the clean shadow styles.
4. As a user prompted with the paywall, I want the background content to be darkened and blurred, so that I can focus entirely on selecting a pass or subscription without background distraction.

## Implementation Decisions

### Modules to Modify
- **`src/App.vue`**: 
  - Install and import `@capacitor/app`.
  - Add native `backButton` event listener inside the `onMounted` lifecycle hook.
  - Intercept back button presses and trigger `goBack()` if `store.step !== 'capture'`, else call `App.exitApp()`.
  - Ensure Step 4 grid/flex container uses `flex flex-col gap-5`.
- **`src/style.css`**:
  - Style the overlay mask classes (`.p-dialog-mask`, `.p-overlay-mask`, `.p-component-overlay`) with a darker background (`rgba(0, 0, 0, 0.75)`) and `backdrop-filter: blur(4px)`.

### Dependencies
- Add `@capacitor/app` plugin.

## Testing Decisions

- **Manual Testing on Mobile platforms**:
  - Verify pressing back button on Edit Items step goes back to Capture step.
  - Verify pressing back button on Capture step exits the app.
  - Verify paywall modal overlay is visually dark and blurred.
- **Unit/Integration Tests**:
  - Verify math and store logic remains unaffected.

## Out of Scope
- Custom in-app back buttons (other than the standard stepper navbar back buttons).
- Dynamic customization of the paywall blur intensity.
- Custom back button handling for specific sub-dialogs (e.g. participant quick names picker).
