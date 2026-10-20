// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
VALIDATION RUNNER — the pre-registered checks V1–V6 of Design.md §7 (frozen 2026-10-20, git 39a4e83),
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
function rec(r) { results.push(r); console.log((r.verdict + '        ').slice(0, 14) + r.id + '  ' + r.title + (r.summary ? '  — ' + r.summary : '')); }

// V1 — Maxwell coaxial circles. Criterion: relative error < 0.5% across 5 separations.
(function () {
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
(function () {
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
(function () {
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
(function () {
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
(function () {
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
(function () {
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
(function () {
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
(function () {
  var W = I.prep(I.circle(50, 400)), rows = [], worst = 0;
  [0, 10, 20, 40, 80].forEach(function (z) {
    var num = KC.field.magnitude(W, 0, 0, z), ref = KC.field.onAxisLoop(50, z), e = (num - ref) / ref;
    worst = Math.max(worst, Math.abs(e)); rows.push({ z_mm: z, numeric_uT_per_A: num, closedForm_uT_per_A: ref, relErr: e });
  });
  rec({ id: 'V8', title: 'B1 (Biot–Savart) on the axis of a circular loop, R = 50 mm, 400 points, vs closed form',
    criterion: 'relative error < 0.5% at z = 0, 10, 20, 40, 80 mm', verdict: worst < 0.005 ? 'PASS' : 'FAIL',
    summary: 'worst ' + (worst * 100).toFixed(4) + '%', rows: rows, reference: 'Closed form DERIVED from Biot–Savart (core/field.js header); not a literature value' });
})();

// POST-HOC (added after run 1): V6's test, restricted to blooms at or above the physical floor
// betaMinPhysical for this wire. Informational only; it does not change V6's verdict.
(function () {
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

// POST-HOC (added after pre-registration, 2026-10-20): Rosa & Grover worked Example 1 (pp. 20–21).
(function () {
  var M = I.maxwellCoaxial(250, 250, 200), e = (M - 167.08562) / 167.08562;
  rec({ id: 'PH1', title: 'POST-HOC: Maxwell implementation vs Rosa & Grover Example 1 (A = a = 25 cm, d = 20 cm -> 167.08562 cm = nH)',
    criterion: 'post-hoc; not pre-registered (informational)', verdict: Math.abs(e) < 1e-4 ? 'AGREES' : 'DISAGREES',
    summary: M.toFixed(5) + ' nH, rel diff ' + e.toExponential(2) });
})();

var git = '';
try { git = require('child_process').execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (e) { git = 'unknown'; }
var out = { generated: new Date().toISOString(), git: git, wire: WIRE, results: results,
  preregistered: 'Design.md v1.0 §7 (git 39a4e83)',
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
