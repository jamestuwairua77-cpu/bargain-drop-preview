const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN || '';
const SHOPIFY_DOMAIN = 'bargain-drop-8194.myshopify.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = 'jamestuwairua77-cpu/bargain-drop-preview';

// 14 category data files
const CATEGORY_FILES = {
  'Home, Garden & Furniture': 'home-garden-furniture.json',
  'Jewelry & Watches': 'jewelry-watches.json',
  'Health, Beauty & Hair': 'health-beauty-hair.json',
  'Consumer Electronics': 'consumer-electronics.json',
  'Automobiles & Motorcycles': 'automobiles-motorcycles.json',
  'Home Improvement': 'home-improvement.json',
  'Sports & Outdoors': 'sports-outdoors.json',
  'Pet Supplies': 'pet-supplies.json',
  "Women's Clothing": 'womens-clothing.json',
  'Toys, Kids & Babies': 'toys-kids-babies.json',
  'Bags & Shoes': 'bags-shoes.json',
  'Phones & Accessories': 'phones-accessories.json',
  "Men's Clothing": 'mens-clothing.json',
  'Other': 'other.json'
};

// CJ parent category → our 14 categories
const CJ_MAP = {
  'Home, Garden & Furniture': 'Home, Garden & Furniture',
  'Home & Garden': 'Home, Garden & Furniture',
  'Home Storage': 'Home, Garden & Furniture',
  'Kitchen, Dining & Bar': 'Home, Garden & Furniture',
  'Home Textiles': 'Home, Garden & Furniture',
  'Arts, Crafts & Sewing': 'Home, Garden & Furniture',
  'Festive & Party Supplies': 'Home, Garden & Furniture',
  'Jewelry & Watches': 'Jewelry & Watches',
  'Jewelry': 'Jewelry & Watches',
  'Watches': 'Jewelry & Watches',
  'Fashion Jewelry': 'Jewelry & Watches',
  'Fine Jewelry': 'Jewelry & Watches',
  'Health, Beauty & Hair': 'Health, Beauty & Hair',
  'Beauty & Personal Care': 'Health, Beauty & Hair',
  'Health & Beauty': 'Health, Beauty & Hair',
  'Skin Care': 'Health, Beauty & Hair',
  'Makeup': 'Health, Beauty & Hair',
  'Hair Care & Styling': 'Health, Beauty & Hair',
  'Bath & Body': 'Health, Beauty & Hair',
  'Nail Art & Tools': 'Health, Beauty & Hair',
  'Consumer Electronics': 'Consumer Electronics',
  'Electronics': 'Consumer Electronics',
  'Computer & Office': 'Consumer Electronics',
  'Camera & Photo': 'Consumer Electronics',
  'Video & Audio': 'Consumer Electronics',
  'Smart Electronics': 'Consumer Electronics',
  'Accessories & Parts': 'Consumer Electronics',
  'Office Electronics': 'Consumer Electronics',
  'Security & Protection': 'Consumer Electronics',
  'Automobiles & Motorcycles': 'Automobiles & Motorcycles',
  'Automobiles, Parts & Accessories': 'Automobiles & Motorcycles',
  'Interior Accessories': 'Automobiles & Motorcycles',
  'Exterior Accessories': 'Automobiles & Motorcycles',
  'Motorcycle Accessories & Parts': 'Automobiles & Motorcycles',
  'Car Electronics': 'Automobiles & Motorcycles',
  'Home Improvement': 'Home Improvement',
  'Home Appliances': 'Home Improvement',
  'Lighting': 'Home Improvement',
  'Lights & Lighting': 'Home Improvement',
  'Household Sensors & Alarms': 'Home Improvement',
  'Plumbing': 'Home Improvement',
  'Sports & Outdoors': 'Sports & Outdoors',
  'Sports & Entertainment': 'Sports & Outdoors',
  'Fitness & Body Building': 'Sports & Outdoors',
  'Cycling': 'Sports & Outdoors',
  'Swimming': 'Sports & Outdoors',
  'Fishing': 'Sports & Outdoors',
  'Outdoor Recreation': 'Sports & Outdoors',
  'Camping & Hiking': 'Sports & Outdoors',
  'Sneakers': 'Sports & Outdoors',
  'Pet Supplies': 'Pet Supplies',
  'Pet Outdoor Supplies': 'Pet Supplies',
  'Dog Supplies': 'Pet Supplies',
  'Cat Supplies': 'Pet Supplies',
  'Bird Supplies': 'Pet Supplies',
  'Fish Supplies': 'Pet Supplies',
  "Women's Clothing": "Women's Clothing",
  'Tops & Sets': "Women's Clothing",
  'Dresses': "Women's Clothing",
  'Outerwear & Jackets': "Women's Clothing",
  'Pants & Capris': "Women's Clothing",
  'Skirts': "Women's Clothing",
  'Intimates': "Women's Clothing",
  'Activewear': "Women's Clothing",
  'Swimwear': "Women's Clothing",
  'Sweaters & Cardigans': "Women's Clothing",
  'Accessories': "Women's Clothing",
  'Toys, Kids & Babies': 'Toys, Kids & Babies',
  'Toys & Hobbies': 'Toys, Kids & Babies',
  'Mother & Kids': 'Toys, Kids & Babies',
  'Baby & Mother': 'Toys, Kids & Babies',
  'Baby Clothing': 'Toys, Kids & Babies',
  'Shoes & Bags': 'Toys, Kids & Babies',
  'Bags & Shoes': 'Bags & Shoes',
  'Luggage & Bags': 'Bags & Shoes',
  'Footwear': 'Bags & Shoes',
  'Shoes': 'Bags & Shoes',
  "Women's Luggage & Bags": 'Bags & Shoes',
  "Women's Shoes": 'Bags & Shoes',
  "Men's Shoes": 'Bags & Shoes',
  'Phones & Accessories': 'Phones & Accessories',
  'Phones & Telecommunications': 'Phones & Accessories',
  'Mobile Phones': 'Phones & Accessories',
  'Phone Accessories': 'Phones & Accessories',
  'Phone Cases & Covers': 'Phones & Accessories',
  "Men's Clothing": "Men's Clothing",
  'T-Shirts': "Men's Clothing",
  'Shirts': "Men's Clothing",
  'Pants': "Men's Clothing",
  'Hoodies & Sweatshirts': "Men's Clothing",
  'Outerwear': "Men's Clothing",
  'Hats & Caps': "Men's Clothing",
  'Suits & Blazers': "Men's Clothing",
  'Shorts': "Men's Clothing",
  'Jeans': "Men's Clothing",
  'Underwear': "Men's Clothing",
};

function mapToCategory(productType, tags, vendor, title) {
  // Try product_type first
  if (productType && CJ_MAP[productType]) return CJ_MAP[productType];
  
  // Try tags (they often contain category hints like "home-garden-and-furniture")
  if (tags) {
    for (const [key, cat] of Object.entries(CJ_MAP)) {
      const slug = key.toLowerCase().replace(/[&,]/g, '').replace(/\s+/g, '-');
      if (tags.toLowerCase().includes(slug)) return cat;
    }
  }
  
  // Try matching title keywords
  if (title) {
    const t = title.toLowerCase();
    if (/ring|necklace|bracelet|earring|pendant|jewelry/.test(t)) return 'Jewelry & Watches';
    if (/dress|blouse|skirt|women.*clothing|ladies/.test(t)) return "Women's Clothing";
    if (/men.*shirt|men.*pant|men.*jacket|men.*shorts/.test(t)) return "Men's Clothing";
    if (/phone|iphone|samsung|case.*phone|charger/.test(t)) return 'Phones & Accessories';
    if (/shoes|sneakers|boots|sandals|bag.*women|purse/i.test(t)) return 'Bags & Shoes';
    if (/pet|dog|cat|bird|fish/.test(t)) return 'Pet Supplies';
    if (/table|lamp|chair|sofa|furniture|bed|mattress|rug|carpet/.test(t)) return 'Home, Garden & Furniture';
    if (/makeup|lipstick|cream|serum|shampoo|beauty|nail/.test(t)) return 'Health, Beauty & Hair';
    if (/car|motorcycle|auto|tire|automotive/.test(t)) return 'Automobiles & Motorcycles';
    if (/toy|kids|baby|children|doll|lego/.test(t)) return 'Toys, Kids & Babies';
    if (/sport|fitness|gym|yoga|camping|outdoor/.test(t)) return 'Sports & Outdoors';
  }
  
  return 'Other';
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const page = parseInt(req.query.page || req.body?.page || '1');
  const action = req.query.action || req.body?.action || 'sync';
  
  if (action === 'status') {
    try {
      const countUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/products/count.json`;
      const countResp = await fetch(countUrl, {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
      });
      const countData = await countResp.json();
      return res.json({ success: true, shopify_count: countData.count });
    } catch(e) {
      return res.json({ success: false, error: e.message });
    }
  }
  
  if (action === 'sync') {
    try {
      // Pull one page of 250 products
      const productsUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/products.json?limit=250&page=${page}&fields=id,title,body_html,vendor,product_type,tags,variants,images,image,status,created_at`;
      
      const resp = await fetch(productsUrl, {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
      });
      
      if (!resp.ok) {
        return res.json({ success: false, error: `Shopify returned ${resp.status}`, page });
      }
      
      const data = await resp.json();
      const products = data.products || [];
      
      // Categorize products and build output
      const categories = {};
      
      for (const p of products) {
        // Skip placeholder/test products
        if (p.title && p.title.startsWith('$p')) continue;
        if (!p.title || !p.vendor) continue;
        
        const category = mapToCategory(p.product_type, p.tags, p.vendor, p.title);
        
        if (!categories[category]) categories[category] = [];
        
        // Clean up product data for our format
        const price = p.variants?.[0]?.price || '0';
        const compareAt = p.variants?.[0]?.compare_at_price || null;
        
        categories[category].push({
          id: p.id,
          title: p.title,
          body_html: p.body_html || '',
          vendor: p.vendor,
          product_type: p.product_type,
          category: category,
          tags: p.tags || '',
          image: p.image?.src || null,
          images: (p.images || []).map(img => img.src),
          price: parseFloat(price),
          compare_at_price: compareAt ? parseFloat(compareAt) : null,
          variants: (p.variants || []).map(v => ({
            id: v.id,
            title: v.title,
            price: parseFloat(v.price || '0'),
            compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
            sku: v.sku || ''
          })),
          status: p.status
        });
      }
      
      // Push each category's products to their respective file in GitHub
      const results = [];
      
      for (const [cat, prods] of Object.entries(categories)) {
        const filename = CATEGORY_FILES[cat] || 'other.json';
        
        // Get existing file to merge
        let existing = [];
        try {
          const existingResp = await fetch(
            `https://raw.githubusercontent.com/${GITHUB_REPO}/main/data/${filename}`
          );
          if (existingResp.ok) {
            const existingData = await existingResp.json();
            existing = existingData.products || [];
          }
        } catch(e) {}
        
        // Merge: upsert by ID
        const existingMap = new Map(existing.map(p => [p.id, p]));
        for (const p of prods) {
          existingMap.set(p.id, p);
        }
        
        const merged = Array.from(existingMap.values());
        
        // Get file SHA
        const shaResp = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/data/${filename}`,
          { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } }
        );
        const shaData = await shaResp.json();
        const sha = shaData.sha;
        
        // Push update
        const content = JSON.stringify({
          category: cat,
          product_count: merged.length,
          products: merged
        }, null, 2);
        
        const pushResp = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/data/${filename}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              message: `sync: add ${prods.length} products to ${cat} (page ${page})`,
              content: Buffer.from(content).toString('base64'),
              sha: sha,
              branch: 'main'
            })
          }
        );
        
        results.push({
          category: cat,
          file: filename,
          added: prods.length,
          total: merged.length,
          status: pushResp.ok ? 'ok' : `error ${pushResp.status}`
        });
        
        // Rate limit
        await new Promise(r => setTimeout(r, 1000));
      }
      
      return res.json({
        success: true,
        page,
        products_processed: products.length,
        products_added: Object.values(categories).reduce((sum, p) => sum + p.length, 0),
        results
      });
      
    } catch(e) {
      return res.json({ success: false, error: e.message, page });
    }
  }
  
  return res.json({ usage: 'GET ?action=status or POST {action:"sync", page:1}' });
}
