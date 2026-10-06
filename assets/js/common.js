/* ============================================================
   common.js — fungsi bersama: panggil backend, upload ke Drive,
   antrean upload (tahan sinyal jelek), dan pembantu kecil.
   ============================================================ */
(function () {
  'use strict';
  const C = window.WC_CONFIG || {};
  const WC = (window.WC = {});

  /* ---------- identitas HP tamu (tanpa login) ---------- */
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    } catch (e) { /* mode privat: abaikan */ }
    return val;
  }
  WC.store = store;
  let dev = store('wc_device');
  if (!dev) {
    dev = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    store('wc_device', dev);
  }
  WC.deviceId = dev;
  WC.guestName = function (v) { return v === undefined ? (store('wc_name') || '') : store('wc_name', v); };
  WC.pin = function (v) {
    try {
      if (v === undefined) return sessionStorage.getItem('wc_pin') || '';
      if (v === null) sessionStorage.removeItem('wc_pin'); else sessionStorage.setItem('wc_pin', v);
    } catch (e) { /* abaikan */ }
    return v || '';
  };

  /* ---------- panggil backend Apps Script ---------- */
  WC.api = async function (action, data) {
    if (!C.API_URL || C.API_URL.indexOf('TEMPEL') === 0) {
      throw Object.assign(new Error('API_URL belum diisi di assets/js/config.js'), { code: 'CONFIG' });
    }
    const body = Object.assign({ action: action, deviceId: WC.deviceId }, data || {});
    let res;
    try {
      // Sengaja tanpa header Content-Type: supaya jadi "simple request" dan lolos CORS Apps Script
      res = await fetch(C.API_URL, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' });
    } catch (e) {
      throw Object.assign(new Error('Tidak ada koneksi internet.'), { code: 'NETWORK' });
    }
    let j;
    try { j = await res.json(); } catch (e) {
      throw Object.assign(new Error('Jawaban server tidak terbaca. Cek URL Web App & izin akses "Anyone".'), { code: 'NETWORK' });
    }
    if (!j.ok) throw Object.assign(new Error(j.error || 'Terjadi kesalahan.'), { code: j.code || 'ERROR' });
    return j;
  };

  /* ---------- alamat gambar dari Google Drive ---------- */
  WC.thumb = function (fileId, width) { return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w' + (width || 600); };
  WC.downloadUrl = function (fileId) { return 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(fileId); };
  WC.previewUrl = function (fileId) { return 'https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/preview'; };

  // Thumbnail Drive butuh beberapa detik setelah upload: coba ulang otomatis
  WC.loadThumb = function (img, fileId, width) {
    let tries = 0;
    img.classList.add('thumb-loading');            // sembunyikan ikon "gambar rusak" selama menunggu
    img.onload = function () { img.classList.remove('thumb-loading'); };
    img.onerror = function () {
      if (tries++ >= 6) { img.onerror = null; img.classList.add('thumb-failed'); return; }
      setTimeout(function () { img.src = WC.thumb(fileId, width) + '&r=' + tries; }, 2500 * tries);
    };
    img.src = WC.thumb(fileId, width);
  };

  /* ---------- pembantu kecil ---------- */
  WC.esc = function (s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };
  WC.$ = function (sel, root) { return (root || document).querySelector(sel); };
  WC.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  WC.fmtBytes = function (n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(n < 10 ? 1 : 0) + ' ' + u[i];
  };
  WC.fmtTime = function (iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  let toastTimer = null;
  WC.toast = function (msg, ms) {
    let t = document.getElementById('wc-toast');
    if (!t) { t = document.createElement('div'); t.id = 'wc-toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2800);
  };
  WC.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ============================================================
     UPLOAD LANGSUNG KE GOOGLE DRIVE (resumable, per potongan)
     File kecil dikirim sekaligus; file besar dipotong 8 MB,
     jadi video berukuran GB pun bisa terkirim.
     ============================================================ */
  const CHUNK = 8 * 1024 * 1024;   // harus kelipatan 256 KB

  function xhrPut(url, body, range, onProgress) {
    return new Promise(function (resolve, reject) {
      const x = new XMLHttpRequest();
      x.open('PUT', url, true);
      if (range) x.setRequestHeader('Content-Range', range);
      x.upload.onprogress = function (e) { if (onProgress && e.lengthComputable) onProgress(e.loaded); };
      x.onload = function () {
        let rangeHeader = null;
        try { rangeHeader = x.getResponseHeader('Range'); } catch (e) { rangeHeader = null; }
        resolve({ status: x.status, text: x.responseText, range: rangeHeader });
      };
      x.onerror = function () { reject(new Error('network')); };
      x.ontimeout = function () { reject(new Error('timeout')); };
      x.send(body);
    });
  }
  function parseId(text) { try { return JSON.parse(text).id || null; } catch (e) { return null; } }

  WC.putResumable = async function (uploadUrl, blob, onProgress) {
    const total = blob.size;
    let offset = 0, fails = 0;
    while (offset < total) {
      const end = Math.min(offset + CHUNK, total);
      const single = offset === 0 && end === total;
      try {
        const r = await xhrPut(uploadUrl, blob.slice(offset, end), single ? null : 'bytes ' + offset + '-' + (end - 1) + '/' + total,
          function (loaded) { if (onProgress) onProgress(Math.min(1, (offset + loaded) / total)); });
        if (r.status === 200 || r.status === 201) {
          const id = parseId(r.text);
          if (!id) throw new Error('Drive tidak mengembalikan ID file.');
          if (onProgress) onProgress(1);
          return id;
        }
        if (r.status === 308) { offset = end; fails = 0; continue; }
        if (r.status === 404 || r.status === 410) throw Object.assign(new Error('Sesi upload kedaluwarsa.'), { code: 'SESSION' });
        throw new Error('HTTP ' + r.status);
      } catch (e) {
        if (e.code === 'SESSION') throw e;
        if (++fails > 5) throw Object.assign(new Error('Upload gagal, sinyal terputus.'), { code: 'NETWORK' });
        await WC.sleep(1500 * fails);
        // Tanya Drive: sudah terima sampai byte berapa?
        try {
          const q = await xhrPut(uploadUrl, null, 'bytes */' + total);
          if (q.status === 200 || q.status === 201) { const id = parseId(q.text); if (id) return id; }
          if (q.status === 308 && q.range) {
            const m = /bytes=0-(\d+)/.exec(q.range);
            if (m) offset = Number(m[1]) + 1;
          }
          if (q.status === 404 || q.status === 410) throw Object.assign(new Error('Sesi upload kedaluwarsa.'), { code: 'SESSION' });
        } catch (e2) { if (e2.code === 'SESSION') throw e2; /* masih offline: ulangi potongan yang sama */ }
      }
    }
    throw new Error('Upload tidak selesai.');
  };

  // Alur lengkap: minta tiket -> kirim ke Drive -> catat
  WC.upload = async function (blob, meta, onProgress) {
    const base = Object.assign({ guest: WC.guestName(), pin: WC.pin() || undefined }, meta);
    const init = await WC.api('initUpload', Object.assign({}, base, { mime: blob.type || 'application/octet-stream', size: blob.size, origin: location.origin }));
    const fileId = await WC.putResumable(init.uploadUrl, blob, onProgress);
    return WC.api('completeUpload', Object.assign({}, base, { fileId: fileId }));
  };

  /* ============================================================
     ANTREAN JEPRETAN (IndexedDB)
     Jepretan disimpan dulu di HP, lalu dikirim di latar belakang.
     Kalau sinyal hilang atau halaman tertutup, kiriman dilanjutkan
     saat halaman dibuka lagi.
     ============================================================ */
  const Q = (WC.queue = { mem: [], db: null, useMem: false });
  function openDb() {
    return new Promise(function (resolve) {
      if (Q.db || Q.useMem) return resolve();
      try {
        const req = indexedDB.open('wc-queue', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('shots', { keyPath: 'id' }); };
        req.onsuccess = function () { Q.db = req.result; resolve(); };
        req.onerror = function () { Q.useMem = true; resolve(); };
        req.onblocked = function () { Q.useMem = true; resolve(); };
      } catch (e) { Q.useMem = true; resolve(); }
    });
  }
  function tx(mode, fn) {
    return new Promise(function (resolve, reject) {
      const t = Q.db.transaction('shots', mode);
      const out = fn(t.objectStore('shots'));
      t.oncomplete = function () { resolve(out && out.result); };
      t.onerror = function () { reject(t.error); };
      t.onabort = function () { reject(t.error); };
    });
  }
  Q.add = async function (blob, meta) {
    const item = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), blob: blob, meta: meta, createdAt: Date.now() };
    await openDb();
    if (Q.useMem) Q.mem.push(item);
    else { try { await tx('readwrite', function (s) { return s.put(item); }); } catch (e) { Q.useMem = true; Q.mem.push(item); } }
    return item;
  };
  Q.all = async function () {
    await openDb();
    let list = Q.mem.slice();
    if (Q.db) { try { list = list.concat((await tx('readonly', function (s) { return s.getAll(); })) || []); } catch (e) { /* abaikan */ } }
    return list.sort(function (a, b) { return a.createdAt - b.createdAt; });
  };
  Q.remove = async function (id) {
    Q.mem = Q.mem.filter(function (i) { return i.id !== id; });
    if (Q.db) { try { await tx('readwrite', function (s) { return s.delete(id); }); } catch (e) { /* abaikan */ } }
  };
})();
