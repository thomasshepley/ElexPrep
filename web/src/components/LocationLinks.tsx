/**
 * Given a free-text address, shows a small embedded map pin plus "Open in" deep links for
 * Google Maps, Apple Maps, Waze, and What3Words — all plain https:// links, no API keys. The
 * embedded preview uses Google's no-key map embed (maps.google.com/maps?...&output=embed);
 * the "Open in" links work regardless if that ever changes.
 */
export default function LocationLinks({ address, showMap = true }: { address: string | null | undefined; showMap?: boolean }) {
  if (!address) return <p className="muted">No address set yet.</p>;

  const q = encodeURIComponent(address);

  return (
    <div>
      {showMap && (
        <iframe
          title="Map"
          src={`https://maps.google.com/maps?q=${q}&z=15&output=embed`}
          width="100%"
          height="220"
          style={{ border: 0, borderRadius: 6, display: 'block' }}
          loading="lazy"
        />
      )}
      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap', marginTop: showMap ? '0.6rem' : 0 }}>
        <a href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noreferrer">
          Open in Google Maps
        </a>
        <a href={`https://maps.apple.com/?q=${q}`} target="_blank" rel="noreferrer">
          Open in Apple Maps
        </a>
        <a href={`https://waze.com/ul?q=${q}&navigate=yes`} target="_blank" rel="noreferrer">
          Open in Waze
        </a>
        <a href="https://what3words.com/" target="_blank" rel="noreferrer">
          Look up on What3Words
        </a>
      </div>
    </div>
  );
}
