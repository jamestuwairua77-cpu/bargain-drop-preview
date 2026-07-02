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