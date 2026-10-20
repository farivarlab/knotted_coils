// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
PRE-REGISTERED COMPARISON C2 — ring layout vs free layout, exactly as in validation/COMPARE_ring_vs_free_PROTOCOL.md
(committed in git 91c4df5 before the ring code existed). Do not change runs or the decision rule here.

  node tests/compare_ring_vs_free.js   -> validation/compare_ring_vs_free.{json,html}
*/
'use strict';
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
['knot', 'inductance', 'surface', 'layout', 'optimise', 'field'].forEach(function (m) { require(path.join(root, 'core', m + '.js')); });
var KC = globalThis.KC;
var WIRE = { d: 1.0, tIns: 0.25, minBend: 2 };   // JUDG PLACEHOLDER (same as tests/run.js)
var CONFIGS = [
  { name: 'T(2,3) b0.8 m1 N16', knot: { p: 2, q: 3, beta: 0.8, shape: 'outward', sharpness: 1 }, N: 16 },
  { name: 'T(2,3) b0.8 m1 N24', knot: { p: 2, q: 3, beta: 0.8, shape: 'outward', sharpness: 1 }, N: 24 },
  { name: 'T(2,3) b0.8 m1 N32', knot: { p: 2, q: 3, beta: 0.8, shape: 'outward', sharpness: 1 }, N: 32 },
  { name: 'T(2,5) b0.8 m2 N24', knot: { p: 2, q: 5, beta: 0.8, shape: 'outward', sharpness: 2 }, N: 24 }
];
function H() { return JSON.parse(JSON.stringify(KC.surface.DEFAULTS)); }
function arm(r) {
  return { worstAdjacent: r.adjacent.max, medianAdjacent: r.adjacent.median, adjacentPairs: r.adjacent.count, regularityCV: r.regularityCV,
    coverage: r.coverage, zoneViolations: r.zoneViolations, footprintMax: r.footprint.max, N: r.N, seconds: r.seconds,
    rings: r.rings ? r.rings.map(function (g) { return g.n; }) : null };
}
var rows = CONFIGS.map(function (c, i) {
  var free = KC.opt.run({ N: c.N, knot: c.knot, wire: WIRE, helmet: H(), opts: { layout: 'free', starts: 4, seed: 1 } }, null, 'fast');
  var ring = KC.opt.run({ N: c.N, knot: c.knot, wire: WIRE, helmet: H(), opts: { layout: 'ring', ringSize: 'ring', ringBloom: 'fixed', ringSharp: 'fixed', seed: 1 } }, null, 'fast');
  var row = { config: c.name, free: arm(free), ring: arm(ring) };
  console.log((i + 1) + '/4 ' + c.name + ' | worst adj free ' + row.free.worstAdjacent.toFixed(4) + ' ring ' + row.ring.worstAdjacent.toFixed(4) +
    ' | CV free ' + row.free.regularityCV.toFixed(3) + ' ring ' + row.ring.regularityCV.toFixed(3) + ' | cov ring ' + row.ring.coverage.toFixed(3) +
    ' | zones free ' + row.free.zoneViolations + ' ring ' + row.ring.zoneViolations);
  return row;
});
var cvLower = rows.filter(function (r) { return r.ring.regularityCV < r.free.regularityCV; }).length;
var ratios = rows.map(function (r) { return r.ring.worstAdjacent / r.free.worstAdjacent; }).sort(function (a, b) { return a - b; });
var medRatio = 0.5 * (ratios[1] + ratios[2]);
var covOK = rows.every(function (r) { return r.ring.coverage >= 0.97 && r.ring.zoneViolations === 0; });
var c1 = cvLower >= 3, c2 = medRatio <= 1.10, c3 = covOK;
var git = ''; try { git = require('child_process').execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (e) { git = 'unknown'; }
var out = { generated: new Date().toISOString(), git: git, protocol: 'validation/COMPARE_ring_vs_free_PROTOCOL.md', rows: rows,
  summary: { ringCVLowerIn: cvLower, medianWorstAdjacentRatioRingOverFree: medRatio, ringCoverageAndZonesOK: covOK,
    criteria: { '1: ring CV lower in >= 3 of 4': c1, '2: median ratio worst adjacent |k| (ring/free) <= 1.10': c2, '3: ring coverage >= 0.97 and zero zone violations in all': c3 },
    ringBecomesDefault: c1 && c2 && c3 } };
fs.writeFileSync(path.join(root, 'validation', 'compare_ring_vs_free.json'), JSON.stringify(out, null, 1));
function f(x, d) { return Number(x).toFixed(d); }
var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ring vs free comparison</title><style>body{font-family:Segoe UI,Arial,sans-serif;max-width:64rem;margin:2rem auto;padding:0 1rem;color:#1a2238}' +
  'table{border-collapse:collapse;width:100%;font-size:.85rem;margin:1rem 0}td,th{border:1px solid #d7deea;padding:.3rem .45rem;text-align:right}th{background:#0b1f5c;color:#fff}td:first-child{text-align:left}.y{color:#0a7a3b;font-weight:700}.n{color:#b3261e;font-weight:700}</style></head><body>' +
  '<h1>C2: ring layout vs free layout</h1><p>Pre-registered in <code>COMPARE_ring_vs_free_PROTOCOL.md</code> (git 91c4df5). Generated ' + out.generated + ' · code git ' + git + '. Exploratory: placeholder helmet, zones and wire.</p><ul>' +
  Object.keys(out.summary.criteria).map(function (k) { return '<li>' + k + ': <span class="' + (out.summary.criteria[k] ? 'y">met' : 'n">not met') + '</span></li>'; }).join('') +
  '</ul><p><b>Decision: ' + (out.summary.ringBecomesDefault ? 'ring becomes the default layout' : 'free stays the default; ring remains an option') + '</b> (ring CV lower in ' + cvLower + '/4; median ratio ' + f(medRatio, 3) + ').</p>' +
  '<table><tr><th>config</th><th>worst adj |k| free</th><th>ring</th><th>median adj free</th><th>ring</th><th>CV free</th><th>ring</th><th>coverage free</th><th>ring</th><th>zone pts free</th><th>ring</th><th>ring counts</th></tr>' +
  rows.map(function (r) {
    return '<tr><td>' + r.config + '</td><td>' + f(r.free.worstAdjacent, 4) + '</td><td>' + f(r.ring.worstAdjacent, 4) + '</td><td>' + f(r.free.medianAdjacent, 4) + '</td><td>' + f(r.ring.medianAdjacent, 4) +
      '</td><td>' + f(r.free.regularityCV, 3) + '</td><td>' + f(r.ring.regularityCV, 3) + '</td><td>' + f(r.free.coverage, 3) + '</td><td>' + f(r.ring.coverage, 3) + '</td><td>' + r.free.zoneViolations +
      '</td><td>' + r.ring.zoneViolations + '</td><td>' + (r.ring.rings || []).join('+') + '</td></tr>';
  }).join('') + '</table></body></html>';
fs.writeFileSync(path.join(root, 'validation', 'compare_ring_vs_free.html'), html);
console.log(JSON.stringify(out.summary, null, 1));
