// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
/*
PHANTOM — the head phantom used by the full-wave co-simulation (Design.md §6b, v1.7). Single source of truth for the
tissue values and layer geometry (audit D9: these were duplicated in the app and tests/export_case.js).

  7T (298 MHz): openEMS 0.37.0's bundled phantom_head_298MHz.h5, which openEMS attributes to the IT'IS database
                (Gabriel model). Secondary source; NOT independently verified.            CONV (secondary)
  3T (128 MHz): APPROXIMATION - openEMS's phantom_body_128MHz.h5 values mapped onto head layers
                (Tissue -> brain, Bone -> skull, Skin -> skin). Verified 128 MHz head values are an open item.
  Layers: skin 4 mm, skull 7 mm inside the head ellipsoid (helmet - 10 mm).                  JUDG PLACEHOLDER
  Neck cut: the phantom stops 60 mm below the lowest covered height zCut.                     JUDG PLACEHOLDER
*/
(function (factory) {
  var g = typeof globalThis !== 'undefined' ? globalThis : self;
  g.KC = g.KC || {}; g.KC_FACTORIES = g.KC_FACTORIES || [];
  g.KC_FACTORIES.push(factory); factory(g.KC);
  if (typeof module !== 'undefined') module.exports = g.KC;
})(function phantomModule(KC) {
  'use strict';
  var P = KC.phantom = {};
  P.TISSUE = {
    7: { brain: { epsR: 52.7, kappa: 0.95 }, skull: { epsR: 11.4, kappa: 0.29 }, skin: { epsR: 38.9, kappa: 0.84 },
      source: 'openEMS 0.37.0 resources/phantoms/phantom_head_298MHz.h5 (openEMS attributes values to IT\'IS database, Gabriel model); not independently verified' },
    3: { brain: { epsR: 62.8, kappa: 0.66 }, skull: { epsR: 12.5, kappa: 0.13 }, skin: { epsR: 46.8, kappa: 0.58 },
      source: 'APPROXIMATION: openEMS 0.37.0 phantom_body_128MHz.h5 values (Tissue->brain, Bone->skull, Skin->skin); verified 128 MHz head values are an open item' }
  };
  P.SKIN_MM = 4;          // JUDG PLACEHOLDER
  P.SKULL_MM = 7;         // JUDG PLACEHOLDER
  P.NECK_BELOW_ZCUT = 60; // JUDG PLACEHOLDER: mm below zCut where the phantom ends
  // Phantom spec for a helmet H at field strength B0 (T); null if no tissue values exist for B0.
  P.spec = function (H, B0) {
    if (!P.TISSUE[B0]) return null;
    var hd = KC.field.head(H);
    return { type: 'head3', axes: [hd.a, hd.b, hd.c], skin_mm: P.SKIN_MM, skull_mm: P.SKULL_MM, zMin: H.zCut - P.NECK_BELOW_ZCUT, tissue: P.TISSUE[B0] };
  };
});
