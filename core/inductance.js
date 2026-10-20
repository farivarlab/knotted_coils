// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
INDUCTANCE — mutual inductance M between two wire paths, self-inductance L of one path, and
the coupling coefficient k = M / sqrt(L1 L2).

WHAT IT DOES (plain language):
  Mutual inductance is how much of one coil's magnetic field passes through another coil. We
  compute it with the Neumann formula: add up, over every little piece of wire 1 and every
  little piece of wire 2, (piece1 . piece2) / distance. Zero M = the two coils don't "see"
  each other (geometric decoupling).

METHOD + SOURCES (status per CITATION_VERIFICATION; see README 'References'):
  Neumann formula  M = (mu0/4pi) sum_i sum_j (dl_i . dl_j) / |r_i - r_j|   (standard; Design.md §6)
  Straight-segment midpoint rule. Where two segments are closer than 3 segment lengths, both are
  split into up to 12 sub-pieces (otherwise the 1/distance term is badly sampled).
  Self-inductance: M between the wire centreline and a copy shifted sideways by the wire radius a
  (the classical high-frequency / surface-current approach; checked by V2 against the closed form).
  Maxwell's closed form for two coaxial circles, used only to validate (V1).
  Units: lengths mm, inductance nH.  mu0/4pi = 1e-7 H/m  ->  0.1 nH per mm of summed (mm^2/mm).

MATLAB EQUIVALENT (core double sum, no near-field refinement):
  dA = diff([A;A(1,:)]); mA = A + dA/2;  (same for B)
  D = pdist2(mA, mB); M = 0.1 * sum(sum((dA*dB') ./ sqrt(D.^2 + eps^2)));   % nH

VALIDATED BY: tests/run.js V1 (Maxwell coaxial), V2 (self-L), V4 (convergence), V5 (symmetry).
*/
(function (factory) {
  var g = typeof globalThis !== 'undefined' ? globalThis : self;
  g.KC = g.KC || {}; g.KC_FACTORIES = g.KC_FACTORIES || [];
  g.KC_FACTORIES.push(factory); factory(g.KC);
  if (typeof module !== 'undefined') module.exports = g.KC;
})(function inductanceModule(KC) {
  'use strict';
  var ind = KC.ind = {};
  var NH_PER_MM = 0.1;      // DERIVED: mu0/4pi = 1e-7 H/m = 0.1 nH/mm
  var NEAR = 3;             // JUDG: refine when segments are closer than 3 segment lengths. Alt: 2, 5. Checked by V4.
  var MAXSUB = 12;          // JUDG: cap on sub-pieces per segment (cost grows as MAXSUB^2). Checked by V4.

  // Pack a closed polyline into flat arrays: segment start, vector, midpoint, length.
  ind.prep = function (P) {
    var n = P.length, o = { n: n, sx: new Float64Array(n), sy: new Float64Array(n), sz: new Float64Array(n),
      dx: new Float64Array(n), dy: new Float64Array(n), dz: new Float64Array(n),
      mx: new Float64Array(n), my: new Float64Array(n), mz: new Float64Array(n), len: new Float64Array(n) };
    for (var i = 0; i < n; i++) {
      var a = P[i], b = P[(i + 1) % n];
      o.sx[i] = a[0]; o.sy[i] = a[1]; o.sz[i] = a[2];
      o.dx[i] = b[0] - a[0]; o.dy[i] = b[1] - a[1]; o.dz[i] = b[2] - a[2];
      o.mx[i] = a[0] + o.dx[i] / 2; o.my[i] = a[1] + o.dy[i] / 2; o.mz[i] = a[2] + o.dz[i] / 2;
      o.len[i] = Math.hypot(o.dx[i], o.dy[i], o.dz[i]);
    }
    return o;
  };

  // Mutual inductance (nH) between two closed polylines (mm). `eps` (mm) softens the 1/r kernel to
  // 1/sqrt(r^2+eps^2); used between different elements so that wires crossing each other are
  // treated as separated by the real centreline gap (wire diameter + insulation). eps=0: pure filaments.
  ind.mutual = function (A, B, eps) {
    var a = A.n ? A : ind.prep(A), b = B.n ? B : ind.prep(B);
    var e2 = (eps || 0) * (eps || 0), sum = 0;
    for (var i = 0; i < a.n; i++) {
      var ax = a.mx[i], ay = a.my[i], az = a.mz[i], adx = a.dx[i], ady = a.dy[i], adz = a.dz[i], al = a.len[i];
      for (var j = 0; j < b.n; j++) {
        var rx = ax - b.mx[j], ry = ay - b.my[j], rz = az - b.mz[j];
        var r2 = rx * rx + ry * ry + rz * rz;
        var dot = adx * b.dx[j] + ady * b.dy[j] + adz * b.dz[j];
        var lmax = al > b.len[j] ? al : b.len[j];
        var lim = NEAR * lmax;
        if (r2 + e2 > lim * lim) { sum += dot / Math.sqrt(r2 + e2); continue; }
        // near pair: split both straight segments into ns pieces each
        var ns = Math.min(MAXSUB, Math.max(2, Math.ceil(NEAR * lmax / Math.sqrt(r2 + e2 + 1e-30))));
        var acc = 0;
        for (var s = 0; s < ns; s++) {
          var fs = (s + 0.5) / ns, px = a.sx[i] + fs * adx, py = a.sy[i] + fs * ady, pz = a.sz[i] + fs * adz;
          for (var t = 0; t < ns; t++) {
            var ft = (t + 0.5) / ns;
            var qx = px - (b.sx[j] + ft * b.dx[j]), qy = py - (b.sy[j] + ft * b.dy[j]), qz = pz - (b.sz[j] + ft * b.dz[j]);
            acc += 1 / Math.sqrt(qx * qx + qy * qy + qz * qz + e2 + 1e-30);
          }
        }
        sum += dot * acc / (ns * ns);
      }
    }
    return NH_PER_MM * sum;
  };

  // Self-inductance (nH): M between centreline and a copy shifted by wire radius `a` along
  // `dirs` (one unit vector per point; default +z, i.e. out of the element's plane).
  ind.selfL = function (P, a, dirs) {
    var Q = P.map(function (p, i) {
      var d = dirs ? dirs[i] : [0, 0, 1];
      return [p[0] + a * d[0], p[1] + a * d[1], p[2] + a * d[2]];
    });
    return ind.mutual(P, Q, 0);
  };

  ind.coupling = function (M, L1, L2) { return M / Math.sqrt(L1 * L2); };

  // Complete elliptic integrals K(k), E(k) with MODULUS k, by the arithmetic-geometric mean.
  ind.ellipKE = function (k) {
    var a = 1, b = Math.sqrt(1 - k * k), c = k, sum = 0.5 * c * c, pow = 0.5;
    for (var it = 0; it < 40 && Math.abs(c) > 1e-17; it++) {
      var an = 0.5 * (a + b); c = 0.5 * (a - b); b = Math.sqrt(a * b); a = an;
      pow *= 2; sum += pow * c * c;
    }
    var K = Math.PI / (2 * a);
    return { K: K, E: K * (1 - sum) };
  };

  // Maxwell: coaxial circular filaments, radii r1, r2, axial separation d (mm) -> nH.
  // M = mu0 sqrt(r1 r2) [ (2/k - k) K(k) - (2/k) E(k) ],  k^2 = 4 r1 r2 / ((r1+r2)^2 + d^2)
  ind.maxwellCoaxial = function (r1, r2, d) {
    var k = Math.sqrt(4 * r1 * r2 / ((r1 + r2) * (r1 + r2) + d * d));
    var ke = ind.ellipKE(k);
    return 4 * Math.PI * NH_PER_MM * Math.sqrt(r1 * r2) * ((2 / k - k) * ke.K - (2 / k) * ke.E);
  };

  // Closed-form self-inductance of a circular loop, surface (high-frequency) current, a << R.
  ind.circleSelfL = function (R, a) { return 4 * Math.PI * NH_PER_MM * R * (Math.log(8 * R / a) - 2); };

  ind.circle = function (R, n, cx, cy, cz) {
    var P = [];
    for (var i = 0; i < n; i++) {
      var t = 2 * Math.PI * i / n;
      P.push([(cx || 0) + R * Math.cos(t), (cy || 0) + R * Math.sin(t), cz || 0]);
    }
    return P;
  };
});
