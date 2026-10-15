import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { SiteUpdateStatus } from '../api/domains/account';
import { useToast } from './Toast';
import { formatDateTime } from '../utils/format';

/** The steps updatesite prints, in order, for a progress line while an update runs. */
const STEPS: { match: RegExp; label: string }[] = [
  { match: /Update asked for/, label: 'Starting' },
  { match: /Building v/, label: 'Building the new version (the site stays up)' },
  { match: /Maintenance mode is ON/, label: 'Maintenance page on' },
  { match: /Switching over/, label: 'Switching over' },
  { match: /Waiting for v/, label: 'Waiting for the new version to answer' },
  { match: /Reloading Caddy/, label: 'Applying the web server config' },
  { match: /Live on v/, label: 'Live' },
];

function stepOf(log: string) {
  let at = -1;
  STEPS.forEach((s, i) => {
    if (s.match.test(log)) at = i;
  });
  return at;
}

/**
 * Webmaster > Site controls > Site updates: check what's waiting on GitHub and update the live
 * site, optionally behind the maintenance page. The server's update agent does the work; this
 * only asks and shows its progress.
 */
export default function SiteUpdatePanel() {
  const { showToast } = useToast();
  const [s, setS] = useState<SiteUpdateStatus | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const loadedVersion = useRef<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.siteUpdate.status();
      loadedVersion.current ??= next.currentVersion;
      setS(next);
      setUnreachable(false);
    } catch {
      // Expected for a few seconds while the app container is swapped over.
      setUnreachable(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    api.twoFactor
      .status()
      .then((t) => setNeedsCode(t.enabled))
      .catch(() => undefined);
  }, [refresh]);

  // Poll while something is running or waiting to be picked up.
  const active = Boolean(s && (s.busy || s.pendingSince)) || unreachable;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [active, refresh]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [s?.log]);

  if (!s) return <div className="panel site-update">Checking the update agent…</div>;

  const check = async () => {
    setSending(true);
    try {
      setS(await api.siteUpdate.check());
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };
  const update = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      setS(await api.siteUpdate.update({ maintenance, password, code: needsCode ? code : undefined }));
      setPassword('');
      setCode('');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const info = s.info;
  const checked = info.action === 'check' && info.result === 'ok';
  const behind = checked ? Number(info.behind ?? 0) : null;
  const ahead = checked ? Number(info.ahead ?? 0) : 0;
  const dirty = checked ? Number(info.dirty ?? 0) : 0;
  const pendingFor = s.pendingSince ? (Date.now() - new Date(s.pendingSince).getTime()) / 1000 : 0;
  const updating = s.busy && s.state === 'updating';
  const step = updating || (info.action === 'update' && s.state !== 'idle') ? stepOf(s.log) : -1;
  const newVersionLive = info.action === 'update' && info.result === 'ok' && loadedVersion.current && s.currentVersion !== loadedVersion.current;
  const blocked = ahead > 0 || dirty > 0;

  return (
    <div className="panel site-update">
      <div className="panel-heading-row">
        <h3 style={{ margin: 0 }}>Site updates</h3>
        <span className="muted">Running v{s.currentVersion}</span>
      </div>

      {!s.installed ? (
        <div className="site-update-setup">
          <p>
            The update agent isn't set up on the server yet. It's a small helper that runs <code>updatesite</code> for this page, so the app itself never needs access to
            Docker. Set it up once over SSH, from the site's folder:
          </p>
          <pre className="site-update-cmd">./scripts/install-update-agent.sh</pre>
          <p className="muted">Full steps are in DEPLOY.md, "Updating from the Webmaster page".</p>
        </div>
      ) : (
        <>
          {unreachable && <p className="site-update-note">The site is restarting on the new version. This page carries on once it answers.</p>}
          {s.pendingSince && !s.busy && (
            <p className="site-update-note">
              {pendingFor > 45
                ? 'The server hasn\'t picked up the request yet. Check the agent is running: systemctl status elexprep-update.path'
                : 'Asked the server; waiting for it to start…'}
            </p>
          )}
          {s.stale && <p className="site-update-flag">The last run stopped part way through. Check the log below, then try again.</p>}

          <div className="site-update-check">
            <div>
              {s.state === 'checking' ? (
                <strong>Checking GitHub…</strong>
              ) : checked ? (
                behind === 0 ? (
                  <strong>Up to date.</strong>
                ) : (
                  <strong>
                    {behind} change{behind === 1 ? '' : 's'} waiting
                    {info.incomingVersion && info.incomingVersion !== s.currentVersion ? `: v${s.currentVersion} to v${info.incomingVersion}` : ''}.
                  </strong>
                )
              ) : info.action === 'check' && info.result === 'failed' ? (
                <strong className="error">The check failed: see the log.</strong>
              ) : (
                <span className="muted">{info.action === 'update' ? 'Not checked since the last update.' : 'Not checked yet.'}</span>
              )}
              {checked && info.finishedAt && (
                <div className="muted">
                  Checked {formatDateTime(info.finishedAt)} on {info.branch}
                  {info.upstream ? ` (from ${info.upstream})` : ''}.
                </div>
              )}
            </div>
            <button type="button" className="secondary" onClick={check} disabled={sending || s.busy || Boolean(s.pendingSince)}>
              Check for updates
            </button>
          </div>

          {blocked && (
            <p className="site-update-flag">
              {ahead > 0 && `The server has ${ahead} commit${ahead === 1 ? '' : 's'} GitHub doesn't, so a pull can't fast-forward. `}
              {dirty > 0 && `${dirty} file${dirty === 1 ? ' has' : 's have'} been changed by hand on the server. `}
              Sort it out over SSH before updating.
            </p>
          )}

          {checked && behind !== null && behind > 0 && (
            <div className="site-update-incoming">
              {s.incomingChangelog.length > 0 && (
                <ul className="site-update-changes">
                  {s.incomingChangelog.map((e) => (
                    <li key={e.version}>
                      <strong>v{e.version}</strong> <span className="muted">{e.date}</span>
                      <ul>
                        {[...e.notes, ...e.sections.flatMap((sec) => sec.notes.map((n) => `${n} (${sec.title})`))].map((n, i) => (
                          <li key={i}>{n.replace(/^[+-] /, '')}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
              <details>
                <summary>
                  {s.incoming.length} commit{s.incoming.length === 1 ? '' : 's'}
                </summary>
                <ul className="site-update-commits">
                  {s.incoming.map((c) => (
                    <li key={c.sha}>
                      <code>{c.sha}</code> {c.subject}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          {(updating || step >= 0) && (
            <ol className="site-update-steps" aria-label="Update progress">
              {STEPS.filter((x) => x.label !== 'Maintenance page on' || info.maintenance === 'true')
                .filter((x) => x.label !== 'Applying the web server config' || /Reloading Caddy/.test(s.log))
                .map((x) => {
                  const i = STEPS.indexOf(x);
                  const done = i < step || (i === step && s.state === 'done');
                  const now = i === step && updating;
                  return (
                    <li key={x.label} className={done ? 'is-done' : now ? 'is-now' : ''}>
                      {x.label}
                    </li>
                  );
                })}
            </ol>
          )}
          {info.action === 'update' && !s.busy && info.result === 'ok' && (
            <p className="site-update-ok">
              Updated to v{info.toVersion}
              {info.finishedAt ? ` at ${formatDateTime(info.finishedAt)}` : ''}.
              {newVersionLive && (
                <>
                  {' '}
                  <button type="button" className="link-button" onClick={() => window.location.reload()}>
                    Reload to use it
                  </button>
                </>
              )}
            </p>
          )}
          {info.action === 'update' && !s.busy && info.result === 'failed' && (
            <p className="site-update-flag">
              The update didn't finish: still on v{s.currentVersion}. The log below says why.
              {info.maintenance === 'true' ? ' The maintenance page has been turned off again.' : ''}
            </p>
          )}

          <form className="site-update-form" onSubmit={update}>
            <label className="check-field">
              <input type="checkbox" checked={maintenance} onChange={(e) => setMaintenance(e.target.checked)} />
              <span>Show the maintenance page during the switch-over (for big changes such as a large database migration)</span>
            </label>
            <div className="site-update-auth">
              <label className="field">
                <span className="field-label">Your password</span>
                <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              {needsCode && (
                <label className="field">
                  <span className="field-label">Authenticator code</span>
                  <input name="one-time-code" type="text" inputMode="numeric" autoComplete="one-time-code" autoCorrect="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} required maxLength={8} />
                </label>
              )}
              <button type="submit" disabled={sending || s.busy || Boolean(s.pendingSince) || !password || blocked}>
                {behind === 0 ? 'Rebuild and restart' : info.incomingVersion && checked ? `Update to v${info.incomingVersion}` : 'Update the site'}
              </button>
            </div>
            <p className="muted">
              Pulls the latest code, builds it while the site stays up, then swaps over in a few seconds.
              {maintenance ? ' Everyone sees the maintenance page during the swap, you included; this page comes back when the site does.' : ''}
            </p>
          </form>

          {s.log.trim() && (
            <details className="site-update-log" open={s.busy || s.state === 'failed'}>
              <summary>Log of the last {info.action === 'check' ? 'check' : 'update'}</summary>
              <pre ref={logRef}>{s.log}</pre>
            </details>
          )}

          {s.history.length > 0 && (
            <details className="site-update-history">
              <summary>Recent updates</summary>
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Version</th>
                    <th>Result</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {s.history.map((h, i) => (
                    <tr key={i}>
                      <td>{formatDateTime(h.at)}</td>
                      <td>
                        v{h.from} to v{h.to}
                        {h.maintenance ? ' (maintenance page)' : ''}
                      </td>
                      <td>{h.result === 'ok' ? 'Done' : 'Failed'}</td>
                      <td>{h.by ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </div>
  );
}
