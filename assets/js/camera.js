/* ============================================================
   camera.js — halaman tamu: sambutan + kamera disposable
   ============================================================ */
(function () {
  'use strict';
  const C = window.WC_CONFIG || {};
  const $ = WC.$;
  const el = {
    welcome: $('#welcome'), cam: $('#cam'), form: $('#w-form'), name: $('#w-name'), start: $('#w-start'),
    wErr: $('#w-error'), wClosed: $('#w-closed'), wShots: $('#w-shots'), wReveal: $('#w-reveal'), wTitle: $('#w-title'), wSub: $('#w-sub'), wInvite: $('#w-invite'),
    video: $('#c-video'), counter: $('#c-counter'), brand: $('#c-brand'), stamp: $('#c-stamp'),
    rec: $('#c-rec'), recTime: $('#c-rec-time'), last: $('#c-last'), flash: $('#c-flash'), shut: $('#c-shut'),
    msg: $('#c-msg'), msgText: $('#c-msg-text'), native: $('#c-native'), retry: $('#c-retry'),
    status: $('#c-status'), modes: $('#c-modes'), modeVideo: $('#c-mode-video'),
    flashBtn: $('#c-flash-btn'), libBtn: $('#c-lib-btn'), shutter: $('#c-shutter'), ring: $('#c-ring'), sw: $('#c-switch'),
    nativeInput: $('#c-native-input'), libInput: $('#c-lib-input'), screenFlash: $('#screen-flash')
  };

  const state = {
    settings: { shotsPerGuest: 27, allowVideo: true, maxVideoSeconds: 15, allowLibrary: true, cameraOpen: true, dateStamp: true, guestsSeeOwn: true },
    used: 0, pending: 0, stream: null, facing: 'environment', mode: 'photo', flashOn: false,
    busy: false, recorder: null, recTimer: null, recStart: 0, uploading: false, libActive: 0, lastUrl: null
  };

  /* ---------- sambutan ---------- */
  function applySettings(s) {
    state.settings = Object.assign(state.settings, s || {});
    const st = state.settings;
    const title = st.eventTitle || C.TITLE || 'Ali & Alo';
    el.wTitle.textContent = title; el.brand.textContent = title;
    el.wSub.textContent = st.eventSubtitle || C.SUBTITLE || '';
    el.wShots.textContent = st.shotsPerGuest;
    if (st.albumMode === 'live') el.wReveal.textContent = 'Hasil jepretanmu langsung masuk ke album bersama.';
    else {
      const t = new Date(st.revealAt);
      el.wReveal.textContent = isNaN(t.getTime()) ? 'Semua foto akan "dicuci" dan dibuka bersama di album.'
        : 'Semua foto "dicuci" dulu dan dibuka bersama pada ' + t.toLocaleString('id-ID', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + '.';
    }
    el.wClosed.hidden = !!st.cameraOpen;
    el.start.disabled = !st.cameraOpen;
    el.modeVideo.hidden = !st.allowVideo || typeof MediaRecorder === 'undefined';
    el.libBtn.hidden = !st.allowLibrary;
    el.stamp.textContent = st.dateStamp ? WCFilm.dateText() : '';
    updateCounter();
  }

  async function loadConfig() {
    try {
      const r = await WC.api('config');
      state.used = r.used || 0;
      applySettings(r.settings);
      el.wErr.hidden = true;
    } catch (e) {
      el.wErr.hidden = false;
      el.wErr.textContent = e.code === 'CONFIG' ? 'Aplikasi belum tersambung ke server: ' + e.message
        : 'Belum bisa menghubungi server (' + e.message + '). Kamu tetap bisa memotret; foto akan dikirim saat tersambung.';
    }
  }

  el.form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    const name = el.name.value.trim();
    if (!name) { el.name.focus(); return; }
    WC.guestName(name);
    el.welcome.hidden = true; el.cam.hidden = false;
    unlockAudio();
    startCamera();
    refreshPending().then(processQueue);
  });

  /* ---------- kamera ---------- */
  function stopStream() {
    if (state.stream) { state.stream.getTracks().forEach(function (t) { t.stop(); }); state.stream = null; }
  }
  async function startCamera() {
    stopStream();
    el.msg.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return cameraFailed('Browser ini tidak mendukung kamera langsung.');
    try {
      const wantAudio = state.mode === 'video';
      const cons = { audio: wantAudio, video: { facingMode: { ideal: state.facing }, width: { ideal: 1920 }, height: { ideal: 1440 } } };
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia(cons); }
      catch (e) {
        if (!wantAudio) throw e;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: cons.video });   // mikrofon ditolak: rekam tanpa suara
        WC.toast('Mikrofon tidak diizinkan, video direkam tanpa suara.');
      }
      state.stream = stream;
      el.video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      const fm = track && track.getSettings ? track.getSettings().facingMode : null;
      const mirror = fm ? fm === 'user' : state.facing === 'user';
      el.video.classList.toggle('mirror', mirror);
      state.mirror = mirror;
      try { await el.video.play(); } catch (e) { /* autoplay akan jalan sendiri */ }
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      cameraFailed(denied ? 'Akses kamera belum diizinkan. Izinkan kamera untuk situs ini di pengaturan browser, atau pakai kamera bawaan HP.'
        : 'Kamera tidak bisa dibuka di browser ini. Coba buka link ini di Chrome/Safari, atau pakai kamera bawaan HP.');
    }
  }
  function cameraFailed(text) { el.msgText.textContent = text; el.msg.hidden = false; }
  el.retry.addEventListener('click', startCamera);
  el.sw.addEventListener('click', function () {
    if (state.recorder) return;
    state.facing = state.facing === 'environment' ? 'user' : 'environment';
    startCamera();
  });
  el.flashBtn.addEventListener('click', function () {
    state.flashOn = !state.flashOn;
    el.flashBtn.classList.toggle('on', state.flashOn);
    el.flashBtn.setAttribute('aria-pressed', String(state.flashOn));
  });
  WC.$$('button', el.modes).forEach(function (b) {
    b.addEventListener('click', function () {
      if (state.recorder || state.mode === b.dataset.mode) return;
      state.mode = b.dataset.mode;
      WC.$$('button', el.modes).forEach(function (x) { x.classList.toggle('active', x === b); });
      el.shutter.classList.toggle('video', state.mode === 'video');
      el.shutter.setAttribute('aria-label', state.mode === 'video' ? 'Rekam video' : 'Jepret');
      startCamera();
    });
  });

  /* ---------- hitungan sisa film ---------- */
  function remaining() { return Math.max(0, Number(state.settings.shotsPerGuest) - state.used - state.pending); }
  function updateCounter() {
    const r = remaining();
    el.counter.innerHTML = String(r).padStart(2, '0') + '<small>SISA</small>';
    if (!state.recorder) el.shutter.disabled = r <= 0;
  }
  async function refreshPending() {
    const all = await WC.queue.all();
    state.pending = all.filter(function (i) { return i.meta && i.meta.source === 'camera'; }).length;
    updateCounter(); updateStatus();
  }
  function updateStatus(progress) {
    const parts = [];
    if (state.pending > 0) parts.push(state.pending + ' jepretan menunggu terkirim');
    if (state.libActive > 0) parts.push('mengirim ' + state.libActive + ' file dari galeri');
    if (!parts.length && remaining() <= 0) parts.push('Rol film habis. Terima kasih sudah mengabadikan momen kami!');
    let html = WC.esc(parts.join(' · '));
    if (typeof progress === 'number') html += '<span class="bar"><i style="width:' + Math.round(progress * 100) + '%"></i></span>';
    el.status.innerHTML = html;
  }

  /* ---------- suara rana (dibuat langsung, tanpa file audio) ---------- */
  let actx = null;
  function unlockAudio() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; }
  }
  function clickSound() {
    if (!actx) return;
    try {
      const len = Math.floor(actx.sampleRate * 0.09), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) * (i < len * 0.12 || i > len * 0.5 ? 1 : 0.25);
      const src = actx.createBufferSource(), g = actx.createGain();
      g.gain.value = 0.5; src.buffer = buf; src.connect(g); g.connect(actx.destination); src.start();
    } catch (e) { /* abaikan */ }
  }

  /* ---------- flash ---------- */
  async function torch(on) {
    const track = state.stream && state.stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return false;
    try {
      if (!track.getCapabilities().torch) return false;
      await track.applyConstraints({ advanced: [{ torch: on }] });
      return true;
    } catch (e) { return false; }
  }
  async function fireFlashBefore() {
    if (!state.flashOn) return function () {};
    if (!state.mirror && await torch(true)) { await WC.sleep(260); return function () { torch(false); }; }
    el.screenFlash.classList.add('on');            // kamera depan / tanpa lampu: layar jadi lampu
    await WC.sleep(220);
    return function () { el.screenFlash.classList.remove('on'); };
  }
  function animate(node) { node.classList.remove('fire'); void node.offsetWidth; node.classList.add('fire'); }

  /* ---------- jepret foto ---------- */
  async function shootPhoto() {
    if (state.busy) return;
    if (remaining() <= 0) { WC.toast('Rol film kamu sudah habis.'); return; }
    const v = el.video;
    if (!state.stream || !v.videoWidth) { WC.toast('Kamera belum siap.'); return; }
    state.busy = true;
    try {
      const flashOff = await fireFlashBefore();
      const canvas = WCFilm.frameToCanvas(v, v.videoWidth, v.videoHeight, { mirror: state.mirror });
      flashOff();
      clickSound(); animate(el.shut); if (state.flashOn) animate(el.flash);
      WCFilm.apply(canvas, { stamp: state.settings.dateStamp });
      const blob = await WCFilm.toBlob(canvas, 0.9);
      await enqueue(blob, 'photo');
    } catch (e) { WC.toast('Gagal mengambil foto: ' + e.message); }
    state.busy = false;
  }

  async function enqueue(blob, type) {
    await WC.queue.add(blob, { source: 'camera', type: type, guest: WC.guestName() });
    state.pending++;
    updateCounter(); updateStatus();
    if (type === 'photo' && state.settings.guestsSeeOwn) showLast(blob);
    processQueue();
  }
  function showLast(blob) {
    if (state.lastUrl) URL.revokeObjectURL(state.lastUrl);
    state.lastUrl = URL.createObjectURL(blob);
    el.last.src = state.lastUrl; el.last.classList.add('show');
    clearTimeout(showLast.t);
    showLast.t = setTimeout(function () { el.last.classList.remove('show'); }, 2600);
  }

  /* ---------- rekam video ---------- */
  function pickVideoMime() {
    const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (let i = 0; i < list.length; i++) { try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) { /* lanjut */ } }
    return '';
  }
  function startRecording() {
    if (remaining() <= 0) { WC.toast('Rol film kamu sudah habis.'); return; }
    if (!state.stream) { WC.toast('Kamera belum siap.'); return; }
    const mime = pickVideoMime();
    let rec;
    try { rec = new MediaRecorder(state.stream, mime ? { mimeType: mime, videoBitsPerSecond: 4000000 } : undefined); }
    catch (e) { WC.toast('HP ini belum bisa merekam video dari browser.'); return; }
    const chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      clearInterval(state.recTimer); state.recorder = null;
      el.rec.hidden = true; el.shutter.classList.remove('recording'); el.ring.style.strokeDashoffset = 245;
      const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type: type });
      if (blob.size > 0) enqueue(blob, 'video').then(function () { WC.toast('Video tersimpan di rol.'); });
      updateCounter();
    };
    state.recorder = rec; state.recStart = Date.now();
    const max = Number(state.settings.maxVideoSeconds) || 15;
    el.rec.hidden = false; el.shutter.classList.add('recording');
    state.recTimer = setInterval(function () {
      const sec = (Date.now() - state.recStart) / 1000;
      el.recTime.textContent = '0:' + String(Math.floor(sec)).padStart(2, '0') + ' / 0:' + String(max).padStart(2, '0');
      el.ring.style.strokeDashoffset = 245 * (1 - Math.min(1, sec / max));
      if (sec >= max) stopRecording();
    }, 100);
    rec.start(1000);
  }
  function stopRecording() { if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop(); }

  el.shutter.addEventListener('click', function () {
    unlockAudio();
    if (state.mode === 'video') { if (state.recorder) stopRecording(); else startRecording(); }
    else shootPhoto();
  });

  /* ---------- cadangan: kamera bawaan HP ---------- */
  el.native.addEventListener('click', function () { el.nativeInput.click(); });
  el.nativeInput.addEventListener('change', async function () {
    const f = el.nativeInput.files && el.nativeInput.files[0];
    el.nativeInput.value = '';
    if (!f) return;
    if (remaining() <= 0) { WC.toast('Rol film kamu sudah habis.'); return; }
    try {
      const img = await loadImage(f);
      const canvas = WCFilm.frameToCanvas(img, img.naturalWidth || img.width, img.naturalHeight || img.height, {});
      WCFilm.apply(canvas, { stamp: state.settings.dateStamp });
      const blob = await WCFilm.toBlob(canvas, 0.9);
      clickSound();
      await enqueue(blob, 'photo');
      WC.toast('Foto tersimpan di rol.');
    } catch (e) { WC.toast('Foto tidak bisa diproses: ' + e.message); }
  });
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('format tidak didukung')); };
      img.src = url;
    });
  }

  /* ---------- upload dari galeri HP (file asli, ukuran bebas) ---------- */
  el.libBtn.addEventListener('click', function () { el.libInput.click(); });
  el.libInput.addEventListener('change', async function () {
    const files = Array.prototype.slice.call(el.libInput.files || []);
    el.libInput.value = '';
    if (!files.length) return;
    state.libActive += files.length; updateStatus();
    let okCount = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const type = (f.type || '').indexOf('video/') === 0 ? 'video' : 'photo';
        await WC.upload(f, { source: 'library', type: type }, function (p) { updateStatus(p); });
        okCount++;
      } catch (e) { WC.toast('Gagal mengirim ' + f.name + ': ' + e.message, 4000); }
      state.libActive--; updateStatus();
    }
    if (okCount) WC.toast(okCount + ' file dari galeri terkirim. Terima kasih!');
  });

  /* ---------- kirim antrean jepretan ---------- */
  async function processQueue() {
    if (state.uploading) return;
    state.uploading = true;
    try {
      let items = await WC.queue.all();
      while (items.length) {
        const item = items[0];
        try {
          const r = await WC.upload(item.blob, item.meta, function (p) { updateStatus(p); });
          await WC.queue.remove(item.id);
          if (typeof r.used === 'number') state.used = r.used;
        } catch (e) {
          if (e.code === 'LIMIT' || e.code === 'CLOSED' || e.code === 'NOT_ALLOWED' || e.code === 'BAD_REQUEST') {
            await WC.queue.remove(item.id);        // ditolak server: buang supaya tidak mengulang selamanya
            WC.toast(e.message, 4000);
            if (e.code === 'LIMIT') state.used = Number(state.settings.shotsPerGuest);
          } else {
            await refreshPending();
            setTimeout(processQueue, 15000);       // sinyal jelek: coba lagi nanti
            return;
          }
        }
        await refreshPending();
        items = await WC.queue.all();
      }
    } finally { state.uploading = false; }
  }
  window.addEventListener('online', processQueue);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (state.recorder) stopRecording(); }
    else if (!el.cam.hidden) { if (!state.stream || !state.stream.active) startCamera(); processQueue(); }
  });
  window.addEventListener('beforeunload', function (e) {
    if (state.libActive > 0) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- mulai ---------- */
  el.name.value = WC.guestName();
  if (C.INVITATION_URL) { el.wInvite.hidden = false; el.wInvite.href = C.INVITATION_URL; }
  applySettings({});
  loadConfig();
  refreshPending().then(processQueue);   // lanjutkan kiriman yang tertunda dari kunjungan sebelumnya
})();
