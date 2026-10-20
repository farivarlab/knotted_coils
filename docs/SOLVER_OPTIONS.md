# Field-solver options for a programmatic link (decision document)

**Date:** 2026-10-20 · **Requested by:** Reza ("I'd want something we could link to programmatically.") · **Status:** recommendation; Reza decides.

**How this was checked:**
- **Release and licence facts** come from each project's official repository: GitHub API, release pages, and the LICENSE files.
- **Features** come from official documentation or repository files.
- **Papers** were checked against Crossref (the DOI registry) metadata. Only abstracts and metadata were read, not full texts.
- Items marked **UNVERIFIED** could not be confirmed. Items marked *inference* are reasoning from the numerical method, not documented claims.

## The two jobs

- **A. Coils in air.**
  - Inputs: wire currents, lumped tuning capacitors at the break positions our tool exports.
  - Outputs: self-resonance and multiport S-parameters (the coupling actually measured between ports).
- **B. Coils plus a head.**
  - Inputs: a tissue model, either homogeneous or voxel-based (a body model built from 3D pixels).
  - Outputs: B1 maps and loaded S-parameters.

## Summary table

| Solver | Licence | Activity (as seen 2026-10-20) | Programmatic interface | Windows | Fit for A | Fit for B | MRI-coil evidence |
|---|---|---|---|---|---|---|---|
| **MARIE 3.0** (cloudmrhub/marie-tools) | MIT | last commit 2026-08-28; no tagged releases | MATLAB scripts; input JSON + Gmsh mesh; results as MATLAB data | native (needs MATLAB R2023a+) | very good: wire integral equations, lumped elements per port, tuning | very good: wire + surface + volume integral equations, voxel bodies | ships example 8-, 16- and 31-channel wire head receive arrays. 3.0 paper UNVERIFIED |
| **openEMS** | GPL-3.0 (CSXCAD LGPL-3.0) | v0.37.0, 2026-10-09 | Python and MATLAB/Octave, headless; HDF5 output | native | good: lumped RLC elements and ports | good: voxel body in the official tutorial | official 7T "MRI Loop Coil" tutorial; Liebig et al. 2013, doi:10.1002/jnm.1875 |
| **NEC-2 / necpp (PyNEC)** | GPL | necpp v2.2.1 (2026-07-24); PyNEC 2.3.4 | C, C++, Python, **plus a WebAssembly build that Node can call** | no Windows wheels; cross-compile | excellent for thin wires (LD cards = RLC loads) | **none** (one uniform medium) | none found |
| **COMSOL RF** + LiveLink for MATLAB / MPh | commercial (MPh itself is MIT) | current | full MATLAB scripting; Python via MPh | native | very good: lumped ports and capacitors | head phantom (2 domains in the official example); voxel import UNVERIFIED | official "MRI Birdcage Coil" model |
| Palace (AWS) | Apache-2.0 | v0.18.1, 2026-09-21 | command line + JSON config | Linux/macOS/WSL; native Windows UNVERIFIED | fair: no thin-wire model (*inference*) | possible with tetrahedral tissue meshes (*inference*) | none found |
| Elmer FEM | LGPL/GPL | release-26.2 | text input; headless | native | weak: no documented lumped capacitor | tetrahedral meshes (*inference*) | none found |
| Meep | GPL-2.0 | v1.35.0 | Python | WSL only | poor: no lumped RLC port found | voxel grid possible | none found |
| scuff-em | GPL-2.0 | dormant since 2018 | command line, C++/Python | UNVERIFIED | surfaces, not thin wires (*inference*) | no voxels (*inference*) | none found |

## Recommendation

**Job B (coil + head): MARIE 3.0 first, openEMS second.**
- **Why MARIE:**
  - It is built for exactly this problem: wire receive head arrays, lumped elements with Q, voxel heads, B1 maps and S-parameters.
  - Its input (JSON + a Gmsh 2.2 line mesh) is something our tool can write directly.
  - It runs in MATLAB on Windows, which you already have (R2025b is installed on this machine).
- **Risk:**
  - no tagged releases;
  - documentation marked "Coming Soon";
  - the repository warns the code "may contain bugs";
  - no verified peer-reviewed 3.0 paper.
- **Mitigation:** cross-solve the two-element test case in openEMS, and compare both with a bench S21 measurement.

**Job A (coils in air): NEC-2 via WebAssembly, inside our app.**
- **Why:**
  - It is a true thin-wire method of moments, which solves for the wire currents directly.
  - It has capacitor loads.
  - It is fast enough to run inside the design loop.
  - Its WebAssembly build drops into the browser tool with no install.
- **Risk:** near the knot crossings (about 1 mm apart) the thin-wire assumption is strained, and necpp rejects wires that are too close (*inference*). It needs testing on our crossings before we trust it there.

**COMSOL:** only if a licence with LiveLink is already available. Not needed otherwise.

## Independent B1 cross-check: Magpylib (in use)

- **Version:** Magpylib 6.0.0 (released 2026-10-19).
- **Licence:** BSD-2-Clause per the LICENSE file. PyPI metadata says BSD-3; we follow the file.
- **Function used:** `current.Polyline`, which computes the field of line currents between vertices, in SI units (verified from its own docstring).
- **Reference:** Ortner & Coliado Bandeira, *SoftwareX* 11:100466 (2020), doi:10.1016/j.softx.2020.100466.
- **Use here:** check V14.
- **Alternative:** ABSCAB (Apache-2.0; *Comput. Phys. Commun.* 287:108692, 2023, doi:10.1016/j.cpc.2023.108692), a second independent check focused on edge cases.

## Head models (for exclusion zones and phantoms)

| Model | Terms | Good for |
|---|---|---|
| **MNI ICBM152 2009** (McGill) | Permissive: use "for any purpose and without fee", keeping the copyright notice | Includes **eye and face masks**, which suit our exclusion zones. Scalp surface by isosurfacing. No electromagnetic tissue properties |
| MIDA (IT'IS/FDA) | Free, but **no redistribution**, faces must be disguised in published figures, citation required | High-detail phantom for simulation; cannot be bundled with the tool |
| Virtual Population (Duke, Ella…) | Terms UNVERIFIED; openEMS says Ella needs an IT'IS licence | Simulation phantoms |
| IT'IS tissue database v5.0 | Described as free (doi:10.13099/VIP21000-05-0) | Tissue properties to pair with any segmentation |
| IEEE SAM head | Distributed through a paid standard; homogeneous shell | Not recommended here |

## Proposed next step (WP6)

1. Export a **two-element test case** (wires, ports, capacitors) from the Pair explorer into MARIE.
2. Pre-register: our predicted zero-coupling spacing against MARIE's S21 null, then openEMS, then a bench measurement.
3. If MARIE handles it cleanly, extend to full arrays with the ICBM152-derived head.
