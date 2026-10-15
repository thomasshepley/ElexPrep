import { Skeleton, SkeletonPanel, SkeletonRegion } from './Skeleton';
import { useState } from 'react';
import { api, type JobOneDriveStatus, type Plot } from '../api/client';
import CadPlotsViewer, { type CadPlotCandidate } from './CadPlotsViewer';
import OneDriveFilesPanel from './OneDriveFilesPanel';
import PlotsPanel from './PlotsPanel';

/**
 * The job's "Plots" tab: a single CAD view up top combining every candidate - the
 * auto-detected OneDrive CAD PDF, uploaded Plot PDFs, and any OneDrive share flagged as a CAD
 * plot - switching via tabs once a multi-stage job has more than one. The management panels
 * below (browse/share/mark, upload/delete) feed that view rather than each showing their own.
 */
export default function JobPlotsTab({ jobId }: { jobId: string }) {
  const [oneDrive, setOneDrive] = useState<JobOneDriveStatus | null>(null);
  const [plotCandidates, setPlotCandidates] = useState<CadPlotCandidate[]>([]);
  // The CAD view waits for both sources, so it doesn't say "No CAD plots yet" and then fill in.
  const [plotsSettled, setPlotsSettled] = useState(false);
  const [driveSettled, setDriveSettled] = useState(false);

  // The panels below own the fetching and report what they loaded, so each list is requested
  // once per change rather than once by the panel and again here.
  const onPlots = (plots: Plot[]) =>
    setPlotCandidates(plots.map((p) => ({ key: `plot:${p.id}`, label: p.originalName, url: api.plots.fileUrl(jobId, p.id) })));

  const candidates: CadPlotCandidate[] = [
    ...(oneDrive?.cadPdf
      ? [{ key: 'auto', label: oneDrive.cadPdf.name, url: api.jobOneDrive.fileUrl(jobId, oneDrive.cadPdf.itemId), badge: 'Auto-detected' }]
      : []),
    ...plotCandidates,
    ...(oneDrive?.shares.filter((s) => s.isCadPlot).map((s) => ({
      key: `share:${s.id}`,
      label: s.itemName,
      url: api.jobOneDrive.fileUrl(jobId, s.itemId),
    })) ?? []),
  ];

  const ready = plotsSettled && driveSettled;

  // The panels below load the data, so they mount straight away but stay hidden until both
  // have answered - then the whole tab appears at once rather than in shifting pieces.
  return (
    <div>
      {!ready && (
        <SkeletonRegion label="Loading plots…">
          <div className="panel">
            <h3>CAD plots</h3>
            <Skeleton h={320} r={6} />
          </div>
          <SkeletonPanel lines={2} list={2} />
        </SkeletonRegion>
      )}
      <div hidden={!ready} className={ready ? 'load-fade' : undefined}>
        <div className="panel">
          <h3>CAD plots</h3>
          <CadPlotsViewer candidates={candidates} />
          <p className="muted plots-sources">
            A PDF in the job's OneDrive CAD folder, and any OneDrive file marked as a CAD plot below, show here automatically alongside
            anything uploaded. The Cable (beta) tab reads from the same list.
          </p>
          <PlotsPanel jobId={jobId} embedded onChange={onPlots} onSettled={() => setPlotsSettled(true)} />
        </div>
        <OneDriveFilesPanel jobId={jobId} onChange={setOneDrive} onSettled={() => setDriveSettled(true)} />
      </div>
    </div>
  );
}
