'use strict';
(() => {
  const c = window.SITE_CONFIG || {};
  const $ = id => document.getElementById(id);
  const safeUrl = (value, fallback) => {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : fallback; } catch { return fallback; }
  };
  const telegram = safeUrl(c.telegram, 'https://t.me/Serafima99');
  const whatsapp = safeUrl(c.whatsapp, 'https://wa.me/79213774041');
  const email = typeof c.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) ? c.email : 'dem.serafima@yandex.com';
  const phone = typeof c.phone === 'string' && /^\+?\d{7,16}$/.test(c.phone) ? c.phone : '+79213774041';
  const contacts = {telegram, whatsapp, email:'mailto:'+email, phone:'tel:'+phone, instagram:safeUrl(c.instagram,'https://www.instagram.com/sdjomina/')};
  document.querySelectorAll('[data-contact]').forEach(a => {
    a.href = contacts[a.dataset.contact];
    if (a.dataset.contact === 'email') a.textContent = email+' ↗';
    if (a.dataset.contact === 'phone' && a.textContent.includes('+')) a.textContent = (c.phoneDisplay || phone)+' ↗';
    if (a.dataset.contact === 'instagram') a.textContent = 'Instagram · @'+new URL(contacts.instagram).pathname.split('/').filter(Boolean).join('/')+' ↗';
  });
  document.querySelectorAll('[data-value]').forEach(el => { if(c.prices?.[el.dataset.value]) el.textContent=c.prices[el.dataset.value]; });
  if (!c.reviewMode) $('review-bar').hidden=true;
  $('hide-review').addEventListener('click',()=>{$('review-bar').hidden=true;});
  const header=document.querySelector('.header');
  const syncHeaderHeight=()=>document.documentElement.style.setProperty('--header-height',header.getBoundingClientRect().height+'px');
  syncHeaderHeight();
  if ('ResizeObserver' in window) new ResizeObserver(syncHeaderHeight).observe(header);
  else window.addEventListener('resize',syncHeaderHeight);
  const menu=document.querySelector('.menu-toggle');
  const closeMenu=()=>{menu.setAttribute('aria-expanded','false');$('navigation').classList.remove('is-open');syncHeaderHeight();};
  menu.addEventListener('click',()=>{const expanded=menu.getAttribute('aria-expanded')==='true';menu.setAttribute('aria-expanded',String(!expanded));$('navigation').classList.toggle('is-open',!expanded);syncHeaderHeight();});
  $('navigation').querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && menu.getAttribute('aria-expanded')==='true'){const inside=$('navigation').contains(document.activeElement);closeMenu();if(inside)menu.focus();}});
  // A native button supplies Enter/Space activation and keyboard focus.
  const requestToggles = [...document.querySelectorAll('.request-toggle')];
  const setRequestExpanded = (button, expanded) => {
    const panel = $(button.getAttribute('aria-controls'));
    button.setAttribute('aria-expanded', String(expanded));
    panel.inert = !expanded;
    panel.classList.toggle('is-open', expanded);
  };
  requestToggles.forEach(button => {
    setRequestExpanded(button, false);
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      requestToggles.forEach(other => setRequestExpanded(other, other === button && expanded));
    });
  });
  function loadPortrait(src, imageId, fallbackId){
    if(!src)return;
    const image=$(imageId);
    image.addEventListener('load',()=>{image.hidden=false;$(fallbackId).hidden=true;});
    image.addEventListener('error',()=>{image.hidden=true;$(fallbackId).hidden=false;});
    image.src=src;
  }
  loadPortrait(c.heroPhoto,'hero-photo','hero-fallback');loadPortrait(c.aboutPhoto,'about-photo','about-fallback');
  const certificates=Array.isArray(c.certificates)?c.certificates.filter(x=>x&&typeof x.src==='string'&&x.src):[];
  if(certificates.length){
    $('certificate-grid').replaceChildren();$('cert-note').textContent='Нажмите на документ, чтобы рассмотреть его.';
    certificates.forEach((item,index)=>{
      const button=document.createElement('button');button.type='button';button.className='certificate-button';
      const img=document.createElement('img');img.src=item.src;img.alt=item.alt||`Документ ${index+1}`;img.loading='lazy';
      const caption=document.createElement('span');caption.textContent=img.alt;button.append(img,caption);
      button.addEventListener('click',()=>{$('document-full').src=item.src;$('document-full').alt=img.alt;$('image-dialog').showModal();});
      $('certificate-grid').append(button);
    });
  } else if(!c.reviewMode) { $('certificates').hidden=true; }
  document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  });
})();
