export default async function handler(req, res) {
  const API_KEY = process.env.CJ_ACCESS_TOKEN || '';

  async function getCJToken() {
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: API_KEY })
    });
    const d = await r.json();
    return d.code === 200 ? d.data.accessToken : null;
  }

  async function cjCall(path, token) {
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1' + path, {
      headers: { 'CJ-Access-Token': token }
    });
    return r.json();
  }

  try {
    const token = await getCJToken();
    if (!token) return res.status(500).json({ error: 'CJ auth failed' });

    const action = req.query.action || 'categories';
    let result;

    if (action === 'categories') {
      const data = await cjCall('/product/getCategory', token);
      if (data.code === 200) {
        const flat = [];
        data.data.forEach(cat1 => {
          (cat1.categoryFirstList || []).forEach(cat2 => {
            (cat2.categorySecondList || []).forEach(cat3 => {
              flat.push({
                first: cat1.categoryFirstName,
                second: cat2.categorySecondName,
                third: cat3.categoryName,
                categoryId: cat3.categoryId
              });
            });
          });
        });
        result = { success: true, count: flat.length, categories: flat };
      } else {
        result = { success: false, error: data.message };
      }
    } else if (action === 'search') {
      const keyword = req.query.keyword || '';
      const page = parseInt(req.query.page) || 1;
      const size = Math.min(parseInt(req.query.size) || 20, 100);
      const categoryId = req.query.categoryId || '';

      let url = `/product/listV2?page=${page}&size=${size}`;
      if (keyword) url += `&amp;KeyWord=${encodeURIComponent(keyword)}`;
      if (categoryId) url += `&amp;categoryId=${encodeURIComponent(categoryId)}`;

      const data = await cjCall(url, token);
      if (data.code === 200) {
        result = {
          success: true,
          page: page,
          size: size,
          total: data.data?.total || 0,
          products: (data.data?.list || []).map(p => ({
            pid: p.pid,
            name: p.productNameEn || p.productName,
            sku: p.productSku,
            price: p.sellPrice,
            category: p.categoryName,
            variants: (p.variants || []).map(v => ({
              vid: v.vid,
              name: v.variantNameEn || v.variantName || '',
              price: v.variantSellPrice || p.sellPrice,
              stock: v.variantStock || 0,
              sku: v.variantSku
            })),
            images: (p.images || []).slice(0, 5)
          }))
        };
      } else {
        result = { success: false, error: data.message };
      }
    } else if (action === 'variant') {
      const pid = req.query.pid || '';
      if (!pid) return res.status(400).json({ error: 'pid required' });
      const data = await cjCall(`/product/variant/query?pid=${pid}`, token);
      if (data.code === 200) {
        result = {
          success: true,
          pid: pid,
          variants: (data.data || []).map(v => ({
            vid: v.vid,
            name: v.variantNameEn || v.variantName || '',
            price: v.variantSellPrice,
            stock: v.variantStock || 0,
            sku: v.variantSku
          }))
        };
      } else {
        result = { success: false, error: data.message };
      }
    } else {
      return res.status(400).json({ error: 'Use: categories, search, variant' });
    }

    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}