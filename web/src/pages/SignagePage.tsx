import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import QRCode from 'qrcode';
import type { PickListDiff } from '@elexprep/shared';
import { api, ApiError, bayStore, type BayInfo, type PrepJobOption, type PrepLine, type PrepScan, type PrepView } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import { SignOutIcon } from '../components/Icons';
import { Skeleton, SkeletonList, SkeletonRegion } from '../components/Skeleton';
import PrepScreen from '../components/prepBay/PrepScreen';
import ItemsDiffOverlay from '../components/prepBay/ItemsDiffOverlay';
import { useLiveJob } from '../hooks/useLiveJob';
import { useScannerInput } from '../hooks/useScannerInput';
import { formatDate, formatTime } from '../utils/format';
import { playScanTone, toneFor, unlockScanAudio } from '../utils/scanFeedback';

/**
 * The prep-bay screen: a TV at a bay, signed in as a prep or signage account. On first boot it
 * asks which bay it is; then a crew member signs in on the screen itself (a second sign-in that
 * leaves the screen's own login alone) and sees only the jobs they are on. Scans come from a
 * scanner plugged into the screen's computer or from a phone paired with the bay's QR code, and
 * every screen and phone on the job updates live.
 */
export default function SignagePage() {
  const { user, loading, logout } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'CREW') return <Navigate to="/scan" replace />;
  // The screen's own way out, kept small: in the header once the bay is running, in the corner before.
  const exit = (
    <>
      {user.role !== 'SIGNAGE' && (
        <Link to="/" className="button secondary">
          Back to portal
        </Link>
      )}
      <button type="button" className="secondary" onClick={logout}>
        <SignOutIcon /> Sign out screen
      </button>
    </>
  );
  return <BayScreen isAdmin={isAdminRole(user.role)} exit={exit} />;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Keeps the TV from sleeping while the page is open (re-asked whenever the tab comes back). */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const request = () => {
      if (document.visibilityState !== 'visible' || !nav.wakeLock) return;
      nav.wakeLock
        .request('screen')
        .then((l) => {
          lock = l;
        })
        .catch(() => {});
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, []);
}

function BayScreen({ isAdmin, exit }: { isAdmin: boolean; exit: React.ReactNode }) {
  const [bayToken, setBayToken] = useState(() => bayStore.bayToken());
  const [bay, setBay] = useState<BayInfo | null>(null);
  const [bayError, setBayError] = useState<string | null>(null);
  useWakeLock();

  const loadBay = useCallback(async () => {
    if (!bayStore.bayToken()) return;
    // Only forget the sign-in if this request carried it and it was refused; a reply to a request
    // sent before a sign-in finished must not wipe the token that sign-in just stored.
    const sentOperator = bayStore.operatorToken();
    try {
      const info = await api.bays.current();
      if (sentOperator && !info.operator && bayStore.operatorToken() === sentOperator) bayStore.setOperatorToken(null);
      if (!info.operator && bayStore.operatorToken() && bayStore.operatorToken() !== sentOperator) return;
      setBay(info);
      setBayError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        bayStore.setBayToken(null);
        bayStore.setOperatorToken(null);
        setBayToken(null);
        setBay(null);
      } else setBayError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadBay();
  }, [bayToken, loadBay]);

  const cornerExit = <div className="signage-exit">{exit}</div>;
  if (!bayToken) {
    return (
      <>
      {cornerExit}
      <BaySetup
        isAdmin={isAdmin}
        onClaimed={(token) => {
          bayStore.setBayToken(token);
          setBayToken(token);
        }}
      />
      </>
    );
  }
  if (!bay) {
    return (
      <div className="bay-center">
        {cornerExit}
        <div className="bay-panel">
          {bayError ? (
            <p className="error">Could not reach the server: {bayError}. Retrying…</p>
          ) : (
            <SkeletonRegion>
              <Skeleton w="60%" h={34} style={{ marginBottom: 16 }} />
              <SkeletonList items={3} />
            </SkeletonRegion>
          )}
          {bayError && <RetryEvery ms={10_000} run={loadBay} />}
        </div>
      </div>
    );
  }
  return <BayLive bay={bay} reloadBay={loadBay} exit={exit} />;
}

function RetryEvery({ ms, run }: { ms: number; run: () => void }) {
  useEffect(() => {
    const t = setInterval(run, ms);
    return () => clearInterval(t);
  }, [ms, run]);
  return null;
}

/** First boot: which bay is this screen? */
function BaySetup({ isAdmin, onClaimed }: { isAdmin: boolean; onClaimed: (token: string) => void }) {
  const [bays, setBays] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.bays
      .list()
      .then(setBays)
      .catch((e) => setError((e as Error).message));
  }, []);
  return (
    <div className="bay-center">
      <div className="bay-panel">
        <h1>Which bay is this screen?</h1>
        <p className="bay-card-sub">This screen remembers its bay, so you only do this once.</p>
        {error && <p className="error">{error}</p>}
        {!bays && !error && <SkeletonList items={3} />}
        {bays?.map((b) => (
          <button key={b.id} type="button" className="bay-option" onClick={async () => onClaimed((await api.bays.claim(b.id)).token)}>
            {b.name}
          </button>
        ))}
        {bays?.length === 0 && (
          <p className="bay-card-sub">
            No bays are set up yet.{' '}
            {isAdmin ? (
              <Link to="/settings/prep-bays">Add one in Settings, Prep bays.</Link>
            ) : (
              'Ask an admin to add one in Settings, Prep bays.'
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function BayLive({ bay, reloadBay, exit }: { bay: BayInfo; reloadBay: () => Promise<void>; exit: React.ReactNode }) {
  const now = useClock();
  const [view, setView] = useState<PrepView | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<PrepScan | null>(null);
  const [flash, setFlash] = useState<{ tone: string; key: number } | null>(null);
  const [diff, setDiff] = useState<PickListDiff | null>(null);
  const [showPair, setShowPair] = useState(false);
  const [choosingJob, setChoosingJob] = useState(false);
  const seenScans = useRef(new Set<string>());
  const failures = useRef(0);
  const lastActivity = useRef(Date.now());
  const operator = bay.operator;
  const jobId = choosingJob ? null : bay.currentJobId;

  const loadView = useCallback(async () => {
    if (!bay.currentJobId) return;
    try {
      const v = await api.prepJob.view(bay.currentJobId);
      setView(v);
      setViewError(null);
      failures.current = 0;
      if (v.job.hasRmsDiff) {
        const d = await api.prepJob.diff(bay.currentJobId).catch(() => null);
        if (d?.diff) setDiff(d.diff);
      }
    } catch (e) {
      setViewError((e as Error).message);
      failures.current++;
      // After about five minutes of failures with the network up, start afresh.
      if (failures.current >= 10 && navigator.onLine) window.location.reload();
    }
  }, [bay.currentJobId]);

  useEffect(() => {
    setView(null);
    setDiff(null);
    setLastScan(null);
    void loadView();
  }, [loadView]);

  const showScan = useCallback(
    (scan: PrepScan) => {
      if (seenScans.current.has(scan.id)) return;
      seenScans.current.add(scan.id);
      setLastScan(scan);
      const tone = toneFor(scan.result);
      setFlash({ tone, key: Date.now() });
      if (bay.config.sound) playScanTone(tone);
    },
    [bay.config.sound]
  );

  const live = useLiveJob({
    jobId: bay.currentJobId,
    bayToken: bay.token,
    onChange: () => void loadView(),
    onScan: showScan,
    onBay: () => void reloadBay(),
    onRmsDiff: () => {
      if (bay.currentJobId) api.prepJob.diff(bay.currentJobId).then((d) => d.diff && setDiff(d.diff)).catch(() => {});
    },
  });

  // The idle timer runs on the server; this tells it someone is still here.
  useEffect(() => {
    if (!operator) return;
    const mark = () => {
      lastActivity.current = Date.now();
    };
    window.addEventListener('pointerdown', mark);
    window.addEventListener('keydown', mark);
    const t = setInterval(() => {
      if (Date.now() - lastActivity.current < 60_000) {
        api.bays.operatorPing().catch((e) => {
          if (e instanceof ApiError && e.status === 401) void reloadBay();
        });
      }
    }, 60_000);
    return () => {
      window.removeEventListener('pointerdown', mark);
      window.removeEventListener('keydown', mark);
      clearInterval(t);
    };
  }, [operator, reloadBay]);

  const switchJob = useCallback(
    async (id: string | null) => {
      await api.bays.setJob(id);
      setChoosingJob(false);
      await reloadBay();
    },
    [reloadBay]
  );

  const scan = useCallback(
    async (code: string) => {
      lastActivity.current = Date.now();
      if (!operator) {
        showScan({ id: `local-${Date.now()}`, code, kind: 'UNKNOWN', result: 'LOCKED', message: 'Sign in on the screen first', source: 'HID', by: null, at: new Date().toISOString() });
        return;
      }
      if (!bay.currentJobId) return;
      try {
        const result = await api.prepJob.scan(bay.currentJobId, code, 'HID');
        showScan(result);
        if (result.result === 'SWITCH_JOB' && result.switchToJobId) await switchJob(result.switchToJobId).catch(() => {});
      } catch (e) {
        showScan({ id: `err-${Date.now()}`, code, kind: 'UNKNOWN', result: 'UNKNOWN', message: (e as Error).message, source: 'HID', by: null, at: new Date().toISOString() });
      }
    },
    [operator, bay.currentJobId, showScan, switchJob]
  );

  useScannerInput({ onScan: (c) => void scan(c), prefix: bay.config.scannerPrefix, suffix: bay.config.scannerSuffix, enabled: Boolean(bay.currentJobId) || !operator });

  const signOut = async () => {
    await api.bays.operatorLogout().catch(() => {});
    bayStore.setOperatorToken(null);
    await reloadBay();
  };

  const adjust = async (line: PrepLine, change: { delta?: 1 | -1; short?: number; shortNote?: string | null }) => {
    if (!bay.currentJobId) return;
    const res = await api.prepJob.adjust(bay.currentJobId, { lineKey: line.key, ...change });
    showScan(res.scan);
    await loadView();
  };

  const header = (
    <header className="bay-header">
      {view?.job.hasLogo && bay.currentJobId && <img src={api.jobs.logoUrl(bay.currentJobId)} alt="" className="bay-logo" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      <div className="bay-title">
        <h1>{bay.currentJobId && view ? view.job.name : bay.name}</h1>
        <p>
          {bay.currentJobId && view ? `${bay.name}${view.job.venue ? ` · ${view.job.venue}` : ''}` : 'Prep bay'}
        </p>
      </div>
      <div className="bay-status">
        <span className={`bay-chip ${live === 'live' ? 'bay-chip-green' : 'bay-chip-grey'}`}>{live === 'live' ? 'Live' : 'Reconnecting'}</span>
        {operator && <span className="bay-chip">{operator.displayName}</span>}
        {view && view.source !== 'RMS' && view.job.linked && <span className="bay-chip bay-chip-amber">Current RMS offline</span>}
      </div>
      <div className="bay-clock">
        <span>{formatTime(now)}</span>
        <span className="bay-card-sub">{formatDate(now)}</span>
      </div>
      <div className="bay-header-actions">
        <button type="button" className="bay-button" onClick={() => setShowPair(true)}>
          Pair phone
        </button>
        {operator && (
          <>
            <button type="button" className="bay-button" onClick={() => setChoosingJob(true)}>
              Change job
            </button>
            <button type="button" className="bay-button" onClick={signOut}>
              Sign out {operator.displayName.split(' ')[0]}
            </button>
          </>
        )}
        <div className="bay-screen-exit">{exit}</div>
      </div>
    </header>
  );

  let body: React.ReactNode;
  if (!operator) {
    body = <OperatorSignIn bay={bay} view={bay.currentJobId ? view : null} onSignedIn={reloadBay} />;
  } else if (!jobId) {
    body = <JobChooser current={bay.currentJobId} onPick={switchJob} onCancel={bay.currentJobId ? () => setChoosingJob(false) : undefined} />;
  } else if (!view) {
    body = (
      <main className="bay-main">
        {viewError ? (
          <p className="error">Could not load this job: {viewError}</p>
        ) : (
          <SkeletonRegion className="bay-left">
            <Skeleton h={160} r={14} style={{ marginBottom: 20 }} />
            <SkeletonList items={6} itemHeight={70} />
          </SkeletonRegion>
        )}
      </main>
    );
  } else {
    body = (
      <PrepScreen
        view={view}
        lastScan={lastScan}
        locked={view.session?.status !== undefined && view.session.status !== 'OPEN'}
        canAct={Boolean(operator)}
        onAdjust={adjust}
        onCasePacked={async (caseId, packed) => {
          await api.prepJob.setCasePacked(bay.currentJobId!, caseId, packed);
          await loadView();
        }}
        onSignOff={async () => {
          await api.prepJob.signOff(bay.currentJobId!);
          await loadView();
        }}
        onTransport={async () => {
          await api.prepJob.transport(bay.currentJobId!);
          await loadView();
        }}
      />
    );
  }

  return (
    <div className="bay" onPointerDown={unlockScanAudio}>
      {flash && <div key={flash.key} className={`bay-flash is-${flash.tone}`} aria-hidden="true" />}
      {diff && view && (
        <ItemsDiffOverlay
          diff={diff}
          lines={view.groups.flatMap((g) => g.lines)}
          onDismiss={() => {
            setDiff(null);
            if (bay.currentJobId) api.prepJob.acknowledgeDiff(bay.currentJobId).catch(() => {});
          }}
        />
      )}
      {header}
      {body}
      {showPair && <PairPhone bay={bay} onClose={() => setShowPair(false)} />}
    </div>
  );
}

/** The crew sign-in on the screen. Uses the person's normal portal login (and 2FA code). */
function OperatorSignIn({ bay, view, onSignedIn }: { bay: BayInfo; view: PrepView | null; onSignedIn: () => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    unlockScanAudio();
    setBusy(true);
    setError(null);
    try {
      const res = await api.bays.operatorLogin({ username, password, ...(needsCode ? (code.length > 6 ? { backupCode: code } : { code }) : {}) });
      if (res.requiresTotp) {
        setNeedsCode(true);
        return;
      }
      if (res.token) {
        bayStore.setOperatorToken(res.token);
        setPassword('');
        setCode('');
        await onSignedIn();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="bay-center bay-signin">
      <form className="bay-panel" onSubmit={submit}>
        <h1>Sign in to start prepping</h1>
        <p className="bay-card-sub">Use your own portal login. You will see the jobs you are on.</p>
        {!needsCode ? (
          <>
            <label className="bay-label">
              Username
              <input className="bay-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
            </label>
            <label className="bay-label">
              Password
              <input className="bay-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" required />
            </label>
          </>
        ) : (
          <label className="bay-label">
            Two-factor code (or a backup code)
            <input className="bay-input" value={code} onChange={(e) => setCode(e.target.value.trim())} inputMode="numeric" autoComplete="one-time-code" autoFocus required />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="bay-sheet-row">
          {needsCode && (
            <button
              type="button"
              className="bay-button"
              onClick={() => {
                setNeedsCode(false);
                setCode('');
              }}
            >
              Back
            </button>
          )}
          <button type="submit" className="bay-button bay-button-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
      {view && (
        <div className="bay-panel bay-idle-job">
          <span className="bay-next-label">{bay.name} is on</span>
          <h2>{view.job.name}</h2>
          <div className="bay-progress">
            <div className="bay-progress-fill" style={{ width: `${view.totals.required ? (view.totals.pulled / view.totals.required) * 100 : 0}%` }} />
          </div>
          <p className="bay-card-sub">
            {view.totals.pulled} of {view.totals.required} pulled
            {view.session?.status === 'AWAITING_TRANSPORT' ? ' · awaiting transport' : view.session?.status === 'BOOKED_OUT' ? ' · booked out' : ''}
          </p>
        </div>
      )}
    </main>
  );
}

const STATUS_LABEL: Record<string, string> = { OPEN: 'Prepping', AWAITING_TRANSPORT: 'Awaiting transport', BOOKED_OUT: 'Booked out' };

function JobChooser({ current, onPick, onCancel }: { current: string | null; onPick: (id: string) => Promise<void>; onCancel?: () => void }) {
  const [jobs, setJobs] = useState<PrepJobOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.bays
      .jobs()
      .then(setJobs)
      .catch((e) => setError((e as Error).message));
  }, []);
  return (
    <main className="bay-center">
      <div className="bay-panel bay-panel-wide">
        <h1>Choose a job to prep</h1>
        {error && <p className="error">{error}</p>}
        {!jobs && !error && <SkeletonList items={4} itemHeight={70} />}
        {jobs?.length === 0 && <p className="bay-card-sub">You are not on any upcoming jobs. Ask the office to add you to the job's crew.</p>}
        <div className="bay-job-list">
          {jobs?.map((j) => (
            <button key={j.id} type="button" className={`bay-option${j.id === current ? ' is-current' : ''}`} onClick={() => onPick(j.id)}>
              <span className="bay-option-name">{j.name}</span>
              <span className="bay-card-sub">
                {j.startsAt ? formatDate(j.startsAt) : 'No date'}
                {j.venue ? ` · ${j.venue}` : ''}
              </span>
              {j.prep && <span className={`bay-chip${j.prep.flagged ? ' bay-chip-amber' : ''}`}>{STATUS_LABEL[j.prep.status]}</span>}
            </button>
          ))}
        </div>
        {onCancel && (
          <button type="button" className="bay-button" onClick={onCancel}>
            Back
          </button>
        )}
      </div>
    </main>
  );
}

/** A QR the phone camera opens: the phone scanner page, paired to this bay. */
function PairPhone({ bay, onClose }: { bay: BayInfo; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const url = `${window.location.origin}/scan?bay=${encodeURIComponent(bay.token)}`;
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 520, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => {});
  }, [url]);
  return (
    <div className="bay-sheet-backdrop" onClick={onClose}>
      <div className="bay-sheet bay-pair" role="dialog" aria-label="Pair a phone" onClick={(e) => e.stopPropagation()}>
        <h2>Scan with a phone to pair it with {bay.name}</h2>
        {src ? <img src={src} alt="Pairing code" width={360} height={360} /> : <Skeleton w={360} h={360} />}
        <p className="bay-card-sub">Open the camera, scan this, and sign in. Scans from that phone show up here.</p>
        <button type="button" className="bay-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
