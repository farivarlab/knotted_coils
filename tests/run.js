// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
VALIDATION RUNNER — the pre-registered checks of Design.md §7 (V1–V6 registered in git 39a4e83, V7 in 30d6fa1, V8 in ff1a40e,
V9–V14 in 91c4df5, V15–V20 in 527aba1, V15b in be426cb),
applied mechanically. Pass criteria are copied from Design.md and must not be edited here.

  node tests/run.js        -> prints results; writes validation/validation_report.{json,html}
                              and validation/validation_status.js (read by the browser app)

Checks added AFTER pre-registration are run too, but are labelled "post-hoc" and do not
change any pre-registered verdict.
*/
'use strict';
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
['knot', 'inductance', 'surface', 'layout', 'optimise', 'field'].forEach(function (m) { require(path.join(root, 'core', m + '.js')); });
var KC = globalThis.KC, I = KC.ind, K = KC.knot;

var WIRE = { d: 1.0, tIns: 0.25, minBend: 2 };   // JUDG PLACEHOLDER wire (Design.md D5) until Reza supplies the spec
var results = [];
// KC_ONLY=V9,V10 runs a subset (development only; official runs use all checks and record the git hash)
var ONLY = process.env.KC_ONLY ? process.env.KC_ONLY.split(',') : null;
function want(id) { return !ONLY || ONLY.indexOf(id) >= 0; }
function rec(r) { results.push(r); console.log((r.verdict + '        ').slice(0, 14) + r.id + '  ' + r.title + (r.summary ? '  — ' + r.summary : '')); }

// V1 — Maxwell coaxial circles. Criterion: relative error < 0.5% across 5 separations.
want('V1') && (function () {
  var rows = [], worst = 0;
  [5, 10, 20, 40, 80].forEach(function (d) {
    var num = I.mutual(I.circle(50, 400), I.circle(40, 400, 0, 0, d), 0), ref = I.maxwellCoaxial(50, 40, d), e = (num - ref) / ref;
    worst = Math.max(worst, Math.abs(e)); rows.push({ d_mm: d, numeric_nH: num, maxwell_nH: ref, relErr: e });
  });
  rec({ id: 'V1', title: 'Mutual inductance, coaxial circles (r = 50, 40 mm; 400 points) vs Maxwell',
    criterion: 'relative error < 0.5% at all 5 separations', verdict: worst < 0.005 ? 'PASS' : 'FAIL',
    summary: 'worst ' + (worst * 100).toFixed(4) + '%', rows: rows,
    reference: 'Rosa & Grover 1912, Bull. Bureau of Standards 8:1–237, p. 6 eq. [1] — VERIFIED' });
})();

// V2 — circle self-inductance (surface current). Criterion: relative error < 2% for R/a >= 50.
want('V2') && (function () {
  var rows = [], worst = 0;
  [50, 100, 200].forEach(function (ra) {
    var a = 50 / ra, num = I.selfL(I.circle(50, 400), a), ref = I.circleSelfL(50, a), e = (num - ref) / ref;
    worst = Math.max(worst, Math.abs(e)); rows.push({ R_over_a: ra, numeric_nH: num, closedForm_nH: ref, relErr: e });
  });
  rec({ id: 'V2', title: 'Self-inductance, circular loop R = 50 mm (400 points) vs mu0 R (ln(8R/a) - 2)',
    criterion: 'relative error < 2% for R/a >= 50', verdict: worst < 0.02 ? 'PASS' : 'FAIL',
    summary: 'worst ' + (worst * 100).toFixed(3) + '%', rows: rows,
    reference: 'Rosa & Grover 1912, p. 111 eq. [62] (surface current; leading term) — VERIFIED' });
})();

// V3 — zero-coupling spacing of two coplanar equal circles. Criterion: within 1% of the VERIFIED value.
want('V3') && (function () {
  var R = 50, n = 400, a = WIRE.d / 2, c = WIRE.d + 2 * WIRE.tIns, A = I.prep(I.circle(R, n)), L = I.selfL(I.circle(R, n), a);
  function k(d) { return I.mutual(A, I.circle(R, n, d, 0, 0), c) / L; }
  var lo = 60, hi = 90;
  for (var i = 0; i < 40; i++) { var m = 0.5 * (lo + hi); if (k(m) > 0) lo = m; else hi = m; }
  var ratio = 0.5 * (lo + hi) / (2 * R), vsPatent = (ratio - 0.75) / 0.75;
  rec({ id: 'V3', title: 'Zero-coupling centre spacing, two coplanar circles',
    criterion: 'within 1% of the VERIFIED literature value', verdict: 'NOT EVALUABLE',
    summary: 'computed spacing = ' + ratio.toFixed(4) + ' x diameter; no VERIFIED reference value available',
    rows: [{ computed_spacing_over_diameter: ratio, patent_value: 0.75, diff_vs_patent: vsPatent }],
    reference: 'Roemer et al. 1990 MRM 16:192 — UNVERIFIED (paywalled, not read). Closest primary text read: ' +
      'Roemer & Edelstein, US 4,825,162 (1989), "D approximately equal to 0.75d" (PARAPHRASE-ONLY; Google Patents OCR text). ' +
      'Exploratory comparison only: ' + (vsPatent * 100).toFixed(2) + '% from the patent\'s approximate value.' });
})();

// V4 — convergence. Criterion: k changes < 0.001 when the point count doubles.
want('V4') && (function () {
  var kp = { p: 2, q: 3, beta: 0.4 }, Rf = 40, rows = [], worst = 0;
  [[0, 0], [0.3, 0.7]].forEach(function (ang) {
    [1.14, 1.6].forEach(function (dn) {
      function k(n) {
        var c = WIRE.d + 2 * WIRE.tIns, h = 0.75;
        var A = KC.opt.elementPoints(kp, Rf, ang[0], h, n), B = KC.opt.elementPoints(kp, Rf, ang[1], h, n).map(function (p) { return [p[0] + dn * Rf, p[1], p[2]]; });
        return I.mutual(A, B, c) / Math.sqrt(I.selfL(A, WIRE.d / 2) * I.selfL(B, WIRE.d / 2));
      }
      var k300 = k(300), k600 = k(600), k160 = k(160), dk = Math.abs(k600 - k300);
      worst = Math.max(worst, dk); rows.push({ dOverRf: dn, rot: ang, k160: k160, k300: k300, k600: k600, change300to600: dk });
    });
  });
  rec({ id: 'V4', title: 'Convergence of k, trefoil pair (Rf = 40 mm), 300 -> 600 points (final-report resolution)',
    criterion: '|k(2n) - k(n)| < 0.001', verdict: worst < 0.001 ? 'PASS' : 'FAIL', summary: 'worst change ' + worst.toExponential(2), rows: rows,
    note: 'k160 (stage-2 search resolution) shown for information; the criterion applies to the reported resolution (300).' });
})();

// V5 — symmetry. Criterion: M_ij = M_ji to machine precision; k invariant under rotating both by 2pi/q.
want('V5') && (function () {
  var rows = [], worst = 0;
  [[2, 3], [3, 4], [2, 5], [3, 8]].forEach(function (pq) {
    var kp = { p: pq[0], q: pq[1], beta: 0.4 }, n = 40 * pq[1], Rf = 40, c = 1.5, rot = 2 * Math.PI / pq[1];
    function pair(a1, a2) {
      var A = KC.opt.elementPoints(kp, Rf, a1, 0.75, n), B = KC.opt.elementPoints(kp, Rf, a2, 0.75, n).map(function (p) { return [p[0] + 50, p[1], p[2]]; });
      return [A, B];
    }
    var P = pair(0.2, 0.5), Mab = I.mutual(P[0], P[1], c), Mba = I.mutual(P[1], P[0], c);
    var Q = pair(0.2 + rot, 0.5 + rot), Mrot = I.mutual(Q[0], Q[1], c);
    var e1 = Math.abs(Mab - Mba) / Math.abs(Mab), e2 = Math.abs(Mrot - Mab) / Math.abs(Mab);
    worst = Math.max(worst, e1, e2); rows.push({ knot: 'T(' + pq + ')', swapRelDiff: e1, rotRelDiff: e2 });
  });
  rec({ id: 'V5', title: 'Symmetry: swap of the two elements, and rotation of both by 2pi/q',
    criterion: 'relative difference < 1e-9 (machine-precision level)', verdict: worst < 1e-9 ? 'PASS' : 'FAIL',
    summary: 'worst ' + worst.toExponential(2), rows: rows });
})();

// V6 — topology preserved under bloom, for every catalogue knot (q = 1..8), core radius 30 mm.
want('V6') && (function () {
  // v1.2 (2026-10-20): bloom range extended to Design v1.2 beta_max = 3.0 for the outward shape; criterion unchanged.
  var betas = [0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.2, 1.6, 2.0, 2.5, 3.0], c = WIRE.d + 2 * WIRE.tIns, rows = [], allOK = true;
  // Harness fix after run 1 (logged in DECISIONS.md): the reference over/under pattern is taken at the
  // nominal bloom beta = 0.4, not at the first (most degenerate) beta; point count is adaptive. Criterion unchanged.
  K.catalogue().forEach(function (row) {
    var fails = [], ref = { p: row.p, q: row.q, beta: 0.4, size: 30, bloomMode: 'core' };
    var nRef = K.adaptiveN(ref), refPat = K.crossings(K.points(Object.assign({}, ref, { h: K.solveLift(ref, c, nRef).h }), nRef)).pattern;
    betas.forEach(function (b) {
      var prm = { p: row.p, q: row.q, beta: b, size: 30, bloomMode: 'core' }, n = K.adaptiveN(prm);
      var lift = K.solveLift(prm, c, n), P = K.points(Object.assign({}, prm, { h: lift.h }), n), cr = K.crossings(P);
      var ok = cr.list.length === row.crossings && K.samePattern(refPat, cr.pattern) && lift.feasible && lift.clearance >= c - 1e-9;
      if (!ok) fails.push({ beta: b, crossings: cr.list.length, expected: row.crossings, patternSame: K.samePattern(refPat, cr.pattern),
        liftFeasible: lift.feasible, clearance: lift.clearance });
    });
    if (fails.length) allOK = false;
    rows.push({ knot: row.name + ' T(' + row.p + ',' + row.q + ')', pass: fails.length === 0, fails: fails });
  });
  rec({ id: 'V6', title: 'Topology and clearance across bloom beta = 0.02–3.0, Design v1.2 outward bloom (catalogue knots, core R = 30 mm, placeholder wire)',
    criterion: 'crossing count and over/under pattern unchanged; minimum self-clearance >= d_w + 2 t_i', verdict: allOK ? 'PASS' : 'FAIL',
    summary: rows.filter(function (r) { return !r.pass; }).map(function (r) { return r.knot + ' fails at beta=' + r.fails.map(function (f) { return f.beta; }).join(','); }).join('; ') || 'all knots pass',
    rows: rows });
})();

// V7 — topology under petal sharpness (pre-registered in Design.md v1.3, git 30d6fa1, before this code ran).
want('V7') && (function () {
  var ms = [1, 1.5, 2, 3, 4, 6, 8, 12, 16], betas = [0.1, 0.4, 0.8, 1.5, 3.0], c = WIRE.d + 2 * WIRE.tIns, rows = [], allOK = true;
  K.catalogue().forEach(function (row) {
    var ref = { p: row.p, q: row.q, beta: 0.4, size: 30, bloomMode: 'core', sharpness: 1 }, nRef = K.adaptiveN(ref);
    var refPat = K.crossings(K.points(Object.assign({}, ref, { h: K.solveLift(ref, c, nRef).h }), nRef)).pattern, fails = [], minBend = Infinity;
    ms.forEach(function (m) {
      betas.forEach(function (b) {
        var prm = { p: row.p, q: row.q, beta: b, size: 30, bloomMode: 'core', sharpness: m }, n = K.adaptiveN(prm);
        var lift = K.solveLift(prm, c, n), P = K.points(Object.assign({}, prm, { h: lift.h }), n), cr = K.crossings(P);
        minBend = Math.min(minBend, K.minBendRadius(P));
        var ok = cr.list.length === row.crossings && K.samePattern(refPat, cr.pattern) && lift.feasible && lift.clearance >= c - 1e-9;
        if (!ok) fails.push({ m: m, beta: b, crossings: cr.list.length, patternSame: K.samePattern(refPat, cr.pattern), liftFeasible: lift.feasible, clearance: lift.clearance });
      });
    });
    if (fails.length) allOK = false;
    rows.push({ knot: row.name + ' T(' + row.p + ',' + row.q + ')', pass: fails.length === 0, fails: fails, minBendRadius_info: minBend });
  });
  rec({ id: 'V7', title: 'Topology and clearance across petal sharpness m = 1–16 x bloom 0.1–3.0 (catalogue knots, core R = 30 mm, placeholder wire)',
    criterion: 'crossing count = q(p-1); pattern equal to m=1, beta=0.4; lift solvable with clearance >= d_w + 2 t_i', verdict: allOK ? 'PASS' : 'FAIL',
    summary: rows.filter(function (r) { return !r.pass; }).map(function (r) { return r.knot + ' fails at ' + r.fails.map(function (f) { return 'm=' + f.m + '/b=' + f.beta; }).join(','); }).join('; ') || 'all knots pass at all 45 (m, beta) points',
    rows: rows, note: 'Tightest bend radius per knot is shown for information only (not part of the criterion).' });
})();

// V8 — on-axis field of a circular loop vs closed form (pre-registered in Design.md v1.5, git ff1a40e).
want('V8') && (function () {
  var W = I.prep(I.circle(50, 400)), rows = [], worst = 0;
  [0, 10, 20, 40, 80].forEach(function (z) {
    var num = KC.field.magnitude(W, 0, 0, z), ref = KC.field.onAxisLoop(50, z), e = (num - ref) / ref;
    worst = Math.max(worst, Math.abs(e)); rows.push({ z_mm: z, numeric_uT_per_A: num, closedForm_uT_per_A: ref, relErr: e });
  });
  rec({ id: 'V8', title: 'B1 (Biot–Savart) on the axis of a circular loop, R = 50 mm, 400 points, vs closed form',
    criterion: 'relative error < 0.5% at z = 0, 10, 20, 40, 80 mm', verdict: worst < 0.005 ? 'PASS' : 'FAIL',
    summary: 'worst ' + (worst * 100).toFixed(4) + '%', rows: rows, reference: 'Closed form DERIVED from Biot–Savart (core/field.js header); not a literature value' });
})();

// ---------------- Design v1.6 checks (pre-registered in Design.md §7, git 91c4df5, before their code) ----------------
var V16_KNOT = { p: 2, q: 3, beta: 0.8, shape: 'outward', sharpness: 1 };
function helmetDefaults() { return JSON.parse(JSON.stringify(KC.surface.DEFAULTS)); }
function solve(N, knot, extra, which) {
  return KC.opt.run({ N: N, knot: knot, wire: WIRE, helmet: helmetDefaults(), opts: Object.assign({ seed: 1 }, extra) }, null, which || 'fast');
}
var V9_ARRAYS = null;
function v9Arrays() {
  if (!V9_ARRAYS) V9_ARRAYS = [
    { name: 'T(2,3) b=0.8 N=16 ring', r: solve(16, V16_KNOT, { layout: 'ring' }) },
    { name: 'T(2,5) b=0.8 m=2 N=24 ring', r: solve(24, { p: 2, q: 5, beta: 0.8, shape: 'outward', sharpness: 2 }, { layout: 'ring' }) }
  ];
  return V9_ARRAYS;
}

// V9 — exact left-right symmetry of ring layouts.
want('V9') && (function () {
  var rows = [], ok = true;
  v9Arrays().forEach(function (A) {
    var r = A.r, N = r.N, wErr = 0, kErr = 0, kMidErr = 0, pairsChecked = 0;
    r.elements.forEach(function (e, i) {
      if (e.midline || e.twin == null) return;
      // mirrored elements run in reversed point order (same curve; current circulates the same way seen from outside),
      // so point t of one twin corresponds to point (n - t) mod n of the other (harness updated 2026-10-20, criterion unchanged)
      var j = e.twin, Wi = r.wires[i], Wj = r.wires[j], nW = Wi.length;
      for (var t = 0; t < nW; t++) { var u = (nW - t) % nW; wErr = Math.max(wErr, Math.abs(Wi[t][0] + Wj[u][0]), Math.abs(Wi[t][1] - Wj[u][1]), Math.abs(Wi[t][2] - Wj[u][2])); }
    });
    var P = r.elements.map(function (e, i) { return e.midline || e.twin == null ? i : e.twin; });
    for (var a = 0; a < N; a++) for (var b = a + 1; b < N; b++) {
      var d = Math.abs(r.kMatrix[a * N + b] - r.kMatrix[P[a] * N + P[b]]);
      if (r.elements[a].midline || r.elements[b].midline) kMidErr = Math.max(kMidErr, d); else kErr = Math.max(kErr, d);
      pairsChecked++;
    }
    var pass = wErr < 1e-9 && kErr < 1e-9 && kMidErr < 1e-3;
    if (!pass) ok = false;
    rows.push({ array: A.name, maxWireMirrorErr_mm: wErr, maxKErr_nonMidline: kErr, maxKErr_midlinePairs: kMidErr, pairsChecked: pairsChecked, pass: pass });
  });
  rec({ id: 'V9', title: 'Ring layouts are exactly left-right symmetric (wires and coupling matrix)',
    criterion: 'mirror pairs: wires < 1e-9 mm; k < 1e-9 (no midline element), < 1e-3 (midline pairs)', verdict: ok ? 'PASS' : 'FAIL',
    summary: rows.map(function (x) { return x.array + ': wire ' + x.maxWireMirrorErr_mm.toExponential(1) + ' mm, k ' + x.maxKErr_nonMidline.toExponential(1) + ' / midline ' + x.maxKErr_midlinePairs.toExponential(1); }).join('; '), rows: rows });
})();

// V10 — capacitor break placement.
want('V10') && (function () {
  var rows = [], ok = true, infeasible = 0, total = 0;
  K.catalogue().forEach(function (row) {
    [0.4, 1.5].forEach(function (b) { [1, 4].forEach(function (m) { [4, 8].forEach(function (nb) {
      var prm = { p: row.p, q: row.q, beta: b, size: 30, bloomMode: 'core', sharpness: m }, n = K.adaptiveN(prm);
      var P = K.points(Object.assign({}, prm, { h: 1 }), n), bk = K.breaks(P, nb, 5); total++;
      if (!bk.ok) { infeasible++; rows.push({ knot: 'T(' + row.p + ',' + row.q + ')', beta: b, m: m, breaks: nb, reported: 'infeasible', minD: bk.minDistToCrossing, ratio: bk.segRatio }); return; }
      var viol = bk.minDistToCrossing < 5 - 1e-9 || bk.segRatio > 1.5 + 1e-9;   // re-check the reported success
      if (viol) ok = false;
      if (viol) rows.push({ knot: 'T(' + row.p + ',' + row.q + ')', beta: b, m: m, breaks: nb, reported: 'ok', minD: bk.minDistToCrossing, ratio: bk.segRatio, violation: true });
    }); }); });
  });
  rec({ id: 'V10', title: 'Capacitor breaks: >= 5 mm from every crossing pass, segments within 1.5x, whenever placement reports success',
    criterion: 'no reported success violates clearance or segment ratio; infeasible cases counted, not failed', verdict: ok ? 'PASS' : 'FAIL',
    summary: (total - infeasible) + ' of ' + total + ' placed successfully; ' + infeasible + ' reported infeasible', rows: rows });
})();

// V11 — capacitor value vs closed form n/(w^2 L), L from the verified ring formula.
want('V11') && (function () {
  var rows = [], worst = 0, a = 0.5, R = 50, Lnum = I.selfL(I.circle(R, 400), a), Lcf = I.circleSelfL(R, a);
  [4, 8].forEach(function (nb) { [3, 7].forEach(function (B0) {
    var ours = K.capacitor(Lnum, nb, B0).perCapPF, w = 2 * Math.PI * K.GAMMA_BAR_MHZ_PER_T * 1e6 * B0, ref = nb / (w * w * Lcf * 1e-9) * 1e12, e = (ours - ref) / ref;
    worst = Math.max(worst, Math.abs(e)); rows.push({ breaks: nb, B0: B0, ours_pF: ours, closedForm_pF: ref, relErr: e });
  }); });
  rec({ id: 'V11', title: 'Capacitor value, circular loop R = 50 mm, wire radius 0.5 mm, vs n/(w^2 L) with Rosa & Grover L',
    criterion: 'relative error < 1%', verdict: worst < 0.01 ? 'PASS' : 'FAIL', summary: 'worst ' + (worst * 100).toFixed(3) + '%', rows: rows,
    note: 'Audit A3: this is a CONSISTENCY check - the closed form uses the same C = n/(w^2 L) expression as the code, so V11 can only fail if V2 (inductance) fails.' });
})();

// V12 — face exclusion zones respected (V9 arrays here; C2 arrays from tests/compare_ring_vs_free.js output).
want('V12') && (function () {
  var rows = [], ok = true;
  v9Arrays().forEach(function (A) { rows.push({ array: A.name, wirePointsInZones: A.r.zoneViolations }); if (A.r.zoneViolations !== 0) ok = false; });
  var c2 = path.join(root, 'validation', 'compare_ring_vs_free.json'), c2note = 'C2 arrays: not yet run';
  if (fs.existsSync(c2)) {
    var C = JSON.parse(fs.readFileSync(c2, 'utf8'));
    C.rows.forEach(function (x) { ['free', 'ring'].forEach(function (arm) { rows.push({ array: 'C2 ' + x.config + ' ' + arm, wirePointsInZones: x[arm].zoneViolations }); if (x[arm].zoneViolations !== 0) ok = false; }); });
    c2note = 'C2 arrays included (' + C.generated + ')';
  }
  rec({ id: 'V12', title: 'No wire point inside a face exclusion zone (V9 and C2 arrays)', criterion: 'zero wire points inside any zone',
    verdict: !fs.existsSync(c2) ? 'NOT EVALUABLE' : ok ? 'PASS' : 'FAIL', summary: rows.map(function (x) { return x.array + ': ' + x.wirePointsInZones; }).join('; ') + ' — ' + c2note, rows: rows });
})();

// V13 — reproducibility: same configuration and seed solved twice.
want('V13') && (function () {
  var rows = [], ok = true;
  [{ name: 'free fast N=16', extra: { layout: 'free' } }, { name: 'ring N=16', extra: { layout: 'ring' } }].forEach(function (c) {
    var a = solve(16, V16_KNOT, c.extra), b = solve(16, V16_KNOT, c.extra), dc = 0, dt = 0, dk = 0;
    a.centres.forEach(function (p, i) { dc = Math.max(dc, Math.abs(p[0] - b.centres[i][0]), Math.abs(p[1] - b.centres[i][1]), Math.abs(p[2] - b.centres[i][2])); });
    a.theta.forEach(function (t, i) { dt = Math.max(dt, Math.abs(t - b.theta[i])); });
    for (var i = 0; i < a.kMatrix.length; i++) dk = Math.max(dk, Math.abs(a.kMatrix[i] - b.kMatrix[i]));
    var pass = dc === 0 && dt === 0 && dk === 0; if (!pass) ok = false;
    rows.push({ config: c.name, maxCentreDiff: dc, maxThetaDiff: dt, maxKDiff: dk, pass: pass });
  });
  rec({ id: 'V13', title: 'Reproducibility: same configuration + seed gives identical layout and k matrix', criterion: 'all differences exactly 0',
    verdict: ok ? 'PASS' : 'FAIL', summary: rows.map(function (x) { return x.config + (x.pass ? ' identical' : ' DIFFERS'); }).join('; '), rows: rows });
})();

// V14 — B1 implementation vs Magpylib (Tier 1). Exports identical thinned wires + points, runs tests/b1_crosscheck.py.
// v1.8: the harness is shared with V22 (thick knots): b1Crosscheck(id, title, buildCases, tag).
function b1Crosscheck(id, title, buildCases, tag) {
  var F = KC.field, cases = [];
  function thin(P) { var st = Math.max(1, Math.ceil(P.length / 200)); return P.filter(function (_, i) { return i % st === 0; }); }   // same as KC.field.prepWires
  function segDist(p, W) {
    var m = Infinity;
    for (var i = 0; i < W.length; i++) {
      var A = W[i], B = W[(i + 1) % W.length], ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ap = [p[0] - A[0], p[1] - A[1], p[2] - A[2]];
      var t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1)));
      m = Math.min(m, Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]));
    }
    return m;
  }
  var rnd = KC.layout.rng(20261020);
  function addCase(name, wires, H) {
    var W = wires.map(thin), pts = [];
    // ~600 head-interior points (three slice planes), 300 near-wire points (5-20 mm away), 100 far points
    ['axial', 'coronal', 'sagittal'].forEach(function (pl, k) { F.slicePoints(H, pl, [40, 0, 0][k], 30).pts.forEach(function (p) { if (p && pts.length < 600 * (k + 1) / 3) pts.push(p); }); });
    for (var i = 0; i < 300; i++) {
      var w = W[Math.floor(rnd() * W.length)], v = w[Math.floor(rnd() * w.length)], d = 5 + 15 * rnd(), u = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], ul = Math.hypot(u[0], u[1], u[2]) || 1;
      pts.push([v[0] + d * u[0] / ul, v[1] + d * u[1] / ul, v[2] + d * u[2] / ul]);
    }
    for (var j = 0; j < 100; j++) { var a = 2 * Math.PI * rnd(), z = 2 * rnd() - 1, r = 200 + 200 * rnd(), s = Math.sqrt(1 - z * z); pts.push([r * s * Math.cos(a), r * s * Math.sin(a), r * z]); }
    var preps = W.map(function (w) { return I.prep(w); });
    var ours = pts.map(function (p) { var bx = 0, by = 0, bz = 0; preps.forEach(function (Wp) { var b = F.vector(Wp, p[0], p[1], p[2]); bx += b[0]; by += b[1]; bz += b[2]; }); return Math.hypot(bx, by, bz); });
    var dist = pts.map(function (p) { return Math.min.apply(null, W.map(function (w) { return segDist(p, w); })); });
    cases.push({ name: name, wires: W, points: pts, ours_uT: ours, dist_mm: dist });
  }
  var H = helmetDefaults();
  buildCases(addCase, H);
  fs.writeFileSync(path.join(root, 'validation', 'b1_crosscheck' + tag + '_input.json'), JSON.stringify({ generated: new Date().toISOString(), cases: cases }));
  var py = process.env.KC_PYTHON || 'C:/Users/reza/.venvs/knotted_coils/Scripts/python.exe', res = null, err = null;
  try { require('child_process').execFileSync(py, [path.join(root, 'tests', 'b1_crosscheck.py')].concat(tag ? [tag] : []), { stdio: 'pipe' });
    res = JSON.parse(fs.readFileSync(path.join(root, 'validation', 'b1_crosscheck' + tag + '_result.json'), 'utf8'));
  } catch (e) { err = String(e.message || e).slice(0, 300); }
  rec({ id: id, title: title,
    criterion: 'relative difference < 0.5% at every point >= 10 mm from any wire', verdict: res ? res.verdict : 'NOT RUN',
    summary: res ? res.cases.map(function (c) { return c.name + ': worst ' + (100 * c.worst_rel_diff_ge10mm).toFixed(4) + '% (' + c.n_criterion_points + ' pts)'; }).join('; ') + ' — Magpylib ' + res.magpylib_version : 'Python/Magpylib not available: ' + err,
    rows: res ? res.cases : [], reference: 'Magpylib 6.0.0 current.Polyline (Ortner & Coliado Bandeira 2020, SoftwareX 11:100466, doi:10.1016/j.softx.2020.100466)' });
}
want('V14') && b1Crosscheck('V14', 'B1 implementation vs independent library (Magpylib) on identical wires, ~1000 points per case', function (addCase, H) {
  var flatTref = K.points({ p: 2, q: 3, beta: 0.8, size: 30, bloomMode: 'core', h: 0.8 }, 400).map(function (p) { return [p[0], p[1], p[2] + 60]; });
  addCase('(a) one flat trefoil (z = 60 mm)', [flatTref], H);
  var t25 = K.points({ p: 2, q: 5, beta: 1.5, size: 30, bloomMode: 'core', sharpness: 4, h: 1.0 }, 2000).map(function (p) { return [p[0], p[1], p[2] + 60]; });
  addCase('(b) one T(2,5) element, beta 1.5, m 4 (z = 60 mm)', [t25], H);
  var arr = solve(16, V16_KNOT, { layout: 'free' });
  addCase('(c) solved 16-element array (free, fast, seed 1)', arr.wires, H);
}, '');

// ---------------- Design v1.8 checks (pre-registered in Design.md §7, git 979b1fa, before their code) ----------------
// V21 — thickness control T.
want('V21') && (function () {
  var c = WIRE.d + 2 * WIRE.tIns, Ts = [0, 5, 10, 20, 40], rows = [], ok = true, counted = { a: 0, b: 0, c: 0, d: 0 };
  K.catalogue().forEach(function (row) {
    [0.4, 1.5].forEach(function (b) { [1, 4].forEach(function (m) {
      var base = { p: row.p, q: row.q, beta: b, size: 30, bloomMode: 'core', sharpness: m }, n = K.adaptiveN(base);
      var lift0 = K.solveLift(base, c, n), P17 = K.points(Object.assign({}, base, { h: lift0.h }), n);   // the v1.7 construction
      var pat0 = K.crossings(P17).pattern;
      Ts.forEach(function (T) {
        var prm = Object.assign({}, base, { height: T }), H = K.height(prm, c, n);
        var P = K.points(Object.assign({}, prm, { h: H.h, zOff: H.zOff }), n), fails = [];
        if (T === 0) {                                                                       // (a)
          counted.a++;
          var d = 0; P.forEach(function (p, i) { d = Math.max(d, Math.abs(p[0] - P17[i][0]), Math.abs(p[1] - P17[i][1]), Math.abs(p[2] - P17[i][2])); });
          if (d !== 0) fails.push('(a) differs from v1.7 by ' + d);
        }
        var zs = P.map(function (p) { return p[2]; }), zMax = Math.max.apply(null, zs), zMin = Math.min.apply(null, zs);
        if (T > 2 * H.hMin) {                                                                // (b)
          counted.b++;
          if (Math.abs((zMax - zMin) - T) > 0.01 * T) fails.push('(b) thickness ' + (zMax - zMin).toFixed(3) + ' vs ' + T);
          if (zMin < -H.hMin - 1e-9) fails.push('(b) lowest point ' + zMin + ' below -hMin ' + (-H.hMin));
        } else if (T > 0) {                                                                  // (d)
          counted.d++;
          if (!(H.h === H.hMin && H.clamped)) fails.push('(d) T below the minimum not clamped and flagged');
        }
        counted.c++;                                                                         // (c)
        var cr = K.crossings(P);
        if (cr.list.length !== row.crossings) fails.push('(c) crossings ' + cr.list.length + ' vs ' + row.crossings);
        if (!K.samePattern(pat0, cr.pattern)) fails.push('(c) over/under pattern changed');
        if (!(H.feasible && H.clearance >= c - 1e-9)) fails.push('(c) clearance ' + H.clearance);
        if (fails.length) { ok = false; rows.push({ knot: 'T(' + row.p + ',' + row.q + ')', beta: b, m: m, T: T, hMin: H.hMin, fails: fails }); }
      });
    }); });
  });
  rec({ id: 'V21', title: 'Thickness control T: v1.7 reproduced at T = 0; thickness and outward-only placement; topology and clearance (catalogue x beta {0.4, 1.5} x m {1, 4} x T {0, 5, 10, 20, 40} mm)',
    criterion: '(a) T = 0 identical to v1.7; (b) thickness within 1% of T and min z >= -hMin; (c) crossings, pattern, clearance; (d) T < 2 hMin clamped and flagged',
    verdict: ok ? 'PASS' : 'FAIL',
    summary: ok ? 'all pass (' + counted.a + ' (a), ' + counted.b + ' (b), ' + counted.c + ' (c), ' + counted.d + ' (d) evaluations)' : rows.length + ' failing cases: ' + rows.slice(0, 5).map(function (r) { return r.knot + ' b' + r.beta + ' m' + r.m + ' T' + r.T + ': ' + r.fails.join(', '); }).join('; '),
    rows: rows });
})();

// V22 — B1 vs Magpylib on thick knots (same harness and criterion as V14).
want('V22') && b1Crosscheck('V22', 'B1 implementation vs Magpylib on thick knots (v1.8), same harness and criterion as V14', function (addCase, H) {
  var c = WIRE.d + 2 * WIRE.tIns, prm = { p: 2, q: 3, beta: 0.8, size: 30, bloomMode: 'core', sharpness: 1, height: 30 }, n = 400;
  var hh = K.height(prm, c, n), P = K.points(Object.assign({}, prm, { h: hh.h, zOff: hh.zOff }), n).map(function (p) { return [p[0], p[1], p[2] + 60]; });
  addCase('(d) one T(2,3), beta 0.8, core R 30 mm, T = 30 mm (base plane z = 60 mm)', [P], H);
  var arr = solve(16, Object.assign({}, V16_KNOT, { height: 15 }), { layout: 'free' });
  addCase('(e) solved 16-element free array, T(2,3) beta 0.8, T = 15 mm (seed 1)', arr.wires, H);
}, '_v22');

// V23 — self-inductance of a tilted circle (v1.8 perpendicular offset).
want('V23') && (function () {
  var R = 50, a = 0.5, n = 400, rows = [], ok = true, ref = I.circleSelfL(R, a);
  function tilted(deg) {
    var t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    return I.circle(R, n).map(function (p) { return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; });
  }
  function selfL17(P) { return I.mutual(P, P.map(function (p) { return [p[0], p[1], p[2] + a]; }), 0); }   // v1.7 method, information only
  var L0 = I.selfL(tilted(0), a);
  [0, 30, 60, 80].forEach(function (deg) {
    var P = tilted(deg), L = I.selfL(P, a), eRot = (L - L0) / L0, eRG = (L - ref) / ref;
    var pass = Math.abs(eRot) < 0.005 && Math.abs(eRG) < 0.02;
    if (!pass) ok = false;
    rows.push({ tilt_deg: deg, L_nH: L, relToUntilted: eRot, relToRosaGrover: eRG, v17_method_L_nH_info: selfL17(P), pass: pass });
  });
  rec({ id: 'V23', title: 'Self-inductance of a tilted circle (R = 50 mm, a = 0.5 mm): v1.8 perpendicular offset',
    criterion: 'within 0.5% of the untilted value at 0/30/60/80 deg and within 2% of Rosa & Grover eq. [62]', verdict: ok ? 'PASS' : 'FAIL',
    summary: rows.map(function (r) { return r.tilt_deg + '°: ' + (100 * r.relToUntilted).toFixed(3) + '% vs flat, ' + (100 * r.relToRosaGrover).toFixed(2) + '% vs R&G (v1.7 method ' + r.v17_method_L_nH_info.toFixed(1) + ' nH)'; }).join('; '),
    rows: rows, reference: 'Rotation invariance (exact) + Rosa & Grover 1912 eq. [62] (VERIFIED, sources/)' });
})();

// ---------------- Design v1.7 checks V15-V20 (pre-registered in Design.md §7, git 527aba1 / be426cb) ----------------
// The full-wave runs happen in Python (sim/run_openems.py + sim/cosim.py); this block reads their cosim.json outputs so
// the verdicts reach this report and the app banner (audit M1). Official set = untagged sim/out/<case>/ folders
// (thin-curve wires, 1 mm grid). Missing results -> NOT RUN, never PASS.
(function () {
  var simOut = path.join(root, 'sim', 'out');
  function load(name) { var f = path.join(simOut, name, 'cosim.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; }
  function all() { return fs.existsSync(simOut) ? fs.readdirSync(simOut).filter(function (d) { return d.indexOf('_') > 0 && !/_(res|curve|addwire)/.test(d) && fs.existsSync(path.join(simOut, d, 'cosim.json')); }).map(function (d) { return load(d); }) : []; }
  var loop = load('loop_air_3T'), hist = load('loop_air_3T_addwire_res1.0');
  want('V15') && rec({ id: 'V15', title: 'Full-wave loop resonance with first-pass capacitors vs prediction (openEMS, thin curves, 1 mm grid)',
    criterion: 'within ±5% of 127.73 MHz', verdict: !loop || !loop.V15 || loop.V15.rel_err == null ? 'NOT RUN' : Math.abs(loop.V15.rel_err) <= 0.05 ? 'PASS' : 'FAIL',
    summary: loop && loop.V15 ? 'resonance ' + (loop.V15.resonance_MHz || NaN).toFixed(2) + ' MHz (' + (100 * loop.V15.rel_err).toFixed(1) + '%)' +
      (hist && hist.V15 ? '; first run with AddWire: ' + (100 * hist.V15.rel_err).toFixed(1) + '%' : '') : 'no result', rows: loop ? [loop.V15, loop.thin_wire_calibration] : [] });
  var tre = load('trefoil_air_3T');
  var v15b = tre && tre.V15b ? tre.V15b[0] : null;
  want('V15b') && rec({ id: 'V15b', title: 'Thin-wire correction carries over: trefoil in air, corrected full-wave L vs quasi-static L',
    criterion: '|rel err| <= 5%', verdict: !v15b ? 'NOT RUN' : Math.abs(v15b.rel_err) <= 0.05 ? 'PASS' : 'FAIL',
    summary: v15b ? 'L corrected ' + v15b.L_corrected_nH.toFixed(1) + ' nH vs ' + v15b.L_quasistatic_nH.toFixed(1) + ' nH (' + (100 * v15b.rel_err).toFixed(1) + '%)' : 'no result', rows: v15b ? [v15b] : [] });
  var runs = all();
  var v16bad = runs.filter(function (r) { return !(r.V16.max_singular_value <= 1.001 && r.V16.max_reciprocity_error <= 0.02); });
  want('V16') && rec({ id: 'V16', title: 'Extracted S-matrices are passive and reciprocal (all official full-wave cases)',
    criterion: 'max singular value <= 1.001 and |Sij - Sji| <= 0.02', verdict: !runs.length ? 'NOT RUN' : v16bad.length ? 'FAIL' : 'PASS',
    summary: runs.length + ' cases' + (v16bad.length ? '; failing: ' + v16bad.map(function (r) { return r.case + ' (' + r.V16.max_singular_value.toFixed(4) + ')'; }).join(', ') : ''),
    rows: runs.map(function (r) { return { case: r.case, V16: r.V16 }; }) });
  var v17 = runs.map(function (r) { return { case: r.case, tuned: r.tuned, V17: r.V17 }; });
  var v17bad = v17.filter(function (x) { return !x.tuned || !x.V17 || x.V17.max_S11_dB > -20 || !x.V17.all_positive; });
  want('V17') && rec({ id: 'V17', title: 'Co-simulation tunes and matches every element (S11 in the operating state, neighbours preamp-terminated)',
    criterion: '|S11(f0)| <= -20 dB; all Ct, Cm, Lm positive and finite', verdict: !runs.length ? 'NOT RUN' : v17bad.length ? 'FAIL' : 'PASS',
    summary: runs.length + ' cases' + (v17bad.length ? '; failing: ' + v17bad.map(function (x) { return x.case; }).join(', ') : ''), rows: v17 });
  ['3T', '7T'].forEach(function (b) {
    var r = load('trefoil_head_' + b), v = r && r.V18;
    want('V18') && rec({ id: 'V18-' + b, title: 'B1 Tier 2 (' + b + '): quasi-static vs full-wave |B1-| within 20 mm of the head surface (classification)',
      criterion: 'max relative difference <= 20% (PASS = quasi-static map valid near the surface for this case)',
      verdict: !v || v.max_rel_diff_within_20mm == null ? 'NOT RUN' : v.max_rel_diff_within_20mm <= 0.2 ? 'PASS' : 'FAIL',
      summary: v ? 'max ' + (100 * v.max_rel_diff_within_20mm).toFixed(1) + '%; breakdown depth (mm) ' + JSON.stringify(v.breakdown_depths_mm) : 'no result', rows: v ? [v, r.B1] : [] });
  });
  var pr = ['d-4', 'd+0', 'd+4'].map(function (t) { return load('pair_head_3T_' + t); });
  var pOK = pr.every(function (r) { return r && r.coupling; });
  var s = pOK ? pr.map(function (r) { return r.coupling.S21_dB; }) : null;
  want('V19') && rec({ id: 'V19', title: 'Quasi-static null survives capacitors and head load (trefoil pair, 3T, spacings d0-4, d0, d0+4)',
    criterion: 'S21(f0) <= -15 dB at d0 AND the smallest |S21| of the three is at d0', verdict: !pOK ? 'NOT RUN' : (s[1] <= -15 && s[1] <= s[0] && s[1] <= s[2]) ? 'PASS' : 'FAIL',
    summary: pOK ? 'S21 dB at d0-4/d0/d0+4: ' + s.map(function (x) { return x.toFixed(1); }).join(' / ') : 'no result', rows: pOK ? pr.map(function (r) { return { case: r.case, coupling: r.coupling }; }) : [] });
  var mf = path.join(simOut, 'mariepy_trefoil_head.json'), mr = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : null;
  want('V20') && rec({ id: 'V20', title: 'Second solver (mariepy): loaded trefoil capacitor values within 10% of openEMS',
    // verdict applied HERE from the raw values (audit D8), not copied from the script's own verdict field
    criterion: 'within 10%; NOT EVALUABLE if mariepy cannot run',
    verdict: !mr || !mr.rel_diff ? 'NOT EVALUABLE' : Object.keys(mr.rel_diff).every(function (k) { return Math.abs(mr.rel_diff[k]) <= 0.10; }) ? 'PASS' : 'FAIL',
    summary: mr ? mr.summary : 'no mariepy result (see DECISIONS.md)', rows: mr ? [mr] : [] });
})();

// POST-HOC (added after run 1): V6's test, restricted to blooms at or above the physical floor
// betaMinPhysical for this wire. Informational only; it does not change V6's verdict.
want('PH2') && (function () {
  var c = WIRE.d + 2 * WIRE.tIns, rows = [], allOK = true;
  K.catalogue().forEach(function (row) {
    var bmin = K.betaMinPhysical(row.p, 30, c, 'outward'), b0 = Math.ceil((bmin + 1e-9) * 200) / 200, fails = [];
    var ref = { p: row.p, q: row.q, beta: 0.4, size: 30, bloomMode: 'core' }, nRef = K.adaptiveN(ref);
    var refPat = K.crossings(K.points(Object.assign({}, ref, { h: K.solveLift(ref, c, nRef).h }), nRef)).pattern;
    [b0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.2, 1.6, 2.0, 2.5, 3.0].filter(function (b) { return b >= b0; }).forEach(function (b) {
      var prm = { p: row.p, q: row.q, beta: b, size: 30, bloomMode: 'core' }, n = K.adaptiveN(prm);
      var lift = K.solveLift(prm, c, n), cr = K.crossings(K.points(Object.assign({}, prm, { h: lift.h }), n));
      if (!(cr.list.length === row.crossings && K.samePattern(refPat, cr.pattern) && lift.feasible)) fails.push(b);
    });
    if (fails.length) allOK = false;
    rows.push({ knot: 'T(' + row.p + ',' + row.q + ')', betaMinPhysical: bmin, testedFrom: b0, failsAt: fails });
  });
  rec({ id: 'PH2', title: 'POST-HOC: V6 test from the physical bloom floor (outward shape: c / (R sin(pi/p))) upward',
    criterion: 'post-hoc; not pre-registered (informational)', verdict: allOK ? 'AGREES' : 'DISAGREES',
    summary: rows.map(function (r) { return r.knot + ' from ' + r.testedFrom + (r.failsAt.length ? ' FAILS ' + r.failsAt : ''); }).join('; '), rows: rows });
})();

// POST-HOC (added after audit A8, 2026-10-20): the DIRECTION of the B1 vector, not only its magnitude. A counter-clockwise
// loop in the xy-plane (seen from +z) must give +z field on its axis; and a straight current along +x gives -y field at a
// point displaced +z above it (right-hand rule).
want('PH3') && (function () {
  var W = I.prep(I.circle(50, 400)), b = KC.field.vector(W, 0, 0, 10);
  var seg = I.prep([[-500, 0, 0], [500, 0, 0], [500, 0, -1000], [-500, 0, -1000]]), b2 = KC.field.vector(seg, 0, 0, 10);
  var ok = b[2] > 0 && Math.abs(b[0]) < 1e-9 * Math.abs(b[2]) && b2[1] < 0;
  rec({ id: 'PH3', title: 'POST-HOC: B1 vector direction (right-hand rule) on two cases', criterion: 'post-hoc; informational',
    verdict: ok ? 'AGREES' : 'DISAGREES', summary: 'loop axis Bz ' + b[2].toFixed(3) + ' uT/A; wire +x at +z: By ' + b2[1].toFixed(3) + ' uT/A' });
})();

// POST-HOC (added after pre-registration, 2026-10-20): Rosa & Grover worked Example 1 (pp. 20–21).
want('PH1') && (function () {
  var M = I.maxwellCoaxial(250, 250, 200), e = (M - 167.08562) / 167.08562;
  rec({ id: 'PH1', title: 'POST-HOC: Maxwell implementation vs Rosa & Grover Example 1 (A = a = 25 cm, d = 20 cm -> 167.08562 cm = nH)',
    criterion: 'post-hoc; not pre-registered (informational)', verdict: Math.abs(e) < 1e-4 ? 'AGREES' : 'DISAGREES',
    summary: M.toFixed(5) + ' nH, rel diff ' + e.toExponential(2) });
})();

var git = '';
try { git = require('child_process').execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (e) { git = 'unknown'; }
var out = { generated: new Date().toISOString(), git: git, wire: WIRE, results: results,
  preregistered: 'Design.md §7: V1-V6 git 39a4e83; V7 30d6fa1; V8 ff1a40e; V9-V14 91c4df5; V15-V20 527aba1; V15b be426cb',
  allPreregisteredPass: results.filter(function (r) { return /^V/.test(r.id); }).every(function (r) { return r.verdict === 'PASS'; }) };
var vdir = path.join(root, 'validation'); if (!fs.existsSync(vdir)) fs.mkdirSync(vdir);
fs.writeFileSync(path.join(vdir, 'validation_report.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(vdir, 'validation_status.js'), '// generated by tests/run.js — do not edit\nwindow.KC_VALIDATION = ' +
  JSON.stringify({ generated: out.generated, git: git, allPass: out.allPreregisteredPass,
    results: results.map(function (r) { return { id: r.id, title: r.title, verdict: r.verdict, summary: r.summary }; }) }) + ';\n');

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Validation Report</title><style>' +
  'body{font-family:Segoe UI,Arial,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#1a2238}' +
  'h1{color:#0b1f5c}table{border-collapse:collapse;width:100%;margin:.5rem 0 1.5rem;font-size:.9rem}td,th{border:1px solid #d7deea;padding:.35rem .5rem;text-align:left;vertical-align:top}' +
  'th{background:#0b1f5c;color:#fff}.PASS,.AGREES{color:#0a7a3b;font-weight:700}.FAIL,.DISAGREES{color:#b3261e;font-weight:700}.NOT{color:#a15c00;font-weight:700}pre{background:#f4f7fb;padding:.5rem;overflow:auto;font-size:.8rem}</style></head><body>' +
  '<h1>Knotted-coil validation report</h1><p>Generated ' + out.generated + ' · code git ' + git + ' · criteria pre-registered in ' + out.preregistered +
  '. Wire: placeholder d = ' + WIRE.d + ' mm, insulation ' + WIRE.tIns + ' mm.</p>' +
  '<p><b>All pre-registered checks pass: ' + (out.allPreregisteredPass ? 'YES' : 'NO') + '</b></p>' +
  '<table><tr><th>ID</th><th>Check</th><th>Criterion</th><th>Verdict</th><th>Summary</th></tr>' +
  results.map(function (r) { return '<tr><td>' + r.id + '</td><td>' + esc(r.title) + '</td><td>' + esc(r.criterion) + '</td><td class="' + r.verdict.split(' ')[0] + '">' + r.verdict + '</td><td>' + esc(r.summary || '') + '</td></tr>'; }).join('') +
  '</table>' + results.map(function (r) {
    return '<h3>' + r.id + '</h3>' + (r.reference ? '<p>Reference: ' + esc(r.reference) + '</p>' : '') + (r.note ? '<p>' + esc(r.note) + '</p>' : '') +
      (r.rows ? '<pre>' + esc(JSON.stringify(r.rows, null, 1)) + '</pre>' : '');
  }).join('') + '</body></html>';
fs.writeFileSync(path.join(vdir, 'validation_report.html'), html);
console.log('\nAll pre-registered checks pass:', out.allPreregisteredPass, '\nWrote validation/validation_report.{json,html}, validation_status.js');
