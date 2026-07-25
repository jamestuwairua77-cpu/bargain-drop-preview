// Bargain Drop — Profile V2 (Shared Nav + Account JS)
var _nl=0;
window.addEventListener("scroll",function(){
  var n=document.getElementById("nb"),s=window.scrollY;
  if(!n)return;
  if(s<_nl||s<100)n.classList.remove("hi");
  else if(s>_nl&&s>200)n.classList.add("hi");
  _nl=s;
},{passive:true});

function tm(){
  var m=document.getElementById("nm"),o=document.getElementById("nmo");
  if(!m||!o)return;
  m.classList.toggle("on");o.classList.toggle("on");
  document.body.style.overflow=m.classList.contains("on")?"hidden":"";
}

function signOut(){
  var keys=[];
  for(var i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
  keys.forEach(function(k){if(k.startsWith("bd_"))localStorage.removeItem(k)});
  toast("Signed out");setTimeout(function(){location.href="/"},1500);
}

function toast(m){
  var t=document.getElementById("to");
  if(!t)return;
  t.textContent=m;t.classList.add("on");
  clearTimeout(t._tid);t._tid=setTimeout(function(){t.classList.remove("on")},2000);
}

function refreshCounters(){
  try{var c=JSON.parse(localStorage.getItem("bd_cart")||"[]"),n=c.reduce(function(s,i){return s+(i.qty||1)},0),cb=document.getElementById("ncb");if(cb){cb.textContent=n;cb.style.display=n>0?"":"none"}}catch(e){}
  try{var wl=JSON.parse(localStorage.getItem("bd_wishlists_v2")||"null"),wlb=document.getElementById("wl-badge");if(wlb){if(wl&&wl.items)wlb.textContent=wl.items.length+" items";else wlb.textContent="0 items"}}catch(e){}
  try{var s=JSON.parse(localStorage.getItem("bd_session")||"null"),email=(s&&s.email)?s.email.toLowerCase():"guest",ords=JSON.parse(localStorage.getItem("bd_orders::"+email)||"[]");if(!ords.length)ords=JSON.parse(localStorage.getItem("bd_orders")||"[]");var oc=document.getElementById("order-count");if(oc)oc.textContent=ords.length;var ocb=document.getElementById("order-count-badge");if(ocb)ocb.textContent=ords.length}catch(e){}
  try{var s2=JSON.parse(localStorage.getItem("bd_session")||"null"),email2=(s2&&s2.email)?s2.email.toLowerCase():"guest",addrs=JSON.parse(localStorage.getItem("bd_addresses::"+email2)||"[]");var ac=document.getElementById("addr-count");if(ac)ac.textContent=addrs.length;var acb=document.getElementById("addr-count-badge");if(acb)acb.textContent=addrs.length}catch(e){}
  try{var pts=parseInt(localStorage.getItem("bd_loyalty_points")||"0")||0,pb=document.getElementById("points-balance");if(pb&&pts>0)pb.textContent=pts}catch(e){}
}

window.addEventListener("storage",function(e){
  if(!e.key||!e.key.startsWith("bd_"))return;
  refreshCounters();
});

(function init(){
  refreshCounters();
  try{document.querySelectorAll(".currency-pill").forEach(function(p){p.onclick=function(){document.querySelectorAll(".currency-pill").forEach(function(x){x.classList.remove("active")});p.classList.add("active");localStorage.setItem("bd_currency",p.dataset.curr);toast("Currency: "+p.dataset.curr)}});var curr=localStorage.getItem("bd_currency");if(curr){var cp=document.querySelector('.currency-pill[data-curr="'+curr+'"]');if(cp){document.querySelectorAll(".currency-pill").forEach(function(x){x.classList.remove("active")});cp.classList.add("active")}}}catch(e){}
})();
