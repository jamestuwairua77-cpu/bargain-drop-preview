// Currency override for AUD (A$)
// This redefines the money() function after js/product.js loads
if (typeof money === 'function') {
  var _origMoney = money;
  money = function(n) {
    var s = _origMoney(n);
    return s.replace(/^\$/, 'A$');
  };
}