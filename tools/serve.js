// Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
// Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
// Minimal local web server for the app (no install needed). Run from anywhere:
//   node tools/serve.js        then open http://localhost:8765/app/index.html
// Serves only this project folder, only to this computer (127.0.0.1).
//
// COMSOL job runner (Design v1.11, 2026-10-23, pending owner approval; EXPLORATORY): the app posts case files here and this
// server starts sim/comsol_run.py on them in the background (detached, so a job outlives a server restart).
//   POST /api/comsol/jobs           {label, options, cases: [case, ...]} -> {job}
//   GET  /api/comsol/jobs           list of jobs with their status
//   GET  /api/comsol/jobs/<job>     status + the last lines of the log
//   POST /api/comsol/jobs/<job>/cancel
// Results are plain files under sim/comsol_jobs/<job>/ (served like everything else). Python (needs MPh): KC_COMSOL_PYTHON,
// else the first that exists of ~/comsolai and ~/.venvs/kc_em (Scripts\python.exe on Windows, bin/python elsewhere),
// else python / python3 on the PATH. One job runs at a time (CPU and licence); the rest wait in a queue.
// Windows and Linux: jobs start without a console window and are cancelled with taskkill on Windows.
// Requests must carry the header X-KC-App: 1, which a web page from another site cannot send without this server's
// permission (CORS preflight, never granted), so other sites cannot start COMSOL jobs here.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const root = path.join(__dirname, '..'), port = +process.argv[2] || 8765;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.pdf': 'application/pdf',
  '.png': 'image/png', '.stl': 'model/stl' };
const jobsDir = path.join(root, 'sim', 'comsol_jobs');
const WIN = process.platform === 'win32';
const PY = process.env.KC_COMSOL_PYTHON || ['comsolai', path.join('.venvs', 'kc_em'), path.join('.venvs', 'knotted_coils')]
  .map(function (v) { return path.join(os.homedir(), v, WIN ? 'Scripts' : 'bin', WIN ? 'python.exe' : 'python'); })
  .filter(function (f) { return fs.existsSync(f); })[0] || (WIN ? 'python' : 'python3');
let pyCheck = { checked: false };     // does this Python import MPh? (checked once, in the background)
cp.execFile(PY, ['-c', 'import mph, sys; print(mph.__version__, sys.version.split()[0])'], { timeout: 60000, windowsHide: true },
  function (err, out) { pyCheck = err ? { checked: true, ok: false, error: String(err.message).split('\n')[0] } : { checked: true, ok: true, mph: String(out).trim() }; });
const queue = [];
let running = null;

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return false; } }
function jobInfo(name) {
  const d = path.join(jobsDir, name), job = readJSON(path.join(d, 'job.json'));
  if (!job) return null;
  const st = readJSON(path.join(d, 'status.json')) || { state: queue.indexOf(name) >= 0 ? 'queued' : 'unknown' };
  if (st.state === 'running' && st.pid && !alive(st.pid)) st.state = 'stopped';   // process gone without finishing
  if (queue.indexOf(name) >= 0) st.state = 'queued';
  return Object.assign({ job: name, label: job.label, kind: job.kind, created: job.created, n_cases: job.n_cases }, st);
}
// a job started by an earlier run of this server may still be going (jobs are detached): one at a time across restarts
function liveJob() {
  if (!fs.existsSync(jobsDir)) return null;
  return fs.readdirSync(jobsDir).filter(function (n) {
    const st = readJSON(path.join(jobsDir, n, 'status.json'));
    return st && (st.state === 'running' || st.state === 'starting') && st.pid && alive(st.pid);
  })[0] || null;
}
function startNext() {
  if (running && alive(running.pid)) return;
  running = null;
  if (liveJob()) { setTimeout(startNext, 10000); return; }   // check again shortly
  const name = queue.shift();
  if (!name) return;
  const d = path.join(jobsDir, name), out = fs.openSync(path.join(d, 'run.log'), 'a');
  // a status exists from the first moment: before Python writes its own, the app must see 'starting', not 'unknown'
  fs.writeFileSync(path.join(d, 'status.json'), JSON.stringify({ state: 'starting', stage: 'starting Python', started: Date.now() / 1000 }));
  const child = cp.spawn(PY, ['-u', path.join(root, 'sim', 'comsol_run.py'), '--job', d], { cwd: root, detached: true, windowsHide: true,
    stdio: ['ignore', out, out], env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) });
  child.on('error', function (e) { fs.writeFileSync(path.join(d, 'status.json'), JSON.stringify({ state: 'error', error: 'could not start ' + PY + ': ' + e.message })); running = null; startNext(); });
  child.on('exit', function () { running = null; startNext(); });
  child.unref();
  running = { name: name, pid: child.pid };
}
function body(req, cb) {
  let chunks = [], size = 0;
  req.on('data', function (c) { size += c.length; if (size > 200e6) req.destroy(); else chunks.push(c); });
  req.on('end', function () { try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { cb(e); } });
}

function api(req, res, url) {
  if (req.headers['x-kc-app'] !== '1') return send(res, 403, { error: 'missing X-KC-App header' });
  const parts = url.split('/').filter(Boolean);          // api, comsol, jobs, <job>, cancel
  fs.mkdirSync(jobsDir, { recursive: true });
  if (req.method === 'GET' && parts.length === 3) {
    const list = fs.readdirSync(jobsDir).map(jobInfo).filter(Boolean).sort(function (a, b) { return (b.created || '').localeCompare(a.created || ''); });
    return send(res, 200, { python: PY, pythonCheck: pyCheck, jobs: list });
  }
  if (req.method === 'POST' && parts.length === 3) {
    return body(req, function (err, j) {
      if (err || !j || !Array.isArray(j.cases) || !j.cases.length) return send(res, 400, { error: 'expected {cases: [...]}' });
      const name = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15) + '_' +
        String(j.label || 'job').replace(/[^A-Za-z0-9_+-]/g, '_').slice(0, 40);
      const d = path.join(jobsDir, name);
      fs.mkdirSync(d, { recursive: true });
      j.cases.forEach(function (c, i) { fs.writeFileSync(path.join(d, 'case_' + String(i + 1).padStart(2, '0') + '.json'), JSON.stringify(c)); });
      fs.writeFileSync(path.join(d, 'job.json'), JSON.stringify({ label: j.label, kind: j.kind || 'case', options: j.options || {},
        created: new Date().toISOString(), n_cases: j.cases.length, app: j.app || null }, null, 1));
      queue.push(name); startNext();
      send(res, 200, { job: name });
    });
  }
  const name = parts[3] && path.basename(parts[3]);
  if (!name || !fs.existsSync(path.join(jobsDir, name, 'job.json'))) return send(res, 404, { error: 'no such job' });
  if (req.method === 'GET' && parts.length === 4) {
    const info = jobInfo(name), log = path.join(jobsDir, name, 'run.log');
    info.log = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').slice(-40).join('\n') : '';
    info.files = fs.readdirSync(path.join(jobsDir, name)).filter(function (f) { return /_results\.json$/.test(f); }).sort();
    info.job_json = readJSON(path.join(jobsDir, name, 'job.json'));
    return send(res, 200, info);
  }
  if (req.method === 'POST' && parts[4] === 'cancel') {
    const qi = queue.indexOf(name);
    if (qi >= 0) queue.splice(qi, 1);
    const st = readJSON(path.join(jobsDir, name, 'status.json')) || {};
    if (st.pid && alive(st.pid)) {
      if (WIN) cp.spawnSync('taskkill', ['/pid', String(st.pid), '/T', '/F'], { windowsHide: true });   // the whole process tree
      else {
        try { process.kill(-st.pid, 'SIGTERM'); } catch (e) { try { process.kill(st.pid, 'SIGTERM'); } catch (e2) {} }
        // Python inside MPh/JPype can ignore SIGTERM: force it after 5 s (seen 2026-10-23)
        setTimeout(function () { if (alive(st.pid)) { try { process.kill(-st.pid, 'SIGKILL'); } catch (e) { try { process.kill(st.pid, 'SIGKILL'); } catch (e2) {} } } }, 5000);
      }
    }
    fs.writeFileSync(path.join(jobsDir, name, 'status.json'), JSON.stringify(Object.assign(st, { state: 'cancelled', finished: Date.now() / 1000 })));
    return send(res, 200, { job: name, state: 'cancelled' });
  }
  send(res, 404, { error: 'unknown request' });
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url.indexOf('/api/comsol/') === 0 || url === '/api/comsol') return api(req, res, url);
  const p = path.normalize(path.join(root, url));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d);
  });
}).listen(port, '127.0.0.1', () => console.log('Knotted Coil Designer: http://localhost:' + port + '/app/index.html  (Ctrl+C to stop)\n' +
  'COMSOL jobs: ' + jobsDir + ' (Python: ' + PY + '; set KC_COMSOL_PYTHON to use another)'));
