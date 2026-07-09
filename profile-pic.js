(function(){
  var pic = localStorage.getItem('bd_user_pic');
  if (!pic || pic === 'undefined' || pic === 'null') return;
  
  function swapIcons() {
    var links = document.querySelectorAll('a[href="profile.html"]');
    links.forEach(function(a) {
      if (a.querySelector('img.avatar-pic')) return;
      var svg = a.querySelector('svg');
      if (!svg) return;
      var svgText = svg.outerHTML || '';
      if (svgText.indexOf('M20 21v-2') === -1) return;
      svg.style.display = 'none';
      var img = document.createElement('img');
      img.src = pic;
      img.alt = 'Profile';
      img.className = 'avatar-pic';
      img.style.cssText = 'width:22px;height:22px;border-radius:50%;object-fit:cover';
      img.onerror = function() { svg.style.display = ''; img.remove(); };
      a.insertBefore(img, svg);
    });
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', swapIcons);
  } else {
    swapIcons();
  }
})();
