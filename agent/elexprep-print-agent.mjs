#!/usr/bin/env node
/**
 * ElexPrep Windows print agent.
 *
 * Runs on the office Windows machine that has the Develop ineo+ 3320i driver installed.
 * Polls the ElexPrep server for queued print jobs, downloads each job's PDF, and prints it
 * through SumatraPDF with the right paper tray (bin) selected, then reports the result back.
 *
 * Requires only Node.js 18+ (built-in fetch) and SumatraPDF. See agent/README.md for setup.
 */
import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const configPath = process.env.ELEXPREP_AGENT_CONFIG ?? join(here, 'agent-config.json');
if (!existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  console.error('Copy agent-config.example.json to agent-config.json and fill it in.');
  process.exit(1);
}
let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf-8'));
} catch (err) {
  console.error(`Could not parse ${configPath} as JSON: ${err.message}`);
  console.error('Check for a stray trailing comma or missing quote and try again.');
  process.exit(1);
}

const SERVER_URL = (config.serverUrl ?? '').replace(/\/+$/, '');
const TOKEN = config.agentToken ?? '';
const SUMATRA = config.sumatraPath ?? 'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe';
const POLL_MS = (config.pollSeconds ?? 5) * 1000;
const PRINT_TIMEOUT_MS = (config.printTimeoutSeconds ?? 120) * 1000;

if (!SERVER_URL || !TOKEN) {
  console.error('serverUrl and agentToken must be set in agent-config.json');
  process.exit(1);
}
if (!existsSync(SUMATRA)) {
  console.error(`SumatraPDF not found at: ${SUMATRA}`);
  console.error('Install it from https://www.sumatrapdfreader.org, or set the correct path as "sumatraPath" in agent-config.json.');
  process.exit(1);
}

const headers = { 'X-Agent-Token': TOKEN, 'Content-Type': 'application/json' };
const log = (...args) => console.log(new Date().toISOString(), ...args);

async function claimJob() {
  const res = await fetch(`${SERVER_URL}/api/agent/print-jobs/claim`, { method: 'POST', headers });
  if (res.status === 401) throw new Error('Server rejected the agent token — regenerate it in Printer Settings and update agent-config.json');
  if (!res.ok) throw new Error(`claim failed: HTTP ${res.status}`);
  const { job } = await res.json();
  return job;
}

async function downloadPdf(jobId) {
  const res = await fetch(`${SERVER_URL}/api/agent/print-jobs/${jobId}/pdf`, { headers });
  if (!res.ok) throw new Error(`PDF download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function reportComplete(jobId, ok, error) {
  await fetch(`${SERVER_URL}/api/agent/print-jobs/${jobId}/complete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ok, error }),
  }).catch((e) => log(`WARN: could not report completion for ${jobId}:`, e.message));
}

function printPdf(pdfPath, printerName, bin) {
  // bin= accepts either the tray name or number reported by `SumatraPDF -list-printers`.
  const settings = ['noscale', bin ? `bin=${bin}` : null].filter(Boolean).join(',');
  const args = ['-print-to', printerName, '-print-settings', settings, '-silent', '-exit-when-done', pdfPath];
  return new Promise((resolve, reject) => {
    const child = spawn(SUMATRA, args, { windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`SumatraPDF timed out after ${PRINT_TIMEOUT_MS / 1000}s`));
    }, PRINT_TIMEOUT_MS);
    let stderr = '';
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Could not run SumatraPDF at ${SUMATRA}: ${err.message}`));
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`SumatraPDF exited with code ${code}${stderr ? `: ${stderr}` : ''}`));
    });
  });
}

async function handleJob(job) {
  log(`Printing job ${job.id}: ${job.labelType} (${job.pages}p) → ${job.printerName} bin=${job.bin || 'default'}`);
  if (!job.printerName) {
    const msg = 'No Windows printer name configured in ElexPrep → Printer Settings';
    log(`Job ${job.id} FAILED: ${msg}`);
    await reportComplete(job.id, false, msg);
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'elexprep-'));
  const pdfPath = join(dir, `${job.id}.pdf`);
  try {
    writeFileSync(pdfPath, await downloadPdf(job.id));
    await printPdf(pdfPath, job.printerName, job.bin);
    await reportComplete(job.id, true);
    log(`Job ${job.id} done`);
  } catch (err) {
    log(`Job ${job.id} FAILED: ${err.message}`);
    await reportComplete(job.id, false, err.message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

let stopping = false;
process.on('SIGINT', () => {
  log('Stopping (Ctrl+C) — finishing the current job, if any, then exiting...');
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});

async function main() {
  log(`ElexPrep print agent started — server ${SERVER_URL}, polling every ${POLL_MS / 1000}s`);
  while (!stopping) {
    try {
      let job;
      while (!stopping && (job = await claimJob())) {
        await handleJob(job);
      }
    } catch (err) {
      log(`Poll error: ${err.message}`);
    }
    if (stopping) break;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  log('Stopped.');
}

main();
