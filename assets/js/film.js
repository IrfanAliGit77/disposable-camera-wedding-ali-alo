/* ============================================================
   film.js — efek kamera disposable (100% di HP tamu)
   Beberapa pilihan filter; "klasik" adalah bawaan.
   Tiap filter = kurva kontras + warna + grain + vignette
   + (kadang) bocoran cahaya + cap tanggal oranye.
   ============================================================ */
(function () {
  'use strict';
  const Film = (window.WCFilm = {});

  /* ---------- daftar filter ----------
     contrast : 0..1  seberapa kuat kurva S
     lift     : hitam diangkat (kesan pudar)
     r,g,b    : [pengali, tambahan] per kanal warna
     sat      : saturasi (0 = hitam putih)
     tint     : pengali warna setelah jadi hitam putih (untuk sepia)
     css      : pendekatan efek untuk layar pratinjau                      */
  Film.FILTERS = [
    { id: 'klasik', name: 'Klasik', dot: '#c98a4b', contrast: 0.38, lift: 0.035, r: [1.05, 0.012], g: [1.0, 0.004], b: [0.9, 0.022], sat: 1.14, grain: 20, vignette: 0.42, leak: 0.3,
      css: 'contrast(1.06) saturate(1.14) sepia(0.14) brightness(1.03)' },
    { id: 'bw', name: 'Hitam Putih', dot: '#9a9a9a', contrast: 0.5, lift: 0.03, r: [1, 0], g: [1, 0], b: [1, 0], sat: 0, grain: 26, vignette: 0.45, leak: 0,
      css: 'grayscale(1) contrast(1.15)' },
    { id: 'noir', name: 'Noir', dot: '#2b2b2b', contrast: 0.95, lift: 0, r: [1.02, -0.02], g: [1.02, -0.02], b: [1.02, -0.02], sat: 0, grain: 32, vignette: 0.62, leak: 0,
      css: 'grayscale(1) contrast(1.5) brightness(0.94)' },
    { id: 'sepia', name: 'Sepia', dot: '#a67c52', contrast: 0.35, lift: 0.05, r: [1, 0], g: [1, 0], b: [1, 0], sat: 0, tint: [1.1, 0.95, 0.76], grain: 22, vignette: 0.48, leak: 0.15,
      css: 'sepia(0.9) contrast(1.05) saturate(0.9)' },
    { id: 'senja', name: 'Senja', dot: '#e39a3f', contrast: 0.4, lift: 0.03, r: [1.12, 0.02], g: [1.02, 0.005], b: [0.78, 0.0], sat: 1.22, grain: 18, vignette: 0.4, leak: 0.55,
      css: 'sepia(0.32) saturate(1.4) contrast(1.06) brightness(1.04) hue-rotate(-8deg)' },
    { id: 'sejuk', name: 'Sejuk', dot: '#6fa3b8', contrast: 0.36, lift: 0.045, r: [0.93, 0.0], g: [1.01, 0.012], b: [1.07, 0.02], sat: 1.04, grain: 18, vignette: 0.36, leak: 0,
      css: 'saturate(1.05) contrast(1.05) hue-rotate(10deg) brightness(1.02)' },
    { id: 'pudar', name: 'Pudar', dot: '#cbbfae', contrast: 0.08, lift: 0.1, r: [0.98, 0.02], g: [0.97, 0.02], b: [0.93, 0.035], sat: 0.8, grain: 16, vignette: 0.25, leak: 0.2,
      css: 'contrast(0.86) saturate(0.8) brightness(1.08) sepia(0.1)' },
    { id: 'cerah', name: 'Cerah', dot: '#4fae6a', contrast: 0.55, lift: 0.0, r: [1.03, 0.0], g: [1.02, 0.0], b: [1.0, 0.0], sat: 1.38, grain: 10, vignette: 0.22, leak: 0,
      css: 'saturate(1.42) contrast(1.12)' }
  ];
  Film.get = function (id) {
    for (let i = 0; i < Film.FILTERS.length; i++) if (Film.FILTERS[i].id === id) return Film.FILTERS[i];
    return Film.FILTERS[0];
  };

  /* ---------- tabel warna (dibuat sekali per filter) ---------- */
  const lutCache = {};
  function luts(f) {
    if (lutCache[f.id]) return lutCache[f.id];
    const make = function (ch) {
      const t = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) {
        const x = i / 255;
        const s = x * x * (3 - 2 * x);                           // kurva S
        const y = f.lift + (x * (1 - f.contrast) + s * f.contrast) * (1 - f.lift);
        t[i] = Math.round(Math.max(0, Math.min(1, y * ch[0] + ch[1])) * 255);
      }
      return t;
    };
    return (lutCache[f.id] = { r: make(f.r), g: make(f.g), b: make(f.b) });
  }

  Film.dateText = function (d) {
    d = d || new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getDate()) + ' ' + p(d.getMonth() + 1) + " '" + String(d.getFullYear()).slice(2);
  };

  /**
   * Terapkan efek ke canvas (langsung mengubah isinya).
   * opts: { filter: 'klasik'|'bw'|..., stamp: boolean, date: Date, leak: boolean|undefined }
   */
  Film.apply = function (canvas, opts) {
    opts = opts || {};
    const f = Film.get(opts.filter);
    const L = luts(f);
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 1) warna + grain, piksel demi piksel
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const sat = f.sat, grain = f.grain, tint = f.tint || null, mono = sat === 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = L.r[d[i]], g = L.g[d[i + 1]], b = L.b[d[i + 2]];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const n = (Math.random() - 0.5) * grain;
      if (mono) {
        if (tint) { d[i] = l * tint[0] + n; d[i + 1] = l * tint[1] + n; d[i + 2] = l * tint[2] + n; }
        else { d[i] = d[i + 1] = d[i + 2] = l + n; }
      } else {
        d[i] = l + (r - l) * sat + n;
        d[i + 1] = l + (g - l) * sat + n;
        d[i + 2] = l + (b - l) * sat + n;
      }
    }
    ctx.putImageData(img, 0, 0);

    // 2) vignette (pinggir menggelap)
    if (f.vignette > 0) {
      const rad = Math.sqrt(w * w + h * h) / 2;
      const vg = ctx.createRadialGradient(w / 2, h / 2, rad * 0.45, w / 2, h / 2, rad);
      vg.addColorStop(0, 'rgba(20,12,0,0)');
      vg.addColorStop(1, 'rgba(20,12,0,' + f.vignette + ')');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    // 3) bocoran cahaya (kadang-kadang saja, seperti film asli)
    const leak = opts.leak === undefined ? Math.random() < f.leak : opts.leak;
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