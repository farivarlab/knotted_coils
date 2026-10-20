// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
B1 FIELD — quick, quasi-static magnetic field of the solved wires (Design.md v1.5).

WHAT IT DOES (plain language):
  For 1 A flowing in an element's wire, adds up the magnetic field from every little piece of wire
  (Biot–Savart law). For a receive coil this field pattern is, at low frequency, its sensitivity map (B1-).
  The array view combines elements as root-sum-of-squares, sqrt(sum_i |B_i|^2): a standard quick stand-in
  for combined array sensitivity. It ignores wave effects and the head's tissue, which matter at 3T/7T:
  use it to compare coverage and depth fall-off between designs, not as absolute numbers. EXPLORATORY.

METHOD:
  B(r) = sum over straight wire segments of the exact finite-segment Biot-Savart field (see F.vector); v1.5 used the
  midpoint rule  (mu0/4pi) sum_i I dl_i x (r - m_i) / |r - m_i|^3, replaced 2026-10-20 after V14 found ~1% error.
  Units: mm in, microtesla per ampere out. mu0/4pi = 1e-7 T m/A; with lengths in mm the sum has units 1/mm
  = 1e3 /m, so B = 1e-4 T per A per (1/mm) = 100 uT/A per (1/mm).                       [DERIVED]
  Check (V8): on the axis of a circular loop, every piece dl is perpendicular to (r - m) and |r - m| = sqrt(R^2+z^2);
  the axial components add, each contributing dl * R / (R^2+z^2)^(3/2); total length 2 pi R, so
  B = (mu0/4pi) 2 pi R^2 / (R^2+z^2)^(3/2) = mu0 R^2 / (2 (R^2+z^2)^(3/2)).            [DERIVED, Claude]
  Head: placeholder ellipsoid = helmet semi-axes minus 10 mm (JUDG PLACEHOLDER).

MATLAB EQUIVALENT (exact finite segments; audit A9):
  A = P - r; Bp = circshift(P,-1) - r; la = vecnorm(A,2,2); lb = vecnorm(Bp,2,2);
  B = 100 * sum(cross(A, Bp, 2) .* (la+lb) ./ (la.*lb.*(la.*lb + dot(A,Bp,2))));

VALIDATED BY: tests/run.js V8.
*/
(function (factory) {
  var g = typeof globalThis !== 'undefined' ? globalThis : self;
  g.KC = g.KC || {}; g.KC_FACTORIES = g.KC_FACTORIES || [];
  g.KC_FACTORIES.push(factory); factory(g.KC);
  if (typeof module !== 'undefined') module.exports = g.KC;
})(function fieldModule(KC) {
  'use strict';
  var F = KC.field = {};
  var UT = 100;          // DERIVED: microtesla per ampere per (1/mm); see header
  F.HEAD_GAP = 10;       // JUDG PLACEHOLDER: head surface sits 10 mm inside the helmet former

  // B (uT/A) at (x,y,z) from one prepped polyline (KC.ind.prep), summing the EXACT field of each straight segment:
  //   with a = A - P, b = B - P (segment ends relative to the field point P):
  //   B = (mu0/4pi) (a x b) (|a| + |b|) / (|a| |b| (|a| |b| + a.b))
  // Standard closed form for a finite straight filament, not cited from a source here (DERIVED/CONV); its correctness
  // is established numerically by V8 (on-axis loop) and V14 (independent library). Replaced the midpoint rule on
  // 2026-10-20 after V14 (development run) showed up to ~1% error 10-20 mm from thinned wires.
  F.vector = function (W, x, y, z) {
    var bx = 0, by = 0, bz = 0;
    for (var i = 0; i < W.n; i++) {
      var ax = W.sx[i] - x, ay = W.sy[i] - y, az = W.sz[i] - z;
      var cx = ax + W.dx[i], cy = ay + W.dy[i], cz = az + W.dz[i];          // b = B - P
      var la = Math.sqrt(ax * ax + ay * ay + az * az), lb = Math.sqrt(cx * cx + cy * cy + cz * cz);
      var den = la * lb * (la * lb + ax * cx + ay * cy + az * cz);
      if (den < 1e-12) continue;                                             // on the segment or its extension
      var f = (la + lb) / den;
      bx += (ay * cz - az * cy) * f; by += (az * cx - ax * cz) * f; bz += (ax * cy - ay * cx) * f;
    }
    return [UT * bx, UT * by, UT * bz];
  };
  F.magnitude = function (W, x, y, z) { var b = F.vector(W, x, y, z); return Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]); };

  F.onAxisLoop = function (R, z) { return UT * 2 * Math.PI * R * R / Math.pow(R * R + z * z, 1.5); };

  F.head = function (H) { return { a: H.a - F.HEAD_GAP, b: H.b - F.HEAD_GAP, c: H.c - F.HEAD_GAP }; };
  function inHead(E, x, y, z) { return x * x / (E.a * E.a) + y * y / (E.b * E.b) + z * z / (E.c * E.c) <= 1; }

  // Thin each wire to <= maxPts points for speed (visualisation only; field points are >= 10 mm from wires).
  F.prepWires = function (wires, maxPts) {
    return wires.map(function (P) {
      var st = Math.max(1, Math.ceil(P.length / (maxPts || 200)));
      return KC.ind.prep(P.filter(function (_, i) { return i % st === 0; }));
    });
  };

  // Per-element |B| on a set of points. Returns Float32Array per element (NaN where masked).
  F.atPoints = function (W, pts) {
    return W.map(function (w) {
      var out = new Float32Array(pts.length);
      for (var k = 0; k < pts.length; k++) out[k] = pts[k] ? F.magnitude(w, pts[k][0], pts[k][1], pts[k][2]) : NaN;
      return out;
    });
  };

  // Slice through the head: plane 'axial' (z = offset), 'coronal' (y = offset), 'sagittal' (x = offset).
  F.slicePoints = function (H, plane, offset, nGrid) {
    var E = F.head(H), ext = Math.max(E.a, E.b, E.c) * 1.05, pts = [], n = nGrid || 100;
    for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
      var u = -ext + 2 * ext * (i + 0.5) / n, v = ext - 2 * ext * (j + 0.5) / n, p;
      if (plane === 'axial') p = [u, v, offset]; else if (plane === 'coronal') p = [u, offset, v]; else p = [offset, u, v];
      pts.push(inHead(E, p[0], p[1], p[2]) && p[2] >= H.zCut - 40 ? p : null);
    }
    return { pts: pts, n: n, ext: ext };
  };

  // Vertices of the head ellipsoid surface above zCut - 40 mm (u around, v up).
  F.surfacePoints = function (H, nu, nv) {
    var E = F.head(H), pts = [], v0 = Math.asin(Math.max(-1, Math.min(1, (H.zCut - 40) / E.c)));
    for (var j = 0; j <= nv; j++) for (var i = 0; i <= nu; i++) {
      var u = i / nu * 2 * Math.PI, v = v0 + (Math.PI / 2 - v0) * j / nv;
      pts.push([E.a * Math.cos(v) * Math.cos(u), E.b * Math.cos(v) * Math.sin(u), E.c * Math.sin(v)]);
    }
    return { pts: pts, nu: nu, nv: nv };
  };
});
