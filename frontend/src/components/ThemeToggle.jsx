import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle() {
  const { dark, toggle } = useTheme();

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <line x1="12" y1="2" x2="12" y2="5"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
          <line x1="2" y1="12" x2="5" y2="12"/>
          <line x1="19" y1="12" x2="22" y2="12"/>
          <line x1="4.93" y1="4.93" x2="7.05" y2="7.05"/>
          <line x1="16.95" y1="16.95" x2="19.07" y2="19.07"/>
          <line x1="4.93" y1="19.07" x2="7.05" y2="16.95"/>
          <line x1="16.95" y1="7.05" x2="19.07" y2="4.93"/>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}
