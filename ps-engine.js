/* ============================================================
   Presque Stable — background engine
   Soft morphing colour field + rotating CaCO3 structure
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
     MOLECULE — calcium carbonate (calcite, R-3c)

     Real crystallographic coordinates: a = 4.99 A, c = 17.06 A.
     Planar CO3 groups (C-O = 1.284 A, O-C-O = 120 deg) stacked
     between layers of Ca, octahedrally coordinated at 2.36 A.
     Carbonate groups are culled as whole units so no CO3 is ever
     broken apart. Rotates slowly on three axes, centred.
     ============================================================ */

  var ATOMS = [];      /* {x,y,z,el} centred, in Angstrom */
  var BONDS = [];      /* {a,b,co}  co=true for covalent C-O    */
  var MOL_R = 1;
  var sprites = {};
  var order = [];      /* reusable index array for depth sort   */
  var px_ = [], py_ = [], pz_ = [], pf_ = [];

  /* Neutral throughout — no element colour coding. Vertices are
     small pale markers; the wireframe carries the structure. */
  var ELEMENTS = {
    Ca: { rad: 0.56, h: 210, s: 7, l: 80 },
    C:  { rad: 0.30, h: 210, s: 7, l: 62 },
    O:  { rad: 0.38, h: 210, s: 7, l: 71 }
  };

  /* Single source of truth for where the structure sits, so the
     text-placement logic can keep clear of it. */
  function MOL_CX() { return W * 0.5; }
  function MOL_CY() { return H * 0.46; }

  /* Scales with the short edge, but eased down on square or small
     viewports where a large centred object leaves no room for text. */
  function MOL_SIZE() {
    var m = Math.min(W, H);
    var aspect = Math.max(W, H) / m;          /* 1 = square */
    var f = 0.21 - 0.045 * smoothstep((1.45 - aspect) / 0.45);
    if (m < 820) f *= 0.88;
    return m * f;
  }

  /* Screen-space keep-out box. Perspective can push a near atom a
     little beyond `size`, so pad by 12%. */
  function moleculeBox() {
    var r = MOL_SIZE() * 1.12;
    var cx = MOL_CX(), cy = MOL_CY();
    return { left: cx - r, right: cx + r, top: cy - r, bottom: cy + r };
  }

  function buildMolecule() {
    var a = 4.99, c = 17.06, SQ3 = 0.8660254, oBond = 1.284;
    var cent = [[0, 0, 0], [2 / 3, 1 / 3, 1 / 3], [1 / 3, 2 / 3, 2 / 3]];

    function cart(u, v, w) {
      return { x: a * (u - v * 0.5), y: a * (v * SQ3), z: c * w };
    }

    var groups = [], calciums = [];
    var gSeen = {}, cSeen = {};

    for (var iu = -1; iu <= 1; iu++) {
      for (var iv = -1; iv <= 1; iv++) {
        for (var iw = -1; iw <= 1; iw++) {
          for (var t = 0; t < 3; t++) {
            var b = cent[t];
            var u = b[0] + iu, v = b[1] + iv, w = b[2] + iw;

            /* two Ca layers per cell */
            var ca1 = cart(u, v, w), ca2 = cart(u, v, w + 0.5);
            var k1 = ca1.x.toFixed(2) + '|' + ca1.y.toFixed(2) + '|' + ca1.z.toFixed(2);
            var k2 = ca2.x.toFixed(2) + '|' + ca2.y.toFixed(2) + '|' + ca2.z.toFixed(2);
            if (!cSeen[k1]) { cSeen[k1] = 1; calciums.push(ca1); }
            if (!cSeen[k2]) { cSeen[k2] = 1; calciums.push(ca2); }

            /* two carbonate layers, rotated 60 deg from each other */
            var defs = [[w + 0.25, 0], [w + 0.75, 1.0471976]];
            for (var d = 0; d < 2; d++) {
              var p = cart(u, v, defs[d][0]), rot = defs[d][1];
              var gk = p.x.toFixed(2) + '|' + p.y.toFixed(2) + '|' + p.z.toFixed(2);
              if (gSeen[gk]) continue;
              gSeen[gk] = 1;
              var os = [];
              for (var k = 0; k < 3; k++) {
                var th = rot + k * 2.0943951;   /* 120 deg apart, planar */
                os.push({ x: p.x + Math.cos(th) * oBond,
                          y: p.y + Math.sin(th) * oBond,
                          z: p.z });
              }
              groups.push({ c: p, os: os });
            }
          }
        }
      }
    }

    /* centroid over every atom */
    var mx = 0, my = 0, mz = 0, n = 0, i;
    for (i = 0; i < groups.length; i++) {
      mx += groups[i].c.x; my += groups[i].c.y; mz += groups[i].c.z; n++;
      for (var j = 0; j < 3; j++) {
        mx += groups[i].os[j].x; my += groups[i].os[j].y; mz += groups[i].os[j].z; n++;
      }
    }
    for (i = 0; i < calciums.length; i++) {
      mx += calciums[i].x; my += calciums[i].y; mz += calciums[i].z; n++;
    }
    mx /= n; my /= n; mz /= n;

    /* cull by whole group so carbonates stay intact */
    var R = 6.0;
    ATOMS = []; BONDS = [];
    for (i = 0; i < groups.length; i++) {
      var g = groups[i];
      var cxx = g.c.x - mx, cyy = g.c.y - my, czz = g.c.z - mz;
      if (Math.sqrt(cxx * cxx + cyy * cyy + czz * czz) > R) continue;
      var ci = ATOMS.length;
      ATOMS.push({ x: cxx, y: cyy, z: czz, el: 'C' });
      for (var m = 0; m < 3; m++) {
        var o = g.os[m];
        ATOMS.push({ x: o.x - mx, y: o.y - my, z: o.z - mz, el: 'O' });
        BONDS.push({ a: ci, b: ATOMS.length - 1, co: true });
      }
    }
    var caStart = ATOMS.length;
    for (i = 0; i < calciums.length; i++) {
      var q = calciums[i];
      var qx = q.x - mx, qy = q.y - my, qz = q.z - mz;
      if (Math.sqrt(qx * qx + qy * qy + qz * qz) > R) continue;
      ATOMS.push({ x: qx, y: qy, z: qz, el: 'Ca' });
    }

    /* Ca-O coordination, drawn faint */
    for (i = caStart; i < ATOMS.length; i++) {
      var A = ATOMS[i];
      for (var jj = 0; jj < caStart; jj++) {
        var B = ATOMS[jj];
        if (B.el !== 'O') continue;
        var dx = A.x - B.x, dy = A.y - B.y, dz = A.z - B.z;
        if (dx * dx + dy * dy + dz * dz < 6.6) BONDS.push({ a: i, b: jj, co: false });
      }
    }

    /* model radius */
    MOL_R = 1;
    for (i = 0; i < ATOMS.length; i++) {
      var r = Math.sqrt(ATOMS[i].x * ATOMS[i].x + ATOMS[i].y * ATOMS[i].y + ATOMS[i].z * ATOMS[i].z);
      if (r > MOL_R) MOL_R = r;
    }

    order = new Array(ATOMS.length);
    px_ = new Float32Array(ATOMS.length);
    py_ = new Float32Array(ATOMS.length);
    pz_ = new Float32Array(ATOMS.length);
    pf_ = new Float32Array(ATOMS.length);
    for (i = 0; i < ATOMS.length; i++) order[i] = i;
  }

  /* pre-rendered shaded spheres — far cheaper than a gradient per atom */
  function makeSprites() {
    sprites = {};
    var S = 72;
    for (var el in ELEMENTS) {
      var e = ELEMENTS[el];
      var cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      var g2 = cv.getContext('2d');
      var grd = g2.createRadialGradient(S * 0.36, S * 0.33, S * 0.03, S * 0.5, S * 0.5, S * 0.49);
      grd.addColorStop(0,    'hsl(' + e.h + ',' + e.s + '%,' + Math.min(96, e.l + 34) + '%)');
      grd.addColorStop(0.45, 'hsl(' + e.h + ',' + e.s + '%,' + e.l + '%)');
      grd.addColorStop(1,    'hsl(' + e.h + ',' + e.s + '%,' + Math.max(5, e.l - 26) + '%)');
      g2.fillStyle = grd;
      g2.beginPath();
      g2.arc(S * 0.5, S * 0.5, S * 0.48, 0, TAU);
      g2.fill();
      sprites[el] = cv;
    }
  }

  /* ---------- hover state ----------
     Pointer proximity to the structure drives a single eased value.
     0 = at rest, 1 = fully expanded. */
  var hoverTarget = 0, hoverEase = 0;
  var pointerX = -1e5, pointerY = -1e5;

  function updateHover(dt) {
    var b = moleculeBox();
    var inside = pointerX >= b.left && pointerX <= b.right &&
                 pointerY >= b.top && pointerY <= b.bottom;
    hoverTarget = inside ? 1 : 0;
    /* time constants: ~520 ms to open, ~900 ms to settle back */
    var tau = (hoverTarget > hoverEase) ? 180 : 320;
    var k = dt / tau;
    if (k > 1) k = 1;
    hoverEase += (hoverTarget - hoverEase) * k;
    if (hoverEase < 0.0004) hoverEase = 0;
    if (hoverEase > 0.9996) hoverEase = 1;

    if (window.PS_onHover) window.PS_onHover(hoverEase, MOL_CX());
  }

  window.addEventListener('pointermove', function (e) {
    pointerX = e.clientX; pointerY = e.clientY;
  }, { passive: true });
  window.addEventListener('pointerleave', function () {
    pointerX = pointerY = -1e5;
  }, { passive: true });

  function drawMolecule(time) {
    if (!ATOMS.length) return;

    var sp = REDUCED ? 0.22 : 1;
    var ry = time * 0.000105 * sp;                                  /* ~60 s / turn */
    var rx = 0.34 + 0.20 * Math.sin(time * 0.000038 * sp);
    var rz = 0.10 * Math.sin(time * 0.000027 * sp + 1.3);

    var cY = Math.cos(ry), sY = Math.sin(ry);
    var cX = Math.cos(rx), sX = Math.sin(rx);
    var cZ = Math.cos(rz), sZ = Math.sin(rz);

    var cx = MOL_CX(), cy = MOL_CY();
    var size = MOL_SIZE();
    var scale = size / MOL_R;
    var camD = 3.4;
    var i, a;

    /* explode: bond lengths grow ~18% at full hover */
    var ex = 1 + hoverEase * 0.18;

    for (i = 0; i < ATOMS.length; i++) {
      a = ATOMS[i];
      /* scale all three axes before rotating, or the structure shears */
      var ax = a.x * ex, ay = a.y * ex, az = a.z * ex;
      var x1 = ax * cY + az * sY;
      var z1 = -ax * sY + az * cY;
      var y2 = ay * cX - z1 * sX;
      var z2 = ay * sX + z1 * cX;
      var x3 = x1 * cZ - y2 * sZ;
      var y3 = x1 * sZ + y2 * cZ;
      var f = camD / (camD + z2 / MOL_R);
      px_[i] = cx + x3 * scale * f;
      py_[i] = cy + y3 * scale * f;
      pz_[i] = z2;
      pf_[i] = f;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    /* bonds first, atoms overlay them */
    ctx.lineCap = 'round';
    for (i = 0; i < BONDS.length; i++) {
      var bd = BONDS[i];
      var ia = bd.a, ib = bd.b;
      var near = 0.5 - 0.25 * ((pz_[ia] + pz_[ib]) / MOL_R);
      if (near < 0) near = 0; else if (near > 1) near = 1;
      var al = bd.co ? (0.22 + 0.46 * near) : (0.055 + 0.135 * near);
      ctx.strokeStyle = 'rgba(214,228,242,' + al.toFixed(4) + ')';
      ctx.lineWidth = (bd.co ? 2.0 : 0.95) * (0.65 + 0.5 * near);
      ctx.beginPath();
      ctx.moveTo(px_[ia], py_[ia]);
      ctx.lineTo(px_[ib], py_[ib]);
      ctx.stroke();
    }

    /* painter's algorithm — furthest first */
    order.sort(function (p, q) { return pz_[q] - pz_[p]; });

    for (var k = 0; k < order.length; k++) {
      i = order[k];
      a = ATOMS[i];
      var e = ELEMENTS[a.el];
      /* small vertex markers, ~40% of the previous sphere size */
      var r = e.rad * scale * pf_[i] * 0.25;
      if (r < 0.3) continue;
      var nz = 0.5 - 0.5 * (pz_[i] / MOL_R);
      if (nz < 0) nz = 0; else if (nz > 1) nz = 1;
      ctx.globalAlpha = 0.34 + 0.54 * nz;
      var s2 = r * 2;
      ctx.drawImage(sprites[a.el], px_[i] - r, py_[i] - r, s2, s2);
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
  }
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 180);
  });

  /* ---------- loop ---------- */
  var frame = 0, lastT = 0;
  function animate(time) {
    var dtHover = time - lastT;
    if (!(dtHover > 0) || dtHover > 48) dtHover = 16.7;
    lastT = time;

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

    updateHover(dtHover);
    drawMolecule(time);

    drawScrim();

    frame++;
    requestAnimationFrame(animate);
  }

  /* ---------- random placement ---------- */
  window.PS = {
    /* keep-out box for the rotating structure, in screen space */
    moleculeBox: moleculeBox,

    placeRandom: function (el, opts) {
      if (!el) return;
      opts = opts || {};
      var basePad = opts.pad != null ? opts.pad : 34;
      var avoid = opts.avoid || [];
      var vw = window.innerWidth, vh = window.innerHeight;
      var r = el.getBoundingClientRect();
      var w = r.width || 150, h = r.height || 22;

      /* normalise avoid entries once */
      var boxes = [];
      for (var i = 0; i < avoid.length; i++) {
        var a = avoid[i];
        if (!a) continue;
        boxes.push((typeof a.getBoundingClientRect === 'function')
                   ? a.getBoundingClientRect() : a);
      }

      function attempt(mx, my, pad, tries) {
        var availW = Math.max(10, vw * (1 - mx * 2) - w);
        var availH = Math.max(10, vh * (1 - my * 2) - h);
        for (var n = 0; n < tries; n++) {
          var x = vw * mx + Math.random() * availW;
          var y = vh * my + Math.random() * availH;
          var ok = true;
          for (var j = 0; j < boxes.length; j++) {
            var b = boxes[j];
            var ox = Math.min(x + w, b.right + pad) - Math.max(x, b.left - pad);
            var oy = Math.min(y + h, b.bottom + pad) - Math.max(y, b.top - pad);
            if (ox > 0 && oy > 0) { ok = false; break; }
          }
          if (ok) return { x: x, y: y };
        }
        return null;
      }

      var mx0 = opts.marginX != null ? opts.marginX : 0.10;
      var my0 = opts.marginY != null ? opts.marginY : 0.12;

      /* Relax breathing room, then margins, before ever accepting an
         overlap. Guarantees the text stays clear of the structure. */
      var ladder = [
        [mx0, my0, basePad, 240],
        [mx0, my0, basePad * 0.55, 200],
        [mx0 * 0.6, my0 * 0.6, basePad * 0.55, 200],
        [mx0 * 0.6, my0 * 0.6, basePad * 0.25, 200],
        [0.035, 0.045, 8, 260],
        [0.02, 0.025, 0, 320]
      ];
      for (var s = 0; s < ladder.length; s++) {
        var hit = attempt(ladder[s][0], ladder[s][1], ladder[s][2], ladder[s][3]);
        if (hit) {
          el.style.left = Math.round(hit.x) + 'px';
          el.style.top = Math.round(hit.y) + 'px';
          return;
        }
      }

      /* Last resort: corner furthest from the first keep-out box. */
      var fx = 0.03 * vw, fy = 0.03 * vh;
      if (boxes.length) {
        var b0 = boxes[0];
        var ccx = (b0.left + b0.right) / 2, ccy = (b0.top + b0.bottom) / 2;
        fx = (ccx > vw / 2) ? 0.03 * vw : vw - w - 0.03 * vw;
        fy = (ccy > vh / 2) ? 0.04 * vh : vh - h - 0.04 * vh;
      }
      el.style.left = Math.round(fx) + 'px';
      el.style.top = Math.round(fy) + 'px';
    }
  };

  buildMolecule();
  makeSprites();
  resize();
  requestAnimationFrame(animate);
})();
