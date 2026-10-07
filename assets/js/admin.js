/* ============================================================
   admin.js — dashboard: daftar event (PIN utama) dan
   dashboard per event (PIN utama atau PIN klien event itu).
   ============================================================ */
(function () {
  'use strict';
  const $ = WC.$;
  const el = {
    login: $('#a-login'), loginForm: $('#a-login-form'), pin: $('#a-pin'), loginBtn: $('#a-login-btn'), loginErr: $('#a-login-err'), loginLabel: $('#a-login-label'),
    events: $('#a-events'), eForm: $('#e-form'), eCreate: $('#e-create'), eGrid: $('#e-grid'), eEmpty: $('#e-empty'), eSheet: $('#e-sheet'), eFolder: $('#e-folder'),
    dash: $('#a-dash'), back: $('#a-back'), title: $('#a-title'), pillCam: $('#a-pill-cam'), pillAlbum: $('#a-pill-album'),
    toggleCam: $('#a-toggle-cam'), toggleAlbum: $('#a-toggle-album'), reload: $('#a-reload'), drive: $('#a-drive'), sheet: $('#a-sheet'), ss: $('#a-ss'), album: $('#a-album'),
    qr: $('#a-qr'), qrUrl: $('#a-qr-url'), qrTitle: $('#qr-title'), print: $('#a-print'), copy: $('#a-copy'),
    coverImg: $('#a-cover-img'), coverMono: $('#a-cover-mono'), coverBtn: $('#a-cover-btn'), coverDel: $('#a-cover-del'), coverInput: $('#a-cover-input'),
    form: $('#a-settings'), save: $('#a-save'), fName: $('#f-name'), fPin: $('#f-pin'), clientHint: $('#a-client-hint'), danger: $('#a-danger'), delEvent: $('#a-delete-event'),
    guests: $('#a-guests'), tabs: $('#a-tabs'), grid: $('#a-grid'), empty: $('#a-empty'), more: $('#a-more')
  };
  const state = { role: '', settings: {}, items: [], guests: [], revealed: false, filter: 'all', cover: null, floor: 1, more: false };
  const base = new URL('.', location.href).href;            // folder tempat aplikasi berada
  function guestUrl() { return base + '?e=' + encodeURIComponent(WC.event); }
  function adminUrl() { return base + 'admin.html?e=' + encodeURIComponent(WC.event); }

  function admin(action, data) { return WC.api(action, Object.assign({ pin: WC.pin() }, data || {})); }
  function show(which) { el.login.hidden = which !== 'login'; el.events.hidden = which !== 'events'; el.dash.hidden = which !== 'dash'; window.scrollTo(0, 0); }
  function setEvent(slug) {
    WC.event = slug || '';
    history.replaceState(null, '', WC.event ? 'admin.html?e=' + encodeURIComponent(WC.event) : 'admin.html');
  }

  /* ---------- login ---------- */
  if (WC.event) el.loginLabel.textContent = 'Dashboard Event';
  async function tryLogin() {
    const r = await admin('adminLogin');
    state.role = r.role;
    if (state.role === 'master' && !WC.event) return showEvents();
    return openEvent(WC.event);
  }
  el.loginForm.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    el.loginBtn.disabled = true; el.loginErr.hidden = true;
    try { WC.pin(el.pin.value); await tryLogin(); }
    catch (e) { WC.pin(null); show('login'); el.loginErr.hidden = false; el.loginErr.textContent = e.message; }
    el.loginBtn.disabled = false;
  });
  WC.$$('[data-logout]').forEach(function (b) { b.addEventListener('click', function () { WC.pin(null); location.href = WC.event && state.role === 'event' ? adminUrl() : 'admin.html'; }); });

  /* ============================================================
     DAFTAR EVENT
     ============================================================ */
  async function showEvents() {
    setEvent('');
    show('events');
    el.eGrid.innerHTML = ''; el.eEmpty.hidden = true;
    try {
      const r = await admin('adminEvents');
      el.eSheet.href = r.sheetUrl; el.eFolder.href = r.folderUrl;
      r.events.forEach(function (ev) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'event-card card';
        b.innerHTML = '<h3>' + WC.esc(ev.name) + '</h3>' +
          '<p class="meta">' + (WC.esc(WC.fmtDateLine(ev.eventDate)) || 'Tanggal belum diisi') + ' · kode: ' + WC.esc(ev.slug) + '</p>' +
          '<p class="big">' + ev.total + '<small>kiriman</small></p>' +
          '<p class="row" style="margin-top:.8rem"><span class="pill' + (ev.cameraOpen ? '' : ' off') + '">' + ({ open: 'Kamera dibuka', early: 'Kamera terjadwal', ended: 'Kamera selesai', closed: 'Kamera ditutup' }[ev.phase] || (ev.cameraOpen ? 'Kamera dibuka' : 'Kamera ditutup')) + '</span>' +
          '<span class="pill' + (ev.revealed ? '' : ' off') + '">' + (ev.revealed ? 'Album dibuka' : 'Album dikunci') + '</span></p>';
        b.addEventListener('click', function () { openEvent(ev.slug); });
        el.eGrid.appendChild(b);
      });
      el.eEmpty.hidden = r.events.length > 0;
    } catch (e) {
      if (e.code === 'AUTH') { WC.pin(null); show('login'); return; }
      WC.toast('Gagal memuat daftar event: ' + e.message, 4000);
    }
  }
  el.eForm.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const f = el.eForm.elements;
    el.eCreate.disabled = true; el.eCreate.textContent = 'Membuat…';
    try {
      const r = await admin('adminCreateEvent', { name: f.name.value, eventDate: f.eventDate.value });
      el.eForm.reset();
      WC.toast('Event "' + r.event.name + '" dibuat. Tab dan folder baru sudah siap.', 3500);
      await openEvent(r.event.slug);
    } catch (e) { WC.toast('Gagal membuat event: ' + e.message, 4500); }
    el.eCreate.disabled = false; el.eCreate.textContent = 'Buat Event';
  });
  el.back.addEventListener('click', showEvents);

  /* ============================================================
     DASHBOARD SATU EVENT
     ============================================================ */
  async function openEvent(slug) {
    setEvent(slug);
    state.items = []; state.cover = null; el.grid.innerHTML = '';
    const master = state.role === 'master';
    el.back.hidden = !master; el.danger.hidden = !master; el.fName.hidden = !master; el.fPin.hidden = !master;
    show('dash');
    drawQr();
    el.ss.href = WC.link('gallery.html', { slideshow: 1, key: WC.pin() });   // PIN dititipkan, langsung dihapus dari alamat oleh album
    el.album.href = WC.link('gallery.html', { key: WC.pin() });
    await load();
  }

  async function load() {
    try {
      // halaman pertama kiriman (terbaru) + statistik lengkap, diminta bersamaan
      const got = await Promise.all([admin('list', { mode: 'tail', limit: 60 }), admin('adminStats')]);
      const r = got[0], st = got[1];
      if (!r.admin) throw Object.assign(new Error('Sesi habis, silakan masuk lagi.'), { code: 'AUTH' });
      state.settings = r.settings; state.items = r.items || []; state.revealed = r.revealed;
      state.floor = r.floor || 1; state.more = !!r.more; state.guests = st.guests || [];
      const c = st.counts;
      $('#s-photos').textContent = c.photos.toLocaleString('id-ID'); $('#s-videos').textContent = c.videos.toLocaleString('id-ID');
      $('#s-guests').textContent = c.guests.toLocaleString('id-ID'); $('#s-size').textContent = WC.fmtBytes(c.bytes);
      el.drive.href = r.folderUrl; el.sheet.href = r.sheetUrl;
      paintStatus(); fillForm(); renderGuests(); renderGrid();
    } catch (e) {
      if (e.code === 'AUTH') { WC.pin(null); show('login'); return; }
      if (e.code === 'NO_EVENT' && state.role === 'master') { WC.toast(e.message, 4000); return showEvents(); }
      WC.toast('Gagal memuat: ' + e.message, 4000);
    }
  }
  el.more.addEventListener('click', async function () {
    el.more.disabled = true;
    try {
      const r = await admin('list', { mode: 'before', before: state.floor, limit: 60 });
      state.items = state.items.concat(r.items || []); state.floor = r.floor || 1; state.more = !!r.more;
      renderGrid();
    } catch (e) { WC.toast('Gagal memuat: ' + e.message, 4000); }
    el.more.disabled = false;
  });

  function paintStatus() {
    const s = state.settings;
    const title = s.eventTitle || '';
    el.title.textContent = title; el.qrTitle.textContent = title; document.title = 'Dashboard — ' + title;
    const now = Date.now(), tA = s.opensAt ? new Date(s.opensAt).getTime() : NaN, tB = s.closesAt ? new Date(s.closesAt).getTime() : NaN;
    const ph = !s.cameraOpen ? 'closed' : (!isNaN(tA) && now < tA ? 'early' : (!isNaN(tB) && now >= tB ? 'ended' : 'open'));
    el.pillCam.textContent = ph === 'open' ? 'Kamera dibuka' : ph === 'early' ? 'Kamera dibuka otomatis ' + WC.fmtTime(s.opensAt) : ph === 'ended' ? 'Kamera sudah tutup (jadwal)' : 'Kamera ditutup';
    el.pillCam.classList.toggle('off', ph !== 'open');
    el.pillAlbum.textContent = state.revealed ? 'Album dibuka' : 'Album masih dikunci';
    el.pillAlbum.classList.toggle('off', !state.revealed);
    el.toggleCam.textContent = s.cameraOpen ? 'Tutup Kamera' : 'Buka Kamera';
    el.toggleAlbum.textContent = state.revealed ? 'Kunci Album Lagi' : 'Buka Album Sekarang';
    // foto sampul
    el.coverMono.textContent = WC.initials(title);
    if (s.coverFileId !== state.cover) {
      state.cover = s.coverFileId;
      el.coverImg.classList.remove('ready');
      if (s.coverFileId) WC.loadThumb(el.coverImg, s.coverFileId, 300);
      else el.coverImg.removeAttribute('src');
    }
    el.coverDel.hidden = !s.coverFileId;
    // petunjuk untuk klien
    if (state.role === 'master') {
      el.clientHint.hidden = !s.clientPin;
      el.clientHint.innerHTML = s.clientPin ? 'Link dashboard untuk klien: <code class="kbd">' + WC.esc(adminUrl()) + '</code> (masuk dengan PIN klien). Klien hanya bisa mengelola event ini.' : '';
    }
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
    f.name.value = s.eventTitle || ''; f.eventSubtitle.value = s.eventSubtitle || ''; f.eventDate.value = s.eventDate || '';
    f.shotsPerGuest.value = s.shotsPerGuest; f.maxVideoSeconds.value = s.maxVideoSeconds;
    f.albumMode.value = s.albumMode; f.revealAt.value = toLocalInput(s.revealAt);
    f.opensAt.value = toLocalInput(s.opensAt); f.closesAt.value = toLocalInput(s.closesAt);
    f.clientPin.value = s.clientPin || '';
    f.allowVideo.checked = !!s.allowVideo; f.allowLibrary.checked = !!s.allowLibrary;
    f.guestsSeeOwn.checked = !!s.guestsSeeOwn; f.dateStamp.checked = !!s.dateStamp;
  }
  async function saveSettings(patch, okMsg) {
    try {
      const r = await admin('adminSaveSettings', { settings: patch });
      state.settings = r.settings; state.revealed = r.revealed;
      paintStatus(); fillForm();
      WC.toast(okMsg || 'Pengaturan tersimpan.');
    } catch (e) { WC.toast('Gagal menyimpan: ' + e.message, 4500); }
  }
  el.form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const f = el.form.elements;
    const patch = {
      eventSubtitle: f.eventSubtitle.value, eventDate: f.eventDate.value,
      shotsPerGuest: Number(f.shotsPerGuest.value), maxVideoSeconds: Number(f.maxVideoSeconds.value),
      albumMode: f.albumMode.value,
      allowVideo: f.allowVideo.checked, allowLibrary: f.allowLibrary.checked,
      guestsSeeOwn: f.guestsSeeOwn.checked, dateStamp: f.dateStamp.checked
    };
    if (state.role === 'master') { patch.name = f.name.value; patch.clientPin = f.clientPin.value; }
    if (f.revealAt.value) patch.revealAt = new Date(f.revealAt.value).toISOString();
    patch.opensAt = f.opensAt.value ? new Date(f.opensAt.value).toISOString() : '';       // kosong = tanpa jadwal
    patch.closesAt = f.closesAt.value ? new Date(f.closesAt.value).toISOString() : '';
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
      if (!confirm('Kunci album lagi? Tamu tidak bisa melihat foto orang lain sampai waktu album dibuka.')) return;
      const later = state.settings.revealAt && new Date(state.settings.revealAt).getTime() > Date.now()
        ? state.settings.revealAt : new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      saveSettings({ albumMode: 'reveal', revealAt: later }, 'Album dikunci lagi.');
    } else {
      if (!confirm('Buka album sekarang untuk semua tamu?')) return;
      saveSettings({ albumMode: 'reveal', revealAt: new Date().toISOString() }, 'Album dibuka untuk semua tamu.');
    }
  });
  el.reload.addEventListener('click', load);

  el.delEvent.addEventListener('click', async function () {
    const name = state.settings.eventTitle;
    const typed = prompt('Menghapus event akan menghapus tab Sheet dan memindahkan folder Drive ke Sampah.\n\nKetik nama event untuk konfirmasi:\n' + name);
    if (typed === null) return;
    try {
      await admin('adminDeleteEvent', { confirmName: typed });
      WC.toast('Event "' + name + '" dihapus.', 3500);
      showEvents();
    } catch (e) { WC.toast('Gagal menghapus: ' + e.message, 4500); }
  });

  /* ---------- foto sampul ---------- */
  el.coverBtn.addEventListener('click', function () { el.coverInput.click(); });
  el.coverInput.addEventListener('change', async function () {
    const f = el.coverInput.files && el.coverInput.files[0];
    el.coverInput.value = '';
    if (!f) return;
    el.coverBtn.disabled = true; el.coverBtn.textContent = 'Mengunggah…';
    try {
      const blob = await shrink(f, 1200);        // dikecilkan dulu supaya halaman tamu cepat terbuka
      const fileId = await WC.uploadFile(blob, { event: WC.event, source: 'cover', type: 'photo' });
      await admin('adminSetCover', { fileId: fileId });
      state.settings.coverFileId = fileId; paintStatus();
      WC.toast('Foto sampul terpasang.');
    } catch (e) { WC.toast('Gagal memasang foto: ' + e.message, 4500); }
    el.coverBtn.disabled = false; el.coverBtn.textContent = 'Pilih Foto';
  });
  el.coverDel.addEventListener('click', async function () {
    if (!confirm('Hapus foto sampul?')) return;
    try { await admin('adminSetCover', { fileId: '' }); state.settings.coverFileId = ''; paintStatus(); WC.toast('Foto sampul dihapus.'); }
    catch (e) { WC.toast(e.message, 4000); }
  });
  function shrink(file, max) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { if (b) resolve(b); else reject(new Error('gambar tidak bisa diproses')); }, 'image/jpeg', 0.88);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('format gambar tidak didukung (pakai JPG/PNG)')); };
      img.src = url;
    });
  }

  /* ---------- QR ---------- */
  function drawQr() {
    const url = guestUrl();
    el.qrUrl.textContent = url;
    if (typeof qrcode !== 'function') { el.qr.textContent = 'QR tidak termuat (cek koneksi). Link tetap bisa dibagikan.'; return; }
    const q = qrcode(0, 'M'); q.addData(url); q.make();
    el.qr.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    const svg = el.qr.querySelector('svg');
    if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR menuju kamera tamu'); }
  }
  el.print.addEventListener('click', function () { window.print(); });
  el.copy.addEventListener('click', function () {
    const url = guestUrl(), done = function () { WC.toast('Link disalin.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt('Salin link ini:', url); });
    else prompt('Salin link ini:', url);
  });

  /* ---------- daftar tamu ---------- */
  function renderGuests() {
    const list = state.guests;
    el.guests.innerHTML = list.length ? list.map(function (g) {
      return '<li><span>' + WC.esc(g.name) + '</span><b>' + g.n + (g.sec ? ' · video ' + Math.round(g.sec) + ' dtk' : '') + '</b></li>';
    }).join('') : '<li><span>Belum ada kiriman.</span></li>';
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
    el.more.hidden = !state.more;
  }
  WC.$$('button', el.tabs).forEach(function (b) {
    b.addEventListener('click', function () {
      state.filter = b.dataset.f;
      WC.$$('button', el.tabs).forEach(function (x) { x.classList.toggle('active', x === b); });
      renderGrid();
    });
  });

  /* ---------- mulai ---------- */
  if (WC.pin()) tryLogin().catch(function () { WC.pin(null); show('login'); });
})();