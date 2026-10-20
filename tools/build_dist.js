// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
// Builds dist/ — a self-contained copy of the app (one folder, index.html at the top) for sharing or hosting.
//   node tools/build_dist.js
// Nothing is changed in the code itself; only the relative paths in index.html move from '../x' to './x'.
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
function copy(rel, relOut) {
  const out = path.join(dist, relOut || rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(path.join(root, rel), out);
}
let html = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const before = (html.match(/\.\.\//g) || []).length;
html = html.replace(/\.\.\//g, './');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), html);
['knot', 'inductance', 'surface', 'layout', 'optimise', 'field'].forEach(m => copy('core/' + m + '.js'));
['three-0.149.0.min.js', 'three-LICENSE.txt'].forEach(f => copy('vendor/' + f));
['validation_status.js', 'validation_report.html', 'compare_worstpair.html'].forEach(f => copy('validation/' + f));
['README.html', 'Design.html', 'DECISIONS.html', 'PARAMETERS.html', 'NOTICE.txt'].forEach(f => copy(f));
console.log('dist/ built: rewrote ' + before + ' relative paths; files:');
(function list(d, pre) { fs.readdirSync(d).forEach(f => { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) list(p, pre + f + '/'); else console.log('  ' + pre + f); }); })(dist, '');
