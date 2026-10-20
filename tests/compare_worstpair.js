// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
PAIRED COMPARISON — solver with vs without the smooth worst-pair term, exactly as pre-registered in
validation/COMPARE_worstpair_PROTOCOL.md. Do not change runs or the decision rule here.

  node tests/compare_worstpair.js   -> validation/compare_worstpair.{json,html}
*/
'use strict';
var fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
['knot', 'inductance', 'surface', 'layout', 'optimise'].forEach(function (m) { require(path.join(root, 'core', m + '.js')); });
var KC = globalThis.KC;
var WIRE = { d: 1.0, tIns: 0.25, minBend: 2 };   // JUDG PLACEHOLDER (same as tests/run.js)

var runs = [];
[{ p: 2, q: 3, beta: 0.4 }, { p: 2, q: 5, beta: 0.4 }, { p: 3, q: 4, beta: 0.3 }].forEach(function (kp) {
  [16, 32].forEach(function (N) { for (var s = 1; s <= 5; s++) runs.push({ set: 'fast', kp: kp, N: N, seed: s, which: 'fast' }); });
});
for (var s2 = 1; s2 <= 5; s2++) runs.push({ set: 'full', kp: { p: 2, q: 3, beta: 0.4 }, N: 16, seed: s2, which: 'full' });

function one(r, lam) {
  var res = KC.opt.run({ N: r.N, knot: r.kp, wire: WIRE, helmet: KC.surface.DEFAULTS, opts: { seed: r.seed, lambdaMax: lam } }, null, r.which);
  return { worst: res.ring1.max, above: res.ring1.above, median: res.ring1.median, nPairs: res.ring1.count, footprintMax: res.footprint.max,
    nextMax: res.next.max, coverage: res.coverage, Rf: res.Rf, seconds: res.seconds };
}
var rows = runs.map(function (r, i) {
  var A = one(r, 0), B = one(r, 1);
  var row = { set: r.set, knot: 'T(' + r.kp.p + ',' + r.kp.q + ') b=' + r.kp.beta, N: r.N, seed: r.seed, A: A, B: B, ratio: B.worst / A.worst };
  console.log((i + 1) + '/' + runs.length, row.set, row.knot, 'N=' + r.N, 'seed=' + r.seed, 'worst A=' + A.worst.toFixed(4), 'B=' + B.worst.toFixed(4),
    'above A=' + A.above + ' B=' + B.above, 'cov A=' + A.coverage.toFixed(3) + ' B=' + B.coverage.toFixed(3));
  return row;
});

var nB = rows.filter(function (r) { return r.B.worst < r.A.worst; }).length;
var ratios = rows.map(function (r) { return r.ratio; }).sort(function (a, b) { return a - b; });
var medRatio = ratios.length % 2 ? ratios[(ratios.length - 1) / 2] : 0.5 * (ratios[ratios.length / 2 - 1] + ratios[ratios.length / 2]);
var covBad = rows.filter(function (r) { return r.A.coverage >= 0.99 && r.B.coverage < 0.99; }).length;
var c1 = nB >= 25, c2 = medRatio <= 0.90, c3 = covBad === 0, adopt = c1 && c2 && c3;
function med(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length % 2 ? a[(a.length - 1) / 2] : 0.5 * (a[a.length / 2 - 1] + a[a.length / 2]); }
var summary = {
  pairedRuns: rows.length, BlowerCount: nB, medianRatio: medRatio, coverageViolations: covBad,
  criteria: { '1: B lower in >= 25/35': c1, '2: median ratio <= 0.90': c2, '3: no coverage drop below 0.99': c3 }, adoptB: adopt,
  secondary: {
    medianAboveA: med(rows.map(function (r) { return r.A.above; })), medianAboveB: med(rows.map(function (r) { return r.B.above; })),
    medianMedianKA: med(rows.map(function (r) { return r.A.median; })), medianMedianKB: med(rows.map(function (r) { return r.B.median; })),
    medianFootprintMaxA: med(rows.map(function (r) { return r.A.footprintMax; })), medianFootprintMaxB: med(rows.map(function (r) { return r.B.footprintMax; })),
    medianNextMaxA: med(rows.map(function (r) { return r.A.nextMax; })), medianNextMaxB: med(rows.map(function (r) { return r.B.nextMax; })),
    totalSecondsA: rows.reduce(function (s, r) { return s + r.A.seconds; }, 0), totalSecondsB: rows.reduce(function (s, r) { return s + r.B.seconds; }, 0)
  }
};
console.log('\n' + JSON.stringify(summary, null, 1));

var git = ''; try { git = require('child_process').execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (e) { git = 'unknown'; }
var out = { generated: new Date().toISOString(), git: git, protocol: 'validation/COMPARE_worstpair_PROTOCOL.md', summary: summary, rows: rows };
fs.writeFileSync(path.join(root, 'validation', 'compare_worstpair.json'), JSON.stringify(out, null, 1));
function f(x, d) { return Number(x).toFixed(d); }
var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Worst-pair comparison</title><style>body{font-family:Segoe UI,Arial,sans-serif;max-width:64rem;margin:2rem auto;padding:0 1rem;color:#1a2238}' +
  'table{border-collapse:collapse;width:100%;font-size:.85rem;margin:1rem 0}td,th{border:1px solid #d7deea;padding:.3rem .45rem;text-align:right}th{background:#0b1f5c;color:#fff}td:nth-child(-n+4){text-align:left}.y{color:#0a7a3b;font-weight:700}.n{color:#b3261e;font-weight:700}</style></head><body>' +
  '<h1>Worst-pair term: paired comparison</h1><p>Pre-registered in <code>COMPARE_worstpair_PROTOCOL.md</code>. Generated ' + out.generated + ' · git ' + git + '. Exploratory: placeholder wire and helmet; these configurations only.</p>' +
  '<p>A = solver without the term (lambdaMax 0). B = with the smooth term (lambdaMax 1). Primary outcome: worst nearest-ring |k|.</p><ul>' +
  Object.keys(summary.criteria).map(function (k) { return '<li>' + k + ': <span class="' + (summary.criteria[k] ? 'y">met' : 'n">not met') + '</span></li>'; }).join('') +
  '</ul><p>B lower in ' + nB + ' / ' + rows.length + ' runs · median ratio B/A ' + f(medRatio, 3) + ' · coverage violations ' + covBad + '. <b>Decision: ' + (adopt ? 'adopt B as default' : 'keep A as default; refer to Reza') + '</b></p>' +
  '<table><tr><th>set</th><th>knot</th><th>N</th><th>seed</th><th>worst A</th><th>worst B</th><th>B/A</th><th>≥thr A</th><th>≥thr B</th><th>median A</th><th>median B</th><th>2nd-ring max A</th><th>2nd-ring max B</th><th>cov A</th><th>cov B</th></tr>' +
  rows.map(function (r) {
    return '<tr><td>' + r.set + '</td><td>' + r.knot + '</td><td>' + r.N + '</td><td>' + r.seed + '</td><td>' + f(r.A.worst, 4) + '</td><td>' + f(r.B.worst, 4) + '</td><td>' + f(r.ratio, 2) + '</td><td>' +
      r.A.above + '/' + r.A.nPairs + '</td><td>' + r.B.above + '/' + r.B.nPairs + '</td><td>' + f(r.A.median, 4) + '</td><td>' + f(r.B.median, 4) + '</td><td>' + f(r.A.nextMax, 3) + '</td><td>' + f(r.B.nextMax, 3) + '</td><td>' + f(r.A.coverage, 3) + '</td><td>' + f(r.B.coverage, 3) + '</td></tr>';
  }).join('') + '</table></body></html>';
fs.writeFileSync(path.join(root, 'validation', 'compare_worstpair.html'), html);
console.log('Wrote validation/compare_worstpair.{json,html}');
