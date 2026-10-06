/* ============================================================
   admin.js — dashboard mempelai
   ============================================================ */
(function () {
  'use strict';
  const C = window.WC_CONFIG || {};
  const $ = WC.$;
  const el = {
    login: $('#a-login'), loginForm: $('#a-login-form'), pin: $('#a-pin'), loginBtn: $('#a-login-btn'), loginErr: $('#a-login-err'),
    dash: $('#a-dash'), title: $('#a-title'), pillCam: $('#a-pill-cam'), pillAlbum: $('#a-pill-album'),
    toggleCam: $('#a-toggle-cam'), toggleAlbum: $('#a-toggle-album'), reload: $('#a-reload'), drive: $('#a-drive'), sheet: $('#a-sheet'), logout: $('#a-logout'),
    qr: $('#a-qr'), qrUrl: $('#a-qr-url'), qrTitle: $('#qr-title'), print: $('#a-print'), copy: $('#a-copy'),
    form: $('#a-settings'), save: $('#a-save'), guests: $('#a-guests'), tabs: $('#a-tabs'), grid: $('#a-grid'), empty: $('#a-empty')
  };
  const state = { settings: {}, items: [], revealed: false, filter: 'all' };
  const guestUrl = new URL('index.html', location.href).href.replace(/index\.html$/, '');

  function admin(action, data) { return WC.api(action, Object.assign({ pin: WC.pin() }, data || {})); }

  /* ---------- login ---------- */
  el.loginForm.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    el.loginBtn.disabled = true; el.loginErr.hidden = true;
    try {
      WC.pin(el.pin.value);
      await admin('adminLogin');
      enter();
    } catch (e) {
      WC.pin(null);
      el.loginErr.hidden = false; el.loginErr.textContent = e.message;
    }
    el.loginBtn.disabled = false;
  });
  el.logout.addEventListener('click', function () { WC.pin(null); location.reload(); });

  function enter() {
    el.login.hidden = true; el.dash.hidden = false;
    // Slideshow dibuka di tab baru: titipkan PIN supaya bisa tampil sebelum album dibuka (PIN langsung dihapus dari alamat)
    $('#a-ss').href = 'gallery.html?slideshow=1&key=' + encodeURIComponent(WC.pin());
    drawQr(); load();
  }

  /* ---------- data ---------- */
  async function load() {
    try {
      const r = await admin('list');
      if (!r.admin) throw Object.assign(new Error('Sesi habis, silakan masuk lagi.'), { code: 'AUTH' });
      state.settings = r.settings; state.items = r.items || []; state.revealed = r.revealed;
      const c = r.counts;
      $('#s-photos').textContent = c.photos; $('#s-videos').textContent = c.videos;
      $('#s-guests').textContent = c.guests; $('#s-size').textContent = WC.fmtBytes(c.bytes);
      el.drive.href = r.folderUrl; el.sheet.href = r.sheetUrl;
      paintStatus(); fillForm(); renderGuests(); renderGrid();
    } catch (e) {
      if (e.code === 'AUTH') { WC.pin(null); location.reload(); return; }
      WC.toast('Gagal memuat: ' + e.message, 4000);
    }
  }

  function paintStatus() {
    const s = state.settings;
    const title = s.eventTitle || C.TITLE || 'Ali & Alo';
    el.title.textContent = title; el.qrTitle.textContent = title;
    el.pillCam.textContent = s.cameraOpen ? 'Kamera dibuka' : 'Kamera ditutup';
    el.pillCam.classList.toggle('off', !s.cameraOpen);
    el.pillAlbum.textContent = state.revealed ? 'Album dibuka' : 'Album masih dikunci';
    el.pillAlbum.classList.toggle('off', !state.revealed);
    el.toggleCam.textContent = s.cameraOpen ? 'Tutup Kamera' : 'Buka Kamera';
    el.toggleAlbum.textContent = state.revealed ? 'Kunci Album Lagi' : 'Buka Album Sekarang';
  }

  /* ---------- pengaturan ---------- */
  function toLocalInput(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fillForm() {
    const s = state.settings, f = el.form.elements;
    f.eventTitle.value = s.eventTitle || ''; f.eventSubtitle.value = s.eventSubtitle || '';
    f.shotsPerGuest.value = s.shotsPerGuest; f.maxVideoSeconds.value = s.maxVideoSeconds;
    f.albumMode.value = s.albumMode; f.revealAt.value = toLocalInput(s.revealAt);
    f.allowVideo.checked = !!s.allowVideo; f.allowLibrary.checked = !!s.allowLibrary;
    f.guestsSeeOwn.checked = !!s.guestsSeeOwn; f.dateStamp.checked = !!s.dateStamp;
  }
  async function saveSettings(patch, okMsg) {
    try {
      const r = await admin('adminSaveSettings', { settings: patch });
      state.settings = r.settings; state.revealed = r.revealed;
      paintStatus(); fillForm();
      WC.toast(okMsg || 'Pengaturan tersimpan.');
    } catch (e) { WC.toast('Gagal menyimpan: ' + e.message, 4000); }
  }
  el.form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const f = el.form.elements;
    const patch = {
      eventTitle: f.eventTitle.value, eventSubtitle: f.eventSubtitle.value,
      shotsPerGuest: Number(f.shotsPerGuest.value), maxVideoSeconds: Number(f.maxVideoSeconds.value),
      albumMode: f.albumMode.value,
      allowVideo: f.allowVideo.checked, allowLibrary: f.allowLibrary.checked,
      guestsSeeOwn: f.guestsSeeOwn.checked, dateStamp: f.dateStamp.checked
    };
    if (f.revealAt.value) patch.revealAt = new Date(f.revealAt.value).toISOString();
    el.save.disabled = true;
    await saveSettings(patch);
    el.save.disabled = false;
  });
  el.toggleCam.addEventListener('click', function () {
    const open = !state.settings.cameraOpen;
    saveSettings({ cameraOpen: open }, open ? 'Kamera dibuka untuk tamu.' : 'Kamera ditutup.');
  });
  el.toggleAlbum.addEventListener('click', function () {
    if (state.revealed) {
      if (!confirm('Kunci album lagi? Tamu tidak bisa melihat foto orang lain sampai waktu reveal.')) return;
      const later = state.settings.revealAt && new Date(state.settings.revealAt).getTime() > Date.now()
        ? state.settings.revealAt : new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      saveSettings({ albumMode: 'reveal', revealAt: later }, 'Album dikunci lagi.');
    } else {
      if (!confirm('Buka album sekarang untuk semua tamu?')) return;
      saveSettings({ albumMode: 'reveal', revealAt: new Date().toISOString() }, 'Album dibuka untuk semua tamu.');
    }
  });
  el.reload.addEventListener('click', load);

  /* ---------- QR ---------- */
  function drawQr() {
    el.qrUrl.textContent = guestUrl;
    if (typeof qrcode !== 'function') { el.qr.textContent = 'QR tidak termuat (cek koneksi). Link tetap bisa dibagikan.'; return; }
    const q = qrcode(0, 'M'); q.addData(guestUrl); q.make();
    el.qr.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    const svg = el.qr.querySelector('svg');
    if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR menuju kamera tamu'); }
  }
  el.print.addEventListener('click', function () { window.print(); });
  el.copy.addEventListener('click', function () {
    const done = function () { WC.toast('Link disalin.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(guestUrl).then(done, function () { prompt('Salin link ini:', guestUrl); });
    else prompt('Salin link ini:', guestUrl);
  });

  /* ---------- daftar tamu ---------- */
  function renderGuests() {
    const map = {};
    state.items.forEach(function (it) {
      const k = it.deviceId || it.guest;
      map[k] = map[k] || { name: it.guest, n: 0 };
      map[k].n++; map[k].name = it.guest || map[k].name;
    });
    const list = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.n - a.n; });
    el.guests.innerHTML = list.length ? list.map(function (g) { return '<li><span>' + WC.esc(g.name) + '</span><b>' + g.n + '</b></li>'; }).join('') : '<li><span>Belum ada kiriman.</span></li>';
  }

  /* ---------- semua kiriman ---------- */
  function renderGrid() {
    const f = state.filter;
    const view = state.items.filter(function (it) {
      if (f === 'photo') return it.type !== 'video';
      if (f === 'video') return it.type === 'video';
      if (f === 'hidden') return it.hidden;
      return true;
    });
    el.grid.innerHTML = '';
    view.forEach(function (it) {
      const wrap = document.createElement('div');
      wrap.className = 'admin-tile';
      const a = document.createElement('a');
      a.className = 'tile' + (it.hidden ? ' is-hidden' : '');
      a.href = it.type === 'video' ? WC.previewUrl(it.fileId) : WC.thumb(it.fileId, 2000);
      a.target = '_blank'; a.rel = 'noopener';
      const img = document.createElement('img'); img.alt = (it.type === 'video' ? 'Video' : 'Foto') + ' dari ' + it.guest; img.loading = 'lazy';
      WC.loadThumb(img, it.fileId, 400);
      a.appendChild(img);
      a.insertAdjacentHTML('beforeend', (it.hidden ? '<span class="flag">Tersembunyi</span>' : '') +
        '<span class="who">' + WC.esc(it.guest) + ' · ' + WC.esc(WC.fmtTime(it.createdAt)) + ' · ' + WC.fmtBytes(it.size) + (it.type === 'video' ? ' · video' : '') + '</span>');
      wrap.appendChild(a);
      const tools = document.createElement('div'); tools.className = 'tools';
      const hideBtn = document.createElement('button'); hideBtn.type = 'button'; hideBtn.className = 'btn small ghost';
      hideBtn.textContent = it.hidden ? 'Tampilkan' : 'Sembunyikan';
      hideBtn.addEventListener('click', async function () {
        hideBtn.disabled = true;
        try { await admin('adminSetHidden', { id: it.id, hidden: !it.hidden }); it.hidden = !it.hidden; renderGrid(); }
        catch (e) { WC.toast(e.message, 4000); hideBtn.disabled = false; }
      });
      const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'btn small danger'; delBtn.textContent = 'Hapus';
      delBtn.addEventListener('click', async function () {
        if (!confirm('Hapus kiriman dari ' + it.guest + '? File dipindah ke Sampah Google Drive.')) return;
        delBtn.disabled = true;
        try { await admin('adminDelete', { id: it.id }); WC.toast('Kiriman dihapus.'); load(); }
        catch (e) { WC.toast(e.message, 4000); delBtn.disabled = false; }
      });
      tools.appendChild(hideBtn); tools.appendChild(delBtn);
      wrap.appendChild(tools);
      el.grid.appendChild(wrap);
    });
    el.empty.hidden = view.length > 0;
  }
  WC.$$('button', el.tabs).forEach(function (b) {
    b.addEventListener('click', function () {
      state.filter = b.dataset.f;
      WC.$$('button', el.tabs).forEach(function (x) { x.classList.toggle('active', x === b); });
      renderGrid();
    });
  });

  /* ---------- mulai ---------- */
  if (WC.pin()) admin('adminLogin').then(enter, function () { WC.pin(null); });
})();
