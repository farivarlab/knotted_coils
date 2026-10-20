# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
"""Circuit co-simulation: choose the capacitors, then measure what they do to coupling and B1 (Design.md §6b, v1.7).

WHAT IT DOES (plain language):
  openEMS (sim/run_openems.py) solved the coil(s) once with a 50-ohm port in every capacitor break. Here we "solder in"
  capacitors mathematically, without re-running the field solver:
    * every break except the feed gets a tuning capacitor Ct (same value within an element);
    * the feed break gets a capacitor Cm across it, and a series inductor Lm leads to the receiver (preamp).
  Ct, Cm, Lm are chosen so the element is tuned to the Larmor frequency, matched to 50 ohm, AND so that Lm and Cm
  resonate together: a low-impedance preamp then looks like an open circuit in the loop ("preamp decoupling").
  Then we report: capacitor values (loaded vs unloaded), S11, coupling between elements (bench-style S21 and with
  preamp decoupling), the effective mutual inductance with capacitors vs our quasi-static value, and the B1 map of
  each element computed with the real (capacitor-shaped) currents vs our quasi-static uniform-current map.

METHOD (derivations by Claude; DERIVED):
  Z = Z0 (I + S)(I - S)^-1. Terminating ports o with impedances Z_T reduces the matrix to the kept ports k:
      Z_red = Z_kk - Z_ko (Z_oo + diag Z_T)^-1 Z_ok.
  Matching + preamp decoupling: let Z_c = R + jX be the loop seen at the feed gap (all other gaps terminated). With Cm
  across the gap and Lm in series to a Z0 receiver, the input impedance is X_m^2 / (Z_c - j X_m) when wLm = 1/(wCm) = X_m
  (the preamp-decoupling resonance). Setting that equal to Z0 gives X_m = X and X^2 = Z0 R, i.e. the tuning condition
      X = sqrt(Z0 R)   (solved for Ct by a 1-D root search),   then  Cm = 1/(w X),  Lm = X / w.
  Field superposition: the openEMS run with port j driven gives H_j per unit incident voltage wave; any port state with
  incident waves a_p = (V_p + Z0 I_p)/2 (openEMS convention) has field  H = sum_p a_p H_p.
  B1^- = 0.5 mu0 (Hx - i Hy)  (B0 along z, as in openEMS's MRI_Loop_Coil tutorial). Quasi-static comparison: Magpylib
  Polyline with 1 A (validated against our own code, V14); for a real static field |B1^-| = 0.5 sqrt(Bx^2 + By^2).

PARAMETERS (PARAMETERS.md):
  SIGMA_CU 5.8e7 S/m   CONV: standard copper conductivity (handbook value; not cited)
  Q_CAP 1000           JUDG PLACEHOLDER: capacitor quality factor (ESR = 1/(w C Q))
  Q_IND 100            JUDG PLACEHOLDER: matching inductor quality factor
  Z_PRE 2 ohm          JUDG PLACEHOLDER: preamp input impedance
  PASSES 3             JUDG: array tuning passes
VALIDATED BY: V15, V16, V17 (this script writes their inputs); V18/V19 classify the physics. EXPLORATORY.

USAGE: python sim/cosim.py <case_name>   -> sim/out/<case>/cosim.json, report.html, *.png
"""
import json
import os
import sys

import numpy as np
from scipy.optimize import brentq

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Z0 = 50.0
MU0 = 4e-7 * np.pi
SIGMA_CU = 5.8e7
Q_CAP, Q_IND, Z_PRE, PASSES = 1000.0, 100.0, 2.0, 3


def zc(C, w):
    return 1.0 / (1j * w * C) + 1.0 / (w * C * Q_CAP)


def zl(L, w):
    return 1j * w * L + w * L / Q_IND


def par(a, b):
    return a * b / (a + b)


def s2z(S):
    I = np.eye(S.shape[-1])
    return Z0 * (I + S) @ np.linalg.inv(I - S)


def reduce(Z, keep, Zterm):
    """Keep ports `keep`; terminate all others with impedances Zterm (dict port -> Z)."""
    P = Z.shape[0]
    oth = [p for p in range(P) if p not in keep]
    if not oth:
        return Z[np.ix_(keep, keep)]
    Zoo = Z[np.ix_(oth, oth)] + np.diag([Zterm[p] for p in oth])
    return Z[np.ix_(keep, keep)] - Z[np.ix_(keep, oth)] @ np.linalg.solve(Zoo, Z[np.ix_(oth, keep)])


class Net:
    def __init__(self, case, meta):
        self.case, self.meta = case, meta
        self.E = len(case['elements'])
        self.ports = meta['ports']
        self.feed = [next(i for i, p in enumerate(self.ports) if p['element'] == e and p['feed']) for e in range(self.E)]
        self.tune = [[i for i, p in enumerate(self.ports) if p['element'] == e and not p['feed']] for e in range(self.E)]
        a = case['wire_radius_mm'] * 1e-3
        self.wire_len = [float(np.sum(np.linalg.norm(np.roll(np.asarray(el['wire']), -1, 0) - np.asarray(el['wire']), axis=1))) * 1e-3
                         for el in case['elements']]
        self.a = a
        self.Ct = list(case['firstPassCap_pF'])
        self.Ct = [c * 1e-12 for c in self.Ct]
        self.Cm, self.Lm = [None] * self.E, [None] * self.E
        # thin-wire correction (V15b): openEMS's thin curves behave as wires of radius a_eff (set by the grid, calibrated
        # on the circular loop). The real wire (radius a) has less inductance: dL = (mu0/2pi) * length * ln(a/a_eff).
        self.a_eff = None
        self.dL = [0.0] * self.E

    def set_thin_wire(self, a_eff_m):
        self.a_eff = a_eff_m
        self.dL = [MU0 / (2 * np.pi) * self.wire_len[e] * np.log(self.a / a_eff_m) for e in range(self.E)]

    def r_port(self, e, w):
        """Series impedance per port of element e (all its ports share it equally): copper skin-effect loss, plus the
        thin-wire inductance correction -j w dL (0 until set_thin_wire is called)."""
        Rs = np.sqrt(w * MU0 / (2 * SIGMA_CU))
        n = 1 + len(self.tune[e])
        return self.wire_len[e] * Rs / (2 * np.pi * self.a) / n - 1j * w * self.dL[e] / n

    def feed_load(self, e, w, Zx):
        """Load presented to element e's feed gap by Cm || (Lm + Zx), plus its share of copper loss."""
        return self.r_port(e, w) + par(zc(self.Cm[e], w), zl(self.Lm[e], w) + Zx)

    def terms(self, w, skip_feed_of=None, Zx=Z_PRE, Ct_override=None):
        T = {}
        for e in range(self.E):
            Ct = Ct_override[1] if (Ct_override and Ct_override[0] == e) else self.Ct[e]
            for p in self.tune[e]:
                T[p] = self.r_port(e, w) + zc(Ct, w)
            if e != skip_feed_of:
                T[self.feed[e]] = self.feed_load(e, w, Zx) if self.Cm[e] else 1e9   # untuned feeds: open
        return T

    def zc_feed(self, Z, e, w, Ct):
        T = self.terms(w, skip_feed_of=e, Ct_override=(e, Ct))
        return reduce(Z, [self.feed[e]], T)[0, 0] + self.r_port(e, w)

    def tune_element(self, Z, e, w):
        def g(logC):
            z = self.zc_feed(Z, e, w, 10 ** logC)
            return z.imag - np.sqrt(Z0 * max(z.real, 1e-12))
        grid = np.linspace(np.log10(0.05e-12), np.log10(2e-9), 240)
        vals = [g(x) for x in grid]
        roots = []
        for i in range(len(grid) - 1):
            if np.sign(vals[i]) != np.sign(vals[i + 1]) and np.isfinite(vals[i]) and np.isfinite(vals[i + 1]):
                r = brentq(g, grid[i], grid[i + 1])
                z = self.zc_feed(Z, e, w, 10 ** r)
                if z.imag > 0 and z.real > 0:                     # inductive branch with positive loss: physical match
                    roots.append(r)
        if not roots:
            return False
        ref = np.log10(self.Ct[e])
        r = min(roots, key=lambda x: abs(x - ref))               # the solution nearest the first-pass value
        self.Ct[e] = 10 ** r
        X = self.zc_feed(Z, e, w, self.Ct[e]).imag
        self.Cm[e], self.Lm[e] = 1.0 / (w * X), X / w
        return True

    def tune_all(self, Z, w):
        ok = True
        for e in range(self.E):                                  # first estimates of Cm, Lm so others can be terminated
            self.Cm[e] = self.Ct[e]
            self.Lm[e] = 1.0 / (w * w * self.Cm[e])
        for _ in range(PASSES):
            ok = all([self.tune_element(Z, e, w) for e in range(self.E)])
        return ok

    def feed_matrix(self, Z, w):
        """Impedance matrix between feed gaps with all tuning capacitors in place (loops only, no Cm/Lm)."""
        T = {}
        for e in range(self.E):
            for p in self.tune[e]:
                T[p] = self.r_port(e, w) + zc(self.Ct[e], w)
        ZF = reduce(Z, self.feed, T)
        return ZF + np.diag([self.r_port(e, w) for e in range(self.E)])

    def external(self, Z, w):
        """Impedance matrix at the receiver side of Lm (S-parameters a bench would measure)."""
        ZF = self.feed_matrix(Z, w)
        Y = np.linalg.inv(ZF) + np.diag([1.0 / zc(self.Cm[e], w) for e in range(self.E)])
        return np.linalg.inv(Y) + np.diag([zl(self.Lm[e], w) for e in range(self.E)]), ZF

    def solve_ports(self, Z, w, drive, Zx_others):
        """All solver-port currents/voltages when element `drive`'s receiver is driven by a Z0 source with 1 W available
        power, the other receivers terminated by Zx_others."""
        P = Z.shape[0]
        Vs = np.sqrt(8 * Z0)                                     # peak phasor: available power |Vs|^2/(8 Z0) = 1 W
        Zl = np.zeros(P, complex)
        Vth = np.zeros(P, complex)
        for e in range(self.E):
            for p in self.tune[e]:
                Zl[p] = self.r_port(e, w) + zc(self.Ct[e], w)
            Zx = Z0 if e == drive else Zx_others
            Zl[self.feed[e]] = self.feed_load(e, w, Zx)
            if e == drive:
                Zcm = zc(self.Cm[e], w)
                Vth[self.feed[e]] = Vs * Zcm / (Zcm + zl(self.Lm[e], w) + Z0)
        I = np.linalg.solve(Z + np.diag(Zl), Vth)
        V = Z @ I
        return V, I


def interp_S(freq, S, f):
    k = np.searchsorted(freq, f)
    k = min(max(k, 1), len(freq) - 1)
    t = (f - freq[k - 1]) / (freq[k] - freq[k - 1])
    return S[k - 1] * (1 - t) + S[k] * t


def b1_quasistatic(wire_mm, X, Y, Zc):
    import magpylib as magpy
    verts = np.vstack([wire_mm, wire_mm[:1]]) * 1e-3
    pts = np.stack([X.ravel(), Y.ravel(), Zc.ravel()], axis=1) * 1e-3
    B = magpy.current.Polyline(vertices=verts, current=1.0).getB(pts)
    return (0.5 * np.sqrt(B[:, 0] ** 2 + B[:, 1] ** 2)).reshape(X.shape)


def main(name):
    out = os.path.join(ROOT, 'sim', 'out', name)
    meta = json.load(open(os.path.join(out, 'openems_meta.json')))
    case = json.load(open(meta.get('case_file') or os.path.join(ROOT, 'sim', 'cases', name + '.json')))
    D = np.load(os.path.join(out, 'openems.npz'))
    freq, S = D['freq'], D['S']
    f0 = case['f0_Hz']
    w0 = 2 * np.pi * f0
    res = dict(case=name, B0_T=case['B0_T'], f0_MHz=f0 / 1e6, loaded=bool(case.get('phantom')),
               tissue_source=(case['phantom']['tissue']['source'] if case.get('phantom') else None),
               parameters=dict(SIGMA_CU=SIGMA_CU, Q_CAP=Q_CAP, Q_IND=Q_IND, Z_PRE=Z_PRE, PASSES=PASSES))
    # ---- V16 inputs: passivity and reciprocity of the extracted S over the band
    smax = float(max(np.linalg.svd(Sf, compute_uv=False)[0] for Sf in S))
    recip = float(max(np.abs(Sf - Sf.T).max() for Sf in S))
    res['V16'] = dict(max_singular_value=smax, max_reciprocity_error=recip)
    Z = s2z(interp_S(freq, S, f0))
    net = Net(case, meta)
    # ---- thin-wire calibration (loop case) or correction (all other cases), per grid resolution and wire primitive
    calib_file = os.path.join(ROOT, 'sim', 'out', 'thinwire_calibration.json')
    calib = json.load(open(calib_file)) if os.path.exists(calib_file) else {}
    ckey = 'res%s_%s' % (meta['options'].get('res'), meta['options'].get('wire', 'wire'))
    if case.get('purpose') == 'V15':
        ZF0 = net.feed_matrix(Z, w0)
        L_raw = (ZF0[0, 0].imag + len(net.tune[0]) / (w0 * net.Ct[0])) / w0
        W = np.asarray(case['elements'][0]['wire']) * 1e-3
        Rl = float(np.mean(np.linalg.norm(W - W.mean(0), axis=1)))
        a_eff = 8 * Rl * np.exp(-(L_raw / (MU0 * Rl) + 2))          # invert Rosa & Grover eq. [62] (leading term)
        calib[ckey] = dict(a_eff_mm=a_eff * 1e3, L_raw_nH=L_raw * 1e9, loop_R_mm=Rl * 1e3, from_case=name)
        json.dump(calib, open(calib_file, 'w'), indent=1)
        res['thin_wire_calibration'] = calib[ckey]
    elif ckey in calib:
        net.set_thin_wire(calib[ckey]['a_eff_mm'] * 1e-3)
        res['thin_wire_correction'] = dict(key=ckey, a_eff_mm=calib[ckey]['a_eff_mm'], dL_nH=[d * 1e9 for d in net.dL])
    else:
        res['thin_wire_correction'] = 'NONE: no calibration for %s (run the loop case at this grid first)' % ckey
    # ---- V15 input (loop case): resonance with the first-pass capacitors in every break
    if case.get('purpose') == 'V15':
        Cfp = case['firstPassCap_pF'][0] * 1e-12
        fs = np.linspace(freq[0], freq[-1], 4001)
        imag = []
        for f in fs:
            w = 2 * np.pi * f
            Zf = s2z(interp_S(freq, S, f))
            T = {p: zc(Cfp, w) for p in net.tune[0]}
            z = reduce(Zf, [net.feed[0]], T)[0, 0] + zc(Cfp, w)
            imag.append(z.imag)
        imag = np.array(imag)
        sc = np.where(np.sign(imag[:-1]) != np.sign(imag[1:]))[0]
        fr = [fs[i] - imag[i] * (fs[i + 1] - fs[i]) / (imag[i + 1] - imag[i]) for i in sc]
        fres = min(fr, key=lambda x: abs(x - f0)) if fr else None
        res['V15'] = dict(first_pass_C_pF=Cfp * 1e12, predicted_MHz=f0 / 1e6, resonance_MHz=(fres / 1e6 if fres else None),
                          rel_err=((fres - f0) / f0 if fres else None))
    # ---- choose the capacitors
    ok = net.tune_all(Z, w0)
    res['tuned'] = ok
    if not ok:
        json.dump(res, open(os.path.join(out, 'cosim.json'), 'w'), indent=1)
        print('TUNING FAILED', name)
        return res
    Zext, ZF = net.external(Z, w0)
    Sext = (Zext - Z0 * np.eye(net.E)) @ np.linalg.inv(Zext + Z0 * np.eye(net.E))
    def s11_preamp(e):
        o = [k for k in range(net.E) if k != e]
        zin = Zext[e, e] if not o else Zext[e, e] - Zext[np.ix_([e], o)] @ np.linalg.solve(Zext[np.ix_(o, o)] + Z_PRE * np.eye(len(o)), Zext[np.ix_(o, [e])])
        zin = complex(np.asarray(zin).ravel()[0])
        return float(20 * np.log10(abs((zin - Z0) / (zin + Z0)) + 1e-300))
    res['elements'] = [dict(S11_neighbours_preamp_dB=s11_preamp(e), Ct_pF=net.Ct[e] * 1e12, Cm_pF=net.Cm[e] * 1e12, Lm_nH=net.Lm[e] * 1e9, first_pass_Ct_pF=case['firstPassCap_pF'][e],
                            S11_dB=float(20 * np.log10(abs(Sext[e, e]) + 1e-300)), R_loop_ohm=float(ZF[e, e].real),
                            # loop inductance seen by the full-wave model: add back the tuning capacitors' series reactance
                            L_fullwave_corrected_nH=float((ZF[e, e].imag + len(net.tune[e]) / (w0 * net.Ct[e])) / w0 * 1e9),
                            L_fullwave_raw_nH=float((ZF[e, e].imag + len(net.tune[e]) / (w0 * net.Ct[e])) / w0 * 1e9 + net.dL[e] * 1e9),
                            L_quasistatic_nH=float(case['quasistatic']['L_nH'][e])) for e in range(net.E)]
    if net.a_eff is not None:                                     # V15b input: corrected full-wave L vs quasi-static L
        res['V15b'] = [dict(element=e, L_corrected_nH=r['L_fullwave_corrected_nH'], L_quasistatic_nH=r['L_quasistatic_nH'],
                            rel_err=(r['L_fullwave_corrected_nH'] - r['L_quasistatic_nH']) / r['L_quasistatic_nH'])
                       for e, r in enumerate(res['elements'])]
    # V17 verdict: S11 in the operating state (neighbours preamp-terminated, as during tuning). Chosen and documented
    # before any pair result existed (audit M6); S11 with neighbours on 50 ohm is also reported.
    res['V17'] = dict(max_S11_dB=float(max(r['S11_neighbours_preamp_dB'] for r in res['elements'])),
                      max_S11_neighbours_50ohm_dB=float(max(r['S11_dB'] for r in res['elements'])),
                      all_positive=bool(all(v > 0 and np.isfinite(v) for e in range(net.E) for v in (net.Ct[e], net.Cm[e], net.Lm[e]))))
    # S11 over the band
    s11_band = []
    for f in freq:
        w = 2 * np.pi * f
        Ze, _ = net.external(s2z(interp_S(freq, S, f)), w)
        Se = (Ze - Z0 * np.eye(net.E)) @ np.linalg.inv(Ze + Z0 * np.eye(net.E))
        s11_band.append([abs(Se[e, e]) for e in range(net.E)] + ([abs(Se[0, 1])] if net.E > 1 else []))
    s11_band = np.array(s11_band)
    # ---- coupling with capacitors (pairs)
    if net.E > 1:
        qs = case['quasistatic']
        V, Ip = net.solve_ports(Z, w0, 0, Z_PRE)
        V50, I50 = net.solve_ports(Z, w0, 0, Z0)
        il_pre = abs(Ip[net.feed[1]] / Ip[net.feed[0]])
        il_50 = abs(I50[net.feed[1]] / I50[net.feed[0]])
        res['coupling'] = dict(S21_dB=float(20 * np.log10(abs(Sext[0, 1]))),
                               loop_current_ratio_50ohm_dB=float(20 * np.log10(il_50)),
                               loop_current_ratio_preamp_dB=float(20 * np.log10(il_pre)),
                               preamp_decoupling_gain_dB=float(20 * np.log10(il_50 / il_pre)),
                               M_eff_nH=float(ZF[0, 1].imag / w0 * 1e9), R_mutual_ohm=float(ZF[0, 1].real),
                               M_quasistatic_nH=float(qs['M_nH'][0][1]),
                               k_quasistatic=float(qs['M_nH'][0][1] / np.sqrt(qs['L_nH'][0] * qs['L_nH'][1])),
                               spacing_mm=case.get('spacing_mm'), d0_flat_mm=case.get('d0_flat_mm'),
                               k_quasistatic_on_helmet=case.get('k_quasistatic_on_helmet'),
                               sign_agrees_M_eff_vs_quasistatic=bool(np.sign(ZF[0, 1].imag) == np.sign(qs['M_nH'][0][1])))
    # ---- B1 with the real (capacitor-shaped) currents vs quasi-static uniform current
    b1 = {}
    ph = case.get('phantom')
    for pl in meta['planes']:
        H = D['H_' + pl['name']]                                 # (P, 3, n1, n2) per unit incident wave
        lines = [D['mesh_%s_%d' % (pl['name'], ax)] for ax in range(3)]
        ax_keep = [a for a in range(3) if a != pl['axis']]
        g1, g2 = np.meshgrid(lines[ax_keep[0]], lines[ax_keep[1]], indexing='ij')
        XYZ = [None] * 3
        XYZ[ax_keep[0]], XYZ[ax_keep[1]] = g1, g2
        XYZ[pl['axis']] = np.full(g1.shape, pl['pos'])
        X, Y, Zc_ = XYZ
        if ph:
            a, b, c = ph['axes']
            rho = np.sqrt((X / a) ** 2 + (Y / b) ** 2 + (Zc_ / c) ** 2)
            inside = (rho <= 1) & (Zc_ >= ph['zMin'])
            depth = np.sqrt(X ** 2 + Y ** 2 + Zc_ ** 2) * (1 - rho) / np.maximum(rho, 1e-9)   # along the ray from the centre
            depth = np.minimum(depth, Zc_ - ph['zMin'])                  # audit M14: the neck cut is also a surface
        else:
            inside = np.ones(X.shape, bool)
            depth = None
        per_el = []
        for e in range(net.E):
            V, I = net.solve_ports(Z, w0, e, Z_PRE)
            a_inc = (V + Z0 * I) / 2
            Hs = np.tensordot(a_inc, H, axes=(0, 0))             # (3, n1, n2)
            b1m = np.abs(0.5 * MU0 * (Hs[0] - 1j * Hs[1]))
            qsm = b1_quasistatic(np.asarray(case['elements'][e]['wire']), X, Y, Zc_)
            rec = dict(element=e)
            if ph:
                fw_n = b1m / b1m[inside].max()
                qs_n = qsm / qsm[inside].max()
                rel = np.abs(qs_n - fw_n) / np.maximum(fw_n, 1e-12)
                near = inside & (depth <= 20)
                rec['V18_max_rel_diff_within_20mm'] = float(rel[near].max()) if near.any() else None
                bins = np.arange(0, 120, 2.0)
                bd = None
                for d0 in bins:
                    sel = inside & (depth >= d0) & (depth < d0 + 2)
                    if sel.sum() >= 5 and np.percentile(rel[sel], 90) > 0.2:
                        bd = float(d0)
                        break
                rec['breakdown_depth_mm'] = bd
                rec['n_points_within_20mm'] = int(near.sum())
                # audit M7 (information only; the registered V18 verdict above is unchanged): normalise both maps by
                # their median over 20-40 mm depth instead of the single in-plane maximum
                mid = inside & (depth >= 20) & (depth <= 40)
                if mid.sum() >= 5:
                    fr = b1m / np.median(b1m[mid]); qr = qsm / np.median(qsm[mid])
                    rr = np.abs(qr - fr) / np.maximum(fr, 1e-12)
                    rec['info_robust_max_rel_diff_within_20mm'] = float(rr[near].max()) if near.any() else None
                    rec['info_robust_median_rel_diff_within_20mm'] = float(np.median(rr[near])) if near.any() else None
                np.savez_compressed(os.path.join(out, 'b1_%s_e%d.npz' % (pl['name'], e)), X=X, Y=Y, Z=Zc_, fullwave=b1m, quasistatic=qsm, inside=inside)
            per_el.append(rec)
        b1[pl['name']] = per_el
    res['B1'] = b1
    if ph and net.E == 1:
        vals = [r['V18_max_rel_diff_within_20mm'] for pl in b1.values() for r in pl if r.get('V18_max_rel_diff_within_20mm') is not None]
        res['V18'] = dict(max_rel_diff_within_20mm=max(vals) if vals else None,
                          breakdown_depths_mm={k: [r['breakdown_depth_mm'] for r in v] for k, v in b1.items()})
    if not res['loaded']:
        res['warning_air'] = ('In air the loop resistance is copper only (%.3g ohm); FDTD noise in Re(Z) can dominate, so the '
                              'air Cm/Lm values have low precision (audit M15).' % min(r['R_loop_ohm'] for r in res['elements']))
    # audit M3: superposition check (field of ports 0+1 driven together vs superposed single-port fields)
    if 'check_Uinc0' in D.files:
        chk = {}
        for pl in meta['planes']:
            Hd = D['check_H_' + pl['name']]
            Hsup = np.tensordot(D['check_Uinc0'], D['H_' + pl['name']], axes=(0, 0))
            num = np.linalg.norm((Hd - Hsup).ravel()); den = np.linalg.norm(Hd.ravel())
            chk[pl['name']] = float(num / den)
        res['check_superposition_rel_err'] = chk
    import subprocess
    try:
        res['git'] = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT).decode().strip()
        res['git_dirty_code'] = bool(subprocess.check_output(['git', 'status', '--porcelain', '--', 'sim', 'core', 'tests'], cwd=ROOT).decode().strip())
    except Exception:
        res['git'] = 'unknown'
    res['openems_meta'] = dict(git=meta.get('git'), options=meta.get('options'), openems_version=meta.get('openems_version'))
    json.dump(res, open(os.path.join(out, 'cosim.json'), 'w'), indent=1)
    try:
        plots(out, name, freq, s11_band, f0, net.E, res)
    except Exception as ex:                                      # plotting must not hide results
        print('plot error', ex)
    print(json.dumps({k: res[k] for k in res if k in ('V15', 'V16', 'V17', 'V18', 'coupling', 'elements')}, indent=1))
    return res


def plots(out, name, freq, s11, f0, E, res):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(6, 3.6))
    for e in range(E):
        ax.plot(freq / 1e6, 20 * np.log10(s11[:, e]), label='S11 element %d' % e)
    if E > 1:
        ax.plot(freq / 1e6, 20 * np.log10(s11[:, E]), label='S21', lw=2)
    ax.axvline(f0 / 1e6, color='k', ls=':')
    ax.set_xlabel('Frequency (MHz)'); ax.set_ylabel('dB'); ax.legend(); ax.grid(True); ax.set_title(name)
    fig.tight_layout(); fig.savefig(os.path.join(out, 'sparams.png'), dpi=110); plt.close(fig)
    for f in os.listdir(out):
        if f.startswith('b1_') and f.endswith('.npz'):
            d = np.load(os.path.join(out, f))
            ins = d['inside']
            fw = np.where(ins, d['fullwave'] / d['fullwave'][ins].max(), np.nan)
            qs = np.where(ins, d['quasistatic'] / d['quasistatic'][ins].max(), np.nan)
            fig, axs = plt.subplots(1, 3, figsize=(11, 3.6))
            for a_, img, t in zip(axs, [fw, qs, qs / fw], ['full-wave (capacitors, head)', 'quasi-static (uniform current)', 'ratio quasi-static / full-wave']):
                if 'ratio' in t:
                    im = a_.imshow(img.T, origin='lower', cmap='coolwarm', vmin=0.5, vmax=1.5)
                else:
                    im = a_.imshow(20 * np.log10(img.T), origin='lower', cmap='viridis', vmin=-30, vmax=0)
                a_.set_title(t, fontsize=9); a_.set_xticks([]); a_.set_yticks([]); fig.colorbar(im, ax=a_, fraction=0.046)
            fig.suptitle(f.replace('.npz', '') + ' — |B1-| normalised in the head (dB); exploratory', fontsize=9)
            fig.tight_layout(); fig.savefig(os.path.join(out, f.replace('.npz', '.png')), dpi=110); plt.close(fig)


if __name__ == '__main__':
    main(sys.argv[1])
