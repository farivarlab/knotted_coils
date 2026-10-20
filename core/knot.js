// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
KNOT GEOMETRY — one flat knotted wire loop (one array element), in the element's own plane.

WHAT IT DOES (plain language):
  Draws a torus knot T(p,q) as a flat rosette: q lobes (petals), the wire going p times around
  the centre. Where the wire crosses itself it lifts slightly out of the plane (z) so that the
  over/under pattern of the knot is kept. "Bloom" (beta) sets how far the lobes reach out:
  small beta = strands nearly on top of each other (still knotted), large beta = open petals.

METHOD (Design.md §3.1, v1.2):
  r(phi) = R (1 + beta (1 + cos(q phi))/2)   ['outward', default: lobes grow out from a fixed base circle R]
  r(phi) = R (1 + beta cos(q phi))           ['symmetric', v1.0: lobes out and waist in]
  x = r cos(p phi + theta);  y = r sin(p phi + theta);  z = h sin(q phi).
  Either way this is a torus knot on a flattened torus (outward: centre radius R(1+beta/2), in-plane tube
  radius beta*R/2; vertical tube radius h), so the knot type is the same for every beta > 0 and h > 0
  (symmetric additionally needs beta < 1).
  Units: millimetres throughout.

MATLAB EQUIVALENT:
  phi = 2*pi*(0:n-1)/n; r = R*(1+beta*cos(q*phi));
  P = [r.*cos(p*phi+theta); r.*sin(p*phi+theta); h*sin(q*phi)]';

VALIDATED BY: tests/run.js checks V5, V6 (see validation/). Status shown in validation report.
*/
(function (factory) {
  var g = typeof globalThis !== 'undefined' ? globalThis : self;
  g.KC = g.KC || {}; g.KC_FACTORIES = g.KC_FACTORIES || [];
  g.KC_FACTORIES.push(factory); factory(g.KC);
  if (typeof module !== 'undefined') module.exports = g.KC;
})(function knotModule(KC) {
  'use strict';
  var knot = KC.knot = {};

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  knot.gcd = gcd;

  // A torus knot needs gcd(p,q)=1; otherwise the curve splits into several separate loops (a link).
  knot.isValid = function (p, q) {
    return Number.isInteger(p) && Number.isInteger(q) && p >= 1 && q >= 1 && gcd(p, q) === 1;
  };

  knot.expectedCrossings = function (p, q) { return q * (p - 1); };

  // Common names; anything else is shown as T(p,q).
  var NAMES = { '2,1': 'unknot (2-turn)', '3,2': 'trefoil', '2,3': 'trefoil', '2,5': 'cinquefoil',
    '3,4': 'T(3,4) = 8_19', '2,7': 'T(2,7) = 7_1' };
  knot.name = function (p, q) {
    if (p === 1) return q + '-petal rosette (no knot, control)';
    return NAMES[p + ',' + q] || ('T(' + p + ',' + q + ')');
  };

  // Design.md §3.2: for each lobe count q = 1..8 the smallest p >= 2 coprime to q.
  knot.catalogue = function () {
    var rows = [];
    for (var q = 1; q <= 8; q++) {
      var p = 2; while (gcd(p, q) !== 1) p++;
      rows.push({ q: q, p: p, name: knot.name(p, q), crossings: knot.expectedCrossings(p, q) });
    }
    return rows;
  };

  // Bloom mode (Design.md §3.3, D2): 'core' keeps R fixed; 'extent' keeps footprint R(1+beta) fixed.
  knot.coreRadius = function (prm) {
    return prm.bloomMode === 'extent' ? prm.size / (1 + prm.beta) : prm.size;
  };
  knot.footprintRadius = function (prm) { return knot.coreRadius(prm) * (1 + prm.beta); };

  // Points of the closed curve (first point not repeated). prm: {p,q,beta,size,bloomMode,theta,h}
  knot.points = function (prm, n) {
    var R = knot.coreRadius(prm), p = prm.p, q = prm.q, b = prm.beta, th = prm.theta || 0, h = prm.h || 0;
    var shape = prm.bloomShape || 'outward', a = 1 - 1 / Math.max(1, prm.sharpness || 1);
    var P = new Array(n);
    for (var i = 0; i < n; i++) {
      var phi = 2 * Math.PI * i / n, x = q * phi;
      // Petal sharpness (Design v1.4, outward shape only): the lobe angle is warped, psi = x + a sin x with
      // a = 1 - 1/m, so the wire passes quickly through each lobe tip (x near 0) and slowly along the base
      // (x near pi): narrower petals. The SAME warped angle drives radius and lift, so the curve stays on the same
      // torus and the flat drawing keeps exactly q(p-1) crossings with the same over/under pattern
      // (psi is monotone in x because a < 1). m = 1 (a = 0) is the v1.2 shape.
      // (v1.3 instead raised the radius profile to the power m; V7 failed: extra paired crossings, see DECISIONS.md.)
      var psi = shape === 'symmetric' ? x : x + a * Math.sin(x), c = Math.cos(psi);
      // 'outward' (Design v1.2 default): base circle R stays put, lobes grow outward to R(1+beta), so each lobe
      // gets longer at fixed base width (aspect ratio rises with beta). 'symmetric' (v1.0): lobes out AND waist in.
      var r = shape === 'symmetric' ? R * (1 + b * c) : R * (1 + b * (1 + c) / 2);
      P[i] = [r * Math.cos(p * phi + th), r * Math.sin(p * phi + th), h * Math.sin(psi)];
    }
    return P;
  };

  knot.wireLength = function (P) {
    var L = 0, n = P.length;
    for (var i = 0; i < n; i++) {
      var a = P[i], b = P[(i + 1) % n];
      L += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    return L;
  };

  // Smallest centreline-to-centreline distance between two parts of the wire that are not
  // neighbours along the wire. Pairs closer than `excludeArc` (mm, measured along the wire)
  // are skipped, because adjacent points on the same strand are trivially close.
  // With `cap` (mm), only distances below cap are searched for (spatial grid, fast for large n); the result is
  // min(true clearance, cap). Without cap: exact all-pairs search.
  knot.minSelfClearance = function (P, excludeArc, cap) {
    var n = P.length, s = new Float64Array(n + 1);
    for (var i = 0; i < n; i++) {
      var a = P[i], b = P[(i + 1) % n];
      s[i + 1] = s[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    var total = s[n], best = cap || Infinity, where = null;
    function test(i2, j) {
      var arc = Math.abs(s[j] - s[i2]); arc = Math.min(arc, total - arc);
      if (arc < excludeArc) return;
      var d = Math.hypot(P[i2][0] - P[j][0], P[i2][1] - P[j][1], P[i2][2] - P[j][2]);
      if (d < best) { best = d; where = [i2, j]; }
    }
    if (!cap) {
      for (var i2 = 0; i2 < n; i2++) for (var j = i2 + 1; j < n; j++) test(i2, j);
      return { clearance: best, at: where };
    }
    var grid = new Map(), key = function (x, y, z) { return x + ',' + y + ',' + z; };
    for (var k = 0; k < n; k++) {
      var g = key(Math.floor(P[k][0] / cap), Math.floor(P[k][1] / cap), Math.floor(P[k][2] / cap));
      if (!grid.has(g)) grid.set(g, []); grid.get(g).push(k);
    }
    for (var k2 = 0; k2 < n; k2++) {
      var gx = Math.floor(P[k2][0] / cap), gy = Math.floor(P[k2][1] / cap), gz = Math.floor(P[k2][2] / cap);
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
        var cell = grid.get(key(gx + dx, gy + dy, gz + dz)); if (!cell) continue;
        for (var t = 0; t < cell.length; t++) if (cell[t] > k2) test(k2, cell[t]);
      }
    }
    return { clearance: best, at: where };
  };

  // Tightest bend: smallest circumradius of three consecutive points.
  knot.minBendRadius = function (P) {
    var n = P.length, best = Infinity;
    for (var i = 0; i < n; i++) {
      var A = P[(i - 1 + n) % n], B = P[i], C = P[(i + 1) % n];
      var a = Math.hypot(B[0] - C[0], B[1] - C[1], B[2] - C[2]);
      var b = Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2]);
      var c = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
      var ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      var cr = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      var rad = cr < 1e-15 ? Infinity : a * b * c / (2 * cr);
      if (rad < best) best = rad;
    }
    return best;
  };

  // Crossings of the flat (x,y) drawing, with which strand is on top.
  // Returns {list:[{i,j,s,t,overIsI}], pattern:'OUOU...'} where pattern is the sequence of
  // over (O) / under (U) passes met while travelling once along the wire.
  // Segments are binned on a 2D grid (cell = longest segment) so only nearby segment pairs are tested: ~O(n).
  knot.crossings = function (P) {
    var n = P.length, list = [], ev = [], cs = 0;
    for (var k = 0; k < n; k++) { var u = P[k], w = P[(k + 1) % n]; cs = Math.max(cs, Math.hypot(w[0] - u[0], w[1] - u[1])); }
    cs = cs || 1;
    var grid = new Map(), cand = [];
    for (var k2 = 0; k2 < n; k2++) {
      var A = P[k2], B = P[(k2 + 1) % n];
      var x0 = Math.floor(Math.min(A[0], B[0]) / cs), x1 = Math.floor(Math.max(A[0], B[0]) / cs);
      var y0 = Math.floor(Math.min(A[1], B[1]) / cs), y1 = Math.floor(Math.max(A[1], B[1]) / cs);
      for (var gx = x0; gx <= x1; gx++) for (var gy = y0; gy <= y1; gy++) {
        var g = gx + ',' + gy; if (!grid.has(g)) grid.set(g, []); grid.get(g).push(k2);
      }
    }
    var seen = new Set();
    grid.forEach(function (cell) {
      for (var u2 = 0; u2 < cell.length; u2++) for (var v2 = u2 + 1; v2 < cell.length; v2++) {
        var ii = Math.min(cell[u2], cell[v2]), jj = Math.max(cell[u2], cell[v2]), id = ii * n + jj;
        if (seen.has(id)) continue; seen.add(id); cand.push([ii, jj]);
      }
    });
    cand.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
    for (var ci = 0; ci < cand.length; ci++) {
      var i = cand[ci][0], j = cand[ci][1];
      if (j < i + 2 || (i === 0 && j === n - 1)) continue;
      var a = P[i], b = P[(i + 1) % n];
      {
        var c = P[j], d = P[(j + 1) % n];
        var rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
        var den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-14) continue;
        var qx = c[0] - a[0], qy = c[1] - a[1];
        var s = (qx * sy - qy * sx) / den, t = (qx * ry - qy * rx) / den;
        if (s < 0 || s >= 1 || t < 0 || t >= 1) continue;
        var zi = a[2] + s * (b[2] - a[2]), zj = c[2] + t * (d[2] - c[2]);
        var k = list.length;
        list.push({ i: i, j: j, s: s, t: t, overIsI: zi > zj, dz: Math.abs(zi - zj) });
        ev.push({ pos: i + s, o: zi > zj }, { pos: j + t, o: zj > zi });
      }
    }
    ev.sort(function (u, v) { return u.pos - v.pos; });
    return { list: list, pattern: ev.map(function (e) { return e.o ? 'O' : 'U'; }).join('') };
  };

  // Same over/under sequence up to where you start reading it (cyclic shift).
  knot.samePattern = function (a, b) {
    return a.length === b.length && (a + a).indexOf(b) >= 0;
  };

  // Lift amplitude h needed so that the wire never comes closer to itself than `clear`
  // (= wire diameter + 2 x insulation). Bisection on h; returns {h, clearance, feasible}.
  // Physics note: at small beta the strands sit almost on top of each other, and separation can
  // only come from the lift; if beta*R is too small no lift suffices (feasible=false).
  knot.solveLift = function (prm, clear, n) {
    n = n || 400;
    var R = knot.coreRadius(prm);
    var excl = Math.max(4 * clear, 3 * 2 * Math.PI * R * prm.p * (1 + prm.beta) / n);
    function clr(h) {
      var P = knot.points(Object.assign({}, prm, { h: h }), n);
      return knot.minSelfClearance(P, excl, 2 * clear).clearance;
    }
    var hmax = 10 * clear, cmax = clr(hmax);
    if (cmax < clear) return { h: hmax, clearance: cmax, feasible: false };
    var lo = 0, hi = hmax;
    if (clr(lo) >= clear) return { h: 0, clearance: clr(0), feasible: true };
    for (var it = 0; it < 30; it++) {
      var mid = 0.5 * (lo + hi);
      if (clr(mid) >= clear) hi = mid; else lo = mid;
    }
    return { h: hi, clearance: clr(hi), feasible: true };
  };

  // Lobe aspect ratio = lobe length / lobe width at half its length (both in the flat drawing).
  // Half length is where cos(psi) = 0, i.e. psi = pi/2; with the v1.4 warp psi = x + a sin x, solve for x
  // (bisection). The matching angle around the centre is x * p / q; width = 2 * that angle * radius at half length.
  // DERIVED (Claude), from the curve formula; the symmetric shape has no warp and length 2*beta*R.
  knot.lobeAspect = function (prm) {
    var R = knot.coreRadius(prm), sym = prm.bloomShape === 'symmetric', a = sym ? 0 : 1 - 1 / Math.max(1, prm.sharpness || 1);
    var lo = 0, hi = Math.PI / 2;
    for (var it = 0; it < 50; it++) { var mid = 0.5 * (lo + hi); if (mid + a * Math.sin(mid) < Math.PI / 2) lo = mid; else hi = mid; }
    var ang = 0.5 * (lo + hi) * prm.p / prm.q;
    var len = sym ? 2 * prm.beta * R : prm.beta * R, rHalf = sym ? R : R * (1 + prm.beta / 2);
    var width = 2 * ang * rHalf;
    return { length: len, width: width, aspect: len / width };
  };

  // Smallest buildable bloom for a given wire (found by validation run 1, 2026-10-20; see DECISIONS.md).
  // Near a strand, the knot sits on a thin elliptical tube (in-plane radius beta*R, lift h); the p strands
  // are spread evenly round it, so neighbouring strands are at best 2*beta*R*sin(pi/p) apart in-plane.
  // DERIVED (Claude's geometric argument, approximate); agrees with solveLift numerically to within one
  // 0.005 beta step for p = 2, 3, 5 at R = 30 mm, c = 1.5 mm.
  // 'outward' shape (v1.2): the in-plane tube radius is beta*R/2, not beta*R, so the floor doubles.
  knot.betaMinPhysical = function (p, R, clear, shape) {
    var f = (shape || 'outward') === 'symmetric' ? 2 : 1;
    return p < 2 ? 0 : clear / (f * R * Math.sin(Math.PI / p));
  };

  // Enough points to resolve every crossing: start at 100*p*q*ceil(m) (at least 400) and double until the
  // crossing count is the same across TWO doublings (n, 2n, 4n); max 25600. History: validation run 1 showed
  // 300 points missing a T(2,5) crossing; run 5 showed a one-doubling rule stopping on a spurious count
  // (T(5,6), sharpness 16, needed 16000 points).
  knot.adaptiveN = function (prm, h) {
    var n = Math.max(400, 100 * prm.p * prm.q * Math.ceil(prm.sharpness || 1)), hist = [];
    while (n <= 25600) {
      hist.push(knot.crossings(knot.points(Object.assign({}, prm, { h: h || 1 }), n)).list.length);
      var L = hist.length;
      if (L >= 3 && hist[L - 1] === hist[L - 2] && hist[L - 2] === hist[L - 3]) return n / 4;
      n *= 2;
    }
    return 25600;
  };

  // Everything a user needs to judge one element: geometry + fabrication checks.
  knot.report = function (prm, wire, n) {
    n = n || knot.adaptiveN(prm);
    var clear = wire.d + 2 * wire.tIns;
    var lift = knot.solveLift(prm, clear, n);
    var P = knot.points(Object.assign({}, prm, { h: lift.h }), n);
    var cr = knot.crossings(P);
    var bend = knot.minBendRadius(P);
    return {
      name: knot.name(prm.p, prm.q), coreRadius: knot.coreRadius(prm), footprintRadius: knot.footprintRadius(prm),
      h: lift.h, liftFeasible: lift.feasible, minClearance: lift.clearance, requiredClearance: clear,
      wireLength: knot.wireLength(P), crossings: cr.list.length, expectedCrossings: knot.expectedCrossings(prm.p, prm.q),
      pattern: cr.pattern, minBendRadius: bend, bendOK: bend >= wire.minBend, points: P, n: n,
      betaMinPhysical: knot.betaMinPhysical(prm.p, knot.coreRadius(prm), clear, prm.bloomShape),
      // the floor formula assumes no warp (m = 1); for sharper petals rely on the clearance check instead
      floorApplies: prm.bloomShape === 'symmetric' || (prm.sharpness || 1) === 1,
      lobe: knot.lobeAspect(prm)
    };
  };
});
