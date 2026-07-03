export default async function handler(req, res) {
  const API = process.env.CJ_ACCESS_TOKEN || '';

  async function getToken() {
    const r = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ apiKey: API })
    }); return (await r.json()).data?.accessToken || null; }

  try {
    const t = await getToken(); if (!t) return res.status(500).json({ error: 'CJ auth failed' });

    const act = req.query.action || 'categories';
    if (act === 'categories') {
      const data = await fetch('https://developers.cjdropshipping.com/api2.0/v1/product/getCategory', { headers: {'CJ-Access-Token': t } }).then(r=>r.json());
      if (data.code !== 200) return res.status(400).json({ error: data.message });
      const flat = []; data.data.forEach(c1 => {
        (c1.categoryFirstList||[]).forEach(c2 => {
          (c2.categorySecondList||[]).forEach(c3 => flat.push({
            first: c1.categoryFirstName, second: c2.categorySecondName,
            third: c3.categoryName, categoryId: c3.categoryId
          })); }); });
      res.status(200).json({ success: true, count: flat.length, categories: flat });
    } else if (act === 'search') {
      const kw = req.query.keyword || '', pg = parseInt(req.query.page)||1, sz = Math.min(parseInt(req.query.size)||20,100);
      let url = 'https://developers.cjdropshipping.com/api2.0/v1/product/listV2?page=' + pg + '&size=' + sz;
      if (kw) url += '&' + new URLSearchParams({ keyWord: kw }).toString();
      const data = await fetch(url, { headers: {'CJ-Access-Token': t } }).then(r=>r.json());
      if (data.code !== 200) return res.status(400).json({ error: data.message });
      res.status(200).json({
        success: true, page: pg, size: sz,
        total: data.data?.totalRecords || 0,
        products: (data.data?.content[0]?.productList || []).map(p => ({
          pid: p.id, name: p.nameEn || '', sku: p.sku,
          price: p.sellPrice, category: p.categoryId,
          image: p.bigImage || ''
        }))
      });
    } else if (act === 'variant') {
      const pid = req.query.pid; if (!pid) return res.status(400).json({ error: 'pid required' });
      const data = await fetch('https://developers.cjdropshipping.com/api2.0/v1/product/variant/query?pid=' + pid, { headers: {'CJ-Access-Token': t } }).then(r=>r.json());
      if (data.code === 200) {
        res.status(200).json({ success: true, pid,
          variants: (data.data || []).map(v => ({
            vid: v.vid, name: v.variantNameEn || '',
            price: v.variantSellPrice, sku: v.variantSku
          })) });
      } else res.status(400).json({ error: data.message });
    } else res.status(400).json({ error: 'Use action: categories, search, variant' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
}