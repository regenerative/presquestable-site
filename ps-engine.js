/* ============================================================
   Presque Stable — background engine
   Soft morphing colour field + otoconia crystal layer
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
  function lerp(a, b, t) { return a + (b - a) * t; }

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
  function fbm(x, y, z, oct) {
    var v = 0, a = 0.5, f = 1;
    for (var i = 0; i < oct; i++) {
      v += a * vnoise(x * f, y * f, z * f);
      f *= 2.02; a *= 0.5;
    }
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

  var PALETTE = [190, 208, 228, 252, 276, 300, 328, 348, 18, 40, 62, 150, 172];
  var ANCHOR_MS = REDUCED ? 110000 : 52000;
  var HUE_SEED = Math.random() * PALETTE.length * ANCHOR_MS;

  function baseHue(t) {
    var p = (t + HUE_SEED) / ANCHOR_MS;
    var i = Math.floor(p) % PALETTE.length;
    var j = (i + 1) % PALETTE.length;
    var a = PALETTE[i], b = PALETTE[j], d = b - a;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    return (a + d * smoothstep(p - Math.floor(p)) + 360) % 360;
  }

  /* ============================================================
     MORPHING NOISE FIELD  (base — unchanged)
     ============================================================ */
  var NW = 150, NH = 84;
  var nCanvas = null, nCtx = null, nImg = null, nData = null;
  var phase = 0, STRIPS = 6, renderT = 0;

  function initNoise() {
    NH = Math.max(60, Math.round(NW * (H / Math.max(1, W))));
    nCanvas = document.createElement('canvas');
    nCanvas.width = NW; nCanvas.height = NH;
    nCtx = nCanvas.getContext('2d');
    nImg = nCtx.createImageData(NW, NH);
    nData = nImg.data;
    for (var i = 3; i < nData.length; i += 4) nData[i] = 255;
    for (var s = 0; s < STRIPS; s++) renderStrip(0, s);
    nCtx.putImageData(nImg, 0, 0);
  }

  function renderStrip(time, s) {
    if (!nData) return;
    var zs = REDUCED ? 0.35 : 1;
    var z1 = time * 0.0000300 * zs;
    var z2 = time * 0.0000205 * zs + 53.7;
    var z3 = time * 0.0000380 * zs + 128.3;

    var hue = baseHue(time);
    var cDeep = hsl2rgb(hue + 22, 0.82, 0.30);
    var cMid  = hsl2rgb(hue,      0.86, 0.54);
    var cHi   = hsl2rgb(hue - 26, 0.72, 0.72);

    var y0 = Math.floor(NH * s / STRIPS);
    var y1 = Math.floor(NH * (s + 1) / STRIPS);
    var ar = NW / NH;

    for (var y = y0; y < y1; y++) {
      var py = (y / NH) * 2.6;
      var k = (y * NW) * 4;
      for (var x = 0; x < NW; x++) {
        var px = (x / NW) * 2.6 * ar;

        var q1 = fbm(px, py, z1, 2);
        var q2 = fbm(px + 5.2, py + 1.3, z1, 2);
        var ax = px + 1.5 * (q1 - 0.5);
        var ay = py + 1.5 * (q2 - 0.5);

        var v = fbm(ax, ay, z2, 3);
        var soft = fbm(ax * 0.55 + 3.1, ay * 0.55 - 1.7, z3, 2);
        v = v * 0.70 + soft * 0.30;

        v = (v - 0.26) / 0.48;
        v = v < 0 ? 0 : (v > 1 ? 1 : v);
        v = v * v * (3 - 2 * v);

        var mix = (q1 - q2) * 1.2 + 0.5;
        mix = mix < 0 ? 0 : (mix > 1 ? 1 : mix);

        var R, G, B;
        if (v < 0.55) {
          var u = v / 0.55;
          R = cDeep[0] + (cMid[0] - cDeep[0]) * u;
          G = cDeep[1] + (cMid[1] - cDeep[1]) * u;
          B = cDeep[2] + (cMid[2] - cDeep[2]) * u;
        } else {
          var u2 = (v - 0.55) / 0.45;
          R = cMid[0] + (cHi[0] - cMid[0]) * u2;
          G = cMid[1] + (cHi[1] - cMid[1]) * u2;
          B = cMid[2] + (cHi[2] - cMid[2]) * u2;
        }

        var tint = (mix - 0.5) * 0.30;
        R *= (1 - tint); B *= (1 + tint);

        var amt = v * 0.46;
        R *= amt; G *= amt; B *= amt;
        nData[k++] = R > 255 ? 255 : R;
        nData[k++] = G > 255 ? 255 : G;
        nData[k++] = B > 255 ? 255 : B;
        k++;
      }
    }
  }

  function drawNoise() {
    if (!nCanvas) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 0.95;
    ctx.drawImage(nCanvas, 0, 0, W, H);
    ctx.restore();
  }

  /* ---------- drifting colour washes  (base — unchanged) ---------- */
  function ColorWash(seed) {
    this.hueOffset = (seed % 4) * 32 - 48;
    this.radius = Math.max(W, H) * (0.34 + (seed % 4) * 0.13);
    this.orbitR = Math.min(W, H) * (0.16 + (seed % 3) * 0.17);
    this.orbitSpeed = (0.000038 + (seed % 5) * 0.000018) * (REDUCED ? 0.3 : 1);
    this.phase = seed * 1.7;
    this.wobble = 0.55 + (seed % 3) * 0.2;
    this.alpha = 0.062 + (seed % 3) * 0.022;
  }
  ColorWash.prototype.draw = function (t) {
    var hue = (baseHue(t) + this.hueOffset + 360) % 360;
    var ang = t * this.orbitSpeed + this.phase;
    var cx = W * 0.5 + Math.cos(ang) * this.orbitR;
    var cy = H * 0.5 + Math.sin(ang * this.wobble) * this.orbitR * 0.75;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.radius);
    var h = hue.toFixed(1);
    g.addColorStop(0, 'hsla(' + h + ', 86%, 52%, ' + this.alpha.toFixed(4) + ')');
    g.addColorStop(0.55, 'hsla(' + h + ', 86%, 44%, ' + (this.alpha * 0.4).toFixed(4) + ')');
    g.addColorStop(1, 'hsla(' + h + ', 86%, 38%, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  var washes = [];
  function initWashes() {
    washes = [];
    for (var i = 0; i < 6; i++) washes.push(new ColorWash(i * 2.3 + 1));
  }

  /* ---------- fine grain  (base — unchanged) ---------- */
  var grain = [];
  function initGrain() {
    grain = [];
    var n = Math.floor((W * H) / 3600);
    for (var i = 0; i < n; i++) {
      grain.push({
        x: Math.random() * W, y: Math.random() * H,
        a: 0.008 + Math.random() * Math.random() * 0.030,
        ph: Math.random() * TAU,
        sp: 0.00018 + Math.random() * 0.00040
      });
    }
  }
  function drawGrain(time) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgb(210,224,238)';
    for (var i = 0; i < grain.length; i++) {
      var p = grain[i];
      ctx.globalAlpha = p.a * (0.55 + 0.45 * Math.sin(time * p.sp + p.ph));
      ctx.fillRect(p.x, p.y, 1, 1);
    }
    ctx.restore();
  }

  /* ============================================================
     OTOCONIA LAYER  (addition)

     Calcium-carbonate crystals resting on a gel bed in the inner
     ear. A gravity vector drifts and never settles; the crystals
     lag behind it, lean, and resettle. Tip links between
     neighbours show only when strained. Rarely one detaches and
     drifts across the field before rejoining.
     ============================================================ */

  var crystals = [], links = [], loose = null, nextLooseAt = 0;

  /* gravity direction — a slow irrational drift, never repeating */
  var gx = 0, gy = 1, gAng = Math.PI / 2;
  function updateGravity(time) {
    var s = REDUCED ? 0.35 : 1;
    var a = Math.sin(time * 0.0000362 * s) * 0.55
          + Math.sin(time * 0.0000149 * s + 2.1) * 0.34
          + Math.sin(time * 0.0000083 * s + 4.7) * 0.22;
    gAng = Math.PI / 2 + a;          /* wanders around "down" */
    gx = Math.cos(gAng);
    gy = Math.sin(gAng);
  }

  function initCrystals() {
    crystals = [];
    links = [];
    loose = null;
    nextLooseAt = 14000 + Math.random() * 26000;

    var n = Math.round((W * H) / 20000);
    if (n < 24) n = 24;
    if (n > 110) n = 110;

    /* jittered grid so spacing stays even but not regular */
    var cols = Math.max(4, Math.round(Math.sqrt(n * (W / H))));
    var rows = Math.max(3, Math.ceil(n / cols));
    var cw = W / cols, ch = H / rows;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (crystals.length >= n) break;
        crystals.push({
          hx: (c + 0.5) * cw + (Math.random() - 0.5) * cw * 0.72,
          hy: (r + 0.5) * ch + (Math.random() - 0.5) * ch * 0.72,
          ox: 0, oy: 0, vx: 0, vy: 0,
          /* heavier crystals lag further — this is the inertia */
          mass: 0.55 + Math.random() * 0.85,
          k: 0.0016 + Math.random() * 0.0022,      /* spring to home */
          size: 1.5 + Math.random() * Math.random() * 3.4,
          ang: Math.random() * TAU,
          angBias: (Math.random() - 0.5) * 1.5,
          angLag: 0.006 + Math.random() * 0.016,
          flash: 0,
          state: 0                                  /* 0 settled, 1 loose */
        });
      }
    }

    /* tip links: nearest neighbours only, computed once */
    var maxD = Math.min(W, H) * 0.14;
    for (var i = 0; i < crystals.length; i++) {
      var a = crystals[i], found = 0;
      for (var j = i + 1; j < crystals.length && found < 2; j++) {
        var b = crystals[j];
        var dx = b.hx - a.hx, dy = b.hy - a.hy;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < maxD) {
          links.push({ a: i, b: j, rest: d, flash: 0 });
          found++;
        }
      }
    }
  }

  function updateCrystals(time, dt) {
    var f = dt / 16.667;
    if (f > 3) f = 3;

    for (var i = 0; i < crystals.length; i++) {
      var p = crystals[i];

      if (p.state === 1) {
        /* detached: drifts with gravity, slowly re-homes */
        p.ox += p.vx * f;
        p.oy += p.vy * f;
        p.vx += gx * 0.0042 * f;
        p.vy += gy * 0.0042 * f;
        p.vx *= 0.995; p.vy *= 0.995;
        p.ang += 0.004 * f;
        var px = p.hx + p.ox, py = p.hy + p.oy;
        if (px < -60 || px > W + 60 || py < -60 || py > H + 60) {
          /* rejoin somewhere new */
          p.hx = 40 + Math.random() * (W - 80);
          p.hy = 40 + Math.random() * (H - 80);
          p.ox = p.oy = p.vx = p.vy = 0;
          p.state = 0;
          loose = null;
        }
      } else {
        /* settled: spring to home + pull along gravity, damped */
        var ax = -p.k * p.ox + gx * 0.055 * p.mass;
        var ay = -p.k * p.oy + gy * 0.055 * p.mass;
        p.vx = (p.vx + ax * f) * 0.962;
        p.vy = (p.vy + ay * f) * 0.962;
        p.ox += p.vx * f;
        p.oy += p.vy * f;
      }

      /* orientation eases toward gravity, each at its own rate */
      var target = gAng + p.angBias;
      var da = target - p.ang;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      p.ang += da * p.angLag * f;

      if (p.flash > 0) p.flash -= 0.022 * f;
    }

    /* detachment: one at a time, rarely */
    if (!REDUCED && !loose && time > nextLooseAt) {
      var pick = crystals[(Math.random() * crystals.length) | 0];
      if (pick && pick.state === 0) {
        pick.state = 1;
        pick.vx = (Math.random() - 0.5) * 0.22;
        pick.vy = (Math.random() - 0.5) * 0.22;
        pick.flash = 1;
        loose = pick;
      }
      nextLooseAt = time + 26000 + Math.random() * 44000;
    }

    /* tip-link strain */
    for (var L = 0; L < links.length; L++) {
      var l = links[L];
      var A = crystals[l.a], B = crystals[l.b];
      if (A.state || B.state) { l.strain = 0; continue; }
      var dx = (B.hx + B.ox) - (A.hx + A.ox);
      var dy = (B.hy + B.oy) - (A.hy + A.oy);
      var d = Math.sqrt(dx * dx + dy * dy);
      var s = (d - l.rest) / l.rest;
      l.strain = s > 0 ? s : 0;
      /* past threshold the link releases with a brief flash */
      if (l.strain > 0.052 && l.flash <= 0) {
        l.flash = 1;
        A.flash = 1; B.flash = 1;
      }
      if (l.flash > 0) l.flash -= 0.020 * f;
    }
  }

  function drawCrystals(time) {
    var hue = baseHue(time);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    /* --- tip links: only visible under tension --- */
    ctx.lineCap = 'round';
    for (var L = 0; L < links.length; L++) {
      var l = links[L];
      if (!l.strain && l.flash <= 0) continue;
      var A = crystals[l.a], B = crystals[l.b];
      var a = l.strain * 2.6;
      if (l.flash > 0) a += l.flash * 0.22;
      if (a <= 0.004) continue;
      if (a > 0.20) a = 0.20;
      ctx.beginPath();
      ctx.moveTo(A.hx + A.ox, A.hy + A.oy);
      ctx.lineTo(B.hx + B.ox, B.hy + B.oy);
      ctx.strokeStyle = 'hsla(' + ((hue - 16 + 360) % 360).toFixed(1) +
                        ', 70%, 80%, ' + a.toFixed(4) + ')';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    /* --- crystals --- */
    for (var i = 0; i < crystals.length; i++) {
      var p = crystals[i];
      var x = p.hx + p.ox, y = p.hy + p.oy;

      /* birefringence: calcite splits light by orientation, so hue
         comes from how the crystal sits relative to gravity */
      var rel = p.ang - gAng;
      var bi = Math.sin(rel * 2);
      var h = (hue + bi * 46 + 360) % 360;
      var lum = 0.66 + 0.20 * Math.cos(rel * 2);

      var a = 0.070 + 0.055 * Math.abs(bi);
      if (p.state === 1) a *= 1.7;
      if (p.flash > 0) a += p.flash * 0.10;

      var s = p.size;
      var ca = Math.cos(p.ang), sa = Math.sin(p.ang);

      /* rhombohedral facet — a small leaning diamond */
      ctx.beginPath();
      ctx.moveTo(x + ca * s * 1.7, y + sa * s * 1.7);
      ctx.lineTo(x - sa * s * 0.72, y + ca * s * 0.72);
      ctx.lineTo(x - ca * s * 1.7, y - sa * s * 1.7);
      ctx.lineTo(x + sa * s * 0.72, y - ca * s * 0.72);
      ctx.closePath();
      ctx.fillStyle = 'hsla(' + h.toFixed(1) + ', 78%, ' +
                      (lum * 100).toFixed(0) + '%, ' + a.toFixed(4) + ')';
      ctx.fill();

      /* lit edge along the long axis */
      ctx.beginPath();
      ctx.moveTo(x + ca * s * 1.7, y + sa * s * 1.7);
      ctx.lineTo(x - sa * s * 0.72, y + ca * s * 0.72);
      ctx.strokeStyle = 'hsla(' + h.toFixed(1) + ', 62%, 92%, ' +
                        (a * 0.85).toFixed(4) + ')';
      ctx.lineWidth = 0.55;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- backdrop ---------- */
  function drawBackdrop(t) {
    var hue = baseHue(t);
    var g = ctx.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.46, Math.max(W, H) * 0.80);
    g.addColorStop(0, 'hsla(' + hue.toFixed(1) + ', 68%, 17%, 0.105)');
    g.addColorStop(1, 'hsla(' + ((hue + 38) % 360).toFixed(1) + ', 72%, 5%, 0.105)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- scrim under the wordmark only ---------- */
  function drawScrim() {
    var g = ctx.createRadialGradient(W * 0.05, H * 0.98, 0, W * 0.05, H * 0.98, Math.max(W, H) * 0.55);
    g.addColorStop(0, 'rgba(4,6,11,0.46)');
    g.addColorStop(0.55, 'rgba(4,6,11,0.17)');
    g.addColorStop(1, 'rgba(4,6,11,0)');
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
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);
    initNoise();
    initWashes();
    initGrain();
    initCrystals();
  }
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 180);
  });

  /* ---------- loop ---------- */
  var frame = 0, last = 0;
  function animate(time) {
    var dt = time - last;
    if (!(dt > 0) || dt > 48) dt = 16.7;
    last = time;

    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);

    drawBackdrop(time);
    for (var i = 0; i < washes.length; i++) washes[i].draw(time);

    if (phase === 0) {
      renderT = time;
    } else {
      renderStrip(renderT, phase - 1);
      if (phase === STRIPS) nCtx.putImageData(nImg, 0, 0);
    }
    phase++;
    if (phase > STRIPS) phase = 0;

    drawNoise();
    if (frame % 2 === 0) drawGrain(time);

    updateGravity(time);
    updateCrystals(time, dt);
    drawCrystals(time);

    drawScrim();

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
