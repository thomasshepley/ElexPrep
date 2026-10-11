import { useState } from 'react';
import { applyTheme, getStoredTheme, type Theme } from '../theme';
import { MoonIcon, SunIcon } from './Icons';

/** Persistent light/dark switch for the bottom of a sidebar — dark is the default (see theme.ts); this just lets someone opt into light and have it stick. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button className="secondary sidebar-theme-toggle" onClick={toggle} aria-pressed={theme === 'light'}>
      {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
      <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}
