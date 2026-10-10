# Paddle Billing sandbox setup

This integration is sandbox-only. Configure the following variables in the **staging API environment** using Paddle Sandbox values; do not put live credentials in staging or copy these values into production:

- `PADDLE_SANDBOX_API_KEY`: Paddle Sandbox server-side API key with transaction read/write and price read access.
- `PADDLE_SANDBOX_CLIENT_TOKEN`: Paddle Sandbox client-side token (the safe `test_` token, never an API key).
- `PADDLE_SANDBOX_WEBHOOK_SECRET`: secret shown for the Sandbox notification destination.
- `PADDLE_SANDBOX_STARTER_PRICE_ID`: Sandbox recurring annual USD price ID for Starter, amount `29900` (USD cents).
- `PADDLE_SANDBOX_PROFESSIONAL_PRICE_ID`: Sandbox recurring annual USD price ID for Professional, amount `49900` (USD cents).

Create separate Paddle Sandbox products/prices with a one-year recurring billing cycle. Keep Business as Contact Sales. Checkout also checks that the configured price is USD, annual, and matches the current plan catalog before it creates a transaction. All five variables are optional at application startup; online checkout and webhooks are unavailable until all five are configured.

In the Paddle **Sandbox** dashboard, create a notification destination pointing to the public staging API origin plus this exact path:

`POST https://<staging-api-host>/api/webhooks/paddle`

Subscribe it to these events:

- `transaction.completed` (the only event that marks an invoice paid and activates/renews a workspace)
- `subscription.updated`
- `subscription.past_due`
- `subscription.canceled`
- `subscription.resumed`
- `subscription.activated`

The endpoint verifies the `Paddle-Signature` against the raw request body. Paddle retries are deduplicated by event ID. Subscription lifecycle events synchronize provider identifiers/payment state and never independently activate an unpaid invoice or send a second activation email. The existing lifecycle notification queue remains responsible for customer notifications.

A workspace Owner opens an issued, payment-reported, or overdue Starter/Professional invoice under Billing and selects **Pay with Paddle (Sandbox)**. Free-trial signup remains cardless and does not open a Paddle checkout.
