import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle() {
  const { dark, toggle } = useTheme();

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
    >
      {dark ? '☀' : '☾'} {dark ? 'Light' : 'Dark'}
    </button>
  );
}
