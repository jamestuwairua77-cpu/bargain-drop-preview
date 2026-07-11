// Professional Bottom Nav Icons — custom colours, consistent sizing
(function(){
  var icons = {
    home: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#4A90D9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    products: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#E67E22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="9" height="9" rx="2"/><rect x="13" y="2" width="9" height="9" rx="2"/><rect x="2" y="13" width="9" height="9" rx="2"/><rect x="13" y="13" width="9" height="9" rx="2"/></svg>',
    categories: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2ECC71" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="6" r="1.5" fill="#2ECC71"/><line x1="9" y1="6" x2="21" y2="6"/><circle cx="5" cy="12" r="1.5" fill="#2ECC71"/><line x1="9" y1="12" x2="21" y2="12"/><circle cx="5" cy="18" r="1.5" fill="#2ECC71"/><line x1="9" y1="18" x2="21" y2="18"/></svg>',
    wishlist: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#E74C3C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    cart: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#9B59B6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.5" fill="#9B59B6" stroke="none"/><circle cx="20" cy="21" r="1.5" fill="#9B59B6" stroke="none"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>',
    me: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#1ABC9C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
  };
  var nav = document.querySelector('.bottom-nav');
  if(!nav) return;
  var links = nav.querySelectorAll('a');
  links.forEach(function(a){
    var t = a.textContent.replace(/[0-9]+/g,'').trim().toLowerCase();
    for(var k in icons){
      var klower = k.toLowerCase();
      var match = (
        t.indexOf(klower) >= 0 ||
        (k==='me' && (t.indexOf('profile')>=0 || t.indexOf('account')>=0)) ||
        (k==='products' && t.indexOf('product')>=0) ||
        (k==='cart' && (t.indexOf('cart')>=0 || t.indexOf('bag')>=0 || t.indexOf('checkout')>=0))
      );
      if(match){
        var svg = a.querySelector('svg');
        if(svg) { svg.outerHTML = icons[k]; }
        break;
      }
    }
  });
})();