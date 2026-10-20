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
    seed: 1             // JUDG: random seed for move order; stored in exports so runs are reproducible.
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
      var base = { p: kp.p, q: kp.q, beta: kp.beta, size: 1, bloomMode: 'extent', h: hN, theta: th };
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
    return K.points({ p: kp.p, q: kp.q, beta: kp.beta, size: Rf, bloomMode: 'extent', theta: theta, h: h }, n);
  };

  // ---------- Pair analysis (Design.md §5.3): k vs centre distance for two flat elements ----------
  O.pairScan = function (kp, Rf, wire, a1, a2, o) {
    o = Object.assign({ dMin: 0.5 * Rf, dMax: 2.6 * Rf, nd: 60, n: 300 }, o || {});
    var c = clearanceOf(wire), lift = K.solveLift({ p: kp.p, q: kp.q, beta: kp.beta, size: Rf, bloomMode: 'extent' }, c, 200);
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
    var lift = K.solveLift({ p: kp.p, q: kp.q, beta: kp.beta, size: Rf0, bloomMode: 'extent' }, c, 200);
    var T = O.buildTable(kp, lift.h / Rf0, c / Rf0, o);
    var zn = O.tableZero(T) || 1.5;
    var ctx = { cfg: cfg, o: o, H: H, kp: kp, wire: w, c: c, a: w.d / 2, h: lift.h, liftFeasible: lift.feasible,
      samples: samples, area: area, spacing: spacing, T: T, tableZero: zn, Lcache: {} };
    ctx.state = { C: Lay.initialCentres(H, cfg.N, samples), th: new Float64Array(cfg.N).fill(o.theta0), Rf: spacing / zn };
    return ctx;
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
      sc = ctx.samples.map(function (s, si) {
        var l = []; for (var e = 0; e < N; e++) if (Lay.dist(s, st.C[e]) < 2.5 * R) { l.push(e); es[e].push(si); } return l;
      });
    }
    function gap(si) {
      var s = ctx.samples[si], l = sc[si], m = Infinity;
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
      return c;
    }
    function total() {
      var c = 0;
      for (var i = 0; i < N; i++) for (var q = 0; q < cand[i].length; q++) if (cand[i][q] > i) c += pairCost(i, cand[i][q]);
      for (var si = 0; si < ctx.samples.length; si++) c += o.lambdaCov * gap(si);
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
        var e = order[oi], base = local(e), best = null, bestC = base;
        var c0 = st.C[e], f0 = frames[e], th0 = st.th[e];
        var moves = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (var mi = 0; mi < moves.length; mi++) {
          var mv = moves[mi], dp = pos * st.Rf;
          if (mv[2] !== 0 && o.rotation !== 'free') continue;   // shared/fixed rotation: no per-element turns
          var np = S.snap(ctx.H, [c0[0] + dp * (mv[0] * f0.e1[0] + mv[1] * f0.e2[0]), c0[1] + dp * (mv[0] * f0.e1[1] + mv[1] * f0.e2[1]),
            c0[2] + dp * (mv[0] * f0.e1[2] + mv[1] * f0.e2[2])]);
          if (!S.inCoverage(ctx.H, np)) continue;
          st.C[e] = np; frames[e] = S.frame(ctx.H, np); st.th[e] = th0 + mv[2] * rot;
          model.update(e, frames);
          var cst = local(e);
          if (cst < bestC - 1e-15) { bestC = cst; best = { C: np, F: frames[e], th: st.th[e] }; }
          st.C[e] = c0; frames[e] = f0; st.th[e] = th0;
        }
        if (best) { st.C[e] = best.C; frames[e] = best.F; st.th[e] = best.th; accepted++; }
        model.update(e, frames);
      }
      // shared size: try a little bigger / smaller
      var F0 = total(), R0 = st.Rf, bestR = R0, bestF = F0;
      [1 + rs, 1 - rs].forEach(function (f) {
        st.Rf = R0 * f; model.resize(frames); var F = total();
        if (F < bestF) { bestF = F; bestR = st.Rf; }
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
      resize: function () { L = O.Lflat(ctx, st.Rf); }
    };
    return search(ctx, model, ctx.o.sweeps1, { pos: 0.15, rot: Math.PI / (3 * ctx.kp.q), R: 0.05 }, onProgress, 'table');
  };

  // Wrap element i onto the helmet at its current centre/rotation/size.
  O.buildElement = function (ctx, i, n) {
    var st = ctx.state, F = S.frame(ctx.H, st.C[i]);
    var W = S.wrap(ctx.H, O.elementPoints(ctx.kp, st.Rf, st.th[i], ctx.h, n), st.C[i]);
    return { points: W.points, normals: W.normals, prep: I.prep(W.points), L: I.selfL(W.points, ctx.a, W.normals), frame: F };
  };

  // Stage 2: exact Neumann on the wrapped wires.
  O.stage2 = function (ctx, onProgress) {
    var st = ctx.state, N = st.C.length, n = ctx.o.nExact, el = [];
    for (var i = 0; i < N; i++) el.push(O.buildElement(ctx, i, n));
    var model = {
      range: ctx.o.wTaper,
      k: function (i, j) { return I.mutual(el[i].prep, el[j].prep, ctx.c) / Math.sqrt(el[i].L * el[j].L); },
      update: function (e) { el[e] = O.buildElement(ctx, e, n); },
      resize: function () { for (var q = 0; q < N; q++) el[q] = O.buildElement(ctx, q, n); }
    };
    return search(ctx, model, ctx.o.sweeps2, { pos: 0.04, rot: Math.PI / (12 * ctx.kp.q), R: 0.02 }, onProgress, 'exact');
  };

  // ---------- Final, honest report (Design.md §5.3, §8) ----------
  O.report = function (ctx, onProgress) {
    var st = ctx.state, N = st.C.length, o = ctx.o, el = [], elLow = [];
    for (var i = 0; i < N; i++) {
      el.push(O.buildElement(ctx, i, o.nFinal));
      if (onProgress) onProgress({ stage: 'report', sweep: i + 1, of: N });
    }
    var kM = new Float64Array(N * N), pairs = [];
    for (var a = 0; a < N; a++) for (var b = a + 1; b < N; b++) {
      var dn = Lay.dist(st.C[a], st.C[b]) / st.Rf, k;
      if (dn < 3.5) k = I.mutual(el[a].prep, el[b].prep, ctx.c) / Math.sqrt(el[a].L * el[b].L);
      else {
        if (!elLow[a]) elLow[a] = I.prep(O.buildElement(ctx, a, 120).points);
        if (!elLow[b]) elLow[b] = I.prep(O.buildElement(ctx, b, 120).points);
        k = I.mutual(elLow[a], elLow[b], ctx.c) / Math.sqrt(el[a].L * el[b].L);
      }
      kM[a * N + b] = kM[b * N + a] = k;
      // ring1: nearest ring; footprint: footprints overlap (frozen definition); next: within 3.5 Rf but not ring1; far: rest
      pairs.push({ i: a, j: b, dOverRf: dn, k: k, ring1: dn < o.ring1 * ctx.tableZero, footprint: dn < o.wNear,
        kind: dn < o.ring1 * ctx.tableZero ? 'ring1' : dn < 3.5 ? 'next' : 'far' });
    }
    function stats(sel) {
      var v = pairs.filter(sel).map(function (p) { return Math.abs(p.k); }).sort(function (x, y) { return x - y; });
      return { count: v.length, max: v.length ? v[v.length - 1] : 0, median: v.length ? v[Math.floor(v.length / 2)] : 0,
        above: v.filter(function (x) { return x >= o.thresholdK; }).length };
    }
    var covered = 0;
    ctx.samples.forEach(function (s) { for (var e = 0; e < N; e++) if (Lay.dist(s, st.C[e]) <= st.Rf) { covered++; return; } });
    var planarRep = K.report({ p: ctx.kp.p, q: ctx.kp.q, beta: ctx.kp.beta, size: st.Rf, bloomMode: 'extent' }, ctx.wire, 400);
    var distortion = el.map(function (E) { return K.wireLength(E.points) / K.wireLength(O.elementPoints(ctx.kp, st.Rf, 0, ctx.h, o.nFinal)) - 1; });
    var fp = stats(function (p) { return p.footprint; }), r1 = stats(function (p) { return p.ring1; });
    return {
      N: N, knot: ctx.kp, Rf: st.Rf, coreRadius: st.Rf / (1 + ctx.kp.beta), centres: st.C.map(function (p) { return p.slice(); }),
      theta: Array.from(st.th), kMatrix: kM, pairs: pairs, target: o.target,
      footprint: fp, ring1: r1, next: stats(function (p) { return p.kind === 'next'; }), far: stats(function (p) { return p.kind === 'far'; }),
      threshold: o.thresholdK,
      decoupledFootprint: fp.count > 0 && fp.above === 0,   // verdict under the frozen Design.md definition
      decoupledRing1: r1.count > 0 && r1.above === 0,       // verdict for the nearest ring only
      coverage: covered / ctx.samples.length, element: planarRep, wrapDistortion: { max: Math.max.apply(null, distortion.map(Math.abs)) },
      L: el.map(function (E) { return E.L; }), wires: el.map(function (E) { return E.points; }), normals: el.map(function (E) { return E.normals; }),
      label: 'Geometric decoupling estimate (quasi-static filament model), EXPLORATORY. Confirm with full-wave simulation or bench S21.'
    };
  };

  O.run = function (cfg, onProgress, which) {
    var ctx = O.setup(cfg), t0 = Date.now();
    O.stage1(ctx, onProgress);
    if (which !== 'fast') O.stage2(ctx, onProgress);
    var r = O.report(ctx, onProgress);
    r.config = { N: cfg.N, knot: cfg.knot, wire: cfg.wire, helmet: cfg.helmet, opts: ctx.o, stages: which === 'fast' ? ['table'] : ['table', 'exact'] };
    r.seconds = (Date.now() - t0) / 1000;
    r.h = ctx.h; r.liftFeasible = ctx.liftFeasible; r.tableZero = ctx.tableZero;
    return r;
  };
});
