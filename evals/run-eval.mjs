// Smart-format evaluation runner.
// Usage: node run-eval.mjs [--mode default|code|notes|all]
import fs from 'node:fs';
import path from 'node:path';
import { smartFormat } from './smartFormatClient.mjs';
import { defaultCases, codeCases, notesCases } from './cases.mjs';

const args = process.argv.slice(2);
const modeArg = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'all';
const DELAY_MS = 12000; // free tier: ~8000 TPM ÷ ~1600-token prompt ≈ 5 calls/min
const OUT_DIR = path.join(import.meta.dirname, 'results');
fs.mkdirSync(OUT_DIR, { recursive: true });

function loadGroqKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  const candidates = [
    path.join(process.env.APPDATA || '', 'wispr-voice', 'config.json'),
    path.join(process.env.APPDATA || '', 'wispr-clone', 'config.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
        const key = (cfg.groqApiKey || '').trim();
        if (key) { console.log(`[key] loaded from ${p}`); return key; }
      }
    } catch {}
  }
  console.error('No Groq key found. Set GROQ_API_KEY or configure it in the app first.');
  process.exit(1);
}

// --- Grading -------------------------------------------------------------
const NUM_WORDS = { zero:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10',eleven:'11',twelve:'12',thirteen:'13',fourteen:'14',fifteen:'15',sixteen:'16',seventeen:'17',eighteen:'18',nineteen:'19',twenty:'20',thirty:'30',forty:'40',fifty:'50',sixty:'60',seventy:'70',eighty:'80',ninety:'90',hundred:'100',thousand:'1000',million:'1000000' };

function tokens(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+/g) || []).map(t => NUM_WORDS[t] || t);
}

function grade(expected, actual) {
  if (actual == null) return { grade: 'FAIL', reason: 'no output' };
  const e = tokens(expected);
  const a = tokens(actual);
  if (e.length === 0) {
    return a.length === 0 ? { grade: 'PASS', reason: 'empty as expected' } : { grade: 'FAIL', reason: `expected empty, got "${actual}"` };
  }
  // exact sequence match
  if (e.length === a.length && e.every((t, i) => t === a[i])) {
    return { grade: 'PASS', reason: 'exact token match' };
  }
  // expected must appear as an ordered subsequence of actual, without ballooning
  let i = 0;
  for (const t of a) { if (i < e.length && t === e[i]) i++; }
  if (i === e.length && a.length <= e.length + 3) {
    return { grade: 'PASS', reason: 'subsequence match (punctuation/format variance)' };
  }
  if (i === e.length) {
    return { grade: 'CLOSE', reason: `all expected words present but ${a.length - e.length} extra tokens` };
  }
  const missing = e.length - i;
  return { grade: 'FAIL', reason: `${missing} expected token(s) missing or reordered` };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Calls smartFormat, retrying on 429 rate limits using the server's own
// "try again in X s" hint. Retries matter because the free tier shares a
// small TPM pool and the eval must measure formatting quality, not throttling.
async function smartFormatWithRetry(input, key, mode, maxRetries = 4) {
  let attempt = 0;
  while (true) {
    const res = await smartFormat(input, key, mode);
    const throttled = res.wasFormatted === false && /429|rate.?limit/i.test(res.reason || '');
    if (!throttled || attempt >= maxRetries) return res;
    const m = (res.reason || '').match(/again in ([\d.]+)s/i);
    const wait = m ? Math.ceil(parseFloat(m[1]) * 1000) + 2000 : 15000;
    process.stdout.write(`  [429] ${mode} "${input.slice(0, 30)}..." — waiting ${wait}ms\n`);
    await sleep(wait);
    attempt++;
  }
}

async function runMode(mode, cases, key) {
  const results = [];
  for (let idx = 0; idx < cases.length; idx++) {
    const c = cases[idx];
    const t0 = Date.now();
    let output = '', wasFormatted = false, error = null;
    try {
      const res = await smartFormatWithRetry(c.input, key, mode);
      output = res.text;
      wasFormatted = res.wasFormatted;
      if (!res.wasFormatted) error = res.reason || 'fell back to raw';
    } catch (e) {
      error = e.message;
    }
    const latency = Date.now() - t0;
    const tokenGrade = grade(c.expect, output);
    // A case only truly passes if formatting was applied AND content matches.
    // Raw fallbacks are recorded as FAIL with their token grade kept for diagnosis.
    let g;
    if (error) {
      g = { grade: 'FAIL', reason: `raw fallback — ${error}` };
    } else if (!wasFormatted) {
      g = { grade: 'FAIL', reason: 'formatting not applied (raw passthrough)' };
    } else {
      g = tokenGrade;
    }
    results.push({ id: c.id, mode, category: c.category, input: c.input, expected: c.expect, actual: output, wasFormatted, error, latency, tokenMatch: tokenGrade.grade, ...g });
    process.stdout.write(`[${mode}] ${idx + 1}/${cases.length} ${c.id} ${g.grade} (${latency}ms)\n`);
    if (idx < cases.length - 1) await sleep(DELAY_MS);
  }
  return results;
}

function summarize(results) {
  const by = {};
  for (const r of results) {
    by[r.category] = by[r.category] || { pass: 0, close: 0, fail: 0, total: 0, fallbacks: 0 };
    by[r.category].total++;
    by[r.category][r.grade.toLowerCase()]++;
    if (r.wasFormatted === false) by[r.category].fallbacks++;
  }
  return by;
}

function markdown(results, mode) {
  const s = summarize(results);
  const total = results.length;
  const pass = results.filter(r => r.grade === 'PASS').length;
  const close = results.filter(r => r.grade === 'CLOSE').length;
  const fail = results.filter(r => r.grade === 'FAIL').length;
  const avgLat = Math.round(results.reduce((a, r) => a + r.latency, 0) / total);
  const fallbacks = results.filter(r => r.wasFormatted === false).length;

  let md = `# Smart Format Eval — ${mode} mode\n\n`;
  md += `**${pass}/${total} PASS · ${close} CLOSE · ${fail} FAIL · ${fallbacks} raw-fallbacks · avg ${avgLat}ms**\n\n## By category\n\n`;
  md += `| Category | Pass | Close | Fail | Raw fallbacks |\n|---|---|---|---|---|\n`;
  for (const [cat, v] of Object.entries(s)) {
    md += `| ${cat} | ${v.pass}/${v.total} | ${v.close} | ${v.fail} | ${v.fallbacks} |\n`;
  }
  md += `\n## Failures & close calls\n\n`;
  for (const r of results.filter(r => r.grade !== 'PASS')) {
    md += `### ${r.id} — ${r.grade} (${r.category})\n`;
    md += `- **Input:** ${r.input}\n- **Expected:** ${JSON.stringify(r.expected)}\n- **Actual:** ${JSON.stringify(r.actual)}\n`;
    md += `- **Why:** ${r.reason}${r.error ? ` · fallback: ${r.error}` : ''}\n\n`;
  }
  return md;
}

const key = loadGroqKey();
const all = { default: defaultCases, code: codeCases, notes: notesCases };
const modes = modeArg === 'all' ? Object.keys(all) : [modeArg];

for (const mode of modes) {
  console.log(`\n===== Running ${mode} mode (${all[mode].length} cases) =====`);
  const results = await runMode(mode, all[mode], key);
  fs.writeFileSync(path.join(OUT_DIR, `${mode}-results.json`), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, `${mode}-report.md`), markdown(results, mode));
  const pass = results.filter(r => r.grade === 'PASS').length;
  console.log(`\n[${mode}] DONE: ${pass}/${results.length} PASS — report at evals/results/${mode}-report.md`);
  if (mode !== modes[modes.length - 1]) await sleep(2000);
}
console.log('\nAll done.');
