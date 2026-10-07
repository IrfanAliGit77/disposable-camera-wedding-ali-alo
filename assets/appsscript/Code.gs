/**
 * ============================================================
 *  DISPOSABLE CAMERA — BACKEND MULTI-EVENT (Google Apps Script)
 * ------------------------------------------------------------
 *  Satu backend untuk BANYAK event. Setiap event otomatis punya:
 *   - 1 tab di Google Sheet utama (nama tab = nama event)
 *   - 1 folder di Google Drive    (nama folder = nama event)
 *   - 1 link + QR tamu sendiri    (index.html?e=kode-event)
 *   - pengaturan sendiri
 *
 *  RANCANGAN UNTUK ACARA BESAR (ribuan tamu):
 *   - Foto & video pendek dikirim lewat script ini langsung ke Drive (DriveApp),
 *     jadi TIDAK memakai jatah "URL Fetch 20.000/hari".
 *   - Hanya file besar (video panjang / upload galeri) yang memakai tiket upload (1 UrlFetch per file).
 *   - Daftar album dibaca per halaman, dan hampir semua bacaan lewat cache,
 *     supaya 1.000 tamu tidak membuat Sheet dibaca utuh berulang-ulang.
 *
 *  LANGKAH PAKAI (detail di PANDUAN.md):
 *   a. Ganti ADMIN_PIN di bawah.
 *   b. Jalankan fungsi  setup  satu kali (tombol Run), izinkan aksesnya.
 *   c. Deploy > Manage deployments > Edit > New version  (atau New deployment kalau belum pernah).
 *   d. Buat event dari halaman admin.html
 * ============================================================
 */

// ====== GANTI INI ======
const ADMIN_PIN = 'GANTI-PIN-INI';               // PIN utama (bisa membuat & menghapus event)
const ROOT_FOLDER_NAME = 'Disposable Camera Events'; // folder induk di Drive (dibuat otomatis)
// =======================

const EVENTS_SHEET = '_Events';
const EVENT_HEADERS = ['slug', 'name', 'folderId', 'sheetName', 'settings', 'createdAt'];
const HEADERS = ['id', 'fileId', 'type', 'mime', 'size', 'guest', 'deviceId', 'source', 'caption', 'createdAt', 'hidden', 'duration'];
const SMALL_MAX = 8 * 1024 * 1024;   // file sampai ukuran ini dikirim lewat script (tanpa memakai jatah UrlFetch)
const CACHE_LONG = 21600;            // 6 jam (maksimum CacheService)

// Pengaturan awal setiap event baru. Semuanya bisa diubah dari dashboard.
const DEFAULT_SETTINGS = {
  eventSubtitle: 'The Wedding Disposable Camera',
  eventDate: '',
  cameraOpen: true,
  shotsPerGuest: 27,
  allowVideo: true,
  maxVideoSeconds: 300,           // TOTAL durasi video per tamu (detik), boleh dipecah jadi beberapa video
  allowLibrary: true,
  albumMode: 'reveal',            // 'reveal' = dibuka pada revealAt, 'live' = langsung terlihat
  revealAt: '',
  guestsSeeOwn: true,
  dateStamp: true,
  coverFileId: '',                // foto sampul (foto mempelai) di halaman tamu
  clientPin: ''                   // PIN khusus event ini (untuk klien); kosong = hanya PIN utama
};

/* ------------------------------------------------------------
 *  SETUP — jalankan SATU KALI dari editor (aman dijalankan ulang)
 * ------------------------------------------------------------ */
function setup() {
  const props = PropertiesService.getScriptProperties();

  // 1) Spreadsheet utama
  let ss = null;
  const sheetId = props.getProperty('SHEET_ID');
  if (sheetId) { try { ss = SpreadsheetApp.openById(sheetId); } catch (err) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) ss = SpreadsheetApp.create('Disposable Camera (Data)');
    props.setProperty('SHEET_ID', ss.getId());
  }
  let ev = ss.getSheetByName(EVENTS_SHEET);
  if (!ev) ev = ss.insertSheet(EVENTS_SHEET, 0);
  if (ev.getLastRow() === 0) {
    ev.getRange(1, 1, 1, EVENT_HEADERS.length).setValues([EVENT_HEADERS]).setFontWeight('bold');
    ev.setFrozenRows(1);
  }
  ev.getRange(1, 1, ev.getMaxRows(), EVENT_HEADERS.length).setNumberFormat('@');

  // 2) Folder induk di Drive
  let root = null;
  const folderId = props.getProperty('FOLDER_ID');
  if (folderId) { try { root = DriveApp.getFolderById(folderId); } catch (err) { root = null; } }
  if (!root) {
    root = DriveApp.createFolder(ROOT_FOLDER_NAME);
    props.setProperty('FOLDER_ID', root.getId());
  }
  // Folder induk dibuat privat; yang dibagikan "siapa pun dengan link" hanya folder tiap event
  try { root.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT); } catch (err) { /* tidak apa */ }

  // kolom baru "duration" untuk tab event yang sudah ada
  const cache = CacheService.getScriptCache();
  cache.remove('ids'); cache.remove('events');
  readEvents_(true).forEach(function (e) {
    const sh = ss.getSheetByName(e.sheetName);
    if (sh) { sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold'); sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@'); }
    cache.remove('n_' + e.slug);
  });
  clearCache_();
  Logger.log('SETUP SELESAI');
  Logger.log('Spreadsheet  : ' + ss.getUrl());
  Logger.log('Folder induk : ' + root.getUrl());
  Logger.log('Berikutnya: Deploy sebagai Web app, lalu buat event dari admin.html');
}

/* ------------------------------------------------------------
 *  PINTU MASUK WEB APP
 * ------------------------------------------------------------ */
function doGet() {
  return json_({ ok: true, app: 'disposable-camera', version: 4, ready: isReady_(), time: new Date().toISOString() });
}

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!isReady_()) throw err_('Backend belum di-setup. Jalankan fungsi setup() dulu.', 'NOT_READY');
    const routes = {
      config: actConfig_, upload: actUpload_, initUpload: actInitUpload_, completeUpload: actCompleteUpload_, list: actList_, adminStats: actAdminStats_,
      adminLogin: actAdminLogin_, adminEvents: actAdminEvents_, adminCreateEvent: actAdminCreateEvent_, adminDeleteEvent: actAdminDeleteEvent_,
      adminSaveSettings: actAdminSaveSettings_, adminSetCover: actAdminSetCover_, adminSetHidden: actAdminSetHidden_, adminDelete: actAdminDelete_
    };
    const fn = routes[d.action];
    if (!fn) throw err_('Aksi tidak dikenal: ' + d.action, 'BAD_REQUEST');
    const out = fn(d) || {};
    out.ok = true;
    return json_(out);
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error), code: (error && error.code) || 'ERROR' });
  }
}

/* ------------------------------------------------------------
 *  AKSI UNTUK TAMU  (semua butuh d.event = kode event)
 * ------------------------------------------------------------ */
function actConfig_(d) {
  const ev = getEvent_(d.event);
  const st = deviceState_(ev, cleanId_(d.deviceId));
  return {
    settings: publicSettings_(ev),
    revealed: isRevealed_(ev.settings),
    serverTime: new Date().toISOString(),
    used: st.p,
    usedVideo: st.s,
    total: total_(ev)
  };
}

// Pemeriksaan bersama sebelum menerima kiriman. Mengembalikan data yang sudah dirapikan.
function admit_(ev, d) {
  const s = ev.settings;
  const admin = !!role_(d, ev);
  const source = d.source === 'library' ? 'library' : (d.source === 'cover' ? 'cover' : 'camera');
  if (source === 'cover' && !admin) throw err_('Khusus admin.', 'AUTH');
  if (!s.cameraOpen && !admin) throw err_('Kamera sedang ditutup oleh mempelai.', 'CLOSED');

  const mime = String(d.mime || '').split(';')[0].trim().toLowerCase();
  const isImage = mime.indexOf('image/') === 0;
  const isVideo = mime.indexOf('video/') === 0;
  if (!isImage && !isVideo) throw err_('Hanya foto atau video yang bisa dikirim.', 'NOT_ALLOWED');
  if (source === 'cover' && !isImage) throw err_('Foto sampul harus berupa gambar.', 'NOT_ALLOWED');
  if (isVideo && !s.allowVideo && !admin) throw err_('Video sedang tidak diizinkan.', 'NOT_ALLOWED');
  if (source === 'library' && !s.allowLibrary && !admin) throw err_('Upload dari galeri sedang tidak diizinkan.', 'NOT_ALLOWED');

  const deviceId = cleanId_(d.deviceId);
  if (!deviceId) throw err_('deviceId kosong.', 'BAD_REQUEST');
  const duration = isVideo ? Math.max(0, Math.min(36000, Number(d.duration) || 0)) : 0;
  if (source === 'camera' && !admin) {
    const st = deviceState_(ev, deviceId);
    if (isImage && st.p >= Number(s.shotsPerGuest)) throw err_('Rol film kamu sudah habis. Terima kasih sudah mengabadikan momen kami!', 'LIMIT');
    // jatah video = TOTAL detik per tamu (toleransi 2 detik untuk pembulatan)
    if (isVideo && st.s + duration > Number(s.maxVideoSeconds) + 2) throw err_('Jatah durasi video kamu sudah habis.', 'LIMIT');
  }
  return { admin: admin, source: source, mime: mime, isVideo: isVideo, deviceId: deviceId, duration: duration };
}
function fileName_(a, d) {
  if (a.source === 'cover') return '_sampul_' + Utilities.getUuid().slice(0, 6) + '.' + extFor_(a.mime);
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd-HHmmss') + '_' + (safeName_(d.guest) || 'Tamu') + '_' + Utilities.getUuid().slice(0, 6) + '.' + extFor_(a.mime);
}
// Kiriman yang sama (dicoba ulang oleh HP karena sinyal jelek) tidak boleh tercatat dua kali
function seen_(uid) {
  uid = cleanId_(uid);
  if (!uid) return null;
  const hit = CacheService.getScriptCache().get('x_' + uid);
  if (!hit) return null;
  try { return JSON.parse(hit); } catch (e) { return null; }
}
function remember_(uid, out) {
  uid = cleanId_(uid);
  if (uid) { try { CacheService.getScriptCache().put('x_' + uid, JSON.stringify(out), CACHE_LONG); } catch (e) { /* abaikan */ } }
}

// JALUR UTAMA (foto & video pendek): file dikirim sebagai teks base64, disimpan ke Drive dan dicatat dalam SATU panggilan.
// Tidak memakai UrlFetch sama sekali.
function actUpload_(d) {
  const done = seen_(d.uid);
  if (done) return done;
  const ev = getEvent_(d.event);
  const a = admit_(ev, d);
  if (a.source === 'cover') throw err_('Foto sampul dikirim lewat tiket upload.', 'BAD_REQUEST');
  const bytes = Utilities.base64Decode(String(d.data || ''));
  if (!bytes.length) throw err_('File kosong.', 'BAD_REQUEST');
  if (bytes.length > SMALL_MAX) throw err_('File terlalu besar untuk jalur ini.', 'BAD_REQUEST');
  const file = DriveApp.getFolderById(ev.folderId).createFile(Utilities.newBlob(bytes, a.mime, fileName_(a, d)));
  const out = record_(ev, d, a, file.getId(), bytes.length);
  remember_(d.uid, out);
  return out;
}

// JALUR FILE BESAR, langkah 1: minta "tiket" (alamat upload sekali pakai) ke Google Drive. Memakai 1 UrlFetch.
function actInitUpload_(d) {
  const ev = getEvent_(d.event);
  const a = admit_(ev, d);
  const origin = String(d.origin || '');
  if (!/^https?:\/\/[^\s\/]+$/.test(origin)) throw err_('Buka aplikasi lewat alamat http/https (bukan file://).', 'BAD_REQUEST');
  const size = Number(d.size) || 0;
  const headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': a.mime, Origin: origin };  // Origin: izin CORS untuk browser tamu
  if (size > 0) headers['X-Upload-Content-Length'] = String(size);
  const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: headers,
    payload: JSON.stringify({ name: fileName_(a, d), mimeType: a.mime, parents: [ev.folderId] }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw err_('Drive menolak membuat sesi upload (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 200), 'DRIVE');
  const h = res.getHeaders();
  const url = h['Location'] || h['location'];
  if (!url) throw err_('Drive tidak memberi alamat upload.', 'DRIVE');
  return { tickets: [{ uploadUrl: url }] };
}

// JALUR FILE BESAR, langkah 2: setelah file masuk Drive, catat di tab event
function actCompleteUpload_(d) {
  const done = seen_(d.uid);
  if (done) return done;
  const ev = getEvent_(d.event);
  const fileId = cleanId_(d.fileId);
  if (!fileId) throw err_('fileId kosong.', 'BAD_REQUEST');
  const file = fileInFolder_(fileId, ev.folderId);
  d.mime = String(file.getMimeType() || '');
  let a;
  try { a = admit_(ev, d); }
  catch (e) { try { file.setTrashed(true); } catch (e2) { /* abaikan */ } throw e; }      // ditolak: jangan tinggalkan file yatim
  const out = record_(ev, d, a, fileId, file.getSize());
  remember_(d.uid, out);
  return out;
}

// Tulis satu baris ke tab event + perbarui catatan pemakaian HP ini (di cache)
function record_(ev, d, a, fileId, size) {
  const item = {
    id: Utilities.getUuid(),
    fileId: fileId,
    type: a.isVideo ? 'video' : 'photo',
    mime: a.mime,
    size: size,
    guest: cleanText_(d.guest, 40) || 'Tamu',
    deviceId: a.deviceId,
    source: a.source === 'library' ? 'library' : 'camera',
    caption: cleanText_(d.caption, 140),
    createdAt: new Date().toISOString(),
    hidden: false,
    duration: a.duration
  };
  const sh = eventSheet_(ev);
  sh.appendRow(HEADERS.map(function (k) { return String(item[k]); }));     // appendRow aman dipanggil bersamaan
  const cache = CacheService.getScriptCache();
  try { cache.put('n_' + ev.slug, String(Math.max(0, sh.getLastRow() - 1)), 20); } catch (e) { /* abaikan */ }

  // catatan pemakaian per HP: dikunci sebentar supaya 3 kiriman paralel dari HP yang sama tidak saling menimpa
  const key = 'd_' + ev.slug + '_' + a.deviceId;
  const lock = LockService.getScriptLock();
  let locked = false;
  try { locked = lock.tryLock(8000); } catch (e) { locked = false; }
  let st;
  try {
    st = deviceState_(ev, a.deviceId, item.id);
    if (!st.fresh) {       // fresh = baru dihitung ulang dari Sheet, sudah termasuk baris ini
      if (item.source === 'camera') { if (a.isVideo) st.s += a.duration; else st.p += 1; }
      st.items.push(compact_(item));
      if (st.items.length > 150) st.items = st.items.slice(-150);
    }
    try { cache.put(key, JSON.stringify({ p: st.p, s: st.s, items: st.items }), CACHE_LONG); } catch (e) { /* abaikan */ }
  } finally { if (locked) lock.releaseLock(); }
  return { item: publicItem_(item, a.deviceId, false), used: st.p, usedVideo: st.s };
}
function compact_(r) { return { id: r.id, fileId: r.fileId, type: r.type, guest: r.guest, createdAt: r.createdAt, size: Number(r.size) || 0, source: r.source, caption: r.caption || '', duration: Number(r.duration) || 0 }; }
function publicItem_(r, deviceId, admin) {
  const o = { id: r.id, fileId: r.fileId, type: r.type, guest: r.guest, caption: r.caption || '', createdAt: r.createdAt, size: Number(r.size) || 0, source: r.source, duration: Number(r.duration) || 0, mine: !!deviceId && r.deviceId === deviceId };
  if (r.row) o.row = r.row;
  if (admin) { o.hidden = !!r.hidden; o.deviceId = r.deviceId; o.mime = r.mime; }
  return o;
}

// Pemakaian satu HP di satu event: { p: jumlah foto kamera, s: total detik video kamera, items: kirimannya sendiri }
// Disimpan di cache 6 jam. Kalau belum ada, dihitung sekali dari Sheet.
function deviceState_(ev, deviceId, justAddedId) {
  const empty = { p: 0, s: 0, items: [] };
  if (!deviceId) return empty;
  const cache = CacheService.getScriptCache();
  const key = 'd_' + ev.slug + '_' + deviceId;
  const hit = cache.get(key);
  if (hit) { try { const o = JSON.parse(hit); if (o && o.items) return o; } catch (e) { /* hitung ulang */ } }
  const st = { p: 0, s: 0, items: [], fresh: true };
  readRange_(eventSheet_(ev), 1, 1e9).forEach(function (r) {
    if (r.deviceId !== deviceId) return;
    if (r.source === 'camera') { if (r.type === 'video') st.s += r.duration; else st.p += 1; }
    if (!r.hidden) st.items.push(compact_(r));
  });
  if (st.items.length > 150) st.items = st.items.slice(-150);
  try { cache.put(key, JSON.stringify({ p: st.p, s: st.s, items: st.items }), CACHE_LONG); } catch (e) { /* abaikan */ }
  return st;
}

/* Daftar album, dibaca PER HALAMAN:
 *   mode 'tail'   : N kiriman terbaru (bawaan)
 *   mode 'after'  : kiriman setelah baris ke-`after`  (dipakai saat menyegarkan otomatis; hampir selalu dijawab dari cache)
 *   mode 'before' : N kiriman sebelum baris ke-`before` (tombol "muat lebih banyak")
 * `v` berubah setiap admin menyembunyikan/menghapus; saat itu HP memuat ulang dari awal. */
function actList_(d) {
  const ev = getEvent_(d.event);
  const s = ev.settings;
  const role = role_(d, ev);
  const admin = !!role;
  const deviceId = cleanId_(d.deviceId);
  const revealed = isRevealed_(s);
  const out = {
    settings: role === 'master' ? fullSettings_(ev) : publicSettings_(ev),
    revealed: revealed, admin: admin, role: role || '',
    serverTime: new Date().toISOString(),
    v: version_(ev), items: []
  };
  const limit = clamp_(d.limit || 60, 1, 200);
  const mode = d.mode === 'after' || d.mode === 'before' ? d.mode : 'tail';

  if (!admin && !revealed) {
    // album masih dikunci: hanya kiriman sendiri (dari cache per HP)
    out.total = total_(ev);
    out.own = true;
    if (s.guestsSeeOwn && deviceId) {
      out.items = deviceState_(ev, deviceId).items.slice().reverse().map(function (r) { r.deviceId = deviceId; return publicItem_(r, deviceId, false); });
    }
    return out;
  }

  if (mode === 'after') {
    const after = Math.max(0, Number(d.after) || 0);
    const cached = total_(ev);
    out.total = cached;
    out.cursor = after;
    if (after >= cached) return out;               // tidak ada yang baru: selesai tanpa membuka Sheet
    const take = Math.min(200, cached - after);
    out.items = pageItems_(ev, after + 1, take, deviceId, admin);
    out.cursor = after + take;                     // HP melanjutkan dari sini pada penyegaran berikutnya
    return out;
  }
  const sh = eventSheet_(ev);
  const n = Math.max(0, sh.getLastRow() - 1);
  out.total = n;
  let end = n;
  if (mode === 'before') end = Math.min(n, Math.max(0, (Number(d.before) || 0) - 1));
  const start = Math.max(1, end - limit + 1);
  if (end >= start) out.items = pageItems_(ev, start, end - start + 1, deviceId, admin, sh);
  out.more = start > 1;
  out.floor = start;                               // baris tertua yang sudah dikirim ke HP (untuk "muat lebih banyak")
  if (mode === 'tail') out.cursor = n;
  if (admin) {
    out.folderUrl = 'https://drive.google.com/drive/folders/' + ev.folderId;
    out.sheetUrl = 'https://docs.google.com/spreadsheets/d/' + ids_().sheet + '/edit#gid=' + sh.getSheetId();
  }
  return out;
}
function pageItems_(ev, start, count, deviceId, admin, sh) {
  return readRange_(sh || eventSheet_(ev), start, count)
    .filter(function (r) { return admin || !r.hidden; })
    .map(function (r) { return publicItem_(r, deviceId, admin); })
    .reverse();
}

/* ------------------------------------------------------------
 *  AKSI ADMIN
 *  - PIN utama  : semua event, buat/hapus event
 *  - PIN klien  : hanya dashboard event miliknya
 * ------------------------------------------------------------ */
function actAdminLogin_(d) {
  if (ADMIN_PIN === 'GANTI-PIN-INI') throw err_('ADMIN_PIN di Code.gs belum diganti.', 'AUTH');
  if (isMaster_(d)) return { role: 'master' };
  if (d.event) {
    let ev = null;
    try { ev = getEvent_(d.event); } catch (e) { ev = null; }
    if (ev && role_(d, ev) === 'event') return { role: 'event' };
  }
  Utilities.sleep(800);
  throw err_('PIN salah.', 'AUTH');
}

function actAdminEvents_(d) {
  requireMaster_(d);
  const ss = ss_();
  return {
    events: readEvents_().map(function (ev) {
      const sh = ss.getSheetByName(ev.sheetName);
      return {
        slug: ev.slug, name: ev.name, createdAt: ev.createdAt, eventDate: ev.settings.eventDate,
        cameraOpen: !!ev.settings.cameraOpen, revealed: isRevealed_(ev.settings),
        total: sh ? Math.max(0, sh.getLastRow() - 1) : 0, coverFileId: ev.settings.coverFileId || ''
      };
    }).reverse(),
    sheetUrl: 'https://docs.google.com/spreadsheets/d/' + ids_().sheet,
    folderUrl: 'https://drive.google.com/drive/folders/' + ids_().folder
  };
}

function actAdminCreateEvent_(d) {
  requireMaster_(d);
  const name = tabName_(d.name);
  if (!name) throw err_('Nama event wajib diisi.', 'BAD_REQUEST');

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ss = ss_();
    const events = readEvents_(true);

    // nama tab & folder = nama event (ditambah angka kalau sudah dipakai)
    let finalName = name, n = 2;
    while (ss.getSheetByName(finalName) || events.some(function (e) { return e.name.toLowerCase() === finalName.toLowerCase(); })) finalName = name + ' (' + (n++) + ')';

    // kode event untuk link/QR
    const baseSlug = slugify_(d.slug || finalName) || 'event';
    let slug = baseSlug; n = 2;
    while (events.some(function (e) { return e.slug === slug; })) slug = baseSlug + '-' + (n++);

    const folder = DriveApp.getFolderById(ids_().folder).createFolder(finalName);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);   // supaya foto bisa tampil di album

    const sh = ss.insertSheet(finalName, ss.getSheets().length);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@');

    const settings = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { settings[k] = DEFAULT_SETTINGS[k]; });
    settings.eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(d.eventDate || '')) ? d.eventDate : '';
    if (d.eventSubtitle) settings.eventSubtitle = cleanText_(d.eventSubtitle, 80);
    // default album dibuka pukul 18.00 WIB di hari acara (atau besok kalau tanggal belum diisi)
    settings.revealAt = settings.eventDate ? new Date(settings.eventDate + 'T18:00:00+07:00').toISOString() : new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const createdAt = new Date().toISOString();
    ss.getSheetByName(EVENTS_SHEET).appendRow([slug, finalName, folder.getId(), finalName, JSON.stringify(settings), createdAt]);
    clearCache_();
    return { event: { slug: slug, name: finalName, createdAt: createdAt } };
  } finally { lock.releaseLock(); }
}

function actAdminDeleteEvent_(d) {
  requireMaster_(d);
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ev = getEvent_(d.event, true);
    if (String(d.confirmName || '').trim() !== ev.name) throw err_('Nama konfirmasi tidak cocok.', 'BAD_REQUEST');
    const ss = ss_();
    const sh = ss.getSheetByName(ev.sheetName);
    if (sh) ss.deleteSheet(sh);
    try { DriveApp.getFolderById(ev.folderId).setTrashed(true); } catch (e) { /* folder sudah tidak ada */ }
    ss.getSheetByName(EVENTS_SHEET).deleteRow(findEventRow_(ev.slug));
    clearCache_(); clearRowsCache_(ev);
    return {};
  } finally { lock.releaseLock(); }
}

function actAdminSaveSettings_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ev = getEvent_(d.event, true);
    const role = requireAdmin_(d, ev);
    const cur = ev.settings;
    const inp = d.settings || {};
    const next = {
      eventSubtitle: cleanText_(pick_(inp.eventSubtitle, cur.eventSubtitle), 80),
      eventDate: /^\d{4}-\d{2}-\d{2}$/.test(String(pick_(inp.eventDate, cur.eventDate))) ? String(pick_(inp.eventDate, cur.eventDate)) : '',
      cameraOpen: bool_(pick_(inp.cameraOpen, cur.cameraOpen)),
      shotsPerGuest: clamp_(pick_(inp.shotsPerGuest, cur.shotsPerGuest), 1, 999),
      allowVideo: bool_(pick_(inp.allowVideo, cur.allowVideo)),
      maxVideoSeconds: clamp_(pick_(inp.maxVideoSeconds, cur.maxVideoSeconds), 5, 3600),     // TOTAL detik video per tamu
      allowLibrary: bool_(pick_(inp.allowLibrary, cur.allowLibrary)),
      albumMode: pick_(inp.albumMode, cur.albumMode) === 'live' ? 'live' : 'reveal',
      revealAt: cur.revealAt,
      guestsSeeOwn: bool_(pick_(inp.guestsSeeOwn, cur.guestsSeeOwn)),
      dateStamp: bool_(pick_(inp.dateStamp, cur.dateStamp)),
      coverFileId: cur.coverFileId || '',
      clientPin: cur.clientPin || ''
    };
    if (inp.revealAt) {
      const t = new Date(inp.revealAt);
      if (isNaN(t.getTime())) throw err_('Waktu album dibuka tidak valid.', 'BAD_REQUEST');
      next.revealAt = t.toISOString();
    }
    if (role === 'master' && inp.clientPin !== undefined) {
      const p = String(inp.clientPin || '').trim().slice(0, 40);
      if (p && p.length < 4) throw err_('PIN klien minimal 4 karakter.', 'BAD_REQUEST');
      if (p && p === ADMIN_PIN) throw err_('PIN klien tidak boleh sama dengan PIN utama.', 'BAD_REQUEST');
      next.clientPin = p;
    }

    const ss = ss_();
    const evSheet = ss.getSheetByName(EVENTS_SHEET);
    const rowNo = findEventRow_(ev.slug);
    let name = ev.name;

    // ganti nama event => tab & folder ikut berganti nama (link/QR tetap)
    if (role === 'master' && inp.name !== undefined) {
      const want = tabName_(inp.name);
      if (want && want !== ev.name) {
        const clash = ss.getSheetByName(want) || readEvents_(true).some(function (e) { return e.slug !== ev.slug && e.name.toLowerCase() === want.toLowerCase(); });
        if (clash) throw err_('Nama "' + want + '" sudah dipakai event/tab lain.', 'BAD_REQUEST');
        const sh = ss.getSheetByName(ev.sheetName);
        if (sh) sh.setName(want);
        try { DriveApp.getFolderById(ev.folderId).setName(want); } catch (e) { /* abaikan */ }
        evSheet.getRange(rowNo, 2).setValue(want);
        evSheet.getRange(rowNo, 4).setValue(want);
        name = want;
      }
    }
    evSheet.getRange(rowNo, 5).setValue(JSON.stringify(next));
    clearCache_(); clearRowsCache_(ev);
    const saved = { slug: ev.slug, name: name, settings: next };
    return { settings: role === 'master' ? fullSettings_(saved) : publicSettings_(saved), revealed: isRevealed_(next) };
  } finally { lock.releaseLock(); }
}

// Pasang foto sampul (file sudah di-upload ke folder event lewat tiket source:'cover')
function actAdminSetCover_(d) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const ev = getEvent_(d.event, true);
    requireAdmin_(d, ev);
    const fileId = cleanId_(d.fileId);
    if (fileId) {
      const f = fileInFolder_(fileId, ev.folderId);
      if (String(f.getMimeType()).indexOf('image/') !== 0) throw err_('Foto sampul harus berupa gambar.', 'BAD_REQUEST');
    }
    const old = ev.settings.coverFileId;
    if (old && old !== fileId) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) { /* abaikan */ } }
    ev.settings.coverFileId = fileId;
    ss_().getSheetByName(EVENTS_SHEET).getRange(findEventRow_(ev.slug), 5).setValue(JSON.stringify(ev.settings));
    clearCache_();
    return { coverFileId: fileId };
  } finally { lock.releaseLock(); }
}

function actAdminSetHidden_(d) {
  const ev = getEvent_(d.event);
  requireAdmin_(d, ev);
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = eventSheet_(ev);
    const rowNo = findRow_(sh, d.id);
    sh.getRange(rowNo, HEADERS.indexOf('hidden') + 1).setValue(String(!!d.hidden));
    const dev = String(sh.getRange(rowNo, HEADERS.indexOf('deviceId') + 1).getValue());
    touched_(ev, dev);
    return {};
  } finally { lock.releaseLock(); }
}

function actAdminDelete_(d) {
  const ev = getEvent_(d.event);
  requireAdmin_(d, ev);
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = eventSheet_(ev);
    const rowNo = findRow_(sh, d.id);
    const row = sh.getRange(rowNo, 1, 1, HEADERS.length).getValues()[0];
    try { DriveApp.getFileById(String(row[HEADERS.indexOf('fileId')])).setTrashed(true); } catch (e) { /* file sudah tidak ada */ }
    sh.deleteRow(rowNo);
    touched_(ev, String(row[HEADERS.indexOf('deviceId')]));
    return {};
  } finally { lock.releaseLock(); }
}
// Setelah admin mengubah/menghapus baris: buang cache terkait dan naikkan nomor versi daftar
function touched_(ev, deviceId) {
  const cache = CacheService.getScriptCache();
  cache.remove('n_' + ev.slug);
  if (deviceId) cache.remove('d_' + ev.slug + '_' + deviceId);
  const v = String(Date.now());
  PropertiesService.getScriptProperties().setProperty('v_' + ev.slug, v);
  cache.put('v_' + ev.slug, v, CACHE_LONG);
}

// Statistik lengkap untuk dashboard (membaca seluruh tab; hanya dipanggil admin)
function actAdminStats_(d) {
  const ev = getEvent_(d.event);
  requireAdmin_(d, ev);
  const rows = readRange_(eventSheet_(ev), 1, 1e9);
  const g = {};
  let photos = 0, videos = 0, bytes = 0, hidden = 0, seconds = 0;
  rows.forEach(function (r) {
    if (r.type === 'video') { videos++; seconds += r.duration; } else photos++;
    bytes += r.size; if (r.hidden) hidden++;
    const k = r.deviceId || r.guest;
    const o = g[k] || (g[k] = { name: r.guest, n: 0, sec: 0 });
    o.n++; o.name = r.guest || o.name; if (r.type === 'video') o.sec += r.duration;
  });
  const list = Object.keys(g).map(function (k) { return g[k]; }).sort(function (x, y) { return y.n - x.n; });
  return { counts: { photos: photos, videos: videos, guests: list.length, bytes: bytes, hidden: hidden, videoSeconds: Math.round(seconds) }, guests: list.slice(0, 100) };
}

/* ------------------------------------------------------------
 *  PEMBANTU
 * ------------------------------------------------------------ */
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function err_(message, code) { const e = new Error(message); e.code = code; return e; }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
// ID Sheet & folder induk disimpan di cache: Properties punya jatah baca 50.000/hari, jadi jangan dibaca di setiap permintaan
function ids_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('ids');
  if (hit) { try { const o = JSON.parse(hit); if (o.sheet && o.folder) return o; } catch (e) { /* baca ulang */ } }
  const o = { sheet: prop_('SHEET_ID'), folder: prop_('FOLDER_ID') };
  if (o.sheet && o.folder) cache.put('ids', JSON.stringify(o), CACHE_LONG);
  return o;
}
let SS_ = null;
function ss_() { return SS_ || (SS_ = SpreadsheetApp.openById(ids_().sheet)); }
function isReady_() { const o = ids_(); return !!(o.sheet && o.folder); }

/* ---------- event ---------- */
function readEvents_(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) {
    const hit = cache.get('events');
    if (hit) { try { return JSON.parse(hit); } catch (e) { /* abaikan */ } }
  }
  const sh = ss_().getSheetByName(EVENTS_SHEET);
  const last = sh.getLastRow();
  const out = [];
  if (last >= 2) {
    const values = sh.getRange(2, 1, last - 1, EVENT_HEADERS.length).getValues();
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (!v[0]) continue;
      let saved = {};
      try { saved = JSON.parse(String(v[4] || '{}')); } catch (e) { saved = {}; }
      const s = {};
      Object.keys(DEFAULT_SETTINGS).forEach(function (k) { s[k] = saved[k] === undefined ? DEFAULT_SETTINGS[k] : saved[k]; });
      out.push({ slug: String(v[0]), name: String(v[1]), folderId: String(v[2]), sheetName: String(v[3]), settings: s,
        createdAt: (v[5] instanceof Date) ? v[5].toISOString() : String(v[5]) });
    }
  }
  try { const str = JSON.stringify(out); if (str.length < 95000) cache.put('events', str, 300); } catch (e) { /* abaikan */ }
  return out;
}
function getEvent_(slug, fresh) {
  slug = slugify_(slug);
  if (!slug) throw err_('Link tidak lengkap: kode event tidak ada. Scan ulang QR dari mempelai.', 'NO_EVENT');
  const list = readEvents_(fresh);
  for (let i = 0; i < list.length; i++) if (list[i].slug === slug) return list[i];
  throw err_('Event tidak ditemukan. Mungkin sudah dihapus atau link-nya salah.', 'NO_EVENT');
}
function findEventRow_(slug) {
  const sh = ss_().getSheetByName(EVENTS_SHEET);
  const last = sh.getLastRow();
  if (last >= 2) {
    const v = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < v.length; i++) if (String(v[i][0]) === slug) return i + 2;
  }
  throw err_('Event tidak ditemukan.', 'NO_EVENT');
}
function eventSheet_(ev) {
  const sh = ss_().getSheetByName(ev.sheetName);
  if (!sh) throw err_('Tab "' + ev.sheetName + '" tidak ada di Sheet. Jangan mengganti nama tab secara manual.', 'NO_EVENT');
  return sh;
}
function publicSettings_(ev) {
  const s = {};
  Object.keys(ev.settings).forEach(function (k) { if (k !== 'clientPin') s[k] = ev.settings[k]; });
  s.eventTitle = ev.name;
  s.slug = ev.slug;
  return s;
}
function fullSettings_(ev) { const s = publicSettings_(ev); s.clientPin = ev.settings.clientPin || ''; return s; }
function isRevealed_(s) {
  if (s.albumMode === 'live') return true;
  const t = new Date(s.revealAt).getTime();
  return !isNaN(t) && Date.now() >= t;
}

/* ---------- hak akses ---------- */
function isMaster_(d) { return ADMIN_PIN !== 'GANTI-PIN-INI' && typeof d.pin === 'string' && d.pin.length > 0 && d.pin === ADMIN_PIN; }
function role_(d, ev) {
  if (isMaster_(d)) return 'master';
  const cp = ev && ev.settings && ev.settings.clientPin;
  if (cp && typeof d.pin === 'string' && d.pin === cp) return 'event';
  return null;
}
function requireMaster_(d) {
  if (ADMIN_PIN === 'GANTI-PIN-INI') throw err_('ADMIN_PIN di Code.gs belum diganti.', 'AUTH');
  if (!isMaster_(d)) { Utilities.sleep(800); throw err_('Butuh PIN utama.', 'AUTH'); }
}
function requireAdmin_(d, ev) {
  const r = role_(d, ev);
  if (!r) { Utilities.sleep(800); throw err_('PIN salah.', 'AUTH'); }
  return r;
}

/* ---------- baris kiriman ---------- */
// Baca `count` baris mulai baris data ke-`start` (1 = kiriman pertama). Tiap hasil membawa nomor barisnya.
function readRange_(sh, start, count) {
  const last = sh.getLastRow() - 1;
  start = Math.max(1, start);
  count = Math.min(count, last - start + 1);
  const rows = [];
  if (count <= 0) return rows;
  const values = sh.getRange(start + 1, 1, count, HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!v[0]) continue;
    const r = { row: start + i };
    for (let c = 0; c < HEADERS.length; c++) r[HEADERS[c]] = v[c];
    r.id = String(r.id); r.fileId = String(r.fileId); r.deviceId = String(r.deviceId);
    r.guest = String(r.guest); r.caption = String(r.caption || ''); r.type = String(r.type);
    r.source = String(r.source); r.mime = String(r.mime);
    r.size = Number(r.size) || 0; r.duration = Number(r.duration) || 0;
    r.hidden = String(r.hidden).toLowerCase() === 'true';
    r.createdAt = (r.createdAt instanceof Date) ? r.createdAt.toISOString() : String(r.createdAt);
    rows.push(r);
  }
  return rows;
}
// Jumlah kiriman di event (cache 20 detik, jadi penyegaran album oleh ribuan tamu tidak membuka Sheet)
function total_(ev) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('n_' + ev.slug);
  if (hit !== null && hit !== undefined && hit !== '') return Number(hit) || 0;
  const n = Math.max(0, eventSheet_(ev).getLastRow() - 1);
  cache.put('n_' + ev.slug, String(n), 20);
  return n;
}
function version_(ev) {
  const cache = CacheService.getScriptCache();
  let v = cache.get('v_' + ev.slug);
  if (!v) { v = prop_('v_' + ev.slug) || '0'; cache.put('v_' + ev.slug, v, CACHE_LONG); }
  return v;
}
function clearRowsCache_(ev) { CacheService.getScriptCache().remove('n_' + ev.slug); }
function clearCache_() { CacheService.getScriptCache().remove('events'); }
function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  }
  throw err_('Data tidak ditemukan.', 'BAD_REQUEST');
}
function fileInFolder_(fileId, folderId) {
  let file;
  try { file = DriveApp.getFileById(fileId); } catch (e) { throw err_('File tidak ditemukan di Drive.', 'BAD_REQUEST'); }
  const parents = file.getParents();
  while (parents.hasNext()) { if (parents.next().getId() === folderId) return file; }
  throw err_('File bukan milik event ini.', 'BAD_REQUEST');
}
/* ---------- pembersih teks ---------- */
function cleanId_(v) { return String(v || '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 80); }
// Buang karakter kontrol & awalan rumus (= + - @) supaya aman saat masuk Sheet
function cleanText_(v, max) {
  return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/^[\s=+\-@]+/, '').trim().slice(0, max);
}
// Nama tab Sheet: tidak boleh memuat : \ / ? * [ ]
function tabName_(v) { return cleanText_(v, 60).replace(/[:\\\/?*\[\]]/g, ' ').replace(/\s+/g, ' ').trim(); }
function slugify_(v) {
  return String(v || '').toLowerCase().replace(/&/g, ' dan ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}
function safeName_(v) { return cleanText_(v, 24).replace(/[^A-Za-z0-9 ]/g, '').trim().replace(/\s+/g, '-'); }
function extFor_(mime) {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv', 'video/3gpp': '3gp' };
  return map[mime] || (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
}
function pick_(a, b) { return a === undefined || a === null ? b : a; }
function bool_(v) { return v === true || v === 'true'; }
function clamp_(v, lo, hi) { const n = Math.round(Number(v)); return isNaN(n) ? lo : Math.max(lo, Math.min(hi, n)); }