// Currency override — now handled by js/currency.js
// This file is kept for backward compatibility
if (typeof BD !== 'undefined' && BD.formatMoneyCompact) {
  // Already loaded via currency.js — nothing to do
} else {
  // Legacy fallback
  if (typeof money === 'function') {
    var _origMoney = money;
    money = function(n) {
      var s = _origMoney(n);
      return s.replace(/^\$/, 'A$');
    };
  }
}
