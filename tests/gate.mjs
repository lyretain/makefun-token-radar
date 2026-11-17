// Local mirror of the seven program/v1 gate rows, plus a two-run byte compare.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from '../vendor/makefun-board.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = process.argv[2] ?? '/tmp/kit/token-radar-01-kit/input/snapshot.json';
if (!existsSync(snapshot)) {
  console.error('missing snapshot ' + snapshot);
  process.exit(2);
}

function run(dir) {
  const res = spawnSync(process.execPath, [join(root, 'main.ts'), '--input', snapshot, '--output', dir], {
    env: { ...process.env, TZ: 'UTC', LANG: 'C' },
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    console.error(res.stdout);
    console.error(res.stderr);
    throw new Error('main exited ' + res.status);
  }
  return res.stdout;
}

function filesOf(dir) {
  const out = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const path = rel ? rel + '/' + name : name;
      const st = statSync(join(dir, path));
      if (st.isDirectory()) walk(path);
      else out.push(path);
    }
  };
  walk('');
  return out;
}

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function pngSize(buf) {
  if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const mark = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (mark >= 0xc0 && mark <= 0xc2) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

const a = mkdtempSync(join(tmpdir(), 'ashlar-a-'));
const b = mkdtempSync(join(tmpdir(), 'ashlar-b-'));
const logA = run(a);
const logB = run(b);
const fa = filesOf(a);
const fb = filesOf(b);
const diffs = [];
if (fa.join('\n') !== fb.join('\n')) diffs.push('file list');
for (const name of fa) {
  const ba = readFileSync(join(a, name));
  const bb = readFileSync(join(b, name));
  if (!ba.equals(bb)) diffs.push(name);
}
if (logA !== logB) diffs.push('stdout');

const board = JSON.parse(readFileSync(join(a, 'board.json'), 'utf8'));
const snap = JSON.parse(readFileSync(snapshot, 'utf8'));
const rows = board.rows;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
}

const slugs = new Set(snap.protocols.map((p) => p.slug));
const seen = new Set();
let order = true;
let prev = Infinity;
const values = new Set();
let stepsOk = true;
for (const row of rows) {
  if (!slugs.has(row.slug) || seen.has(row.slug) || !row.name) order = false;
  seen.add(row.slug);
  if (!Number.isInteger(row.rank) || !Number.isInteger(row.implied_value_usd)) order = false;
  if (row.implied_value_usd < 1 || row.implied_value_usd > 100_000_000_000_000 || row.implied_value_usd > prev) order = false;
  prev = row.implied_value_usd;
  values.add(row.implied_value_usd);
  if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) stepsOk = false;
  else for (const step of row.farm_steps) {
    const n = String(step).trim().length;
    if (n < 20 || n > 600) stepsOk = false;
  }
}
const ranks = rows.map((r) => r.rank).sort((x, y) => x - y);
const rankOk = ranks.length === rows.length && ranks.every((n, i) => n === i + 1);
const missing = snap.watchlist.filter((slug) => !seen.has(slug));
const outside = rows.filter((r) => !snap.watchlist.includes(r.slug)).length;
check('board_file', rows.length >= 100 && rows.length <= 4000 && order && values.size > 1, rows.length + ' rows, ' + values.size + ' distinct values');
check('sorted_by_value', rankOk && order && values.size > 1, 'ranks 1..N and nonincreasing');
check('coverage', missing.length === 0, missing.length ? missing.slice(0, 5).join(',') : 'all ' + snap.watchlist.length);
check('others', outside >= 60, String(outside));
check('farm_steps', stepsOk, '3 to 12 steps, 20 to 600 characters');

const dashFiles = filesOf(join(a, 'dashboard'));
let net = null;
const attr = /(?:href|src|action|poster|cite|data)\s*=\s*["'][^"']*https?:\/\//i;
const imp = /(?:import|export)\s+(?:[^'"]*from\s+)?['"]https?:\/\/|require\(\s*['"]https?:\/\/|import\(\s*['"]https?:\/\//;
for (const name of dashFiles) {
  const text = readFileSync(join(a, 'dashboard', name), 'utf8');
  if (name.endsWith('.css') && /https?:\/\//.test(text)) net = name;
  if (name.endsWith('.html') && (attr.test(text) || /<style[^>]*>[\s\S]*https?:\/\//i.test(text))) net = name;
  if (name.endsWith('.js') && imp.test(text)) net = name;
}
const dashBytes = dashFiles.reduce((n, name) => n + statSync(join(a, 'dashboard', name)).size, 0);
check('dashboard_files', dashFiles.includes('index.html') && dashFiles.some((n) => n.endsWith('.css')) && dashFiles.some((n) => n.endsWith('.js')) && dashFiles.length <= 400 && dashBytes <= 4_194_304 && net === null, dashFiles.length + ' files, ' + dashBytes + ' bytes');
check('dashboard_source_budget', dashBytes <= 65_536, dashBytes + ' bytes so the dossier can show the whole page');

const shots = readdirSync(join(a, 'screenshots')).filter((n) => !n.startsWith('.')).sort();
let shotDetail = shots.length + ' images';
let shotsOk = shots.length >= 3 && shots.length <= 4;
for (const name of shots) {
  const buf = readFileSync(join(a, 'screenshots', name));
  const size = pngSize(buf) || jpegSize(buf);
  const long = size ? Math.max(size.w, size.h) : 0;
  const short = size ? Math.min(size.w, size.h) : 0;
  if (!size || buf.length > 524_288 || long > 1440 || short < 800) shotsOk = false;
  shotDetail += `; ${name} ${buf.length}b ${size ? size.w + 'x' + size.h : 'bad'}`;
}
check('screenshots', shotsOk, shotDetail);

const rebuilt = Buffer.from(buildDossier(a, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
const got = readFileSync(join(a, 'dossier.json'));
check('dossier_matches', got.equals(rebuilt), 'dossier ' + got.length + ' bytes');
check('deterministic', diffs.length === 0, diffs.length ? diffs.join(',') : 'two runs byte-identical');

const failed = checks.filter((c) => !c.ok);
const report = {
  ok: failed.length === 0,
  stdout: logA.trim(),
  top_sha256: Object.fromEntries(fa.map((name) => [name, sha(join(a, name))])),
  checks,
};
console.log(JSON.stringify(report, null, 2));
rmSync(a, { recursive: true, force: true });
rmSync(b, { recursive: true, force: true });
process.exit(failed.length === 0 ? 0 : 1);
