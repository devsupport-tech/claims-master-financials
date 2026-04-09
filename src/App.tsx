import { useState } from 'react';
import { Dashboard } from '@/pages/Dashboard';
import Login from '@/pages/Login';
import './index.css';

const DASHBOARD_PASSWORD = import.meta.env.VITE_DASHBOARD_PASSWORD || '';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (!DASHBOARD_PASSWORD) return true;
    return sessionStorage.getItem('financials_auth') === 'true';
  });

  const handleLogin = (password: string): boolean => {
    if (!DASHBOARD_PASSWORD || password === DASHBOARD_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('financials_auth', 'true');
      return true;
    }
    return false;
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard />;
}

export default App;
