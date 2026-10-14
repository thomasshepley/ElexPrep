import { Skeleton, SkeletonRegion } from './Skeleton';
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

  return (
    <div>
      <div className="panel">
        <h3>CAD</h3>
        {plotsSettled && driveSettled ? (
          <CadPlotsViewer candidates={candidates} />
        ) : (
          <SkeletonRegion label="Loading plots…">
            <Skeleton h="auto" r={6} style={{ aspectRatio: '1.414', maxHeight: '75vh' }} />
          </SkeletonRegion>
        )}
      </div>
      <OneDriveFilesPanel jobId={jobId} onChange={setOneDrive} onSettled={() => setDriveSettled(true)} />
      <PlotsPanel jobId={jobId} onChange={onPlots} onSettled={() => setPlotsSettled(true)} />
    </div>
  );
}
