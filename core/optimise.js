// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
OPTIMISE — automatic geometric decoupling of N knotted elements on the helmet (Design.md §5).

WHAT IT DOES (plain language):
  Unknowns: one shared element size (footprint radius Rf), each element's centre on the helmet,
  and each element's in-plane rotation. Goal: neighbouring elements have coupling k close to 0,
  while together the elements cover the whole region. Cost =
      sum over neighbour pairs of w(d) * (k^2 + lambdaMax * k^4 / thr^2)  +  lambdaCov * sum over helmet sample points of gap^2
  (the k^4 part is a smooth stand-in for the worst-pair term of Design §5.1; added 2026-10-20)
  where gap = how far a sample point lies outside the nearest element's footprint (in units of Rf),
  and w(d) = 1 for overlapping footprints, fading to 0 just beyond touching (Design.md §5.1).

  Stage 1 (fast): coupling of two flat elements is pre-computed once as a table over
  (centre distance, rotation 1, rotation 2) and looked up. Stage 2 (exact): the real wrapped wires
  on the curved helmet, with the Neumann integral recomputed after every trial move.
  Search method: a simple accept-if-better local search (try small moves of each element in turn;
  keep the best one if it lowers the cost; shrink the step when few moves help). Slow but transparent.

  Honest-reporting rule (Design.md §5.3): the array is called "decoupled" only if EVERY neighbour
  pair has |k| below the threshold. Next-nearest-neighbour coupling is reported but not targeted.

  Design v1.6 additions:
  - Face exclusion zones: elements pay lambdaZone per sample inside a zone (+margin): disc samples of each footprint in
    the fast stage, real wire points in the exact stage and ring mode. The final report counts wire points in zones.
  - Multi-start: several seeds; starts after the first jitter the starting centres; the best by worst adjacent |k|
    in the exact final report is returned, with the spread of all starts.
  - Ring mode: elements in rings (elevation, spacing, rotation, size, bloom, sharpness per ring), mirror-symmetric
    about x = 0 by construction (left twins use the mirror-image knot; midline elements get mirror-compatible
    rotations). Ring mode evaluates exact Neumann coupling between Voronoi-adjacent elements directly.
  - "Adjacent" pairs (Voronoi): two elements are adjacent if some helmet sample point is (nearly) equidistant from
    them and nearer to them than to any other centre. Reported for every mode.

MATLAB EQUIVALENT: the cost function is plain sums; the search is like a hand-written
  pattern search (patternsearch in the Global Optimization Toolbox is the closest built-in).

VALIDATED BY: underlying M and L are validated (V1, V2, V4, V5). The optimiser itself has no
  ground truth; every result it produces is labelled "geometric decoupling estimate, exploratory".
*/
(function (factory) {
  var g = typeof globalThis !== 'undefined' ? globalThis : self;
  g.KC = g.KC || {}; g.KC_FACTORIES = g.KC_FACTORIES || [];
  g.KC_FACTORIES.push(factory); factory(g.KC);
  if (typeof module !== 'undefined') module.exports = g.KC;
})(function optimiseModule(KC) {
  'use strict';
  var O = KC.opt = {};
  var S = KC.surface, K = KC.knot, I = KC.ind, Lay = KC.layout;

  O.DEFAULTS = {
    thresholdK: 0.01,   // JUDG PLACEHOLDER (Design.md D6): "decoupled" means |k| < 0.01 for every neighbour pair.
    lambdaMax: 1,       // JUDG (value chosen before testing, not tuned): weight of the smooth worst-pair term (Design §5.1 lambda_max).
                        // Made default by the pre-registered comparison (validation/compare_worstpair.html): all 3 criteria met.
                        // Trade-off seen there: lower worst pair, but higher median |k| and more pairs above threshold. 0 = old solver.
    lambdaCov: 1,       // JUDG: coverage weight. Large enough that gaps dominate small k^2 values (k^2 ~ 1e-4), so coverage is met first.
    nTable: 128,        // JUDG: points per element in the stage-1 table. Alt: 96, 200. Stage 2 corrects table error.
    tableDMin: 0.3,     // JUDG: table range in units of Rf (0.3 = nearly on top of each other) ...
    tableDMax: 3.0,     // JUDG: ... to 3.0 (well past touching at 2.0). Beyond: treated as 0 in stage 1 only.
    tableND: 55,        // DERIVED: 0.05 Rf distance steps over 0.3-3.0.
    tableNA: 12,        // JUDG: rotation steps per symmetry period 2pi/q.
    nExact: 160,        // JUDG: points per element during stage 2 (speed). Final report uses nFinal.
    nFinal: 300,        // JUDG: points per element in the final reported k matrix. V4 checks convergence at this level.
    nSelfL: 300,        // JUDG: points for self-inductance.
    sweeps1: 300,       // JUDG: max stage-1 sweeps (it usually stops earlier when steps become tiny).
    sweeps2: 12,        // JUDG: max stage-2 sweeps.
    wNear: 2.0,         // DERIVED: footprints overlap when centre distance < 2 Rf -> weight 1.
    wTaper: 2.4,        // JUDG: weight fades linearly to 0 at 2.4 Rf so pairs can't "escape" by stepping just past 2 Rf.
    target: 'ring1',    // Design.md v1.1 §5.1 (Reza, 2026-10-20): "decoupled" = nearest ring only. 'footprint' (= v1.0 rule,
                        // footprints overlap, d < 2 Rf) remains selectable and its verdict is always reported too.
    ring1: 1.35,        // JUDG: 'ring1' neighbours are closer than 1.35 x the pair-null spacing (hexagonal 2nd ring sits at 1.73x). Alt: 1.25-1.5.
    ring1Taper: 1.55,   // JUDG: 'ring1' weight fades to 0 at 1.55 x null spacing.
    rotation: 'free',   // In-plane rotation: 'free' = each element optimised separately; 'locked' = one shared angle,
                        // optimised; 'fixed' = all elements at theta0, not optimised. (Reza, 2026-10-20: rotation as a decoupling lever.)
    theta0: 0,          // JUDG: starting / fixed in-plane rotation (radians) for every element.
    nSamples: 2400,     // JUDG: coverage sample points on the full ellipsoid (fewer fall inside the covered region).
    seed: 1,            // JUDG: random seed for move order; stored in exports so runs are reproducible.
    // ---- Design v1.6 ----
    lambdaZone: 1,      // JUDG: penalty per footprint/wire sample inside a face exclusion zone (+margin). Raised from 0.05 during development (2026-10-20) after wires still entered zones; before any C2 run.
    covBuffer: 0.5,     // JUDG: helmet points within (zone margin + covBuffer x footprint radius) of a zone are not required to be covered, so coverage does not pull wires into zones.
    starts: 1,          // WP3: number of starts (seeds seed..seed+starts-1); best kept by worst adjacent |k| (exact report).
    jitter: 0.25,       // JUDG: starts after the first move each starting centre by up to 0.25 x spacing (seed-dependent).
    layout: 'free',     // 'free' (per-element positions, v1.0-1.5 solver) or 'ring' (mirror-symmetric rings, WP1).
    ringCounts: null,   // ring mode: elements per ring, top to bottom (e.g. [1,6,9]); null = automatic from N.
    ringSize: 'ring',   // ring mode, element size: 'ring' = optimised per ring; 'fixed' = the starting estimate, unchanged.
    ringBloom: 'fixed', // ring mode, bloom: 'fixed' = the knot's beta for all rings; 'ring' = optimised per ring (0.05-3).
    ringSharp: 'fixed', // ring mode, petal sharpness: 'fixed' or 'ring' (1-8).
    ringN: 96,          // JUDG: points per element during ring-mode search (speed); final report uses nFinal.
    ringSweeps: 60      // JUDG: max ring-mode sweeps (stops earlier when steps become tiny).
  };

  function opts(o) { return Object.assign({}, O.DEFAULTS, o || {}); }
  function clearanceOf(w) { return w.d + 2 * w.tIns; }

  // ---------- Stage-1 table: M between two flat elements of footprint radius 1 ----------
  O.buildTable = function (kp, hN, epsN, o) {
    o = opts(o);
    var nd = o.tableND, na = o.tableNA, period = 2 * Math.PI / kp.q;
    var data = new Float64Array(nd * na * na);
    var A = [], B = [];
    for (var ia = 0; ia < na; ia++) {
      var th = ia * period / na;
      var base = { p: kp.p, q: kp.q, beta: kp.beta, size: 1, bloomMode: 'extent', bloomShape: kp.shape, sharpness: kp.sharpness, h: hN, theta: th };
      A.push(I.prep(K.points(base, o.nTable)));
      B.push(K.points(base, o.nTable));
    }
    for (var id = 0; id < nd; id++) {
      var d = o.tableDMin + id * (o.tableDMax - o.tableDMin) / (nd - 1);
      for (var ib = 0; ib < na; ib++) {
        var Bs = I.prep(B[ib].map(function (p) { return [p[0] + d, p[1], p[2]]; }));
        for (var ia2 = 0; ia2 < na; ia2++) data[(id * na + ia2) * na + ib] = I.mutual(A[ia2], Bs, epsN);
      }
    }
    return { nd: nd, na: na, dmin: o.tableDMin, dmax: o.tableDMax, period: period, data: data };
  };

  // Linear interpolation in distance and both rotations (rotations wrap around every 2pi/q).
  O.lookup = function (T, dn, a1, a2) {
    if (dn >= T.dmax) return 0;
    var x = (Math.max(dn, T.dmin) - T.dmin) / (T.dmax - T.dmin) * (T.nd - 1);
    var i0 = Math.min(T.nd - 2, Math.floor(x)), fx = x - i0;
    function wrap(a) { var u = (a % T.period + T.period) % T.period / T.period * T.na; return u; }
    var y = wrap(a1), z = wrap(a2), j0 = Math.floor(y) % T.na, k0 = Math.floor(z) % T.na, fy = y - Math.floor(y), fz = z - Math.floor(z);
    var j1 = (j0 + 1) % T.na, k1 = (k0 + 1) % T.na, na = T.na, D = T.data;
    function v(i, j, k) { return D[(i * na + j) * na + k]; }
    var c00 = v(i0, j0, k0) * (1 - fx) + v(i0 + 1, j0, k0) * fx, c01 = v(i0, j0, k1) * (1 - fx) + v(i0 + 1, j0, k1) * fx;
    var c10 = v(i0, j1, k0) * (1 - fx) + v(i0 + 1, j1, k0) * fx, c11 = v(i0, j1, k1) * (1 - fx) + v(i0 + 1, j1, k1) * fx;
    return (c00 * (1 - fz) + c01 * fz) * (1 - fy) + (c10 * (1 - fz) + c11 * fz) * fy;
  };

  // Largest table distance where M(d) (both rotations 0) crosses from + to -: the classic overlap null.
  O.tableZero = function (T) {
    var best = null;
    for (var i = 0; i < T.nd - 1; i++) {
      var a = T.data[(i * T.na) * T.na], b = T.data[((i + 1) * T.na) * T.na];
      if (a > 0 && b <= 0) best = T.dmin + (i + a / (a - b)) * (T.dmax - T.dmin) / (T.nd - 1);
    }
    return best;
  };

  // Flat element at footprint radius Rf (mm): points, self-inductance.
  O.elementPoints = function (kp, Rf, theta, h, n) {
    return K.points({ p: kp.p, q: kp.q, beta: kp.beta, size: Rf, bloomMode: 'extent', bloomShape: kp.shape, sharpness: kp.sharpness, theta: theta, h: h }, n);
  };

  // ---------- Pair analysis (Design.md §5.3): k vs centre distance for two flat elements ----------
  O.pairScan = function (kp, Rf, wire, a1, a2, o) {
    o = Object.assign({ dMin: 0.5 * Rf, dMax: 2.6 * Rf, nd: 60, n: 300 }, o || {});
    var c = clearanceOf(wire), lift = K.solveLift({ p: kp.p, q: kp.q, beta: kp.beta, size: Rf, bloomMode: 'extent', bloomShape: kp.shape, sharpness: kp.sharpness }, c, 200);
    var A = O.elementPoints(kp, Rf, a1, lift.h, o.n), Bp = O.elementPoints(kp, Rf, a2, lift.h, o.n);
    var pa = I.prep(A), L1 = I.selfL(A, wire.d / 2), L2 = I.selfL(Bp, wire.d / 2);
    function k(d) { return I.mutual(pa, Bp.map(function (p) { return [p[0] + d, p[1], p[2]]; }), c) / Math.sqrt(L1 * L2); }
    var ds = [], ks = [];
    for (var i = 0; i < o.nd; i++) { var d = o.dMin + i * (o.dMax - o.dMin) / (o.nd - 1); ds.push(d); ks.push(k(d)); }
    var zeros = [];
    for (var j = 0; j < o.nd - 1; j++) {
      if ((ks[j] > 0) === (ks[j + 1] > 0)) continue;
      var lo = ds[j], hi = ds[j + 1], klo = ks[j];
      for (var it = 0; it < 30; it++) { var m = 0.5 * (lo + hi), km = k(m); if ((km > 0) === (klo > 0)) { lo = m; klo = km; } else hi = m; }
      var z = 0.5 * (lo + hi), slope = (k(z + 0.2) - k(z - 0.2)) / 0.4;   // per mm
      zeros.push({ d: z, dOverRf: z / Rf, slopePerMm: slope });
    }
    return { d: ds, k: ks, zeros: zeros, L: L1, h: lift.h };
  };

  // ---------- Shared set-up ----------
  O.setup = function (cfg) {
    var o = opts(cfg.opts), H = cfg.helmet, kp = cfg.knot, w = cfg.wire, c = clearanceOf(w);
    var samples = S.samples(H, o.nSamples), area = S.coveredArea(H);
    var spacing = Math.sqrt(2 * area / (Math.sqrt(3) * cfg.N));   // DERIVED: hexagonal packing, area per element = (sqrt3/2) s^2
    var Rf0 = spacing / 1.5;
    var lift = K.solveLift({ p: kp.p, q: kp.q, beta: kp.beta, size: Rf0, bloomMode: 'extent', bloomShape: kp.shape, sharpness: kp.sharpness }, c, 200);
    var T = O.buildTable(kp, lift.h / Rf0, c / Rf0, o);
    var zn = O.tableZero(T) || 1.5;
    var ctx = { cfg: cfg, o: o, H: H, kp: kp, wire: w, c: c, a: w.d / 2, h: lift.h, liftFeasible: lift.feasible,
      samples: samples, area: area, spacing: spacing, T: T, tableZero: zn, Lcache: {}, mode: 'free' };
    ctx.covSamples = covFilter(H, samples, o.covBuffer * spacing / zn);
    var C0 = Lay.initialCentres(H, cfg.N, samples);
    if (o.startIndex > 0) C0 = jitterCentres(H, C0, o.jitter * spacing, Lay.rng(o.seed * 7919 + 13));
    ctx.state = { C: C0, th: new Float64Array(cfg.N).fill(o.theta0), Rf: spacing / zn };
    return ctx;
  };

  // Helmet samples that must be covered: those farther than (zone margin + buffer mm) from every exclusion zone.
  function covFilter(H, samples, buffer) {
    if (!(H.zones && H.zones.length)) return samples;
    return samples.filter(function (s) { return S.zoneHit(H, s, (H.zoneMargin || 0) + buffer) < 0; });
  }

  // Starts after the first: move each starting centre randomly by up to `amp` mm along the surface (kept only if
  // it stays in the covered region), so different starts explore different layouts.
  function jitterCentres(H, C, amp, rnd) {
    return C.map(function (c) {
      var F = S.frame(H, c), a = 2 * Math.PI * rnd(), r = amp * rnd();
      var p = S.snap(H, [c[0] + r * (Math.cos(a) * F.e1[0] + Math.sin(a) * F.e2[0]), c[1] + r * (Math.cos(a) * F.e1[1] + Math.sin(a) * F.e2[1]),
        c[2] + r * (Math.cos(a) * F.e1[2] + Math.sin(a) * F.e2[2])]);
      return S.inCoverage(H, p) ? p : c;
    });
  }

  // 97 points covering an element's footprint disc (centre + 4 rings of 24), snapped to the helmet. Used to keep
  // footprints out of exclusion zones in the fast stage, where wires are not built. (12 per ring was too coarse:
  // an eye zone could slip between rim samples ~24 mm apart; found in development 2026-10-20.)
  O.discPoints = function (H, c, Rf) {
    var F = S.frame(H, c), out = [c];
    [1 / 4, 1 / 2, 3 / 4, 1].forEach(function (f) {
      for (var k = 0; k < 24; k++) {
        var a = 2 * Math.PI * k / 24, x = f * Rf * Math.cos(a), y = f * Rf * Math.sin(a);
        out.push(S.snap(H, [c[0] + x * F.e1[0] + y * F.e2[0], c[1] + x * F.e1[1] + y * F.e2[1], c[2] + x * F.e1[2] + y * F.e2[2]]));
      }
    });
    return out;
  };

  // Voronoi adjacency from helmet samples: pairs (nearest, second-nearest centre) for samples where the two
  // distances differ by less than `tol` mm, i.e. samples lying on the border between the two elements' regions.
  O.adjacency = function (samples, C, tol) {
    var set = new Set(), N = C.length;
    for (var s = 0; s < samples.length; s++) {
      var p = samples[s], b1 = -1, d1 = Infinity, b2 = -1, d2 = Infinity;
      for (var e = 0; e < N; e++) {
        var d = Lay.dist(p, C[e]);
        if (d < d1) { b2 = b1; d2 = d1; b1 = e; d1 = d; } else if (d < d2) { b2 = e; d2 = d; }
      }
      if (b2 >= 0 && d2 - d1 < tol) set.add(Math.min(b1, b2) + ',' + Math.max(b1, b2));
    }
    return set;
  };
  function adjTol(ctx) { return 2 * Math.sqrt(ctx.area / Math.max(1, ctx.samples.length)); }   // DERIVED: ~2 sample spacings

  // Element i's parameters. Free mode: shared shape/size, own centre and rotation. Ring mode supplies ctx.elemFn.
  O.elem = function (ctx, i) {
    if (ctx.elemFn) return ctx.elemFn(i);
    var st = ctx.state;
    return { Rf: st.Rf, beta: ctx.kp.beta, m: ctx.kp.sharpness || 1, theta: st.th[i], mirror: false, h: ctx.h, centre: st.C[i] };
  };
  O.elemFlat = function (ctx, e, n) {
    return K.points({ p: ctx.kp.p, q: ctx.kp.q, beta: e.beta, size: e.Rf, bloomMode: 'extent', bloomShape: ctx.kp.shape,
      sharpness: e.m, theta: e.theta, h: e.h, mirror: e.mirror }, n);
  };

  O.Lflat = function (ctx, Rf) {
    var key = Rf.toFixed(4);
    if (!ctx.Lcache[key]) ctx.Lcache[key] = I.selfL(O.elementPoints(ctx.kp, Rf, 0, ctx.h, ctx.o.nSelfL), ctx.a);
    return ctx.Lcache[key];
  };

  // Neighbour weight w(d), d in units of Rf. 'footprint' = frozen Design.md rule; 'ring1' = nearest ring only.
  function band(ctx) {
    var o = ctx.o;
    return o.target === 'ring1' ? [o.ring1 * ctx.tableZero, o.ring1Taper * ctx.tableZero] : [o.wNear, o.wTaper];
  }
  function weightFn(ctx) {
    var b = band(ctx);
    return function (dn) { return dn <= b[0] ? 1 : dn >= b[1] ? 0 : (b[1] - dn) / (b[1] - b[0]); };
  }

  // Generic local search shared by both stages. `model` supplies pair coupling and per-element rebuilds.
  function search(ctx, model, sweeps, steps, onProgress, stageName) {
    var st = ctx.state, N = st.C.length, o = ctx.o, rnd = Lay.rng(o.seed + (stageName === 'exact' ? 7 : 0));
    var frames = st.C.map(function (p) { return S.frame(ctx.H, p); });
    var cand, sc, es, weight = weightFn(ctx), lamMax = o.lambdaMax, thr2 = o.thresholdK * o.thresholdK;
    function rebuildLists() {
      var R = st.Rf;
      cand = st.C.map(function (ci, i) {
        var l = []; for (var j = 0; j < N; j++) if (j !== i && Lay.dist(ci, st.C[j]) < model.range * R * 1.3) l.push(j); return l;
      });
      es = st.C.map(function () { return []; });
      sc = ctx.covSamples.map(function (s, si) {
        var l = []; for (var e = 0; e < N; e++) if (Lay.dist(s, st.C[e]) < 2.5 * R) { l.push(e); es[e].push(si); } return l;
      });
    }
    function gap(si) {
      var s = ctx.covSamples[si], l = sc[si], m = Infinity;
      if (!l.length) { for (var e = 0; e < N; e++) m = Math.min(m, Lay.dist(s, st.C[e])); }
      else for (var q = 0; q < l.length; q++) m = Math.min(m, Lay.dist(s, st.C[l[q]]));
      var g = m / st.Rf - 1; return g > 0 ? g * g : 0;
    }
    function pairCost(i, j) {
      var dn = Lay.dist(st.C[i], st.C[j]) / st.Rf, wt = weight(dn);
      if (wt === 0) return 0;
      var k = model.k(i, j, frames), k2 = k * k;
      // Worst-pair term (Design §5.1 lambda_max), smooth stand-in: + lambdaMax * k^4 / thr^2. It equals k^2
      // when |k| = threshold, grows much faster above it, and is negligible well below it.
      return wt * (k2 + lamMax * k2 * k2 / thr2);
    }
    function local(i) {
      var c = 0, l = cand[i]; for (var q = 0; q < l.length; q++) c += pairCost(i, l[q]);
      var s = es[i]; for (var r = 0; r < s.length; r++) c += o.lambdaCov * gap(s[r]);
      return c + o.lambdaZone * model.zone(i);
    }
    function total() {
      var c = 0;
      for (var i = 0; i < N; i++) {
        for (var q = 0; q < cand[i].length; q++) if (cand[i][q] > i) c += pairCost(i, cand[i][q]);
        c += o.lambdaZone * model.zone(i);
      }
      for (var si = 0; si < ctx.covSamples.length; si++) c += o.lambdaCov * gap(si);
      return c;
    }
    rebuildLists();
    var pos = steps.pos, rot = steps.rot, rs = steps.R, history = [];
    for (var sw = 0; sw < sweeps; sw++) {
      if (sw % 5 === 0) rebuildLists();
      var order = []; for (var i = 0; i < N; i++) order.push(i);
      for (var x = N - 1; x > 0; x--) { var y = Math.floor(rnd() * (x + 1)), t = order[x]; order[x] = order[y]; order[y] = t; }
      var accepted = 0;
      for (var oi = 0; oi < N; oi++) {
        // zones first (lexicographic): a move is better if it has fewer zone samples, or equal zone samples and lower cost
        var e = order[oi], base = local(e), best = null, bestC = base, bestZ = model.zone(e);
        var c0 = st.C[e], f0 = frames[e], th0 = st.th[e];
        var moves = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        // rescue: an element still touching a zone also tries jumps of 0.5-1.5 footprints in 8 directions
        // (development fix 2026-10-20: an element trapped between the eyes could not escape with small steps)
        if (bestZ > 0) [0.5, 1, 1.5].forEach(function (jm) {
          for (var a8 = 0; a8 < 8; a8++) moves.push([Math.cos(a8 * Math.PI / 4) * jm / pos, Math.sin(a8 * Math.PI / 4) * jm / pos, 0]);
        });
        for (var mi = 0; mi < moves.length; mi++) {
          var mv = moves[mi], dp = pos * st.Rf;
          if (mv[2] !== 0 && o.rotation !== 'free') continue;   // shared/fixed rotation: no per-element turns
          var np = S.snap(ctx.H, [c0[0] + dp * (mv[0] * f0.e1[0] + mv[1] * f0.e2[0]), c0[1] + dp * (mv[0] * f0.e1[1] + mv[1] * f0.e2[1]),
            c0[2] + dp * (mv[0] * f0.e1[2] + mv[1] * f0.e2[2])]);
          if (!S.inCoverage(ctx.H, np)) continue;
          st.C[e] = np; frames[e] = S.frame(ctx.H, np); st.th[e] = th0 + mv[2] * rot;
          model.update(e, frames);
          var cst = local(e), zz = model.zone(e);
          if (zz < bestZ || (zz === bestZ && cst < bestC - 1e-15)) { bestC = cst; bestZ = zz; best = { C: np, F: frames[e], th: st.th[e] }; }
          st.C[e] = c0; frames[e] = f0; st.th[e] = th0;
        }
        if (best) { st.C[e] = best.C; frames[e] = best.F; st.th[e] = best.th; accepted++; }
        model.update(e, frames);
      }
      // shared size: try a little bigger / smaller
      var zsum = function () { var z = 0; for (var q = 0; q < N; q++) z += model.zone(q); return z; };
      var F0 = total(), R0 = st.Rf, bestR = R0, bestF = F0, bestZs = zsum();
      [1 + rs, 1 - rs].forEach(function (f) {
        st.Rf = R0 * f; model.resize(frames); var F = total(), Z = zsum();
        if (Z < bestZs || (Z === bestZs && F < bestF)) { bestF = F; bestR = st.Rf; bestZs = Z; }
      });
      st.Rf = bestR; model.resize(frames);
      if (o.rotation === 'locked') {          // one shared angle: try turning every element together
        var th0s = Array.from(st.th), bestD = 0;
        [rot, -rot].forEach(function (dth) {
          for (var q = 0; q < N; q++) st.th[q] = th0s[q] + dth;
          model.resize(frames); var F = total();
          if (F < bestF) { bestF = F; bestD = dth; }
        });
        for (var q2 = 0; q2 < N; q2++) st.th[q2] = th0s[q2] + bestD;
        model.resize(frames);
      }
      history.push(bestF);
      if (accepted < 0.2 * N) { pos *= 0.7; rot *= 0.7; rs *= 0.7; }
      if (onProgress) onProgress({ stage: stageName, sweep: sw + 1, of: sweeps, cost: bestF, Rf: st.Rf, accepted: accepted });
      if (pos < 0.002) break;
    }
    return history;
  };

  // Stage 1: table lookups on flat-pair geometry.
  O.stage1 = function (ctx, onProgress) {
    var st = ctx.state, T = ctx.T, L = O.Lflat(ctx, st.Rf);
    var model = {
      range: ctx.o.wTaper,
      k: function (i, j, F) {
        var ci = st.C[i], cj = st.C[j], v = [cj[0] - ci[0], cj[1] - ci[1], cj[2] - ci[2]], w = [-v[0], -v[1], -v[2]];
        var psi = Math.atan2(S.dot(v, F[i].e2), S.dot(v, F[i].e1)), psj = Math.atan2(S.dot(w, F[j].e2), S.dot(w, F[j].e1));
        var dn = Math.hypot(v[0], v[1], v[2]) / st.Rf;
        return st.Rf * O.lookup(T, dn, st.th[i] - psi, st.th[j] - (psj + Math.PI)) / L;
      },
      update: function () {},
      resize: function () { L = O.Lflat(ctx, st.Rf); },
      // footprint disc samples inside a zone (+margin); wires lie within the disc, so this is conservative
      zone: function (i) {
        if (!(ctx.H.zones && ctx.H.zones.length)) return 0;
        var pts = O.discPoints(ctx.H, st.C[i], 1.1 * st.Rf);   // JUDG: +10%, wrapped wires reach ~5% past Rf
        return S.zonePoints(ctx.H, pts, ctx.H.zoneMargin);
      }
    };
    return search(ctx, model, ctx.o.sweeps1, { pos: 0.15, rot: Math.PI / (3 * ctx.kp.q), R: 0.05 }, onProgress, 'table');
  };

  // Wrap element i onto the helmet at its current centre/rotation/size/shape (free or ring mode).
  O.buildElement = function (ctx, i, n) {
    var e = O.elem(ctx, i), F = S.frame(ctx.H, e.centre), flat = O.elemFlat(ctx, e, n);
    var W = S.wrap(ctx.H, flat, e.centre);
    return { points: W.points, normals: W.normals, prep: I.prep(W.points), L: I.selfL(W.points, ctx.a, W.normals), frame: F, flat: flat, e: e };
  };
  // Wire points inside zones (+margin), rescaled to the 97-sample footprint scale so lambdaZone means the same in all stages.
  function wireZone(ctx, E) {
    if (!(ctx.H.zones && ctx.H.zones.length)) return 0;
    return S.zonePoints(ctx.H, E.points, ctx.H.zoneMargin) * 97 / E.points.length;
  }

  // Stage 2: exact Neumann on the wrapped wires.
  O.stage2 = function (ctx, onProgress) {
    var st = ctx.state, N = st.C.length, n = ctx.o.nExact, el = [];
    for (var i = 0; i < N; i++) el.push(O.buildElement(ctx, i, n));
    var model = {
      range: ctx.o.wTaper,
      k: function (i, j) { return I.mutual(el[i].prep, el[j].prep, ctx.c) / Math.sqrt(el[i].L * el[j].L); },
      update: function (e) { el[e] = O.buildElement(ctx, e, n); },
      resize: function () { for (var q = 0; q < N; q++) el[q] = O.buildElement(ctx, q, n); },
      zone: function (i) { return wireZone(ctx, el[i]); }
    };
    return search(ctx, model, ctx.o.sweeps2, { pos: 0.04, rot: Math.PI / (12 * ctx.kp.q), R: 0.02 }, onProgress, 'exact');
  };

  // ---------- Final, honest report (Design.md §5.3, §8; v1.6 adds adjacency, regularity, zones, per-element shapes) ----------
  O.report = function (ctx, onProgress) {
    var st = ctx.state, N = st.C.length, o = ctx.o, el = [], elLow = [], E = [];
    for (var i = 0; i < N; i++) {
      el.push(O.buildElement(ctx, i, o.nFinal)); E.push(el[i].e);
      if (onProgress) onProgress({ stage: 'report', sweep: i + 1, of: N });
    }
    var adj = O.adjacency(ctx.samples, st.C, adjTol(ctx));
    var kM = new Float64Array(N * N), pairs = [];
    for (var a = 0; a < N; a++) for (var b = a + 1; b < N; b++) {
      var d = Lay.dist(st.C[a], st.C[b]), Rm = (E[a].Rf + E[b].Rf) / 2, dn = d / Rm, k;
      if (dn < 3.5) k = I.mutual(el[a].prep, el[b].prep, ctx.c) / Math.sqrt(el[a].L * el[b].L);
      else {
        if (!elLow[a]) elLow[a] = I.prep(O.buildElement(ctx, a, 120).points);
        if (!elLow[b]) elLow[b] = I.prep(O.buildElement(ctx, b, 120).points);
        k = I.mutual(elLow[a], elLow[b], ctx.c) / Math.sqrt(el[a].L * el[b].L);
      }
      kM[a * N + b] = kM[b * N + a] = k;
      // ring1: nearest ring (v1.1 rule, free mode only); footprint: footprints overlap (v1.0); adjacent: Voronoi (v1.6)
      var r1 = ctx.tableZero ? dn < o.ring1 * ctx.tableZero : false;
      pairs.push({ i: a, j: b, dOverRf: dn, k: k, ring1: r1, footprint: d < E[a].Rf + E[b].Rf, adjacent: adj.has(a + ',' + b),
        kind: r1 ? 'ring1' : dn < 3.5 ? 'next' : 'far' });
    }
    function stats(sel) {
      var v = pairs.filter(sel).map(function (p) { return Math.abs(p.k); }).sort(function (x, y) { return x - y; });
      return { count: v.length, max: v.length ? v[v.length - 1] : 0, median: v.length ? v[Math.floor(v.length / 2)] : 0,
        above: v.filter(function (x) { return x >= o.thresholdK; }).length };
    }
    var covered = 0;
    ctx.covSamples.forEach(function (s) { for (var e = 0; e < N; e++) if (Lay.dist(s, st.C[e]) <= E[e].Rf) { covered++; return; } });
    // regularity: coefficient of variation of each element's nearest-neighbour centre distance (lower = more even)
    var nn = st.C.map(function (c, i2) { var m = Infinity; for (var j = 0; j < N; j++) if (j !== i2) m = Math.min(m, Lay.dist(c, st.C[j])); return m; });
    var mean = nn.reduce(function (s, x) { return s + x; }, 0) / N;
    var sd = Math.sqrt(nn.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / N);
    var zoneIn = el.map(function (Q) { return S.zonePoints(ctx.H, Q.points, 0); });
    var zoneMargin = el.map(function (Q) { return S.zonePoints(ctx.H, Q.points, ctx.H.zoneMargin || 0); });
    var e0 = E[0];
    var planarRep = K.report({ p: ctx.kp.p, q: ctx.kp.q, beta: e0.beta, size: e0.Rf, bloomMode: 'extent', bloomShape: ctx.kp.shape, sharpness: e0.m }, ctx.wire, 400);
    var distortion = el.map(function (Q) { return K.wireLength(Q.points) / K.wireLength(Q.flat) - 1; });
    var fp = stats(function (p) { return p.footprint; }), r1s = stats(function (p) { return p.ring1; }), ad = stats(function (p) { return p.adjacent; });
    var Rmean = E.reduce(function (s, x) { return s + x.Rf; }, 0) / N;
    return {
      N: N, knot: ctx.kp, mode: ctx.mode, Rf: Rmean, coreRadius: Rmean / (1 + e0.beta), centres: st.C.map(function (p) { return p.slice(); }),
      theta: E.map(function (x) { return x.theta; }),
      elements: E.map(function (x) { return { Rf: x.Rf, beta: x.beta, m: x.m, theta: x.theta, mirror: x.mirror, ring: x.ring, midline: !!x.midline, twin: x.twin }; }),
      kMatrix: kM, pairs: pairs, target: ctx.mode === 'ring' ? 'adjacent' : o.target,
      footprint: fp, ring1: r1s, adjacent: ad, next: stats(function (p) { return p.kind === 'next'; }), far: stats(function (p) { return p.kind === 'far'; }),
      threshold: o.thresholdK,
      decoupledFootprint: fp.count > 0 && fp.above === 0,   // v1.0 rule
      decoupledRing1: r1s.count > 0 && r1s.above === 0,     // v1.1 rule (free mode)
      decoupledAdjacent: ad.count > 0 && ad.above === 0,    // v1.6 Voronoi adjacency
      regularityCV: sd / mean, nnDistances: nn,
      zoneViolations: zoneIn.reduce(function (s, x) { return s + x; }, 0), zoneViolationsMargin: zoneMargin.reduce(function (s, x) { return s + x; }, 0),
      zoneByElement: zoneIn,
      coverage: covered / ctx.covSamples.length, element: planarRep, wrapDistortion: { max: Math.max.apply(null, distortion.map(Math.abs)) },
      L: el.map(function (Q) { return Q.L; }), wires: el.map(function (Q) { return Q.points; }), normals: el.map(function (Q) { return Q.normals; }),
      flats: el.map(function (Q) { return Q.flat; }),
      rings: ctx.rings ? ctx.rings.map(function (r) { return Object.assign({}, r); }) : null,
      label: 'Geometric decoupling estimate (quasi-static filament model), EXPLORATORY. Confirm with full-wave simulation or bench S21.'
    };
  };

  function runFree(cfg, onProgress, which) {
    var ctx = O.setup(cfg), t0 = Date.now();
    O.stage1(ctx, onProgress);
    if (which !== 'fast') O.stage2(ctx, onProgress);
    var r = O.report(ctx, onProgress);
    r.config = { N: cfg.N, knot: cfg.knot, wire: cfg.wire, helmet: cfg.helmet, opts: ctx.o, stages: which === 'fast' ? ['table'] : ['table', 'exact'] };
    r.seconds = (Date.now() - t0) / 1000;
    r.h = ctx.h; r.liftFeasible = ctx.liftFeasible; r.tableZero = ctx.tableZero;
    return r;
  }

  // ---------- Ring mode (Design v1.6, WP1/WP2) ----------
  // Automatic ring allocation: K rings between the lowest covered elevation and near the top; counts proportional to
  // the ring's free circumference; a top ring of 1-2 elements becomes a single cap element at the back midline.
  function ringAzimuthFree(H, v, Rf) {
    // largest alpha (from the back, -y) such that every azimuth in [-alpha, alpha] at elevation v keeps a footprint-sized
    // margin from all zones: returns pi when the ring is unobstructed.
    for (var a = 0; a <= Math.PI + 1e-9; a += Math.PI / 180) {
      var p = S.point(H, -Math.PI / 2 + a, v);
      if (S.zoneHit(H, p, (H.zoneMargin || 0) + Rf * 0.6) >= 0) return Math.max(0, a - Math.PI / 180);
    }
    return Math.PI;
  }
  O.ringSetup = function (cfg) {
    var o = opts(cfg.opts), H = cfg.helmet, kp = cfg.knot, w = cfg.wire, c = clearanceOf(w), N = cfg.N;
    var samples = S.samples(H, o.nSamples), area = S.coveredArea(H);
    var spacing = Math.sqrt(2 * area / (Math.sqrt(3) * N));
    var scan = O.pairScan(kp, 40, w, 0, 0, { nd: 30, n: 160 });                 // flat pair-null spacing estimate
    var zn = scan.zeros.length ? scan.zeros[scan.zeros.length - 1].dOverRf : 1.2;
    var Rf0 = spacing / zn;
    var vLow = Math.asin(Math.max(-1, Math.min(1, H.zCut / H.c))), vTop = 1.3;   // JUDG: radians. Lowest ring centre may sit at the covered edge (was +0.12 rad; that pinned the bottom ring and cost coverage, dev fix 2026-10-20)
    var counts = o.ringCounts && o.ringCounts.length ? o.ringCounts.slice() : null, Kr;
    if (!counts) {
      Kr = Math.max(1, Math.round(Math.sqrt(N / 2.5)));                         // JUDG: ring count heuristic
      var vs = [], wts = [];
      for (var k = 0; k < Kr; k++) {
        var v = Kr === 1 ? (vLow + vTop) / 2 : vTop - k * (vTop - vLow) / (Kr - 1);
        vs.push(v); wts.push(Math.cos(v) * ringAzimuthFree(H, v, Rf0) / Math.PI + 1e-3);
      }
      var W = wts.reduce(function (s, x) { return s + x; }, 0), raw = wts.map(function (x) { return x / W * N; });
      counts = raw.map(Math.floor); var rem = N - counts.reduce(function (s, x) { return s + x; }, 0);
      raw.map(function (x, i) { return [x - Math.floor(x), i]; }).sort(function (x, y) { return y[0] - x[0]; }).slice(0, rem).forEach(function (t) { counts[t[1]]++; });
      counts = counts.map(function (n) { return Math.max(1, n); });
    }
    Kr = counts.length;
    var rings = counts.map(function (n, k) {
      var v = Kr === 1 ? (vLow + vTop) / 2 : (n === 1 && k === 0 ? 1.45 : vTop - k * (vTop - vLow) / (Kr - 1));
      var aFree = ringAzimuthFree(H, v, Rf0), span = aFree >= Math.PI ? 2 * Math.PI : 2 * aFree;
      var s = n > 1 ? span / (aFree >= Math.PI ? n : Math.max(1, n - 1)) : 0;
      var rho = 0.5 * (H.a + H.b) * Math.cos(v);
      return { n: n, v: v, s: s, th: o.theta0, Rf: Math.max(5, Math.min(Rf0, n > 1 ? s * rho / zn : Rf0)), beta: kp.beta, m: kp.sharpness || 1 };
    });
    var ctx = { cfg: cfg, o: o, H: H, kp: kp, wire: w, c: c, a: w.d / 2, samples: samples, area: area, spacing: spacing,
      tableZero: null, pairNullEstimate: zn, mode: 'ring', rings: rings, vLow: vLow, liftCache: {}, liftFeasible: true,
      covSamples: covFilter(H, samples, o.covBuffer * Rf0) };
    if (o.startIndex > 0) {                                                     // other starts: perturb ring parameters
      var rnd = Lay.rng(o.seed * 7919 + 13);
      rings.forEach(function (r) { r.th += (rnd() - 0.5) * 2 * Math.PI / kp.q; r.v = Math.max(vLow, Math.min(1.5, r.v + (rnd() - 0.5) * 0.1)); });
    }
    ringLayout(ctx);
    return ctx;
  };
  function liftFor(ctx, Rf, beta, m) {
    var key = Rf.toFixed(2) + '|' + beta.toFixed(3) + '|' + m.toFixed(2);
    if (!(key in ctx.liftCache)) {
      var L = K.solveLift({ p: ctx.kp.p, q: ctx.kp.q, beta: beta, size: Rf, bloomMode: 'extent', bloomShape: ctx.kp.shape, sharpness: m }, ctx.c, 200);
      ctx.liftCache[key] = L.h; if (!L.feasible) ctx.liftFeasible = false;
    }
    return ctx.liftCache[key];
  }
  // Elements from ring parameters. Azimuth alpha is measured from the back (-y) towards +x; element j of ring k sits at
  // alpha = (j - (n-1)/2) * s, so positions are symmetric about the mid-sagittal plane. Twins at -alpha use the mirror-image
  // knot; midline elements (alpha = 0) get the nearest mirror-compatible rotation, a multiple of pi/q.
  function ringLayout(ctx) {
    var H = ctx.H, q = ctx.kp.q, list = [];
    ctx.rings.forEach(function (r, k) {
      var h = liftFor(ctx, r.Rf, r.beta, r.m);
      for (var j = 0; j < r.n; j++) {
        var al = (j - (r.n - 1) / 2) * r.s, mid = Math.abs(al) < 1e-12;
        var th = mid ? Math.round(r.th / (Math.PI / q)) * (Math.PI / q) : r.th;
        list.push({ ring: k, j: j, Rf: r.Rf, beta: r.beta, m: r.m, theta: th, mirror: al < 0 && !mid, midline: mid, h: h,
          twin: mid ? null : list.length + (r.n - 1 - 2 * j), centre: S.point(H, -Math.PI / 2 + al, r.v) });
      }
    });
    ctx.ringElems = list;
    ctx.state = { C: list.map(function (e) { return e.centre; }), Rf: list.reduce(function (s, e) { return s + e.Rf; }, 0) / list.length };
    ctx.elemFn = function (i) { return ctx.ringElems[i]; };
  }

  O.ringOptimise = function (ctx, onProgress) {
    var o = ctx.o, q = ctx.kp.q, n = o.ringN, lamMax = o.lambdaMax, thr2 = o.thresholdK * o.thresholdK;
    var vars = [];
    ctx.rings.forEach(function (r, k) {
      vars.push({ k: k, key: 'v', step: 0.05, lo: ctx.vLow, hi: 1.5 });
      if (r.n > 1) vars.push({ k: k, key: 's', step: 0.05 * r.s, lo: 0.05, hi: 2 * Math.PI / r.n });
      vars.push({ k: k, key: 'th', step: Math.PI / (6 * q), lo: -Infinity, hi: Infinity });
      if (o.ringSize === 'ring') vars.push({ k: k, key: 'Rf', step: 0.06 * r.Rf, lo: 5, hi: 150 });
      if (o.ringBloom === 'ring') vars.push({ k: k, key: 'beta', step: 0.1, lo: 0.05, hi: 3 });
      if (o.ringSharp === 'ring') vars.push({ k: k, key: 'm', step: 0.5, lo: 1, hi: 8 });
    });
    var wireCache = {}, pairCache = {};
    function sig(e) { return [e.ring, e.j, e.Rf.toFixed(4), e.beta.toFixed(4), e.m.toFixed(3), e.theta.toFixed(5), e.centre.map(function (x) { return x.toFixed(4); }).join(',')].join('|'); }
    function wireOf(e) {
      var key = sig(e);
      if (!wireCache[key]) {
        var W = S.wrap(ctx.H, O.elemFlat(ctx, e, n), e.centre);
        wireCache[key] = { prep: I.prep(W.points), L: I.selfL(W.points, ctx.a, W.normals), points: W.points, key: key };
      }
      return wireCache[key];
    }
    function cost() {
      ringLayout(ctx);
      var C = ctx.state.C, E = ctx.ringElems, Nn = C.length, adj = O.adjacency(ctx.samples, C, adjTol(ctx)), c = 0;
      var Wd = E.map(wireOf);
      adj.forEach(function (pk) {
        var ij = pk.split(','), a = +ij[0], b = +ij[1], key = Wd[a].key + '#' + Wd[b].key;
        if (!(key in pairCache)) pairCache[key] = I.mutual(Wd[a].prep, Wd[b].prep, ctx.c) / Math.sqrt(Wd[a].L * Wd[b].L);
        var k = pairCache[key], k2 = k * k; c += k2 + lamMax * k2 * k2 / thr2;
      });
      ctx.covSamples.forEach(function (s) {
        var m = Infinity, Rf = 1;
        for (var e = 0; e < Nn; e++) { var d = Lay.dist(s, C[e]) / E[e].Rf; if (d < m) m = d; }
        var g = m - 1; if (g > 0) c += o.lambdaCov * g * g;
      });
      if (ctx.H.zones && ctx.H.zones.length) Wd.forEach(function (Wq) { c += o.lambdaZone * S.zonePoints(ctx.H, Wq.points, ctx.H.zoneMargin) * 97 / Wq.points.length; });
      return c;
    }
    var best = cost(), history = [best];
    for (var sw = 0; sw < o.ringSweeps; sw++) {
      var improved = false;
      vars.forEach(function (V) {
        var r = ctx.rings[V.k], x0 = r[V.key], bx = x0;
        [1, -1].forEach(function (dir) {
          var x = Math.max(V.lo, Math.min(V.hi, x0 + dir * V.step)); if (x === x0) return;
          r[V.key] = x; var cst = cost();
          if (cst < best - 1e-15) { best = cst; bx = x; improved = true; }
          r[V.key] = x0;
        });
        r[V.key] = bx;
      });
      if (!improved) { vars.forEach(function (V) { V.step *= 0.6; }); if (vars.every(function (V) { return V.key !== 'v' || V.step < 0.002; })) break; }
      ringLayout(ctx); history.push(best);
      if (Object.keys(wireCache).length > 4000) { wireCache = {}; pairCache = {}; }   // bound memory
      if (onProgress) onProgress({ stage: 'rings', sweep: sw + 1, of: o.ringSweeps, cost: best, Rf: ctx.state.Rf });
    }
    ringLayout(ctx);
    return history;
  };

  function runRing(cfg, onProgress) {
    var t0 = Date.now(), ctx = O.ringSetup(cfg);
    O.ringOptimise(ctx, onProgress);
    var r = O.report(ctx, onProgress);
    r.config = { N: ctx.ringElems.length, knot: cfg.knot, wire: cfg.wire, helmet: cfg.helmet, opts: ctx.o, stages: ['rings'] };
    r.seconds = (Date.now() - t0) / 1000; r.liftFeasible = ctx.liftFeasible; r.tableZero = null; r.pairNullEstimate = ctx.pairNullEstimate;
    r.h = ctx.ringElems[0].h;
    return r;
  }

  // Public entry: multi-start (WP3) over free or ring layout. Best = lowest worst-adjacent |k| in the exact report.
  O.run = function (cfg, onProgress, which) {
    var o = opts(cfg.opts), K_ = Math.max(1, o.starts | 0), best = null, all = [];
    for (var s = 0; s < K_; s++) {
      var c2 = Object.assign({}, cfg, { opts: Object.assign({}, cfg.opts, { seed: o.seed + s, startIndex: s }) });
      var prog = onProgress ? function (p) { p.start = s + 1; p.starts = K_; onProgress(p); } : null;
      var r = o.layout === 'ring' ? runRing(c2, prog) : runFree(c2, prog, which);
      all.push({ seed: o.seed + s, worstAdjacent: r.adjacent.max, worstTarget: (o.layout === 'ring' ? r.adjacent : r.ring1).max, regularityCV: r.regularityCV, coverage: r.coverage });
      if (!best || r.adjacent.max < best.adjacent.max) best = r;
    }
    best.multistart = { starts: K_, chosenSeed: best.config.opts.seed, results: all };
    return best;
  };
});
