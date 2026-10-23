// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
SIMULATION CASES — the app's designs as case files for the full-wave solvers (Design v1.11, 2026-10-23, pending owner approval).

WHAT IT DOES (plain language):
  Turns what is on screen into the case files that sim/comsol_run.py (and sim/run_openems.py) read: every coil's wire
  path in world mm, its surface normals, its capacitor gaps (the first one is the feed), the wire radius and
  insulation, the field strength and the head phantom, plus our own quasi-static predictions (L, M, k) for the same
  wires so the full-wave results can be compared with them. Same schema as tests/export_case.js.
    fromArray    the solved array, wires as reported (crossover bumps included)
    single       the Element tab's knot, wrapped onto the helmet at the back of the head (as export_case.js)
    pairSweep    the Pair explorer's pair at several centre spacings, wrapped onto the helmet at the back of the head,
                 with the explorer's rotations (each measured from the line joining the centres), crossover bumps
                 between the two coils, and the gaps shifted along the wire to keep them clear of the other coil
  Capacitor gaps come from KC.knot.breaks on the flat knot (crossings are defined there) and are mapped to the same
  index and fraction on the wrapped wire (as the app's port export).

PARAMETERS: position on the helmet = posterior midline at 20 deg elevation (JUDG, as tests/export_case.js);
  gap shift search = 120 steps per gap period (JUDG). Everything else comes from the app's controls.
VALIDATED BY: nothing separately; the case geometry is what the quasi-static tables already use. EXPLORATORY.
*/
(function (factory) {
  var g = typeof globalThis !== 'undefined' ? globalThis : self;
  g.KC = g.KC || {}; g.KC_FACTORIES = g.KC_FACTORIES || [];
  g.KC_FACTORIES.push(factory); factory(g.KC);
  if (typeof module !== 'undefined') module.exports = g.KC;
})(function simcaseModule(KC) {
  'use strict';
  var SC = KC.simcase = {};
  var K = KC.knot, I = KC.ind, S = KC.surface, O = KC.opt;
  SC.ELEVATION = 20 * Math.PI / 180;      // JUDG: posterior midline, 20 deg elevation (tests/export_case.js)

  function arcOf(P) {
    var N = P.length, s = [0];
    for (var i = 0; i < N; i++) { var a = P[i], b = P[(i + 1) % N]; s.push(s[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); }
    return s;
  }
  function segDist(p, A, B) {
    var ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ap = [p[0] - A[0], p[1] - A[1], p[2] - A[2]];
    var t = Math.max(0, Math.min(1, (ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2]) / ((ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]) || 1)));
    return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
  }
  function distToWire(p, W) {
    var m = Infinity, n = W.length;
    for (var i = 0; i < n; i++) m = Math.min(m, segDist(p, W[i], W[(i + 1) % n]));
    return m;
  }
  // gap positions (index, fraction along the flat curve) -> world point and unit tangent on the wrapped wire
  function onWire(world, at) {
    var n = world.length;
    return at.map(function (b) {
      var P0 = world[b.index], P1 = world[(b.index + 1) % n], t = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]], tl = Math.hypot(t[0], t[1], t[2]) || 1;
      return { p: [P0[0] + b.f * t[0], P0[1] + b.f * t[1], P0[2] + b.f * t[2]], t: [t[0] / tl, t[1] / tl, t[2] / tl], index: b.index, f: b.f };
    });
  }

  // Capacitor gaps for one coil. With `others` (wires of the other coils), the whole evenly spaced set is shifted
  // along the wire to the position that keeps the gaps farthest from the other coils, while every gap stays at least
  // `clr` from a crossing (the V10 rule); this is the rule used for the pair cases (DECISIONS 2026-10-21).
  SC.breaks = function (flat, world, nb, clr, others) {
    var bk = K.breaks(flat, nb, clr), best = { shift: 0, at: bk.at, minCross: bk.minDistToCrossing, ok: bk.ok };
    if (others && others.length) {
      var s = arcOf(flat), N = flat.length, L = s[N], xs = [];
      K.crossings(flat).list.forEach(function (c) { xs.push(s[c.i] + c.s * (s[c.i + 1] - s[c.i])); xs.push(s[c.j] + c.t * (s[c.j + 1] - s[c.j])); });
      var period = L / nb, bestD = -1;
      for (var k = 0; k < 120; k++) {                                     // JUDG: 120 trial shifts per gap period
        var arc = bk.arc.map(function (x) { return ((x + period * k / 120) % L + L) % L; });
        var minCross = xs.length ? Math.min.apply(null, arc.map(function (x) {
          return Math.min.apply(null, xs.map(function (c) { var d = ((x - c) % L + L) % L; return Math.min(d, L - d); })); })) : Infinity;
        if (minCross < clr) continue;
        var at = arc.map(function (x) {
          var lo = 0, hi = N; while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (s[mid] <= x) lo = mid; else hi = mid; }
          return { index: lo, f: (x - s[lo]) / ((s[lo + 1] - s[lo]) || 1) };
        });
        var pts = onWire(world, at), dOther = Infinity;
        pts.forEach(function (b) { others.forEach(function (W) { dOther = Math.min(dOther, distToWire(b.p, W)); }); });
        if (dOther > bestD) { bestD = dOther; best = { shift: k / 120 / nb, at: at, minCross: minCross, ok: bk.ok }; }
      }
    }
    var pts2 = onWire(world, best.at), clearOther = Infinity;
    (others || []).forEach(function (W) { pts2.forEach(function (b) { clearOther = Math.min(clearOther, distToWire(b.p, W)); }); });
    return { breaks: pts2, breaksOK: best.ok && best.minCross >= clr, minDistToCrossing: best.minCross, shiftFrac: best.shift,
      gapToOtherCoil_mm: isFinite(clearOther) ? clearOther : null };
  };

  // Quasi-static L, M and k for exactly these wires (the numbers the COMSOL results are compared with).
  SC.quasistatic = function (els, wire) {
    var clear = wire.d + 2 * wire.tIns;
    var L = els.map(function (e) { return I.selfL(e.wire, wire.d / 2, e.normals || null); });
    var M = els.map(function (a, i) { return els.map(function (b, j) { return i === j ? L[i] : I.mutual(a.wire, b.wire, clear); }); });
    var k = M.map(function (row, i) { return row.map(function (m, j) { return i === j ? 1 : m / Math.sqrt(L[i] * L[j]); }); });
    return { L_nH: L, M_nH: M, k: k };
  };

  function caseOf(name, H, B0, wire, nb, els, extra) {
    var qs = SC.quasistatic(els, wire);
    els.forEach(function (e, i) { e.L_nH = qs.L_nH[i]; });
    return Object.assign({ name: name, created: new Date().toISOString(), B0_T: B0, f0_Hz: K.GAMMA_BAR_MHZ_PER_T * 1e6 * B0,
      wire_radius_mm: wire.d / 2, insulation_mm: wire.tIns, nBreaks: nb,
      firstPassCap_pF: els.map(function (e) { return K.capacitor(e.L_nH, nb, B0).perCapPF; }),
      elements: els.map(function (e) { return { wire: e.wire, normals: e.normals, breaks: e.breaks, breaksOK: e.breaksOK,
        minDistToCrossing: e.minDistToCrossing, gapToOtherCoil_mm: e.gapToOtherCoil_mm, feedToOtherCoil_mm: e.feedToOtherCoil_mm,
        stretch_pct: e.stretch_pct, L_nH: e.L_nH }; }),
      phantom: KC.phantom.spec(H, B0), quasistatic: qs, helmet: H }, extra || {});
  }

  // One coil wrapped onto the helmet: kp = {p, q, beta, shape, sharpness, height}, footprint radius Rf (mm).
  // A flat coil much larger than the helmet cannot be wrapped onto it: the projection breaks down and wire points jump
  // tens of mm (seen with footprint 119 mm, 2026-10-23), which COMSOL then cannot build. Refuse with a plain message.
  SC.checkWrap = function (W, Rf) {
    var st = W.map(function (p, i) { var q = W[(i + 1) % W.length]; return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); });
    var med = st.slice().sort(function (a, b) { return a - b; })[Math.floor(st.length / 2)], mx = Math.max.apply(null, st);
    if (mx > 3 && mx > 5 * med)
      throw new Error('this coil (footprint radius ' + Rf.toFixed(0) + ' mm) is too large to wrap onto the helmet; reduce the size or the bloom');
  };
  SC.element = function (H, kp, Rf, theta, centre, wire) {
    var clear = wire.d + 2 * wire.tIns;
    var lift = K.height({ p: kp.p, q: kp.q, beta: kp.beta, size: Rf, bloomMode: 'extent', bloomShape: kp.shape, sharpness: kp.sharpness, height: kp.height || 0 }, clear, 400);
    var flat = K.points({ p: kp.p, q: kp.q, beta: kp.beta, size: Rf, bloomMode: 'extent', bloomShape: kp.shape, sharpness: kp.sharpness,
      theta: theta, h: lift.h, zOff: lift.zOff }, 600);
    var Wr = S.wrap(H, flat, centre);
    SC.checkWrap(Wr.points, Rf);
    return { flat: flat, wire: Wr.points, normals: Wr.normals, frame: Wr.frame };
  };

  SC.fromArray = function (res, B0, nb, clr, label) {
    var H = res.config.helmet, wire = res.config.wire;
    res.wires.forEach(function (W) { SC.checkWrap(W, res.Rf || 0); });
    var els = res.wires.map(function (W, e) {
      var others = res.wires.filter(function (_, j) { return j !== e; }), bk = SC.breaks(res.flats[e], W, nb, clr, null);
      var gapDist = bk.breaks.map(function (b) { return others.reduce(function (m, Wo) { return Math.min(m, distToWire(b.p, Wo)); }, Infinity); });
      return Object.assign({ wire: W, normals: res.normals[e] }, bk, { gapToOtherCoil_mm: Math.min.apply(null, gapDist), feedToOtherCoil_mm: gapDist[0],
        stretch_pct: 100 * (K.wireLength(W) / K.wireLength(res.flats[e]) - 1) });
    });
    return caseOf(label || ('array_N' + res.N + '_' + B0 + 'T'), H, B0, wire, nb, els,
      { purpose: 'COMSOL check of a solved array (Design v1.11)', kMatrix_app: Array.from(res.kMatrix), crossovers: res.crossovers });
  };

  // Pre-flight check before a case goes to COMSOL: anything that would give a broken or meaningless model is refused.
  // Limits (JUDG, from measured designs 2026-10-23): coils that wrap cleanly stretch up to 12% (test arrays
  // N 8-12, T 0-15 mm; the broken 94 mm array coil: 27.5%), so > 15% is refused; wires sit >= 9% outside the head surface, so any wire inside the head is refused;
  // tubes closer than wire diameter + 0.1 mm would be fused by COMSOL (a short); a capacitor gap or port within 2 mm of
  // another coil's wire (centre to centre < 1.5 mm) could short across it. `portsOnly` (arrays, one port per coil): only feed gaps count.
  SC.preflight = function (c, portsOnly) {
    var errors = [], warnings = [], r = c.wire_radius_mm, lim = 2 * r + 0.1, H = c.helmet;
    var E = { a: H.a - KC.field.HEAD_GAP, b: H.b - KC.field.HEAD_GAP, c: H.c - KC.field.HEAD_GAP };
    c.elements.forEach(function (e, i) {
      var tag = c.elements.length > 1 ? 'coil ' + (i + 1) : 'the coil';
      if (e.stretch_pct > 15) errors.push(tag + ' is stretched ' + e.stretch_pct.toFixed(0) + '% by wrapping onto the helmet (too large for the head)');
      var inside = e.wire.some(function (p) { return p[0] * p[0] / (E.a * E.a) + p[1] * p[1] / (E.b * E.b) + p[2] * p[2] / (E.c * E.c) < 1; });
      if (inside) errors.push(tag + ' passes inside the head');
      var g = portsOnly ? e.feedToOtherCoil_mm : e.gapToOtherCoil_mm;
      if (g != null && g < 1.5) errors.push(tag + ': a ' + (portsOnly ? 'port' : 'capacitor gap') + ' is only ' + g.toFixed(1) + ' mm from another coil');
    });
    // closest approach between wires: spatial grid of segment midpoints (3 mm cells), segment-to-segment distances
    var segs = [], grid = new Map(), cell = 3, worst = { d: Infinity };
    c.elements.forEach(function (e, ci) {
      var P = e.wire, n = P.length, s = arcOf(P);
      for (var k = 0; k < n; k++) segs.push({ ci: ci, k: k, n: n, s: s[k], L: s[n], a: P[k], b: P[(k + 1) % n] });
    });
    segs.forEach(function (sg, q) {
      var m = [(sg.a[0] + sg.b[0]) / 2, (sg.a[1] + sg.b[1]) / 2, (sg.a[2] + sg.b[2]) / 2], key = m.map(function (x) { return Math.floor(x / cell); });
      sg.key = key; var ks = key.join(','); if (!grid.has(ks)) grid.set(ks, []); grid.get(ks).push(q);
    });
    segs.forEach(function (sg, q) {
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
        var cl = grid.get([sg.key[0] + dx, sg.key[1] + dy, sg.key[2] + dz].join(',')); if (!cl) continue;
        cl.forEach(function (q2) {
          if (q2 <= q) return;
          var t = segs[q2];
          if (t.ci === sg.ci) { var arc = Math.abs(t.s - sg.s); if (Math.min(arc, sg.L - arc) < 12) return; }   // neighbours on one wire
          var d = K.segSegDist(sg.a, sg.b, t.a, t.b);
          if (d < worst.d) worst = { d: d, i: sg.ci, j: t.ci };
        });
      }
    });
    if (worst.d < lim) errors.push((worst.i === worst.j ? 'coil ' + (worst.i + 1) + ' crosses itself' : 'coils ' + (worst.i + 1) + ' and ' + (worst.j + 1) + ' pass') +
      ' only ' + worst.d.toFixed(2) + ' mm apart (centre to centre; at least ' + lim.toFixed(1) + ' needed); the crossings could not be separated');
    var solves = portsOnly ? c.elements.length : c.elements.reduce(function (m, e) { return m + e.breaks.length; }, 0);
    if (solves > 24) warnings.push(solves + ' COMSOL solves: this will take a long time');   // JUDG: ~25-65 s per solve
    return { errors: errors, warnings: warnings, closest_mm: worst.d, solves: solves };
  };

  SC.single = function (H, kp, Rf, theta, wire, B0, nb, clr) {
    var c0 = S.point(H, -Math.PI / 2, SC.ELEVATION), e = SC.element(H, kp, Rf, theta, c0, wire);
    var el = Object.assign({ wire: e.wire, normals: e.normals, stretch_pct: 100 * (K.wireLength(e.wire) / K.wireLength(e.flat) - 1) },
      SC.breaks(e.flat, e.wire, nb, clr, null));
    return caseOf('single_' + K.name(kp.p, kp.q).replace(/\W+/g, '') + '_' + B0 + 'T', H, B0, wire, nb, [el],
      { purpose: 'COMSOL check of one element (Design v1.11)' });
  };

  // Centres on the posterior ring at SC.ELEVATION, symmetric about the midline, chord distance d.
  SC.pairCentres = function (H, d) {
    var v = SC.ELEVATION, lo = 0, hi = Math.PI / 2;
    for (var it = 0; it < 60; it++) {
      var mid = (lo + hi) / 2;
      if (KC.layout.dist(S.point(H, -Math.PI / 2 - mid, v), S.point(H, -Math.PI / 2 + mid, v)) < d) lo = mid; else hi = mid;
    }
    var al = (lo + hi) / 2;
    return [S.point(H, -Math.PI / 2 - al, v), S.point(H, -Math.PI / 2 + al, v)];
  };

  // The Pair explorer's pair at each spacing. Rotations a1, a2 are measured from the line joining the centres, as in
  // the explorer (and in the solver's stage 1: theta - angle of the joining line in the element's own frame).
  SC.pairSweep = function (H, kp, Rf, a1, a2, spacings, wire, B0, nb, clr) {
    var clear = wire.d + 2 * wire.tIns;
    return spacings.map(function (d) {
      var C = SC.pairCentres(H, d), v = [C[1][0] - C[0][0], C[1][1] - C[0][1], C[1][2] - C[0][2]];
      var th = C.map(function (c, i) { var F = S.frame(H, c); return (i ? a2 : a1) + Math.atan2(S.dot(v, F.e2), S.dot(v, F.e1)); });
      var E = C.map(function (c, i) { return SC.element(H, kp, Rf, th[i], c, wire); });
      var co = O.crossovers(E.map(function (e) { return e.wire; }), E.map(function (e) { return e.normals; }), clear);   // v1.9 bumps
      var els = E.map(function (e, i) {
        var W = co.wires[i];
        return Object.assign({ wire: W, normals: e.normals, stretch_pct: 100 * (K.wireLength(W) / K.wireLength(e.flat) - 1) },
          SC.breaks(e.flat, W, nb, clr, [co.wires[1 - i]]));
      });
      return caseOf('pair_d' + d.toFixed(1) + '_' + B0 + 'T', H, B0, wire, nb, els, {
        purpose: 'COMSOL check of the Pair explorer curve (Design v1.11)', spacing_mm: d,
        pair: { Rf: Rf, a1: a1, a2: a2, knot: kp }, crossovers: { count: co.bumps.length, maxA: co.maxA, capped: co.capped } });
    });
  };
});
