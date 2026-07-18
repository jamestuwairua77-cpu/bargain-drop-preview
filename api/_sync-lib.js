// Shared helpers for CJ↔Shopify sync.
// No external deps — just fetch + Node built-ins.

export const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'bargain-drop-8194.myshopify.com';
export const SHOPIFY_TOKEN  = process.env.SHOPIFY_ACCESS_TOKEN || '';
export const CJ_API_KEY     = process.env.CJ_ACCESS_TOKEN || '';
export const SHOPIFY_API    = `https://${SHOPIFY_DOMAIN}/admin/api/2025-10`;
export const CJ_BASE        = 'https://developers.cjdropshipping.com/api2.0/v1';

// ─── CJ auth (cache token in-memory across warm invocations) ───────────
let _cjToken = null, _cjExp = 0;
export async function cjToken() {
  if (_cjToken && Date.now() < _cjExp) return _cjToken;
  if (!CJ_API_KEY) throw new Error('CJ_ACCESS_TOKEN not configured');
  const r = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: CJ_API_KEY }),
  });
  const j = await r.json();
  const tok = j?.data?.accessToken;
  if (!tok) throw new Error('CJ auth failed: ' + (j?.message || JSON.stringify(j)));
  _cjToken = tok;
  // CJ tokens last ~15 days; refresh after 12h to be safe.
  _cjExp = Date.now() + 12 * 3600 * 1000;
  return tok;
}

export async function cjFetch(path, opts = {}) {
  const tok = await cjToken();
  const r = await fetch(`${CJ_BASE}${path}`, {
    ...opts,
    headers: { 'CJ-Access-Token': tok, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  return r.json();
}

export async function shopifyFetch(path, opts = {}) {
  if (!SHOPIFY_TOKEN) throw new Error('SHOPIFY_ACCESS_TOKEN not configured');
  const r = await fetch(`${SHOPIFY_API}${path}`, {
    ...opts,
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { ok: r.ok, status: r.status, body };
}

// Simple CORS boilerplate.
export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Shopify-Hmac-Sha256, X-Shopify-Topic');
}

// Persist tracking/orders to /tmp (survives warm invocations, ephemeral across cold starts).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
export const DATA_DIR = '/tmp/data';
export const ORDERS_FILE = '/tmp/data/orders.json';
export const TRACKING_FILE = '/tmp/data/tracking.json';
export const SYNC_LOG_FILE = '/tmp/data/sync-log.json';

export function loadJSON(path, def = []) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(path)) return def;
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch { return def; }
}
export function saveJSON(path, data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}
export function appendSyncLog(entry) {
  const log = loadJSON(SYNC_LOG_FILE, []);
  log.unshift({ ...entry, at: new Date().toISOString() });
  saveJSON(SYNC_LOG_FILE, log.slice(0, 200));
}

// Find a Shopify order by our BD order id (stored in note_attributes).
export async function findShopifyOrderByBDId(bdId) {
  const { body } = await shopifyFetch(`/orders.json?status=any&limit=250`);
  return (body.orders || []).find(o =>
    (o.note_attributes || []).some(a => a.name === 'bd_order_id' && a.value === bdId)
  ) || null;
}

// Build the CJ createOrderV2 body from a Shopify order.
export function shopifyToCjOrder(shopOrder) {
  const sa = shopOrder.shipping_address || {};
  const bdId = (shopOrder.note_attributes || []).find(a => a.name === 'bd_order_id')?.value
             || `SH${shopOrder.id}`;
  return {
    orderNumber: bdId,
    shippingCountryCode: sa.country_code || 'AU',
    shippingCountry: sa.country || 'Australia',
    shippingProvince: sa.province || '',
    shippingCity: sa.city || '',
    shippingZip: sa.zip || '',
    shippingPhone: sa.phone || shopOrder.phone || '',
    shippingCustomerName: `${sa.first_name || ''} ${sa.last_name || ''}`.trim() || 'Customer',
    shippingAddress: [sa.address1, sa.address2].filter(Boolean).join(' '),
    email: shopOrder.email || shopOrder.contact_email || '',
    remark: `Shopify order ${shopOrder.name}`,
    platform: 'shopify',
    fromCountryCode: 'CN',
    logisticName: 'CJPacket Ordinary',
    products: (shopOrder.line_items || []).map((li, i) => ({
      vid: (li.properties || []).find(p => p.name === 'cj_vid')?.value || li.sku || null,
      quantity: li.quantity || 1,
      storeLineItemId: `${bdId}-${i}`,
    })),
  };
}
