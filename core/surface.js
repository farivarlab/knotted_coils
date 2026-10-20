// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
HELMET SURFACE — a half-ellipsoid former, the region the array must cover, and wrapping a flat
knot onto the curved surface.

WHAT IT DOES (plain language):
  The helmet is an ellipsoid  x^2/a^2 + y^2/b^2 + z^2/c^2 = 1  (x = left-right, y = back-to-front,
  z = up; mm). The array covers everything above z = zCut, minus face exclusion zones (eyes, mouth;
  Design v1.6) and an optional crude face wedge at the front. A flat knot is drawn in the plane touching the helmet at the element's centre, and each
  point is then pushed along the surface normal onto the helmet (Design.md §4). The crossing lift
  is applied along the local normal.

DEFAULTS: placeholders until Reza supplies former dimensions (Design.md D4) — see PARAMETERS.md.

VALIDATED BY: not separately validated; distortion of each wrapped element is measured and reported.
*/
(function (factory) {
  var g = typeof globalThis !== 'undefined' ? globalThis : self;
  g.KC = g.KC || {}; g.KC_FACTORIES = g.KC_FACTORIES || [];
  g.KC_FACTORIES.push(factory); factory(g.KC);
  if (typeof module !== 'undefined') module.exports = g.KC;
})(function surfaceModule(KC) {
  'use strict';
  var S = KC.surface = {};

  S.DEFAULTS = {
    a: 85, b: 105, c: 110,      // JUDG PLACEHOLDER: inner helmet semi-axes (mm), rough adult head + clearance. Replace with real former.
    zCut: -20,                  // JUDG PLACEHOLDER: lowest covered height (mm). v1.6: was 0; lowered now that eye/mouth zones protect the face.
    face: false,                // JUDG PLACEHOLDER: crude face wedge at the front (+y). v1.6: off by default, replaced by `zones`.
    faceHalfAngle: 40,          // JUDG PLACEHOLDER: half-width of the face wedge (degrees from +y, seen from above).
    faceTop: 60,                // JUDG PLACEHOLDER: face wedge extends up to this height (mm).
    // Face exclusion zones (Design v1.6, WP11). Each is an ellipse in angle seen from the helmet centre:
    // az = azimuth from the front (+y) towards +x, el = elevation above the equator (both degrees, computed on the
    // ellipsoid-normalised direction so the same zone lands consistently on head and helmet); w, hgt = half-widths.
    // All values JUDG PLACEHOLDER (rough adult proportions), to be replaced by measured positions or a real head mesh.
    zones: [
      { name: 'right eye', az: -17, el: 5, w: 13, hgt: 10 },
      { name: 'left eye', az: 17, el: 5, w: 13, hgt: 10 },
      { name: 'mouth', az: 0, el: -30, w: 20, hgt: 9 }
    ],
    zoneMargin: 5               // JUDG PLACEHOLDER: wires must stay at least this far (mm) outside every zone.
  };

  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(u, v) { return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; }
  function dot(u, v) { return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; }
  S.norm = norm; S.cross = cross; S.dot = dot;

  S.normal = function (H, p) { return norm([p[0] / (H.a * H.a), p[1] / (H.b * H.b), p[2] / (H.c * H.c)]); };

  // Pull any point onto the ellipsoid along the ray from the centre.
  S.snap = function (H, p) {
    var f = Math.sqrt(p[0] * p[0] / (H.a * H.a) + p[1] * p[1] / (H.b * H.b) + p[2] * p[2] / (H.c * H.c));
    return [p[0] / f, p[1] / f, p[2] / f];
  };

  // Local frame at a surface point: n (outward normal), e1 (towards the top, along the meridian), e2 = n x e1.
  S.frame = function (H, p) {
    var n = S.normal(H, p), up = [0, 0, 1];
    var e1 = [up[0] - dot(up, n) * n[0], up[1] - dot(up, n) * n[1], up[2] - dot(up, n) * n[2]];
    if (Math.hypot(e1[0], e1[1], e1[2]) < 1e-6) e1 = [1, 0, 0];   // at the very top: fixed choice
    e1 = norm(e1);
    return { n: n, e1: e1, e2: cross(n, e1) };
  };

  // Intersection of the line q + t*n with the ellipsoid, the root nearest t = 0.
  S.alongNormal = function (H, q, n) {
    var A = n[0] * n[0] / (H.a * H.a) + n[1] * n[1] / (H.b * H.b) + n[2] * n[2] / (H.c * H.c);
    var B = 2 * (q[0] * n[0] / (H.a * H.a) + q[1] * n[1] / (H.b * H.b) + q[2] * n[2] / (H.c * H.c));
    var C = q[0] * q[0] / (H.a * H.a) + q[1] * q[1] / (H.b * H.b) + q[2] * q[2] / (H.c * H.c) - 1;
    var disc = B * B - 4 * A * C;
    if (disc < 0) return S.snap(H, q);
    var r = Math.sqrt(disc), t1 = (-B + r) / (2 * A), t2 = (-B - r) / (2 * A);
    var t = Math.abs(t1) < Math.abs(t2) ? t1 : t2;
    return [q[0] + t * n[0], q[1] + t * n[1], q[2] + t * n[2]];
  };

  // Angular position of p (degrees), on the ellipsoid-normalised direction.
  S.angles = function (H, p) {
    var x = p[0] / H.a, y = p[1] / H.b, z = p[2] / H.c, r = Math.sqrt(x * x + y * y + z * z);
    return { az: Math.atan2(x, y) * 180 / Math.PI, el: Math.asin(Math.max(-1, Math.min(1, z / r))) * 180 / Math.PI };
  };
  // Index of the first exclusion zone containing p, grown by `margin` mm (converted to angle at the front
  // radius H.b); -1 if none.
  S.zoneHit = function (H, p, margin) {
    var Z = H.zones || [], A = S.angles(H, p), m = (margin || 0) / H.b * 180 / Math.PI;
    for (var i = 0; i < Z.length; i++) {
      var da = A.az - Z[i].az; da = ((da + 540) % 360) - 180;
      var u = da / (Z[i].w + m), v = (A.el - Z[i].el) / (Z[i].hgt + m);
      if (u * u + v * v <= 1) return i;
    }
    return -1;
  };
  // Number of wire points inside any zone (grown by margin); used by the solver and the final report.
  S.zonePoints = function (H, pts, margin) {
    var c = 0; for (var i = 0; i < pts.length; i++) if (S.zoneHit(H, pts[i], margin) >= 0) c++;
    return c;
  };

  S.inCoverage = function (H, p) {
    if (p[2] < H.zCut) return false;
    if (S.zoneHit(H, p, 0) >= 0) return false;
    if (H.face && p[1] > 0 && p[2] < H.faceTop) {
      var ang = Math.atan2(Math.abs(p[0]), p[1]) * 180 / Math.PI;
      if (ang < H.faceHalfAngle) return false;
    }
    return true;
  };

  // Wrap a flat element onto the helmet. local: [[x,y,z],...] in the element plane (z = crossing lift).
  // Returns world points and the surface normal at each (normals are reused for self-inductance).
  S.wrap = function (H, local, centre) {
    var F = S.frame(H, centre), pts = [], nrm = [];
    for (var i = 0; i < local.length; i++) {
      var l = local[i];
      var q = [centre[0] + l[0] * F.e1[0] + l[1] * F.e2[0], centre[1] + l[0] * F.e1[1] + l[1] * F.e2[1],
        centre[2] + l[0] * F.e1[2] + l[1] * F.e2[2]];
      var s = S.alongNormal(H, q, F.n), ns = S.normal(H, s);
      pts.push([s[0] + l[2] * ns[0], s[1] + l[2] * ns[1], s[2] + l[2] * ns[2]]);
      nrm.push(ns);
    }
    return { points: pts, normals: nrm, frame: F };
  };

  S.point = function (H, u, v) { return [H.a * Math.cos(v) * Math.cos(u), H.b * Math.cos(v) * Math.sin(u), H.c * Math.sin(v)]; };

  // Covered area (mm^2) by summing small surface patches on a (u,v) grid.
  S.coveredArea = function (H, nu, nv) {
    nu = nu || 360; nv = nv || 180;
    var du = 2 * Math.PI / nu, dv = Math.PI / nv, A = 0;
    for (var i = 0; i < nu; i++) for (var j = 0; j < nv; j++) {
      var u = (i + 0.5) * du, v = -Math.PI / 2 + (j + 0.5) * dv, p = S.point(H, u, v);
      if (!S.inCoverage(H, p)) continue;
      var pu = [-H.a * Math.cos(v) * Math.sin(u), H.b * Math.cos(v) * Math.cos(u), 0];
      var pv = [-H.a * Math.sin(v) * Math.cos(u), -H.b * Math.sin(v) * Math.sin(u), H.c * Math.cos(v)];
      var c = cross(pu, pv);
      A += Math.hypot(c[0], c[1], c[2]) * du * dv;
    }
    return A;
  };

  // Near-uniform sample points over the covered region (Fibonacci sphere, scaled onto the ellipsoid).
  S.samples = function (H, n) {
    var out = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var z = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - z * z), th = i * ga;
      var p = [H.a * r * Math.cos(th), H.b * r * Math.sin(th), H.c * z];
      if (S.inCoverage(H, p)) out.push(p);
    }
    return out;
  };
});
