// Currency handled by js/currency.js
if(typeof BD!="undefined")BD.initCurrency();
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
    renderSubcatSlider(cats,d);
    renderSubcatGrid(cats,d);
  }
};
x.onerror=function(){document.getElementById('subcat-slider').innerHTML='<div class="loading-text">Subcategories unavailable</div>';document.getElementById('subcat-scroll-wrap').innerHTML='<div class="loading-text">Categories unavailable</div>'};
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

function renderSubcatSlider(cats, catData){
  var g=document.getElementById('subcat-slider');
  if(!g)return;
  g.innerHTML='';
  var seen={};
  var items=[];
  for(var i=0;i<cats.length;i++){
    var c=cats[i],info=catData[c]||{},subs=info.subcategories||[];
    for(var j=0;j<subs.length;j++){
      var s=subs[j],title=s.title||'';
      if(!seen[title]&&title&&s.count>0&&title.indexOf(' > ')===-1){
        seen[title]=true;
        items.push({title:title,count:s.count,image:s.image||'',parent:c});
      }
    }
  }
  items.sort(function(a,b){return b.count-a.count});
  items=items.slice(0,24);
  for(var k=0;k<items.length;k++){
    var it=items[k];
    var a=document.createElement('a');a.className='subcat-btn fade-in';
    a.href='category.html?cat='+encodeURIComponent(it.parent)+'&sub='+encodeURIComponent(it.title);
    var imgHtml=it.image?'<img src="'+it.image+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'';
    a.innerHTML=imgHtml+esc(it.title)+'<span class="subcat-count">'+it.count+'</span>';
    g.appendChild(a);
  }
}

function renderSubcatGrid(cats, catData){
  var g=document.getElementById('subcat-scroll-wrap');
  if(!g)return;
  g.innerHTML='';
  cats.sort(function(a,b){return (catData[b]&&catData[b].product_count||0)-(catData[a]&&catData[a].product_count||0)});
  for(var i=0;i<cats.length;i++){
    var c=cats[i],info=catData[c]||{},heroes=info.hero_images||[],e=C[c]||"[box]";
    var a=document.createElement('a');a.className='subcat-card fade-in';
    a.href='category.html?cat='+encodeURIComponent(c);
    var h='';
    if(heroes.length>0){
      h='<div class="subcat-hero">';
      for(var j=0;j<4&&j<heroes.length;j++){
        var heroStyle = j===0?' style="grid-row:1/3"':'';
        h+='<img src="'+heroes[j]+'" alt="" loading="lazy" onerror="this.style.display=\'none\'"'+heroStyle+'>';
      }
      h+='</div>';
    }else{
      h='<div class="subcat-hero"><span class="subcat-emoji">'+e+'</span><div class="subcat-empty"></div><div class="subcat-empty"></div><div class="subcat-empty"></div></div>';
    }
    a.innerHTML=h+'<div class="subcat-info"><div class="subcat-label">'+esc(c)+'</div><div class="subcat-count-text">'+(info.product_count||0).toLocaleString()+'</div></div>';
    g.appendChild(a);
  }
}

function renderProds(prods){
  var g=document.getElementById('product-grid');
  g.innerHTML='';
  if(!prods.length){g.innerHTML='<div class="loading-Text">No products found</div>';return}
  for(var i=0;i<prods.length;i++){
    var p=prods[i],img=p.image||(p.images||[])[0]||'';
    var a=document.createElement('a');a.className='product-card fade-in';
    a.href='product.html?id='+p.id;
    var imgHtml;
    if(img){
      imgHtml='<img src="'+img+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
    }else{
      imgHtml='<div style="font-size:4rem;opacity:.2">'+C.Other+'</div>';
    }
    var priceHtml;
    if(typeof BD!='undefined'){
      priceHtml=BD.formatMoneyCompact(p.price||0);
    }else{
      priceHtml='A$'+(p.price||0).toFixed(2);
    }
    a.innerHTML='<div class="prod-img">'+imgHtml+'</div><div class="prod-info"><div class="prod-title">'+esc(p.title)+'</div><div class="prod-price-row"><span class="prod-price">'+priceHtml+'</span></div></div>';
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
      document.getElementById('subcat-slider-wrap').style.display='none';
      document.getElementById('cat-section').style.display='none';
      document.getElementById('trending-title').style.display='none';
      document.getElementById('search-title').style.display='flex';
      var x=new XMLHttpRequest();
      x.open('GET','/api/search-products?limit=50&q='+encodeURIComponent(q),true);
      x.timeout=10000;
      x.onload=function(){if(x.status>=200&&x.status<400){var d=JSON.parse(x.responseText);document.getElementById('search-count').textContent='';renderProds(d.products||[]);}};
      x.send();
    }else{
      document.getElementById('subcat-slider-wrap').style.display='';
      document.getElementById('cat-section').style.display='';
      document.getElementById('trending-title').style.display='';
      document.getElementById('search-title').style.display='none';
      renderProds(ALL.slice(0,50));
    }
  },300);
}
function clearSearch(){document.getElementById('search-input').value='';doSearch();document.getElementById('search-input').focus();}