import { useAuth } from '../auth/AuthContext';

/**
 * Placeholder landing spot for CREW accounts, which can exist (an admin can create one on the
 * Crew settings page) before the real crew portal does. Without this, a crew login would fall
 * through to the normal admin/prep shell and then get a 403 on every click, since the backend
 * already locks CREW accounts out of everything but auth/me. The real portal (calendar, job
 * pages, Who/What/When/Where) is a later milestone.
 */
export default function CrewComingSoonPage() {
  const { user, logout } = useAuth();

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div className="panel" style={{ width: 420, textAlign: 'center' }}>
        <h2>Welcome, {user?.displayName}</h2>
        <p className="muted">
          The crew portal is still being built — you'll be able to see your jobs, schedule, and
          documents here soon.
        </p>
        <button className="secondary" onClick={logout}>
          Sign out
        </button>
      </div>
    </div>
  );
}
