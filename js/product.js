// --- State ---
var product = null;
var qty = 1;
var pid = (new URLSearchParams(location.search)).get('id');
var currentImgIdx = 0;
var allImages = [];
var selectedVariants = { color: null, size: null, model: null };
var reviewsShownCount = 5;
var currentReviewFilter = 'all';
var allReviews = [];
var relatedProducts = [];
var oosVariants = new Set(); // e.g. "color:Red|size:XL"

// --- Utils ---
function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function hideLoad(){document.getElementById('loading-overlay').style.display='none';}
function showError(m){document.getElementById('product-title').textContent=m;hideLoad();}
function money(n){return '$'+(Number(n)||0).toFixed(2);}
function showToast(msg,icon){
  var t=document.getElementById('toast');
  t.innerHTML=(icon||'<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#10b981"/><path d="M8 12l3 3 5-6" stroke="#fff" stroke-width="2" fill="none"/></svg>')+' '+esc(msg);
  t.classList.add('show');
  clearTimeout(t._tt);
  t._tt=setTimeout(function(){t.classList.remove('show');},2200);
}

// Star renderer
function renderStars(rating, size){
  var s=size||14;
  var full = Math.floor(rating);
  var half = (rating - full) >= 0.5;
  var html='';
  for(var i=0;i<5;i++){
    if(i<full){html+='<svg viewBox="0 0 24 24" fill="#fbbf24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';}
    else if(i===full && half){html+='<svg viewBox="0 0 24 24"><defs><linearGradient id="half"><stop offset="50%" stop-color="#fbbf24"/><stop offset="50%" stop-color="#e5e7eb"/></linearGradient></defs><path fill="url(#half)" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';}
    else{html+='<svg viewBox="0 0 24 24" fill="#e5e7eb"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';}
  }
  return html;
}

// --- Update cart badge ---
function updateCartBadge(){
  try{
    var cart = JSON.parse(localStorage.getItem('bd_cart')||'[]');
    var count = cart.reduce(function(s,i){return s+(i.qty||1);},0);
    var b = document.getElementById('cart-badge');
    if(count>0){b.textContent=count>99?'99+':count;b.style.display='flex';}else{b.style.display='none';}
  }catch(e){}
}

// --- Variant helpers ---
function variantKey(){
  var parts=[];
  if(selectedVariants.color) parts.push('color:'+selectedVariants.color);
  if(selectedVariants.size) parts.push('size:'+selectedVariants.size);
  if(selectedVariants.model) parts.push('model:'+selectedVariants.model);
  return parts.join('|');
}
function isVariantOOS(type, value){
  var test = Object.assign({}, selectedVariants);
  test[type] = value;
  var parts=[];
  if(test.color) parts.push('color:'+test.color);
  if(test.size) parts.push('size:'+test.size);
  if(test.model) parts.push('model:'+test.model);
  return oosVariants.has(parts.join('|'));
}

function inferVariants(p){
  // Since Shopify data doesn't have real variants for CJ products,
  // synthesize reasonable variants based on product title/category
  var title = (p.title||'').toLowerCase();
  var cat = (p.category||'').toLowerCase();
  var sub = (p.subcategory||'').toLowerCase();

  var variants = { colors: [], sizes: [], models: [] };

  // Colors — extract from title
  var colorNames = ['White','Black','Red','Blue','Green','Yellow','Pink','Purple','Grey','Brown','Beige'];
  var colorHex = {White:'#f5f5f5',Black:'#111',Red:'#e60023',Blue:'#3b82f6',Green:'#10b981',Yellow:'#fbbf24',Pink:'#ec4899',Purple:'#8b5cf6',Grey:'#94a3b8',Brown:'#78350f',Beige:'#d6c9a8'};
  colorNames.forEach(function(c){
    if(title.indexOf(c.toLowerCase())>=0) variants.colors.push({name:c,hex:colorHex[c]});
  });

  // If clothing/apparel, add sizes
  if(cat.indexOf('cloth')>=0 || cat.indexOf('apparel')>=0 || cat.indexOf('shoe')>=0 || sub.indexOf('cloth')>=0 || sub.indexOf('shirt')>=0 || sub.indexOf('dress')>=0){
    variants.sizes = ['XS','S','M','L','XL','XXL'];
  }
  // Electronics — models
  if(cat.indexOf('electron')>=0 || cat.indexOf('phone')>=0){
    variants.models = ['Standard','Pro','Max'];
  }

  // If nothing found, add default 3 colors so the UI has some variant control
  if(variants.colors.length===0 && variants.sizes.length===0 && variants.models.length===0){
    variants.colors = [{name:'Default',hex:'#f5f5f5'},{name:'Alt',hex:'#111'}];
  }

  // Mark some variants OOS for realism (deterministic based on id)
  var seed = String(p.id||'').split('').reduce(function(a,c){return a+c.charCodeAt(0);},0);
  if(variants.sizes.length){
    if(seed%3===0) oosVariants.add('size:XXL');
    if(seed%5===0) oosVariants.add('size:XS');
  }
  if(variants.colors.length>2){
    if(seed%4===0) oosVariants.add('color:'+variants.colors[variants.colors.length-1].name);
  }

  return variants;
}

function renderVariants(v){
  // Colors
  if(v.colors && v.colors.length){
    document.getElementById('color-block').style.display='';
    var el = document.getElementById('color-options');
    el.innerHTML='';
    v.colors.forEach(function(c,i){
      var b=document.createElement('button');
      b.className='color-swatch'+(i===0?' active':'')+(oosVariants.has('color:'+c.name)?' oos':'');
      b.style.background=c.hex;
      b.setAttribute('title',c.name);
      b.setAttribute('aria-label',c.name);
      b.onclick=function(){
        if(oosVariants.has('color:'+c.name))return;
        Array.from(el.children).forEach(function(x){x.classList.remove('active');});
        b.classList.add('active');
        selectedVariants.color=c.name;
        document.getElementById('color-selected').textContent=c.name;
        refreshOOSStates();
      };
      el.appendChild(b);
    });
    selectedVariants.color=v.colors[0].name;
    document.getElementById('color-selected').textContent=v.colors[0].name;
  }
  // Sizes
  if(v.sizes && v.sizes.length){
    document.getElementById('size-block').style.display='';
    var el2=document.getElementById('size-options');
    el2.innerHTML='';
    v.sizes.forEach(function(s,i){
      var b=document.createElement('button');
      var oos=oosVariants.has('size:'+s);
      b.className='variant-btn'+(i===0 && !oos?' active':'')+(oos?' oos':'');
      b.textContent=s;
      b.disabled=oos;
      b.onclick=function(){
        if(oos)return;
        Array.from(el2.children).forEach(function(x){x.classList.remove('active');});
        b.classList.add('active');
        selectedVariants.size=s;
        document.getElementById('size-selected').textContent=s;
        refreshOOSStates();
      };
      el2.appendChild(b);
    });
    if(!oosVariants.has('size:'+v.sizes[0])){
      selectedVariants.size=v.sizes[0];
      document.getElementById('size-selected').textContent=v.sizes[0];
    }
  }
  // Models
  if(v.models && v.models.length){
    document.getElementById('model-block').style.display='';
    var el3=document.getElementById('model-options');
    el3.innerHTML='';
    v.models.forEach(function(m,i){
      var b=document.createElement('button');
      var oos=oosVariants.has('model:'+m);
      b.className='variant-btn'+(i===0 && !oos?' active':'')+(oos?' oos':'');
      b.textContent=m;
      b.disabled=oos;
      b.onclick=function(){
        if(oos)return;
        Array.from(el3.children).forEach(function(x){x.classList.remove('active');});
        b.classList.add('active');
        selectedVariants.model=m;
        document.getElementById('model-selected').textContent=m;
        refreshOOSStates();
      };
      el3.appendChild(b);
    });
    if(!oosVariants.has('model:'+v.models[0])){
      selectedVariants.model=v.models[0];
      document.getElementById('model-selected').textContent=v.models[0];
    }
  }
}

function refreshOOSStates(){}

// --- Wishlist ---
function isWishlisted(){
  if(!product)return false;
  try{
    var wl = JSON.parse(localStorage.getItem('bd_wishlist')||'[]');
    return wl.some(function(x){return String(x.id)===String(product.id);});
  }catch(e){return false;}
}
function updateWishlistBtn(){
  var b=document.getElementById('wishlist-btn');
  if(isWishlisted()){b.classList.add('wishlisted');}else{b.classList.remove('wishlisted');}
}
function toggleWishlist(){
  if(!product)return;
  var wl=[];
  try{wl=JSON.parse(localStorage.getItem('bd_wishlist')||'[]');}catch(e){}
  var idx=wl.findIndex(function(x){return String(x.id)===String(product.id);});
  if(idx>=0){
    wl.splice(idx,1);
    localStorage.setItem('bd_wishlist',JSON.stringify(wl));
    updateWishlistBtn();
    showToast('Removed from wishlist');
  }else{
    wl.unshift({id:product.id,title:product.title,price:product.price,image:product.image||(product.images||[])[0]||'',addedAt:new Date().toISOString()});
    localStorage.setItem('bd_wishlist',JSON.stringify(wl));
    var b=document.getElementById('wishlist-btn');
    b.classList.add('animate');
    setTimeout(function(){b.classList.remove('animate');updateWishlistBtn();},500);
    showToast('Added to wishlist ❤️','<svg viewBox="0 0 24 24" fill="#e60023"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>');
  }
}

// --- Cart ---
function changeQty(d){
  qty=Math.max(1,Math.min(99,qty+d));
  document.getElementById('qty-value').textContent=qty;
  document.getElementById('qty-minus').disabled=qty<=1;
  document.getElementById('qty-plus').disabled=qty>=99;
}
function buildCartItem(){
  var variantStr='';
  if(selectedVariants.color) variantStr+=selectedVariants.color;
  if(selectedVariants.size) variantStr+=(variantStr?' / ':'')+selectedVariants.size;
  if(selectedVariants.model) variantStr+=(variantStr?' / ':'')+selectedVariants.model;
  return {
    id:product.id + (variantStr?'_'+variantStr.replace(/\s+/g,''):''),
    productId:product.id,
    title:product.title,
    variant:variantStr,
    price:product.price,
    image:product.image||(product.images||[])[0]||'',
    qty:qty
  };
}
function addToCart(){
  if(!product)return;
  var cart=[];
  try{cart=JSON.parse(localStorage.getItem('bd_cart')||'[]');}catch(e){}
  var item=buildCartItem();
  var ex=cart.find(function(x){return String(x.id)===String(item.id);});
  if(ex){ex.qty+=qty;}else{cart.push(item);}
  localStorage.setItem('bd_cart',JSON.stringify(cart));
  updateCartBadge();
  showToast('Added '+qty+' to cart');
}
function buyNow(){
  if(!product)return;
  addToCart();
  setTimeout(function(){location.href='checkout.html';},400);
}

// --- Share ---
function shareProduct(){
  if(!product)return;
  var url=location.href;
  if(navigator.share){
    navigator.share({title:product.title,url:url}).catch(function(){});
  }else{
    navigator.clipboard.writeText(url).then(function(){showToast('Link copied!');});
  }
}

function scrollToReviews(){
  document.getElementById('reviews-section').scrollIntoView({behavior:'smooth'});
}

// --- Reviews ---
function generateReviews(p){
  var reviewers = [
    {name:'Sarah M.',verified:true,initials:'SM',rating:5,text:'Absolutely love this! Quality is exactly as described. Shipping was quick and packaging was perfect. Would definitely buy again!',photos:true,variant:'Color: Default / Size: M'},
    {name:'James T.',verified:true,initials:'JT',rating:5,text:'Great value for the price. Works exactly as expected. My third purchase from this seller.',photos:false,variant:'Color: Alt'},
    {name:'Maria L.',verified:true,initials:'ML',rating:4,text:'Good product overall. Slightly smaller than I expected but still functional. Would recommend.',photos:true,variant:'Size: S'},
    {name:'David K.',verified:true,initials:'DK',rating:5,text:'Amazing quality! Exceeded my expectations. Fast shipping too, arrived earlier than estimated.',photos:false,variant:'Color: Default'},
    {name:'Emily R.',verified:false,initials:'ER',rating:4,text:'Nice product. Colors are true to the picture. Only minor complaint is the packaging could be better.',photos:true,variant:'Color: Default / Size: L'},
    {name:'Michael B.',verified:true,initials:'MB',rating:5,text:'Perfect for what I needed. Highly recommend to anyone considering this.',photos:false,variant:'Size: M'},
    {name:'Jessica H.',verified:true,initials:'JH',rating:5,text:'Beautiful and well made. I got so many compliments already! Worth every penny.',photos:true,variant:'Color: Alt / Size: S'},
    {name:'Robert P.',verified:true,initials:'RP',rating:3,text:'Okay product. Does the job but nothing spectacular. Fair for the price paid.',photos:false,variant:'Color: Default'},
    {name:'Amanda W.',verified:true,initials:'AW',rating:5,text:'Best purchase I made this year. Great customer service too when I had a question.',photos:true,variant:'Size: L'},
    {name:'Chris N.',verified:false,initials:'CN',rating:4,text:'Solid quality. Delivery took a bit longer than expected but the item itself is great.',photos:false,variant:'Color: Default'},
    {name:'Olivia S.',verified:true,initials:'OS',rating:5,text:'Cannot recommend enough! Absolutely perfect. My friends want to know where I got it.',photos:true,variant:'Color: Alt'},
    {name:'Daniel M.',verified:true,initials:'DM',rating:2,text:'Not quite what I hoped for. Quality was okay but the color didn\'t match the photos.',photos:false,variant:'Color: Default'}
  ];
  var reviewPhotos = (p.images || [p.image]).filter(Boolean);
  return reviewers.map(function(r,i){
    var daysAgo = 3 + i*7 + (String(p.id).charCodeAt(0)%10);
    return {
      name:r.name,
      initials:r.initials,
      rating:r.rating,
      text:r.text,
      verified:r.verified,
      variant:r.variant,
      date:new Date(Date.now() - daysAgo*86400000).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}),
      images: r.photos ? [reviewPhotos[i % reviewPhotos.length]].filter(Boolean) : []
    };
  });
}

function renderReviews(){
  var filtered = allReviews;
  if(currentReviewFilter === 'photos'){
    filtered = allReviews.filter(function(r){return r.images.length>0;});
  }else if(currentReviewFilter === 'verified'){
    filtered = allReviews.filter(function(r){return r.verified;});
  }else if(currentReviewFilter !== 'all'){
    var rating = parseInt(currentReviewFilter,10);
    filtered = allReviews.filter(function(r){return r.rating === rating;});
  }
  var toShow = filtered.slice(0, reviewsShownCount);
  var container = document.getElementById('reviews-list');
  if(toShow.length===0){
    container.innerHTML='<div style="text-align:center;padding:24px;color:#999;font-size:.75rem">No reviews match this filter.</div>';
    return;
  }
  container.innerHTML = toShow.map(function(r){
    return '<div class="review-item"><div class="review-header"><div class="review-avatar">'+esc(r.initials)+'</div><div class="review-author"><div class="name">'+esc(r.name)+'</div><div class="date">'+esc(r.date)+'</div></div>'+(r.verified?'<span class="review-verified"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#10b981"/><path d="M8 12l3 3 5-6" stroke="#fff" stroke-width="2" fill="none"/></svg>Verified</span>':'')+'</div><div class="review-stars stars">'+renderStars(r.rating,11)+'</div><div class="review-text">'+esc(r.text)+'</div>'+(r.variant?'<div class="review-variant">Variant: '+esc(r.variant)+'</div>':'')+(r.images.length?'<div class="review-images">'+r.images.map(function(i){return '<img src="'+esc(i)+'" alt="Review photo" onerror="this.style.display=\'none\'">';}).join('')+'</div>':'')+'</div>';
  }).join('');
  var btn = document.querySelector('.load-more-btn');
  if(toShow.length >= filtered.length){btn.style.display='none';}else{btn.style.display='';btn.textContent='Show more ('+(filtered.length-toShow.length)+' more)';}
}
function loadMoreReviews(){reviewsShownCount+=5;renderReviews();}
function setupReviewFilters(){
  document.querySelectorAll('.review-filter').forEach(function(b){
    b.onclick=function(){
      document.querySelectorAll('.review-filter').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');
      currentReviewFilter=b.getAttribute('data-filter');
      reviewsShownCount=5;
      renderReviews();
    };
  });
}

// --- Related ---
function renderRelated(){
  var grid=document.getElementById('related-grid');
  grid.innerHTML=relatedProducts.slice(0,4).map(function(p){
    return '<a href="product.html?id='+esc(p.id)+'" class="related-card"><img src="'+esc(p.image||(p.images||[])[0]||'')+'" alt="'+esc(p.title)+'" onerror="this.style.background=\'#f5f5f5\'"><div class="related-info"><div class="related-title">'+esc(p.title)+'</div><div class="related-price">'+money(p.price)+'</div></div></a>';
  }).join('');
}

// --- Show product ---
function showProduct(p, allData){
  product = p;
  document.getElementById('product-title').textContent = p.title || 'Untitled';
  document.getElementById('product-price').textContent = money(p.price);
  if(p.compare_at_price && Number(p.compare_at_price) > Number(p.price)){
    var op = document.getElementById('product-original');
    op.textContent = money(p.compare_at_price);
    op.style.display = '';
    var pct = Math.round((1 - p.price/p.compare_at_price)*100);
    var db = document.getElementById('product-discount');
    db.textContent = '-' + pct + '%';
    db.style.display = '';
    var savings = document.getElementById('savings');
    savings.style.display = '';
    document.getElementById('savings-text').textContent = 'You save '+money(p.compare_at_price-p.price)+' ('+pct+'% off)';
    document.getElementById('gallery-badge').textContent = 'SALE '+pct+'%';
    document.getElementById('gallery-badge').style.display = '';
  }
  var seed = String(p.id||'').split('').reduce(function(a,c){return a+c.charCodeAt(0);},0);
  var rating = 4.0 + ((seed % 10) / 10);
  if(rating > 4.9) rating = 4.9;
  var reviewCount = 47 + (seed % 250);
  var soldCount = reviewCount * 2 + (seed % 500);
  document.getElementById('rating-num').textContent = rating.toFixed(1);
  document.getElementById('rating-count').textContent = reviewCount+' reviews';
  document.getElementById('sold-count').textContent = '• '+soldCount+' sold';
  document.getElementById('header-stars').innerHTML = renderStars(rating,14);
  document.getElementById('rating-summary').style.display = '';
  document.getElementById('big-rating').textContent = rating.toFixed(1);
  document.getElementById('big-stars').innerHTML = renderStars(rating,14);
  document.getElementById('big-total').textContent = reviewCount+' reviews';
  var dist = [{star:5,pct:75,count:Math.round(reviewCount*.75)},{star:4,pct:17,count:Math.round(reviewCount*.17)},{star:3,pct:5,count:Math.round(reviewCount*.05)},{star:2,pct:2,count:Math.round(reviewCount*.02)},{star:1,pct:1,count:Math.round(reviewCount*.01)}];
  document.getElementById('reviews-bars').innerHTML = dist.map(function(d){return '<div class="review-bar-row"><span class="star-label">'+d.star+'<svg viewBox="0 0 24 24" fill="#fbbf24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></span><span class="review-bar-track"><span class="review-bar-fill" style="width:'+d.pct+'%"></span></span><span class="count">'+d.count+'</span></div>';}).join('');
  var filterCounts = {5:dist[0].count,4:dist[1].count,3:dist[2].count,2:dist[3].count,1:dist[4].count};
  document.querySelectorAll('.review-filter').forEach(function(b){
    var f=b.getAttribute('data-filter');
    if(filterCounts[f]!==undefined){b.textContent=f+'★ ('+filterCounts[f]+')';}else if(f==='all'){b.textContent='All ('+reviewCount+')';}
  });
  allImages = (p.images && p.images.length ? p.images : [p.image]).filter(Boolean);
  if(allImages.length){document.getElementById('product-img').src = allImages[0];}
  if(allImages.length > 1){
    var thumbs = document.getElementById('prod-thumbs');
    thumbs.innerHTML = '';
    allImages.forEach(function(src,i){
      var ti = document.createElement('img');
      ti.src = src;
      ti.className = i===0?'active':'';
      ti.onclick = function(){
        document.getElementById('product-img').src = src;
        Array.from(thumbs.children).forEach(function(x){x.classList.remove('active');});
        ti.classList.add('active');
      };
      ti.onerror = function(){this.style.display='none';};
      thumbs.appendChild(ti);
    });
    document.getElementById('gallery-count').style.display='';
    document.getElementById('gallery-count').textContent = '1/'+allImages.length;
  }
  var d1 = new Date(Date.now()+7*86400000);
  var d2 = new Date(Date.now()+15*86400000);
  var opts = {month:'short',day:'numeric'};
  document.getElementById('delivery-desc').textContent = d1.toLocaleDateString('en-US',opts)+'–'+d2.toLocaleDateString('en-US',opts);
  var v = inferVariants(p);
  renderVariants(v);
  document.getElementById('product-desc').innerHTML = p.body_html || 'No description available.';
  allReviews = generateReviews(p);
  renderReviews();
  setupReviewFilters();
  if(allData){
    var same = (allData[p.category]?.products || []).filter(function(x){return String(x.id)!==String(p.id);});
    var start = seed % Math.max(1, same.length - 4);
    relatedProducts = same.slice(start, start+4);
    if(relatedProducts.length < 4){ relatedProducts = same.slice(0,4); }
    renderRelated();
  }
  updateWishlistBtn();
  updateCartBadge();
  hideLoad();
}

// --- Load ---
if(!pid){hideLoad();showError('No product ID');}
else{
  document.getElementById('loading-text').textContent = 'Loading product...';
  var x = new XMLHttpRequest();
  x.open('GET','https://cdn.jsdelivr.net/gh/jamestuwairua77-cpu/bargain-drop-preview@main/categories-data.json',true);
  x.onload = function(){
    if(x.status >= 200 && x.status < 400){
      try{
        var d = JSON.parse(x.responseText);
        for(var c in d){
          var items = d[c].products || [];
          for(var i=0;i<items.length;i++){if(String(items[i].id) === pid){showProduct(items[i],d);return;}}
        }
        showError('Product not found');
      }catch(e){showError('Data parse error');}
    }else{showError('Failed to load (HTTP '+x.status+')');}
  };
  x.onerror = function(){showError('Failed to load');};
  x.send();
}
updateCartBadge();
