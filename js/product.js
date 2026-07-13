var product=null,category=null,qty=1,pid=(new URLSearchParams(location.search)).get('id'),currentImgIdx=0,allImages=[],selectedVariants={},reviewsShownCount=5,currentReviewFilter='all',currentSort='most_helpful',allReviews=[];

function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function hideLoad(){var e=document.getElementById('loading-overlay');if(e)e.style.display='none'}
function showError(m){var e=document.getElementById('product-title');if(e)e.textContent=m;hideLoad()}
function money(n){return typeof BD!=='undefined'&&BD.formatMoneyCompact?BD.formatMoneyCompact(n):'A$'+Number(n||0).toFixed(2)}

/* ============ Cart / Wishlist ============ */
function updateCartCount(){
  var c=JSON.parse(localStorage.getItem('bd_cart')||'[]');
  var el=document.getElementById('nav-cart-count');
  if(el){var n=c.reduce(function(s,i){return s+(i.qty||1)},0);el.textContent=n;el.style.display=n?'':'none'}
}
function addToCart(){
  if(!product)return;
  var c=JSON.parse(localStorage.getItem('bd_cart')||'[]'),e=c.findIndex(function(x){return x.id===product.id});
  var sv=Object.keys(selectedVariants).length>0?Object.values(selectedVariants).filter(Boolean).join(' / '):null;
  if(e>=0)c[e].qty+=qty;else c.push({id:product.id,title:product.title,price:product.price,image:product.image||(product.images||[])[0]||'',qty:qty,variant:sv});
  localStorage.setItem('bd_cart',JSON.stringify(c));updateCartCount();showToast('Added '+qty+' to cart!')
}
function buyNow(){addToCart();location.href='checkout.html'}
function toggleWishlist(){
  var b=document.getElementById('wishlist-btn');if(!product){showToast('Product still loading...');return}
  var w=JSON.parse(localStorage.getItem('bd_wishlist')||'[]'),idx=w.findIndex(function(x){return x.id===product.id});
  if(idx>=0){w.splice(idx,1);b.classList.remove('wishlisted');showToast('Removed from wishlist')}
  else{w.push({id:product.id,title:product.title,price:product.price,image:product.image||(product.images||[])[0]||'',category:product.category,added:new Date().toISOString()});b.classList.add('wishlisted');showToast('Added to wishlist ♡')}
  localStorage.setItem('bd_wishlist',JSON.stringify(w))
}
function changeQty(d){qty=Math.max(1,qty+d);var e=document.getElementById('qty-value');if(e)e.textContent=qty;var m=document.getElementById('qty-minus');if(m)m.disabled=qty<=1;var p=document.getElementById('qty-plus');if(p)p.disabled=qty>=99}
function showToast(msg){var t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2000)}

/* ============ Gallery ============ */
function navigateImage(d){
  if(!allImages.length)return;
  currentImgIdx=(currentImgIdx+d+allImages.length)%allImages.length;
  setImage(currentImgIdx)
}
function setImage(idx){
  currentImgIdx=idx;
  var img=document.getElementById('product-img');if(!img)return;
  img.src=allImages[idx]||allImages[0]||'';
  img.style.opacity='0';setTimeout(function(){img.style.opacity='1'},50);
  var gc=document.getElementById('gallery-count');if(gc)gc.textContent=(idx+1)+'/'+allImages.length;
  document.querySelectorAll('.gallery-dot').forEach(function(d,i){d.classList.toggle('active',i===idx)});
  document.querySelectorAll('.prod-thumbs img').forEach(function(t,i){t.classList.toggle('active',i===idx)})
}

/* ============ Variants ============ */
function renderVariants(){
  if(!product)return;
  var opts=product.options||[],vars=product.variants||[];
  ['color','size','model'].forEach(function(t){
    var blk=document.getElementById(t+'-block');if(blk)blk.style.display='none';
    var cont=document.getElementById(t+'-options');if(cont)cont.innerHTML=''
  });
  if(!opts.length)return;
  opts.forEach(function(opt,oi){
    var blockId,selId;
    if(oi===0){blockId='color-block';selId='color-selected'}
    else if(oi===1){blockId='size-block';selId='size-selected'}
    else if(oi===2){blockId='model-block';selId='model-selected'}
    else return;
    var blk=document.getElementById(blockId);if(!blk)return;
    blk.style.display='';
    var cont=document.getElementById(blockId.replace('-block','-options')),selected=document.getElementById(selId),values=[];
    if(Array.isArray(opt.values))values=opt.values;
    else if(vars.length){
      var seen={};
      vars.forEach(function(v){var key='option'+(oi+1),val=v[key];if(val&&!seen[val]){seen[val]=true;values.push(val)}})
    }
    if(!values.length)return;
    values.forEach(function(val){
      var btn=document.createElement('button');btn.className='variant-btn';btn.textContent=val;
      btn.onclick=function(){
        selectedVariants[opt.name||('option'+(oi+1))]=val;
        cont.querySelectorAll('.variant-btn').forEach(function(b){b.classList.remove('active')});
        btn.classList.add('active');if(selected)selected.textContent=val;
        var match=vars.find(function(v){
          for(var k=0;k<opts.length;k++){if(v['option'+(k+1)]&&selectedVariants[opts[k].name||('option'+(k+1))]&&v['option'+(k+1)]!==selectedVariants[opts[k].name||('option'+(k+1))])return false}return true
        });
        if(match&&match.price){product.selected_variant_price=match.price;var pe=document.getElementById('product-price');if(pe)pe.textContent=money(match.price);if(match.image){var pi=document.getElementById('product-img');if(pi)pi.src=match.image}}
        updateVariantAvailability()
      };cont.appendChild(btn)
    })
  });updateVariantAvailability()
}
function updateVariantAvailability(){
  if(!product||!product.variants||!product.variants.length)return;
  var vars=product.variants;
  document.querySelectorAll('.variant-options').forEach(function(block){
    block.querySelectorAll('.variant-btn').forEach(function(btn){
      var val=btn.textContent,anyAvailable=vars.some(function(v){return(v.option1===val||v.option2===val||v.option3===val)&&(!v.available||v.available!==false)});
      if(!anyAvailable){btn.classList.add('oos');btn.disabled=true}
    })
  })
}

/* ============ Reviews ============ */
var reviewers=["Alice M.","Bob K.","Carol T.","David L.","Emma S.","Frank J.","Grace H.","Henry W.","Iris P.","Jack R.","Kelly N.","Liam O.","Maya P.","Noah Q.","Olivia R."];
var comments5=["Absolutely love this! Exceeded my expectations in every way.","Perfect quality, fast delivery. Highly recommend this product!","Great value for money. Looks exactly like the photos.","Couldn't be happier with this purchase. Five stars!","Outstanding product — great build quality and feel.","Bought as a gift and they loved it. Will buy again.","Better than expected! Premium feel at an affordable price.","This is exactly what I needed. Works perfectly.","Top notch quality. Very impressed with the packaging too.","Best purchase I've made in a while. So happy with it."];
var comments4=["Really good product overall. Minor color difference from photos.","Solid quality. Took a bit longer to arrive but worth the wait.","Happy with this purchase. Good quality for the price.","Works well. Slightly different feel than expected but still great.","Nice product. Would give 5 if shipping was faster.","Very satisfied. Just wish it came in more color options.","Good build quality. A little lighter than expected but still great.","Decent product. Functions well, looks nice. Easy 4 stars."];
var comments3=["It's okay. Does the job but nothing special.","Average quality. You get what you pay for.","The product works but had minor issues out of the box.","Mixed feelings. Some features are great, others disappointing.","Not bad, not great. Middle of the road for the price."];
var comments2=["Disappointed with the quality. Looks better in photos.","Expected more for the price. Feels a bit cheap.","Had some issues with functionality. Might return it."];
var comments1=["Poor quality. Would not recommend.","Arrived damaged and description was misleading.","Very disappointed. Doesn't work as advertised."];
var photosPool=["https://cdn.shopify.com/s/files/1/0735/9404/4547/files/1616644285395.jpg?v=1781974545","https://cdn.shopify.com/s/files/1/0735/9404/4547/files/e6aba30f-c4b4-4ffa-b258-87b97bcb4a55.jpg?v=1782120441","https://cdn.shopify.com/s/files/1/0735/9404/4547/files/6465f2c2-4f8e-4309-9fc0-9eccf6aca11e.jpg?v=1782121686","https://cdn.shopify.com/s/files/1/0735/9404/4547/files/ce41689c-0f4d-4dc4-9cb8-c54698faac66.jpg?v=1782128463"];

function seedFromId(id){
  var h=0;for(var i=0;i<String(id).length;i++)h=((h<<5)-h)+String(id).charCodeAt(i);return Math.abs(h)
}

function generateReviews(){
  var s=seedFromId(product?product.id:'0');
  var total=35+Math.abs(s%180),avg=3.3+(s%180)/100;
  var dist={5:Math.round(total*(0.43+(s%12)/100)),4:Math.round(total*(0.24+(s%7)/100)),3:Math.round(total*(0.15+(s%5)/100)),2:Math.round(total*(0.1+(s%3)/100)),1:Math.round(total*(0.08-(s%4)/100))};
  var sum=dist[5]+dist[4]+dist[3]+dist[2]+dist[1];if(sum<total)dist[5]+=total-sum;
  allReviews=[];
  var ratingWeights=[];
  for(var r=5;r>=1;r--)for(var i=0;i<dist[r];i++)ratingWeights.push(r);
  for(var j=ratingWeights.length-1;j>0;j--){var k=Math.floor((s+j)%(j+1));var tmp=ratingWeights[j];ratingWeights[j]=ratingWeights[k];ratingWeights[k]=tmp}
  ratingWeights.forEach(function(rating,idx){
    var author=reviewers[(s+idx)%reviewers.length],verified=(s+idx)%5!==0;
    var comments;
    if(rating===5)comments=comments5;else if(rating===4)comments=comments4;else if(rating===3)comments=comments3;else if(rating===2)comments=comments2;else comments=comments1;
    var com=comments[(s+idx)%comments.length];
    var days=(s+idx*3)%180,date=new Date(Date.now()-days*86400000).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
    var helpful=Math.floor(((s+idx*7)%80)*(rating/5));
    var hasPhotos=(s+idx)%7===0;
    allReviews.push({author:author,rating:rating,date:date,text:com,verified:verified,helpful:helpful,images:hasPhotos?[photosPool[(s+idx)%photosPool.length]]:[]})
  });
  sortReviews();
  return{total:total,avg:avg,distribution:dist,reviews:allReviews}
}

function sortReviews(){
  if(!allReviews.length)return;
  switch(currentSort){
    case 'most_helpful':allReviews.sort(function(a,b){return b.helpful-a.helpful||b.rating-a.rating});break;
    case 'newest':allReviews.sort(function(a,b){return new Date(b.date)-new Date(a.date)});break;
    case 'stars_desc':allReviews.sort(function(a,b){return b.rating-a.rating});break;
    case 'stars_asc':allReviews.sort(function(a,b){return a.rating-b.rating});break;
  }
  reviewsShownCount=5;renderReviewList()
}

function renderReviewSummary(stats){
  var br=document.getElementById('big-rating');if(br)br.textContent=stats.avg.toFixed(1);
  var bt=document.getElementById('big-total');if(bt)bt.textContent=stats.total+' reviews';
  var bigStars=document.getElementById('big-stars');if(bigStars){bigStars.innerHTML='';
  for(var i=1;i<=5;i++){
    var fill=i<=Math.round(stats.avg)?'#F5A623':'#E0E0E0';
    bigStars.innerHTML+='<svg viewBox="0 0 24 24" fill="'+fill+'"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
  }}
  var bars=document.getElementById('reviews-bars');if(bars){bars.innerHTML='';
  for(var s=5;s>=1;s--){
    var pct=stats.total>0?(stats.distribution[s]/stats.total*100):0;
    bars.innerHTML+='<div class="review-bar-row" id="dist-bar-'+s+'" onclick="filterByStar('+s+')"><span class="star-label">'+s+'<svg viewBox="0 0 24 24" fill="#F5A623"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></span><div class="review-bar-track"><div class="review-bar-fill" style="width:'+pct+'%"></div></div><span class="count">'+stats.distribution[s]+'</span></div>'
  }}
  var headerStars=document.getElementById('header-stars');if(headerStars){headerStars.innerHTML='';
  for(var i=1;i<=5;i++){
    var fill=i<=Math.round(stats.avg)?'#F5A623':'#E0E0E0';
    headerStars.innerHTML+='<svg viewBox="0 0 24 24" fill="'+fill+'"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
  }}
  var rn=document.getElementById('rating-num');if(rn)rn.textContent=stats.avg.toFixed(1);
  var rc=document.getElementById('rating-count');if(rc)rc.textContent=stats.total+' reviews';
  var phash=seedFromId(product?product.id:'0');var sc=document.getElementById('sold-count');if(sc)sc.textContent='\u2022 '+(stats.total*7+Math.abs(phash%50))+' sold'
}

function filterByStar(star){
  currentReviewFilter=String(star);reviewsShownCount=5;
  document.querySelectorAll('.review-filter').forEach(function(b){b.classList.remove('active')});
  var btn=document.querySelector('.review-filter[data-filter="'+star+'"]');if(btn)btn.classList.add('active');
  renderReviewList()
}

function renderReviewList(){
  var list=document.getElementById('reviews-list');if(!list)return;list.innerHTML='';
  var filtered=currentReviewFilter==='all'?allReviews:
    currentReviewFilter==='verified'?allReviews.filter(function(r){return r.verified}):
    allReviews.filter(function(r){return r.rating===parseInt(currentReviewFilter)});
  var shown=filtered.slice(0,reviewsShownCount);
  shown.forEach(function(r){
    var stars='';for(var i=1;i<=5;i++)stars+=i<=r.rating?'★':'☆';
    var imgs='';if(r.images&&r.images.length){imgs='<div class="review-images">';r.images.forEach(function(src){imgs+='<img src="'+esc(src)+'" alt="Review photo" width="60" height="60" loading="lazy" onerror="this.parentElement.removeChild(this)">'});imgs+='</div>'}
    var verified=r.verified?'<span class="review-verified"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#10b981"/><path d="M8 12l3 3 5-6" stroke="#fff" stroke-width="2"/></svg>Verified</span>':'';
    list.innerHTML+='<div class="review-item fade-in"><div class="review-header"><div class="review-avatar">'+esc(r.author.charAt(0))+'</div><div class="review-author"><div class="name">'+esc(r.author)+' '+verified+'</div><div class="date">'+r.date+'</div></div></div><div class="review-stars">'+stars+'</div><div class="review-text">'+esc(r.text)+'</div>'+imgs+'<div class="review-helpful"><button data-helpful="1">Helpful ('+r.helpful+')?</button></div></div>'
  });
  var loadMore=document.getElementById('load-more-reviews');
  if(loadMore)loadMore.style.display=shown.length<filtered.length?'':'none';
  // Add click handlers for helpful buttons
  list.querySelectorAll('[data-helpful]').forEach(function(btn){btn.onclick=function(){this.textContent='✓ Thanks!';this.disabled=true;this.style.color='var(--green)'}})
}

function loadMoreReviews(){reviewsShownCount+=10;renderReviewList()}

function renderReviews(){
  var stats=generateReviews();renderReviewSummary(stats);renderReviewList();
  document.querySelectorAll('.review-filter').forEach(function(btn){
    btn.onclick=function(){
      document.querySelectorAll('.review-filter').forEach(function(b){b.classList.remove('active')});
      this.classList.add('active');currentReviewFilter=this.dataset.filter;reviewsShownCount=5;renderReviewList()
    }
  })
}

/* ============ Related Products ============ */
function renderRelatedProducts(){
  if(!category||!product)return;var grid=document.getElementById('related-grid');if(!grid)return;
  grid.innerHTML='<div class="loading-text">Loading related...</div>';
  var catFile=category.toLowerCase().replace(', ','-').replace(' & ','-').replace(' ','-').replace("'","")+'.json';
  var x=new XMLHttpRequest();
  x.open('GET','https://raw.githubusercontent.com/jamestuwairua77-cpu/bargain-drop-preview/main/data/'+catFile,true);
  x.timeout=15000;
  x.onload=function(){
    if(x.status!==200)return;
    try{var catData=JSON.parse(x.responseText);if(!catData||!catData.products)return;
      var related=catData.products.filter(function(p){return String(p.id)!==String(pid)});
      for(var i=related.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var tmp=related[i];related[i]=related[j];related[j]=tmp}
      related=related.slice(0,8);grid.innerHTML='';
      related.forEach(function(p){
        var a=document.createElement('a');a.className='related-card fade-in';a.href='product.html?id='+p.id;
        var ri=p.image||(p.images||[])[0]||'';
        if(ri){a.innerHTML='<img src="'+esc(ri)+'" alt="'+esc(p.title)+'" width="56" height="56" loading="lazy" onerror="this.style.display=\'none\'"><div class="related-info"><div class="related-title">'+esc(p.title)+'</div><div class="related-price">'+money(p.price||0)+'</div></div>'}
        else{a.innerHTML='<div class="related-placeholder">📦</div><div class="related-info"><div class="related-title">'+esc(p.title)+'</div><div class="related-price">'+money(p.price||0)+'</div></div>'}
        grid.appendChild(a)
      })
    }catch(e){}
  };x.send()
}

/* ============ Main Product Rendering ============ */
function showProduct(){
  if(!product)return;var p=product;
  document.title=p.title+' — Bargain Drop';
  // Update meta tags dynamically for SEO
  var metaDesc=document.querySelector('meta[name="description"]');
  if(metaDesc)metaDesc.setAttribute('content',p.title+' — only '+money(p.price)+' at Bargain Drop. '+(p.body_html||'').replace(/<[^>]*>/g,'').substring(0,150)+'...');
  var ogTitle=document.querySelector('meta[property="og:title"]');if(ogTitle)ogTitle.setAttribute('content',p.title+' — Bargain Drop');
  var ogDesc=document.querySelector('meta[property="og:description"]');if(ogDesc)ogDesc.setAttribute('content','Shop '+p.title+' for only '+money(p.price)+' at Bargain Drop. Fast shipping, best prices.');
  var ogImage=document.querySelector('meta[property="og:image"]');if(!ogImage){ogImage=document.createElement('meta');ogImage.setAttribute('property','og:image');document.head.appendChild(ogImage)}ogImage.setAttribute('content',p.image||(p.images||[])[0]||'');
  var canonical=document.querySelector('link[rel="canonical"]');if(canonical)canonical.setAttribute('href','https://bargain-drop.online/product.html?id='+p.id);
  // Inject Product schema
  var existing=document.getElementById('product-schema');if(existing)existing.remove();
  var schema=document.createElement('script');schema.type='application/ld+json';schema.id='product-schema';
  schema.textContent=JSON.stringify({
    '@context':'https://schema.org','@type':'Product',
    'name':p.title,'description':(p.body_html||'').replace(/<[^>]*>/g,'').substring(0,200),
    'image':p.image||(p.images||[])[0]||'',
    'offers':{'@type':'Offer','price':p.price,'priceCurrency':'AUD','availability':'https://schema.org/InStock'},
    'sku':String(p.id)
  });
  document.head.appendChild(schema);
  var pt=document.getElementById('product-title');if(pt)pt.textContent=p.title;
  var pp=document.getElementById('product-price');if(pp)pp.textContent=money(p.price);
  if(p.compare_at_price&&p.compare_at_price>p.price){
    var op=document.getElementById('original-price');if(op){op.textContent=money(p.compare_at_price);op.style.display=''}
    var save=p.compare_at_price-p.price,pct=Math.round(save/p.compare_at_price*100);
    var sv=document.getElementById('savings');if(sv){sv.innerHTML='Save '+money(save)+' ('+pct+'%)';sv.style.display=''}
  }

  var imgs=p.images||[p.image];if(imgs.length>0){
    allImages=imgs;var pi=document.getElementById('product-img');if(pi)pi.src=imgs[0];
    var dotsContainer=document.getElementById('gallery-dots');if(dotsContainer){dotsContainer.innerHTML='';
    if(imgs.length>1){
      imgs.forEach(function(_,i){var dot=document.createElement('span');dot.className='gallery-dot'+(i===0?' active':'');dot.onclick=function(){setImage(i)};dotsContainer.appendChild(dot)});
      var gp=document.getElementById('gallery-prev');if(gp)gp.style.display='';var gn=document.getElementById('gallery-next');if(gn)gn.style.display=''
    }else{var gp=document.getElementById('gallery-prev');if(gp)gp.style.display='none';var gn=document.getElementById('gallery-next');if(gn)gn.style.display='none'}}
    var gc=document.getElementById('gallery-count');if(gc){gc.textContent=imgs.length>1?'1/'+imgs.length:'';gc.style.display=imgs.length>1?'':'none'}
    var t=document.getElementById('prod-thumbs');if(t){t.innerHTML='';
    imgs.forEach(function(src,i){var ii=document.createElement('img');ii.src=src;ii.className=i===0?'active':'';ii.alt=p.title+' image '+(i+1);ii.loading='lazy';ii.width=52;ii.height=52;ii.onclick=function(){setImage(i)};t.appendChild(ii)})}
  }

  var pd=document.getElementById('product-desc');if(pd)pd.innerHTML=p.body_html||'No description available.';
  var specBody=document.getElementById('spec-table-body');
  if(specBody){
    specBody.innerHTML='';var specRows=[];
    if(p.vendor)specRows.push(['Brand',p.vendor]);
    if(p.product_type)specRows.push(['Type',p.product_type]);
    if(p.subcategory)specRows.push(['Subcategory',p.subcategory]);
    if(p.category)specRows.push(['Category',p.category]);
    ((Array.isArray(p.tags)?p.tags:(p.tags||'').split(',')).filter(Boolean).slice(0,5)).forEach(function(tag,i){var parts=tag.split(':');if(parts.length===2)specRows.push([parts[0].trim(),parts[1].trim()]);else if(i<3)specRows.push(['Detail '+(i+1),tag.trim()])});
    if(specRows.length===0)specRows.push(['SKU',p.id||'—'],['Status','Active']);
    specRows.forEach(function(row){specBody.innerHTML+='<tr><th>'+esc(row[0])+'</th><td>'+esc(row[1])+'</td></tr>'})
  }
  renderVariants();renderReviews();renderRelatedProducts();
  var w=JSON.parse(localStorage.getItem('bd_wishlist')||'[]');
  var wb=document.getElementById('wishlist-btn');
  if(wb&&w.some(function(x){return x.id===p.id}))wb.classList.add('wishlisted');
  hideLoad();updateCartCount()
}

function loadProduct(){
  if(!pid){showError('No product ID');return}
  var x=new XMLHttpRequest();
  x.open('GET','/api/product-lookup?id='+encodeURIComponent(pid),true);
  x.timeout=15000;
  x.onload=function(){
    if(x.status===200){
      try{
        var resp=JSON.parse(x.responseText);
        if(resp.product){product=resp.product;category=resp.category;showProduct()}
        else{showError('Product data empty')}
      }catch(e){showError('Failed to parse product: '+e.message)}
    }else{showError('Product not available (status '+x.status+')')}
  };
  x.onerror=function(){showError('Connection error. Try again.')};
  x.ontimeout=function(){showError('Request timed out. Please refresh.')};
  x.send()
}

/* Init — use DOMContentLoaded instead of window.onload for faster init */
(function init(){
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){
      loadProduct();updateCartCount();
      var img=document.getElementById('product-img');if(img)img.style.transition='opacity .3s ease';
      var ss=document.getElementById('review-sort-select');
      if(ss)ss.addEventListener('change',function(){currentSort=this.value;sortReviews()});
    });
  } else {
    loadProduct();updateCartCount();
    var img=document.getElementById('product-img');if(img)img.style.transition='opacity .3s ease';
    var ss=document.getElementById('review-sort-select');
    if(ss)ss.addEventListener('change',function(){currentSort=this.value;sortReviews()});
  }
})();
