import { Skeleton, SkeletonPanel, SkeletonRegion } from './Skeleton';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toLocationColorMapEntry, type LocationColorMap } from '@elexprep/shared';
import { api, type Job, type PrintQueueItem, type AdHocLabel, type PrintJob, type PrintMethod } from '../api/client';
import LabelTypeSection, { summarize } from './printQueue/LabelTypeSection';
import PrintConfirmModal from './printQueue/PrintConfirmModal';
import { useDialog } from './Dialog';
import { useToast } from './Toast';
import { labelTypeName } from '../utils/labelTypes';

export default function PrintQueuePanel({ jobId, groupId = null }: { jobId: string; groupId?: string | null }) {
  const dialog = useDialog();
  const { showToast } = useToast();
  const [queue, setQueue] = useState<PrintQueueItem[]>([]);
  // The queue and the printer settings both shape this page - hold a skeleton until both arrive.
  const [queueReady, setQueueReady] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [adHoc, setAdHoc] = useState<AdHocLabel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trayMap, setTrayMap] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<PrintMethod>('DRY_RUN');
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locationColors, setLocationColors] = useState<LocationColorMap>(new Map());
  const [job, setJob] = useState<Job | null>(null);
  const [confirmingPrint, setConfirmingPrint] = useState(false);

  const refresh = () =>
    api.printQueue
      .list(jobId)
      .then(({ queue, adHoc }) => {
        setQueue(queue);
        setAdHoc(adHoc);
      })
      .finally(() => setQueueReady(true));

  const refreshPrintJobs = () => api.printJobs.list(jobId).then(setPrintJobs);

  // Re-selects "every pending item in the current stage" whenever the queue is refreshed or
  // the stage tab changes - selection is scoped to what's actually visible, so confirming
  // never silently includes another stage's items that aren't shown here.
  useEffect(() => {
    setSelected(new Set(queue.filter((q) => q.status === 'PENDING' && (q.groupId ?? null) === groupId).map((q) => q.id)));
  }, [queue, groupId]);

  useEffect(() => {
    refresh();
    refreshPrintJobs();
    api.jobs.get(jobId).then(setJob).catch(() => {});
    api.printQueue
      .printerConfig(jobId)
      .then((c) => {
        setTrayMap(c.trayMap);
        setMethod(c.method);
      })
      .finally(() => setConfigReady(true));
    Promise.all([api.locationColorRules.list(), api.jobLocationColorRules.list(jobId)]).then(([global, job]) => {
      const map: LocationColorMap = new Map(global.map(toLocationColorMapEntry));
      for (const rule of job) {
        const [key, value] = toLocationColorMapEntry(rule);
        map.set(key, value);
      }
      setLocationColors(map);
    });
  }, [jobId]);

  const build = async () => {
    setBusy(true);
    try {
      await api.printQueue.build(jobId, { includeFixtureLabels: true, includePalLabels: true });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeMany = async (ids: { queueIds?: string[]; adHocIds?: string[] }, success: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.printQueue.removeMany(jobId, ids);
      await refresh();
      showToast(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeSelected = async () => {
    const ids = pendingItems.filter((q) => selected.has(q.id)).map((q) => q.id);
    if (ids.length === 0) return;
    const ok = await dialog.confirm({
      title: `Remove ${ids.length} label${ids.length === 1 ? '' : 's'} from the queue?`,
      message: 'They can be added back with "Build from patch + cases".',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) await removeMany({ queueIds: ids }, `Removed ${ids.length} from the queue`);
  };

  const clearQueue = async () => {
    const queueIds = pendingItems.map((q) => q.id);
    const adHocIds = stageAdHoc.map((a) => a.id);
    const parts = [
      queueIds.length > 0 && `${queueIds.length} queued label${queueIds.length === 1 ? '' : 's'}`,
      adHocIds.length > 0 && `${adHocIds.length} ad hoc label${adHocIds.length === 1 ? '' : 's'} (deleted for good)`,
    ].filter(Boolean);
    const ok = await dialog.confirm({
      title: 'Clear the print queue?',
      message: `This removes ${parts.join(' and ')}${groupId !== null ? ' from this stage' : ''}. Patch and case labels can be rebuilt afterwards.`,
      confirmLabel: 'Clear queue',
      danger: true,
    });
    if (ok) await removeMany({ queueIds, adHocIds }, 'Print queue cleared');
  };

  const clearHistory = async () => {
    const queueIds = confirmedOrPrinted.map((q) => q.id);
    const ok = await dialog.confirm({
      title: 'Clear confirmed and printed labels?',
      message: `Removes ${queueIds.length} row${queueIds.length === 1 ? '' : 's'} from this list. Print jobs above are kept.`,
      confirmLabel: 'Clear',
      danger: true,
    });
    if (ok) await removeMany({ queueIds }, 'Cleared');
  };

  const confirmSelected = async (override = false): Promise<boolean> => {
    const ids = [...selected];
    if (!ids.length) return true;
    try {
      await api.printQueue.confirm(jobId, ids, override);
      return true;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('safety cap') && !override) {
        if (await dialog.confirm({ title: 'Print more copies than usual?', message: msg, confirmLabel: 'Print anyway' })) return confirmSelected(true);
        return false;
      }
      setError(msg);
      return false;
    }
  };

  const confirmAndDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await confirmSelected())) return;
      window.location.href = api.printQueue.pdfUrl(jobId);
      setTimeout(refresh, 1500);
    } finally {
      setBusy(false);
    }
  };

  const confirmAndSend = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await confirmSelected())) return;
      await api.printQueue.send(jobId);
      await refresh();
      await refreshPrintJobs();
      setConfirmingPrint(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stageQueue = queue.filter((q) => (q.groupId ?? null) === groupId);
  const stageAdHoc = adHoc.filter((a) => (a.groupId ?? null) === groupId);
  const pendingItems = stageQueue.filter((q) => q.status === 'PENDING');
  const confirmedOrPrinted = stageQueue.filter((q) => q.status !== 'PENDING');

  const labelTypes = useMemo(() => {
    const types = new Set<string>();
    for (const item of pendingItems) types.add(item.labelType);
    for (const item of stageAdHoc) types.add(item.labelType);
    return [...types];
  }, [pendingItems, stageAdHoc]);

  // What a confirm will send: copies per label type (selected queue rows plus every ad hoc
  // label) and which trays that touches - shown beside the buttons so nobody confirms blind.
  const copiesByType = new Map<string, number>();
  for (const q of pendingItems) if (selected.has(q.id)) copiesByType.set(q.labelType, (copiesByType.get(q.labelType) ?? 0) + q.quantity);
  for (const a of stageAdHoc) copiesByType.set(a.labelType, (copiesByType.get(a.labelType) ?? 0) + a.quantity);
  const trays = [...new Set([...copiesByType.keys()].map((t) => trayMap[t]).filter(Boolean))];
  const summary = [...copiesByType.entries()].map(([t, n]) => `${n} ${labelTypeName(t)}`).join(' · ');
  const nothingToSend = pendingItems.length === 0 && stageAdHoc.length === 0;

  if (!queueReady || !configReady) {
    return (
      <SkeletonRegion>
        <div className="panel">
          <h3>Printer routing</h3>
          <Skeleton w="70%" h={13} style={{ marginBottom: 10 }} />
          <Skeleton w="45%" h={13} />
        </div>
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Print queue</h3>
            <Skeleton w={190} h={38} r={8} />
          </div>
          <Skeleton w="50%" h={13} />
        </div>
        <SkeletonPanel rows={4} cols={4} />
      </SkeletonRegion>
    );
  }

  return (
    <div className="load-fade">
      <div className="panel">
        <h3>Printer routing</h3>
        <p className="muted">
          {Object.entries(trayMap).map(([type, tray]) => `${labelTypeName(type)}: ${tray}`).join(' · ')}
        </p>
        <p className="muted">
          Delivery method: <strong>{method === 'DRY_RUN' ? 'Dry run (no printing)' : method === 'DIRECT_9100' ? 'Direct network (port 9100)' : 'Windows agent'}</strong>
          {' - '}configure in <Link to="/settings/printer">Printer Settings</Link>.
        </p>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Print queue</h3>
          <div className="row" style={{ gap: '0.5rem' }}>
            {pendingItems.some((q) => selected.has(q.id)) && (
              <button className="secondary" onClick={removeSelected} disabled={busy}>
                Remove selected ({pendingItems.filter((q) => selected.has(q.id)).length})
              </button>
            )}
            {!nothingToSend && (
              <button className="secondary danger-text" onClick={clearQueue} disabled={busy}>
                Clear queue
              </button>
            )}
            <button onClick={build} disabled={busy}>
              Build from patch + cases
            </button>
          </div>
        </div>

        {nothingToSend ? (
          <p className="muted">Nothing queued yet - build from patch/cases or add ad hoc labels.</p>
        ) : (
          <p className="muted">Review each label type below, then confirm from the bar at the bottom.</p>
        )}

        {error && <p className="error">{error}</p>}
      </div>

      {confirmingPrint && (
        <PrintConfirmModal jobId={jobId} busy={busy} onClose={() => setConfirmingPrint(false)} onConfirm={confirmAndSend} />
      )}

      {labelTypes.map((labelType) => (
        <LabelTypeSection
          key={labelType}
          jobId={jobId}
          labelType={labelType}
          queueItems={pendingItems.filter((q) => q.labelType === labelType)}
          adHocItems={stageAdHoc.filter((a) => a.labelType === labelType)}
          selected={selected}
          onToggleSelect={toggle}
          locationColors={locationColors}
          onRefresh={refresh}
          logoUrls={
            labelType === 'PAL' && job
              ? {
                  left: job.logoPathLeft ? api.jobs.logoUrl(jobId, 'left') : undefined,
                  middle: job.logoPath ? api.jobs.logoUrl(jobId, 'middle') : undefined,
                  right: job.logoPathRight ? api.jobs.logoUrl(jobId, 'right') : undefined,
                  scales: { left: job.logoScaleLeft, middle: job.logoScale, right: job.logoScaleRight },
                }
              : undefined
          }
        />
      ))}

      {!nothingToSend && (
        <div className="queue-action-bar">
          <span className="queue-summary">
            {summary ? (
              <>
                <strong>{summary}</strong>
                {trays.length > 0 && <span className="muted"> → {trays.join(', ')}</span>}
              </>
            ) : (
              <span className="muted">Nothing selected</span>
            )}
          </span>
          <div className="row">
            <button onClick={() => setConfirmingPrint(true)} disabled={busy || copiesByType.size === 0}>
              Confirm &amp; send to printer
            </button>
            <button className="secondary" onClick={confirmAndDownload} disabled={busy || copiesByType.size === 0}>
              Confirm &amp; download PDF
            </button>
          </div>
        </div>
      )}

      {printJobs.length > 0 && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Print jobs</h3>
            <button className="secondary" onClick={refreshPrintJobs}>
              Refresh
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Tray</th>
                  <th>Pages</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {printJobs.map((pj) => (
                  <tr key={pj.id}>
                    <td>{labelTypeName(pj.labelType)}</td>
                    <td>{trayMap[pj.labelType] ?? pj.tray}</td>
                    <td>{pj.pages}</td>
                    <td className="muted">{pj.method}</td>
                    <td>
                      {pj.status}
                      {pj.error && <div className="error">{pj.error}</div>}
                    </td>
                    <td>
                      <div className="row">
                        <a href={api.printJobs.pdfUrl(pj.id)} target="_blank" rel="noreferrer">
                          PDF
                        </a>
                        {(pj.status === 'FAILED' || pj.status === 'CANCELLED') && (
                          <button
                            className="secondary"
                            onClick={() => api.printJobs.retry(pj.id).then(refreshPrintJobs)}
                          >
                            Retry
                          </button>
                        )}
                        {pj.status === 'QUEUED' && (
                          <button
                            className="secondary"
                            onClick={() => api.printJobs.cancel(pj.id).then(refreshPrintJobs)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmedOrPrinted.length > 0 && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Previously confirmed / printed</h3>
            <button className="secondary" onClick={clearHistory} disabled={busy}>
              Clear list
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Content</th>
                  <th>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {confirmedOrPrinted.map((item) => (
                  <tr key={item.id}>
                    <td>{labelTypeName(item.labelType)}</td>
                    <td>{summarize(item.labelType, item.content)}</td>
                    <td>{item.quantity}</td>
                    <td className="muted">{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
