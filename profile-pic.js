(function(){
  var pic = localStorage.getItem('bd_user_pic');
  if (!pic || pic === 'undefined' || pic === 'null') return;

  var done = false;
  function swapAll() {
    if (done) return;
    var found = false;

    // Strategy 1: pages that have dedicated span-wrapper + hidden img placeholders
    var hIcon = document.getElementById('header-profile-icon-svg');
    var hPic  = document.getElementById('header-profile-pic');
    if (hIcon && hPic) {
      hIcon.style.display = 'none';
      hPic.src = pic;
      hPic.style.display = '';
      hPic.style.width = '22px';
      hPic.style.height = '22px';
      hPic.style.borderRadius = '50%';
      hPic.style.objectFit = 'cover';
      found = true;
    }

    var nIcon = document.getElementById('nav-profile-icon-svg');
    var nPic  = document.getElementById('nav-profile-pic');
    if (nIcon && nPic) {
      nIcon.style.display = 'none';
      nPic.src = pic;
      nPic.style.display = '';
      nPic.style.width = '22px';
      nPic.style.height = '22px';
      nPic.style.borderRadius = '50%';
      nPic.style.objectFit = 'cover';
      found = true;
    }

    // Strategy 2: fallback for pages without the wrapper structure
    var links = document.querySelectorAll('a[href="profile.html"]');
    links.forEach(function(a) {
      if (a.querySelector('img.avatar-pic')) return;
      var svg = a.querySelector('svg');
      if (!svg) return;
      var html = svg.outerHTML || '';
      if (html.indexOf('M20 21v-2') === -1) return;
      svg.style.display = 'none';
      var img = document.createElement('img');
      img.src = pic;
      img.alt = 'Profile';
      img.className = 'avatar-pic';
      img.style.cssText = 'width:22px;height:22px;border-radius:50%;object-fit:cover';
      img.onerror = function() { svg.style.display = ''; img.remove(); };
      a.insertBefore(img, svg);
      found = true;
    });

    if (found) done = true;
  }

  swapAll();
  setTimeout(swapAll, 300);
  setTimeout(swapAll, 800);
  setTimeout(swapAll, 2000);
})();
