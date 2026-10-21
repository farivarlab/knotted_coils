# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
"""Build, solve and extract a coil case in COMSOL through MPh (Design v1.10 §6c). STATUS: UNVALIDATED.

WHAT IT DOES (plain language):
  Reads the files written by sim/export_comsol.py (sim/comsol/<case>/) and, through MPh (a Python interface to
  COMSOL; v1.4.0, MIT licence, John Hennig; needs a licensed COMSOL with the RF Module), builds:
    - every wire segment as a curve treated as a perfect electric conductor (PEC) edge;
    - every capacitor gap as a small rectangular face (as wide as the wire) carrying a 50-ohm lumped port;
    - the three-layer head phantom (nested ellipsoids, neck cut) with the tissue values from phantom.json;
    - an air sphere with a scattering (absorbing) outer boundary.
  It then solves the frequency band once per port (that port excited, all others resting on 50 ohm), reads every
  lumped port's voltage and current, and assembles the S-matrix exactly the way sim/run_openems.py does
  (a = (V + Z0 I)/2, b = (V - Z0 I)/2, S_ij = b_i / a_j). It writes sim/out/<case>_comsol/comsol.npz and
  comsol_meta.json in the same layout as openEMS's output, so `python sim/cosim.py <case> --solver comsol` chooses the
  capacitors the same way (B1 maps are not exported from COMSOL in v1.10).

WHY IT IS UNVALIDATED: it was written without access to COMSOL. Every COMSOL feature and property name below comes
  from the COMSOL Java API as recalled by Claude (Anthropic) and is marked UNVERIFIED. MPh's own entry points
  (mph.start, client.create, model.java, model.save) were checked against the MPh 1.4.0 source. Before trusting any
  result: open the saved .mph file in the COMSOL GUI, check geometry, selections, port orientation and mesh, and run
  check V25 (COMSOL vs openEMS on loop_air_3T and trefoil_air_3T). Record the COMSOL version and every manual fix.

USAGE:
  python sim/comsol_build_mph.py <case> --dry-run     # no COMSOL: checks the files, writes build_plan.txt (every call)
  python sim/comsol_build_mph.py <case>               # builds, saves sim/out/<case>_comsol/model.mph, solves, extracts
  options: --nf 41 (frequencies), --fc_frac 0.5 (band = f0 (1 +- 0.8 fc_frac), same as openEMS), --air 150 (mm),
           --hmax_wire 1.0 (mm), --no-solve (build and save only), --cores N

PARAMETERS (also PARAMETERS.md): Z0 50 ohm (CONV); band and NF as sim/run_openems.py (CONV within this project);
  AIR 150 mm sphere margin (JUDG); HMAX_WIRE 1 mm max mesh size on wires (JUDG; same scale as the openEMS grid).
"""
import argparse
import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Z0 = 50.0


class Recorder:
    """Stand-in for the COMSOL Java model in --dry-run: records every attribute access and call as text."""
    def __init__(self, log, path='model'):
        self._log, self._path = log, path

    def __getattr__(self, name):
        return Recorder(self._log, self._path + '.' + name)

    def __call__(self, *args):
        def short(a):
            if isinstance(a, (list, tuple)) and len(a) > 6:
                return '[%d items]' % len(a)
            return repr(a)
        p = '%s(%s)' % (self._path, ', '.join(short(a) for a in args))
        self._log.append(p)
        return Recorder(self._log, p)


def load(case):
    d = os.path.join(ROOT, 'sim', 'comsol', case)
    meta = json.load(open(os.path.join(d, 'meta.json')))
    phantom = json.load(open(os.path.join(d, 'phantom.json')))
    rows = np.genfromtxt(os.path.join(d, 'ports.csv'), delimiter=',', names=True)
    rows = np.atleast_1d(rows)
    ports = [dict(port=int(r['port']), element=int(r['element']), k=int(r['k']), feed=bool(r['feed']),
                  A=[r['Ax'], r['Ay'], r['Az']], B=[r['Bx'], r['By'], r['Bz']], axis=int(r['axis']), sign=float(r['sign']),
                  u=[r['ux'], r['uy'], r['uz']]) for r in rows]
    segs = [dict(s, pts=np.loadtxt(os.path.join(d, s['file']), ndmin=2)) for s in meta['segments']]
    # consistency checks (also the whole of --dry-run's file validation)
    assert len(ports) == meta['n_ports'], 'ports.csv rows != meta n_ports'
    for s in segs:
        assert s['pts'].shape[1] == 3 and len(s['pts']) >= 2, s['file']
        assert np.allclose(s['pts'][0], s['start']) and np.allclose(s['pts'][-1], s['end']), s['file'] + ' endpoints'
    ends = [tuple(np.round(s['pts'][0], 6)) for s in segs] + [tuple(np.round(s['pts'][-1], 6)) for s in segs]
    terms = [tuple(np.round(p['A'], 6)) for p in ports] + [tuple(np.round(p['B'], 6)) for p in ports]
    assert sorted(ends) == sorted(terms), 'every wire end must sit on a port terminal (and vice versa)'
    return d, meta, phantom, ports, segs


def build(j, meta, phantom, ports, segs, opt, darr):
    """All COMSOL API calls. j = model.java (real) or Recorder (dry run). darr: converts nested lists to a Java
    double[][] in real mode. Every feature/property name here is UNVERIFIED (see module docstring)."""
    f0 = meta['f0_Hz']
    a = meta['wire_radius_mm']
    j.component().create('comp1', True)
    g = j.component('comp1').geom().create('geom1', 3)
    g.lengthUnit('mm')                                                         # UNVERIFIED
    g.selection().create('csel_wire', 'CumulativeSelection')                   # UNVERIFIED
    for s in segs:                                                             # wires: open interpolation curves
        tag = 'ic_e%d_%d' % (s['element'], s['k'])
        ic = g.create(tag, 'InterpolationCurve')                               # UNVERIFIED
        ic.set('source', 'table')                                              # UNVERIFIED
        ic.set('table', darr(s['pts'].tolist()))                               # UNVERIFIED
        ic.set('type', 'open')                                                 # UNVERIFIED
        ic.set('contributeto', 'csel_wire')                                    # UNVERIFIED
    for p in ports:                                                            # port faces: A->B by width along u
        tag = 'ps_p%d' % p['port']
        A, B, u, w = np.asarray(p['A']), np.asarray(p['B']), np.asarray(p['u']), 2 * a
        ps = g.create(tag, 'ParametricSurface')                                # UNVERIFIED
        ps.set('parmin1', 0); ps.set('parmax1', 1); ps.set('parmin2', -0.5); ps.set('parmax2', 0.5)   # UNVERIFIED
        ps.set('coord', ['%.6f+s1*(%.6f)+s2*%.6f' % (A[i], B[i] - A[i], w * u[i]) for i in range(3)])  # UNVERIFIED
        ps.set('selresult', True)                                              # UNVERIFIED (selection geom1_<tag>_bnd)
    R = 0.0
    for s in segs:
        R = max(R, float(np.linalg.norm(s['pts'], axis=1).max()))
    if phantom:
        ax = phantom['semi_axes_mm']
        R = max(R, max(ax))
        sk, sl = phantom['skin_mm'], phantom['skull_mm']
        for name, d in (('skin', 0.0), ('skull', sk), ('brain', sk + sl)):
            el = g.create('ell_' + name, 'Ellipsoid')                          # UNVERIFIED
            el.set('semiaxes', [ax[0] - d, ax[1] - d, ax[2] - d])              # UNVERIFIED
            el.set('pos', phantom['centre_mm'])                                # UNVERIFIED
            el.set('selresult', True)                                          # UNVERIFIED
        cut = g.create('blk_neck', 'Block')                                    # UNVERIFIED: removes tissue below the neck cut
        big = 3 * max(ax)
        cut.set('size', [2 * big, 2 * big, big]); cut.set('pos', [-big, -big, phantom['neck_cut_z_mm'] - big])   # UNVERIFIED
        dif = g.create('dif_neck', 'Difference')                               # UNVERIFIED
        dif.selection('input').set(['ell_skin', 'ell_skull', 'ell_brain'])    # UNVERIFIED
        dif.selection('input2').set(['blk_neck'])                              # UNVERIFIED
        dif.set('keep', False)                                                 # UNVERIFIED
    sph = g.create('sph_air', 'Sphere')                                        # air domain
    sph.set('r', R + opt.air)                                                  # UNVERIFIED
    sph.set('selresult', True)                                                 # UNVERIFIED
    g.run()                                                                    # form union (default finalisation)
    # materials: air everywhere, then skin, skull, brain (later assignments override earlier ones)
    mats = [('mat_air', 'all', 1.0, 0.0)]
    if phantom:
        T = phantom['tissue']
        mats += [('mat_skin', 'geom1_ell_skin_dom', T['skin']['epsR'], T['skin']['sigma_S_per_m']),
                 ('mat_skull', 'geom1_ell_skull_dom', T['skull']['epsR'], T['skull']['sigma_S_per_m']),
                 ('mat_brain', 'geom1_ell_brain_dom', T['brain']['epsR'], T['brain']['sigma_S_per_m'])]
    for tag, sel, eps, sig in mats:
        m = j.component('comp1').material().create(tag, 'Common')              # UNVERIFIED
        if sel == 'all':
            m.selection().all()                                                # UNVERIFIED
        else:
            m.selection().named(sel)                                           # UNVERIFIED
        pg = m.propertyGroup('def')                                            # UNVERIFIED
        pg.set('relpermittivity', [str(eps)]); pg.set('relpermeability', ['1']); pg.set('electricconductivity', [str(sig)])   # UNVERIFIED
    # physics: RF Module, electromagnetic waves, frequency domain
    emw = j.component('comp1').physics().create('emw', 'ElectromagneticWaves', 'geom1')   # UNVERIFIED
    pec = emw.create('pec_wire', 'PerfectElectricConductor', 1)                # UNVERIFIED: edge-level PEC (dimension 1)
    pec.selection().named('geom1_csel_wire_edg')                               # UNVERIFIED
    for p in ports:
        lp = emw.create('lport%d' % p['port'], 'LumpedPort', 2)                # UNVERIFIED
        lp.selection().named('geom1_ps_p%d_bnd' % p['port'])                   # UNVERIFIED
        lp.set('PortType', 'Uniform')                                          # UNVERIFIED
        lp.set('Zref', str(Z0))                                                # UNVERIFIED
        lp.set('PortExcitation', 'off')                                        # UNVERIFIED; switched on per run below
        # ORIENTATION (check in the GUI): the port's voltage must run from terminal A to terminal B, the direction
        # used for the openEMS ports; set the port's direction/edge so that it does.
    sbc = emw.create('sctr', 'Scattering', 2)                                  # UNVERIFIED
    sbc.selection().named('geom1_sph_air_bnd')                                 # UNVERIFIED (outer boundary of the air sphere)
    # mesh: physics-controlled, plus a size limit on the wires
    mesh = j.component('comp1').mesh().create('mesh1')                         # UNVERIFIED
    sz = mesh.create('size_wire', 'Size')                                      # UNVERIFIED
    sz.selection().geom('geom1', 1); sz.selection().named('geom1_csel_wire_edg')   # UNVERIFIED
    sz.set('custom', True); sz.set('hmaxactive', True); sz.set('hmax', str(opt.hmax_wire))   # UNVERIFIED
    mesh.create('ftet', 'FreeTet')                                             # UNVERIFIED
    mesh.run()
    # study: frequency domain over the same band as openEMS
    f1, f2 = f0 * (1 - 0.8 * opt.fc_frac), f0 * (1 + 0.8 * opt.fc_frac)
    std = j.study().create('std1')
    fr = std.create('freq', 'Frequency')                                       # UNVERIFIED
    fr.set('plist', 'range(%.6e,%.6e,%.6e)' % (f1, (f2 - f1) / (opt.nf - 1), f2))   # UNVERIFIED
    return dict(f1=f1, f2=f2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('case')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--no-solve', action='store_true')
    ap.add_argument('--nf', type=int, default=41)
    ap.add_argument('--fc_frac', type=float, default=0.5)
    ap.add_argument('--air', type=float, default=150.0)
    ap.add_argument('--hmax_wire', type=float, default=1.0)
    ap.add_argument('--cores', type=int, default=None)
    opt = ap.parse_args()
    d, meta, phantom, ports, segs = load(opt.case)
    out = os.path.join(ROOT, 'sim', 'out', opt.case + '_comsol')
    if opt.dry_run:
        log = []
        band = build(Recorder(log), meta, phantom, ports, segs, opt, lambda x: x)
        plan = os.path.join(d, 'build_plan.txt')
        with open(plan, 'w') as fh:
            fh.write('# DRY RUN of sim/comsol_build_mph.py for %s: every COMSOL API call the real run would make.\n' % opt.case)
            fh.write('# Then, per port p = 1..%d: switch PortExcitation on for port p only, solve std1, read emw.Vport_<i>\n'
                     '# and emw.Iport_<i> for every port over the band (UNVERIFIED variable names), assemble S.\n' % len(ports))
            fh.write('\n'.join(log) + '\n')
        print('dry run OK:', len(segs), 'wire segments,', len(ports), 'ports, phantom', 'yes' if phantom else 'no',
              '| band %.3f-%.3f MHz, %d points | %d API calls -> %s' % (band['f1'] / 1e6, band['f2'] / 1e6, opt.nf, len(log), plan))
        return
    import mph                                                                 # needs MPh + a licensed COMSOL
    import jpype
    client = mph.start(cores=opt.cores)
    model = client.create(opt.case)
    j = model.java
    darr = lambda x: jpype.JArray(jpype.JDouble, 2)(x)
    band = build(j, meta, phantom, ports, segs, opt, darr)
    os.makedirs(out, exist_ok=True)
    model.save(os.path.join(out, 'model.mph'))
    if opt.no_solve:
        print('built and saved (not solved):', os.path.join(out, 'model.mph'))
        return
    P = len(ports)
    freq = np.linspace(band['f1'], band['f2'], opt.nf)
    S = np.zeros((opt.nf, P, P), complex)
    emw = j.component('comp1').physics('emw')
    for jdrv in range(P):
        for p in ports:
            emw.feature('lport%d' % p['port']).set('PortExcitation', 'on' if p['port'] == jdrv + 1 else 'off')   # UNVERIFIED
        model.solve('std1')
        V = np.array([np.asarray(model.evaluate('emw.Vport_%d' % p['port'])) for p in ports])   # UNVERIFIED names
        I = np.array([np.asarray(model.evaluate('emw.Iport_%d' % p['port'])) for p in ports])
        a_in, b_out = (V + Z0 * I) / 2, (V - Z0 * I) / 2          # same wave convention as sim/run_openems.py
        for i in range(P):
            S[:, i, jdrv] = b_out[i] / a_in[jdrv]
        print('port %d/%d solved' % (jdrv + 1, P), flush=True)
    np.savez_compressed(os.path.join(out, 'comsol.npz'), freq=freq, S=S, Uinc0=np.ones(P, complex))
    import subprocess
    try:
        git = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT).decode().strip()
    except Exception:
        git = 'unknown'
    json.dump(dict(case=opt.case, case_file=os.path.join(ROOT, meta['case_file']), git=git, solver='COMSOL via MPh',
                   comsol_version=str(client.version), options=dict(vars(opt), res='comsol', wire='pec_edge'),
                   ports=[dict(element=p['element'], k=p['k'], feed=p['feed'], axis=p['axis'], sign=p['sign'],
                               A=p['A'], B=p['B']) for p in ports],
                   runs=[dict(port=i) for i in range(P)], planes=[], f0_Hz=meta['f0_Hz'],
                   note='UNVALIDATED (Design v1.10 §6c, V25). S from lumped-port V and I, a=(V+Z0 I)/2, b=(V-Z0 I)/2.'),
              open(os.path.join(out, 'comsol_meta.json'), 'w'), indent=1, default=float)
    print('saved', out)


if __name__ == '__main__':
    main()
