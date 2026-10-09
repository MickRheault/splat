# Billing verification and test environments

Splat keeps its no-login flow. Web requests use the saved `splat_dev_device_id`;
native RevenueCat configuration keeps the existing Capacitor device ID as
`appUserID`. This change does not transfer or rename existing customers.

## Production setup before merging

Set these server variables on the existing Vercel project:

| Variable | Purpose |
| --- | --- |
| `BILLING_ENV=production` | Default when unset; disables mock activation and reset |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Existing production Redis database |
| `REVENUECAT_SECRET_API_KEY` | RevenueCat **secret API v1 key** for customer lookup; never a `VITE_*` variable |
| `REVENUECAT_WEBHOOK_SECRET` | Required shared webhook authorization secret |
| `GEMINI_API_KEY` | Server-only receipt parsing credential |
| `FREE_SCANS_LIMIT`, `IP_DAILY_FREE_SCANS_LIMIT` | Existing quota settings; defaults remain 3/month and 20/day per network |

Configure RevenueCat's webhook URL as
`https://<your-api-host>/api/revenuecat-webhook`, with authorization header
`Bearer <REVENUECAT_WEBHOOK_SECRET>`. Enable purchase, renewal, non-renewing
purchase, expiration, cancellation, billing issue, product change, extension,
and transfer events. The handler refreshes authoritative customer state;
it does not derive a pass from the event's claimed entitlement or expiry. The
existing immediate revocation behavior is preserved when the verified subscription
reports cancellation (`unsubscribe_detected_at`), a billing issue, or a refund. Restore does
not reactivate that subscription while the flag remains. A different cancellation
or grace-period policy requires a separate product decision.

The OTA GitHub Actions job selects the **Production** GitHub environment.
Configure `VITE_REVENUECAT_ANDROID_API_KEY` and `VITE_REVENUECAT_IOS_API_KEY` as
**environment secrets** there. These must contain the platform's public SDK keys;
the server's `sk_` secret is not a frontend key. The release fails before bumping
or building if either SDK key is empty, a dummy value, or a server secret. Vercel
environment settings alone do not supply keys to the GitHub OTA build.

Keep `VITE_API_BASE_URL` as currently configured. Leave `VITE_BILLING_TEST_MODE`
and `VITE_ENABLE_DEV_MENU` unset or `false` in production, including OTA builds.
Do not configure `VITE_GEMINI_API_KEY` in a deployed build. Merging triggers the
existing deployment/OTA workflows; configure server settings first. This PR does
not change Vercel settings.

## Purchase, restore, and migration

Native purchases, restores, and startup receipt sync call `POST /api/sync-purchase`
with `{ "deviceId": "existing-app-user-id" }`. The client never sends a paid-pass
type to authorize OCR. Real web payments are not implemented: the previous web
purchase button invoked the test endpoint. It now explains that purchases are
available in the native apps. Web free OCR and manual splitting remain supported.

The server reads RevenueCat's customer record using
[`GET /v1/subscribers/{app_user_id}`](https://www.revenuecat.com/docs/api-v1/customers).
Known product IDs are `splat_14day_trip` and `splat_yearly_pro` (including Android
base-plan suffixes). Verified products linked to `trip` or `yearly` entitlements
are supported too. Production accepts production receipts; local/staging accept
sandbox receipts. Use a staging-targeted native build for TestFlight/store sandbox
QA, rather than granting sandbox passes in production.

A subscription uses its verified expiration date. A non-renewing purchase without
an expiry gets 14 or 365 days **from its verified purchase date**. Restore,
reinstall, repeated webhooks, and startup never restart that clock. RevenueCat
non-subscription entitlements can be permanent, so the app's fixed duration is
applied on the server rather than trusting the SDK's historical product list.

Verified records use `verified-pass:v1:<deviceId>`. Existing `pass:<deviceId>`
strings are untrusted and reconciled against RevenueCat on first usage/OCR access;
they are deleted only after successful verification. Legitimate purchases retain
their verified remaining duration. An expired historical purchase grants no new
pass. A fresh verified transaction can grant a new pass.

Verification is cached for five minutes, with the original expiry checked on
every request. Webhooks and explicit purchase/restore sync refresh it immediately.
Redis failures, missing credentials when verification is required, malformed
verification responses, and verification timeouts return `503 BILLING_UNAVAILABLE`
before requesting Gemini. A valid cached pass can work without another RevenueCat
request. The app shows a retry message; manual splitting remains available.

## Isolated local/staging tests

Use a dedicated test Redis database and environment-scoped server credentials.
The test code never falls back to production Redis credentials.

```dotenv
BILLING_ENV=local
# Use staging for a dedicated Vercel preview project instead.
BILLING_TEST_NAMESPACE=qa
BILLING_TEST_MODE=true
BILLING_TEST_KV_REST_API_URL=<test-database-url>
BILLING_TEST_KV_REST_API_TOKEN=<test-database-token>
REVENUECAT_SECRET_API_KEY=<test-environment-secret-key>
REVENUECAT_WEBHOOK_SECRET=<test-environment-webhook-secret>
GEMINI_API_KEY=<test-environment-provider-key>
VITE_BILLING_TEST_MODE=true
VITE_ENABLE_DEV_MENU=true
VITE_API_BASE_URL=<local-or-staging-api-url>
```

Test keys are prefixed `billing-test:<namespace>:`. Activation/reset requires
both a trusted `BILLING_ENV` and `BILLING_TEST_MODE=true`. Local mode allows no
Vercel deployment or `VERCEL_ENV=development`; staging allows no deployment or
`VERCEL_ENV=preview`. `VERCEL_ENV=production` rejects test configuration.
`NODE_ENV=production` does not disable intentional staging tests.

The hidden dev menu changes only the isolated server test state. Failed requests
never show a successful client-only activation. Test builds must explicitly target
the test API host, especially on physical native devices. `npm run dev` serves only
the Vite frontend; use `vercel dev` for local server functions, or point a native
QA build at the dedicated staging API.

## Validation and remaining boundaries

Run `npm test` and `npm run build`; the build also type-checks server handlers.
Handler tests mock Redis, RevenueCat, and Gemini. Native SDK calls are mocked;
no live purchases or production database writes are exercised by the tests.

Device IDs remain caller-controlled identifiers, not authentication. This patch
closes the missing-ID and client-pass bypasses; it does not establish account
ownership or stop ID spoofing. Cross-device ownership/transfer rules, refund
policy, fair-use policy, and failed-scan charging remain separate product decisions.
Atomic concurrent quota reservation remains separate technical work. Existing quotas and charging behavior are
preserved in this change.

References: [RevenueCat customer schema](https://www.revenuecat.com/docs/api-v1/customer-info-model),
[Google Play product IDs](https://www.revenuecat.com/docs/getting-started/entitlements/android-products),
and [webhook handling](https://www.revenuecat.com/docs/integrations/webhooks).
