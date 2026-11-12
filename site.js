(function(){
 var B=(document.currentScript&&document.currentScript.src||'').replace(/[^\/]*$/,'');
 var norm=function(x){return x.split('#')[0].split('?')[0].replace(/index\.html$/,'')};
 var here=norm(B&&location.href.indexOf(B)===0?location.href.slice(B.length):(location.pathname.split('/').pop()||''));
 var items=[['index.html','Explore BoatMedix'],['boaters.html','For Boaters'],['dine.html','Dock & Dine'],['marinepro/','Marine Pros'],['dealers.html','For Dealers'],['manufacturers.html','Manufacturers'],['story.html','Our Story']];
 var cur=function(i){return norm(i[0])===here?' aria-current="page"':''};
 var li=items.map(function(i){return '<li><a href="'+B+i[0]+'"'+cur(i)+'>'+i[1].replace('&','&amp;')+'</a></li>'}).join('');
 var brand='<a class="brand" href="'+B+'index.html" aria-label="BoatMedix™ — Never Boat Alone™"><img class="ic" src="'+B+'brand/icon.png" alt=""><span class="tx"><img class="wm" src="'+B+'brand/wordmark-navy.svg" alt="BoatMedix™"><span class="tg">Never Boat Alone<sup>™</sup></span></span></a>';
 var nav=document.querySelector('nav[data-site]');
 if(nav){nav.innerHTML=brand+'<ul>'+li+'</ul><a class="btn b-ink b-sm" href="'+B+'index.html#crew">Join the Waitlist</a><button class="menu" aria-expanded="false" aria-controls="mnav">Menu <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><div class="mnav" id="mnav">'+items.map(function(i){return '<a href="'+B+i[0]+'"'+cur(i)+'>'+i[1].replace('&','&amp;')+'</a>'}).join('')+'<a class="btn b-ink" href="'+B+'index.html#crew">Join the Waitlist</a></div>';
  var b=nav.querySelector('.menu'),m=nav.querySelector('.mnav');b.addEventListener('click',function(){var o=m.classList.toggle('open');b.setAttribute('aria-expanded',o)});}
 var ft=document.querySelector('footer[data-site]');
 if(ft){ft.innerHTML='<div class="wrap">'+brand+'<span class="links"><a href="'+B+'index.html">Explore</a><a href="'+B+'boaters.html">For Boaters</a><a href="'+B+'dine.html">Dock &amp; Dine</a><a href="'+B+'dealers.html">For Dealers</a><a href="'+B+'manufacturers.html">Manufacturers</a><a href="'+B+'story.html">Our Story</a><a href="'+B+'marinepro/">Marine Pros</a><a href="'+B+'get.html">Get BoatMedix</a><a href="'+B+'privacy.html">Privacy</a><a href="mailto:hello@boatmedix.com">Support</a><a href="https://app.boatmedix.com/" rel="nofollow">Tester sign-in</a></span><span>© 2026 BoatMedix LLC. All rights reserved.</span></div>'+'<div class="legal"><p>BoatMedix is developed by BoatMedix LLC.</p><p>Women-owned small business (WOSB) · Veteran-owned small business · Service-disabled veteran-owned small business.</p><p>BoatMedix™ · Never Boat Alone™ · U.S. Trademark Application Serial No. 99640104 · U.S. Copyright Office Application Case No. 1-15234279301.</p></div>';}
 document.querySelectorAll('[data-i]').forEach(function(e){if(window.P&&P[e.dataset.i])e.innerHTML='<svg class="'+(e.dataset.c||'i')+'" viewBox="0 0 24 24">'+P[e.dataset.i]+'</svg>'});
})();
