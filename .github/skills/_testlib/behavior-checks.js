// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 Canonical Ltd.
//
// Harness-owned behavioural checks against a launched workshop — the
// analogue of rascheel/snap-packager-skill-test's tests/lib.sh
// (assert_http_status, assert_snap_service, wait_for_port, …). The agent's
// own claims of success are graded by the rubric; these checks are run by
// the HARNESS after the agent exits and before teardown, so a green result
// means the thing actually works, not that the transcript says it does.
//
// Checks are declared per case (e.g. design-sdk reconstruction
// expectations/<sdk>.json `online_checks`). Every check has a `name` and a
// `kind`:
//   exec_ok                 {cmd}                       `bash -lc cmd` in the workshop exits 0
//   exec_output_matches     {cmd, regex}                ... and stdout+stderr matches regex
//   service_active          {unit, timeout_s=60}        `systemctl --user is-active unit` → active
//   http_status             {url, status=200, timeout_s=60}  host-side curl (tunnels)
//   wait_for_port           {port, host=127.0.0.1, timeout_s=60}  host-side TCP connect
//   persists_across_refresh {write_cmd, read_cmd, regex,
//                            control_write_cmd?, control_read_cmd?}
//       write, force an APPLIED `workshop refresh` (see the kind's comment:
//       needs ctx.sdkDir), read back. The optional control pair writes
//       OUTSIDE any mount and must be GONE after the refresh; if it survived,
//       the refresh did not reset the writable filesystem and the check is
//       `inconclusive`. Inconclusive results count as FAILED in
//       behavioral_pass — an unproven claim is not a pass.
//
// Everything is synchronous (spawnSync + a blocking sleep): it runs once
// per case after the agent, so simplicity beats parallelism.

'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(cmd, args, { cwd, timeoutMs = 120_000 } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: timeoutMs, env: process.env });
  return {
    status: r.status,
    out: ((r.stdout || '') + (r.stderr || '')).trim(),
    error: r.error ? String(r.error.message || r.error) : null,
  };
}

function tail(s, n = 400) {
  s = String(s || '');
  return s.length > n ? '…' + s.slice(-n) : s;
}

// `workshop list --global` → the project directory that owns `name`, so the
// harness can address a workshop wherever the agent put its definition.
// The listing omits workshops that are Off.
function findWorkshop(name) {
  const r = run('workshop', ['list', '--global'], { timeoutMs: 30_000 });
  if (r.status !== 0) return null;
  for (const line of r.out.split('\n').slice(1)) {
    const cols = line.trim().split(/\s{2,}/);
    if (cols.length >= 3 && cols[1] === name) {
      const project = cols[0].replace(/^~(?=\/|$)/, os.homedir());
      return { project, status: cols[2] };
    }
  }
  return null;
}

function wsExec(ws, project, cmd, timeoutMs = 120_000) {
  return run('workshop', ['exec', ws, '--', 'bash', '-lc', cmd], { cwd: project, timeoutMs });
}

function poll(timeoutS, fn) {
  const deadline = Date.now() + timeoutS * 1000;
  let last;
  for (;;) {
    last = fn();
    if (last.ok || Date.now() >= deadline) return last;
    sleepMs(2000);
  }
}

const KINDS = {
  exec_ok(c, ws, project) {
    const r = wsExec(ws, project, c.cmd);
    return { ok: r.status === 0, detail: `rc=${r.status} ${tail(r.out)}` };
  },

  exec_output_matches(c, ws, project) {
    const r = wsExec(ws, project, c.cmd);
    const re = new RegExp(c.regex, 'm');
    return { ok: r.status === 0 && re.test(r.out), detail: `rc=${r.status} ${tail(r.out)}` };
  },

  service_active(c, ws, project) {
    return poll(c.timeout_s || 60, () => {
      const r = wsExec(ws, project, `systemctl --user is-active ${c.unit}`, 30_000);
      return { ok: /^active$/m.test(r.out), detail: tail(r.out) };
    });
  },

  http_status(c) {
    const want = String(c.status || 200);
    return poll(c.timeout_s || 60, () => {
      const r = run('curl', ['-s', '-o', '/dev/null', '-m', '5', '-w', '%{http_code}', c.url], { timeoutMs: 10_000 });
      return { ok: r.out === want, detail: `HTTP ${r.out || '(none)'} (want ${want})` };
    });
  },

  wait_for_port(c) {
    const host = c.host || '127.0.0.1';
    return poll(c.timeout_s || 60, () => {
      const r = run('bash', ['-c', `exec 3<>/dev/tcp/${host}/${Number(c.port)}`], { timeoutMs: 5_000 });
      return { ok: r.status === 0, detail: r.status === 0 ? 'open' : `closed ${tail(r.out, 120)}` };
    });
  },

  persists_across_refresh(c, ws, project, ctx = {}) {
    const w = wsExec(ws, project, c.write_cmd);
    if (w.status !== 0) return { ok: false, detail: `write failed rc=${w.status} ${tail(w.out)}` };
    if (c.control_write_cmd) wsExec(ws, project, c.control_write_cmd);
    // An unchanged workshop answers `workshop refresh` with "no updates
    // available" and touches nothing, so the refresh must APPLY to prove a
    // mount. Verified 2026-11-17 on Workshop 0.9.9: a definition-only edit
    // (actions:) does not count either, but a new try revision does, and a
    // hook-body change is enough for one (plain `sdkcraft try`, cached parts).
    // So: append a comment to one of the agent's hooks, re-try, refresh,
    // and always put the hook back.
    let restore = null;
    if (ctx.sdkDir) {
      const hooksDir = path.join(ctx.sdkDir, 'hooks');
      let hook = null;
      try {
        hook = fs.readdirSync(hooksDir).sort().map(f => path.join(hooksDir, f))
          .find(f => fs.statSync(f).isFile());
      } catch (_) { /* no hooks dir */ }
      if (!hook) return { ok: false, inconclusive: true, detail: 'cannot force an applied refresh: the SDK has no hook file to touch' };
      const original = fs.readFileSync(hook);
      restore = () => fs.writeFileSync(hook, original);
      fs.appendFileSync(hook, '\n# recon-refresh-probe (harness; reverted after the check)\n');
      // Incremental first (fast when parts are cached); an override-pull that
      // isn't re-runnable (e.g. `git clone … .` into a non-empty dir, seen
      // 2026-11-17) fails it, so fall back to the skill's own deterministic
      // default, a clean rebuild.
      let tr = run('sdkcraft', ['try'], { cwd: ctx.sdkDir, timeoutMs: 1_800_000 });
      if (tr.status !== 0) {
        run('sdkcraft', ['clean'], { cwd: ctx.sdkDir, timeoutMs: 600_000 });
        tr = run('sdkcraft', ['try'], { cwd: ctx.sdkDir, timeoutMs: 1_800_000 });
      }
      if (tr.status !== 0) {
        restore();
        return { ok: false, inconclusive: true, detail: `sdkcraft try for the forced refresh failed rc=${tr.status} ${tail(tr.out)}` };
      }
    }
    let ref;
    try {
      ref = run('workshop', ['refresh', ws], { cwd: project, timeoutMs: 900_000 });
    } finally {
      if (restore) restore();
    }
    if (ref.status !== 0) return { ok: false, detail: `workshop refresh failed rc=${ref.status} ${tail(ref.out)}` };
    if (/no updates available/i.test(ref.out)) {
      return { ok: false, inconclusive: true, detail: 'refresh did not apply ("no updates available"), so nothing was proven' };
    }
    const r = wsExec(ws, project, c.read_cmd);
    const kept = r.status === 0 && new RegExp(c.regex, 'm').test(r.out);
    if (!kept) return { ok: false, detail: `lost across refresh: rc=${r.status} ${tail(r.out)}` };
    if (c.control_read_cmd) {
      const ctl = wsExec(ws, project, c.control_read_cmd);
      if (ctl.status === 0) {
        return { ok: false, inconclusive: true, detail: 'kept, but the control file outside the mount also survived — refresh did not reset the writable filesystem' };
      }
    }
    return { ok: true, detail: 'kept across refresh' };
  },
};

// Returns { behavioral_pass, workshop, project, status, results[] }.
// behavioral_pass is null when there were no checks to run.
// ctx.sdkDir: the agent's SDK source (where sdkcraft.yaml lives), needed by
// persists_across_refresh to force an applied refresh.
function runBehaviorChecks(workshopName, checks, ctx = {}) {
  const summary = { behavioral_pass: null, workshop: workshopName, project: null, status: null, results: [] };
  if (!Array.isArray(checks) || checks.length === 0) return summary;
  const found = findWorkshop(workshopName);
  if (!found) {
    summary.behavioral_pass = false;
    summary.results = checks.map(c => ({ name: c.name, kind: c.kind, ok: false, detail: `workshop '${workshopName}' not found by workshop list --global` }));
    return summary;
  }
  summary.project = found.project;
  summary.status = found.status;
  if (found.status !== 'Ready') {
    summary.behavioral_pass = false;
    summary.results = checks.map(c => ({ name: c.name, kind: c.kind, ok: false, detail: `workshop status is ${found.status}, not Ready` }));
    return summary;
  }
  for (const c of checks) {
    const fn = KINDS[c.kind];
    let res;
    try {
      res = fn ? fn(c, workshopName, found.project, ctx) : { ok: false, detail: `unknown check kind '${c.kind}'` };
    } catch (e) {
      res = { ok: false, detail: `check threw: ${String(e && e.message || e)}` };
    }
    summary.results.push({ name: c.name, kind: c.kind, ...res });
  }
  summary.behavioral_pass = summary.results.every(r => r.ok);
  return summary;
}

module.exports = { runBehaviorChecks, findWorkshop, KINDS };
