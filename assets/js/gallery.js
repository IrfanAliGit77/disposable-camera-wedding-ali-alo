/* ============================================================
   gallery.js — album bersama, lightbox, dan slideshow layar besar
   ============================================================ */
(function () {
  'use strict';
  const C = window.WC_CONFIG || {};
  const $ = WC.$;
  const el = {
    title: $('#g-title'), lead: $('#g-lead'), develop: $('#g-develop'), total: $('#g-total'),
    tabs: $('#g-tabs'), grid: $('#g-grid'), empty: $('#g-empty'), refresh: $('#g-refresh'), ssBtn: $('#g-slideshow'),
    lb: $('#lb'), lbStage: $('#lb-stage'), lbWho: $('#lb-who'), lbWhen: $('#lb-when'), lbDl: $('#lb-dl'),
    ss: $('#ss'), ssA: $('#ss-a'), ssB: $('#ss-b'), ssWho: $('#ss-who'), ssBrand: $('#ss-brand')
  };
  const state = { items: [], filter: 'all', view: [], index: 0, revealAt: null, revealed: false, cdTimer: null, ssTimer: null, ssPoll: null, ssIndex: 0, ssFlip: false };

  // ?key=PIN di alamat = mode admin (untuk layar slideshow di venue sebelum album dibuka)
  const params = new URLSearchParams(location.search);
  if (params.get('key')) { WC.pin(params.get('key')); history.replaceState(null, '', location.pathname + (params.get('slideshow') ? '?slideshow=1' : '')); }

  const ICON_PLAY = '<svg class="ic" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>';

  async function load(quiet) {
    if (!quiet) el.lead.textContent = 'Memuat album…';
    try {
      const r = await WC.api('list', { pin: WC.pin() || undefined });
      const s = r.settings || {};
      state.items = r.items || [];
      state.revealed = !!r.revealed || !!r.admin;
      state.revealAt = s.revealAt;
      const title = s.eventTitle || C.TITLE || 'Ali & Alo';
      el.title.textContent = title; el.ssBrand.textContent = title;
      const c = r.counts || { photos: 0, videos: 0, guests: 0 };
      const sum = c.photos + ' foto · ' + c.videos + ' video · dari ' + c.guests + ' tamu';
      if (state.revealed) {
        el.develop.hidden = true; el.tabs.hidden = false; el.ssBtn.hidden = false;
        el.lead.textContent = r.admin && !r.revealed ? 'Mode admin: album belum dibuka untuk tamu. ' + sum : sum;
        stopCountdown();
      } else {
        el.develop.hidden = false; el.tabs.hidden = true; el.ssBtn.hidden = true;
        el.lead.textContent = s.guestsSeeOwn ? 'Sambil menunggu, ini jepretanmu sendiri.' : 'Sabar ya, semua foto dibuka bersamaan.';
        el.total.textContent = 'Sudah terkumpul ' + sum + '.';
        startCountdown();
      }
      render();
    } catch (e) {
      el.lead.textContent = 'Album belum bisa dimuat: ' + e.message;
    }
  }

  function filtered() {
    const f = state.filter;
    return state.items.filter(function (it) {
      if (f === 'photo') return it.type !== 'video';
      if (f === 'video') return it.type === 'video';
      if (f === 'mine') return it.mine;
      return true;
    });
  }

  function render() {
    state.view = filtered();
    el.grid.innerHTML = '';
    state.view.forEach(function (it, i) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tile';
      b.setAttribute('aria-label', (it.type === 'video' ? 'Video' : 'Foto') + ' dari ' + it.guest);
      const img = document.createElement('img');
      img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      WC.loadThumb(img, it.fileId, 480);
      b.appendChild(img);
      b.insertAdjacentHTML('beforeend', (it.type === 'video' ? '<span class="badge">' + ICON_PLAY + '</span>' : '') + '<span class="who">' + WC.esc(it.guest) + '</span>');
      b.addEventListener('click', function () { openLb(i); });
      el.grid.appendChild(b);
    });
    el.empty.hidden = state.view.length > 0;
    if (!state.view.length) {
      el.empty.textContent = state.revealed ? (state.filter === 'mine' ? 'Kamu belum memotret apa pun.' : 'Belum ada foto. Jadilah yang pertama memotret!')
        : 'Belum ada jepretanmu di rol ini.';
    }
  }

  WC.$$('button', el.tabs).forEach(function (b) {
    b.addEventListener('click', function () {
      state.filter = b.dataset.f;
      WC.$$('button', el.tabs).forEach(function (x) { x.classList.toggle('active', x === b); });
      render();
    });
  });
  el.refresh.addEventListener('click', function () { load(); });

  /* ---------- hitung mundur ---------- */
  function startCountdown() {
    stopCountdown();
    const tick = function () {
      const diff = new Date(state.revealAt).getTime() - Date.now();
      if (isNaN(diff)) return;
      if (diff <= 0) { stopCountdown(); load(); return; }
      const p = function (n) { return String(Math.floor(n)).padStart(2, '0'); };
      $('#cd-d').textContent = p(diff / 86400000);
      $('#cd-h').textContent = p((diff % 86400000) / 3600000);
      $('#cd-m').textContent = p((diff % 3600000) / 60000);
      $('#cd-s').textContent = p((diff % 60000) / 1000);
    };
    tick(); state.cdTimer = setInterval(tick, 1000);
  }
  function stopCountdown() { clearInterval(state.cdTimer); state.cdTimer = null; }

  /* ---------- lightbox ---------- */
  function openLb(i) { state.index = i; showLb(); el.lb.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeLb() { el.lb.classList.remove('open'); el.lbStage.innerHTML = ''; document.body.style.overflow = ''; }
  function showLb() {
    const it = state.view[state.index];
    if (!it) return closeLb();
    el.lbStage.innerHTML = '';
    if (it.type === 'video') {
      const f = document.createElement('iframe');
      f.src = WC.previewUrl(it.fileId); f.allow = 'autoplay; fullscreen'; f.allowFullscreen = true; f.title = 'Video dari ' + it.guest;
      el.lbStage.appendChild(f);
    } else {
      const img = document.createElement('img');
      img.alt = 'Foto dari ' + it.guest;
      WC.loadThumb(img, it.fileId, 2000);
      el.lbStage.appendChild(img);
    }
    el.lbWho.textContent = it.guest;
    el.lbWhen.textContent = WC.fmtTime(it.createdAt) + (it.source === 'library' ? ' · dari galeri' : '');
    el.lbDl.href = WC.downloadUrl(it.fileId);
  }
  function stepLb(d) { const n = state.view.length; if (!n) return; state.index = (state.index + d + n) % n; showLb(); }
  $('#lb-close').addEventListener('click', closeLb);
  $('#lb-prev').addEventListener('click', function () { stepLb(-1); });
  $('#lb-next').addEventListener('click', function () { stepLb(1); });
  el.lb.addEventListener('click', function (e) { if (e.target === el.lbStage) closeLb(); });
  let tx = 0;
  el.lbStage.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  el.lbStage.addEventListener('touchend', function (e) { const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) stepLb(dx < 0 ? 1 : -1); });
  document.addEventListener('keydown', function (e) {
    if (el.ss.classList.contains('open')) { if (e.key === 'Escape') stopSs(); return; }
    if (!el.lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') stepLb(-1);
    if (e.key === 'ArrowRight') stepLb(1);
  });

  /* ---------- slideshow (untuk TV/proyektor di venue) ---------- */
  function ssPhotos() { return state.items.filter(function (it) { return it.type !== 'video'; }); }
  function ssNext() {
    const list = ssPhotos();
    if (!list.length) { el.ssWho.textContent = 'Menunggu foto pertama…'; return; }
    state.ssIndex = state.ssIndex % list.length;
    const it = list[state.ssIndex++];
    const show = state.ssFlip ? el.ssB : el.ssA, hide = state.ssFlip ? el.ssA : el.ssB;
    state.ssFlip = !state.ssFlip;
    const pre = new Image();
    pre.onload = function () { show.src = pre.src; show.classList.add('on'); hide.classList.remove('on'); el.ssWho.textContent = it.guest; };
    pre.onerror = function () { /* lewati foto yang belum siap */ };
    pre.src = WC.thumb(it.fileId, 2000);
  }
  function startSs() {
    el.ss.classList.add('open'); state.ssIndex = 0;
    if (el.ss.requestFullscreen) el.ss.requestFullscreen().catch(function () {});
    ssNext();
    state.ssTimer = setInterval(ssNext, 6000);
    state.ssPoll = setInterval(function () { load(true); }, 30000);    // ambil foto baru tiap 30 detik
  }
  function stopSs() {
    el.ss.classList.remove('open'); clearInterval(state.ssTimer); clearInterval(state.ssPoll);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
  }
  el.ssBtn.addEventListener('click', startSs);
  $('#ss-exit').addEventListener('click', stopSs);
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && el.ss.classList.contains('open')) stopSs(); });

  load().then(function () { if (params.get('slideshow') && state.revealed) startSs(); });
})();
