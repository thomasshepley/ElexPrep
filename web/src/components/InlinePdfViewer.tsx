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
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<import('pdfjs-dist').PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  // null = not yet auto-fitted for this page. A CAD plot is very often landscape (wide) -
  // a fixed starting scale regardless of its real dimensions meant a landscape plot rendered
  // far too small for the available width (looking cramped, almost like a portrait strip) while
  // a portrait plot could render too large. Auto-fit the width on first render of each page,
  // then let manual zoom take over from there.
  const [scale, setScale] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let loaded: import('pdfjs-dist').PDFDocumentProxy | null = null;
    setLoading(true);
    setError(null);
    setPdf(null);
    setPage(1);
    setScale(null);

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const doc = await pdfjs.getDocument({ url, withCredentials: true }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        loaded = doc;
        setPdf(doc);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Could not load this PDF.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      // Frees the worker-side document; without this every viewed plot stayed in memory.
      if (loaded) void loaded.destroy();
    };
  }, [url]);

  // Computes the fit-to-width scale for the current page once, rather than always starting at
  // a fixed scale regardless of the page's real (often landscape) dimensions.
  useEffect(() => {
    if (!pdf || scale !== null) return;
    let cancelled = false;
    pdf
      .getPage(page)
      .then((pdfPage) => {
        if (cancelled) return;
        const nativeWidth = pdfPage.getViewport({ scale: 1 }).width;
        const containerWidth = containerRef.current?.clientWidth || 800;
        const fit = Math.min(3, Math.max(0.5, (containerWidth - 2) / nativeWidth));
        setScale(fit);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [pdf, page, scale]);

  useEffect(() => {
    if (!pdf || scale === null || !canvasRef.current) return;
    let cancelled = false;
    let task: import('pdfjs-dist').RenderTask | null = null;
    pdf
      .getPage(page)
      .then(async (pdfPage) => {
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        // Rendered at the screen's pixel density and shown at CSS size, so plans stay sharp on
        // phones and retina displays instead of being upscaled and blurry.
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        task = pdfPage.render({ canvasContext: context, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
        await task.promise;
      })
      .catch((e) => {
        // A superseded render (quick zoom clicks) is cancelled on purpose - not an error.
        if (!cancelled && (e as Error)?.name !== 'RenderingCancelledException') setError((e as Error).message);
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, scale]);

  const changePage = (next: number) => {
    setPage(next);
    setScale(null);
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = title.toLowerCase().endsWith('.pdf') ? title : `${title}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (error) return <p className="error">Could not display "{title}": {error}</p>;

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="row" style={{ gap: '0.5rem' }}>
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>
            Previous
          </button>
          <span className="muted">
            Page {page}
            {pdf ? ` of ${pdf.numPages}` : ''}
          </span>
          <button type="button" className="secondary" disabled={!pdf || page >= pdf.numPages} onClick={() => changePage(page + 1)}>
            Next
          </button>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <button type="button" className="secondary" onClick={() => setScale((s) => Math.max(0.5, (s ?? 1) - 0.2))}>
            Zoom out
          </button>
          <button type="button" className="secondary" onClick={() => setScale((s) => Math.min(3, (s ?? 1) + 0.2))}>
            Zoom in
          </button>
          <a href={url} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
          <button type="button" className="secondary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save plot'}
          </button>
        </div>
      </div>
      {saveError && <p className="error">Could not save: {saveError}</p>}
      {loading && <p className="muted">Loading PDF…</p>}
      <div ref={containerRef} style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, maxHeight: '75vh' }}>
        <canvas ref={canvasRef} style={{ display: loading ? 'none' : 'block' }} />
      </div>
    </div>
  );
}
