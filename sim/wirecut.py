# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
"""Wire cutting at capacitor breaks, shared by the openEMS model (sim/run_openems.py) and the COMSOL export
(sim/export_comsol.py), so both solvers see IDENTICAL port gaps and wire ends (Design v1.10 §6c).
Moved here unchanged from sim/run_openems.py on 2026-10-21 (numpy only; no openEMS needed).

PARAMETERS: MIN_GAP 0.2 mm JUDG - port terminals of different ports closer than this on an axis share one coordinate.
"""
import numpy as np


def axis_of(t):
    a = int(np.argmax(np.abs(t)))
    return a, (1.0 if t[a] >= 0 else -1.0)


def arc_lengths(P):
    d = np.linalg.norm(np.roll(P, -1, axis=0) - P, axis=1)
    return np.concatenate([[0.0], np.cumsum(d)])                  # s[0..n], s[n] = total length (closed)


def cut_wire(P, breaks, gap):
    """Split the closed wire at each break; return wire segments and port terminals.
    Port k runs from A_k (upstream) to B_k (downstream) along the mesh axis closest to the local tangent."""
    P = np.asarray(P, float)
    n = len(P)
    s = arc_lengths(P)
    L = s[-1]
    ports = []
    for b in breaks:
        t = np.asarray(b['t'], float)
        ax, sg = axis_of(t)
        e = np.zeros(3)
        e[ax] = 1.0
        p = np.asarray(b['p'], float)
        sb = s[b['index']] + b['f'] * (s[b['index'] + 1] - s[b['index']])
        delta = 0.5 * gap / max(abs(t[ax]), 0.5)                  # along-wire half-length removed for the gap
        A = np.round(p - sg * 0.5 * gap * e, 3)                     # PORT_ROUND: exact in openEMS's XML export
        B = np.round(p + sg * 0.5 * gap * e, 3)
        ports.append(dict(A=A, B=B, axis=ax, sign=sg, s=sb, delta=delta, p=p))
    ports.sort(key=lambda q: q['s'])
    segs = []
    for k, q in enumerate(ports):
        nxt = ports[(k + 1) % len(ports)]
        s0 = q['s'] + q['delta']
        s1 = nxt['s'] - nxt['delta']
        if s1 <= s0:
            s1 += L
        pts = [q['B']]
        for i in range(n):
            si = s[i]
            for wrap in (0.0, L):
                if s0 < si + wrap < s1:
                    pts.append((si + wrap, P[i]))
        inner = [x[1] for x in sorted([x for x in pts[1:]], key=lambda x: x[0])]
        segs.append([q['B']] + inner + [nxt['A']])
    return segs, ports


MIN_GAP = 0.2       # mm, JUDG: refinement lines closer than this to another line are skipped (no sliver cells)


def cut_all(case, gap):
    """Cut every element's wire at its breaks, then snap port terminals of ALL ports that lie within MIN_GAP of each
    other on an axis onto one shared grid coordinate (2026-10-21: two different ports' terminals 0.005 mm apart made a
    0.005 mm cell). Terminals move by < MIN_GAP; the wire ends move with them (same arrays). Returns [(segs, ports)]."""
    cut = [cut_wire(el['wire'], el['breaks'], gap) for el in case['elements']]
    terms = [v for _, prt in cut for q in prt for v in (q['A'], q['B'])]
    for ax in range(3):
        order = sorted(range(len(terms)), key=lambda i: terms[i][ax])
        anchor = None
        for i in order:
            v = terms[i][ax]
            if anchor is not None and v - anchor < MIN_GAP:
                terms[i][ax] = anchor                                 # in place: segments share these arrays
            else:
                anchor = v
    return cut
