// Save order to server-side persistence
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = '/tmp/data';
const ORDERS_FILE = '/tmp/data/orders.json';

function loadOrders() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(ORDERS_FILE)) return [];
    return JSON.parse(readFileSync(ORDERS_FILE, 'utf-8'));
  } catch(e) { return []; }
}

function saveOrders(orders) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ORDERS_FILE, JSON.stringify(orders));
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const orders = loadOrders();
    return res.status(200).json({ orders });
  }

  if (req.method === 'POST') {
    const { order } = req.body;
    if (!order || !order.id) return res.status(400).json({ error: 'Missing order.id' });
    const orders = loadOrders();
    const idx = orders.findIndex(o => o.id === order.id);
    if (idx >= 0) {
      orders[idx] = { ...orders[idx], ...order, _updated: new Date().toISOString() };
    } else {
      orders.push({ ...order, _created: new Date().toISOString() });
    }
    saveOrders(orders);
    return res.status(200).json({ success: true, id: order.id });
  }
}
