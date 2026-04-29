import { useState, useEffect } from 'react';
import { Dashboard } from '@/pages/Dashboard';
import { scheduleStartupReconcile } from '@/lib/reconcileOnStartup';
import './index.css';

function App() {
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    scheduleStartupReconcile();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return (
    <Dashboard
      isDark={isDark}
      onThemeToggle={() => setIsDark((d) => !d)}
    />
  );
}

export default App;
