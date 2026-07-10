// --- State ---
var product = null;
var category = null;
var qty = 1;
var pid = (new URLSearchParams(location.search)).get('id');
var currentImgIdx = 0;
var allImages = [];
var selectedVariants = {};
var reviewsShownCount = 5;
var currentReviewFilter = 'all';

function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function hideLoad(){document.getElementById('loading-overlay').style.display='none';}
function showError(m){document.getElementById('product-title').textContent=m;hideLoad();}
function money(n){return typeof BD!=='undefined'?BD.formatMoneyCompact(n):'A$'+Number(n||0).toFixed(2);}

function updateCartCount(){var c=JSON.parse(localStorage.getItem('bd_cart')||'[]');var el=document.getElementById('cart-badge');if(el){var n=c.reduce(function(s,i){return s+(i.qty||1)},0);el.textContent=n;el.style.display=n?'':'none';}}

function addToCart(){if(!product)return;var c=JSON.parse(localStorage.getItem('bd_cart')||'[]');var e=c.findIndex(function(x){return x.id===product.id});var selVariant=Object.keys(selectedVariants).length>0?Object.values(selectedVariants).filter(Boolean).join(' / '):null;if(e>=0){c[e].qty+=qty}else{c.push({id:product.id,title:product.title,price:product.price,image:product.image||(product.images||[])[0]||'',qty:qty,variant:selVariant})}localStorage.setItem('bd_cart',JSON.stringify(c));updateCartCount();showToast('Added '+qty+' to cart!');}

function buyNow(){addToCart();location.href='checkout.html';}
function toggleWishlist(){var b=document.getElementById('wishlist-btn');if(b)b.classList.toggle('wishlisted');var w=JSON.parse(localStorage.getItem('bd_wishlist')||'[]');var idx=w.findIndex(function(x){return x.id===product.id});if(idx>=0){w.splice(idx,1)}else if(product){w.push({id:product.id,title:product.title,price:product.price,image:product.image,category:product.category,added:new Date().toISOString()})}localStorage.setItem('bd_wishlist',JSON.stringify(w));}
function shareProduct(){if(navigator.share){navigator.share({title:product?product.title:'',url:location.href}).catch(function(){})}else{navigator.clipboard.writeText(location.href);showToast('Link copied!');}}
function changeQty(d){qty=Math.max(1,qty+d);document.getElementById('qty-value').textContent=qty;document.getElementById('qty-minus').disabled=qty<=1;document.getElementById('qty-plus').disabled=qty>=99;}
function loadMoreReviews(){reviewsShownCount+=5;renderReviews();}
function scrollToReviews(){document.getElementById('reviews-section').scrollIntoView({behavior:'smooth'});}

function showToast(msg){var t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2000);}

// --- Variant Rendering ---
function renderVariants(){
  if(!product)return;
  var opts=product.options||[];
  var vars=product.variants||[];
  
  // Hide all variant blocks by default
  ['color','size','model'].forEach(function(t){
    document.getElementById(t+'-block').style.display='none';
    document.getElementById(t+'-options').innerHTML='';
  });
  
  if(!opts.length)return;
  
  // Group variants by option
  opts.forEach(function(opt,oi){
    var blockId,selId;
    if(oi===0){blockId='color-block';selId='color-selected';}
    else if(oi===1){blockId='size-block';selId='size-selected';}
    else if(oi===2){blockId='model-block';selId='model-selected';}
    else return;
    
    document.getElementById(blockId).style.display='';
    var cont=document.getElementById(blockId.replace('-block','-options'));
    var selected=document.getElementById(selId);
    
    // Collect unique values for this option
    var values=[];
    if(Array.isArray(opt.values)){
      values=opt.values;
    }else if(vars.length){
      var seen={};
      vars.forEach(function(v){
        var key='option'+(oi+1);
        var val=v[key];
        if(val&&!seen[val]){seen[val]=true;values.push(val);}
      });
    }
    
    if(!values.length)return;
    
    values.forEach(function(val){
      // Check if this variant combo is available
      var btn=document.createElement('button');
      btn.className='variant-btn';
      btn.textContent=val;
      btn.onclick=function(){
        selectedVariants[opt.name||('option'+(oi+1))]=val;
        // Update active state
        cont.querySelectorAll('.variant-btn').forEach(function(b){b.classList.remove('active')});
        btn.classList.add('active');
        selected.textContent=val;
        
        // Find matching variant for price update
        var match=vars.find(function(v){
          for(var k=0;k<opts.length;k++){
            if(v['option'+(k+1)]&&selectedVariants[opts[k].name||('option'+(k+1))]&&v['option'+(k+1)]!==selectedVariants[opts[k].name||('option'+(k+1))])return false;
          }
          return true;
        });
        if(match&&match.price){
          product.selected_variant_price=match.price;
          document.getElementById('product-price').textContent=money(match.price);
          if(match.image){document.getElementById('product-img').src=match.image;}
        }
        updateVariantAvailability();
      };
      cont.appendChild(btn);
    });
  });
  
  updateVariantAvailability();
}

function updateVariantAvailability(){
  if(!product||!product.variants||!product.variants.length)return;
  var vars=product.variants;
  var blocks=document.querySelectorAll('.variant-options');
  blocks.forEach(function(block){
    block.querySelectorAll('.variant-btn').forEach(function(btn){
      var val=btn.textContent;
      var anyAvailable=vars.some(function(v){
        return (v.option1===val||v.option2===val||v.option3===val)&&(!v.available||v.available!==false);
      });
      if(!anyAvailable){
        btn.classList.add('oos');
        btn.disabled=true;
      }
    });
  });
}

// --- Reviews ---
function generateReviews(){
  var sellers=['Alice M.','Bob K.','Carol T.','David L.','Emma S.','Frank J.','Grace H.','Henry W.','Iris P.','Jack R.'];
  var comments=[
    'Great product! Exactly as described.','Fast shipping, very happy with this purchase.',
    'Good quality for the price. Would buy again.','Love it! Perfect fit and nice material.',
    'Decent product, took a while to arrive though.','Amazing value! Better than expected.',
    'Not bad, but the color is slightly different from the picture.','Excellent quality, highly recommend!',
    'Packaging was great, product works perfectly.','Five stars! Will order more from this store.'
  ];
  var vComments=[
    'Verified purchase. Really good quality!','Verified. Arrived quickly and works great.',
    'Verified buyer. Product is exactly as shown.','Verified. Good communication from seller.'
  ];
  
  var hash=0;
  if(product&&product.id){for(var i=0;i<String(product.id).length;i++)hash=((hash<<5)-hash)+String(product.id).charCodeAt(i);hash=Math.abs(hash);}
  
  var totalReviews=40+Math.abs(hash%200);
  var avgRating=3.5+(hash%150)/100;
  var distribution={5:Math.round(totalReviews*0.45),4:Math.round(totalReviews*0.25),3:Math.round(totalReviews*0.15),2:Math.round(totalReviews*0.1),1:Math.round(totalReviews*0.05)};
  
  allReviews=[];
  for(var r=0;r<totalReviews;r++){
    var seed=hash+r;
    var rating=seed%5===0?5:(seed%3===0?4:(seed%7===0?3:(seed%11===0?2:1)));
    if(rating<1)rating=1;
    var author=sellers[seed%sellers.length];
    var useV=seed%3===0;
    allReviews.push({
      author:author,
      rating:rating,
      date:new Date(Date.now()-Math.floor(Math.random()*90*86400000)).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}),
      text:useV?vComments[seed%vComments.length]:comments[seed%comments.length],
      verified:useV,
      variant:seed%4===0?'Color: Black':null,
      images:seed%5===0?['https://cdn.shopify.com/s/files/1/0735/9404/4547/files/1616644285395.jpg?v=1781974545']:[]
    });
  }
  allReviews.sort(function(a,b){return a.verified===b.verified?0:a.verified?-1:1});
  
  return {total:totalReviews,avg:avgRating,distribution:distribution,reviews:allReviews};
}

function renderReviewSummary(stats){
  document.getElementById('big-rating').textContent=stats.avg.toFixed(1);
  document.getElementById('big-total').textContent=stats.total+' reviews';
  
  var bigStars=document.getElementById('big-stars');
  bigStars.innerHTML='';
  for(var i=1;i<=5;i++){
    var svg=i<=Math.round(stats.avg)?'<svg viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>':'<svg viewBox="0 0 24 24" fill="#ddd"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    bigStars.innerHTML+=svg;
  }
  
  // Rating bars
  var bars=document.getElementById('reviews-bars');
  bars.innerHTML='';
  for(var s=5;s>=1;s--){
    var pct=stats.total>0?(stats.distribution[s]/stats.total*100):0;
    bars.innerHTML+='<div class="review-bar-row"><span class="star-label">'+s+'<svg viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></span><div class="review-bar-track"><div class="review-bar-fill" style="width:'+pct+'%"></div></div><span class="count">'+stats.distribution[s]+'</span></div>';
  }
  
  // Header stars
  var headerStars=document.getElementById('header-stars');
  headerStars.innerHTML=bigStars.innerHTML;
  document.getElementById('rating-num').textContent=stats.avg.toFixed(1);
  document.getElementById('rating-count').textContent=stats.total+' reviews';
  // Compute hash for sold count
  var phash=0;
  if(product&&product.id){for(var hi=0;hi<String(product.id).length;hi++)phash=((phash<<5)-phash)+String(product.id).charCodeAt(hi);phash=Math.abs(phash);}
  document.getElementById('sold-count').textContent='\u2022 '+(stats.total*7+Math.abs(phash%50))+' sold';
  document.getElementById('rating-summary').style.display='';
}

function renderReviews(){
  var stats=generateReviews();
  renderReviewSummary(stats);
  
  var list=document.getElementById('reviews-list');
  list.innerHTML='';
  
  var filtered=currentReviewFilter==='all'?stats.reviews:
    currentReviewFilter==='photos'?stats.reviews.filter(function(r){return r.images&&r.images.length}):
    currentReviewFilter==='verified'?stats.reviews.filter(function(r){return r.verified}):
    stats.reviews.filter(function(r){return r.rating===parseInt(currentReviewFilter)});
  
  filtered.slice(0,reviewsShownCount).forEach(function(r){
    var stars='';
    for(var i=1;i<=5;i++)stars+=i<=r.rating?'★':'☆';
    var imgs='';
    if(r.images&&r.images.length){imgs='<div class="review-images">';r.images.forEach(function(src){imgs+='<img src="'+src+'" alt="" loading="lazy">'});imgs+='</div>';}
    var variant=r.variant?'<div class="review-variant">'+esc(r.variant)+'</div>':'';
    var verified=r.verified?'<span class="review-verified"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#10b981"/><path d="M8 12l3 3 5-6" stroke="#fff" stroke-width="2"/></svg>Verified</span>':'';
    
    list.innerHTML+='<div class="review-item"><div class="review-header"><div class="review-avatar">'+r.author.charAt(0)+'</div><div class="review-author"><div class="name">'+esc(r.author)+' '+verified+'</div><div class="date">'+r.date+'</div></div></div><div class="review-stars">'+stars+'</div><div class="review-text">'+esc(r.text)+'</div>'+variant+imgs+'</div>';
  });
  
  // Review filter clicks
  document.querySelectorAll('.review-filter').forEach(function(btn){
    btn.onclick=function(){
      document.querySelectorAll('.review-filter').forEach(function(b){b.classList.remove('active')});
      this.classList.add('active');
      currentReviewFilter=this.dataset.filter;
      renderReviews();
    };
  });
}

// --- Related Products ---
function renderRelatedProducts(){
  if(!category||!product)return;
  var grid=document.getElementById('related-grid');
  grid.innerHTML='<div class="loading-text">Loading related...</div>';
  
  var catFile=category.toLowerCase().replace(', ','-').replace(' & ','-').replace(' ','-').replace("'","")+'.json';
  var x=new XMLHttpRequest();
  x.open('GET','https://raw.githubusercontent.com/jamestuwairua77-cpu/bargain-drop-preview/main/data/'+catFile,true);
  x.timeout=15000;
  x.onload=function(){
    if(x.status!==200)return;
    try{
      var catData=JSON.parse(x.responseText);
      if(!catData||!catData.products)return;
      var related=catData.products.filter(function(p){return String(p.id)!==String(pid)});
      // Shuffle and take 8
      for(var i=related.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var tmp=related[i];related[i]=related[j];related[j]=tmp;}
      related=related.slice(0,8);
      
      grid.innerHTML='';
      related.forEach(function(p){
        var a=document.createElement('a');
        a.className='related-card';
        a.href='product.html?id='+p.id;
        var disc=''; // discount removed
        a.innerHTML='<img src="'+(p.image||(p.images||[])[0]||'')+'" alt="" loading="lazy" onerror="this.style.display=\'none\'"><div class="related-info"><div class="related-title">'+esc(p.title)+'</div><div class="related-price">'+money(p.price||0)+' '+disc+'</div></div>';
        grid.appendChild(a);
      });
    }catch(e){}
  };
  x.send();
}

// --- Main Product Display ---
function showProduct(){
  if(!product)return;
  var p=product;
  document.title=p.title+' — Bargain Drop';
  document.getElementById('product-title').textContent=p.title;
  document.getElementById('product-price').textContent=money(p.price);
  
  // Images
  var imgs=p.images||[p.image];
  if(imgs.length>0){
    allImages=imgs;
    document.getElementById('product-img').src=imgs[0];
    var t=document.getElementById('prod-thumbs');
    t.innerHTML='';
    if(imgs.length>1){
      imgs.forEach(function(src,i){
        var ii=document.createElement('img');ii.src=src;ii.className=i===0?'active':'';
        ii.onclick=function(){currentImgIdx=i;document.getElementById('product-img').src=src;this.parentNode.querySelectorAll('img').forEach(function(x){x.classList.remove('active')});this.classList.add('active');};
        t.appendChild(ii);
      });
    }
    document.getElementById('gallery-count').textContent=imgs.length>1?'1/'+imgs.length:'';
    document.getElementById('gallery-count').style.display=imgs.length>1?'':'none';
  }
  
  // Discount removed — all products shown at regular price
  document.getElementById('product-original').style.display='none';
  document.getElementById('product-discount').style.display='none';
  document.getElementById('savings').style.display='none';
  document.getElementById('gallery-badge').style.display='none';
  
  // Description
  document.getElementById('product-desc').innerHTML=p.body_html||'No description available.';
  
  // Variants
  renderVariants();
  
  // Reviews
  renderReviews();
  
  // Related products (async)
  renderRelatedProducts();
  
  // Wishlist state
  var w=JSON.parse(localStorage.getItem('bd_wishlist')||'[]');
  if(w.indexOf(p.id)>=0)document.getElementById('wishlist-btn').classList.add('wishlisted');
  
  hideLoad();
  updateCartCount();
}

// --- Product Loading (USES NEW API!) ---
function loadProduct(){
  if(!pid){showError('No product ID');return}
  document.getElementById('loading-text').textContent='Loading product...';
  
  // Use fast product lookup API instead of loading 14MB
  var x=new XMLHttpRequest();
  x.open('GET','/api/product-lookup?id='+encodeURIComponent(pid),true);
  x.timeout=15000;
  x.onload=function(){
    if(x.status===200){
      try{
        var resp=JSON.parse(x.responseText);
        product=resp.product;
        category=resp.category;
        showProduct();
      }catch(e){
        showError('Failed to parse product');
      }
    }else if(x.status===404){
      showError('Product not found');
    }else{
      // Fallback to loading full JSON if API fails
      showError('Product not available. Please try again.');
    }
  };
  x.onerror=function(){
    showError('Connection error. Please try again.');
  };
  x.send();
}

window.onload=loadProduct;
updateCartCount();
