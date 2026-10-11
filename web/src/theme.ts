export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'elex-theme';

/** Dark is the app's default; a stored "light" choice is the only thing that overrides it (see index.html's inline pre-paint script, which applies the same rule before React loads). */
export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private browsing or storage disabled — theme still applies for this page load.
  }
}
