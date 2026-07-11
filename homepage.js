// Currency handled by js/currency.js
if(typeof BD!=="undefined")BD.initCurrency();
var C={"Women's Clothing":"[dress]","Home, Garden & Furniture":"[home]","Jewelry & Watches":"[ring]","Automobiles & Motorcycles":"[car]","Health, Beauty & Hair":"[makeup]","Men's Clothing":"[shirt]","Bags & Shoes":"[bag]","Pet Supplies":"[paw]","Toys, Kids & Babies":"[toy]","Home Improvement":"[wrench]","Sports & Outdoors":"[ball]","Phones & Accessories":"[phone]","Consumer Electronics":"[headphones]","Other":"[box]"};
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
var ALL=[];

(function loadCats(){
var x=new XMLHttpRequest();
x.open('GET','https://cdn.jsdelivr.net/gh/jamestuwairua77-cpu/bargain-drop-preview@main/categories-index.json',true);
x.timeout=10000;
x.onload=function(){
  if(x.status>=200&&x.status<400){
    var d=JSON.parse(x.responseText);
    var cats=Object.keys(d);
    renderCatChips(cats,d);
    renderCatGrid(cats,d);
  }
};
x.onerror=function(){document.getElementById('cat-slider').innerHTML='<div class="loading-text">Categories unavailable</div>';document.getElementById('cat-grid').innerHTML='<div class="loading-text">Categories unavailable</div>'};
x.send();
})();

(function loadProds(){
var x=new XMLHttpRequest();
x.open('GET','https://cdn.jsdelivr.net/gh/jamestuwairua77-cpu/bargain-drop-preview@main/data/home-garden-furniture.json',true);
x.timeout=15000;
x.onload=function(){
  if(x.status>=200&&x.status<400){
    var d=JSON.parse(x.responseText);
    ALL=(d.products||[]).slice(0,50);
    renderProds(ALL);
  }
};
x.onerror=function(){document.getElementById('product-grid').innerHTML='<div class="loading-text">Products unavailable</div>'};
x.send();
})();

function renderCatChips(cats, catData){
  var g=document.getElementById('cat-slider');
  if(!g)return;
  g.innerHTML='';
  cats.sort(function(a,b){return (catData[b]&&catData[b].product_count||0)-(catData[a]&&catData[a].product_count||0)});
  for(var i=0;i<cats.length;i++){
    var c=cats[i],info=catData[c]||{},heroes=info.hero_images||[],e=C[c]||'[box]';
    var a=document.createElement('a');a.className='cat-chip fade-in';
    a.href='category.html?cat='+encodeURIComponent(c);
    var img=heroes[0]||'';
    a.innerHTML=(img?'<img src="'+img+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'<span class="cat-chip-emoji">'+e+'</span>')+'<span class="cat-chip-label">'+esc(c)+'</span>';
    g.appendChild(a);
  }
  initSlider();
}

function renderCatGrid(cats, catData){
  var g=document.getElementById('cat-grid');
  if(!g)return;
  g.innerHTML='';
  cats.sort(function(a,b){return (catData[b]&&catData[b].product_count||0)-(catData[a]&&catData[a].product_count||0)});
  for(var i=0;i<cats.length;i++){
    var c=cats[i],info=catData[c]||{},heroes=info.hero_images||[],e=C[c]||'[box]';
    var a=document.createElement('a');a.className='cat-card fade-in';
    a.href='category.html?cat='+encodeURIComponent(c);
    var h='';
    if(heroes.length>0){
      h='<div class="cat-hero">';
      for(var j=0;j<4&&j<heroes.length;j++)h+='<img src="'+heroes[j]+'" alt="" loading="lazy" onerror="this.parentElement.innerHTML=\'<span style=font-size:2rem;opacity:.2>📦</span>\'"'+(j===0?' style="grid-row:1/3"':'')+'>';
      h+='</div>';
    }else{
      h='<div class="cat-hero"><div style="grid-row:1/3;display:flex;align-items:center;justify-content:center;font-size:2rem;background:#f5f5f5;width:100%;height:100%">'+e+'</div><div style="background:#f5f5f5"></div><div style="background:#f5f5f5"></div><div style="background:#f5f5f5"></div></div>';
    }
    a.innerHTML=h+'<div class="cat-card-info"><div class="cc-label">'+esc(c)+'</div><div class="cc-count">'+(info.product_count||0).toLocaleString()+'</div></div>';
    g.appendChild(a);
  }
}

function initSlider(){
  var slider=document.getElementById('cat-slider');
  var prev=document.getElementById('slider-prev');
  var next=document.getElementById('slider-next');
  if(!slider||!prev||!next)return;
  function updateArrows(){
    prev.style.opacity=slider.scrollLeft<=4?'0.3':'1';
    next.style.opacity=slider.scrollLeft+slider.clientWidth>=slider.scrollWidth-4?'0.3':'1';
  }
  slider.addEventListener('scroll',updateArrows);
  prev.addEventListener('click',function(){slider.scrollBy({left:-220,behavior:'smooth'})});
  next.addEventListener('click',function(){slider.scrollBy({left:220,behavior:'smooth'})});
  updateArrows();
}

function renderProds(prods){
  var g=document.getElementById('product-grid');
  g.innerHTML='';
  if(!prods.length){g.innerHTML='<div class="loading-text">No products found</div';return}
  for(var i=0;i<prods.length;i++){
    var p=prods[i],img=p.image||(p.images||[])[0]||'';
    var a=document.createElement('a');a.className='product-card fade-in';
    a.href='product.html?id='+p.id;
    a.innerHTML='<div class="prod-img">'+(img?'<img src="'+img+'" alt="" loading="lazy" onerror="this.parentElement.innerHTML=\'<span style=font-size:2.5rem;opacity:.2>📦</span>\'"':'<div style="font-size:4rem;opacity:.2">'+C.Other+'</div>')+'</div><div class="prod-info"><div class="prod-title">'+esc(p.title)+'</div><div class="prod-price-row"><span class="prod-price">'+(typeof BD!=='undefined'?BD.formatMoneyCompact(p.price||0):'A$'+(p.price||0).toFixed(2))+'</span></div></div>';
    g.appendChild(a);
  }
}

var searchTimeout;
function doSearch(){
  var q=document.getElementById('search-input').value.toLowerCase().trim();
  var clr=document.getElementById('search-clear');
  clr.style.display=q?'flex':'none';
  clearTimeout(searchTimeout);
  searchTimeout=setTimeout(function(){
    if(q){
      document.getElementById('cat-section').style.display='none';
      document.getElementById('trending-title').style.display='none';
      document.getElementById('search-title').style.display='flex';
      var x=new XMLHttpRequest();
      x.open('GET','/api/search-products?limit=50&q='+encodeURIComponent(q),true);
      x.timeout=10000;
      x.onload=function(){if(x.status>=200&&x.status<400){var d=JSON.parse(x.responseText);document.getElementById('search-count').textContent='';renderProds(d.products||[]);}};
      x.send();
    }else{
      document.getElementById('cat-section').style.display='';
      document.getElementById('trending-title').style.display='';
      document.getElementById('search-title').style.display='none';
      renderProds(ALL.slice(0,50));
    }
  },300);
}
function clearSearch(){document.getElementById('search-input').value='';doSearch();document.getElementById('search-input').focus();}