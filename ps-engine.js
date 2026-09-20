/* ============================================================
   Presque Stable — background engine
   Morphing cellular lattice, saturated colour
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

  /* Each anchor holds ~42s, so a shift is visible within a normal
     visit. Full cycle ~9 min. */
  var ANCHOR_MS = REDUCED ? 90000 : 42000;

  /* Random entry point into the palette on every load. Without this
     the page always opened on PALETTE[0] (cyan) and stayed there for
     the first two minutes — which is why every screenshot was blue. */
  var HUE_SEED = Math.random() * PALETTE.length * ANCHOR_MS;

  function baseHue(t) {
    var p = (t + HUE_SEED) / ANCHOR_MS;
    var i = Math.floor(p) % PALETTE.length;
    var j = (i + 1) % PALETTE.length;
    var a = PALETTE[i], b = PALETTE[j], d = b - a;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    return (a + d * smoothstep(p - Math.floor(p)) + 360) % 360;
  }

  /* ---------- lattice scales ---------- */
  var S_FAR = 24.0, S_MID = 13.0, S_NEAR = 7.2;
  var T_FAR = 0.15, T_MID = 0.20, T_NEAR = 0.28;

  /* ============================================================
     CELL GRID
     ============================================================ */
  function CellGrid() {
    this.pts = null; this.nx = 0; this.ny = 0; this.x0 = 0; this.y0 = 0;
  }
  CellGrid.prototype.build = function (scale, ox, oy, seed, t, ar, margin) {
    this.x0 = Math.floor(-margin * scale + ox) - 1;
    this.y0 = Math.floor(-margin * scale + oy) - 1;
    var x1 = Math.ceil((ar + margin) * scale + ox) + 1;
    var y1 = Math.ceil((1 + margin) * scale + oy) + 1;
    this.nx = x1 - this.x0 + 1;
    this.ny = y1 - this.y0 + 1;
    var need = this.nx * this.ny * 2;
    if (!this.pts || this.pts.length < need) this.pts = new Float32Array(need);
    var k = 0;
    for (var cy = this.y0; cy <= y1; cy++) {
      for (var cx = this.x0; cx <= x1; cx++) {
        var a = hash2i(cx, cy, seed) * TAU;
        var b = hash2i(cx, cy, seed + 977) * TAU;
        var sp = 0.35 + hash2i(cx, cy, seed + 311) * 0.65;
        this.pts[k++] = cx + 0.5 + 0.42 * Math.sin(a + t * sp);
        this.pts[k++] = cy + 0.5 + 0.42 * Math.cos(b + t * sp * 0.87);
      }
    }
  };

  var gF1 = 0;
  CellGrid.prototype.sample = function (sx, sy) {
    var ix = Math.floor(sx), iy = Math.floor(sy);
    var f1 = 1e9, f2 = 1e9;
    var bx = ix - this.x0, by = iy - this.y0;
    var nx = this.nx, ny = this.ny, pts = this.pts;
    for (var gy = -1; gy <= 1; gy++) {
      var ry = by + gy;
      if (ry < 0 || ry >= ny) continue;
      var row = ry * nx;
      for (var gx = -1; gx <= 1; gx++) {
        var rx = bx + gx;
        if (rx < 0 || rx >= nx) continue;
        var p = (row + rx) * 2;
        var dx = pts[p] - sx, dy = pts[p + 1] - sy;
        var d = dx * dx + dy * dy;
        if (d < f1) { f2 = f1; f1 = d; }
        else if (d < f2) { f2 = d; }
      }
    }
    gF1 = Math.sqrt(f1);
    return Math.sqrt(f2) - gF1;
  };

  /* ============================================================
     FIELD
     ============================================================ */
  var FW = 0, FH = 0;
  var fCanvas = null, fCtx = null, fImg = null, fData = null;
  var phase = 0, STRIPS = 20, renderT = 0;

  var gNear = new CellGrid(), gMid = new CellGrid(), gFar = new CellGrid();

  var WWX = 80, WWY = 46, warpA = null, warpB = null;
  var LUT_N = 40, lutDeep = null, lutMid = null, lutHi = null;

  function initField() {
    FW = Math.min(520, Math.max(300, Math.round(W * 0.40)));
    FH = Math.max(120, Math.round(FW * (H / Math.max(1, W))));
    fCanvas = document.createElement('canvas');
    fCanvas.width = FW; fCanvas.height = FH;
    fCtx = fCanvas.getContext('2d');
    fImg = fCtx.createImageData(FW, FH);
    fData = fImg.data;
    for (var i = 3; i < fData.length; i += 4) fData[i] = 255;

    WWY = Math.max(28, Math.round(WWX * (FH / FW)));
    warpA = new Float32Array(WWX * WWY);
    warpB = new Float32Array(WWX * WWY);

    lutDeep = new Float32Array(LUT_N * 3);
    lutMid = new Float32Array(LUT_N * 3);
    lutHi = new Float32Array(LUT_N * 3);

    prepField(0);
    for (var s = 0; s < STRIPS; s++) renderStrip(s);
    fCtx.putImageData(fImg, 0, 0);
  }

  var pAr = 1, pTb = 0;

  function prepField(time) {
    var zs = REDUCED ? 0.35 : 1;
    var tw = time * 0.0000290 * zs;
    var tc = time * 0.0000760 * zs;
    pTb = time * 0.0000420 * zs + 61.3;
    pAr = FW / FH;

    var k = 0;
    for (var y = 0; y < WWY; y++) {
      var py = (y / (WWY - 1)) * 1.6;
      for (var x = 0; x < WWX; x++) {
        var px = (x / (WWX - 1)) * pAr * 1.6;
        warpA[k] = fbm2(px, py, tw) - 0.5;
        warpB[k] = fbm2(px + 7.3, py + 2.1, tw) - 0.5;
        k++;
      }
    }

    gFar.build(S_FAR, 0, 0, 11, tc, pAr, 0.35);
    gMid.build(S_MID, 4.0, 1.5, 29, tc * 0.86, pAr, 0.35);
    gNear.build(S_NEAR, 1.7, 6.2, 47, tc * 0.70, pAr, 0.35);

    var hue = baseHue(time);
    for (var i = 0; i < LUT_N; i++) {
      /* Wide local spread: different regions of the field sit on
         different hues at the same instant, so colour is visible in
         a single still frame, not only over time. */
      var off = (i / (LUT_N - 1) - 0.5) * 104;
      var h = hue + off;

      /* All three stops hold saturation.
         The highlight matters most: struts are the brightest and most
         visible part of the image, so a pale desaturated highlight
         turns the whole page grey no matter what the palette does. */
      var a = hsl2rgb(h + 18, 0.80, 0.27);   /* cavity     */
      var b = hsl2rgb(h,      0.88, 0.53);   /* strut body */
      var c = hsl2rgb(h - 20, 0.70, 0.71);   /* lit edge   */

      lutDeep[i * 3] = a[0]; lutDeep[i * 3 + 1] = a[1]; lutDeep[i * 3 + 2] = a[2];
      lutMid[i * 3] = b[0]; lutMid[i * 3 + 1] = b[1]; lutMid[i * 3 + 2] = b[2];
      lutHi[i * 3] = c[0]; lutHi[i * 3 + 1] = c[1]; lutHi[i * 3 + 2] = c[2];
    }
  }

  function renderStrip(s) {
    if (!fData) return;
    var y0 = Math.floor(FH * s / STRIPS);
    var y1 = Math.floor(FH * (s + 1) / STRIPS);
    var ar = pAr, tb = pTb;
    var tooth = 44;

    for (var y = y0; y < y1; y++) {
      var py = y / FH;
      var wy = py * (WWY - 1);
      var wyi = wy | 0; if (wyi > WWY - 2) wyi = WWY - 2;
      var wyf = wy - wyi;
      var k = (y * FW) * 4;

      for (var x = 0; x < FW; x++) {
        var px = (x / FW) * ar;

        var wx = (x / FW) * (WWX - 1);
        var wxi = wx | 0; if (wxi > WWX - 2) wxi = WWX - 2;
        var wxf = wx - wxi;
        var i00 = wyi * WWX + wxi, i10 = i00 + 1;
        var i01 = i00 + WWX, i11 = i01 + 1;
        var w1 = (warpA[i00] * (1 - wxf) + warpA[i10] * wxf) * (1 - wyf) +
                 (warpA[i01] * (1 - wxf) + warpA[i11] * wxf) * wyf;
        var w2 = (warpB[i00] * (1 - wxf) + warpB[i10] * wxf) * (1 - wyf) +
                 (warpB[i01] * (1 - wxf) + warpB[i11] * wxf) * wyf;

        var ux = px + 0.62 * w1;
        var uy = py + 0.62 * w2;

        var eFar = gFar.sample(ux * S_FAR, uy * S_FAR);
        var sFar = 1 - sstep(0, T_FAR, eFar);
        var farDepth = gF1;

        var eMid = gMid.sample(ux * S_MID + 4.0, uy * S_MID + 1.5);
        var sMid = 1 - sstep(0, T_MID, eMid);

        var eNear = gNear.sample(ux * S_NEAR + 1.7, uy * S_NEAR + 6.2);
        var sNear = 1 - sstep(0, T_NEAR, eNear);
        var nearCore = gF1;

        var v = sFar * 0.26 + sMid * 0.40 + sNear * 0.78;
        v *= (1 - sNear * 0.30);
        v += sNear * 0.34;

        var spec = sNear * (1 - sstep(0.0, 0.34, nearCore));
        spec = spec * spec;

        var th = vnoise(ux * tooth, uy * tooth, tb * 2.4);
        v *= 0.93 + th * 0.14;
        v *= 0.82 + 0.18 * (1 - sstep(0.1, 0.5, farDepth));

        v = v < 0 ? 0 : (v > 1 ? 1 : v);
        v = v * v * (3 - 2 * v);

        var li = ((w1 - w2) * 1.1 + 0.5) * (LUT_N - 1);
        li = li < 0 ? 0 : (li > LUT_N - 1 ? LUT_N - 1 : li) | 0;
        var l3 = li * 3;

        var R, G, B;
        if (v < 0.52) {
          var u = v / 0.52;
          R = lutDeep[l3] + (lutMid[l3] - lutDeep[l3]) * u;
          G = lutDeep[l3 + 1] + (lutMid[l3 + 1] - lutDeep[l3 + 1]) * u;
          B = lutDeep[l3 + 2] + (lutMid[l3 + 2] - lutDeep[l3 + 2]) * u;
        } else {
          var u2 = (v - 0.52) / 0.48;
          R = lutMid[l3] + (lutHi[l3] - lutMid[l3]) * u2;
          G = lutMid[l3 + 1] + (lutHi[l3 + 1] - lutMid[l3 + 1]) * u2;
          B = lutMid[l3 + 2] + (lutHi[l3 + 2] - lutMid[l3 + 2]) * u2;
        }

        /* Small and hue-tinted. A large neutral white add here
           bleaches precisely the brightest, most visible ridges. */
        R += spec * 8; G += spec * 9; B += spec * 11;

        /* MAIN BRIGHTNESS DIAL */
        var amt = v * 0.62;
        R *= amt; G *= amt; B *= amt;
        fData[k++] = R > 255 ? 255 : R;
        fData[k++] = G > 255 ? 255 : G;
        fData[k++] = B > 255 ? 255 : B;
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
    ctx.globalAlpha = 0.92;
    ctx.drawImage(fCanvas, 0, 0, W, H);
    ctx.restore();
  }

  /* ---------- static speckle ---------- */
  var speck = [];
  function initSpeck() {
    speck = [];
    var n = Math.floor((W * H) / 3200);
    for (var i = 0; i < n; i++) {
      speck.push({
        x: Math.random() * W, y: Math.random() * H,
        a: 0.008 + Math.random() * Math.random() * 0.030,
        ph: Math.random() * TAU,
        sp: 0.00018 + Math.random() * 0.00040
      });
    }
  }
  function drawSpeck(time) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgb(206,222,236)';
    for (var i = 0; i < speck.length; i++) {
      var p = speck[i];
      ctx.globalAlpha = p.a * (0.55 + 0.45 * Math.sin(time * p.sp + p.ph));
      ctx.fillRect(p.x, p.y, 1, 1);
    }
    ctx.restore();
  }

  /* ---------- washes ---------- */
  function ColorWash(seed) {
    this.hueOffset = (seed % 4) * 34 - 52;
    this.radius = Math.max(W, H) * (0.36 + (seed % 4) * 0.13);
    this.orbitR = Math.min(W, H) * (0.15 + (seed % 3) * 0.16);
    this.orbitSpeed = (0.000040 + (seed % 5) * 0.000019) * (REDUCED ? 0.3 : 1);
    this.phase = seed * 1.7;
    this.wobble = 0.55 + (seed % 3) * 0.2;
    this.alpha = 0.070 + (seed % 3) * 0.024;
  }
  ColorWash.prototype.draw = function (t) {
    var hue = (baseHue(t) + this.hueOffset + 360) % 360;
    var ang = t * this.orbitSpeed + this.phase;
    var cx = W * 0.5 + Math.cos(ang) * this.orbitR;
    var cy = H * 0.5 + Math.sin(ang * this.wobble) * this.orbitR * 0.75;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.radius);
    var h = hue.toFixed(1);
    g.addColorStop(0, 'hsla(' + h + ', 88%, 52%, ' + this.alpha.toFixed(4) + ')');
    g.addColorStop(0.55, 'hsla(' + h + ', 88%, 44%, ' + (this.alpha * 0.4).toFixed(4) + ')');
    g.addColorStop(1, 'hsla(' + h + ', 88%, 38%, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  var washes = [];
  function initWashes() {
    washes = [];
    for (var i = 0; i < 5; i++) washes.push(new ColorWash(i * 2.3 + 1));
  }

  /* ---------- backdrop ---------- */
  function drawBackdrop(t) {
    var hue = baseHue(t);
    var g = ctx.createRadialGradient(W * 0.5, H * 0.44, 0, W * 0.5, H * 0.44, Math.max(W, H) * 0.80);
    g.addColorStop(0, 'hsla(' + hue.toFixed(1) + ', 70%, 18%, 0.115)');
    g.addColorStop(1, 'hsla(' + ((hue + 40) % 360).toFixed(1) + ', 74%, 6%, 0.115)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- legibility scrim ---------- */
  function drawScrim() {
    var g = ctx.createRadialGradient(W * 0.06, H * 0.97, 0, W * 0.06, H * 0.97, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(4,6,11,0.52)');
    g.addColorStop(0.55, 'rgba(4,6,11,0.21)');
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
    initField();
    initWashes();
    initSpeck();
  }
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 180);
  });

  /* ---------- loop ---------- */
  var frame = 0;
  function animate(time) {
    /* Opaque clear. A partial fade would let the screen blend
       accumulate frame over frame and bleach everything white. */
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, W, H);

    drawBackdrop(time);
    for (var i = 0; i < washes.length; i++) washes[i].draw(time);

    if (phase === 0) {
      renderT = time;
      prepField(renderT);
    } else {
      renderStrip(phase - 1);
      if (phase === STRIPS) fCtx.putImageData(fImg, 0, 0);
    }
    phase++;
    if (phase > STRIPS) phase = 0;

    drawField();
    if (frame % 2 === 0) drawSpeck(time);
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
