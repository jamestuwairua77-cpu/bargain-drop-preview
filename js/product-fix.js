function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function hideLoad(){var o=document.getElementById('loading-overlay');if(o)o.style.display='none'}
function showError(m){document.getElementById('product-title').textContent=m||'Error';hideLoad();}
function money(n){return 'AU$'+(Number(n)||0).toFixed(2)}
function audToCart(){if(!product)return;var c=JSON.parse(localStorage.getItem('bd_cart')||'[]');c.push({id:product.id,title:product.title,price:product.price,image:product.image||(product.images||[])[0]||'',pty:qty});localStorage.setItem('bd_cart',JSON.stringify(c));alert('Added to cart!')}
function changeQty(d){qty=Math.max(1,qty+d);document.getElementById('qty-value').textContent=qty}

var product=null,qty=1,pid=(new URLSearchParams(location.search)).get('id');

if(!pid){document.getElementById('product-title').textContent='No product id';hideLoad()}else{(function(){var x=new XMLHttpRequest();x.open('GET','https://cdn.jsdelivr.net/gh/jamestuwairua77-cpu/bargain-drop-preview@main/categories-data.json',true);x.timeout=30000;x.onload=function(){if(x.status===200){try{var d=JSON.parse(x.responseText);for(var c in d){for(var i=0;i<d[c].products.length;i++){if(String(d[c].products[i].id)===pid){product=d[c].products[i];break}}if(product)break}}catch(e){}}
if(product){try{document.getElementById('product-title').textContent=product.title;document.getElementById('product-price').textContent=money(product.price);if(product.compare_at_price&&product.compare_at_price>product.price){document.getElementById('product-original').textContent=money(product.compare_at_price);document.getElementById('product-original').style.display='';var disc=Math.round((1-product.price/product.compare_at_price)*100);document.getElementById('product-discount').textContent='-'+disc+'%';document.getElementById('product-discount').style.display='';document.getElementById('savings').style.display='';document.getElementById('savings-text').textContent='You save '+money(product.compare_at_price-product.price);document.getElementById('gallery-badge').textContent='Sale';document.getElementById('gallery-badge').style.display=''}
var imgs=product.images||[product.image];if(imgs.length>0){document.getElementById('product-img').src=imgs[0]}
var desc=product.body_html||'Nescription available.';document.getElementById('product-desc').innerHTML=desc}catch(e){}hideLoad()}else{showError('Product not found')}}};x.onerror=function(){showError('Failed to load')};x.send()})()}
