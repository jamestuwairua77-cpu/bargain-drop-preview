function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

function loadProductFix(){
  if(!pid){showError('No product ID');return}
  var cached=localStorage.getItem('bd_product_'+pid);
  if(cached){try{product=JSON.parse(cached);showProduct();return}catch(e){}}
  var x=new XMLHttpRequest();
  x.open('GET','https://cdn.jsdelivr.net/gh/jamestuwairua77-cpu/bargain-drop-preview@main/categories-data.json',true);
  x.timeout=30000;
  x.onload=function(){
    if(x.status===200){
      try{
        var d=JSON.parse(x.responseText);
        for(var c in d){
          var items=d[c].products||[];
          for(var i=0;i<items.length;i++){
            if(String(items[i].id)===String(pid)){product=items[i];break}
          }
          if(product)break
        }
        if(product){
          localStorage.setItem('bd_product_'+pid,JSON.stringify(product));
          showProduct()
        }else{showError('Product not found')}
      }catch(e){showError('Failed to load')}
    }else{showError('Failed to load')}
  };
  x.onerror=function(){showError('Failed to load')};
  x.send()
}

if(typeof window!=='undefined'&&typeof pid!=='undefined'){
  window.onload=loadProductFix;
}