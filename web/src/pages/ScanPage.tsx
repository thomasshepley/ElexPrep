import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, type PrepConfigPublic, type PrepJobOption, type PrepScan } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLiveJob } from '../hooks/useLiveJob';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import { formatTime } from '../utils/format';
import { playScanTone, toneFor, unlockScanAudio } from '../utils/scanFeedback';

const PAIRED_BAY_KEY = 'elex-scan-bay';
const PICKED_JOB_KEY = 'elex-scan-job';
const QUEUE_KEY = 'elex-scan-queue';

interface QueuedScan {
  code: string;
  jobId: string;
  bay: string | null;
  at: string;
}

const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Private mode: pairing lasts until the page closes.
    }
  },
};

function readQueue(): QueuedScan[] {
  try {
    return JSON.parse(store.get(QUEUE_KEY) ?? '[]') as QueuedScan[];
  } catch {
    return [];
  }
}

/**
 * The phone scanner. Opened by scanning a bay screen's pairing QR (which carries the bay's code),
 * it scans with the camera and sends each code to the job that bay is showing, so the TV updates
 * as the phone scans. Without a bay it can scan into any job the person is on. Scans made with no
 * signal wait on the phone and send themselves when it reconnects.
 */
export default function ScanPage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.role === 'SIGNAGE') {
    return (
      <div className="scan-page">
        <p className="scan-banner is-bad">This is a screen account. Sign in on the phone with your own account to scan.</p>
      </div>
    );
  }
  return <Scanner />;
}

type DetectorLike = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

const FORMATS = ['qr_code', 'code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix', 'itf'];

/** The browser's own BarcodeDetector where it has one (Chrome on Android), else the bundled
 * zxing decoder, served from this site rather than a CDN. */
async function makeDetector(): Promise<DetectorLike> {
  const native = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): DetectorLike; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (native) {
    try {
      const supported = (await native.getSupportedFormats?.()) ?? FORMATS;
      return new native({ formats: FORMATS.filter((f) => supported.includes(f)) });
    } catch {
      // Fall through to the bundled decoder.
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ]);
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasm.default : prefix + path) } });
  return new BarcodeDetector({ formats: FORMATS as never });
}

function Scanner() {
  const { user } = useAuth();
  const doneTo = user?.role === 'CREW' ? '/crew' : '/';
  const location = useLocation();
  const navigate = useNavigate();
  const [bayToken, setBayToken] = useState<string | null>(() => store.get(PAIRED_BAY_KEY));
  const [pair, setPair] = useState<{ bay: { id: string; name: string }; job: { id: string; name: string } | null; config: PrepConfigPublic } | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pickedJob, setPickedJob] = useState<string | null>(() => store.get(PICKED_JOB_KEY));
  const [jobs, setJobs] = useState<PrepJobOption[] | null>(null);
  const [progress, setProgress] = useState<{ pulled: number; required: number; name: string } | null>(null);
  const [scans, setScans] = useState<PrepScan[]>([]);
  const [banner, setBanner] = useState<{ text: string; tone: string } | null>(null);
  const [queued, setQueued] = useState(() => readQueue().length);
  const [camera, setCamera] = useState<'off' | 'starting' | 'on' | 'error'>('off');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastCode = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  // A pairing link (/scan?bay=...) replaces any earlier pairing, then the code leaves the address bar.
  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get('bay');
    if (fromUrl) {
      store.set(PAIRED_BAY_KEY, fromUrl);
      setBayToken(fromUrl);
      navigate('/scan', { replace: true });
    }
  }, [location.search, navigate]);

  const loadPair = useCallback(async () => {
    if (!bayToken) return;
    try {
      setPair(await api.bays.pair(bayToken));
      setPairError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        store.set(PAIRED_BAY_KEY, null);
        setBayToken(null);
        setPair(null);
      }
      setPairError((e as Error).message);
    }
  }, [bayToken]);

  useEffect(() => {
    void loadPair();
  }, [loadPair]);

  useEffect(() => {
    if (!bayToken || pair?.job) return;
    api.bays
      .jobs({ phone: true })
      .then(setJobs)
      .catch(() => setJobs([]));
  }, [bayToken, pair?.job]);

  const jobId = pair?.job?.id ?? (bayToken ? null : pickedJob);
  const jobName = pair?.job?.name ?? jobs?.find((j) => j.id === jobId)?.name ?? null;

  const loadProgress = useCallback(async () => {
    if (!jobId) return setProgress(null);
    try {
      const v = await api.prepJob.view(jobId, { phone: true });
      setProgress({ pulled: v.totals.pulled, required: v.totals.required, name: v.job.name });
    } catch {
      // Keep the last numbers.
    }
  }, [jobId]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  useLiveJob({
    jobId,
    bayToken,
    onChange: () => void loadProgress(),
    onBay: () => void loadPair(),
    pollMs: 30_000,
  });

  const show = useCallback(
    (scan: PrepScan) => {
      setScans((s) => [scan, ...s].slice(0, 5));
      const tone = toneFor(scan.result);
      setBanner({ text: scan.message, tone });
      if (pair?.config.sound !== false) playScanTone(tone);
      navigator.vibrate?.(tone === 'good' ? 60 : [200, 80, 200]);
    },
    [pair?.config.sound]
  );

  const flushQueue = useCallback(async () => {
    const queue = readQueue();
    if (queue.length === 0) return;
    const remaining: QueuedScan[] = [];
    for (const q of queue) {
      try {
        show(await api.prepJob.scan(q.jobId, q.code, 'PHONE', { phone: true, bay: q.bay }));
      } catch (e) {
        if (e instanceof ApiError) continue; // The server answered: drop it, it can't succeed by retrying.
        remaining.push(q);
      }
    }
    store.set(QUEUE_KEY, JSON.stringify(remaining));
    setQueued(remaining.length);
  }, [show]);

  useEffect(() => {
    void flushQueue();
    window.addEventListener('online', flushQueue);
    const t = setInterval(flushQueue, 10_000);
    return () => {
      window.removeEventListener('online', flushQueue);
      clearInterval(t);
    };
  }, [flushQueue]);

  const send = useCallback(
    async (code: string) => {
      if (!jobId) {
        setBanner({ text: 'Choose a job first', tone: 'bad' });
        playScanTone('bad');
        return;
      }
      try {
        const result = await api.prepJob.scan(jobId, code, 'PHONE', { phone: true, bay: bayToken });
        show(result);
        void loadProgress();
      } catch (e) {
        if (e instanceof ApiError) {
          setBanner({ text: e.message, tone: 'bad' });
          playScanTone('bad');
          return;
        }
        // No signal: keep it and send it later.
        const queue = [...readQueue(), { code, jobId, bay: bayToken, at: new Date().toISOString() }];
        store.set(QUEUE_KEY, JSON.stringify(queue));
        setQueued(queue.length);
        setBanner({ text: `No signal. ${code} will send when you're back online.`, tone: 'warn' });
        playScanTone('warn');
      }
    },
    [jobId, bayToken, show, loadProgress]
  );

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera('off');
  }, []);

  const startCamera = useCallback(async () => {
    unlockScanAudio();
    setCamera('starting');
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamera('on');
    } catch (e) {
      setCamera('error');
      setCameraError(
        (e as Error).name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in the browser settings for this site.' : `The camera could not start (${(e as Error).message}).`
      );
    }
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  // Decode a frame every 150 ms while the camera is on; the same code is ignored for 2.5 s.
  useEffect(() => {
    if (camera !== 'on') return;
    let cancelled = false;
    let detector: DetectorLike | null = null;
    let busy = false;
    makeDetector()
      .then((d) => {
        detector = d;
      })
      .catch((e) => {
        setCamera('error');
        setCameraError(`The barcode reader could not load (${(e as Error).message}).`);
      });
    const t = setInterval(async () => {
      const video = videoRef.current;
      if (cancelled || busy || !detector || !video || video.readyState < 2) return;
      busy = true;
      try {
        const found = await detector.detect(video);
        const code = found[0]?.rawValue?.trim();
        if (code && !(code === lastCode.current.code && Date.now() - lastCode.current.at < 2500)) {
          lastCode.current = { code, at: Date.now() };
          // Another bay's pairing QR re-pairs the phone instead of counting as a scan.
          const pairMatch = code.match(/\/scan\?bay=([^&\s]+)/);
          if (pairMatch) {
            const token = decodeURIComponent(pairMatch[1]);
            store.set(PAIRED_BAY_KEY, token);
            setBayToken(token);
          } else await send(code);
        }
      } catch {
        // A frame that can't be read; try the next one.
      } finally {
        busy = false;
      }
    }, 150);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [camera, send]);

  const unpair = () => {
    store.set(PAIRED_BAY_KEY, null);
    setBayToken(null);
    setPair(null);
  };

  return (
    <div className="scan-page" onPointerDown={unlockScanAudio}>
      <header className="scan-header">
        <div>
          <h1>{jobName ?? 'Scanner'}</h1>
          <p className="muted">
            {pair ? `Paired with ${pair.bay.name}` : bayToken ? (pairError ? `Could not reach the bay: ${pairError}` : 'Pairing…') : 'Not paired with a bay'}
            {progress ? ` · ${progress.pulled} of ${progress.required} pulled` : ''}
          </p>
        </div>
        <Link to={doneTo} className="button secondary">
          Done
        </Link>
      </header>

      {bayToken && pair && !pair.job && (
        <p className="scan-banner is-warn">{pair.bay.name} has no job open. Sign in on the bay screen and choose one.</p>
      )}
      {!bayToken && (
        <div className="panel">
          <p>Scan the pairing code on a bay screen (tap Pair phone on the TV) so your scans show up there. Or pick one of your jobs to scan into:</p>
          {jobs === null ? (
            <SkeletonList items={3} />
          ) : jobs.length === 0 ? (
            <p className="muted">You are not on any upcoming jobs.</p>
          ) : (
            <select
              value={pickedJob ?? ''}
              onChange={(e) => {
                setPickedJob(e.target.value || null);
                store.set(PICKED_JOB_KEY, e.target.value || null);
              }}
              aria-label="Job to scan into"
            >
              <option value="">Choose a job</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className={`scan-viewport is-${camera}`}>
        <video ref={videoRef} playsInline muted aria-label="Camera" />
        {camera !== 'on' && (
          <div className="scan-viewport-cover">
            {camera === 'starting' ? (
              <Skeleton w="100%" h="100%" r={14} />
            ) : (
              <button type="button" className="scan-start" onClick={startCamera}>
                {camera === 'error' ? 'Try the camera again' : 'Start camera'}
              </button>
            )}
          </div>
        )}
        {camera === 'on' && <div className="scan-aim" aria-hidden="true" />}
      </div>
      {cameraError && <p className="error">{cameraError}</p>}
      {camera === 'on' && (
        <button type="button" className="secondary" onClick={stopCamera}>
          Stop camera
        </button>
      )}

      <div className={`scan-banner${banner ? ` is-${banner.tone}` : ''}`} aria-live="assertive">
        {banner?.text ?? 'Point the camera at a barcode'}
      </div>
      {queued > 0 && <p className="scan-banner is-warn">{queued} {queued === 1 ? 'scan is' : 'scans are'} waiting for signal</p>}

      <form
        className="scan-manual"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) void send(manual.trim());
          setManual('');
        }}
      >
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type a barcode" aria-label="Type a barcode" autoCapitalize="characters" />
        <button type="submit">Send</button>
      </form>

      {scans.length > 0 && (
        <ul className="scan-list">
          {scans.map((s) => (
            <li key={s.id} className={`is-${toneFor(s.result)}`}>
              <span>{s.message}</span>
              <span className="muted">{formatTime(new Date(s.at))}</span>
            </li>
          ))}
        </ul>
      )}
      {bayToken && (
        <button type="button" className="link-button" onClick={unpair}>
          Unpair from {pair?.bay.name ?? 'this bay'}
        </button>
      )}
    </div>
  );
}
