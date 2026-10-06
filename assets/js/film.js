/* ============================================================
   film.js — efek kamera disposable (100% di HP tamu)
   Tone hangat + kontras film + grain + vignette + bocoran cahaya
   + cap tanggal oranye di pojok.
   ============================================================ */
(function () {
  'use strict';
  const Film = (window.WCFilm = {});

  function lut(fn) {
    const t = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) t[i] = Math.round(Math.max(0, Math.min(1, fn(i / 255))) * 255);
    return t;
  }
  // kurva S lembut + hitam sedikit "pudar" seperti cetakan film
  function curve(x) {
    const s = x * x * (3 - 2 * x);
    const y = x * 0.62 + s * 0.38;
    return 0.035 + y * 0.965;
  }
  const LR = lut(function (x) { return curve(x) * 1.05 + 0.012; });   // merah naik -> hangat
  const LG = lut(function (x) { return curve(x) * 1.0 + 0.004; });
  const LB = lut(function (x) { return curve(x) * 0.9 + 0.022; });    // biru turun, bayangan sedikit kebiruan

  Film.dateText = function (d) {
    d = d || new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getDate()) + ' ' + p(d.getMonth() + 1) + " '" + String(d.getFullYear()).slice(2);
  };

  /**
   * Terapkan efek ke canvas (langsung mengubah isinya).
   * opts: { stamp: boolean, date: Date, leak: boolean|undefined }
   */
  Film.apply = function (canvas, opts) {
    opts = opts || {};
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 1) warna + grain, piksel demi piksel
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const SAT = 1.14, GRAIN = 20;
    for (let i = 0; i < d.length; i += 4) {
      let r = LR[d[i]], g = LG[d[i + 1]], b = LB[d[i + 2]];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const n = (Math.random() - 0.5) * GRAIN;
      d[i] = l + (r - l) * SAT + n;
      d[i + 1] = l + (g - l) * SAT + n;
      d[i + 2] = l + (b - l) * SAT + n;
    }
    ctx.putImageData(img, 0, 0);

    // 2) vignette (pinggir menggelap)
    const rad = Math.sqrt(w * w + h * h) / 2;
    const vg = ctx.createRadialGradient(w / 2, h / 2, rad * 0.45, w / 2, h / 2, rad);
    vg.addColorStop(0, 'rgba(20,12,0,0)');
    vg.addColorStop(1, 'rgba(20,12,0,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // 3) bocoran cahaya (kadang-kadang saja, seperti film asli)
    const leak = opts.leak === undefined ? Math.random() < 0.3 : opts.leak;
    if (leak) {
      const fromLeft = Math.random() < 0.5;
      const lg = ctx.createLinearGradient(fromLeft ? 0 : w, 0, fromLeft ? w * 0.45 : w * 0.55, h * 0.3);
      lg.addColorStop(0, 'rgba(255,120,40,0.34)');
      lg.addColorStop(0.5, 'rgba(255,170,60,0.10)');
      lg.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 4) cap tanggal
    if (opts.stamp !== false) {
      const size = Math.round(Math.min(w, h) * 0.042);
      ctx.save();
      ctx.font = '700 ' + size + 'px "Courier New", Courier, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = 'rgba(255,110,20,0.9)';
      ctx.shadowBlur = size * 0.35;
      ctx.fillStyle = '#ffb347';
      ctx.fillText(Film.dateText(opts.date), w - size * 1.1, h - size * 1.1);
      ctx.restore();
    }
    return canvas;
  };

  // Gambar sumber (video / gambar) ke canvas potret 3:4, dipotong di tengah
  Film.frameToCanvas = function (source, sw, sh, opts) {
    opts = opts || {};
    const ratio = opts.ratio || 3 / 4;
    let cw = sw, ch = sh;
    if (cw / ch > ratio) cw = Math.round(ch * ratio); else ch = Math.round(cw / ratio);
    const sx = Math.round((sw - cw) / 2), sy = Math.round((sh - ch) / 2);
    const maxH = opts.maxHeight || 2000;
    const oh = Math.min(maxH, ch), ow = Math.round(oh * ratio);
    const c = document.createElement('canvas');
    c.width = ow; c.height = oh;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (opts.mirror) { ctx.translate(ow, 0); ctx.scale(-1, 1); }
    ctx.drawImage(source, sx, sy, cw, ch, 0, 0, ow, oh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);   // kembalikan arah normal supaya cap tanggal & efek tidak ikut terbalik
    return c;
  };

  // Salinan kecil (untuk tampil instan di album)
  Film.thumbBlob = function (canvas, width) {
    const w = width || 360, h = Math.round(canvas.height * (w / canvas.width));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(canvas, 0, 0, w, h);
    return Film.toBlob(c, 0.72);
  };

  Film.toBlob = function (canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { if (b) resolve(b); else reject(new Error('Gagal membuat foto.')); }, 'image/jpeg', quality || 0.9);
    });
  };
})();
