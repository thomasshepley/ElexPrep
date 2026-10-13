import { useEffect, useState } from 'react';

/** Matches the CSS phone breakpoint (max-width: 760px) used across App.css and index.css. */
const QUERY = '(max-width: 760px)';

/** True on phone-width screens, kept in sync as the window resizes or the phone rotates. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setPhone(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}
