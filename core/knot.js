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
    var shape = prm.bloomShape || 'outward';
    var P = new Array(n);
    for (var i = 0; i < n; i++) {
      var phi = 2 * Math.PI * i / n, c = Math.cos(q * phi);
      // 'outward' (Design v1.2 default): base circle R stays put, lobes grow outward to R(1+beta), so each lobe
      // gets longer at fixed base width (aspect ratio rises with beta). 'symmetric' (v1.0): lobes out AND waist in.
      var r = shape === 'symmetric' ? R * (1 + b * c) : R * (1 + b * (1 + c) / 2);
      P[i] = [r * Math.cos(p * phi + th), r * Math.sin(p * phi + th), h * Math.sin(q * phi)];
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
  knot.minSelfClearance = function (P, excludeArc) {
    var n = P.length, s = new Float64Array(n + 1);
    for (var i = 0; i < n; i++) {
      var a = P[i], b = P[(i + 1) % n];
      s[i + 1] = s[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    var total = s[n], best = Infinity, where = null;
    for (var i2 = 0; i2 < n; i2++) {
      for (var j = i2 + 1; j < n; j++) {
        var arc = s[j] - s[i2]; arc = Math.min(arc, total - arc);
        if (arc < excludeArc) continue;
        var d = Math.hypot(P[i2][0] - P[j][0], P[i2][1] - P[j][1], P[i2][2] - P[j][2]);
        if (d < best) { best = d; where = [i2, j]; }
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
  knot.crossings = function (P) {
    var n = P.length, list = [], ev = [];
    for (var i = 0; i < n; i++) {
      var a = P[i], b = P[(i + 1) % n];
      for (var j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
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
      return knot.minSelfClearance(P, excl).clearance;
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

  // Enough points to resolve every crossing: start at 100*p*q (at least 400) and double until
  // the crossing count stops changing (max 6400). Validation run 1 showed 300 points missing a
  // crossing of T(2,5) at beta = 0.9.
  knot.adaptiveN = function (prm, h) {
    var n = Math.max(400, 100 * prm.p * prm.q), last = -1;
    while (n <= 6400) {
      var c = knot.crossings(knot.points(Object.assign({}, prm, { h: h || 1 }), n)).list.length;
      if (c === last) return n / 2;
      last = c; n *= 2;
    }
    return 6400;
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
      betaMinPhysical: knot.betaMinPhysical(prm.p, knot.coreRadius(prm), clear, prm.bloomShape)
    };
  };
});
