/* ============================================================
   gallery.js — album per event: tampil instan untuk jepretan
   sendiri, otomatis menyegarkan diri, lightbox, slideshow.
   ============================================================ */
(function () {
  'use strict';
  const $ = WC.$;
  const el = {
    title: $('#g-title'), date: $('#g-date'), lead: $('#g-lead'), develop: $('#g-develop'), total: $('#g-total'),
    portrait: $('#g-portrait'), photo: $('#g-photo'), cam: $('#g-cam'),
    tabs: $('#g-tabs'), grid: $('#g-grid'), empty: $('#g-empty'), refresh: $('#g-refresh'), ssBtn: $('#g-slideshow'),
    lb: $('#lb'), lbStage: $('#lb-stage'), lbWho: $('#lb-who'), lbWhen: $('#lb-when'), lbDl: $('#lb-dl'),
    ss: $('#ss'), ssA: $('#ss-a'), ssB: $('#ss-b'), ssWho: $('#ss-who'), ssBrand: $('#ss-brand')
  };
  const POLL_MS = 10000;
  const state = {
    items: [], local: [], localUrls: {}, tiles: {}, filter: 'all', view: [], index: 0, first: true,
    revealAt: null, revealed: false, settings: {}, cover: '',
    cdTimer: null, pollTimer: null, loading: false, ssTimer: null, ssIndex: 0, ssFlip: false
  };

  // ?key=PIN di alamat = mode admin (untuk layar slideshow di venue sebelum album dibuka)
  if (WC.params.get('key')) {
    WC.pin(WC.params.get('key'));
    history.replaceState(null, '', WC.link(location.pathname.split('/').pop() || 'gallery.html', WC.params.get('slideshow') ? { slideshow: 1 } : {}));
  }
  el.cam.href = WC.link('index.html');

  const ICON_PLAY = '<svg class="ic" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>';

  /* ---------- salinan kecil jepretan sendiri (tersimpan di HP) ---------- */
  async function loadLocal() {
    try { state.local = await WC.thumbs.list(WC.event); } catch (e) { state.local = []; }
    state.local.forEach(function (t) { if (t.blob && !state.localUrls[t.id]) state.localUrls[t.id] = URL.createObjectURL(t.blob); });
  }
  function localFor(fileId) { for (let i = 0; i < state.local.length; i++) if (state.local[i].fileId === fileId) return state.local[i]; return null; }

  async function load(quiet) {
    if (state.loading) return;
    state.loading = true;
    if (!quiet) el.lead.textContent = 'Memuat album…';
    try {
      if (!WC.event) throw Object.assign(new Error('Link belum lengkap. Silakan scan ulang kode QR dari mempelai.'), { code: 'NO_EVENT' });
      await WC.queue.load(true);
      const got = await Promise.all([WC.api('list', { pin: WC.pin() || undefined }), loadLocal()]);
      const r = got[0], s = r.settings || {};
      state.items = r.items || []; state.settings = s;
      state.revealed = !!r.revealed || !!r.admin;
      state.revealAt = s.revealAt;
      const title = s.eventTitle || '';
      el.title.textContent = title; el.ssBrand.textContent = title; document.title = 'Album — ' + title;
      el.date.textContent = WC.fmtDateLine(s.eventDate);
      if (s.coverFileId && s.coverFileId !== state.cover) {
        state.cover = s.coverFileId; el.portrait.hidden = false;
        WC.loadThumb(el.photo, s.coverFileId, 300);
      }
      const c = r.counts || { photos: 0, videos: 0, guests: 0 };
      const sum = c.photos + ' foto · ' + c.videos + ' video · dari ' + c.guests + ' tamu';
      if (state.revealed) {
        el.develop.hidden = true; el.tabs.hidden = false; el.ssBtn.hidden = false;
        el.lead.innerHTML = '<span class="live-dot"></span>' + WC.esc(r.admin && !r.revealed ? 'Mode admin: album belum dibuka untuk tamu. ' + sum : sum);
        stopCountdown();
      } else {
        el.develop.hidden = false; el.tabs.hidden = true; el.ssBtn.hidden = true;
        el.lead.textContent = s.guestsSeeOwn ? 'Sambil menunggu, ini jepretanmu sendiri.' : 'Sabar ya, semua foto dibuka bersamaan.';
        el.total.textContent = 'Sudah terkumpul ' + sum + '.';
        startCountdown();
      }
      render();
    } catch (e) {
      if (!quiet || e.code === 'NO_EVENT') el.lead.textContent = e.code === 'NO_EVENT' ? e.message : 'Album belum bisa dimuat: ' + e.message;
      if (e.code === 'NO_EVENT') stopPolling();
    }
    state.loading = false;
  }

  /* ---------- daftar yang ditampilkan ---------- */
  function buildView() {
    // jepretan sendiri yang masih dalam perjalanan ke Drive: tampil duluan dengan tanda "mengirim"
    const queued = {};
    (WC.queue.items || []).forEach(function (q) { if (q.meta.event === WC.event) queued[q.id] = true; });
    const showOwn = state.revealed || state.settings.guestsSeeOwn;
    const pending = !showOwn ? [] : state.local.filter(function (t) { return !t.fileId && queued[t.id]; }).reverse().map(function (t) {
      return { id: 'local-' + t.id, localId: t.id, pending: true, type: t.type, guest: WC.guestName() || 'Kamu', mine: true, createdAt: new Date(t.createdAt).toISOString() };
    });
    const f = state.filter;
    return pending.concat(state.items).filter(function (it) {
      if (f === 'photo') return it.type !== 'video';
      if (f === 'video') return it.type === 'video';
      if (f === 'mine') return it.mine;
      return true;
    });
  }

  function makeTile(it) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tile' + (state.first ? '' : ' is-new');
    b.setAttribute('aria-label', (it.type === 'video' ? 'Video' : 'Foto') + ' dari ' + it.guest);
    const img = document.createElement('img');
    img.alt = ''; img.decoding = 'async';
    const loc = it.pending ? { id: it.localId } : localFor(it.fileId);
    if (loc && state.localUrls[loc.id]) img.src = state.localUrls[loc.id];        // instan, tanpa menunggu Drive
    else if (it.pending) b.classList.add('is-video-blank');
    else { img.loading = 'lazy'; WC.loadThumb(img, it.fileId, 480); }
    b.appendChild(img);
    b.insertAdjacentHTML('beforeend',
      (it.type === 'video' ? '<span class="badge">' + ICON_PLAY + '</span>' : '') +
      (it.pending ? '<span class="sending">Mengirim…</span>' : '') +
      '<span class="who">' + WC.esc(it.guest) + '</span>');
    b.addEventListener('click', function () { openLb(state.view.findIndex(function (v) { return v.id === it.id; })); });
    return b;
  }

  // Hanya menambah/menghapus tile yang berubah, supaya gambar lama tidak dimuat ulang (tidak berkedip)
  function render() {
    state.view = buildView();
    const keep = {};
    let prev = null;
    state.view.forEach(function (it) {
      let node = state.tiles[it.id];
      if (!node) node = state.tiles[it.id] = makeTile(it);
      keep[it.id] = true;
      const want = prev ? prev.nextSibling : el.grid.firstChild;
      if (node !== want) el.grid.insertBefore(node, want);
      prev = node;
    });
    Object.keys(state.tiles).forEach(function (id) { if (!keep[id]) { state.tiles[id].remove(); delete state.tiles[id]; } });
    el.empty.hidden = state.view.length > 0;
    if (!state.view.length) {
      el.empty.textContent = state.revealed ? (state.filter === 'mine' ? 'Kamu belum memotret apa pun.' : 'Belum ada foto. Jadilah yang pertama memotret!')
        : 'Belum ada jepretanmu di rol ini.';
    }
    state.first = false;
    if (el.lb.classList.contains('open') && !state.view[state.index]) closeLb();
  }

  WC.$$('button', el.tabs).forEach(function (b) {
    b.addEventListener('click', function () {
      state.filter = b.dataset.f;
      WC.$$('button', el.tabs).forEach(function (x) { x.classList.toggle('active', x === b); });
      render();
    });
  });
  el.refresh.addEventListener('click', function () { load(); });

  /* ---------- segarkan otomatis ---------- */
  function startPolling() { stopPolling(); state.pollTimer = setInterval(function () { if (!document.hidden) load(true); }, POLL_MS); }
  function stopPolling() { clearInterval(state.pollTimer); state.pollTimer = null; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(true); });
  // jepretan yang baru selesai terkirim dari HP ini: langsung perbarui
  WC.queue.on(function (type, item) { if (item.meta.event === WC.event && type !== 'added') load(true); });

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
  function openLb(i) { if (i < 0) return; state.index = i; showLb(); el.lb.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeLb() { el.lb.classList.remove('open'); el.lbStage.innerHTML = ''; document.body.style.overflow = ''; }
  function showLb() {
    const it = state.view[state.index];
    if (!it) return closeLb();
    el.lbStage.innerHTML = '';
    const loc = it.pending ? { id: it.localId } : localFor(it.fileId);
    if (it.type === 'video' && !it.pending) {
      const f = document.createElement('iframe');
      f.src = WC.previewUrl(it.fileId); f.allow = 'autoplay; fullscreen'; f.allowFullscreen = true; f.title = 'Video dari ' + it.guest;
      el.lbStage.appendChild(f);
    } else {
      const img = document.createElement('img');
      img.alt = 'Foto dari ' + it.guest;
      if (loc && state.localUrls[loc.id]) img.src = state.localUrls[loc.id];       // tampil dulu versi kecil...
      if (!it.pending) {                                                           // ...lalu ganti versi tajam dari Drive
        const hi = new Image();
        hi.onload = function () { if (state.view[state.index] === it) img.src = hi.src; };
        if (img.src) hi.src = WC.thumb(it.fileId, 2000); else WC.loadThumb(img, it.fileId, 2000);
      }
      el.lbStage.appendChild(img);
    }
    el.lbWho.textContent = it.guest;
    el.lbWhen.textContent = it.pending ? 'Sedang dikirim…' : WC.fmtTime(it.createdAt) + (it.source === 'library' ? ' · dari galeri' : '');
    el.lbDl.hidden = !!it.pending;
    if (!it.pending) el.lbDl.href = WC.downloadUrl(it.fileId);
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
    // foto yang baru masuk ditampilkan lebih dulu
    let it = null;
    for (let i = 0; i < list.length; i++) if (!ssNext.seen[list[i].id]) { it = list[i]; break; }
    if (!it) { state.ssIndex = state.ssIndex % list.length; it = list[state.ssIndex++]; }
    ssNext.seen[it.id] = true;
    const show = state.ssFlip ? el.ssB : el.ssA, hide = state.ssFlip ? el.ssA : el.ssB;
    state.ssFlip = !state.ssFlip;
    const pre = new Image();
    pre.onload = function () { show.src = pre.src; show.classList.add('on'); hide.classList.remove('on'); el.ssWho.textContent = it.guest; };
    pre.onerror = function () { delete ssNext.seen[it.id]; };       // belum siap di Drive: coba lagi di putaran berikut
    pre.src = WC.thumb(it.fileId, 2000);
  }
  ssNext.seen = {};
  function startSs() {
    el.ss.classList.add('open'); state.ssIndex = 0;
    ssPhotos().forEach(function (it) { ssNext.seen[it.id] = true; });   // mulai dari urutan biasa, foto baru menyela
    if (el.ss.requestFullscreen) el.ss.requestFullscreen().catch(function () {});
    ssNext();
    state.ssTimer = setInterval(ssNext, 6000);
  }
  function stopSs() {
    el.ss.classList.remove('open'); clearInterval(state.ssTimer);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
  }
  el.ssBtn.addEventListener('click', startSs);
  $('#ss-exit').addEventListener('click', stopSs);
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && el.ss.classList.contains('open')) stopSs(); });

  load().then(function () {
    startPolling();
    WC.queue.pump();                        // lanjutkan jepretan tertunda dari halaman ini juga (aman dari kirim ganda)
    if (WC.params.get('slideshow') && state.revealed) startSs();
  });
})();
