# Issue: Darken and Blur Paywall Modal Backdrop

Status: closed

## Parent

PRD: `docs/prd/mobile-status-and-paywall-improvements.md`

## What to build

Enhance the visual focus of the paywall subscription popup by modifying the modal mask style in `src/style.css`.
- Target the Dialog overlay mask classes (`.p-dialog-mask`, `.p-overlay-mask`, `.p-component-overlay`).
- Set the background overlay color to a darker tone (`rgba(0, 0, 0, 0.75)`).
- Apply a glassmorphic blur effect using `backdrop-filter: blur(4px)`.

This ensures that the screen content behind the paywall popup is completely obscured and blurred out, preventing visual distractions.

## Acceptance criteria

- [ ] Dialog mask overlay background is styled with a darker semi-transparent color (`rgba(0, 0, 0, 0.75)`).
- [ ] Backdrop blur (`blur(4px)`) is applied and active on the overlay mask.
- [ ] The background content of the app is visually obscured and blurred when the paywall modal is shown.
- [ ] Styling does not cause layout shifting or rendering issues in light/dark modes.

## Blocked by

None - can start immediately.
