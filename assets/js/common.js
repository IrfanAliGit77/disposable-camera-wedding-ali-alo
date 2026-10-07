/* ============================================================
   common.js — fungsi bersama semua halaman:
   event aktif, panggil backend, upload langsung ke Drive,
   antrean kirim paralel (tahan sinyal jelek), salinan kecil
   jepretan di HP supaya langsung tampil di album.
   ============================================================ */
(function () {
  'use strict';
  const C = window.WC_CONFIG || {};
  const WC = (window.WC = {});

  /* ---------- event aktif (dari ?e=kode di alamat) ---------- */
  const params = new URLSearchParams(location.search);
  WC.params = params;
  WC.event = String(params.get('e') || C.DEFAULT_EVENT || '').toLowerCase().replace(/[^a-z0-9\-]/g, '');
  // alamat halaman lain dengan event yang sama
  WC.link = function (page, extra) {
    const q = new URLSearchParams(extra || {});
    if (WC.event) q.set('e', WC.event);
    const s = q.toString();
    return page + (s ? '?' + s : '');
  };

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

  const API_TIMEOUT = Number(C.API_TIMEOUT_MS) || 45000;
  const STALL_MS = Number(C.STALL_MS) || 40000;      // upload dianggap macet kalau selama ini tidak ada kemajuan

  /* ---------- panggil backend Apps Script ---------- */
  WC.api = async function (action, data) {
    if (!C.API_URL || C.API_URL.indexOf('TEMPEL') === 0) {
      throw Object.assign(new Error('API_URL belum diisi di assets/js/config.js'), { code: 'CONFIG' });
    }
    const body = Object.assign({ action: action, deviceId: WC.deviceId, event: WC.event }, data || {});
    let res;
    // Batas waktu: permintaan yang menggantung (sering terjadi saat HP dikunci/pindah aplikasi) dibatalkan, bukan ditunggu selamanya
    const ctl = window.AbortController ? new AbortController() : null;
    const timer = ctl ? setTimeout(function () { ctl.abort(); }, API_TIMEOUT) : null;
    try {
      // Sengaja tanpa header Content-Type: supaya jadi "simple request" dan lolos CORS Apps Script
      res = await fetch(C.API_URL, { method: 'POST', body: JSON.stringify(body), redirect: 'follow', signal: ctl ? ctl.signal : undefined });
    } catch (e) {
      throw Object.assign(new Error(e && e.name === 'AbortError' ? 'Server terlalu lama menjawab.' : 'Tidak ada koneksi internet.'), { code: 'NETWORK' });
    } finally { clearTimeout(timer); }
    let j;
    try { j = await res.json(); } catch (e) {
      throw Object.assign(new Error('Jawaban server tidak terbaca. Cek URL Web App & izin akses "Anyone".'), { code: 'NETWORK' });
    }
    if (!j.ok) throw Object.assign(new Error(j.error || 'Terjadi kesalahan.'), { code: j.code || 'ERROR' });
    return j;
  };

  /* ---------- alamat gambar dari Google Drive ---------- */
  WC.thumb = function (fileId, width) { return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w' + (width || 600); };
  WC.thumbAlt = function (fileId, width) { return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(fileId) + '=w' + (width || 600); };
  WC.downloadUrl = function (fileId) { return 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(fileId); };
  // Alamat untuk memutar video langsung dengan pemutar bawaan HP (dicoba berurutan sampai ada yang jalan)
  WC.videoSources = function (fileId) {
    const id = encodeURIComponent(fileId), list = [];
    if (C.DRIVE_API_KEY) list.push('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media&key=' + encodeURIComponent(C.DRIVE_API_KEY));
    list.push('https://drive.usercontent.google.com/download?id=' + id + '&export=download');
    list.push('https://drive.google.com/uc?export=download&id=' + id);
    return list;
  };
  WC.previewUrl = function (fileId) { return 'https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/preview'; };

  // Gambar Drive kadang belum siap sesaat setelah upload: coba ulang cepat, bergantian antara dua alamat
  WC.loadThumb = function (img, fileId, width) {
    let tries = 0;
    img.classList.add('thumb-loading');
    img.onload = function () { img.classList.remove('thumb-loading'); img.classList.add('ready'); };
    img.onerror = function () {
      if (tries++ >= 9) { img.onerror = null; img.classList.add('thumb-failed'); return; }
      setTimeout(function () {
        img.src = (tries % 2 ? WC.thumbAlt(fileId, width) : WC.thumb(fileId, width) + '&r=' + tries);
      }, Math.min(6000, 600 * tries));
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
  // '2026-12-25' -> '25 · 12 · 2026'
  WC.fmtDateLine = function (ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    return m ? m[3] + ' · ' + m[2] + ' · ' + m[1] : '';
  };
  WC.initials = function (title) {
    const parts = String(title || '').split(/&|\bdan\b|\+/i).map(function (p) { return p.trim().charAt(0).toUpperCase(); }).filter(Boolean);
    return parts.length >= 2 ? parts[0] + ' & ' + parts[1] : (parts[0] || '♥');
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
     ============================================================ */
  const CHUNK = 4 * 1024 * 1024;   // harus kelipatan 256 KB. Potongan kecil = kalau putus, yang diulang sedikit

  function xhrPut(url, body, range, onProgress) {
    return new Promise(function (resolve, reject) {
      const x = new XMLHttpRequest();
      let dog = null, done = false;
      const finish = function (fn, val) { if (done) return; done = true; clearTimeout(dog); fn(val); };
      // "anjing penjaga": kalau tidak ada kemajuan selama STALL_MS, batalkan supaya bisa dicoba lagi
      const feed = function () { clearTimeout(dog); dog = setTimeout(function () { try { x.abort(); } catch (e) { /* abaikan */ } finish(reject, new Error('stall')); }, STALL_MS); };
      x.open('PUT', url, true);
      if (range) x.setRequestHeader('Content-Range', range);
      x.upload.onprogress = function (e) { feed(); if (onProgress && e.lengthComputable) onProgress(e.loaded); };
      x.onload = function () {
        let rangeHeader = null;
        try { rangeHeader = x.getResponseHeader('Range'); } catch (e) { rangeHeader = null; }
        finish(resolve, { status: x.status, text: x.responseText, range: rangeHeader });
      };
      x.onerror = function () { finish(reject, new Error('network')); };
      x.onabort = function () { finish(reject, new Error('abort')); };
      feed();
      x.send(body);
    });
  }
  function parseId(text) { try { return JSON.parse(text).id || null; } catch (e) { return null; } }
  function sessionGone() { return Object.assign(new Error('Sesi upload kedaluwarsa.'), { code: 'SESSION' }); }

  // Tanya Drive: sesi ini sudah menerima sampai byte berapa? -> { id } kalau sudah selesai, atau { offset }
  async function askOffset(uploadUrl, total) {
    const q = await xhrPut(uploadUrl, null, 'bytes */' + total);
    if (q.status === 200 || q.status === 201) { const id = parseId(q.text); if (id) return { id: id }; }
    if (q.status === 404 || q.status === 410 || q.status === 400) throw sessionGone();
    if (q.status === 308) {
      const m = q.range ? /bytes=0-(\d+)/.exec(q.range) : null;
      return { offset: m ? Number(m[1]) + 1 : 0 };
    }
    throw new Error('HTTP ' + q.status);
  }

  // opts.resume = true: lanjutkan sesi lama dari byte terakhir yang sudah diterima Drive
  WC.putResumable = async function (uploadUrl, blob, onProgress, opts) {
    const total = blob.size;
    let offset = 0, fails = 0;
    if (opts && opts.resume) {
      const a = await askOffset(uploadUrl, total);
      if (a.id) return a.id;
      offset = a.offset;
    }
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
        if (r.status === 404 || r.status === 410) throw sessionGone();
        throw new Error('HTTP ' + r.status);
      } catch (e) {
        if (e.code === 'SESSION') throw e;
        if (++fails > 3) throw Object.assign(new Error('Sinyal terputus saat mengirim.'), { code: 'NETWORK' });
        await WC.sleep(1500 * fails);
        try {
          const a = await askOffset(uploadUrl, total);
          if (a.id) return a.id;
          offset = a.offset;
        } catch (e2) { if (e2.code === 'SESSION') throw e2; /* masih offline: ulangi potongan yang sama */ }
      }
    }
    throw new Error('Upload tidak selesai.');
  };

  /* ---------- stok "tiket upload" ----------
     Untuk foto kamera, beberapa tiket diminta sekaligus di awal. Jadi begitu tombol
     rana ditekan, foto langsung dikirim ke Drive tanpa menunggu tanya server dulu. */
  const pool = {};          // kode event -> [uploadUrl]
  const refilling = {};
  function isCamPhoto(meta) { return meta.source === 'camera' && meta.type === 'photo'; }
  async function requestTickets(ev, meta, blob, count) {
    const r = await WC.api('initUpload', {
      event: ev, source: meta.source, guest: meta.guest || WC.guestName(), pin: WC.pin() || undefined,
      mime: (blob && blob.type) || 'image/jpeg', size: count > 1 ? 0 : (blob ? blob.size : 0), count: count, origin: location.origin
    });
    return r.tickets.map(function (t) { return t.uploadUrl; });
  }
  function refill(ev) {
    if (refilling[ev]) return;
    refilling[ev] = true;
    requestTickets(ev, { source: 'camera', type: 'photo' }, null, 4)
      .then(function (list) { pool[ev] = (pool[ev] || []).concat(list); }, function () { /* tidak apa: diminta lagi saat dibutuhkan */ })
      .then(function () { refilling[ev] = false; });
  }
  WC.prewarm = function () { if (WC.event && !(pool[WC.event] || []).length) refill(WC.event); };
  async function takeTicket(ev, meta, blob) {
    if (isCamPhoto(meta) && blob.type === 'image/jpeg') {
      const p = (pool[ev] = pool[ev] || []);
      if (p.length) { const t = p.shift(); if (p.length < 2) refill(ev); return t; }
      const list = await requestTickets(ev, meta, blob, 4);
      const t = list.shift();
      pool[ev] = (pool[ev] || []).concat(list);
      return t;
    }
    return (await requestTickets(ev, meta, blob, 1))[0];
  }

  // Alamat sesi upload diingat per jepretan. Kalau kiriman terputus, percobaan berikutnya MELANJUTKAN
  // sesi yang sama (tanpa minta tiket baru ke server dan tanpa mengulang dari nol).
  const sess = {
    all: function () { try { return JSON.parse(store('wc_sessions') || '{}'); } catch (e) { return {}; } },
    get: function (key) { return key ? sess.all()[key] : null; },
    set: function (key, url) { if (!key) return; const m = sess.all(); if (url) m[key] = url; else delete m[key]; store('wc_sessions', JSON.stringify(m)); }
  };
  WC.sessions = sess;

  // Ambil tiket -> kirim ke Drive. Mengembalikan ID file di Drive.
  WC.uploadFile = async function (blob, meta, onProgress, key) {
    const ev = meta.event || WC.event;
    const old = sess.get(key);
    const keep = function (id) { sess.set(key, 'id:' + id); return id; };     // file sudah di Drive: cukup dicatat, jangan dikirim ulang
    if (old && old.indexOf('id:') === 0) return old.slice(3);
    if (old) {
      try { return keep(await WC.putResumable(old, blob, onProgress, { resume: true })); }
      catch (e) { if (e.code !== 'SESSION') throw e; sess.set(key, null); }       // sesi lama hangus: minta tiket baru
    }
    for (let attempt = 0; ; attempt++) {
      const url = await takeTicket(ev, meta, blob);
      sess.set(key, url);
      try { return keep(await WC.putResumable(url, blob, onProgress)); }
      catch (e) { if (e.code === 'SESSION' && attempt < 1) { pool[ev] = []; sess.set(key, null); continue; } throw e; }
    }
  };
  // Alur lengkap untuk kiriman tamu: kirim ke Drive -> catat di tab event
  WC.upload = async function (blob, meta, onProgress, key) {
    const ev = meta.event || WC.event;
    const fileId = await WC.uploadFile(blob, meta, onProgress, key);
    return WC.api('completeUpload', { event: ev, fileId: fileId, guest: meta.guest || WC.guestName(), source: meta.source, caption: meta.caption, pin: WC.pin() || undefined });
  };

  /* ============================================================
     PENYIMPANAN DI HP (IndexedDB)
     - shots  : jepretan yang belum terkirim
     - thumbs : salinan kecil jepretan sendiri (tampil instan di album)
     ============================================================ */
  const db = { conn: null, off: false, mem: { shots: [], thumbs: [] } };
  function openDb() {
    return new Promise(function (resolve) {
      if (db.conn || db.off) return resolve();
      try {
        const req = indexedDB.open('wc-queue', 2);
        req.onupgradeneeded = function () {
          const d = req.result;
          if (!d.objectStoreNames.contains('shots')) d.createObjectStore('shots', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('thumbs')) d.createObjectStore('thumbs', { keyPath: 'id' });
        };
        req.onsuccess = function () { db.conn = req.result; resolve(); };
        req.onerror = function () { db.off = true; resolve(); };
        req.onblocked = function () { db.off = true; resolve(); };
      } catch (e) { db.off = true; resolve(); }
    });
  }
  function tx(storeName, mode, fn) {
    return new Promise(function (resolve, reject) {
      const t = db.conn.transaction(storeName, mode);
      const out = fn(t.objectStore(storeName));
      t.oncomplete = function () { resolve(out && out.result); };
      t.onerror = function () { reject(t.error); };
      t.onabort = function () { reject(t.error); };
    });
  }
  async function dbPut(storeName, item) {
    await openDb();
    if (db.conn) { try { await tx(storeName, 'readwrite', function (s) { return s.put(item); }); return; } catch (e) { /* jatuh ke memori */ } }
    const arr = db.mem[storeName], i = arr.findIndex(function (x) { return x.id === item.id; });
    if (i >= 0) arr[i] = item; else arr.push(item);
  }
  async function dbAll(storeName) {
    await openDb();
    let list = db.mem[storeName].slice();
    if (db.conn) { try { list = list.concat((await tx(storeName, 'readonly', function (s) { return s.getAll(); })) || []); } catch (e) { /* abaikan */ } }
    return list.sort(function (a, b) { return a.createdAt - b.createdAt; });
  }
  async function dbHas(storeName, id) {
    if (db.mem[storeName].some(function (x) { return x.id === id; })) return true;
    if (!db.conn) return false;
    try { return (await tx(storeName, 'readonly', function (s) { return s.count(id); })) > 0; } catch (e) { return true; }
  }
  async function dbDel(storeName, id) {
    db.mem[storeName] = db.mem[storeName].filter(function (x) { return x.id !== id; });
    if (db.conn) { try { await tx(storeName, 'readwrite', function (s) { return s.delete(id); }); } catch (e) { /* abaikan */ } }
  }

  /* ---------- salinan kecil ---------- */
  const T = (WC.thumbs = {});
  T.add = function (id, event, blob, type) { return dbPut('thumbs', { id: id, event: event, blob: blob, type: type, fileId: '', createdAt: Date.now() }); };
  T.list = async function (event) { return (await dbAll('thumbs')).filter(function (t) { return t.event === event; }); };
  T.setFile = async function (id, fileId) {
    const all = await dbAll('thumbs');
    const t = all.find(function (x) { return x.id === id; });
    if (t) { t.fileId = fileId; await dbPut('thumbs', t); }
    for (let i = 0; i < all.length - 120; i++) await dbDel('thumbs', all[i].id);    // simpan 120 terakhir saja
  };
  T.remove = function (id) { return dbDel('thumbs', id); };

  /* ============================================================
     ANTREAN KIRIM — sampai 3 jepretan dikirim BERSAMAAN
     ============================================================ */
  const Q = (WC.queue = { items: null, active: {}, listeners: [], retryTimer: null, primary: false, lastError: '' });
  const MAX_PARALLEL = 3;
  const BIG = 12 * 1024 * 1024;          // di atas ini dianggap "berat" (video panjang)
  const DROP_CODES = { LIMIT: 1, CLOSED: 1, NOT_ALLOWED: 1, BAD_REQUEST: 1, NO_EVENT: 1 };
  function emit(type, item, extra) { Q.listeners.forEach(function (fn) { try { fn(type, item, extra); } catch (e) { /* abaikan */ } }); }
  function isBig(it) { return it.blob && it.blob.size > BIG; }
  Q.on = function (fn) { Q.listeners.push(fn); };
  // force = baca ulang dari penyimpanan (tab lain mungkin sudah mengirim sebagian)
  Q.load = async function (force) {
    if (!Q.items || force) {
      const old = Q.items || [];
      Q.items = (await dbAll('shots')).map(function (it) {
        const prev = old.find(function (o) { return o.id === it.id; });
        if (prev) { it.retryAt = prev.retryAt; it.fails = prev.fails; }
        return it;
      });
    }
    return Q.items;
  };
  Q.pending = function (event, source) {
    return (Q.items || []).filter(function (i) { return (!event || i.meta.event === event) && (!source || i.meta.source === source); }).length;
  };
  // jumlah yang sedang menunggu dicoba ulang (untuk ditampilkan ke tamu)
  Q.waiting = function (event) {
    const now = Date.now();
    return (Q.items || []).filter(function (i) { return (!event || i.meta.event === event) && i.fails > 0 && !Q.active[i.id] && i.retryAt > now; }).length;
  };
  Q.add = async function (blob, meta) {
    await Q.load();
    const item = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), blob: blob, meta: meta, createdAt: Date.now() };
    await dbPut('shots', item);
    Q.items.push(item);
    emit('added', item);
    Q.pump();
    return item;
  };
  function forget(item) { Q.items = Q.items.filter(function (i) { return i.id !== item.id; }); sess.set(item.id, null); }

  // Satu jepretan hanya boleh dikirim oleh SATU tab (kamera & album bisa terbuka bersamaan)
  function withLock(item, fn) {
    if (navigator.locks && navigator.locks.request) {
      return navigator.locks.request('wc-shot-' + item.id, { ifAvailable: true }, function (lock) {
        if (lock) return fn();
        item.retryAt = Date.now() + 5000;      // sedang dikirim tab lain: cek lagi nanti
        schedule(5200);
        return null;
      });
    }
    return fn();
  }
  function schedule(ms) { clearTimeout(Q.retryTimer); Q.retryTimer = setTimeout(Q.pump, ms); }
  function handle(item) {
    return withLock(item, function () { return send(item); }).then(function () {}, function () {}).then(function () {
      delete Q.active[item.id];
      emit('settled', item);
      Q.pump();
    });
  }
  async function send(item) {
    if (!(await dbHas('shots', item.id))) {      // sudah dikirim tab lain
      forget(item);
      emit('done', item, null);
      return;
    }
    try {
      const r = await WC.upload(item.blob, item.meta, null, item.id);
      await dbDel('shots', item.id);
      forget(item);
      await T.setFile(item.id, r.item.fileId);
      Q.lastError = '';
      emit('done', item, r);
    } catch (e) {
      if (DROP_CODES[e.code]) {            // ditolak server: buang supaya tidak mengulang selamanya
        await dbDel('shots', item.id); await T.remove(item.id);
        forget(item);
        emit('rejected', item, e);
      } else {
        // Gagal sementara: coba lagi dengan jeda yang makin panjang (10 dtk, 20 dtk, 40 dtk ... maksimal 5 menit).
        // Jeda ini penting supaya server tidak dibanjiri permintaan saat ada gangguan.
        item.fails = (item.fails || 0) + 1;
        const wait = Math.min(300000, 10000 * Math.pow(2, item.fails - 1));
        item.retryAt = Date.now() + wait;
        Q.lastError = (e && e.message) || 'gagal';
        emit('failed', item, e);
      }
    }
  }
  Q.pump = async function () {
    // Tanpa Web Locks (browser lama), hanya halaman kamera yang mengirim, supaya tidak terkirim ganda
    if (!Q.primary && !(navigator.locks && navigator.locks.request)) return;
    await Q.load();
    const now = Date.now();
    // Yang ringan (foto) didahulukan, dan hanya SATU kiriman berat (video panjang) dalam satu waktu,
    // supaya foto tidak pernah tertahan di belakang video.
    const order = Q.items.slice().sort(function (a, b) { return (isBig(a) - isBig(b)) || (a.createdAt - b.createdAt); });
    let bigActive = Q.items.some(function (i) { return Q.active[i.id] && isBig(i); });
    let next = Infinity;
    for (let i = 0; i < order.length; i++) {
      const it = order[i];
      if (Q.active[it.id]) continue;
      if (it.retryAt && it.retryAt > now) { next = Math.min(next, it.retryAt - now); continue; }
      if (Object.keys(Q.active).length >= MAX_PARALLEL) break;
      if (isBig(it)) { if (bigActive) continue; bigActive = true; }
      Q.active[it.id] = true;
      handle(it);
    }
    if (next !== Infinity) schedule(next + 300);
  };
  // "Kirim ulang sekarang": abaikan jeda tunggu
  Q.retryNow = function () { (Q.items || []).forEach(function (i) { if (!Q.active[i.id]) i.retryAt = 0; }); return Q.pump(); };
  window.addEventListener('online', function () { Q.retryNow(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) Q.pump(); });
})();