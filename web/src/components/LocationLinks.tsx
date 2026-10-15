/**
 * Given a free-text address, shows a small embedded map pin plus "Open in" deep links for
 * Google Maps, Apple Maps, Waze, and What3Words - all plain https:// links, no API keys. The
 * embedded preview uses Google's no-key map embed (maps.google.com/maps?...&output=embed);
 * the "Open in" links work regardless if that ever changes.
 */
const W3W_PATTERN = /^\/{0,3}[a-z]+\.[a-z]+\.[a-z]+$/i;

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
          className="location-map"
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
        {/* Only offered when the stored address is itself a what3words triple - a postal address
            can't be turned into one without their API, and linking to their homepage helped no one. */}
        {W3W_PATTERN.test(address.trim()) && (
          <a href={`https://what3words.com/${address.trim().replace(/^\/+/, '')}`} target="_blank" rel="noreferrer">
            Open in what3words
          </a>
        )}
      </div>
    </div>
  );
}
