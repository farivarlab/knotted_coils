# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
"""COMSOL full-wave check of designs from the app (Design v1.11, 2026-10-23, pending owner approval). EXPLORATORY.

WHAT IT DOES (plain language):
  Takes a case file from the app (sim/cases/*.json format: each coil's wire path in mm, its capacitor gaps, the field
  strength and the head phantom) and rebuilds it in COMSOL in a systematic way, then solves it and writes the results
  back in a form the app can show next to its own quasi-static estimates.
    * Each coil is a perfect-conductor tube of the real wire radius, drawn with Parametric Surfaces around its centreline
      (the method of Will's coils8_import.py, checked in COMSOL 6.4). The centreline passes through every case point:
      cubic-spline interpolation functions of the arc-length parameter s1, not Will's Fourier series, which cannot
      follow sharp crossover bumps. Each capacitor gap is a short band of the tube (gap_len along the wire).
    * Head: the app's three-layer ellipsoid phantom (skin, skull, brain; core/phantom.js), cut at the neck. Air sphere
      plus a spherical PML.
    * Stage 1 (every case): a 50-ohm lumped port in EVERY gap, one solve per port -> the full port S-matrix at f0, plus
      the magnetic field on the requested planes for every port run. Because every gap is a port, putting capacitors in
      the gaps afterwards is exact circuit algebra (no re-solve): the tuning capacitor Ct (same in every non-feed gap of
      a coil) and a shunt match capacitor Cp across the feed are chosen so each coil is tuned and matched to 50 ohm,
      and the field of a tuned coil is the matching superposition of the port-run fields.
    * Arrays (3+ coils, mode 'b1', the default for arrays): only each coil's feed gap, as a port; no capacitors, no
      tuning or matching. One solve per coil; each coil's B1 map per ampere of its port current, the others resting on
      50 ohm. Without capacitors the long wire carries a standing wave, so single-coil maps differ from the app's
      uniform-current map more than the whole-array map does. (Mode 'ports' keeps the stage-1 route above for arrays: every gap a port, capacitors by circuit.)
    * Stage 2 (one or two coils, mode 'match'): the capacitors go INTO the model as lumped elements (Ct in the
      non-feed gaps; Cp on one half of the feed band, the port on the other half, as in head_2coil_sphere_optimized.py's
      shunt-in-model layout), and are refined with COMSOL in the loop until every coil is matched (S11 <= tol). The
      final S-parameters and B1 maps come straight from COMSOL; the saved .mph opens tuned and matched in the GUI.
  Outputs (DIR = --out, default sim/out/<case>_comsol): results.json (read by the app), stage1.npz (port S-matrix and
  port-run fields), model.mph (solution data cleared to keep it small), run.log via the caller.

METHOD NOTES (DERIVED unless marked):
  S from lumped-port voltages and currents of every run (a = (V + Z0 I)/2, b = (V - Z0 I)/2, S = B A^-1; the sign of I
  is checked against COMSOL's own S11 on the first run). Z = Z0 (1 + S)(1 - S)^-1.
  Matching (shunt Cp across the feed, series Ct in the gaps): the loop seen at the feed, Z = R + jX, is matched when
  X = sqrt(R (Z0 - R)) and w Cp = X / (R^2 + X^2) (as in head_2coil_sphere_optimized.py tune_match).
  Coupling comparable with the app's k: all non-feed gaps shorted, k_ij = Im Z_ij / sqrt(Im Z_ii Im Z_jj) at f0.
  B1-: (Bx - i By)/2 per ampere of feed current (B0 along +z, as in sim/cosim.py and Will's add_b1).
  Units: geometry mm, fields uT/A.

USAGE (needs MPh and a licensed COMSOL with the RF Module; the comsolai venv on this machine):
  python sim/comsol_run.py sim/cases/<case>.json [--mode auto|ports|match] [--out DIR] [--cores N] [--build-only]
  python sim/comsol_run.py --job DIR      # every DIR/case_*.json in turn; DIR/status.json for the app (tools/serve.js)

PARAMETERS (also PARAMETERS.md): see CFG below; Z0 50 ohm CONV.
VALIDATED BY: nothing yet. Design v1.11 is exploratory by the requester's choice (no pass/fail criteria).
"""
import argparse
import glob
import json
import math
import os
import sys
import time
import traceback

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Z0 = 50.0                       # CONV: reference impedance, ohm
CFG = dict(
    gap_len=2.0,                # JUDG: capacitor gap length along the wire, mm (same as sim/run_openems.py GAP)
    seg_len=20.0,               # JUDG: longest tube patch along the wire, mm (COMSOL fits each patch with NURBS)
    maxknots=40,                # JUDG: NURBS knots per patch direction (COMSOL default 20)
    air_margin=60.0,            # JUDG: air sphere radius beyond the furthest coil/head point, mm (Will: 60)
    d_pml=80.0,                 # JUDG: PML thickness, mm (Will: 80)
    mesh_level=5,               # JUDG: physics-controlled mesh, 5 = Normal, 4 = Fine (Will used 4)
    cores=16,                   # JUDG: COMSOL cores
    tol_dB=-30.0,               # JUDG: matched when every |S11| <= -30 dB (sep study criterion in the handover)
    maxit=10,                   # JUDG: stage-2 COMSOL-in-the-loop iterations
    damping=0.7,                # JUDG: log-space step for Ct updates (handover value)
    cp_range=(0.5e-12, 2e-9),   # JUDG: shunt capacitor search range, F (handover value)
    grid=60,                    # JUDG: B1 map points per side on each plane
    eps_ins=3.0,                # JUDG PLACEHOLDER: wire insulation relative permittivity (enamel ~3; real wire spec D5 pending)
    t_ins=0.25,                 # JUDG PLACEHOLDER: insulation thickness, mm, when the case does not give it (app default)
    cross_thr=3.0,              # JUDG: wires closer than this (centre to centre, mm) are a crossing that gets a bead
    bead_pads=(0.6, 2.0, 3.0),  # JUDG: bead radius beyond the wire surface, mm, tried in turn until the mesh builds
                                #   (2026-10-23 on the trefoil: 0.6, 2 and 3 mesh at every level, 1.0 does not)
    insulation=True,            # collaborator request 2026-10-23: "put some insulation in those areas (the crossings)"
)


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------------------
# case geometry: wire tubes and gap positions
# ---------------------------------------------------------------------------

def coil_geometry(el, c):
    """One coil's tube for COMSOL, tabulated for interpolation functions.
    The centreline and a cross-section frame (n1 ~ the helmet normal, n2 = t x n1) are tabulated against
    s = arc length / wire length; COMSOL draws the tube through every case point with cubic-spline interpolation
    functions. (A global Fourier series, as in coils8_import.py, could not follow the sharp crossover bumps of array
    wires sampled at 300 points: it missed the wire by up to 9.8 mm, 2026-10-23.) The parameter origin is moved to the
    start of the first gap band, so every tube patch lies inside s in [0, 1] and nothing wraps."""
    P = np.asarray(el['wire'], float)
    n = len(P)
    seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    L = float(seg.sum())
    arc = np.concatenate([[0.0], np.cumsum(seg)[:-1]]) / L
    t = np.roll(P, -1, 0) - np.roll(P, 1, 0)
    t /= np.linalg.norm(t, axis=1)[:, None]
    if el.get('normals'):
        nrm = np.asarray(el['normals'], float)          # helmet normals: tube frame follows the former
    else:                                               # coil in air without normals: best-fit plane normal
        nrm = np.tile(np.linalg.svd(P - P.mean(0))[2][2], (n, 1))
    n1 = nrm - (nrm * t).sum(1)[:, None] * t
    n1 /= np.linalg.norm(n1, axis=1)[:, None]
    n2 = np.cross(t, n1)
    g = c['gap_len'] / 2 / L                            # half gap in parameter units
    sb = [(arc[b['index']] + b['f'] * seg[b['index']] / L) % 1.0 for b in el['breaks']]
    s0 = (min(sb) - g) % 1.0
    sp = (arc - s0) % 1.0                               # rotated parameter of every point
    order = np.argsort(sp)
    S, X, A, B = sp[order], P[order], n1[order], n2[order]
    k = 4                                               # periodic padding so the spline is smooth across s = 0 / 1
    S = np.concatenate([S[-k:] - 1, S, S[:k] + 1])
    X, A, B = (np.concatenate([V[-k:], V, V[:k]]) for V in (X, A, B))
    gaps = []
    for kk, b in enumerate(el['breaks']):
        tb = np.asarray(b.get('t') or t[b['index']], float)
        gaps.append(dict(k=kk, s=(sb[kk] - s0) % 1.0, g=g, t=(tb / np.linalg.norm(tb)).tolist(),
                         p=list(b.get('p') or P[b['index']].tolist())))
    return dict(P=P, table=(S, X, A, B), gaps=gaps, length=L, max_seg=float(seg.max()))


def load_case(path, c, feed_only=None):
    """feed_only: True keeps only each coil's first gap (the feed), as a port ('b1' mode for arrays); None decides by
    coil count (arrays of 3 or more coils)."""
    case = json.load(open(path, encoding='utf-8'))
    if feed_only is None:
        feed_only = len(case['elements']) > 2
    if feed_only:
        for el in case['elements']:
            el['breaks'] = el['breaks'][:1]
    coils = [coil_geometry(el, c) for el in case['elements']]
    for i, g in enumerate(coils):
        log(f'coil {i + 1}: {len(g["P"])} pts (longest step {g["max_seg"]:.2f} mm), {g["length"]:.0f} mm, {len(g["gaps"])} gaps')
    return case, coils


def seg_dist(a0, a1, b0, b1):
    """Closest distance between segments a0-a1 and b0-b1 (arrays of shape (k, 3)), clamped construction."""
    d1, d2, r = a1 - a0, b1 - b0, a0 - b0
    a, e, f = (d1 * d1).sum(1), (d2 * d2).sum(1), (d2 * r).sum(1)
    cc, bb = (d1 * r).sum(1), (d1 * d2).sum(1)
    den = np.maximum(a * e - bb * bb, 1e-24)
    sp = np.clip((bb * f - cc * e) / den, 0, 1)
    tp = np.clip((bb * sp + f) / np.maximum(e, 1e-24), 0, 1)
    sp = np.clip((bb * tp - cc) / np.maximum(a, 1e-24), 0, 1)
    return np.linalg.norm(r + d1 * sp[:, None] - d2 * tp[:, None], axis=1)


def crossings(coils, r_wire, c):
    """Places where two strands pass closer than cross_thr: a coil's own crossings (far apart along the wire) and
    crossovers between coils. One insulation bead per place: a dielectric sphere centred between the two centrelines,
    radius = half their distance + wire radius + bead_pad, so it fills the gap between the strands and wraps both wires.
    bead_pad is a COMSOL parameter tried from CFG['bead_pads'] until the mesh builds: a bead only 0.25 mm beyond the wire
    (the real insulation) meets the tube at a grazing angle and the mesher fails (found 2026-10-23). A bead that would
    touch a capacitor gap is skipped (and reported), so every gap stays a clean port or lumped element."""
    found = []

    def collect(A, B, same, ia, ib):
        D = np.linalg.norm(A[:, None] - B[None], axis=2)
        if same:
            n = len(A)
            k = np.abs(np.arange(n)[:, None] - np.arange(n)[None])
            arc = np.minimum(k, n - k) * (np.linalg.norm(np.roll(A, -1, 0) - A, axis=1).mean())
            D = np.where((arc > 4 * c['cross_thr']) & (np.arange(n)[:, None] < np.arange(n)[None]), D, np.inf)
        na, nb = len(A), len(B)
        for a, b in zip(*np.nonzero(D < c['cross_thr'])):
            ia_, ib_ = np.array([a - 1, a - 1, a, a]) % na, np.array([b - 1, b, b - 1, b]) % nb
            dseg = seg_dist(A[ia_], A[(ia_ + 1) % na], B[ib_], B[(ib_ + 1) % nb]).min()   # true wire-to-wire distance
            found.append((min(D[a, b], dseg), (A[a] + B[b]) / 2, ia, ib))

    for i, ci in enumerate(coils):
        collect(ci['P'], ci['P'], True, i, i)
        for j in range(i + 1, len(coils)):
            collect(ci['P'], coils[j]['P'], False, i, j)
    beads = []
    for d, m, ia, ib in sorted(found, key=lambda x: x[0]):      # closest pair of each place first
        if any(np.linalg.norm(m - b['centre']) < 4.0 for b in beads):
            continue
        rad = d / 2 + r_wire + max(c['bead_pads'])      # largest radius tried: used for the gap-clearance check
        near_gap = min(np.linalg.norm(m - np.asarray(g['p'])) for cg in coils for g in cg['gaps'])
        beads.append(dict(centre=m, radius=float(rad), core=float(d / 2 + r_wire), dist=float(d), coils=[ia + 1, ib + 1],
                          kind='own crossing' if ia == ib else 'crossover', skipped=bool(near_gap < rad + c['gap_len'] + 1)))
    # Beads that would overlap, or leave a sliver of air between them, defeat the mesher (a pair case failed this way,
    # 2026-10-23): merge them into one bead covering both places. 'probe' stays a point between the original strands,
    # outside both tubes, for selecting the bead's domain.
    pad0 = max(c['bead_pads'])       # the largest bead size the mesh retry may use
    while True:
        live = [b for b in beads if not b['skipped']]
        pair = next(((A, B) for x, A in enumerate(live) for B in live[x + 1:]
                     if np.linalg.norm(A['centre'] - B['centre']) < A['core'] + B['core'] + 2 * pad0 + 1.5), None)
        if not pair:
            break
        A, B = pair
        dd = float(np.linalg.norm(A['centre'] - B['centre']))
        core = dd / 2 + max(A['core'], B['core'])
        A.update(probe=A.get('probe', A['centre']), centre=(A['centre'] + B['centre']) / 2, core=float(core),
                 radius=float(core + max(c['bead_pads'])), coils=sorted(set(A['coils'] + B['coils'])), kind='merged',
                 dist=min(A['dist'], B['dist']))
        beads = [b for b in beads if b is not B]
        near_gap = min(np.linalg.norm(A['centre'] - np.asarray(g['p'])) for cg in coils for g in cg['gaps'])
        A['skipped'] = bool(near_gap < A['radius'] + c['gap_len'] + 1)
    for b in beads:
        log(f'  bead at {np.round(b["centre"], 1)}: coils {b["coils"]} ({b["kind"]}), strands {b["dist"]:.2f} mm apart,'
            f' bead radius {b["core"]:.2f} mm + pad' + ('  SKIPPED: too close to a capacitor gap' if b['skipped'] else ''))
    return beads


def plane_points(H, plane, offset, n):
    """Same grid as the app's KC.field.slicePoints (head = helmet - 10 mm), returns kept points and their grid index."""
    E = [H['a'] - 10, H['b'] - 10, H['c'] - 10]
    ext = max(E) * 1.05
    pts, idx = [], []
    for jj in range(n):
        for ii in range(n):
            u, v = -ext + 2 * ext * (ii + 0.5) / n, ext - 2 * ext * (jj + 0.5) / n
            p = [u, v, offset] if plane == 'axial' else [u, offset, v] if plane == 'coronal' else [offset, u, v]
            if (p[0] / E[0]) ** 2 + (p[1] / E[1]) ** 2 + (p[2] / E[2]) ** 2 <= 1 and p[2] >= H['zCut'] - 40:
                pts.append(p)
                idx.append(jj * n + ii)
    return np.array(pts, float), idx, ext


# ---------------------------------------------------------------------------
# COMSOL model
# ---------------------------------------------------------------------------

class Model:
    """A live COMSOL model of one case. Stage-1 layout (port in every gap) is built first; set_layout('match')
    swaps the gap features to capacitors + split feed without touching geometry or mesh."""

    def __init__(self, case, coils, c, client, beads=()):
        from jpype import JArray, JInt, JString, JDouble
        self.JArray, self.JInt, self.JString, self.JDouble = JArray, JInt, JString, JDouble
        self.case, self.coils, self.c, self.client = case, coils, c, client
        self.beads = [b for b in beads if not b['skipped']]
        self.f0 = float(case['f0_Hz'])
        self.w = 2 * math.pi * self.f0
        self.r_wire = float(case['wire_radius_mm'])
        self.ports = [(i, g['k']) for i, cg in enumerate(coils) for g in cg['gaps']]   # (coil, gap); gap 0 = feed
        self.feeds = [self.ports.index((i, 0)) for i in range(len(coils))]
        t0 = time.time()
        self.model = client.create(case.get('name', 'case'))
        self.j = self.model.java
        self._build()
        log(f'model built and meshed in {time.time() - t0:.0f} s')

    def s(self, x):
        return f'{float(x):.9g}'

    def strs(self, v):
        return self.JArray(self.JString)([str(x) for x in v])

    # ---- geometry ----
    def _build(self):
        j, c, s = self.j, self.c, self.s
        j.component().create('comp1', True)
        comp = self.comp = j.component('comp1')
        comp.geom().create('geom1', 3)
        geom = self.geom = comp.geom('geom1')
        geom.lengthUnit('mm')
        prm = j.param()
        for name, expr, desc in (('f0', f'{self.f0 / 1e6:.9g}[MHz]', 'Larmor frequency'),
                                 ('r_wire', f'{s(self.r_wire)}[mm]', 'wire radius'),
                                 ('gap_len', f'{s(c["gap_len"])}[mm]', 'capacitor gap length along the wire')):
            prm.set(name, expr)
            prm.descr(name, desc)
        for i in range(len(self.coils)):            # capacitor parameters (used by the 'match' layout)
            prm.set(f'Ct_{i + 1}', '10[pF]'); prm.descr(f'Ct_{i + 1}', f'coil {i + 1} tuning capacitor (each non-feed gap)')
            prm.set(f'Cp_{i + 1}', '50[pF]'); prm.descr(f'Cp_{i + 1}', f'coil {i + 1} shunt match capacitor at the feed')

        gsel = geom.selection()
        quarters = [(f'{q}*pi/2', f'{q + 1}*pi/2') for q in range(4)]
        allp = []
        for i, cg in enumerate(self.coils):
            S_, X_, A_, B_ = cg['table']
            for nm, V in (('w', X_), ('a', A_), ('b', B_)):        # w = centreline, a/b = cross-section frame
                for d, ax in enumerate('xyz'):
                    ft = f'{nm}{i + 1}{ax}'
                    f = j.func().create(f'int_{ft}', 'Interpolation')
                    f.label(f'Coil {i + 1} ' + {'w': 'centreline', 'a': 'frame n1', 'b': 'frame n2'}[nm] + f' {ax}(s), mm')
                    f.set('funcname', ft)
                    f.set('table', self.JArray(self.JArray(self.JString))([[f'{u:.12g}', f'{v:.12g}'] for u, v in zip(S_, V[:, d])]))
                    f.set('interp', 'cubicspline')
                    f.set('extrap', 'const')
            xyz = [f'w{i + 1}{ax}(s1)+r_wire*(cos(s2)*a{i + 1}{ax}(s1)+sin(s2)*b{i + 1}{ax}(s1))' for ax in 'xyz']
            gaps = sorted(cg['gaps'], key=lambda g: g['s'])
            spans = []
            for a, b in zip(gaps, gaps[1:] + [dict(gaps[0], s=gaps[0]['s'] + 1)]):   # last span ends at s = 1
                lo, hi = a['s'] + a['g'], b['s'] - b['g']
                m = max(1, int(math.ceil(cg['length'] * (hi - lo) / c['seg_len'])))
                spans += [(lo + (hi - lo) * q / m, lo + (hi - lo) * (q + 1) / m, f'wire{i + 1}') for q in range(m)]
            for g in gaps:
                spans.append((g['s'] - g['g'], g['s'] + g['g'], f'gap{i + 1}_{g["k"]}'))
            sels = {sp[2] for sp in spans if sp[2].startswith('wire')}
            for tag in sels:
                gsel.create(f'csel_{tag}', 'CumulativeSelection')
                geom.selection(f'csel_{tag}').label(f'Coil {i + 1} wire')
            for g in gaps:
                for half in 'ab':                   # a = quarters 0-1 (port side), b = quarters 2-3 (shunt side)
                    gsel.create(f'csel_gap{i + 1}_{g["k"]}{half}', 'CumulativeSelection')
                    geom.selection(f'csel_gap{i + 1}_{g["k"]}{half}').label(
                        f'Coil {i + 1} gap {g["k"]} ({"feed" if g["k"] == 0 else "cap"}) half {half}')
            for k, (s1a, s1b, kind) in enumerate(spans):
                for q, (s2a, s2b) in enumerate(quarters):
                    ft = f'ps{i + 1}_{k}_{q}'
                    geom.create(ft, 'ParametricSurface')
                    ps = geom.feature(ft)
                    ps.label(f'Coil {i + 1} {kind} {k}.{q}')
                    ps.set('parmin1', s(s1a)); ps.set('parmax1', s(s1b))
                    ps.set('parmin2', s2a); ps.set('parmax2', s2b)
                    ps.set('coord', self.strs(xyz))
                    ps.set('maxknots', str(c['maxknots']))
                    ps.set('contributeto', f'csel_{kind}' + ('' if kind.startswith('wire') else ('a' if q < 2 else 'b')))
            allp.append(cg['P'])

        ph = self.case.get('phantom')
        pts = np.vstack(allp)
        if ph:
            a, b, cc = ph['axes']
            pts = np.vstack([pts, [[-a, -b, ph['zMin']], [a, b, cc]]])
            layers = [('skin', 0.0), ('skull', ph['skin_mm']), ('brain', ph['skin_mm'] + ph['skull_mm'])]
            big = 4 * max(a, b, cc)
            for name, inset in layers:
                geom.create(f'ell_{name}', 'Ellipsoid')
                geom.feature(f'ell_{name}').label(f'Head: {name} (outer surface)')
                geom.feature(f'ell_{name}').set('semiaxes', self.strs([s(a - inset), s(b - inset), s(cc - inset)]))
                geom.create(f'blk_{name}', 'Block')
                geom.feature(f'blk_{name}').label(f'Neck cut ({name})')
                geom.feature(f'blk_{name}').set('size', self.strs([s(big), s(big), s(big)]))
                geom.feature(f'blk_{name}').set('pos', self.strs([s(-big / 2), s(-big / 2), s(ph['zMin'] - big)]))
                geom.create(f'dif_{name}', 'Difference')
                geom.feature(f'dif_{name}').label(f'Head: {name} above the neck cut')
                geom.feature(f'dif_{name}').selection('input').set(self.strs([f'ell_{name}']))
                geom.feature(f'dif_{name}').selection('input2').set(self.strs([f'blk_{name}']))
                geom.feature(f'dif_{name}').set('selresult', 'on')       # domain selection by object (no probe points)
            self.layers = layers
        if self.beads:
            prm.set('eps_ins', s(c['eps_ins'])); prm.descr('eps_ins', 'wire insulation relative permittivity (PLACEHOLDER)')
            prm.set('bead_pad', f'{s(c["bead_pads"][0])}[mm]')
            prm.descr('bead_pad', 'insulation bead radius beyond the wire surface (set by the mesh retry)')
        for q, b in enumerate(self.beads):
            geom.create(f'bead{q + 1}', 'Sphere')
            geom.feature(f'bead{q + 1}').label(f'Insulation bead {q + 1}: coils {b["coils"]} {b["kind"]}')
            geom.feature(f'bead{q + 1}').set('r', f'{s(b["core"])}[mm]+bead_pad')
            geom.feature(f'bead{q + 1}').set('pos', self.strs([s(x) for x in b['centre']]))
            geom.feature(f'bead{q + 1}').set('selresult', 'on')
        cbox = (pts.min(0) + pts.max(0)) / 2
        R_air = np.linalg.norm(pts - cbox, axis=1).max() + c['air_margin']
        self.cbox, self.R_air = cbox, R_air
        prm.set('R_air', f'{s(R_air)}[mm]'); prm.set('d_pml', f'{s(c["d_pml"])}[mm]')
        for tag, r in (('sph_air', 'R_air'), ('sph_pml', 'R_air+d_pml')):
            geom.create(tag, 'Sphere')
            geom.feature(tag).set('r', r)
            geom.feature(tag).set('pos', self.strs([s(x) for x in cbox]))
            geom.feature(tag).set('selresult', 'on')
        geom.feature('fin').set('action', 'union')
        t0 = time.time()
        geom.run()
        log(f'geometry: {geom.getNDomains()} domains, {geom.getNBoundaries()} boundaries ({time.time() - t0:.0f} s)')
        self._selections()
        self._physics()
        self._study()          # before the mesh: the physics-controlled mesh sizes depend on the study frequency
        self._mesh()

    def _selections(self):
        comp, s, JInt = self.comp, self.s, self.JInt
        sel = comp.selection()

        def ball(tag, pos, r, dim, cond='inside'):
            sel.create(tag, 'Ball')
            n = comp.selection(tag)
            n.set('entitydim', JInt(dim))
            n.set('posx', s(pos[0])); n.set('posy', s(pos[1])); n.set('posz', s(pos[2]))
            n.set('r', r if isinstance(r, str) else s(r))
            n.set('condition', cond)

        def combine(tag, kind, dim, **kw):
            sel.create(tag, kind)
            n = comp.selection(tag)
            n.set('entitydim', JInt(dim))
            for k, v in kw.items():
                n.set(k, self.strs(v))

        wires = [f'geom1_csel_wire{i + 1}_bnd' for i in range(len(self.coils))]
        combine('sel_pec', 'Union', 2, input=wires)
        for (i, k) in self.ports:
            combine(f'sel_gap{i + 1}_{k}', 'Union', 2,
                    input=[f'geom1_csel_gap{i + 1}_{k}a_bnd', f'geom1_csel_gap{i + 1}_{k}b_bnd'])
        # Domains are selected by the geometry object that made them (selresult), not by probe balls: a Ball selection
        # needs a display mesh of every face and failed on one face of an 8-coil array (2026-10-23).
        combine('sel_air_dom', 'Union', 3, input=['geom1_sph_air_dom'])
        combine('sel_all_doms', 'Union', 3, input=['geom1_sph_air_dom', 'geom1_sph_pml_dom'])
        combine('sel_pml_dom', 'Difference', 3, add=['sel_all_doms'], subtract=['sel_air_dom'])
        ph = self.case.get('phantom')
        if ph:                                       # nested solids: each layer = its solid minus the next one in
            combine('sel_skin', 'Difference', 3, add=['geom1_dif_skin_dom'], subtract=['geom1_dif_skull_dom'])
            combine('sel_skull', 'Difference', 3, add=['geom1_dif_skull_dom'], subtract=['geom1_dif_brain_dom'])
            combine('sel_brain', 'Union', 3, input=['geom1_dif_brain_dom'])
        if self.beads:                               # (a bead's selection also holds the bits of tube interior inside it,
            combine('sel_beads', 'Union', 3,         #  which sit behind PEC and do not matter)
                    input=[f'geom1_bead{q + 1}_dom' for q in range(len(self.beads))])
        self.geom.run()
        ents = lambda t, d: list(comp.selection(t).entities(JInt(d)))
        for (i, k) in self.ports:
            for half in 'ab':
                e = ents(f'geom1_csel_gap{i + 1}_{k}{half}_bnd', 2)
                assert len(e) == 2, f'coil {i + 1} gap {k} half {half}: expected 2 faces, got {e}'
        faces = [f for (i, k) in self.ports for f in ents(f'sel_gap{i + 1}_{k}', 2)]
        assert len(faces) == len(set(faces)), 'gap selections overlap'
        assert set(faces).isdisjoint(ents('sel_pec', 2)), 'a gap face is also PEC'
        if ph:
            for name, _ in self.layers:
                assert len(ents(f'sel_{name}', 3)) == 1, f'phantom layer {name}: {ents(f"sel_{name}", 3)}'
        for q in range(len(self.beads)):
            assert ents(f'geom1_bead{q + 1}_dom', 3), f'bead {q + 1} selected no domain'
        log(f'selections: {len(self.ports)} gaps, {len(ents("sel_pec", 2))} PEC faces, {len(self.beads)} insulation beads, '
            f'air {len(ents("sel_air_dom", 3))} / PML {len(ents("sel_pml_dom", 3))} domains')

    def _physics(self):
        comp, j = self.comp, self.j
        comp.coordSystem().create('pml1', 'PML')
        comp.coordSystem('pml1').selection().named('sel_pml_dom')
        comp.coordSystem('pml1').set('ScalingType', 'Spherical')
        comp.coordSystem('pml1').set('wavelengthSourceType', 'userDefined')
        comp.coordSystem('pml1').set('typicalWavelength', 'c_const/f0')

        def material(tag, label, sel, eps, sig):
            comp.material().create(tag, 'Common')
            comp.material(tag).label(label)
            pg = comp.material(tag).propertyGroup('def')
            for k, v in (('relpermittivity', eps), ('electricconductivity', sig), ('relpermeability', '1')):
                pg.set(k, self.strs([v]))
            comp.material(tag).selection().named(sel)

        material('mat_air', 'Air', 'sel_all_doms', '1', '0')
        ph = self.case.get('phantom')
        if ph:
            for name, _ in self.layers:            # later materials override air on their domains
                t = ph['tissue'][name]
                material(f'mat_{name}', f'Head {name} ({ph["tissue"].get("source", "")[:60]})', f'sel_{name}',
                         self.s(t['epsR']), f'{self.s(t["kappa"])}[S/m]')
        if self.beads:
            material('mat_ins', 'Wire insulation at crossings (PLACEHOLDER permittivity)', 'sel_beads', 'eps_ins', '0')
        comp.physics().create('emw', 'ElectromagneticWaves', 'geom1')
        self.emw = emw = comp.physics('emw')
        emw.create('pec_coils', 'PerfectElectricConductor', 2)
        emw.feature('pec_coils').selection().named('sel_pec')
        self.layout = None
        self.set_layout('ports')

    def _gap_feature(self, ft, sel, gap, kind, half=False, cap=None, name=None):
        emw = self.emw
        emw.create(ft, 'LumpedPort' if kind == 'port' else 'LumpedElement', 2)
        f = emw.feature(ft)
        f.selection().named(sel)
        f.set('PortType', 'UserDefined')
        f.set('ahPort', self.strs([self.s(x) for x in gap['t']]))
        f.set('hPort', 'gap_len')
        f.set('wPort', 'pi*r_wire' if half else '2*pi*r_wire')
        if kind == 'port':
            f.set('PortName', str(name))
            f.set('SourceType', 'Voltage')
            f.set('PortExcitation', 'off')
        else:
            f.set('LumpedElementType', 'Capacitor')
            f.set('Celement', cap)

    def set_layout(self, mode):
        """'ports': a lumped port in every gap. 'match': capacitors Ct_i in the non-feed gaps, the feed band split into
        a port (half a) and a shunt capacitor Cp_i (half b). Geometry and mesh are unchanged."""
        if mode == self.layout:
            return
        emw = self.emw
        for t in [str(x) for x in emw.feature().tags()]:
            if t.startswith(('lp_', 'le_')):
                emw.feature().remove(t)
        gap = {(i, g['k']): g for i, cg in enumerate(self.coils) for g in cg['gaps']}
        if mode == 'ports':
            for n, (i, k) in enumerate(self.ports):
                self._gap_feature(f'lp_{i + 1}_{k}', f'sel_gap{i + 1}_{k}', gap[(i, k)], 'port', name=n + 1)
            self.port_list = list(self.ports)
        else:
            for i in range(len(self.coils)):
                self._gap_feature(f'lp_{i + 1}_0', f'geom1_csel_gap{i + 1}_0a_bnd', gap[(i, 0)], 'port', half=True, name=i + 1)
                self._gap_feature(f'le_{i + 1}_shunt', f'geom1_csel_gap{i + 1}_0b_bnd', gap[(i, 0)], 'cap', half=True,
                                  cap=f'Cp_{i + 1}')
                for g in self.coils[i]['gaps'][1:]:
                    self._gap_feature(f'le_{i + 1}_{g["k"]}', f'sel_gap{i + 1}_{g["k"]}', g, 'cap', cap=f'Ct_{i + 1}')
            self.port_list = [(i, 0) for i in range(len(self.coils))]
        self.layout = mode

    def _mesh(self):
        """Physics-controlled mesh. Where an insulation bead meets a tube the mesher can fail on thin wedges, so: for
        each bead padding in turn (geometry rebuilt), try mesh_level and one level finer; the mesh is cleared before
        every try (a failed run leaves a stale partial mesh) and accepted only if EVERY domain holds 3D elements."""
        m = self.comp.mesh().create('mesh1')
        m.automatic(True)
        t0 = time.time()
        pads = self.c['bead_pads'] if self.beads else [None]
        nd = None
        for pad in pads:
            if pad is not None and pad != pads[0]:
                self.j.param().set('bead_pad', f'{pad}[mm]')
                self.geom.run()
            nd = int(self.geom.getNDomains())
            for level in (self.c['mesh_level'], self.c['mesh_level'] - 1):
                m.clearMesh()
                m.autoMeshSize(self.JInt(level))
                try:
                    m.run()
                    meshed = set()            # every 3D element type: the PML is swept (prisms), the rest tetrahedra
                    for et in ('tet', 'pyr', 'prism', 'hex'):
                        if int(m.getNumElem(et)):
                            meshed |= set(np.array(m.getElemEntity(et)).tolist())
                    meshed = len(meshed)
                except Exception as e:
                    log(f'mesh (bead pad {pad} mm, level {level}) failed: {str(e).splitlines()[-1].strip()[:100]}')
                    continue
                if meshed == nd:
                    self.n_mesh, self.mesh_level, self.bead_pad = int(m.getNumElem()), level, pad
                    log(f'mesh: {self.n_mesh} elements at level {level}' + (f', bead pad {pad} mm' if pad is not None else '')
                        + f' ({time.time() - t0:.0f} s)')
                    return
                log(f'mesh (bead pad {pad} mm, level {level}) incomplete: {meshed} of {nd} domains meshed')
        if self.beads:          # last resort: the case runs without insulation beads, and the result says so
            log('mesh failed with insulation beads at every size: running WITHOUT beads')
            for q in range(len(self.beads)):
                self.geom.feature(f'bead{q + 1}').active(False)
            self.geom.run()
            nd = int(self.geom.getNDomains())
            for level in (self.c['mesh_level'], self.c['mesh_level'] - 1):
                m.clearMesh()
                m.autoMeshSize(self.JInt(level))
                try:
                    m.run()
                except Exception:
                    continue
                meshed = set()
                for et in ('tet', 'pyr', 'prism', 'hex'):
                    if int(m.getNumElem(et)):
                        meshed |= set(np.array(m.getElemEntity(et)).tolist())
                if len(meshed) == nd:
                    self.n_mesh, self.mesh_level, self.bead_pad, self.beads_dropped = int(m.getNumElem()), level, None, True
                    log(f'mesh: {self.n_mesh} elements at level {level}, no insulation beads ({time.time() - t0:.0f} s)')
                    return
        raise RuntimeError('no complete mesh with any bead padding / level tried')

    def _study(self):
        std = self.j.study().create('std1')
        std.feature().create('freq', 'Frequency')
        std.feature('freq').set('plist', 'f0')
        std.feature('freq').set('punit', 'MHz')
        std.createAutoSequences('all')

    # ---- solving and reading results ----
    def _eval(self, exprs):
        n = self.j.result().numerical().create('gv_kc', 'EvalGlobal')
        try:
            n.set('data', 'dset1')
            for q, e in enumerate(exprs):
                n.setIndex('expr', e, q)
            re = np.array(n.getReal(), float)
            try:
                im = np.array(n.getImag(), float)
            except Exception:
                im = np.zeros_like(re)
            v = (re + 1j * im).reshape(len(exprs), -1)[:, 0]
            return v
        finally:
            self.j.result().numerical().remove('gv_kc')

    def solve_port(self, p):
        """Excite port p (index into port_list) alone, others terminated in 50 ohm; return port V, I vectors."""
        for q, (i, k) in enumerate(self.port_list):
            self.emw.feature(f'lp_{i + 1}_{k}').set('PortExcitation', 'on' if q == p else 'off')
        t0 = time.time()
        self.j.sol('sol1').runAll()
        n = len(self.port_list)
        v = self._eval([f'emw.Vport_{q + 1}' for q in range(n)] + [f'emw.Iport_{q + 1}' for q in range(n)])
        return v[:n], v[n:], time.time() - t0

    def check_S(self, V, p):
        """COMSOL's lumped-port convention, found on the first run (2026-10-23): the driven port carries a 1 V incident
        wave and the others none, so S_kp = V_k - delta_kp. Checked against COMSOL's own emw.S_pp on every case
        (deriving S from V and I instead disagreed by ~1e-3: the port current is a surface integral)."""
        s_comsol = self._eval([f'emw.S{p + 1}{p + 1}'])[0]
        if abs((V[p] - 1) - s_comsol) > 1e-6 * max(1, abs(s_comsol)):
            raise RuntimeError(f'S_pp = V_p - 1 = {V[p] - 1} does not match COMSOL S{p + 1}{p + 1} = {s_comsol}')
        return s_comsol

    def fields(self, pts):
        """Complex Bx, By, Bz (T) at points (k, 3) in mm, current solution."""
        res = self.j.result()
        if 'cpt_kc' not in [str(t) for t in res.dataset().tags()]:
            res.dataset().create('cpt_kc', 'CutPoint3D')
            for ax, col in zip('xyz', pts.T):
                res.dataset('cpt_kc').set(f'point{ax}', ' '.join(f'{x:.6g}' for x in col))
        n = self.j.result().numerical().create('pv_kc', 'EvalPoint')
        try:
            n.set('data', 'cpt_kc')
            for q, e in enumerate(('emw.Bx', 'emw.By', 'emw.Bz')):
                n.setIndex('expr', e, q)
                n.setIndex('unit', 'T', q)
            re = np.array(n.getReal(), float)
            im = np.array(n.getImag(), float)
            return (re + 1j * im).reshape(3, -1).T
        finally:
            self.j.result().numerical().remove('pv_kc')

    def save(self, path):
        for t in self.j.sol().tags():
            self.j.sol(t).clearSolutionData()
        self.model.save(path)
        log(f'saved {path} (solution data cleared; Study 1 -> Compute re-solves it)')


# ---------------------------------------------------------------------------
# circuit algebra on the port matrix (numpy only: the comsolai venv has no scipy)
# ---------------------------------------------------------------------------

def s2z(S):
    I = np.eye(len(S))
    return Z0 * (I + S) @ np.linalg.inv(I - S)


def z2s(Z):
    I = np.eye(len(Z))
    return (Z - Z0 * I) @ np.linalg.inv(Z + Z0 * I)


def db(x):
    return 20 * np.log10(np.maximum(np.abs(x), 1e-15))


def reduce_z(Z, keep, loads):
    """Impedance matrix at ports `keep` when every other port o is closed by impedance loads[o] (0 = short)."""
    o = [q for q in range(len(Z)) if q not in keep]
    if not o:
        return Z[np.ix_(keep, keep)]
    ZL = np.diag([loads[q] for q in o])
    return Z[np.ix_(keep, keep)] - Z[np.ix_(keep, o)] @ np.linalg.solve(Z[np.ix_(o, o)] + ZL, Z[np.ix_(o, keep)])


def zcap(C, w):
    return 1 / (1j * w * C)


def zshunt_load(Cp, w):
    """A matched neighbour's feed as seen from its loop: its shunt Cp in parallel with the 50-ohm receiver."""
    return 1 / (1 / Z0 + 1j * w * Cp)


def bisect(f, lo, hi, it=80):
    flo = f(lo)
    for _ in range(it):
        mid = math.sqrt(lo * hi)
        fm = f(mid)
        if (fm > 0) == (flo > 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return math.sqrt(lo * hi)


def tune_circuit(Z, ports, feeds, w, Ct0, passes=6):
    """Stage-1 capacitors, exact for lumped capacitors in the gaps (every gap is a port). For each coil in turn, with
    the other coils closed by their own Ct and (Cp || 50 ohm): find Ct so the feed sees X = sqrt(R (Z0 - R)) (the root
    nearest the first-pass value, in log distance), then Cp from w Cp = X / (R^2 + X^2). Repeated passes settle the
    coupling. Returns Ct, Cp (F) per coil and a note per coil."""
    n = len(feeds)
    Ct, Cp, note = list(Ct0), [50e-12] * n, [''] * n
    coil_of = [i for (i, k) in ports]

    def zin(i, ct):
        loads = {}
        for q, (j, k) in enumerate(ports):
            if q == feeds[i]:
                continue
            loads[q] = zcap(ct if j == i else Ct[j], w) if k else zshunt_load(Cp[j], w)
        return reduce_z(Z, [feeds[i]], loads)[0, 0]

    for _ in range(passes):
        for i in range(n):
            def g(ct):
                z = zin(i, ct)
                return z.imag - math.sqrt(max(z.real, 1e-9) * max(Z0 - z.real, 1e-9))
            grid = np.geomspace(0.05e-12, 2e-9, 400)
            vals = [g(x) for x in grid]
            roots = [bisect(g, grid[q], grid[q + 1]) for q in range(len(grid) - 1)
                     if (vals[q] > 0) != (vals[q + 1] > 0) and abs(vals[q] - vals[q + 1]) < 1e4]
            roots = [r for r in roots if 0 < zin(i, r).real < Z0]
            if not roots:
                note[i] = 'no tuning solution with 0 < R < 50 ohm'
                continue
            Ct[i] = min(roots, key=lambda r: abs(math.log(r / Ct0[i])))
            z = zin(i, Ct[i])
            Cp[i] = z.imag / (z.real ** 2 + z.imag ** 2) / w
            note[i] = f'R = {z.real:.3g} ohm at the feed'
    return Ct, Cp, note


def network_state(Z, S, ports, feeds, w, Ct, Cp, drive):
    """Port voltages and incident waves (COMSOL convention, a = (1 + S)^-1 V) when coil `drive` is fed with 1 A at its
    feed gap and everything else is closed by its capacitors (other feeds: Cp || 50 ohm)."""
    P = len(ports)
    YL = np.zeros(P, complex)
    for q, (j, k) in enumerate(ports):
        if q != feeds[drive]:
            YL[q] = 1 / (zcap(Ct[j], w) if k else zshunt_load(Cp[j], w))
    src = np.zeros(P, complex)
    src[feeds[drive]] = 1.0
    # V = Z I with I = src - YL V   ->   (1 + Z YL) V = Z src
    V = np.linalg.solve(np.eye(P) + Z * YL[None, :], Z @ src)
    a = np.linalg.solve(np.eye(P) + S, V)
    return V, a


def nelder_mead(f, x0, step=0.3, iters=400, tol=1e-12):
    """head_2coil_sphere_optimized.py _nelder_mead."""
    n = len(x0)
    pts = [np.array(x0, float)] + [np.array(x0, float) + step * np.eye(n)[k] for k in range(n)]
    vals = [f(p) for p in pts]
    for _ in range(iters):
        order = np.argsort(vals)
        pts, vals = [pts[k] for k in order], [vals[k] for k in order]
        if abs(vals[-1] - vals[0]) < tol:
            break
        cen = np.mean(pts[:-1], axis=0)
        xr = cen + (cen - pts[-1]); fr = f(xr)
        if fr < vals[0]:
            xe = cen + 2 * (cen - pts[-1]); fe = f(xe)
            pts[-1], vals[-1] = (xe, fe) if fe < fr else (xr, fr)
        elif fr < vals[-2]:
            pts[-1], vals[-1] = xr, fr
        else:
            xc = cen + 0.5 * (pts[-1] - cen); fc = f(xc)
            if fc < vals[-1]:
                pts[-1], vals[-1] = xc, fc
            else:
                pts = [pts[0] + 0.5 * (p - pts[0]) for p in pts]
                vals = [f(p) for p in pts]
    return pts[int(np.argmin(vals))]


def best_shunt(Zb, cp0, w, cp_range):
    """Shunt caps across the feeds minimising sum |S_ii|^2 for the bare feed matrix Zb (head_2coil best_shunt)."""
    lo, hi = math.log(cp_range[0]), math.log(cp_range[1])

    def cost(x):
        x = np.clip(x, lo, hi)
        Y = np.linalg.inv(Zb) + np.diag(1j * w * np.exp(x))
        Sm = z2s(np.linalg.inv(Y))
        return float(np.sum(np.abs(np.diag(Sm)) ** 2))
    best = nelder_mead(cost, np.log(np.clip(cp0, *cp_range)))
    return list(np.exp(np.clip(best, lo, hi)))


# ---------------------------------------------------------------------------
# one case
# ---------------------------------------------------------------------------

def run_case(case_path, out_dir, c, client, opts, status=lambda **k: None):
    t_case = time.time()
    mode = opts.get('mode', 'auto')
    n_el = len(json.load(open(case_path, encoding='utf-8'))['elements'])
    if mode == 'auto':           # one or two coils: tuned and matched; arrays: one port per coil, B1 only
        mode = 'match' if n_el <= 2 else 'b1'
    if mode == 'match' and n_el > 2:
        raise ValueError('in-model matching is for one or two coils; use mode "b1" or "ports" for arrays')
    case, coils = load_case(case_path, c, feed_only=(mode == 'b1'))
    name = case.get('name', os.path.splitext(os.path.basename(case_path))[0])
    os.makedirs(out_dir, exist_ok=True)
    n = len(coils)
    c = dict(c, t_ins=float(case.get('insulation_mm', c['t_ins'])))
    r_w = float(case['wire_radius_mm'])
    for i, cg in enumerate(coils):     # a coil too large for the helmet wraps badly: its points jump (see core/simcase.js)
        st = np.linalg.norm(np.roll(cg['P'], -1, 0) - cg['P'], axis=1)
        if st.max() > 3 and st.max() > 5 * np.median(st):     # JUDG: healthy wires step 1.8-4.1 mm, no outliers
            raise ValueError(f'coil {i + 1}: wire points jump {st.max():.0f} mm (usually {np.median(st):.1f} mm); the coil is probably'
                             ' too large to wrap onto the helmet - reduce its size or bloom')
    H0 = case.get('helmet') or dict(a=85, b=105, c=110, zCut=-20)
    E = np.array([H0['a'] - 10, H0['b'] - 10, H0['c'] - 10], float)          # head = helmet - 10 mm (core/field.js)
    for i, cg in enumerate(coils):     # same pre-flight checks as the app (core/simcase.js SC.preflight)
        if (((cg['P'] / E) ** 2).sum(1) < 1).any():
            raise ValueError(f'coil {i + 1} passes inside the head')
        others = [q['P'] for j, q in enumerate(coils) if j != i]
        for g in cg['gaps']:
            if others:
                dg = min(np.linalg.norm(O - np.asarray(g['p']), axis=1).min() for O in others)
                if dg < 1.5:            # JUDG: mm centre to centre, a 2 mm gap could short across
                    raise ValueError(f'coil {i + 1}: a {"port" if g["k"] == 0 else "capacitor gap"} is only {dg:.1f} mm from another coil')
    close = crossings(coils, r_w, c)
    # tubes that touch would be fused by the geometry union (a short between strands or coils): refuse to build
    bad = [b for b in close if b['dist'] < 2 * r_w + 0.1]
    if bad:
        raise ValueError('wires too close to model as separate tubes: ' + '; '.join(
            f'coils {b["coils"]} {b["dist"]:.2f} mm apart at {np.round(b["centre"], 1).tolist()}' for b in bad)
            + f' (need > {2 * r_w + 0.1:.2f} mm centre to centre)')
    # arrays in B1-only mode skip the insulation beads: they hardly change B1, and on an 8-coil array every bead size
    # failed to mesh at one crossing, costing ~1 min per try before the no-bead fallback (2026-10-23)
    beads = close if c['insulation'] and mode != 'b1' else []
    status(stage='building model')
    M = Model(case, coils, c, client, beads)
    if opts.get('build_only'):
        M.save(os.path.join(out_dir, name + '.mph'))
        return dict(name=name, built_only=True)
    w, P = M.w, len(M.port_list)
    H = case.get('helmet') or dict(a=85, b=105, c=110, zCut=-20)
    planes = opts.get('planes') or [dict(plane='axial', offset=40), dict(plane='coronal', offset=0),
                                    dict(plane='sagittal', offset=0)]
    grid = int(opts.get('grid', c['grid']))
    plane_pts = [plane_points(H, pl['plane'], float(pl['offset']), grid) for pl in planes]
    allpts = np.vstack([pp[0] for pp in plane_pts])

    # ---- stage 1: a port in every gap ----
    S = np.zeros((P, P), complex)
    Bp = np.zeros((P, len(allpts), 3), complex)
    I_drive = np.zeros(P, complex)
    for p in range(P):
        status(stage=f'stage 1: {"coil" if mode == "b1" else "port"} {p + 1} of {P}')   # b1: one port per coil
        V, I, dt = M.solve_port(p)
        S[:, p] = V - np.eye(P)[p]
        I_drive[p] = I[p]
        if p == 0:
            M.check_S(V, 0)
        Bp[p] = M.fields(allpts)
        log(f'  port {p + 1}/{P} (coil {M.port_list[p][0] + 1} gap {M.port_list[p][1]}): {dt:.0f} s, |S_pp| {db(S[p, p]):.2f} dB')
    Z = s2z(S)
    np.savez_compressed(os.path.join(out_dir, name + '_stage1.npz'), S=S, Z=Z, B=Bp, points=allpts,
                        ports=np.array(M.ports), f0=M.f0)
    feeds = M.feeds
    if mode == 'b1':
        return finish_b1(case, coils, M, client, out_dir, name, S, Z, Bp, I_drive, planes, plane_pts, grid, close, beads, c, t_case,
                         case_path)
    nt = [len(cg['gaps']) - 1 for cg in coils]
    fp = case.get('firstPassCap_pF') or [10.0] * n
    Ct, Cp, note = tune_circuit(Z, M.ports, feeds, w, [x * 1e-12 for x in fp])
    Zs = reduce_z(Z, feeds, {q: 0 for q in range(P) if q not in feeds})          # all capacitor gaps shorted
    k_sh = [[float(Zs[i, j].imag / math.sqrt(abs(Zs[i, i].imag * Zs[j, j].imag))) for j in range(n)] for i in range(n)]
    Zf = reduce_z(Z, feeds, {q: zcap(Ct[i], w) for q, (i, k) in enumerate(M.ports) if k})
    Ym = np.linalg.inv(Zf) + np.diag(1j * w * np.array(Cp))
    Sm1 = z2s(np.linalg.inv(Ym))
    log('stage 1 (circuit): ' + '; '.join(f'coil {i + 1}: Ct {Ct[i] * 1e12:.3f} pF, Cp {Cp[i] * 1e12:.2f} pF, '
                                          f'S11 {db(Sm1[i, i]):.1f} dB ({note[i]})' for i in range(n)))
    stage1 = dict(ports=[[i + 1, k] for i, k in M.ports], S_re=S.real.tolist(), S_im=S.imag.tolist(),
                  Ct_pF=[x * 1e12 for x in Ct], Cp_pF=[x * 1e12 for x in Cp], notes=note,
                  S_matched_dB=db(Sm1).tolist(), k_shorted=k_sh,
                  L_shorted_nH=[float(Zs[i, i].imag / w * 1e9) for i in range(n)],
                  M_shorted_nH=[[float(Zs[i, j].imag / w * 1e9) for j in range(n)] for i in range(n)],
                  M_tuned_nH=[[float(Zf[i, j].imag / w * 1e9) for j in range(n)] for i in range(n)])
    B_el, I_el, src = [], [], 'stage 1 superposition (circuit capacitors)'
    for i in range(n):
        V, a = network_state(Z, S, M.ports, feeds, w, Ct, Cp, i)
        B_el.append(np.tensordot(a, Bp, axes=1))        # per 1 A fed into coil i's feed gap
        I_el.append(1.0)

    # ---- stage 2 (1-2 coils): the capacitors inside the model, refined with COMSOL in the loop ----
    stage2 = None
    if mode == 'match':
        M.set_layout('match')
        hist, best = [], None
        for it in range(1, c['maxit'] + 1):
            for i in range(n):
                M.j.param().set(f'Ct_{i + 1}', f'{Ct[i]:.12g}[F]')
                M.j.param().set(f'Cp_{i + 1}', f'{Cp[i]:.12g}[F]')
            S2, B2, Il = np.zeros((n, n), complex), [], []
            for p in range(n):
                status(stage=f'stage 2: iteration {it}, feed {p + 1} of {n}')
                V, I, dt = M.solve_port(p)
                S2[:, p] = V - np.eye(n)[p]
                B2.append(M.fields(allpts))
                Il.append(I[p] - 1j * w * Cp[p] * V[p])     # loop current at the feed = port current - shunt Cp branch
            worst = float(max(db(np.diag(S2))))
            hist.append(dict(it=it, Ct_pF=[x * 1e12 for x in Ct], Cp_pF=[x * 1e12 for x in Cp], S_dB=db(S2).tolist()))
            log(f'  stage 2 it {it}: ' + ', '.join(f'Ct{i + 1} {Ct[i] * 1e12:.4f} Cp{i + 1} {Cp[i] * 1e12:.3f} pF' for i in range(n))
                + '  S_ii ' + ', '.join(f'{db(S2[i, i]):.1f}' for i in range(n)) + ' dB'
                + (f'  S21 {db(S2[1, 0]):.1f} dB' if n == 2 else ''))
            if best is None or worst < best['worst']:
                best = dict(worst=worst, Ct=list(Ct), Cp=list(Cp), S=S2.copy(), B=B2, I=Il, it=it)
            if worst <= c['tol_dB']:
                break
            # de-embed the shunt Cp (it sits beside the port, so this is approximate) and move Ct towards the
            # X = sqrt(R (Z0 - R)) target; Cp re-optimised in circuit on the bare matrix (handover tune_match_bounded)
            Zb = np.linalg.inv(np.linalg.inv(s2z(S2)) - np.diag(1j * w * np.array(Cp)))
            newCt = list(Ct)
            for i in range(n):
                zin = Zb[i, i] if n == 1 else Zb[i, i] - Zb[i, 1 - i] * Zb[1 - i, i] / (Zb[1 - i, 1 - i] + zshunt_load(Cp[1 - i], w))
                R, X = zin.real, zin.imag
                if 0 < R < Z0:
                    inv = nt[i] / (w * Ct[i]) - (math.sqrt(R * (Z0 - R)) - X)
                    if inv > 0:
                        newCt[i] = nt[i] / (w * inv)
            Ct = [math.exp((1 - c['damping']) * math.log(o) + c['damping'] * math.log(v)) for o, v in zip(Ct, newCt)]
            Cp = best_shunt(Zb, Cp, w, c['cp_range'])
        Ct, Cp = best['Ct'], best['Cp']
        for i in range(n):
            M.j.param().set(f'Ct_{i + 1}', f'{Ct[i]:.12g}[F]')
            M.j.param().set(f'Cp_{i + 1}', f'{Cp[i]:.12g}[F]')
        B_el = [best['B'][i] / best['I'][i] for i in range(n)]
        src = 'stage 2: capacitors in the COMSOL model, per ampere of loop current at the feed'
        stage2 = dict(Ct_pF=[x * 1e12 for x in Ct], Cp_pF=[x * 1e12 for x in Cp], S_dB=db(best['S']).tolist(),
                      S_re=best['S'].real.tolist(), S_im=best['S'].imag.tolist(), matched=best['worst'] <= c['tol_dB'],
                      iterations=hist, tol_dB=c['tol_dB'])
        # the same tuned state rebuilt from stage 1 (consistency check of the split-feed layout)
        stage2['B_stage1_vs_stage2_rel'] = [
            float(np.linalg.norm(np.tensordot(network_state(Z, S, M.ports, feeds, w, Ct, Cp, i)[1], Bp, axes=1) - B_el[i])
                  / max(np.linalg.norm(B_el[i]), 1e-30)) for i in range(n)]

    # ---- fields per plane, uT per A ----
    out_planes, at = [], 0
    for pl, (pp, idx, ext) in zip(planes, plane_pts):
        k = len(pp)
        out_planes.append(dict(plane=pl['plane'], offset=float(pl['offset']), n=grid, ext=float(ext), idx=idx,
                               B=[dict(re=(1e6 * B[at:at + k]).real.round(6).ravel().tolist(),
                                       im=(1e6 * B[at:at + k]).imag.round(6).ravel().tolist()) for B in B_el]))
        at += k
    M.save(os.path.join(out_dir, name + '.mph'))
    client.remove(M.model)
    res = dict(name=name, created=time.strftime('%Y-%m-%dT%H:%M:%S'), software='sim/comsol_run.py (Design v1.11)',
               label='COMSOL full-wave result, EXPLORATORY (one solver, PEC wires, placeholder phantom and insulation)',
               comsol=str(client.version), f0_Hz=M.f0, mode=mode, n_coils=n, wire_radius_mm=M.r_wire,
               loaded=bool(case.get('phantom')), mesh_elements=M.n_mesh, mesh_level=M.mesh_level,
               coils=[dict(points=len(cg['P']), longest_step_mm=cg['max_seg'], length_mm=cg['length'], gaps=len(cg['gaps']))
                      for cg in coils],
               insulation=dict(eps_r=c['eps_ins'], t_mm=c['t_ins'], bead_pad_mm=getattr(M, 'bead_pad', None),
                               dropped=bool(getattr(M, 'beads_dropped', False)),
                               beads=[dict(centre=b['centre'].tolist(), radius_mm=b['core'] + (getattr(M, 'bead_pad', 0) or 0),
                               coils=b['coils'], kind=b['kind'], skipped=b['skipped']) for b in beads]),
               quasistatic=case.get('quasistatic'), spacing_mm=case.get('spacing_mm'), pair=case.get('pair'),
               min_gap_mm=min([b['dist'] for b in close] or [None]) if close else None, stage1=stage1, stage2=stage2,
               b1=dict(source=src, unit='uT/A', convention='B1- = (Bx - i By)/2, B0 along +z', planes=out_planes),
               seconds=time.time() - t_case, case_file=os.path.basename(case_path))
    with open(os.path.join(out_dir, name + '_results.json'), 'w', encoding='utf-8') as f:
        json.dump(res, f)
    log(f'case {name} done in {time.time() - t_case:.0f} s')
    return res


def finish_b1(case, coils, M, client, out_dir, name, S, Z, Bp, I_drive, planes, plane_pts, grid, close, beads, c, t_case, case_path):
    """Arrays, B1 only (one port per coil, no capacitors, no tuning or matching): each coil's map is its own port run, per ampere of its port current, with the other coils'
    ports terminated in 50 ohm. Coupling k from the port impedance matrix."""
    n, w = len(coils), M.w
    k = [[float(Z[i, j].imag / math.sqrt(abs(Z[i, i].imag * Z[j, j].imag))) for j in range(n)] for i in range(n)]
    stage1 = dict(ports=[[i + 1, 0] for i in range(n)], S_re=S.real.tolist(), S_im=S.imag.tolist(), S_dB=db(S).tolist(),
                  k_shorted=k, L_shorted_nH=[float(Z[i, i].imag / w * 1e9) for i in range(n)])
    B_el = [Bp[i] / I_drive[i] for i in range(n)]
    out_planes, at = [], 0
    for pl, (pp, idx, ext) in zip(planes, plane_pts):
        kk = len(pp)
        out_planes.append(dict(plane=pl['plane'], offset=float(pl['offset']), n=grid, ext=float(ext), idx=idx,
                               B=[dict(re=(1e6 * B[at:at + kk]).real.round(6).ravel().tolist(),
                                       im=(1e6 * B[at:at + kk]).imag.round(6).ravel().tolist()) for B in B_el]))
        at += kk
    M.save(os.path.join(out_dir, name + '.mph'))
    client.remove(M.model)
    res = dict(name=name, created=time.strftime('%Y-%m-%dT%H:%M:%S'), software='sim/comsol_run.py (Design v1.11)',
               label='COMSOL full-wave result: one port per coil, no capacitors (B1 only)',
               comsol=str(client.version), f0_Hz=M.f0, mode='b1', n_coils=n, wire_radius_mm=M.r_wire, loaded=bool(case.get('phantom')),
               mesh_elements=M.n_mesh, mesh_level=M.mesh_level,
               coils=[dict(points=len(cg['P']), longest_step_mm=cg['max_seg'], length_mm=cg['length'], gaps=len(cg['gaps'])) for cg in coils],
               insulation=dict(eps_r=c['eps_ins'], t_mm=c['t_ins'], bead_pad_mm=getattr(M, 'bead_pad', None),
                               dropped=bool(getattr(M, 'beads_dropped', False)), beads=len(beads)),
               quasistatic=case.get('quasistatic'), min_gap_mm=min([b['dist'] for b in close] or [None]) if close else None,
               stage1=stage1, stage2=None,
               b1=dict(source='one port per coil, no capacitors; per ampere of port current, other coils terminated in 50 ohm',
                       unit='uT/A', convention='B1- = (Bx - i By)/2, B0 along +z', planes=out_planes),
               seconds=time.time() - t_case, case_file=os.path.basename(case_path))
    with open(os.path.join(out_dir, name + '_results.json'), 'w', encoding='utf-8') as f:
        json.dump(res, f)
    log(f'case {name} done in {time.time() - t_case:.0f} s')
    return res


# ---------------------------------------------------------------------------
# entry points
# ---------------------------------------------------------------------------

def run_job(job_dir, cores=None):
    """Run every case_*.json in job_dir (written by tools/serve.js) and keep status.json current for the app."""
    job = json.load(open(os.path.join(job_dir, 'job.json'), encoding='utf-8'))
    cases = sorted(glob.glob(os.path.join(job_dir, 'case_*.json')))
    st = dict(state='starting', n_cases=len(cases), case=0, stage='', started=time.time(), pid=os.getpid(), done=[])

    def status(**kw):
        st.update(kw, updated=time.time())
        tmp = os.path.join(job_dir, 'status.json.tmp')
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(st, f)
        os.replace(tmp, os.path.join(job_dir, 'status.json'))

    c = dict(CFG)
    for k in ('mesh_level', 'tol_dB', 'eps_ins', 'insulation', 'grid'):
        if k in job.get('options', {}):
            c[k] = job['options'][k]
    c['cores'] = cores or job.get('options', {}).get('cores', c['cores'])
    try:
        import mph
        status(state='running', stage='starting COMSOL')
        client = mph.start(cores=c['cores'])
        for q, path in enumerate(cases):
            status(case=q + 1, stage='loading case')
            log(f'=== case {q + 1}/{len(cases)}: {os.path.basename(path)} ===')
            try:            # one failed case does not stop the others (e.g. the rest of a pair sweep)
                res = run_case(path, job_dir, c, client, job.get('options', {}), status)
                st['done'].append(res['name'] + '_results.json')
            except Exception as e:
                traceback.print_exc()
                st.setdefault('failed', []).append(dict(case=os.path.basename(path), error=f'{type(e).__name__}: {e}'[:300]))
                for mdl in client.models():
                    client.remove(mdl)
        if not st['done']:
            raise RuntimeError('every case failed: ' + st['failed'][0]['error'])
        status(state='done', stage='finished', finished=time.time())
    except Exception as e:
        traceback.print_exc()
        status(state='error', stage=st.get('stage', ''), error=f'{type(e).__name__}: {e}', finished=time.time())
        sys.exit(1)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('case', nargs='?')
    ap.add_argument('--job')
    ap.add_argument('--mode', default='auto', choices=('auto', 'b1', 'ports', 'match'))
    ap.add_argument('--out')
    ap.add_argument('--cores', type=int)
    ap.add_argument('--build-only', action='store_true')
    ap.add_argument('--no-insulation', action='store_true')
    a = ap.parse_args()
    if a.job:
        return run_job(a.job, a.cores)
    if not a.case:
        ap.error('give a case file or --job DIR')
    import mph
    c = dict(CFG, insulation=not a.no_insulation)
    if a.cores:
        c['cores'] = a.cores
    name = os.path.splitext(os.path.basename(a.case))[0]
    out = a.out or os.path.join(ROOT, 'sim', 'out', name + '_comsol')
    client = mph.start(cores=c['cores'])
    run_case(a.case, out, c, client, dict(mode=a.mode, build_only=a.build_only))


if __name__ == '__main__':
    main()
