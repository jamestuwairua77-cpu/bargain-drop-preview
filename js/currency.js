/* Bargain Drop — Currency Manager
 * Fetches live exchange rates from ExchangeRate-API (free tier) on first load,
 * caches for 1 hour. Stores user preference in localStorage via BD storage.
 * Provides BD.currency.convert(price) and BD.currency.format(price) for all pages.
 *
 * Supported currencies: AUD, USD, EUR, GBP, CAD, NZD, JPY, SGD, HKD
 * Base prices in categories-data.json are in AUD (already converted from USD).
 */
(function (global) {
  var BD = global.BD || {};
  var CURRENCY_KEY = 'currency_pref';
  var RATES_KEY = 'currency_rates';
  var RATES_TS_KEY = 'currency_rates_ts';
  var CACHE_MS = 60 * 60 * 1000; // 1 hour

  // Currency definitions
  BD.currencyDefs = {
    AUD: { symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', rate: 1.0 },
    USD: { symbol: '$',  name: 'US Dollar',         flag: '🇺🇸', rate: null },
    EUR: { symbol: '€',  name: 'Euro',              flag: '🇪🇺', rate: null },
    GBP: { symbol: '£',  name: 'British Pound',     flag: '🇬🇧', rate: null },
    CAD: { symbol: 'C$', name: 'Canadian Dollar',   flag: '🇨🇦', rate: null },
    NZD: { symbol: 'N$', name: 'New Zealand Dollar',flag: '🇳🇿', rate: null },
    JPY: { symbol: '¥',  name: 'Japanese Yen',      flag: '🇯🇵', rate: null },
    SGD: { symbol: 'S$', name: 'Singapore Dollar',  flag: '🇸🇬', rate: null },
    HKD: { symbol: 'HK$',name: 'Hong Kong Dollar',  flag: '🇭🇰', rate: null }
  };

  // Store live rates (AUD = 1.0 base since data is in AUD)
  BD._rates = {};

  // Fallback static rates (used when API fails)
  var FALLBACK_RATES = {
    AUD: 1.0,
    USD: 0.71,   // 1 AUD = 0.71 USD
    EUR: 0.65,   // 1 AUD = 0.65 EUR
    GBP: 0.56,   // 1 AUD = 0.56 GBP
    CAD: 0.96,   // 1 AUD = 0.96 CAD
    NZD: 1.10,   // 1 AUD = 1.10 NZD
    JPY: 105.0,  // 1 AUD = 105 JPY
    SGD: 0.95,   // 1 AUD = 0.95 SGD
    HKD: 5.54    // 1 AUD = 5.54 HKD
  };

  // Initialize — returns a Promise
  BD.initCurrency = function () {
    return new Promise(function (resolve) {
      var cachedRates = localStorage.getItem(RATES_KEY);
      var cachedTS = localStorage.getItem(RATES_TS_KEY);
      var now = Date.now();

      function applyRates(rates) {
        BD._rates = rates;
        Object.keys(BD.currencyDefs).forEach(function (code) {
          if (rates[code] !== undefined) {
            BD.currencyDefs[code].rate = rates[code];
          }
        });
      }

      // 1. Apply cached or fallback rates IMMEDIATELY
      if (cachedRates && cachedTS && (now - parseInt(cachedTS, 10)) < CACHE_MS) {
        try { applyRates(JSON.parse(cachedRates)); }
        catch (e) { applyRates(FALLBACK_RATES); }
      } else {
        applyRates(FALLBACK_RATES);
      }

      // 2. Resolve NOW — don't block page rendering
      resolve();

      // 3. Fetch fresh rates in background
      fetch('https://open.er-api.com/v6/latest/AUD')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.rates) {
            var live = {};
            Object.keys(BD.currencyDefs).forEach(function (code) {
              if (data.rates[code] !== undefined) {
                live[code] = data.rates[code];
              }
            });
            localStorage.setItem(RATES_KEY, JSON.stringify(live));
            localStorage.setItem(RATES_TS_KEY, String(Date.now()));
            applyRates(live);
          }
        })
        .catch(function () { /* silent */ });
    });
  };

  // Get user's selected currency code
  BD.getCurrency = function () {
    // Try session-based key first, then fall back to guest key
    var s = (typeof BD.getSession === 'function') ? BD.getSession() : null;
    if (s && s.email) {
      var val = localStorage.getItem('bd_currency_' + s.email.toLowerCase());
      if (val) return val;
    }
    return localStorage.getItem('bd_currency_guest') || 'AUD';
  };

  // Set user's selected currency
  BD.setCurrency = function (code) {
    if (!BD.currencyDefs[code]) return false;
    // Write to both session key AND guest key for cross-page consistency
    var s = (typeof BD.getSession === 'function') ? BD.getSession() : null;
    if (s && s.email) {
      localStorage.setItem('bd_currency_' + s.email.toLowerCase(), code);
    }
    localStorage.setItem('bd_currency_guest', code);
    return true;
  };

  // Convert an AUD price to the selected currency
  BD.convert = function (audPrice) {
    var target = BD.getCurrency();
    if (target === 'AUD') return audPrice;
    var rate = BD._rates[target] || FALLBACK_RATES[target] || 1.0;
    return audPrice * rate;
  };

  // Format a price in the current currency with correct symbol
  BD.formatMoney = function (audPrice) {
    var converted = BD.convert(audPrice);
    var code = BD.getCurrency();
    var def = BD.currencyDefs[code];
    var symbol = def ? def.symbol : '$';

    if (code === 'JPY') {
      // JPY — no decimal places
      return symbol + ' ' + Math.round(converted).toLocaleString();
    }
    return symbol + ' ' + converted.toFixed(2);
  };

  // Format price as a compact string (no space, for inline use)
  BD.formatMoneyCompact = function (audPrice) {
    var converted = BD.convert(audPrice);
    var code = BD.getCurrency();
    var def = BD.currencyDefs[code];
    var symbol = def ? def.symbol : '$';

    if (code === 'JPY') {
      return symbol + Math.round(converted).toLocaleString();
    }
    return symbol + converted.toFixed(2);
  };

  // Get the raw converted number (for calculation)
  BD.getRawPrice = function (audPrice) {
    return BD.convert(audPrice);
  };

  // Get current currency info
  BD.getCurrencyInfo = function () {
    var code = BD.getCurrency();
    return BD.currencyDefs[code] || BD.currencyDefs['AUD'];
  };

  // Build a currency selector dropdown
  BD.renderCurrencySelector = function (containerId, onChange) {
    var container = typeof containerId === 'string'
      ? document.getElementById(containerId)
      : containerId;
    if (!container) return;

    var current = BD.getCurrency();
    var html = '<select id="currency-select" style="padding:6px 10px;border:1.5px solid var(--line);border-radius:8px;font-size:.8rem;background:#fff;cursor:pointer">';
    Object.keys(BD.currencyDefs).forEach(function (code) {
      var def = BD.currencyDefs[code];
      var sel = code === current ? ' selected' : '';
      html += '<option value="' + code + '"' + sel + '>' + def.flag + ' ' + code + ' (' + def.symbol + ')</option>';
    });
    html += '</select>';
    container.innerHTML = html;

    var sel = document.getElementById('currency-select');
    if (sel) {
      sel.addEventListener('change', function () {
        var newCode = sel.value;
        BD.setCurrency(newCode);
        if (typeof onChange === 'function') {
          onChange(newCode);
        } else {
          // Default: reload page to refresh all prices
          location.reload();
        }
      });
    }
  };

  global.BD = BD;
})(window);
