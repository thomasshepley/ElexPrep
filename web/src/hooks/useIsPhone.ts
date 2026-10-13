import { useEffect, useState } from 'react';

/** The phone shell (tab bar, no sidebar): narrow windows, plus any touch screen up to 1100px wide -
 * a phone on its side or a tablet, where a desktop sidebar would leave too little room. Must
 * match the "phone shell" media query in App.css. */
const QUERY = '(max-width: 760px), (pointer: coarse) and (max-width: 1100px)';

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
