// --- State ---
var product = null;
var qty = 1;
var pid = (new URLSearchParams(location.search)).get('id');
var currentImgIdx = 0;
var allImages = [];
var selectedVariants = { color: null, size: null, model: null };
var reviewsShownCount = 5;
var currentReviewFilter = 'all';
var allReviews = [];
var relatedProducts = [];
var oosVariants = new Set(); // e.g. "color:Red|size:XL"

// --- Utils ---
function esc(t){return String(t==null?'':t).replace(/&/g-&amp;-).replace(/</g-&lt;-).replace(/>/g-&gt;-);}
function hideLoad(){document.getElementById('loading-overlay').style.display='none';}
function showError(m){document.getElementById('product-title').textContent=m;hideLoad();}
function money(n){return 'AU$+'+(Number(n)||0).toFixed(2);}