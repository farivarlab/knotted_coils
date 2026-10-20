# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
"""V20 - second solver: the loaded trefoil's capacitor values from mariepy vs openEMS (Design.md §7, pre-registered).

WHAT IT DOES (plain language):
  Solves the same single trefoil + three-layer head phantom (3T) with mariepy (a Python port of the MARIE 3.0 integral-
  equation MRI solver; different numerical method from openEMS's FDTD, and it models the real wire radius), takes the
  4-port impedance matrix at the Larmor frequency, and runs OUR SAME co-simulation network (sim/cosim.py Net: same losses,
  same tuning/matching rule) on it. V20 passes if Ct, Cm and Lm agree with the openEMS-based values within 10%.

CAVEATS: mariepy is very new (weeks old, single author, probably partly AI-written; see DECISIONS.md). Its voxel grid
  here is 5 mm (JUDG, speed) vs openEMS's 3 mm phantom grid. Its API was read from its own docstrings (mariepy
  0.0.0.dev106). EXPLORATORY.

USAGE: python sim/v20_mariepy.py   -> sim/out/mariepy_trefoil_head.json
"""
import json
import os
import sys
import time

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cosim import Net, Z_PRE                                    # noqa: E402  same network code as the openEMS path

from mariepy.body import VoxelBody                              # noqa: E402
from mariepy.coil import Port                                   # noqa: E402
from mariepy.constants import Medium                            # noqa: E402
from mariepy.solver import solve                                # noqa: E402
from mariepy.wire import WireCoil                               # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES_M = 0.005                                                    # JUDG: 5 mm voxels (speed)
N_SEG = 240                                                      # JUDG: wire segments (break points inserted exactly)


def resample_with_breaks(P, breaks):
    """Resample the closed wire to ~N_SEG nodes and insert every break point as its own node; return nodes (m), the
    node index of each break (in the case's break order), and the segments."""
    P = np.asarray(P, float)
    n = len(P)
    seg = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    L = s[-1]
    sb = [s[b['index']] + b['f'] * seg[b['index']] for b in breaks]
    targets = sorted(set(list(np.linspace(0, L, N_SEG, endpoint=False)) + sb))
    nodes, idx_of = [], {}
    for t in targets:
        k = min(np.searchsorted(s, t, side='right') - 1, n - 1)
        f = (t - s[k]) / seg[k]
        nodes.append(P[k] + f * (P[(k + 1) % n] - P[k]))
        idx_of[t] = len(nodes) - 1
    nodes = np.asarray(nodes) * 1e-3
    segments = [(i, (i + 1) % len(nodes)) for i in range(len(nodes))]
    return nodes, [idx_of[t] for t in sb], segments


def phantom_body(ph):
    a, b, c = [x * 1e-3 for x in ph['axes']]
    zmin = ph['zMin'] * 1e-3
    xs = np.arange(-a, a + 1e-9, RES_M)
    ys = np.arange(-b, b + 1e-9, RES_M)
    zs = np.arange(max(-c, zmin), c + 1e-9, RES_M)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')
    sk, sl = ph['skin_mm'] * 1e-3, ph['skull_mm'] * 1e-3

    def inside(ax):
        return (X / ax[0]) ** 2 + (Y / ax[1]) ** 2 + (Z / ax[2]) ** 2 <= 1
    T = ph['tissue']
    eps = np.ones(X.shape)
    sig = np.zeros(X.shape)
    for mask, t in ((inside([a, b, c]), 'skin'), (inside([a - sk, b - sk, c - sk]), 'skull'), (inside([a - sk - sl, b - sk - sl, c - sk - sl]), 'brain')):
        eps[mask] = T[t]['epsR']
        sig[mask] = T[t]['kappa']
    m = inside([a, b, c]) & (Z >= zmin)
    eps[~m], sig[~m] = 1.0, 0.0
    return VoxelBody(torch.tensor(eps), torch.tensor(sig), torch.tensor(m), RES_M, (float(xs[0]), float(ys[0]), float(zs[0])))


def main():
    case = json.load(open(os.path.join(ROOT, 'sim', 'cases', 'trefoil_head_3T.json')))
    ref = json.load(open(os.path.join(ROOT, 'sim', 'out', 'trefoil_head_3T', 'cosim.json')))
    el = case['elements'][0]
    nodes, pnodes, segs = resample_with_breaks(el['wire'], el['breaks'])
    ports = tuple(Port(tag=k + 1, kind='port', load='none', value=0.0, quality=1.0, voltage=1.0) for k in range(len(pnodes)))
    coil = WireCoil.build(torch.tensor(nodes), segs, pnodes, ports, radius=case['wire_radius_mm'] * 1e-3)
    body = phantom_body(case['phantom'])
    t0 = time.time()
    result = solve(body, coil, Medium(case['B0_T']))
    secs = time.time() - t0
    Z = np.asarray(result.impedance.detach().cpu().numpy() if hasattr(result.impedance, 'detach') else result.impedance)
    meta = dict(ports=[dict(element=0, feed=(k == 0)) for k in range(len(pnodes))])
    net = Net(case, meta)
    w0 = 2 * np.pi * case['f0_Hz']
    ok = net.tune_all(Z, w0)
    mine = dict(Ct_pF=net.Ct[0] * 1e12, Cm_pF=net.Cm[0] * 1e12, Lm_nH=net.Lm[0] * 1e9) if ok else None
    oe = ref['elements'][0] if ref.get('elements') else None
    rel = {k: (mine[k] - oe[k]) / oe[k] for k in ('Ct_pF', 'Cm_pF', 'Lm_nH')} if (mine and oe) else None
    verdict = 'NOT EVALUABLE' if rel is None else ('PASS' if all(abs(v) <= 0.10 for v in rel.values()) else 'FAIL')
    out = dict(verdict=verdict, mariepy=mine, openems=({k: oe[k] for k in ('Ct_pF', 'Cm_pF', 'Lm_nH')} if oe else None), rel_diff=rel,
               seconds=secs, voxel_mm=RES_M * 1e3, n_nodes=len(nodes), Z_feed=str(Z[0, 0]),
               summary=('Ct/Cm/Lm rel diff ' + ', '.join('%s %+.1f%%' % (k, 100 * v) for k, v in rel.items())) if rel else 'tuning failed or no openEMS reference')
    json.dump(out, open(os.path.join(ROOT, 'sim', 'out', 'mariepy_trefoil_head.json'), 'w'), indent=1)
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
