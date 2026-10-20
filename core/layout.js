// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
LAYOUT — starting positions for N elements spread evenly over the covered part of the helmet,
plus small shared helpers (seeded random numbers, distances).

WHAT IT DOES (plain language):
  Picks N points far apart from each other (farthest-point sampling), then evens them out by
  repeatedly moving each point to the middle of the patch of helmet closest to it (Lloyd
  relaxation, the standard way to make a "centroidal Voronoi" layout). This is only a starting
  guess; optimise.js then moves the elements to decouple them.

VALIDATED BY: not a result in itself (initialisation only). Reproducible: fixed random seed.
*/
(function (factory) {
  var g = typeof globalThis !== 'undefined' ? globalThis : self;
  g.KC = g.KC || {}; g.KC_FACTORIES = g.KC_FACTORIES || [];
  g.KC_FACTORIES.push(factory); factory(g.KC);
  if (typeof module !== 'undefined') module.exports = g.KC;
})(function layoutModule(KC) {
  'use strict';
  var Lay = KC.layout = {};
  var S = KC.surface;

  // mulberry32: small seeded random generator so every run can be reproduced from its seed.
  Lay.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  Lay.dist = function (p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

  Lay.initialCentres = function (H, N, samples, iters) {
    iters = iters == null ? 20 : iters;    // JUDG: 20 Lloyd iterations is enough to even out spacing visually. Not critical.
    var m = samples.length, C = [], dmin = new Float64Array(m).fill(Infinity);
    // start from the sample closest to the top of the head
    var start = 0;
    for (var i = 1; i < m; i++) if (samples[i][2] > samples[start][2]) start = i;
    C.push(samples[start].slice());
    while (C.length < N) {
      var last = C[C.length - 1], far = 0, fd = -1;
      for (var s = 0; s < m; s++) {
        var d = Lay.dist(samples[s], last); if (d < dmin[s]) dmin[s] = d;
        if (dmin[s] > fd) { fd = dmin[s]; far = s; }
      }
      C.push(samples[far].slice());
    }
    for (var it = 0; it < iters; it++) {
      var acc = C.map(function () { return [0, 0, 0, 0]; });
      for (var s2 = 0; s2 < m; s2++) {
        var best = 0, bd = Infinity;
        for (var c = 0; c < N; c++) { var dd = Lay.dist(samples[s2], C[c]); if (dd < bd) { bd = dd; best = c; } }
        var A = acc[best]; A[0] += samples[s2][0]; A[1] += samples[s2][1]; A[2] += samples[s2][2]; A[3]++;
      }
      for (var c2 = 0; c2 < N; c2++) {
        if (!acc[c2][3]) continue;
        var p = S.snap(H, [acc[c2][0] / acc[c2][3], acc[c2][1] / acc[c2][3], acc[c2][2] / acc[c2][3]]);
        if (S.inCoverage(H, p)) C[c2] = p;
      }
    }
    return C;
  };
});
