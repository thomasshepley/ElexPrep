import { useEffect, useState } from 'react';
import { api, type CurrentRmsOpportunity, type CurrentRmsPickItem } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import { useDialog } from './Dialog';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { formatDate, formatDateTime } from '../utils/format';

/** Current RMS sends quantity as a decimal string (e.g. "12.0"), same quirk as its money
 * fields - Number() strips the trailing .0 for a whole number while still showing real
 * fractional quantities (e.g. "1.5") as-is. */
function formatQuantity(q: unknown): string {
  const n = Number(q);
  return Number.isFinite(n) ? String(n) : '';
}

export default function CurrentRmsPanel({ jobId }: { jobId: string }) {
  const dialog = useDialog();
  const { run } = useAsyncAction();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const canLink = isAdmin || Boolean(user?.permissions?.linkCurrentRms);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [opportunity, setOpportunity] = useState<CurrentRmsOpportunity | undefined>();
  const [rmsAlertAt, setRmsAlertAt] = useState<string | null>(null);
  const [items, setItems] = useState<CurrentRmsPickItem[] | null>(null);
  const [pickListError, setPickListError] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Current RMS's "Service" line items are typically labour/setup, not physical kit to prep -
  // defaulting to Rentals-only keeps the pick list focused on what crew actually need to pull.
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const loadPickList = async () => {
    setPickListError(null);
    try {
      const res = await api.jobCurrentRms.pickList(jobId);
      setItems(res.items);
    } catch (e) {
      setPickListError((e as Error).message);
    }
  };

  const refresh = () =>
    api.jobCurrentRms
      .get(jobId)
      .then((res) => {
        setLinked(res.linked);
        setOpportunity(res.opportunity);
        setRmsAlertAt(res.rmsAlertAt ?? null);
        return res;
      })
      .catch((e) => {
        setError((e as Error).message);
        return { linked: false } as { linked: boolean };
      });

  useEffect(() => {
    setItems(null);
    setHiddenIds(new Set());
    refresh().then((res) => {
      if (res.linked) loadPickList();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const link = async () => {
    setError(null);
    const rmsId = Number(linkInput);
    if (!rmsId) return setError('Enter a numeric Current RMS opportunity ID');
    setBusy(true);
    try {
      await api.jobCurrentRms.link(jobId, rmsId);
      setLinkInput('');
      await refresh();
      await loadPickList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const hideItem = (id: number) => setHiddenIds((prev) => new Set(prev).add(id));
  const unhideAll = () => setHiddenIds(new Set());

  // An Accessory row (opportunity_item_type 2) frequently carries no transaction_type_name of
  // its own in Current RMS's response - it inherits its Principal's. Treating a blank as
  // "Rental" by default let Service accessory lines (e.g. a crew member's sub-line items)
  // leak through the Rentals-only filter, so look back to the nearest preceding Principal row
  // (type 1) for the type instead of trusting a missing field. A Group row (type 0) ends the
  // lookback - it starts a new section.
  const effectiveTransactionType = (all: CurrentRmsPickItem[], i: CurrentRmsPickItem, idx: number): string | undefined => {
    if (i.transaction_type_name) return i.transaction_type_name;
    if (i.opportunity_item_type !== 2) return i.transaction_type_name;
    for (let j = idx - 1; j >= 0; j--) {
      const prev = all[j];
      if (prev.opportunity_item_type === 1) return prev.transaction_type_name;
      if (prev.opportunity_item_type === 0) break;
    }
    return i.transaction_type_name;
  };
  const isNonRental = (all: CurrentRmsPickItem[], i: CurrentRmsPickItem, idx: number) => {
    if (i.isGroup) return false;
    const type = effectiveTransactionType(all, i, idx);
    return !!type && type !== 'Rental';
  };
  const allItems = items ?? [];
  const typeFilteredItems = allItems.filter((i, idx) => !hiddenIds.has(i.id) && (showAllTypes || !isNonRental(allItems, i, idx)));
  const hiddenByTypeCount = allItems.filter((i, idx) => !hiddenIds.has(i.id) && isNonRental(allItems, i, idx)).length;

  // Current RMS's own product category, when the account's data actually carries one on the
  // line item (it isn't guaranteed to - this account's opportunity_items responses haven't been
  // confirmed to include it) - the filter row below only appears once there's something to
  // filter by, rather than always showing an empty "All categories" control.
  const categoryOf = (i: CurrentRmsPickItem): string | null => {
    const raw = i.category_name ?? i.product_category_name ?? i.category;
    return typeof raw === 'string' && raw.trim() ? raw : null;
  };
  const categories = [...new Set(typeFilteredItems.map(categoryOf).filter((c): c is string => c !== null))].sort();

  const matchesSearch = (i: CurrentRmsPickItem) => {
    if (!search.trim()) return true;
    const haystack = `${i.name ?? ''} ${i.product_name ?? ''} ${i.description ?? ''}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  };
  const visibleItems = typeFilteredItems.filter(
    (i) => i.isGroup || (matchesSearch(i) && (!category || categoryOf(i) === category))
  );

  const unlink = async () => {
    if (!(await dialog.confirm({ title: 'Unlink from Current RMS?', message: 'The job stays in the portal; it just stops syncing with this opportunity.', confirmLabel: 'Unlink', danger: true }))) return;
    if ((await run(() => api.jobCurrentRms.unlink(jobId).then(() => true))) !== true) return;
    setItems(null);
    refresh();
  };

  const acknowledge = async () => {
    await api.jobCurrentRms.acknowledge(jobId);
    setRmsAlertAt(null);
  };

  if (linked === null) return error ? <p className="error">Could not load Current RMS details: {error}</p> : <p className="muted">Loading…</p>;

  return (
    <div>
      {rmsAlertAt && (
        <div className="panel" style={{ borderColor: '#c084fc' }}>
          <strong>This job's linked Current RMS opportunity has changed</strong>{' '}
          <span className="muted">({formatDateTime(rmsAlertAt)})</span>
          <div style={{ marginTop: '0.5rem' }}>
            <button className="secondary" onClick={acknowledge}>
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {!linked && (
        <div className="panel">
          <h3>Not linked to Current RMS</h3>
          {canLink ? (
            <>
              <p className="muted">
                Link this job to an opportunity by its numeric Current RMS ID (find it in{' '}
                <a href="/settings/current-rms">Settings → Current RMS</a>), or import a job
                directly from there instead.
              </p>
              <div className="row">
                <input
                  placeholder="Opportunity ID"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  style={{ width: 160 }}
                />
                <button onClick={link} disabled={busy}>
                  Link
                </button>
              </div>
              {error && <p className="error">{error}</p>}
            </>
          ) : (
            <p className="muted">Not linked to a Current RMS opportunity.</p>
          )}
        </div>
      )}

      {linked && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>{opportunity?.subject ?? 'Linked opportunity'}</h3>
            {canLink && (
              <button className="secondary" onClick={unlink}>
                Unlink
              </button>
            )}
          </div>
          {opportunity && (
            <div className="table-scroll">
              <table style={{ maxWidth: 480 }}>
                <tbody>
                  <tr>
                    <td>Customer</td>
                    <td>{opportunity.memberName}</td>
                  </tr>
                  <tr>
                    <td>Status</td>
                    <td>{opportunity.status}</td>
                  </tr>
                  <tr>
                    <td>Dates</td>
                    <td>
                      {opportunity.startsAt ? formatDate(opportunity.startsAt) : '?'} –{' '}
                      {opportunity.endsAt ? formatDate(opportunity.endsAt) : '?'}
                    </td>
                  </tr>
                  <tr>
                    <td>RMS last updated</td>
                    <td className="muted">
                      {opportunity.rmsUpdatedAt ? formatDateTime(opportunity.rmsUpdatedAt) : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0 }}>Pick list</h4>
              <button className="secondary" onClick={loadPickList}>
                Refresh
              </button>
            </div>
            {pickListError && <p className="error">{pickListError}</p>}
            {items && items.length === 0 && <p className="muted">No items returned.</p>}
            {items && items.length > 0 && (
              <>
                <div className="row" style={{ gap: '0.6rem', margin: '0.5rem 0', flexWrap: 'wrap' }}>
                  <input
                    placeholder="Search items…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: '14rem' }}
                  />
                  {categories.length > 0 && (
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">All categories</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <p className="muted" style={{ fontSize: '0.85rem' }}>
                  {!showAllTypes && hiddenByTypeCount > 0 && (
                    <>
                      Showing Rentals only - {hiddenByTypeCount} Service/Sale item{hiddenByTypeCount === 1 ? '' : 's'} hidden.{' '}
                      <button type="button" className="link-button" onClick={() => setShowAllTypes(true)}>
                        Show all types
                      </button>
                    </>
                  )}
                  {showAllTypes && (
                    <button type="button" className="link-button" onClick={() => setShowAllTypes(false)}>
                      Show Rentals only
                    </button>
                  )}
                  {hiddenIds.size > 0 && (
                    <>
                      {(!showAllTypes && hiddenByTypeCount > 0) || showAllTypes ? ' · ' : ''}
                      {hiddenIds.size} item{hiddenIds.size === 1 ? '' : 's'} manually hidden.{' '}
                      <button type="button" className="link-button" onClick={unhideAll}>
                        Show hidden
                      </button>
                    </>
                  )}
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Current RMS status</th>
                        <th>Prepped</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map((i) =>
                        i.isGroup ? (
                          <tr key={i.id}>
                            <td colSpan={4} style={{ fontWeight: 700, paddingTop: '0.75rem' }}>
                              {i.name ?? i.product_name ?? i.description ?? `#${i.id}`}
                            </td>
                          </tr>
                        ) : (
                          <tr key={i.id}>
                            <td>
                              <span className="muted" style={{ display: 'inline-block', minWidth: '2.5rem', textAlign: 'left' }}>
                                {formatQuantity(i.quantity)}×
                              </span>
                              {i.name ?? i.product_name ?? i.description ?? `#${i.id}`}
                              {i.transaction_type_name && i.transaction_type_name !== 'Rental' && (
                                <span className="chip chip-neutral" style={{ marginLeft: '0.4rem' }}>
                                  {i.transaction_type_name}
                                </span>
                              )}
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: 999,
                                  background: i.bookedOut ? '#1FA34C' : '#555',
                                  color: '#fff',
                                }}
                              >
                                {i.status_name ?? (i.bookedOut ? 'Booked out' : 'Not booked out')}
                              </span>
                            </td>
                            <td>{i.prepped ? '✓' : ''}</td>
                            <td>
                              <button type="button" className="link-button" onClick={() => hideItem(i.id)}>
                                Hide
                              </button>
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
