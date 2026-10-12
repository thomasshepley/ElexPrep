import { useEffect, useRef, useState } from 'react';

/**
 * A custom, canvas-rendered PDF viewer (pdf.js), used instead of the browser's own PDF plugin
 * (an <iframe src="...pdf">) so CAD plans render identically everywhere - the native plugin
 * varies by browser/OS and is often unavailable at all on mobile, which matters for CAD/plots
 * viewed on-site from a phone. Page navigation and zoom are deliberately minimal: this is a
 * "look at the plan" viewer, not a general-purpose PDF reader.
 */
export default function InlinePdfViewer({ url, title }: { url: string; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);

    import('pdfjs-dist').then(async (pdfjs) => {
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      try {
        const doc = await pdfjs.getDocument({ url, withCredentials: true }).promise;
        if (cancelled) return;
        setPdf(doc);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Could not load this PDF.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    pdf.getPage(page).then(async (pdfPage) => {
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await pdfPage.render({ canvasContext: context, viewport }).promise;
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, page, scale]);

  if (error) return <p className="error">Could not display "{title}": {error}</p>;

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="row" style={{ gap: '0.5rem' }}>
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="muted">
            Page {page}
            {pdf ? ` of ${pdf.numPages}` : ''}
          </span>
          <button type="button" className="secondary" disabled={!pdf || page >= pdf.numPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <button type="button" className="secondary" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}>
            Zoom out
          </button>
          <button type="button" className="secondary" onClick={() => setScale((s) => Math.min(3, s + 0.2))}>
            Zoom in
          </button>
          <a href={url} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
        </div>
      </div>
      {loading && <p className="muted">Loading PDF…</p>}
      <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, maxHeight: '75vh' }}>
        <canvas ref={canvasRef} style={{ display: loading ? 'none' : 'block' }} />
      </div>
    </div>
  );
}
