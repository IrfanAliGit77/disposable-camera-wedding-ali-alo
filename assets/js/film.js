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

  /* ============================================================
     FILTER UNTUK VIDEO
     Tiap bingkai kamera digambar ulang lewat WebGL (kartu grafis HP)
     dengan rumus warna yang sama seperti foto, lalu hasilnya yang direkam.
     Mengembalikan null kalau HP tidak mendukung (video direkam polos).
     ============================================================ */
  const VS = 'attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
  const FS = [
    'precision mediump float;',
    'varying vec2 v;',
    'uniform sampler2D uTex, uStamp;',
    'uniform vec4 uCrop;',                       // x, y, lebar, tinggi bagian sumber yang dipakai (0..1)
    'uniform vec3 uMul, uAdd, uTint;',
    'uniform float uContrast, uLift, uSat, uMono, uVig, uGrain, uTime, uHasStamp;',
    'void main(){',
    '  vec3 c = texture2D(uTex, uCrop.xy + v * uCrop.zw).rgb;',
    '  vec3 s = c * c * (3.0 - 2.0 * c);',
    '  c = uLift + mix(c, s, uContrast) * (1.0 - uLift);',
    '  c = clamp(c * uMul + uAdd, 0.0, 1.0);',
    '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
    '  c = uMono > 0.5 ? l * uTint : mix(vec3(l), c, uSat);',
    '  float d = distance(v, vec2(0.5)) / 0.7071;',
    '  c = mix(c, vec3(0.078, 0.047, 0.0), smoothstep(0.45, 1.0, d) * uVig);',
    '  float n = fract(sin(dot(v * 917.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;',
    '  c += n * uGrain;',
    '  if (uHasStamp > 0.5) { vec4 st = texture2D(uStamp, v); c = mix(c, st.rgb, st.a); }',
    '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  Film.createVideoFilter = function (video, opts) {
    opts = opts || {};
    try {
      const sw = video.videoWidth, sh = video.videoHeight;
      if (!sw || !sh) return null;
      const ratio = 3 / 4;
      let cw = sw, ch = sh;
      if (cw / ch > ratio) cw = ch * ratio; else ch = cw / ratio;
      const H = Math.min(960, Math.round(ch)), W = Math.round(H * ratio);     // 720x960: ringan dan tetap tajam di HP

      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      if (!canvas.captureStream) return null;
      const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, alpha: false, antialias: false }) ||
                 canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true, alpha: false });
      if (!gl) return null;

      const sh1 = function (type, src) {
        const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
        return o;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh1(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh1(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const U = function (n) { return gl.getUniformLocation(prog, n); };
      const tex = function (unit) {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return t;
      };
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      const tVideo = tex(0);
      gl.uniform1i(U('uTex'), 0); gl.uniform1i(U('uStamp'), 1);
      gl.uniform4f(U('uCrop'), (sw - cw) / 2 / sw, (sh - ch) / 2 / sh, cw / sw, ch / sh);
      gl.viewport(0, 0, W, H);

      // cap tanggal: digambar sekali di canvas biasa, lalu ditempel di tiap bingkai
      let hasStamp = false;
      if (opts.stamp !== false) {
        const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
        const c2 = sc.getContext('2d'), size = Math.round(Math.min(W, H) * 0.042);
        c2.font = '700 ' + size + 'px "Courier New", Courier, monospace';
        c2.textAlign = 'right'; c2.shadowColor = 'rgba(255,110,20,0.9)'; c2.shadowBlur = size * 0.35; c2.fillStyle = '#ffb347';
        c2.fillText(Film.dateText(opts.date), W - size * 1.1, H - size * 1.1);
        tex(1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sc);
        hasStamp = true;
      }
      gl.uniform1f(U('uHasStamp'), hasStamp ? 1 : 0);

      const api = { canvas: canvas, running: false };
      api.setFilter = function (id) {
        const f = Film.get(id);
        gl.uniform3f(U('uMul'), f.r[0], f.g[0], f.b[0]);
        gl.uniform3f(U('uAdd'), f.r[1], f.g[1], f.b[1]);
        const t = f.tint || [1, 1, 1];
        gl.uniform3f(U('uTint'), t[0], t[1], t[2]);
        gl.uniform1f(U('uContrast'), f.contrast); gl.uniform1f(U('uLift'), f.lift);
        gl.uniform1f(U('uSat'), f.sat); gl.uniform1f(U('uMono'), f.sat === 0 ? 1 : 0);
        gl.uniform1f(U('uVig'), f.vignette); gl.uniform1f(U('uGrain'), f.grain / 255);
      };
      api.setFilter(opts.filter);
      const uTime = U('uTime');
      api.draw = function () {
        if (video.readyState < 2) return;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tVideo);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.uniform1f(uTime, (performance.now() % 1000) / 37.0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      let raf = 0;
      const loop = function () { if (!api.running) return; api.draw(); raf = requestAnimationFrame(loop); };
      api.start = function () { api.running = true; api.draw(); loop(); };
      api.stop = function () {
        api.running = false; cancelAnimationFrame(raf);
        const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
      };
      api.draw();
      if (gl.getError() !== gl.NO_ERROR) return null;
      api.stream = canvas.captureStream(30);
      return api;
    } catch (e) { return null; }
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