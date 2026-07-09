// Shared cart count updater for bottom nav bar
(function(){
  function updateCartCounts() {
    try {
      var cart = JSON.parse(localStorage.getItem('bd_cart') || '[]');
      var cnt = cart.reduce(function(s, i) { return s + (i.qty || 1); }, 0);
      // Header cart count
      var h = document.getElementById('cart-count');
      if (h) { h.textContent = cnt; h.style.display = cnt > 0 ? '' : 'none'; }
      // Nav cart count badge
      var n = document.getElementById('nav-cart-count');
      if (n) { n.textContent = cnt; n.style.display = cnt > 0 ? '' : 'none'; }
      // Cart badge on product page
      var b = document.getElementById('cart-badge');
      if (b) { b.textContent = cnt; b.style.display = cnt > 0 ? '' : 'none'; }
    } catch(e) {}
  }
  updateCartCounts();
  setInterval(updateCartCounts, 3000);
})();
