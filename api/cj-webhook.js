// Enhanced CJ Dropshipping Webhook — saves tracking + syncs to Shopify + sends email
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = '/tmp/data';
const ORDERS_FILE = '/tmp/data/orders.json';
const TRACKING_FILE = '/tmp/data/tracking.json';

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadJSON(path) {
  try {
    ensureDir();
    if (!existsSync(path)) return [];
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) { return []; }
}

function saveJSON(path, data) {
  ensureDir();
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    const tracking = loadJSON(TRACKING_FILE);
    return res.status(200).json({ tracking, count: tracking.length });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SENDGRID_KEY = process.env.SENDGRID_API_KEY || '';
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
  const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';
  const FROM_EMAIL = 'orders@bargain-drop.online';

  const results = { tracking_saved: false, shopify_updated: false, email_sent: false };

  try {
    const payload = req.body;
    const eventType = payload.event || payload.type || 'unknown';
    const orderNumber = payload.orderNumber || payload.order_number || '';
    const trackingNumber = payload.trackingNumber || payload.tracking_number || '';
    const logisticName = payload.logisticName || payload.logistics_name || '';
    const customerEmail = payload.email || payload.customer_email || '';
    const trackingUrl = trackingNumber ? `https://track.17track.net/en#nums=${trackingNumber}` : '';

    // ── 1. SAVE TRACKING LOCALLY ─────────────────────────
    if (trackingNumber && orderNumber) {
      const tracking = loadJSON(TRACKING_FILE);
      const existing = tracking.find(t => t.order_number === orderNumber);
      const entry = {
        order_number: orderNumber,
        tracking_number: trackingNumber,
        logistic_name: logisticName,
        tracking_url: trackingUrl,
        event: eventType,
        updated_at: new Date().toISOString()
      };

      if (existing) {
        Object.assign(existing, entry);
      } else {
        tracking.push(entry);
      }
      saveJSON(TRACKING_FILE, tracking);
      results.tracking_saved = true;

      // Update the order status
      const orders = loadJSON(ORDERS_FILE);
      const order = orders.find(o => o.id === orderNumber || o.cj_order_id === orderNumber);
      if (order) {
        order.status = 'shipped';
        order.tracking_number = trackingNumber;
        order.tracking_url = trackingUrl;
        order.logistic_name = logisticName;
        order.shipped_at = new Date().toISOString();
        saveJSON(ORDERS_FILE, orders);
      }
    }

    // ── 2. SYNC TRACKING TO SHOPIFY ──────────────────────
    if (SHOPIFY_TOKEN && trackingNumber && orderNumber) {
      try {
        // Find Shopify order by BD order ID in note_attributes
        const shopOrders = await fetch(
          `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders.json?status=any&limit=50`,
          { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
        );
        const shopData = await shopOrders.json();
        const shopOrder = (shopData.orders || []).find(o => {
          const bdId = (o.note_attributes || []).find(a => a.name === 'bd_order_id');
          return bdId && bdId.value === orderNumber;
        });

        if (shopOrder) {
          // Create fulfillment in Shopify
          const fulfillmentRes = await fetch(
            `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders/${shopOrder.id}/fulfillments.json`,
            {
              method: 'POST',
              headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fulfillment: {
                  location_id: shopOrder.location_id || null,
                  tracking_number: trackingNumber,
                  tracking_company: logisticName,
                  tracking_urls: [trackingUrl],
                  notify_customer: false,
                  line_items: (shopOrder.line_items || []).map(li => ({ id: li.id }))
                }
              })
            }
          );
          const fulfData = await fulfillmentRes.json();
          results.shopify_updated = !fulfData.errors;
        }
      } catch (e) {
        results.shopify_error = e.message;
      }
    }

    // ── 3. SEND CUSTOMER EMAIL ────────────────────────────
    if (trackingNumber && customerEmail && SENDGRID_KEY) {
      try {
        await fetch('https://api.sendgrid.net/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SENDGRID_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            personalizations: [{
              to: [{ email: customerEmail }],
              subject: `Your Bargain Drop Order #${orderNumber} Has Shipped! 🚚`
            }],
            from: { email: FROM_EMAIL, name: 'Bargain Drop' },
            content: [{
              type: 'text/html',
              value: `<div style="max-width:500px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
                <h2 style="color:#111">🎉 Your Order Has Shipped!</h2>
                <p>Great news — your Bargain Drop order is on the way!</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0">
                  <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Order</td><td style="padding:8px;border-bottom:1px solid #eee">#${orderNumber}</td></tr>
                  <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Carrier</td><td style="padding:8px;border-bottom:1px solid #eee">${logisticName || 'Standard Shipping'}</td></tr>
                  <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">Tracking</td><td style="padding:8px;border-bottom:1px solid #eee;font-family:monospace">${trackingNumber}</td></tr>
                </table>
                <a href="${trackingUrl}" style="display:inline-block;padding:14px 32px;background:#111;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">📦 Track Your Package</a>
                <p style="margin-top:24px;color:#777;font-size:13px">Thank you for shopping with Bargain Drop! Questions? Reply to this email.</p>
                <p style="color:#777;font-size:12px">Tracking may take 24-48 hours to activate after shipment.</p>
              </div>`
            }]
          })
        });
        results.email_sent = true;
      } catch (e) {
        results.email_error = e.message;
      }
    }

    // ── FINAL ────────────────────────────────────────────
    res.status(200).json({
      success: true,
      event: eventType,
      results,
      message: `Webhook processed. Tracking: ${results.tracking_saved ? 'saved' : 'none'}, Shopify: ${results.shopify_updated ? 'updated' : 'skipped'}, Email: ${results.email_sent ? 'sent' : 'skipped'}`
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}
