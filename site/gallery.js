'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const carousel = $('certificate-carousel');
  if (!carousel) return;
  const config = window.SITE_CONFIG || {};
  const documents = Array.isArray(config.certificates)
    ? config.certificates.filter(item => item && typeof item.src === 'string' && item.src) : [];
  if (!documents.length) {
    $('certificates').hidden = true;
    return;
  }
  const track = $('certificate-track'), pagination = $('certificate-pagination');
  const dialog = $('image-dialog'), viewport = $('lightbox-viewport'), fullTrack = $('lightbox-track');
  const prev = $('certificate-prev'), next = $('certificate-next');
  const fullPrev = $('lightbox-prev'), fullNext = $('lightbox-next');
  const zoomOut = $('zoom-out'), zoomIn = $('zoom-in'), zoomReset = $('zoom-reset');
  const slides = [], dots = [], fullImages = [];
  let current = 0, zoom = 1, panX = 0, panY = 0, suppressClickUntil = 0;
  let scrollState = null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const title = index => documents[index].alt || `Документ ${index + 1}`;

  documents.forEach((item, index) => {
    const slide = document.createElement('figure');
    slide.className = 'certificate-slide';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'слайд');
    slide.setAttribute('aria-label', `${index + 1} из ${documents.length}`);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'certificate-button';
    button.setAttribute('aria-label', 'Открыть: ' + title(index));
    const picture = document.createElement('picture');
    const source = document.createElement('source'); source.type = 'image/webp';
    const image = document.createElement('img');
    image.alt = title(index); image.loading = 'lazy'; image.decoding = 'async';
    if (item.width && item.height) { image.width = item.width; image.height = item.height; }
    picture.append(source, image); button.append(picture);
    const caption = document.createElement('figcaption'); caption.textContent = title(index);
    slide.append(button, caption); track.append(slide);
    button.addEventListener('click', event => {
      if (performance.now() < suppressClickUntil) { event.preventDefault(); return; }
      openDocument(index);
    });
    slides.push({slide, button, source, image, loaded:false});
    const dot = document.createElement('button');
    dot.type = 'button'; dot.className = 'carousel-dot';
    dot.setAttribute('aria-label', `Документ ${index + 1}: ${title(index)}`);
    dot.setAttribute('aria-controls', 'certificate-track');
    dot.addEventListener('click', () => select(index));
    pagination.append(dot); dots.push(dot);
    const fullSlide = document.createElement('div'); fullSlide.className = 'lightbox-slide';
    const fullImage = document.createElement('img'); fullImage.className = 'lightbox-image';
    fullImage.alt = title(index); fullImage.decoding = 'async'; fullImage.draggable = false;
    fullSlide.append(fullImage); fullTrack.append(fullSlide); fullImages.push(fullImage);
    fullImage.addEventListener('load', renderZoom);
  });

  function loadPreview(index) {
    const entry = slides[index], item = documents[index];
    if (!entry || entry.loaded) return;
    entry.loaded = true;
    if (item.previewSrcset) {
      entry.source.sizes = '(max-width: 560px) calc(100vw - 142px), (max-width: 800px) calc(100vw - 166px), 884px';
      entry.source.srcset = item.previewSrcset;
    }
    entry.image.src = item.src;
  }
  function loadFull(index) {
    if (fullImages[index] && !fullImages[index].getAttribute('src')) fullImages[index].src = documents[index].src;
  }
  function neighbors(load) {
    [current, current - 1, current + 1].forEach(index => { if (index >= 0 && index < documents.length) load(index); });
  }
  function select(index) {
    const selected = clamp(index, 0, documents.length - 1);
    if (current !== selected) resetZoom();
    current = selected;
    neighbors(loadPreview);
    track.style.transform = `translateX(${-100 * current}%)`;
    slides.forEach((entry, i) => {
      entry.slide.setAttribute('aria-hidden', String(i !== current));
      entry.slide.inert = i !== current;
      dots[i].setAttribute('aria-current', String(i === current));
      fullImages[i].parentElement.setAttribute('aria-hidden', String(i !== current));
    });
    prev.disabled = fullPrev.disabled = current === 0;
    next.disabled = fullNext.disabled = current === documents.length - 1;
    $('certificate-counter').textContent = `${current + 1} / ${documents.length}`;
    if (dialog.open) syncLightbox();
  }
  function syncLightbox() {
    neighbors(loadFull);
    fullTrack.style.transform = `translateX(${-100 * current}%)`;
    $('lightbox-counter').textContent = `${current + 1} / ${documents.length}`;
    $('lightbox-caption').textContent = title(current);
  }
  function lockPage() {
    const style = document.body.style;
    scrollState = {y:window.scrollY, position:style.position, top:style.top, left:style.left,
      right:style.right, paddingRight:style.paddingRight};
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap) style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + gap}px`;
    style.position = 'fixed'; style.top = `-${scrollState.y}px`; style.left = '0'; style.right = '0';
  }
  function openDocument(index) {
    select(index); lockPage(); dialog.showModal(); syncLightbox(); resetZoom();
    dialog.querySelector('[data-close]').focus({preventScroll:true});
  }
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    resetZoom(); points.clear(); pinchStart = null; panStart = null;
    if (scrollState) {
      const {y, ...styles} = scrollState;
      Object.assign(document.body.style, styles); scrollState = null;
      const behavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, y);
      document.documentElement.style.scrollBehavior = behavior;
    }
    slides[current].button.focus({preventScroll:true});
  });
  prev.addEventListener('click', () => select(current - 1));
  next.addEventListener('click', () => select(current + 1));
  fullPrev.addEventListener('click', () => select(current - 1));
  fullNext.addEventListener('click', () => select(current + 1));
  function keys(event) {
    let index;
    if (event.key === 'ArrowLeft') index = current - 1;
    else if (event.key === 'ArrowRight') index = current + 1;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = documents.length - 1;
    else return;
    event.preventDefault(); select(index);
  }
  carousel.addEventListener('keydown', keys);
  dialog.addEventListener('keydown', keys);
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled)')];
    const index = controls.indexOf(document.activeElement);
    if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === controls.length - 1)) {
      event.preventDefault();
      controls[event.shiftKey ? controls.length - 1 : 0].focus({preventScroll:true});
    }
  });

  // Keep vertical page scrolling and native pinch zoom available in the page gallery.
  let swipe = null;
  const pageViewport = $('certificate-viewport');
  pageViewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    swipe = event.isPrimary ? {id:event.pointerId, x:event.clientX, y:event.clientY} : null;
  });
  pageViewport.addEventListener('pointerup', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      suppressClickUntil = performance.now() + 500; select(current + (dx < 0 ? 1 : -1));
    }
  });
  pageViewport.addEventListener('pointercancel', () => { swipe = null; });

  function renderZoom() {
    const image = fullImages[current];
    if (!image) return;
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const fit = Math.min(width / (image.naturalWidth || width), height / (image.naturalHeight || height));
    const maxX = Math.max(0, ((image.naturalWidth || width) * fit * zoom - width) / 2);
    const maxY = Math.max(0, ((image.naturalHeight || height) * fit * zoom - height) / 2);
    panX = clamp(panX, -maxX, maxX); panY = clamp(panY, -maxY, maxY);
    image.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    viewport.classList.toggle('is-zoomed', zoom > 1);
    zoomReset.textContent = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= 1; zoomIn.disabled = zoom >= 4;
  }
  function setZoom(value) { zoom = clamp(value, 1, 4); renderZoom(); }
  function resetZoom() {
    fullImages.forEach(image => { image.style.transform = ''; });
    zoom = 1; panX = panY = 0; renderZoom();
  }
  zoomOut.addEventListener('click', () => setZoom(zoom - .5));
  zoomIn.addEventListener('click', () => setZoom(zoom + .5));
  zoomReset.addEventListener('click', resetZoom);
  viewport.addEventListener('dblclick', event => { event.preventDefault(); setZoom(zoom > 1 ? 1 : 2); });
  window.addEventListener('resize', () => { if (dialog.open) renderZoom(); });

  // Pinch zoom and pan are confined to the fullscreen image surface.
  const points = new Map();
  let panStart = null, pinchStart = null, hadPinch = false;
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const midpoint = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault(); viewport.setPointerCapture(event.pointerId);
    points.set(event.pointerId,{x:event.clientX,y:event.clientY});
    viewport.classList.add('is-gesturing');
    if (points.size === 1) {
      hadPinch = false;
      panStart = {x:event.clientX,y:event.clientY,panX,panY};
    } else if (points.size === 2) {
      hadPinch = true;
      const [a,b] = [...points.values()];
      pinchStart = {distance:distance(a,b),zoom,mid:midpoint(a,b),panX,panY};
    }
  });
  viewport.addEventListener('pointermove', event => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if (points.size >= 2 && pinchStart) {
      const [a,b] = [...points.values()], mid = midpoint(a,b), rect = viewport.getBoundingClientRect();
      const newZoom = clamp(pinchStart.zoom * distance(a,b) / Math.max(1,pinchStart.distance),1,4);
      const cx = rect.left+rect.width/2, cy = rect.top+rect.height/2;
      panX = mid.x-cx-(pinchStart.mid.x-cx-pinchStart.panX)*newZoom/pinchStart.zoom;
      panY = mid.y-cy-(pinchStart.mid.y-cy-pinchStart.panY)*newZoom/pinchStart.zoom;
      zoom = newZoom; renderZoom();
    } else if (zoom > 1 && panStart) {
      panX = panStart.panX + event.clientX-panStart.x;
      panY = panStart.panY + event.clientY-panStart.y; renderZoom();
    }
  });
  function endPointer(event) {
    if (!points.has(event.pointerId)) return;
    const dx = panStart ? event.clientX-panStart.x : 0;
    const dy = panStart ? event.clientY-panStart.y : 0;
    points.delete(event.pointerId);
    if (!points.size) {
      viewport.classList.remove('is-gesturing');
      if (event.type === 'pointerup' && !hadPinch && zoom === 1 && Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.3)
        select(current+(dx<0?1:-1));
      panStart = pinchStart = null;
    } else if (points.size === 1) {
      const [point] = points.values();
      panStart = {x:point.x,y:point.y,panX,panY}; pinchStart = null;
    }
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  select(0);
})();
