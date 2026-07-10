# Bargain Drop — CJ ↔ Shopify Sync

Full two-way sync between CJ Dropshipping and Shopify.

## Data flow

```
                       ┌────────────────────────┐
                       │   bargain-drop.online  │
                       │   (storefront pages)   │
                       └────────────┬───────────┘
                                    │ checkout
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
             /api/shopify-order              /api/cj-order
             creates Shopify order           creates CJ order
                     │                             │
                     └──────── stored in ──────────┘
                       /tmp/data/orders.json
                       (id ↔ cj_order_id ↔ shopify_order_id)


  CJ ships ──────► /api/cj-webhook ──► Shopify fulfillment + email + local status
                                         (fallback: /api/sync-cj-orders polls)

  Shopify event ──► /api/shopify-webhook ──► if direct sale: creates CJ order
                                              if cancel:      cancels CJ order
                                              if refund:      marks local refunded
```

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/shopify-order` | POST | Create Shopify + CJ order (storefront checkout) |
| `/api/cj-order` | POST | Create CJ order directly |
| `/api/cj-webhook` | POST | CJ push: tracking → Shopify fulfillment + email |
| `/api/shopify-webhook` | POST | Shopify push: mirror direct sales, cancels, refunds → CJ |
| `/api/sync-products` | POST | CJ → Shopify catalog sync (SKU-matched, multi-variant) |
| `/api/sync-inventory` | POST | CJ stock → Shopify inventory levels |
| `/api/sync-cj-orders` | POST | Poll CJ for open orders (catches missed webhooks) |
| `/api/track-order?order_id=` | GET | Customer tracking lookup |
| `/api/register-shopify-webhooks` | POST | One-shot Shopify webhook registration |
| `/api/cron-sync?task=` | GET | Vercel cron entry (task=inventory/orders/all) |
| `/api/setup-shopify` | GET | OAuth setup page |

## One-time setup (after deploy)

1. Set env vars in Vercel:
   ```
   CJ_ACCESS_TOKEN=…
   SHOPIFY_ACCESS_TOKEN=…
   SHOPIFY_DOMAIN=bargain-drop-8194.myshopify.com
   SHOPIFY_WEBHOOK_SECRET=…       # from Shopify webhook settings
   STRIPE_SECRET_KEY=…
   SENDGRID_API_KEY=…             # optional, for shipment emails
   ```

2. Register Shopify webhooks:
   ```
   curl -X POST https://bargain-drop.online/api/register-shopify-webhooks
   ```
   Registers: orders/create, orders/updated, orders/cancelled, refunds/create, fulfillments/create, fulfillments/update.

3. Set CJ notification URL to `https://bargain-drop.online/api/cj-webhook` in CJ dashboard.

4. Initial product sync (paginate — 50 per POST):
   ```
   curl -X POST https://bargain-drop.online/api/sync-products -H 'content-type: application/json' -d '{"page":1,"limit":50}'
   ```

## Scheduled sync

Configured in `vercel.json`:
- `03:00 UTC daily` — inventory refresh (all Shopify SKUs → CJ stock)
- `every 6h` — order status poll (backup for missed CJ webhooks)

## Order ID convention

- BD order id: `BD<base36-timestamp>`  ← primary key across all systems
- Stored in Shopify `note_attributes[bd_order_id]`
- Stored in CJ `orderNumber`
- Mapping table: `/tmp/data/orders.json` (ephemeral — see caveat below)

## Caveats

- `/tmp` is per-invocation ephemeral on Vercel. For durable state, move to Vercel KV / Postgres.
  The sync system is resilient to loss: `/api/sync-cj-orders` re-hydrates by scanning open Shopify orders.
- CJ has no true refund API — refunds mark local status only; refund the CJ order manually if not yet shipped.
- Shopify inventory sync uses SKU exact match; ensure CJ VID/SKU is stored in Shopify variant `sku` field.
- HMAC verification uses `SHOPIFY_WEBHOOK_SECRET` env var; if unset, verification is bypassed (dev only).
