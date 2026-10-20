// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
CASE EXPORT for the full-wave capacitor co-simulation (Design.md §6b, v1.7).

WHAT IT DOES (plain language):
  Writes self-contained "case" files (JSON) that the Python/openEMS pipeline in sim/ reads: each coil element's
  wire path (mm, world coordinates), its capacitor break positions (the first break is the feed), wire radius,
  field strength / Larmor frequency, the head phantom to use, and our own quasi-static predictions (L, M, first-pass
  capacitor values) so the full-wave results can be compared with them.

  node tests/export_case.js            -> sim/cases/*.json  (the cases pre-registered for V15, V18, V19)

Geometry choices (JUDG): elements sit on the helmet at the back of the head (posterior midline, 20 deg elevation);
footprint radius 45 mm; 4 breaks; wire radius 0.5 mm (placeholder wire).
*/
'use strict';
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
['knot', 'inductance', 'surface', 'layout', 'optimise', 'field'].forEach(function (m) { require(path.join(root, 'core', m + '.js')); });
var KC = globalThis.KC, K = KC.knot, I = KC.ind, S = KC.surface, O = KC.opt;
var WIRE = { d: 1.0, tIns: 0.25, minBend: 2 };   // JUDG PLACEHOLDER (same as tests/run.js)
var A = WIRE.d / 2, CLEAR = WIRE.d + 2 * WIRE.tIns, NB = 4, CAPCLEAR = 5;
var outDir = path.join(root, 'sim', 'cases'); if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
var H = JSON.parse(JSON.stringify(S.DEFAULTS));
var HEAD = KC.field.head(H);                     // helmet - 10 mm (same placeholder head as the B1 view)

// Tissue properties (Design.md §6b): 7T from openEMS's bundled phantom_head_298MHz.h5 (attributed by openEMS to IT'IS /
// Gabriel; secondary, not independently verified). 3T: APPROXIMATION from openEMS's phantom_body_128MHz.h5
// (Tissue->brain, Bone->skull, Skin->skin).
var TISSUE = {
  7: { brain: { epsR: 52.7, kappa: 0.95 }, skull: { epsR: 11.4, kappa: 0.29 }, skin: { epsR: 38.9, kappa: 0.84 },
    source: 'openEMS 0.37.0 resources/phantoms/phantom_head_298MHz.h5 (openEMS attributes values to IT\'IS database, Gabriel model); not independently verified' },
  3: { brain: { epsR: 62.8, kappa: 0.66 }, skull: { epsR: 12.5, kappa: 0.13 }, skin: { epsR: 46.8, kappa: 0.58 },
    source: 'APPROXIMATION: openEMS 0.37.0 phantom_body_128MHz.h5 values (Tissue->brain, Bone->skull, Skin->skin); verified 128 MHz head values are an open item' }
};
function phantom(B0) {
  return { type: 'head3', axes: [HEAD.a, HEAD.b, HEAD.c], skin_mm: 4, skull_mm: 7,   // JUDG PLACEHOLDER layer thicknesses
    zMin: H.zCut - 60, tissue: TISSUE[B0] };
}

// One element as world wire + breaks. `centre`: point on the helmet; flat knot wrapped like the array solver does.
function elementAt(kp, Rf, theta, centre, mirror) {
  var lift = K.solveLift({ p: kp.p, q: kp.q, beta: kp.beta, size: Rf, bloomMode: 'extent', bloomShape: kp.shape, sharpness: kp.sharpness }, CLEAR, 400);
  var flat = K.points({ p: kp.p, q: kp.q, beta: kp.beta, size: Rf, bloomMode: 'extent', bloomShape: kp.shape, sharpness: kp.sharpness, theta: theta, h: lift.h, mirror: !!mirror }, 600);
  var W = S.wrap(H, flat, centre);
  return wireWithBreaks(W.points, flat, W.normals);
}
function wireWithBreaks(world, flat, normals) {
  var bk = K.breaks(flat, NB, CAPCLEAR), n = world.length;
  var breaks = bk.at.map(function (b) {
    var P0 = world[b.index], P1 = world[(b.index + 1) % n], t = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]], tl = Math.hypot(t[0], t[1], t[2]) || 1;
    return { p: [P0[0] + b.f * t[0], P0[1] + b.f * t[1], P0[2] + b.f * t[2]], t: [t[0] / tl, t[1] / tl, t[2] / tl], index: b.index, f: b.f };
  });
  return { wire: world, normals: normals || null, breaks: breaks, breaksOK: bk.ok, minDistToCrossing: bk.minDistToCrossing,
    L_nH: I.selfL(world, A, normals || null) };
}
function quasistatic(els) {
  var M = els.map(function (a, i) { return els.map(function (b, j) { return i === j ? a.L_nH : I.mutual(a.wire, b.wire, CLEAR); }); });
  return { L_nH: els.map(function (e) { return e.L_nH; }), M_nH: M };
}
function write(name, B0, els, ph, extra) {
  var f0 = K.GAMMA_BAR_MHZ_PER_T * 1e6 * B0;
  var c = Object.assign({
    name: name, created: new Date().toISOString(), B0_T: B0, f0_Hz: f0, wire_radius_mm: A, nBreaks: NB,
    firstPassCap_pF: els.map(function (e) { return K.capacitor(e.L_nH, NB, B0).perCapPF; }),
    elements: els, phantom: ph, quasistatic: quasistatic(els), helmet: H
  }, extra || {});
  fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(c));
  console.log('wrote', name, '| elements', els.length, '| L_qs', c.quasistatic.L_nH.map(function (x) { return x.toFixed(1); }).join(','), 'nH | first-pass C',
    c.firstPassCap_pF.map(function (x) { return x.toFixed(2); }).join(','), 'pF | breaks ok', els.map(function (e) { return e.breaksOK; }).join(','));
}

// V15: circular loop R = 40 mm in air (flat, z = 0), 4 evenly spaced breaks (no crossings).
var loop = I.circle(40, 600);
write('loop_air_3T', 3, [wireWithBreaks(loop, loop, null)], null, { purpose: 'V15' });

// Single trefoil on the posterior midline, 20 deg elevation (JUDG).
var KP = { p: 2, q: 3, beta: 0.8, shape: 'outward', sharpness: 1 }, RF = 45;   // JUDG: footprint radius 45 mm
var c0 = S.point(H, -Math.PI / 2, 20 * Math.PI / 180);
var tre = elementAt(KP, RF, 0, c0, false);
[3, 7].forEach(function (B0) {
  write('trefoil_air_' + B0 + 'T', B0, [tre], null, { purpose: 'V16/V17 (unloaded reference)' });
  write('trefoil_head_' + B0 + 'T', B0, [tre], phantom(B0), { purpose: 'V16/V17/V18/V20' });
});

// V19: trefoil pair, head-loaded at 3T, centre spacings d0-4, d0, d0+4 mm; d0 = flat quasi-static null (Pair explorer,
// rotations 0/0). The pair sits symmetric about the posterior midline, 20 deg elevation (chord spacing = d).
var scan = O.pairScan(KP, RF, WIRE, 0, 0, { n: 300 }), d0 = scan.zeros.length ? scan.zeros[scan.zeros.length - 1].d : null;
if (d0 == null) throw new Error('no quasi-static null found for the pair');
var v = 20 * Math.PI / 180, rho = H.a * Math.cos(v);   // horizontal radius at that elevation (x semi-axis; back of head)
[-4, 0, 4].forEach(function (dd) {
  var d = d0 + dd;
  // find azimuth half-angle so that the chord between the two centres equals d (bisection on the helmet)
  var lo = 0, hi = Math.PI / 2;
  for (var it = 0; it < 60; it++) { var mid = (lo + hi) / 2, pa = S.point(H, -Math.PI / 2 + mid, v), pb = S.point(H, -Math.PI / 2 - mid, v);
    if (KC.layout.dist(pa, pb) < d) lo = mid; else hi = mid; }
  var al = (lo + hi) / 2;
  var e1 = elementAt(KP, RF, 0, S.point(H, -Math.PI / 2 + al, v), false), e2 = elementAt(KP, RF, 0, S.point(H, -Math.PI / 2 - al, v), true);
  var qs = quasistatic([e1, e2]), kqs = qs.M_nH[0][1] / Math.sqrt(qs.L_nH[0] * qs.L_nH[1]);
  write('pair_head_3T_d' + (dd >= 0 ? '+' : '') + dd, 3, [e1, e2], phantom(3), { purpose: 'V19', d0_flat_mm: d0, spacing_mm: d,
    k_quasistatic_on_helmet: kqs });
  console.log('   spacing', d.toFixed(1), 'mm (d0 flat', d0.toFixed(1), ') k_qs on helmet', kqs.toFixed(4));
  // audit M5 (added after the independent review): the same pair in air at d0, to separate tissue effects from
  // geometry/capacitor effects and to check the sign of M_eff against the quasi-static M.
  if (dd === 0) write('pair_air_3T_d+0', 3, [e1, e2], null, { purpose: 'audit M5 (information)', d0_flat_mm: d0, spacing_mm: d,
    k_quasistatic_on_helmet: kqs });
});
