/* ============================================================
   Presque Stable — background engine
   Trabecular / cellular lattice, warm bone palette
   Shared by index.html and releases.html
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('stage');
  if (!canvas) return;
  var ctx = canvas.getContext('2d', { alpha: false });

  var REDUCED = !!(window.matchMedia &&
                   window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var W = 0, H = 0, DPR = 1;
  var TAU = Math.PI * 2;

  /* ---------- maths ---------- */
  function smoothstep(t) { t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); }
  function sstep(a, b, x) { return smoothstep((x - a) / (b - a)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand01(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function hash2i(ix, iy, s) {
    var h = Math.imul(ix, 1597334677) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 374761393);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function hash3(ix, iy, iz) {
    var h = Math.imul(ix, 1597334677) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 374761393);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, z) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var fx = smoothstep(x - ix), fy = smoothstep(y - iy), fz = smoothstep(z - iz);
    var a = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx);
    var b = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx);
    var c = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx);
    var d = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx);
    return lerp(lerp(a, b, fy), lerp(c, d, fy), fz);
  }
  function fbm2(x, y, z) {
    return 0.5 * vnoise(x, y, z) + 0.25 * vnoise(x * 2.03, y * 2.03, z * 1.4);
  }

  /* ---------- cellular (Worley) ----------
     Feature points orbit slowly, so the lattice flexes in place
     like living tissue. F2-F1 is small on a cell boundary, which
     is what draws the struts. */
  var wF1 = 0, wF2 = 0;
  function worley(x, y, t, seed) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var f1 = 1e9, f2 = 1e9;
    for (var gy = -1; gy <= 1; gy++) {
      for (var gx = -1; gx <= 1; gx++) {
        var cx = ix + gx, cy = iy + gy;
        var a = hash2i(cx, cy, seed) * TAU;
        var b = hash2i(cx, cy, seed + 977) * TAU;
        var sp = 0.35 + hash2i(cx, cy, seed + 311) * 0.65;
        var px = cx + 0.5 + 0.42 * Math.sin(a + t * sp);
        var py = cy + 0.5 + 0.42 * Math.cos(b + t * sp * 0.87);
        var dx = px - x, dy = py - y;
        var d = dx * dx + dy * dy;
        if (d < f1) { f2 = f1; f1 = d; }
        else if (d < f2) { f2 = d; }
      }
    }
    wF1 = Math.sqrt(f1);
    wF2 = Math.sqrt(f2);
    return wF2 - wF1;
  }

  /* strut mask: bright on cell walls, dark inside cells */
  function strut(x, y, t, seed, thick) {
    var e = worley(x, y, t, seed);
    return 1 - sstep(0, thick, e);
  }

  /* ---------- colour ---------- */
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  function hsl2rgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    if (s === 0) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
  }

  /* Warm bone / ivory / sand. Low saturation so it reads as bone,
     not orange. Never enters the blue half of the wheel. */
  var PALETTE = [34, 30, 26, 38, 42, 46, 36, 31];
  var ANCHOR_MS = REDUCED ? 460000 : 200000;
  function baseHue(t) {
    var p = t / ANCHOR_MS;
    var i = Math.floor(p) % PALETTE.length;
    var j = (i + 1) % PALETTE.length;
    var a = PALETTE[i], b = PALETTE[j], d = b - a;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    return (a + d * smoothstep(p - Math.floor(p)) + 360) % 360;
  }

  /* ============================================================
     TRABECULAR FIELD
     Three depth layers of warped cellular noise:
       far  — fine mesh, dim, recedes
       mid  — medium lattice
       near — heavy struts, bright, catches the light
     ============================================================ */
  var FW = 150, FH = 84;
  var fCanvas = null, fCtx = null, fImg = null;
  var strip = 0, STRIPS = 3, renderT = 0;

  function initField() {
    FH = Math.max(56, Math.round(FW * (H / Math.max(1, W))));
    fCanvas = document.createElement('canvas');
    fCanvas.width = FW; fCanvas.height = FH;
    fCtx = fCanvas.getContext('2d');
    fImg = fCtx.createImageData(FW, FH);
    var d = fImg.data;
    for (var i = 3; i < d.length; i += 4) d[i] = 255;
    for (var s = 0; s < STRIPS; s++) renderStrip(0, s);
    fCtx.putImageData(fImg, 0, 0);
  }

  function renderStrip(time, s) {
    if (!fImg) return;
    var d = fImg.data;
    var zs = REDUCED ? 0.3 : 1;

    var tw = time * 0.0000165 * zs;          /* warp evolution   */
    var tc = time * 0.0000430 * zs;          /* cell flexing     */
    var tb = time * 0.0000240 * zs + 61.3;   /* thickness breath */

    var hue = baseHue(time);
    var cDeep = hsl2rgb(hue + 6,  0.26, 0.16);   /* cavity        */
    var cMid  = hsl2rgb(hue,      0.20, 0.52);   /* strut body    */
    var cHi   = hsl2rgb(hue - 5,  0.11, 0.88);   /* lit edge      */

    var y0 = Math.floor(FH * s / STRIPS);
    var y1 = Math.floor(FH * (s + 1) / STRIPS);
    var ar = FW / FH;

    for (var y = y0; y < y1; y++) {
      var py = y / FH;
      var k = (y * FW) * 4;
      for (var x = 0; x < FW; x++) {
        var px = (x / FW) * ar;

        /* --- domain warp: bends the lattice organically --- */
        var w1 = fbm2(px * 1.6, py * 1.6, tw);
        var w2 = fbm2(px * 1.6 + 7.3, py * 1.6 + 2.1, tw);
        var ux = px + 0.62 * (w1 - 0.5);
        var uy = py + 0.62 * (w2 - 0.5);

        /* --- thickness varies across the field --- */
        var thickVar = fbm2(ux * 2.2 + 3.1, uy * 2.2 - 1.7, tb);

        /* --- far layer: fine receding mesh --- */
        var sFar = strut(ux * 15.5, uy * 15.5, tc, 11, 0.13 + thickVar * 0.05);
        var farDepth = wF1;

        /* --- mid layer --- */
        var sMid = strut(ux * 8.2 + 4.0, uy * 8.2 + 1.5, tc * 0.86, 29, 0.17 + thickVar * 0.07);

        /* --- near layer: heavy struts --- */
        var sNear = strut(ux * 4.3 + 1.7, uy * 4.3 + 6.2, tc * 0.7, 47, 0.24 + thickVar * 0.10);
        var nearCore = wF1;

        /* --- composite with depth falloff --- */
        var v = sFar * 0.26 + sMid * 0.40 + sNear * 0.78;

        /* occlusion: near struts shadow what sits behind them */
        v *= (1 - sNear * 0.30);
        v += sNear * 0.34;

        /* specular bloom along the ridge of the near struts */
        var spec = sNear * (1 - sstep(0.0, 0.34, nearCore));
        spec = spec * spec;

        /* fine surface tooth so it is never a flat gradient */
        var tooth = vnoise(ux * 46, uy * 46, tb * 2.4);
        v *= 0.90 + tooth * 0.20;

        /* slight depth haze into the cavities */
        v *= 0.82 + 0.18 * (1 - sstep(0.1, 0.5, farDepth));

        v = v < 0 ? 0 : (v > 1 ? 1 : v);
        v = v * v * (3 - 2 * v);

        /* --- three-stop ramp: cavity -> strut -> lit edge --- */
        var R, G, B;
        if (v < 0.52) {
          var u = v / 0.52;
          R = cDeep[0] + (cMid[0] - cDeep[0]) * u;
          G = cDeep[1] + (cMid[1] - cDeep[1]) * u;
          B = cDeep[2] + (cMid[2] - cDeep[2]) * u;
        } else {
          var u2 = (v - 0.52) / 0.48;
          R = cMid[0] + (cHi[0] - cMid[0]) * u2;
          G = cMid[1] + (cHi[1] - cMid[1]) * u2;
          B = cMid[2] + (cHi[2] - cMid[2]) * u2;
        }

        R += spec * 52; G += spec * 48; B += spec * 40;

        var amt = v * 0.50;
        R *= amt; G *= amt; B *= amt;
        d[k++] = R > 255 ? 255 : R;
        d[k++] = G > 255 ? 255 : G;
        d[k++] = B > 255 ? 255 : B;
        k++;
      }
    }
  }

  function drawField() {
    if (!fCanvas) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 0.96;
    ctx.drawImage(fCanvas, 0, 0, W, H);
    ctx.restore();
  }

  /* ---------- static speckle (fixed; only breathes) ---------- */
  var speck = [];
  function initSpeck() {
    speck = [];
    var n = Math.floor((W * H) / 3200);
    for (var i = 0; i < n; i++) {
      speck.push({
        x: Math.random() * W, y: Math.random() * H,
        a: 0.008 + Math.random() * Math.random() * 0.042,
        ph: Math.random() * TAU,
        sp: 0.00018 + Math.random() * 0.00040
      });
    }
  }
  function drawSpeck(time) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgb(238,228,212)';
    for (var i = 0; i < speck.length; i++) {
      var p = speck[i];
      ctx.globalAlpha = p.a * (0.55 + 0.45 * Math.sin(time * p.sp + p.ph));
      ctx.fillRect(p.x, p.y, 1, 1);
    }
    ctx.restore();
  }

  /* ---------- warm washes ---------- */
  function ColorWash(seed) {
    this.hueOffset = (seed % 4) * 7 - 10;
    this.radius = Math.max(W, H) * (0.36 + (seed % 4) * 0.13);
    this.orbitR = Math.min(W, H) * (0.15 + (seed % 3) * 0.16);
    this.orbitSpeed = (0.000028 + (seed % 5) * 0.000013) * (REDUCED ? 0.3 : 1);
    this.phase = seed * 1.7;
    this.wobble = 0.55 + (seed % 3) * 0.2;
    this.alpha = 0.024 + (seed % 3) * 0.008;
  }
  ColorWash.prototype.draw = function (t) {
    var hue = (baseHue(t) + this.hueOffset) % 360;
    var ang = t * this.orbitSpeed + this.phase;
    var cx = W * 0.5 + Math.cos(ang) * this.orbitR;
    var cy = H * 0.5 + Math.sin(ang * this.wobble) * this.orbitR * 0.75;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.radius);
    var h = hue.toFixed(1);
    g.addColorStop(0, 'hsla(' + h + ', 34%, 48%, ' + this.alpha.toFixed(4) + ')');
    g.addColorStop(0.55, 'hsla(' + h + ', 34%, 40%, ' + (this.alpha * 0.4).toFixed(4) + ')');
    g.addColorStop(1, 'hsla(' + h + ', 34%, 34%, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  var washes = [];
  function initWashes() {
    washes = [];
    for (var i = 0; i < 5; i++) washes.push(new ColorWash(i * 2.3 + 1));
  }

  /* ---------- waveforms ---------- */
  var WAVE_TYPES = ['sine', 'triangle', 'saw', 'ramp', 'square', 'pulse', 'sh'];
  function waveValue(type, phase, seed) {
    var p = ((phase % TAU) + TAU) % TAU;
    var u = p / TAU;
    switch (type) {
      case 'sine':     return Math.sin(p);
      case 'triangle': return 4 * Math.abs(u - 0.5) - 1;
      case 'saw':      return 1 - 2 * u;
      case 'ramp':     return 2 * u - 1;
      case 'square':   return u < 0.5 ? 1 : -1;
      case 'pulse':    return u < 0.22 ? 1 : -1;
      case 'sh':       return rand01(seed * 131.7 + Math.floor(phase / TAU) * 17.3) * 2 - 1;
    }
    return 0;
  }

  /* ---------- traces ---------- */
  function Trace(i) {
    this.seed = i * 7.3 + 1.7;
    this.t = i * 11;
    this.points = [];
    this.maxPoints = 720;
    this.lineWidth = 1.05 + (i % 3) * 0.32;
    this.hueOffset = i * 6 - 8;
    this.cur = this.randParams(this.seed);
    this.tgt = this.randParams(this.seed + 13);
    this.morphEvery = 26000 + i * 5200;
    this.lastMorph = 0;
    this.mode = 'wander';
    this.wave = null;
    this.forcedType = null;
    this.nextWaveAt = 7000 + Math.random() * 38000 + i * 6500;
  }
  Trace.prototype.randParams = function (s) {
    var r = function (n) { return rand01(s * 17.3 + n * 5.11); };
    return {
      fx: 0.6 + r(1) * 2.2,
      fy: 0.45 + r(2) * 1.9,
      scale: Math.min(W, H) * (0.10 + r(3) * 0.26),
      cx: W * (0.12 + r(4) * 0.76),
      cy: H * (0.14 + r(5) * 0.70),
      speed: (0.0016 + r(6) * 0.0032) * (REDUCED ? 0.4 : 1)
    };
  };
  Trace.prototype.lerpParams = function (a, b, u) {
    return {
      fx: lerp(a.fx, b.fx, u), fy: lerp(a.fy, b.fy, u),
      scale: lerp(a.scale, b.scale, u),
      cx: lerp(a.cx, b.cx, u), cy: lerp(a.cy, b.cy, u),
      speed: lerp(a.speed, b.speed, u)
    };
  };
  Trace.prototype.schedule = function (time) {
    this.nextWaveAt = time + 26000 + Math.random() * 44000;
  };
  Trace.prototype.startWave = function (time, type) {
    type = type || this.forcedType || WAVE_TYPES[(Math.random() * WAVE_TYPES.length) | 0];
    this.forcedType = null;
    this.mode = 'wave';
    this.wave = {
      type: type, start: time,
      dur: 6000 + Math.random() * 4200,
      cycles: 3 + ((Math.random() * 6) | 0),
      amp: H * (0.042 + Math.random() * 0.085),
      baseY: H * (0.15 + Math.random() * 0.70)
    };
    maybeBuddy(this, time, type);
  };
  Trace.prototype.update = function (time, dt) {
    if (time - this.lastMorph > this.morphEvery) {
      this.cur = this.lerpParams(this.cur, this.tgt, 1);
      this.tgt = this.randParams(this.seed + time * 0.001);
      this.lastMorph = time;
    }
    if (this.mode === 'wander' && !REDUCED && time >= this.nextWaveAt) this.startWave(time);
    var sub = (this.mode === 'wave') ? 3 : 1;
    for (var s = 1; s <= sub; s++) this.sample(time - dt + dt * s / sub, dt / sub);
    if (this.points.length > this.maxPoints + 64) {
      this.points.splice(0, this.points.length - this.maxPoints);
    }
  };
  Trace.prototype.sample = function (time, sdt) {
    var mu = smoothstep(Math.min(1, (time - this.lastMorph) / this.morphEvery));
    var p = this.lerpParams(this.cur, this.tgt, mu);
    this.t += p.speed * (sdt / 16.667);
    var wx = p.cx + p.scale * Math.sin(p.fx * this.t);
    var wy = p.cy + p.scale * 0.62 * Math.sin(p.fy * this.t + Math.PI / 3);
    var x = wx, y = wy;
    if (this.mode === 'wave') {
      var w = this.wave;
      var uu = (time - w.start) / w.dur;
      if (uu >= 1) {
        this.mode = 'wander'; this.wave = null; this.schedule(time);
      } else {
        var qx = -0.12 * W + uu * 1.24 * W;
        var qy = w.baseY + w.amp * waveValue(w.type, uu * w.cycles * TAU, this.seed);
        var edge = smoothstep(Math.min(uu / 0.12, (1 - uu) / 0.12));
        x = lerp(wx, qx, edge);
        y = lerp(wy, qy, edge);
      }
    }
    this.points.push({ x: x, y: y });
  };
  Trace.prototype.draw = function (time) {
    var pts = this.points;
    if (pts.length < 3) return;
    var hue = (baseHue(time) + this.hueOffset) % 360;
    var BANDS = 14;
    var per = Math.max(2, Math.floor(pts.length / BANDS));
    var boost = (this.mode === 'wave') ? 1.6 : 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    /* dark underdraw keeps the line readable over bright struts */
    for (var b = 0; b < BANDS; b++) {
      var s0 = b * per;
      var e0 = (b === BANDS - 1) ? pts.length : Math.min(pts.length, s0 + per + 1);
      if (e0 - s0 < 2) continue;
      var k0 = (b + 1) / BANDS;
      ctx.beginPath();
      ctx.moveTo(pts[s0].x, pts[s0].y);
      for (var i0 = s0 + 1; i0 < e0; i0++) ctx.lineTo(pts[i0].x, pts[i0].y);
      ctx.strokeStyle = 'rgba(18,12,7,' + (0.030 + 0.115 * k0 * k0 * boost).toFixed(4) + ')';
      ctx.lineWidth = this.lineWidth * (0.7 + 0.55 * k0) + 2.4;
      ctx.stroke();
    }
    /* bright core */
    for (var b2 = 0; b2 < BANDS; b2++) {
      var s = b2 * per;
      var e = (b2 === BANDS - 1) ? pts.length : Math.min(pts.length, s + per + 1);
      if (e - s < 2) continue;
      var k = (b2 + 1) / BANDS;
      var a = 0.030 + 0.210 * k * k * boost;
      ctx.beginPath();
      ctx.moveTo(pts[s].x, pts[s].y);
      for (var i = s + 1; i < e; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = 'hsla(' + hue.toFixed(1) + ', 30%, 93%, ' + a.toFixed(4) + ')';
      ctx.lineWidth = this.lineWidth * (0.7 + 0.55 * k);
      ctx.stroke();
    }
  };

  var traces = [];
  function initTraces() {
    traces = [];
    for (var i = 0; i < 5; i++) traces.push(new Trace(i + 1));
  }
  function maybeBuddy(origin, time, type) {
    if (Math.random() > 0.55) return;
    var pool = [];
    for (var i = 0; i < traces.length; i++) {
      if (traces[i] !== origin && traces[i].mode === 'wander') pool.push(traces[i]);
    }
    if (!pool.length) return;
    var other = pool[(Math.random() * pool.length) | 0];
    var alt = WAVE_TYPES[(Math.random() * WAVE_TYPES.length) | 0];
    var guard = 0;
    while (alt === type && guard++ < 8) alt = WAVE_TYPES[(Math.random() * WAVE_TYPES.length) | 0];
    other.forcedType = alt;
    other.nextWaveAt = time + 400 + Math.random() * 2400;
  }

  /* ---------- backdrop ---------- */
  function drawBackdrop(t) {
    var hue = baseHue(t);
    var g = ctx.createRadialGradient(W * 0.5, H * 0.44, 0, W * 0.5, H * 0.44, Math.max(W, H) * 0.80);
    g.addColorStop(0, 'hsla(' + hue.toFixed(1) + ', 24%, 14%, 0.060)');
    g.addColorStop(1, 'hsla(' + ((hue - 10 + 360) % 360).toFixed(1) + ', 30%, 4%, 0.060)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- legibility scrim ----------
     Darkens the lower-left corner under the wordmark so the
     lattice can be bright without eating the text. */
  function drawScrim() {
    var g = ctx.createRadialGradient(W * 0.06, H * 0.97, 0, W * 0.06, H * 0.97, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(10,7,4,0.50)');
    g.addColorStop(0.55, 'rgba(10,7,4,0.20)');
    g.addColorStop(1, 'rgba(10,7,4,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- resize ---------- */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0b0805';
    ctx.fillRect(0, 0, W, H);
    initField();
    initWashes();
    initTraces();
    initSpeck();
  }
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 180);
  });

  /* ---------- loop ---------- */
  var last = 0, frame = 0;
  function animate(time) {
    var dt = time - last;
    if (!(dt > 0) || dt > 48) dt = 16.7;
    last = time;

    ctx.fillStyle = 'rgba(11,8,5,0.034)';
    ctx.fillRect(0, 0, W, H);

    drawBackdrop(time);
    for (var i = 0; i < washes.length; i++) washes[i].draw(time);

    if (strip === 0) renderT = time;
    renderStrip(renderT, strip);
    strip++;
    if (strip >= STRIPS) { fCtx.putImageData(fImg, 0, 0); strip = 0; }

    drawField();
    if (frame % 2 === 0) drawSpeck(time);
    drawScrim();

    /* lines sit above the lattice so they stay readable */
    for (var j = 0; j < traces.length; j++) { traces[j].update(time, dt); traces[j].draw(time); }

    frame++;
    requestAnimationFrame(animate);
  }

  /* ---------- random placement ---------- */
  window.PS = {
    placeRandom: function (el, opts) {
      if (!el) return;
      opts = opts || {};
      var mx = opts.marginX != null ? opts.marginX : 0.10;
      var my = opts.marginY != null ? opts.marginY : 0.12;
      var avoid = opts.avoid || [];
      var pad = opts.pad != null ? opts.pad : 34;
      var vw = window.innerWidth, vh = window.innerHeight;
      var r = el.getBoundingClientRect();
      var w = r.width || 150, h = r.height || 22;
      var availW = Math.max(10, vw * (1 - mx * 2) - w);
      var availH = Math.max(10, vh * (1 - my * 2) - h);
      var best = null, bestScore = -Infinity;
      for (var n = 0; n < 300; n++) {
        var x = vw * mx + Math.random() * availW;
        var y = vh * my + Math.random() * availH;
        var ok = true, worst = Infinity;
        for (var i = 0; i < avoid.length; i++) {
          var a = avoid[i];
          if (!a) continue;
          var ar = a.getBoundingClientRect();
          var ox = Math.min(x + w, ar.right + pad) - Math.max(x, ar.left - pad);
          var oy = Math.min(y + h, ar.bottom + pad) - Math.max(y, ar.top - pad);
          if (ox > 0 && oy > 0) { ok = false; break; }
          worst = Math.min(worst, Math.max(-ox, -oy));
        }
        if (ok) { el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px'; return; }
        if (worst > bestScore) { bestScore = worst; best = { x: x, y: y }; }
      }
      if (best) {
        el.style.left = Math.round(best.x) + 'px';
        el.style.top = Math.round(best.y) + 'px';
      }
    }
  };

  resize();
  requestAnimationFrame(animate);
})();
