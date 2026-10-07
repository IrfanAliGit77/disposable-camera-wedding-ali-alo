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
    tabs: $('#g-tabs'), grid: $('#g-grid'), more: $('#g-more'), empty: $('#g-empty'), refresh: $('#g-refresh'), ssBtn: $('#g-slideshow'),
    lb: $('#lb'), lbStage: $('#lb-stage'), lbWho: $('#lb-who'), lbWhen: $('#lb-when'), lbDl: $('#lb-dl'),
    ss: $('#ss'), ssA: $('#ss-a'), ssB: $('#ss-b'), ssWho: $('#ss-who'), ssBrand: $('#ss-brand')
  };
  const POLL_MS = 15000 + Math.floor(Math.random() * 5000);   // tiap HP sedikit berbeda, supaya ribuan tamu tidak bertanya ke server di detik yang sama
  const PAGE = 60;
  const state = {
    items: [], local: [], localUrls: {}, tiles: {}, filter: 'all', view: [], index: 0, first: true,
    revealAt: null, revealed: false, settings: {}, cover: '', cursor: 0, floor: 1, more: false, v: null, own: false, total: 0, busyMore: false,
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

  function paintHeader(r) {
    const s = r.settings || {};
    state.settings = s;
    state.revealed = !!r.revealed || !!r.admin;
    state.own = !!r.own;
    state.revealAt = s.revealAt;
    if (typeof r.total === 'number') state.total = r.total;
    const title = s.eventTitle || '';
    el.title.textContent = title; el.ssBrand.textContent = title; document.title = 'Album — ' + title;
    el.date.textContent = WC.fmtDateLine(s.eventDate);
    if (s.coverFileId && s.coverFileId !== state.cover) {
      state.cover = s.coverFileId; el.portrait.hidden = false;
      WC.loadThumb(el.photo, s.coverFileId, 300);
    }
    const sum = state.total.toLocaleString('id-ID') + ' kiriman';
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
    el.more.hidden = !(state.revealed && state.more);
  }

  // Muat dari awal: halaman pertama = kiriman terbaru
  async function load(quiet) {
    if (state.loading) return;
    state.loading = true;
    if (!quiet) el.lead.textContent = 'Memuat album…';
    try {
      if (!WC.event) throw Object.assign(new Error('Link belum lengkap. Silakan scan ulang kode QR dari mempelai.'), { code: 'NO_EVENT' });
      await WC.queue.load(true);
      const got = await Promise.all([WC.api('list', { pin: WC.pin() || undefined, mode: 'tail', limit: PAGE }), loadLocal()]);
      const r = got[0];
      state.items = r.items || [];
      state.cursor = r.cursor || 0; state.floor = r.floor || 1; state.more = !!r.more; state.v = r.v;
      paintHeader(r);
      render();
    } catch (e) {
      if (!quiet || e.code === 'NO_EVENT') el.lead.textContent = e.code === 'NO_EVENT' ? e.message : 'Album belum bisa dimuat: ' + e.message;
      if (e.code === 'NO_EVENT') stopPolling();
    }
    state.loading = false;
  }

  // Penyegaran ringan: hanya menanyakan kiriman SETELAH yang sudah dimiliki
  async function poll() {
    if (state.loading || !WC.event) return;
    if (state.own || !state.revealed) { await loadLocal(); render(); return; }       // album terkunci: tidak perlu bertanya ke server
    state.loading = true;
    try {
      const got = await Promise.all([WC.api('list', { pin: WC.pin() || undefined, mode: 'after', after: state.cursor }), loadLocal(), WC.queue.load(true)]);
      const r = got[0];
      if (r.v !== state.v || !!r.own !== state.own) { state.loading = false; return load(true); }   // ada yang disembunyikan/dihapus, atau status album berubah
      if (r.items && r.items.length) {
        const have = {};
        state.items.forEach(function (it) { have[it.id] = true; });
        state.items = r.items.filter(function (it) { return !have[it.id]; }).concat(state.items);
      }
      if (typeof r.cursor === 'number') state.cursor = Math.max(state.cursor, r.cursor);
      paintHeader(r);
      render();
    } catch (e) { /* diam: dicoba lagi pada putaran berikutnya */ }
    state.loading = false;
  }

  // "Muat lebih banyak": halaman berikutnya yang lebih lama
  async function loadMore() {
    if (state.busyMore || !state.more || !state.revealed) return;
    state.busyMore = true; el.more.disabled = true; el.more.textContent = 'Memuat…';
    try {
      const r = await WC.api('list', { pin: WC.pin() || undefined, mode: 'before', before: state.floor, limit: PAGE });
      if (r.v !== state.v) { state.busyMore = false; el.more.disabled = false; el.more.textContent = 'Muat Lebih Banyak'; return load(true); }
      const have = {};
      state.items.forEach(function (it) { have[it.id] = true; });
      state.items = state.items.concat((r.items || []).filter(function (it) { return !have[it.id]; }));
      state.floor = r.floor || 1; state.more = !!r.more;
      el.more.hidden = !state.more;
      render();
    } catch (e) { WC.toast('Belum bisa memuat: ' + e.message); }
    state.busyMore = false; el.more.disabled = false; el.more.textContent = 'Muat Lebih Banyak';
  }
  el.more.addEventListener('click', loadMore);
  if ('IntersectionObserver' in window) {        // otomatis memuat saat tombolnya terlihat
    new IntersectionObserver(function (en) { if (en[0].isIntersecting) loadMore(); }, { rootMargin: '600px' }).observe(el.more);
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
  function startPolling() { stopPolling(); state.pollTimer = setInterval(function () { if (!document.hidden) poll(); }, POLL_MS); }
  function stopPolling() { clearInterval(state.pollTimer); state.pollTimer = null; }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  // jepretan yang baru selesai terkirim dari HP ini: langsung perbarui
  WC.queue.on(function (type, item) { if (item.meta.event === WC.event && (type === 'done' || type === 'rejected')) { if (state.own || !state.revealed) load(true); else poll(); } });

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
  function stopVideo() { const v = el.lbStage.querySelector('video'); if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* abaikan */ } } }
  function closeLb() { stopVideo(); el.lb.classList.remove('open'); el.lbStage.innerHTML = ''; document.body.style.overflow = ''; }
  function showLb() {
    const it = state.view[state.index];
    if (!it) return closeLb();
    stopVideo();
    el.lbStage.innerHTML = '';
    const loc = it.pending ? { id: it.localId } : localFor(it.fileId);
    if (it.type === 'video' && !it.pending) {
      el.lbStage.appendChild(makePlayer(it, loc && state.localUrls[loc.id]));
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
  // Pemutar video bawaan HP (bukan pemutar Google Drive yang tombolnya bertumpuk di layar kecil)
  function makePlayer(it, localPoster) {
    const wrap = document.createElement('div');
    wrap.className = 'player';
    const v = document.createElement('video');
    v.controls = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.preload = 'metadata'; v.poster = localPoster || WC.thumb(it.fileId, 1000);
    v.setAttribute('controlslist', 'nodownload noplaybackrate'); v.disablePictureInPicture = true;
    v.setAttribute('aria-label', 'Video dari ' + it.guest);
    const sources = WC.videoSources(it.fileId);
    let n = 0;
    const fail = function () {
      if (++n < sources.length) { v.src = sources[n]; v.load(); return; }
      // semua alamat gagal (biasanya video terlalu besar / masih diproses Drive): tawarkan buka di Drive
      wrap.innerHTML = '<div class="player-fallback"><p>Video ini belum bisa diputar langsung di sini.</p>' +
        '<a class="btn gold small" target="_blank" rel="noopener" href="' + WC.esc(WC.previewUrl(it.fileId)) + '">Putar di Google Drive</a></div>';
    };
    v.addEventListener('error', fail);
    v.src = sources[0];
    wrap.appendChild(v);
    return wrap;
  }
  function stepLb(d) { const n = state.view.length; if (!n) return; state.index = (state.index + d + n) % n; showLb(); }
  $('#lb-close').addEventListener('click', closeLb);
  $('#lb-prev').addEventListener('click', function () { stepLb(-1); });
  $('#lb-next').addEventListener('click', function () { stepLb(1); });
  el.lb.addEventListener('click', function (e) { if (e.target === el.lbStage) closeLb(); });
  let tx = 0;
  el.lbStage.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  el.lbStage.addEventListener('touchend', function (e) {
    if (e.target.closest && e.target.closest('video')) return;      // geser di atas video = menggeser durasi, bukan pindah foto
    const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) stepLb(dx < 0 ? 1 : -1);
  });
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