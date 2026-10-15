import { useAuth } from '../auth/AuthContext';

/** Full-width banner shown to every signed-in account while either lockdown tier is active (see
 * server/src/lockdownMode.ts) - both booleans ride along on the authed user, including for an
 * account about to be blocked from everything else, since /api/auth/me is the one route the
 * lockdown gate itself exempts. Full lockdown is the stricter tier, so its banner takes priority
 * when both happen to be on. */
export default function LockdownBanner() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.fullLockdown) {
    return (
      <div className="lockdown-banner lockdown-banner-full" role="alert">
        LOCKDOWN MODE
      </div>
    );
  }
  if (user.developmentLockdown) {
    return (
      <div className="lockdown-banner lockdown-banner-dev" role="alert">
        DEVELOPMENT LOCKDOWN
      </div>
    );
  }
  return null;
}
