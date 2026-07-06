# Issue: Implement Backend Webhook Endpoint for RevenueCat

Status: closed

## Parent

PRD: `docs/prd/paywall-native-integration.md`

## What to build

Create a secure Vercel API endpoint `/api/revenuecat-webhook.ts` to capture and process billing webhook events sent by RevenueCat:
- Verify the Authorization header token sent by RevenueCat to guarantee the payload is authentic.
- Extract `app_user_id` (the device ID) and event type from the payload.
- Update the corresponding device record in the database:
  - If a user has purchased a 7-Day Pass (`trip` entitlement active), set `passType` to `'trip'`.
  - If a user has purchased a Yearly subscription (`yearly` entitlement active), set `passType` to `'yearly'`.
  - If the entitlement expires or is cancelled, clear the `passType` to `null`.
- Return a 200 response to acknowledge successful receipt of the webhook.

## Acceptance criteria

- [ ] Webhook serverless handler `/api/revenuecat-webhook.ts` created.
- [ ] Validates the RevenueCat authorization secret correctly.
- [ ] Correctly resolves device IDs and writes the entitlement update to the database.
- [ ] Entitlement expirations update database records to lock features when limits are reached.

## Blocked by

- `docs/issues/paywall-native-integration/02-initialize-sdk-client.md`
