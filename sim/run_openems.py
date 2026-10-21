# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
"""Full-wave multiport solve of a coil case with openEMS (Design.md §6b, v1.7).

WHAT IT DOES (plain language):
  Builds the coil wires (with their real radius) in openEMS's finite-difference time-domain (FDTD) solver, puts a
  50-ohm "port" in every capacitor break, adds the head phantom if the case has one, and runs one simulation per
  port (that port driven, all others resting on 50 ohm). From the port voltages it assembles the S-matrix (how a
  wave sent into one port comes out of every port) over a band around the Larmor frequency, and saves the magnetic
  field on two planes through the head for every run. sim/cosim.py then "plugs in" capacitors on top of this.

USAGE:
  python sim/run_openems.py sim/cases/<case>.json [--res 1.0] [--gap 2.0]
  -> sim/out/<case>/openems.npz and openems_meta.json

METHOD + SOURCES:
  openEMS 0.37.0 Python interface (Liebig et al., Int J Numer Model 26(6):680, 2013, doi:10.1002/jnm.1875 -
  identity checked via Crossref only). API usage follows openEMS's own MRI_Loop_Coil.py tutorial.
  S_pj = uf_ref_p / uf_inc_j for run j (incident wave only at port j; others are matched 50-ohm terminations).
  Port j runs from the wire's upstream to downstream terminal, so port voltages/currents follow the wire direction.

MATLAB EQUIVALENT: openEMS also ships an Octave/MATLAB interface with the same objects (AddLumpedPort, AddWire...).

PARAMETERS (also in PARAMETERS.md):
  RES_WIRE 1.0 mm   JUDG: mesh near wires (wire radius 0.5 mm; crossings ~1.5 mm apart). Sensitivity: not yet tested.
  RES_PHANTOM 3 mm  JUDG: mesh in the phantom (openEMS tutorial uses 2 mm).
  GAP 2.0 mm        JUDG: port/capacitor gap length.
  AIR 200 mm        CONV: air spacer, as in the openEMS MRI_Loop_Coil tutorial (Air_Box = 200).
  END_CRIT 1e-4     CONV: openEMS tutorial value (energy decay -40 dB).
  FC = 0.5 f0       JUDG: Gaussian excitation half-bandwidth.
  PORT_ROUND 1e-3 mm  DERIVED: port terminals rounded to 1 um so that openEMS's 7-significant-digit XML export of the
                    port box equals the grid line exactly (see DECISIONS 2026-10-21: an unrounded feed port was silently
                    dropped in the pair case and the run produced no signal for 13.7 h).
  REFINE 0.4 mm +-3 mm  JUDG (Design v1.9): extra grid lines every 0.4 mm within +-3 mm (each axis) of every crossover
                    centre listed in the case ('refine'), so two coils 1.65 mm apart land several grid nodes apart
                    (pre-run gate). Caveat: the thin-wire correction (a_eff ~ 0.17 x cell) was calibrated on a uniform
                    1 mm grid; the short refined stretches have a smaller a_eff (information; V15b caveat).
  MAX_TS 2e6        JUDG: timestep cap (openEMS default is 1e9, i.e. effectively none). The slowest completed run so far
                    needed ~2e5 timesteps; a run that hits the cap is reported, not trusted.
VALIDATED BY: V15 (resonance of a circular loop), V16 (passivity/reciprocity of S). Exploratory otherwise.
"""
import argparse
import json
import os
import shutil
import sys
import time

import numpy as np

OPENEMS_DIR = os.environ.get('KC_OPENEMS_DIR', r'C:\Users\reza\.solvers\openEMS')
os.environ.setdefault('CSXCAD_INSTALL_PATH', OPENEMS_DIR)       # per-process; no permanent setx (Design v1.7 note)
if hasattr(os, 'add_dll_directory') and os.path.isdir(OPENEMS_DIR):
    os.add_dll_directory(OPENEMS_DIR)
import h5py                                                       # noqa: E402
from CSXCAD import ContinuousStructure                             # noqa: E402
from openEMS import openEMS                                        # noqa: E402
from openEMS.physical_constants import C0                          # noqa: E402
from openEMS.utilities import HDF5Dump                              # noqa: E402
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wirecut import MIN_GAP, axis_of, arc_lengths, cut_wire, cut_all   # noqa: E402,F401  (shared with COMSOL export, v1.10)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Z0 = 50.0
UNIT = 1e-3                    # all lengths in mm


def write_phantom(path, ph, res):
    """Three-layer ellipsoidal head (skin/skull/brain) as a CSXCAD DiscMaterial file (layout as in openEMS's
    create_phantoms.write_disc_material: data shape (nz,ny,nx), mesh in metres)."""
    a, b, c = ph['axes']
    xs = np.arange(-a - res, a + res + 1e-9, res)
    ys = np.arange(-b - res, b + res + 1e-9, res)
    zs = np.arange(max(-c, ph['zMin']) - res, c + res + 1e-9, res)
    xc, yc, zc = (xs[:-1] + xs[1:]) / 2, (ys[:-1] + ys[1:]) / 2, (zs[:-1] + zs[1:]) / 2
    X, Y, Zg = np.meshgrid(xc, yc, zc, indexing='ij')

    def inside(ax_):
        return (X / ax_[0]) ** 2 + (Y / ax_[1]) ** 2 + (Zg / ax_[2]) ** 2 <= 1.0
    sk, sl = ph['skin_mm'], ph['skull_mm']
    data = np.zeros(X.shape, np.uint8)
    data[inside([a, b, c])] = 3                                                    # skin
    data[inside([a - sk, b - sk, c - sk])] = 2                                     # skull
    data[inside([a - sk - sl, b - sk - sl, c - sk - sl])] = 1                      # brain
    data[Zg < ph['zMin']] = 0                                                      # neck cut
    T = ph['tissue']
    with h5py.File(path, 'w') as f:
        f.attrs['Version'] = np.float64(2.0)
        ds = f.create_dataset('/DiscData', data=np.ascontiguousarray(data.transpose(2, 1, 0)), dtype=np.uint8, compression='gzip')
        ds.attrs['DB_Size'] = np.int32(4)
        ds.attrs['epsR'] = np.array([1.0, T['brain']['epsR'], T['skull']['epsR'], T['skin']['epsR']], np.float32)
        ds.attrs['kappa'] = np.array([0.0, T['brain']['kappa'], T['skull']['kappa'], T['skin']['kappa']], np.float32)
        ds.attrs['density'] = np.array([0, 1000, 1000, 1000], np.float32)            # not used (no SAR here)
        ds.attrs['Name'] = 'Background,Brain,Skull,Skin'
        f.create_dataset('/mesh/x', data=(xs * UNIT).astype(np.float32))
        f.create_dataset('/mesh/y', data=(ys * UNIT).astype(np.float32))
        f.create_dataset('/mesh/z', data=(zs * UNIT).astype(np.float32))
    return [xs[0], ys[0], zs[0]], [xs[-1], ys[-1], zs[-1]]


def planes_for(case):
    """Axial plane through the first element's centre height; coronal plane 15 mm inside the head from that element."""
    W = np.asarray(case['elements'][0]['wire'], float)
    cen = W.mean(axis=0)
    ph = case.get('phantom')
    ext = (np.array(ph['axes']) + 20) if ph else np.array([120, 140, 150])
    if ph:
        # audit M13: measure the 15 mm from the HEAD surface (along the ray from the head centre through the element),
        # not from the helmet/wire
        a_, b_, c_ = ph['axes']
        rho = np.sqrt((cen[0] / a_) ** 2 + (cen[1] / b_) ** 2 + (cen[2] / c_) ** 2)
        y_surf = cen[1] / rho
        y_cor = y_surf + np.sign(-y_surf) * 15.0
    else:
        y_cor = cen[1] + np.sign(-cen[1]) * 25.0
    return [dict(name='axial', axis=2, pos=float(cen[2]), start=[-ext[0], -ext[1], float(cen[2])], stop=[ext[0], ext[1], float(cen[2])]),
            dict(name='coronal', axis=1, pos=float(y_cor), start=[-ext[0], float(y_cor), -ext[2]], stop=[ext[0], float(y_cor), ext[2]])]


MIN_CELL = 0.15     # mm, JUDG: abort a case whose smallest cell is below this (tiny cells shrink the timestep)


def add_refinement(mesh, case):
    """Design v1.9: local grid refinement around crossover centres (REFINE). Shared with sim/check_crossings.py.
    A candidate line is kept only if it is >= MIN_GAP from every existing line and every line already kept
    (2026-10-21: without this, overlapping regions and port lines produced 0.002 mm cells and a 30x smaller timestep)."""
    cents = case.get('refine') or []
    for ax in range(3):
        have = sorted(float(v) for v in mesh.GetLines('xyz'[ax]))
        cand = sorted(set(float(v) for c in cents for v in np.round(np.arange(c[ax] - 3.0, c[ax] + 3.0 + 1e-9, 0.4), 3)))
        keep = []
        for v in cand:
            if all(abs(v - h) >= MIN_GAP for h in have) and all(abs(v - k) >= MIN_GAP for k in keep):
                keep.append(v)
        if keep:
            mesh.AddLine('xyz'[ax], keep)


def check_min_cell(mesh):
    for ax in range(3):
        d = np.diff(np.sort(np.asarray(mesh.GetLines('xyz'[ax]), float)))
        if len(d) and d.min() < MIN_CELL:
            raise RuntimeError('mesh: smallest %s cell %.4f mm < MIN_CELL %.2f mm (would shrink the timestep); case aborted' % ('xyz'[ax], d.min(), MIN_CELL))


def build_and_run(case, drive, sim_path, opt, planes, phantom_file, phantom_box, nrts=None):
    f0 = case['f0_Hz']
    fc = opt.fc_frac * f0
    FDTD = openEMS(EndCriteria=opt.end_crit, NrTS=int(nrts or opt.max_ts))
    FDTD.SetGaussExcite(f0, fc)
    FDTD.SetBoundaryCond(['MUR'] * 6)
    CSX = ContinuousStructure()
    FDTD.SetCSX(CSX)
    mesh = CSX.GetGrid()
    mesh.SetDeltaUnit(UNIT)
    metal = CSX.AddMetal('wire')
    allpts, ports, pidx = [], [], 0
    for ei, (segs, prt) in enumerate(cut_all(case, opt.gap)):
        for sgm in segs:
            arr = np.asarray(sgm, float)
            if opt.wire == 'curve':
                # thin PEC curve: always a connected staircase along mesh lines; its effective radius depends on the mesh
                # and is corrected in cosim.py (thin-wire correction, calibrated on the circular loop; V15b)
                metal.AddCurve([arr[:, 0], arr[:, 1], arr[:, 2]], priority=10)
            else:
                # radius-aware wire: only mesh edges within the radius are metal -> can DISCONNECT on coarse meshes
                metal.AddWire([arr[:, 0], arr[:, 1], arr[:, 2]], radius=case['wire_radius_mm'], priority=10)
            allpts.append(arr)
        for k, q in enumerate(prt):
            port = FDTD.AddLumpedPort(port_nr=pidx + 1, R=Z0, start=q['A'], stop=q['B'], p_dir='xyz'[q['axis']],
                                      excite=1.0 if (pidx == drive or (isinstance(drive, list) and pidx in drive)) else 0,
                                      priority=20, edges2grid='all')
            ports.append(dict(obj=port, element=ei, k=k, feed=(k == 0), axis=q['axis'], sign=q['sign'],
                              A=q['A'].tolist(), B=q['B'].tolist(), p=q['p'].tolist()))
            for v in (q['A'], q['B']):
                for ax in range(3):
                    mesh.AddLine('xyz'[ax], [float(v[ax])])
            pidx += 1
    pts = np.vstack(allpts)
    lo, hi = pts.min(axis=0) - 6.0, pts.max(axis=0) + 6.0
    for ax in range(3):
        mesh.AddLine('xyz'[ax], [lo[ax], hi[ax]])
    add_refinement(mesh, case)
    mesh.SmoothMeshLines('all', opt.res, 1.4)
    if phantom_file:
        body = CSX.AddDiscMaterial('head', filename=phantom_file, filetype=0, scale=1 / UNIT)
        body.AddBox(phantom_box[0], phantom_box[1], priority=0)
        for ax in range(3):   # phantom box edges need no exact line: skip any within MIN_GAP of an existing line
            have = np.asarray(mesh.GetLines('xyz'[ax]), float)
            add = [v for v in (phantom_box[0][ax], phantom_box[1][ax]) if not len(have) or np.abs(have - v).min() >= MIN_GAP]
            if add:
                mesh.AddLine('xyz'[ax], [float(v) for v in add])
        mesh.SmoothMeshLines('all', opt.res_phantom, 1.4)
    glo = np.minimum(lo, phantom_box[0] if phantom_file else lo)
    ghi = np.maximum(hi, phantom_box[1] if phantom_file else hi)
    for ax in range(3):
        mesh.AddLine('xyz'[ax], [glo[ax] - opt.air, ghi[ax] + opt.air])
    lam_min = C0 / (f0 + fc) / UNIT
    mesh.SmoothMeshLines('all', lam_min / 40, 1.5)
    check_min_cell(mesh)
    for pl in planes:
        d = CSX.AddDump('Hf_' + pl['name'], dump_type=11, file_type=1, frequency=[f0])
        d.AddBox(pl['start'], pl['stop'])
    ncells = int(np.prod([len(mesh.GetLines('xyz'[ax])) for ax in range(3)]))
    t0 = time.time()
    FDTD.Run(sim_path, cleanup=True, verbose=0)
    return ports, ncells, time.time() - t0


def preflight(case, opt, work, phantom_file, phantom_box, nports):
    """Set the model up once with EVERY port excited and run 5 timesteps, capturing openEMS's console output.
    openEMS only warns (it does not stop) when a port's excitation lands on no grid edge; such a run injects no
    energy and never meets the end criterion. Abort before any long run if that warning appears."""
    import tempfile
    sp = os.path.join(work, 'preflight')
    if os.path.isdir(sp):
        shutil.rmtree(sp)
    sys.stdout.flush(); sys.stderr.flush()
    saved = os.dup(1), os.dup(2)
    with tempfile.TemporaryFile(mode='w+b') as tmp:
        os.dup2(tmp.fileno(), 1); os.dup2(tmp.fileno(), 2)
        try:
            build_and_run(case, list(range(nports)), sp, opt, [], phantom_file, phantom_box, nrts=5)
        finally:
            sys.stdout.flush(); sys.stderr.flush()
            os.dup2(saved[0], 1); os.dup2(saved[1], 2)
            os.close(saved[0]); os.close(saved[1])
        tmp.seek(0)
        log = tmp.read().decode('utf-8', 'replace')
    shutil.rmtree(sp, ignore_errors=True)
    bad = sorted(set(l.strip() for l in log.splitlines() if 'Unused primitive' in l))
    if bad:
        raise RuntimeError('preflight: openEMS dropped part of the model, run aborted: ' + '; '.join(bad))
    print('preflight OK: every port excitation lands on the grid', flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('case')
    ap.add_argument('--res', type=float, default=1.0)
    ap.add_argument('--res_phantom', type=float, default=3.0)
    ap.add_argument('--gap', type=float, default=2.0)
    ap.add_argument('--air', type=float, default=200.0)
    ap.add_argument('--end_crit', type=float, default=1e-4)
    ap.add_argument('--fc_frac', type=float, default=0.5)
    ap.add_argument('--nf', type=int, default=201)
    ap.add_argument('--max_ts', type=float, default=2e6, help='timestep cap per run (MAX_TS, JUDG)')
    ap.add_argument('--wire', default='curve', choices=['curve', 'wire'], help='curve (default since v1.7 dev) or radius-aware wire')
    ap.add_argument('--superpose_check', action='store_true', help='audit M3: one extra run with ports 0 and 1 driven together')
    ap.add_argument('--tag', default='', help='suffix for the output folder (e.g. mesh-sensitivity runs)')
    opt = ap.parse_args()
    opt.case = os.path.abspath(opt.case)          # openEMS changes the working directory during Run()
    case = json.load(open(opt.case))
    name = case['name'] + (('_' + opt.tag) if opt.tag else '')
    out = os.path.join(ROOT, 'sim', 'out', name)
    os.makedirs(out, exist_ok=True)
    work = os.path.join(os.environ.get('KC_SIM_WORK', r'C:\Users\reza\.solvers\work'), name)   # big files outside OneDrive
    os.makedirs(work, exist_ok=True)
    phantom_file, phantom_box = None, None
    if case.get('phantom'):
        phantom_file = os.path.join(work, 'phantom.h5')
        phantom_box = write_phantom(phantom_file, case['phantom'], opt.res_phantom)
    planes = planes_for(case)
    nports = sum(len(e['breaks']) for e in case['elements'])
    f0 = case['f0_Hz']
    freq = np.linspace(f0 * (1 - 0.8 * opt.fc_frac), f0 * (1 + 0.8 * opt.fc_frac), opt.nf)
    S = np.zeros((opt.nf, nports, nports), complex)
    Uinc0 = np.zeros(nports, complex)
    Hplanes = {pl['name']: None for pl in planes}
    plane_mesh = {}
    meta_ports, runs = None, []
    preflight(case, opt, work, phantom_file, phantom_box, nports)
    for j in range(nports):
        sp = os.path.join(work, 'run_%02d' % j)
        if os.path.isdir(sp):
            shutil.rmtree(sp)
        ports, ncells, secs = build_and_run(case, j, sp, opt, planes, phantom_file, phantom_box)
        for p, P in enumerate(ports):
            P['obj'].CalcPort(sp, freq, ref_impedance=Z0)
        uinc_j = ports[j]['obj'].uf_inc
        for p, P in enumerate(ports):
            S[:, p, j] = P['obj'].uf_ref / uinc_j
        Uinc0[j] = np.interp(f0, freq, uinc_j.real) + 1j * np.interp(f0, freq, uinc_j.imag)
        # H-field planes at f0 for this run, normalised to a unit incident voltage wave at port j
        for pl in planes:
            with HDF5Dump(os.path.join(sp, 'Hf_' + pl['name'] + '.h5')) as dump:
                dump.SetPlane('xyz'[pl['axis']], pos=pl['pos'] * UNIT)
                H = dump.GetFieldAtIndex(f_idx=0)
                m = dump.GetMesh(region=True)
            if Hplanes[pl['name']] is None:
                Hplanes[pl['name']] = np.zeros((nports,) + np.asarray(H).shape, complex)
                plane_mesh[pl['name']] = [np.asarray(l) / UNIT for l in m['lines']]
            Hplanes[pl['name']][j] = np.asarray(H) / Uinc0[j]
        meta_ports = [{k: v for k, v in P.items() if k != 'obj'} for P in ports]
        runs.append(dict(port=j, cells=ncells, seconds=secs))
        print('run %d/%d: %d cells, %.0f s' % (j + 1, nports, ncells, secs), flush=True)
        shutil.rmtree(sp, ignore_errors=True)
    save = dict(freq=freq, S=S, Uinc0=Uinc0)
    if opt.superpose_check and nports >= 2:
        # audit M3 (post-hoc check, added after the independent review, before any result was seen): drive ports 0 and 1
        # together in one run; cosim.py compares this field with the superposition of the single-port runs.
        sp = os.path.join(work, 'run_check')
        if os.path.isdir(sp):
            shutil.rmtree(sp)
        ports, ncells, secs = build_and_run(case, [0, 1], sp, opt, planes, phantom_file, phantom_box)
        uinc = []
        for P in ports:
            P['obj'].CalcPort(sp, freq, ref_impedance=Z0)
            u = P['obj'].uf_inc
            uinc.append(np.interp(f0, freq, u.real) + 1j * np.interp(f0, freq, u.imag))
        save['check_Uinc0'] = np.array(uinc)
        for pl in planes:
            with HDF5Dump(os.path.join(sp, 'Hf_' + pl['name'] + '.h5')) as dump:
                dump.SetPlane('xyz'[pl['axis']], pos=pl['pos'] * UNIT)
                save['check_H_' + pl['name']] = np.asarray(dump.GetFieldAtIndex(f_idx=0))
        runs.append(dict(port='check(0+1)', cells=ncells, seconds=secs))
        shutil.rmtree(sp, ignore_errors=True)
        print('superposition check run done', flush=True)
    for k, v in Hplanes.items():
        save['H_' + k] = v
        for ax, lines in enumerate(plane_mesh[k]):
            save['mesh_%s_%d' % (k, ax)] = lines
    np.savez_compressed(os.path.join(out, 'openems.npz'), **save)
    import subprocess
    try:
        git = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT).decode().strip()
        dirty = bool(subprocess.check_output(['git', 'status', '--porcelain', '--', 'sim', 'core', 'tests'], cwd=ROOT).decode().strip())
    except Exception:
        git, dirty = 'unknown', None
    json.dump(dict(case=name, case_file=opt.case, git=git, git_dirty_code=dirty, openems_version=__import__('openEMS').__version__, options=vars(opt), ports=meta_ports, runs=runs,
                   planes=[{k: v for k, v in pl.items()} for pl in planes], f0_Hz=f0,
                   note='S over band; H planes per run normalised to unit incident wave at the driven port (openEMS uf_inc).'),
              open(os.path.join(out, 'openems_meta.json'), 'w'), indent=1, default=lambda o: o.tolist() if hasattr(o, 'tolist') else float(o))
    print('saved', out)


if __name__ == '__main__':
    main()
