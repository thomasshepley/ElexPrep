import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router-dom';

const SUFFIX = 'ELEX Portal';

const ROUTE_TITLES: [pattern: string, title: string][] = [
  ['/', 'Dashboard'],
  ['/login', 'Sign in'],
  ['/apply', 'Apply to join the crew'],
  ['/onboard', 'Join the crew'],
  ['/onboard/complete/:token', 'Finish joining'],
  ['/signage', 'Signage'],
  ['/jobs', 'Jobs'],
  ['/jobs/:jobId', 'Job'],
  ['/webmaster', 'Webmaster'],
  ['/settings/fixture-types', 'Case Rules'],
  ['/settings/location-colors', 'Location Colours'],
  ['/settings/import-mapping', 'Import Mapping'],
  ['/settings/users', 'Users'],
  ['/settings/crew', 'Crew'],
  ['/settings/crew-applications', 'Applications'],
  ['/settings/onboarding', 'Onboarding'],
  ['/settings/printer', 'Printer'],
  ['/settings/current-rms', 'Current RMS'],
  ['/settings/onedrive', 'OneDrive'],
  ['/settings/crew-portal', 'Crew Portal'],
  ['/settings/activity', 'Activity Log'],
  ['/preferences', 'My Preferences'],
  ['/crew', 'My schedule'],
  ['/crew/jobs/:jobId', 'Job'],
  ['/crew/account', 'My account'],
];

function setTitle(title: string | null | undefined) {
  document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
}

/** Sets a sensible default tab title for every route; pages with a better name (a job's own
 * name) override it with usePageTitle once they've loaded. */
export function RouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = ROUTE_TITLES.find(([pattern]) => matchPath(pattern, pathname));
    setTitle(match?.[1]);
  }, [pathname]);
  return null;
}

export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) setTitle(title);
  }, [title]);
}
