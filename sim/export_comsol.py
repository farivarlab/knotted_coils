# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
"""COMSOL export (Design v1.10 §6c): writes a case as plain files that sim/comsol_build_mph.py (or a person in the
COMSOL GUI) can build a model from.

WHAT IT DOES (plain language):
  Reads the same case file that drives the openEMS model (sim/cases/<case>.json, from tests/export_case.js or the
  app's "Export simulation case") and cuts every coil at its capacitor breaks with the SAME code openEMS uses
  (sim/wirecut.py), so both solvers model identical wires, port gaps and crossover bumps. Writes:
    sim/comsol/<case>/seg_e<element>_<k>.txt  one wire segment between two gaps: "x y z" in mm, one point per line
                                             (plain columns, the layout COMSOL's Interpolation Curve "from file"
                                             option reads - UNVERIFIED for every COMSOL version)
    sim/comsol/<case>/ports.csv              one row per capacitor gap: port number, element, k (0 = feed), the two
                                             terminals A and B (mm), gap axis and sign, and the in-plane direction
                                             used for the port face (unit vector, perpendicular to the gap)
    sim/comsol/<case>/phantom.json           head phantom: semi-axes, skin/skull thickness, neck cut, tissue
                                             epsR and conductivity (S/m) with their source label; null in air
    sim/comsol/<case>/meta.json              frequency, wire radius, units, segment list, source case, git hash

USAGE: python sim/export_comsol.py sim/cases/<case>.json [--gap 2.0]     (numpy only; no openEMS or COMSOL needed)

PARAMETERS: GAP 2.0 mm (same as sim/run_openems.py, JUDG). Port face width = wire diameter (DERIVED: the gap is
  bridged by a rectangle as wide as the wire).
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wirecut import cut_all                                          # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def face_direction(q, normal):
    """Unit vector for the port face's second side: perpendicular to the gap axis, as close as possible to the
    helmet normal at the port (so the face stands across the wire, not along the helmet)."""
    e = np.zeros(3)
    e[q['axis']] = 1.0
    n = np.asarray(normal, float) if normal is not None else np.array([0.0, 0.0, 1.0])
    u = n - np.dot(n, e) * e
    if np.linalg.norm(u) < 1e-6:                                      # normal along the gap: any perpendicular
        u = np.cross(e, [1.0, 0.0, 0.0] if q['axis'] != 0 else [0.0, 1.0, 0.0])
    return u / np.linalg.norm(u)


def nearest_normal(el, p):
    if not el.get('normals'):
        return None
    W = np.asarray(el['wire'], float)
    return el['normals'][int(np.argmin(np.linalg.norm(W - np.asarray(p), axis=1)))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('case')
    ap.add_argument('--gap', type=float, default=2.0)
    opt = ap.parse_args()
    case_file = os.path.abspath(opt.case)
    case = json.load(open(case_file))
    out = os.path.join(ROOT, 'sim', 'comsol', case['name'])
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):                                         # never leave segments from an older export
        if f.startswith('seg_') and f.endswith('.txt'):
            os.remove(os.path.join(out, f))
    segs_meta, rows, pidx = [], [], 0
    for e, (segs, prt) in enumerate(cut_all(case, opt.gap)):
        for k, sg in enumerate(segs):
            arr = np.asarray(sg, float)
            fn = 'seg_e%d_%d.txt' % (e, k)
            np.savetxt(os.path.join(out, fn), arr, fmt='%.6f', delimiter=' ')
            segs_meta.append(dict(file=fn, element=e, k=k, points=len(arr), start=arr[0].tolist(), end=arr[-1].tolist()))
        for k, q in enumerate(prt):
            u = face_direction(q, nearest_normal(case['elements'][e], q['p']))
            pidx += 1
            rows.append([pidx, e, k, int(k == 0)] + list(map(float, q['A'])) + list(map(float, q['B'])) + [int(q['axis']), float(q['sign'])] + list(map(float, u)))
    hdr = 'port,element,k,feed,Ax,Ay,Az,Bx,By,Bz,axis,sign,ux,uy,uz'
    with open(os.path.join(out, 'ports.csv'), 'w') as fh:
        fh.write(hdr + '\n')
        for r in rows:
            fh.write(','.join(('%d' % v) if isinstance(v, int) else ('%.6f' % v) for v in r) + '\n')
    ph = case.get('phantom')
    if ph:
        T = ph['tissue']
        phantom = dict(type=ph.get('type'), semi_axes_mm=ph['axes'], skin_mm=ph['skin_mm'], skull_mm=ph['skull_mm'], neck_cut_z_mm=ph['zMin'],
                       tissue={k: dict(epsR=v['epsR'], sigma_S_per_m=v['kappa']) for k, v in T.items() if k != 'source'},
                       tissue_source=T.get('source'), centre_mm=[0.0, 0.0, 0.0])
    else:
        phantom = None
    json.dump(phantom, open(os.path.join(out, 'phantom.json'), 'w'), indent=1)
    try:
        git = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT).decode().strip()
    except Exception:
        git = 'unknown'
    meta = dict(case=case['name'], case_file=os.path.relpath(case_file, ROOT).replace('\\', '/'), git=git, units='mm',
                f0_Hz=case['f0_Hz'], B0_T=case['B0_T'], wire_radius_mm=case['wire_radius_mm'], gap_mm=opt.gap,
                port_face_width_mm=2 * case['wire_radius_mm'], n_elements=len(case['elements']), n_ports=pidx,
                segments=segs_meta, status='UNVALIDATED export for COMSOL (Design v1.10 §6c, check V25)')
    json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'), indent=1)
    print('wrote', out, '|', len(segs_meta), 'segments,', pidx, 'ports, phantom', 'yes' if phantom else 'no (air)')


if __name__ == '__main__':
    main()
