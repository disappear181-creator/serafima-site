'use strict';
(() => {
  const c = window.SITE_CONFIG || {};
  let selectedFormat = '';
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
  const menu=document.querySelector('.menu-toggle');
  menu.addEventListener('click',()=>{const expanded=menu.getAttribute('aria-expanded')==='true';menu.setAttribute('aria-expanded',String(!expanded));$('navigation').classList.toggle('is-open',!expanded);});
  $('navigation').querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.setAttribute('aria-expanded','false');$('navigation').classList.remove('is-open');}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && menu.getAttribute('aria-expanded')==='true'){const inside=$('navigation').contains(document.activeElement);menu.setAttribute('aria-expanded','false');$('navigation').classList.remove('is-open');if(inside)menu.focus();}});
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
  document.querySelectorAll('[data-format]').forEach(a=>a.addEventListener('click',()=>{
    selectedFormat=a.dataset.format;$('selected-format').textContent='Выбран формат: '+selectedFormat+'.';$('selected-format').hidden=false;
  }));
  $('booking-form').addEventListener('submit',e=>{
    e.preventDefault();
    const name=$('client-name').value.trim();const contact=$('client-contact').value.trim();
    $('client-name').setCustomValidity(name.length<2?'Укажите, как к вам обращаться.':'');
    $('client-contact').setCustomValidity(contact.length<3?'Укажите Telegram или номер телефона.':'');
    if(!$('booking-form').reportValidity())return;
    const text=`Здравствуйте, Серафима! Хочу записаться на консультацию${selectedFormat?' ('+selectedFormat+')':''}.\nМеня зовут ${name}.\nУдобный способ связи: ${contact}.\nПодскажите, пожалуйста, свободное время.`;
    $('message-preview').value=text;
    const wa=new URL(whatsapp);wa.searchParams.set('text',text);$('message-whatsapp').href=wa.href;
    $('message-email').href='mailto:'+email+'?subject='+encodeURIComponent('Запись на консультацию')+'&body='+encodeURIComponent(text);
    $('message-telegram').href=telegram;$('copy-status').textContent='';$('message-dialog').showModal();
  });
  $('booking-submit').disabled=false;
  ['client-name','client-contact'].forEach(id=>$(id).addEventListener('input',()=>$(id).setCustomValidity('')));
  $('copy-message').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText($('message-preview').value);$('copy-status').textContent='Текст скопирован. Вставьте его в чат и отправьте.';}
    catch{$('message-preview').focus();$('message-preview').select();$('copy-status').textContent='Выделили текст: скопируйте его вручную и вставьте в чат.';}
  });
  document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  });
})();
