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
var oosVariants = new Set();

function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function hideLoad(){document.getElementById('loading-overlay').style.display='none';}
function showError(m){document.getElementById('product-title').textContent=m;hideLoad();}
function money(n){return BD.formatMoneyCompact(n);}

function updateCartCount(){var c=JSON.parse(localStorage.getItem('bd_cart')||'[]');var el=document.getElementById('cart-badge');if(el){var n=c.reduce(function(s,i){return s+(i.qty||1)},0);el.textContent=n;el.style.display=n?'':'none';}}

function addToCart(){if(!product)return;var c=JSON.parse(localStorage.getItem('bd_cart')||'[]');var e=c.findIndex(function(x){return x.id===product.id});if(e>=0){c[e].qty+=qty}else{c.push({id:product.id,title:product.title,price:product.price,image:product.image||(product.images||[])[0]||'',qty:qty})}localStorage.setItem('bd_cart',JSON.stringify(c));updateCartCount();alert('Added '+qty+' to cart!');}

function buyNow(){addToCart();location.href='checkout.html';}
function toggleWishlist(){var b=document.getElementById('wishlist-btn');if(b)b.classList.toggle('wishlisted');}
function shareProduct(){if(navigator.share){navigator.share({title:product?product.title:'',url:location.href})}else{navigator.clipboard.writeText(location.href);alert('Link copied!');}}
function changeQty(d){qty=Math.max(1,qty+d);document.getElementById('qty-value').textContent=qty;document.getElementById('qty-minus').disabled=qty<=1;document.getElementById('qty-plus').disabled=qty>=99;}
function loadMoreReviews(){reviewsShownCount+=5;}
function scrollToReviews(){document.getElementById('reviews-section').scrollIntoView({behavior:'smooth'});}

function showProduct(){if(!product)return;var p=product;document.getElementById('product-title').textContent=p.title;document.getElementById('product-price').textContent=money(p.price);var imgs=p.images||[p.image];if(imgs.length>0){allImages=imgs;document.getElementById('product-img').src=imgs[0];var t=document.getElementById('prod-thumbs');t.innerHTML='';if(imgs.length>1){imgs.forEach(function(src,i){var ii=document.createElement('img');ii.src=src;ii.className=i===0?'active':'';ii.onclick=function(){currentImgIdx=i;document.getElementById('product-img').src=src;this.parentNode.querySelectorAll('img').forEach(function(x){x.classList.remove('active')});this.classList.add('active');};t.appendChild(ii);});document.getElementById('gallery-count').textContent='1/'+imgs.length;document.getElementById('gallery-count').style.display='';}}if(p.compare_at_price&&p.compare_at_price>p.price){var d=Math.round((1-p.price/p.compare_at_price)*100);document.getElementById('product-original').textContent=money(p.compare_at_price);document.getElementById('product-discount').textContent='-'+d+'%';document.getElementById('product-original').style.display='';document.getElementById('product-discount').style.display='';document.getElementById('savings').style.display='';document.getElementById('savings-text').textContent='You save '+BD.formatMoneyCompact(p.compare_at_price-p.price);document.getElementById('gallery-badge').textContent='SALE';document.getElementById('gallery-badge').style.display='';}document.getElementById('product-desc').innerHTML=p.body_html||'No description available.';hideLoad();updateCartCount();}

function loadProduct(){if(!pid){showError('No product ID');return}// localStorage cache removed to prevent stale data
document.getElementById('loading-text').textContent='Loading product...';var x=new XMLHttpRequest();x.open('GET','https://cdn.jsdelivr.net/gh/jamestuwairua77-cpu/bargain-drop-preview@6aa8315/categories-data.json?v=3',true);x.timeout=30000;x.onload=function(){if(x.status===200){try{var d=JSON.parse(x.responseText);for(var c in d){var items=d[c].products||[];for(var i=0;i<items.length;i++){if(String(items[i].id)===String(pid)){product=items[i];break}}if(product)break}if(product){showProduct();}else{showError('Product not found');}}catch(e){showError('Failed to load product');}}else{showError('Failed to load product');}};x.onerror=function(){showError('Failed to load product');};x.send();}

window.onload=loadProduct;
updateCartCount();