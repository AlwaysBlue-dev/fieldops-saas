# Paddle Billing sandbox setup

This integration is sandbox-only. Configure the following variables in the **staging API environment** using Paddle Sandbox values; do not put live credentials in staging or copy these values into production:

- `PADDLE_SANDBOX_API_KEY`: Paddle Sandbox server-side API key with transaction read/write and price read access.
- `PADDLE_SANDBOX_CLIENT_TOKEN`: Paddle Sandbox client-side token (the safe `test_` token, never an API key).
- `PADDLE_SANDBOX_WEBHOOK_SECRET`: secret shown for the Sandbox notification destination.
- `PADDLE_SANDBOX_STARTER_PRICE_ID`: Sandbox recurring annual USD price ID for Starter, amount `29900` (USD cents).
- `PADDLE_SANDBOX_PROFESSIONAL_PRICE_ID`: Sandbox recurring annual USD price ID for Professional, amount `49900` (USD cents).

Create separate Paddle Sandbox products/prices with a one-year recurring billing cycle. Set a default payment link in the Paddle Sandbox account so Paddle can open the hosted checkout. Keep Business as Contact Sales. Checkout also checks that the configured price is USD, annual, and matches the current plan catalog before it creates a transaction. All five variables are optional at application startup; online checkout and webhooks are unavailable until all five are configured.

Apply the new migration `20261012090000_paddle_adjustment_states` before deploying the webhook/history updates. Do not use production credentials or a production webhook destination.

In the Paddle **Sandbox** dashboard, create a notification destination pointing to the public staging API origin plus this exact path:

`POST https://api-staging.fieldkeel.com/api/webhooks/paddle`

Subscribe it to these events:

- `transaction.completed` (verified payment; this is the event that marks the invoice paid and activates the first paid period)
- `transaction.payment_failed`
- `subscription.updated`
- `subscription.past_due`
- `subscription.canceled`
- `subscription.resumed`
- `subscription.activated`
- `adjustment.created`
- `adjustment.updated`

The endpoint verifies the `Paddle-Signature` against the raw request body. Paddle retries are deduplicated by event ID. Subscription lifecycle events synchronize cancellation and past-due state but never independently activate an unpaid invoice. Refund and chargeback events update linked invoice status and notify the organization Owner/Admin and platform team. Event IDs are claimed transactionally before notifications are queued. The existing lifecycle notification queue remains responsible for customer notifications.

A workspace Owner opens an issued or overdue Starter/Professional invoice under Billing and selects **Pay by Card**. Card checkout opens Paddle Sandbox and annual recurring billing begins only after a verified `transaction.completed` webhook. Manual invoice/bank transfer remains separate and requires platform verification. Free-trial signup remains cardless and does not open a Paddle checkout.


## Owner billing portal

An organization Owner can open **Manage billing and invoices** in Billing after a Paddle subscription has been linked. FieldKeel creates a fresh, authenticated Paddle customer portal session on demand using the organization subscription's stored Paddle customer and subscription IDs; session URLs are temporary and are never stored. The portal provides payment-method updates, subscription cancellation, transaction history, and Paddle-generated invoice downloads. No additional environment variables or database migration are required for this portal link.

The endpoint is `POST /api/organizations/:organizationId/paddle-portal`. It requires an authenticated active organization membership with the `OWNER` role. The organization and Paddle IDs come from the verified request context and database, not request input. Ensure the sandbox API key has `customer_portal_session.write` permission.

Refunds and disputes remain visible as verified adjustment events and invoice statuses. FieldKeel does not automatically terminate workspace access on an adjustment: workspace entitlement continues to follow the existing paid-through/grace rules until an explicit refund/dispute access policy is adopted. Paddle's customer portal is the source for customer-facing receipt/invoice PDFs for Paddle transactions; FieldKeel's billing history records payment and adjustment status.
