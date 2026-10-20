# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
"""Audit M2 check: do the two strands at each knot crossing stay separate after openEMS snaps the thin curves to the grid?

WHAT IT DOES (plain language):
  openEMS's thin curves (AddCurve) follow the grid lines nearest the true wire path. Where the wire passes over itself,
  the two strands are only ~1.5 mm apart; on a 1 mm grid they could snap onto the SAME grid nodes, which would short
  the knot (a closed metal loop with no port: energy that never decays, wrong inductance). This script rebuilds the
  grid exactly as sim/run_openems.py does (no FDTD run) and reports, for every crossing, the snapped node of each
  strand and whether they coincide or touch.

USAGE: python sim/check_crossings.py sim/cases/<case>.json [--res 1.0]
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run_openems as R                                              # noqa: E402  (same mesh code)


def build_mesh(case, opt):
    from CSXCAD import ContinuousStructure
    CSX = ContinuousStructure()
    mesh = CSX.GetGrid()
    mesh.SetDeltaUnit(R.UNIT)
    allpts = []
    for el in case['elements']:
        segs, prt = R.cut_wire(el['wire'], el['breaks'], opt.gap)
        allpts += [np.asarray(s) for s in segs]
        for q in prt:
            for v in (q['A'], q['B']):
                for ax in range(3):
                    mesh.AddLine('xyz'[ax], [float(v[ax])])
    pts = np.vstack(allpts)
    lo, hi = pts.min(axis=0) - 6.0, pts.max(axis=0) + 6.0
    for ax in range(3):
        mesh.AddLine('xyz'[ax], [lo[ax], hi[ax]])
    mesh.SmoothMeshLines('all', opt.res, 1.4)
    return [np.asarray(mesh.GetLines('xyz'[ax])) for ax in range(3)]


def crossings_3d(W):
    """Crossings of the wire projected on its best-fit plane; returns pairs of 3D points (one per strand)."""
    W = np.asarray(W, float)
    c = W.mean(0)
    u, s, vt = np.linalg.svd(W - c)
    e1, e2 = vt[0], vt[1]
    P2 = np.stack([(W - c) @ e1, (W - c) @ e2], 1)
    n = len(W)
    out = []
    for i in range(n):
        a, b = P2[i], P2[(i + 1) % n]
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue
            cc, d = P2[j], P2[(j + 1) % n]
            r, sv = b - a, d - cc
            den = r[0] * sv[1] - r[1] * sv[0]
            if abs(den) < 1e-14:
                continue
            q = cc - a
            t1 = (q[0] * sv[1] - q[1] * sv[0]) / den
            t2 = (q[0] * r[1] - q[1] * r[0]) / den
            if 0 <= t1 < 1 and 0 <= t2 < 1:
                out.append((W[i] + t1 * (W[(i + 1) % n] - W[i]), W[j] + t2 * (W[(j + 1) % n] - W[j])))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('case')
    ap.add_argument('--res', type=float, default=1.0)
    ap.add_argument('--gap', type=float, default=2.0)
    opt = ap.parse_args()
    case = json.load(open(opt.case))
    lines = build_mesh(case, opt)
    snap = lambda p: tuple(int(np.argmin(np.abs(lines[ax] - p[ax]))) for ax in range(3))
    bad = 0
    for e, el in enumerate(case['elements']):
        for k, (p1, p2) in enumerate(crossings_3d(el['wire'])):
            s1, s2 = snap(p1), snap(p2)
            off = [abs(s1[a] - s2[a]) for a in range(3)]
            # One FDTD edge joins two nodes that differ by 1 along exactly one axis; diagonal neighbours share no edge.
            if max(off) == 0:
                status = 'SHORT (same node)'
            elif sorted(off) == [0, 0, 1]:
                status = 'EDGE-ADJACENT (one grid edge apart: possible short)'
            elif max(off) == 1:
                status = 'diagonal neighbours (no shared edge: no short)'
            else:
                status = 'separate'
            if status.startswith(('SHORT', 'EDGE')):
                bad += 1
            print('element %d crossing %d: true separation %.2f mm; snapped node offset %s -> %s' %
                  (e, k, np.linalg.norm(p1 - p2), tuple(s2[a] - s1[a] for a in range(3)), status))
    print('crossings at risk (same node or one grid edge apart):', bad)


if __name__ == '__main__':
    main()
