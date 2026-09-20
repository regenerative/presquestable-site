/* ============================================================
   Presque Stable — background engine
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

  /* ---------- maths helpers ---------- */
  function smoothstep(t) { t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand01(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* ---------- 3-D value noise (integer hash) ---------- */
  function hash3(ix, iy, iz) {
    var h = Math.imul(ix, 1597334677) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 374761393);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, z) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var fx = smoothstep(x - ix), fy = smoothstep(y - iy), fz = smoothstep(z - iz);
    var x00 = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx);
    var x10 = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx);
    var x01 = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx);
    var x11 = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx);
    return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
  }
  function fbm(x, y, z, oct) {
    var v = 0, a = 0.5, f = 1;
    for (var i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, z * f); f *= 2.02; a *= 0.5; }
    return v;
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

  /* Anchored palette: coral -> amber -> teal -> blue -> violet -> magenta.
     Nods to the logo red rather than sweeping the whole wheel. */
  var PALETTE = [6, 27, 45, 186, 209, 256, 322];
  var ANCHOR_MS = REDUCED ? 420000 : 170000;   /* full loop ~20 min */
  function baseHue(t) {
    var p = t / ANCHOR_MS;
    var i = Math.floor(p) % PALETTE.length;
    var j = (i + 1) % PALETTE.length;
    var a = PALETTE[i], b = PALETTE[j], d = b - a;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    return (a + d * smoothstep(p - Math.floor(p)) + 360) % 360;
  }

  /* ---------- morphing noise texture ---------- */
  var NW = 96, NH = 54, nCanvas = null, nCtx = null, nImg = null;

  function initNoise() {
    NH = Math.max(36, Math.round(NW * (H / Math.max(1, W))));
    nCanvas = document.createElement('canvas');
    nCanvas.width = NW; nCanvas.height = NH;
    nCtx = nCanvas.getContext('2d');
    nImg = nCtx.createImageData(NW, NH);
    var d = nImg.data;
    for (var i = 3; i < d.length; i += 4) d[i] = 255;
    renderNoise(0);
  }

  function renderNoise(time) {
    if (!nImg) return;
    var d = nImg.data, k = 0;
    var hue = baseHue(time);
    var c1 = hsl2rgb(hue, 0.55, 0.55);
    var c2 = hsl2rgb(hue + 58, 0.50, 0.52);
    var zs = REDUCED ? 0.35 : 1;
    var z1 = time * 0.000042 * zs;
    var z2 = time * 0.000029 * zs + 37;
    var dx = time * 0.0000060 * zs;
    var dy = time * 0.0000038 * zs;
    for (var y = 0; y < NH; y++) {
      var ny = (y / NH) * 3.1 + dy;
      for (var x = 0; x < NW; x++) {
        var nx = (x / NW) * 4.4 + dx;
        var a = fbm(nx, ny, z1, 3);
        var b = fbm(nx * 1.85 + 4.7, ny * 1.85 - 3.1, z2, 2);
        var v = a * 0.62 + b * 0.38;
        v = (v - 0.34) / 0.52;
        v = v < 0 ? 0 : (v > 1 ? 1 : v);
        v = v * v * 0.30;
        d[k++] = (c1[0] + (c2[0] - c1[0]) * b) * v;
        d[k++] = (c1[1] + (c2[1] - c1[1]) * b) * v;
        d[k++] = (c1[2] + (c2[2] - c1[2]) * b) * v;
        k++;
      }
    }
    nCtx.putImageData(nImg, 0, 0);
  }

  function drawNoise() {
    if (!nCanvas) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.92;
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(nCanvas, 0, 0, W, H);
    ctx.restore();
  }

  /* ---------- drifting colour washes ---------- */
  function ColorWash(seed) {
    this.hueOffset = seed * 46 + 12;
    this.radius = Math.max(W, H) * (0.34 + (seed % 4) * 0.13);
    this.orbitR = Math.min(W, H) * (0.16 + (seed % 3) * 0.17);
    this.orbitSpeed = (0.000034 + (seed % 5) * 0.000017) * (REDUCED ? 0.3 : 1);
    this.phase = seed * 1.7;
    this.wobble = 0.55 + (seed % 3) * 0.2;
    this.alpha = 0.030 + (seed % 3) * 0.010;
  }
  ColorWash.prototype.draw = function (t) {
    var hue = (baseHue(t) + this.hueOffset) % 360;
    var ang = t * this.orbitSpeed + this.phase;
    var cx = W * 0.5 + Math.cos(ang) * this.orbitR;
    var cy = H * 0.5 + Math.sin(ang * this.wobble) * this.orbitR * 0.75;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.radius);
    var h = hue.toFixed(1);
    g.addColorStop(0, 'hsla(' + h + ', 62%, 46%, ' + this.alpha.toFixed(4) + ')');
    g.addColorStop(0.55, 'hsla(' + h + ', 62%, 40%, ' + (this.alpha * 0.4).toFixed(4) + ')');
    g.addColorStop(1, 'hsla(' + h + ', 62%, 36%, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };

  var washes = [];
  function initWashes() {
    washes = [];
    for (var i = 0; i < 6; i++) washes.push(new ColorWash(i * 2.3 + 1));
  }

  /* ---------- synthesis waveforms ---------- */
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
    this.i = i;
    this.seed = i * 7.3 + 1.7;
    this.t = i * 11;
    this.points = [];
    this.maxPoints = 720;
    this.lineWidth = 0.85 + (i % 3) * 0.28;
    this.hueOffset = i * 51 + 15;
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
      /* ~45% slower than before */
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
      type: type,
      start: time,
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
        this.mode = 'wander';
        this.wave = null;
        this.schedule(time);
      } else {
        var px = -0.12 * W + uu * 1.24 * W;
        var py = w.baseY + w.amp * waveValue(w.type, uu * w.cycles * TAU, this.seed);
        var edge = smoothstep(Math.min(uu / 0.12, (1 - uu) / 0.12));
        x = lerp(wx, px, edge);
        y = lerp(wy, py, edge);
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
    var boost = (this.mode === 'wave') ? 1.5 : 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var b = 0; b < BANDS; b++) {
      var s = b * per;
      var e = (b === BANDS - 1) ? pts.length : Math.min(pts.length, s + per + 1);
      if (e - s < 2) continue;
      var k = (b + 1) / BANDS;
      var a = 0.014 + 0.098 * k * k * boost;
      ctx.beginPath();
      ctx.moveTo(pts[s].x, pts[s].y);
      for (var i = s + 1; i < e; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = 'hsla(' + hue.toFixed(1) + ', 48%, 66%, ' + a.toFixed(4) + ')';
      ctx.lineWidth = this.lineWidth * (0.7 + 0.55 * k);
      ctx.stroke();
    }
  };

  var traces = [];
  function initTraces() {
    traces = [];
    for (var i = 0; i < 5; i++) traces.push(new Trace(i + 1));
  }

  /* Occasionally a second line answers with a different waveform,
     so more than one shape is on screen at once. */
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

  /* ---------- grain ---------- */
  var grain = [];
  function initGrain() {
    grain = [];
    var n = Math.floor((W * H) / 5200);
    for (var i = 0; i < n; i++) {
      grain.push({
        x: Math.random() * W, y: Math.random() * H,
        a: 0.014 + Math.random() * 0.032,
        ph: Math.random() * TAU,
        sp: 0.0004 + Math.random() * 0.0009
      });
    }
  }
  function drawGrain(time) {
    ctx.fillStyle = 'rgb(226,236,238)';
    for (var i = 0; i < grain.length; i++) {
      var p = grain[i];
      ctx.globalAlpha = p.a * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * p.sp + p.ph)));
      ctx.fillRect(p.x, p.y, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- backdrop ---------- */
  function drawBackdrop(t) {
    var hue = baseHue(t);
    var g = ctx.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.46, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'hsla(' + hue.toFixed(1) + ', 42%, 15%, 0.055)');
    g.addColorStop(1, 'hsla(' + ((hue + 46) % 360).toFixed(1) + ', 44%, 4%, 0.055)');
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
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, W, H);
    initNoise();
    initWashes();
    initTraces();
    initGrain();
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

    ctx.fillStyle = 'rgba(5,7,10,0.032)';
    ctx.fillRect(0, 0, W, H);

    drawBackdrop(time);
    for (var i = 0; i < washes.length; i++) washes[i].draw(time);
    for (var j = 0; j < traces.length; j++) { traces[j].update(time, dt); traces[j].draw(time); }

    if (frame % 4 === 0) renderNoise(time);
    drawNoise();
    if (frame % 2 === 0) drawGrain(time);

    frame++;
    requestAnimationFrame(animate);
  }

  /* ---------- random placement helper ---------- */
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
