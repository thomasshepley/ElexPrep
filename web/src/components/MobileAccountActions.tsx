import { useAuth } from '../auth/AuthContext';
import ThemeToggle from './ThemeToggle';
import BugReportButton from './BugReportButton';
import VersionBadge from './VersionBadge';
import { SignOutIcon } from './Icons';

/** On phones the sidebar becomes a bottom tab bar with no room for these, so the account page
 * carries them instead. Hidden on wider screens, where the sidebar already shows them. */
export default function MobileAccountActions() {
  const { logout } = useAuth();
  return (
    <section className="panel mobile-only mobile-account-actions">
      <ThemeToggle />
      <button className="secondary sidebar-signout" onClick={logout}>
        <SignOutIcon />
        <span>Sign out</span>
      </button>
      <BugReportButton />
      <VersionBadge />
    </section>
  );
}
