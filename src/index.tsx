
import React from 'react';
import ReactDOM from 'react-dom/client';
import './tailwind.css';
import App from '@/App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Global Fetch Interceptor to inject JWT Authorization header and handle 401s
const API_BASE = import.meta.env.VITE_API_URL || '';
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const [resource, config] = args;

  // Inject auth into API requests (matches both "/api/..." and "http://host:port/..." backend URLs)
  const isApiRequest = typeof resource === 'string' &&
    (resource.startsWith(API_BASE) || resource.includes('/api/'));

  if (isApiRequest && typeof resource === 'string') {
    const token = localStorage.getItem('auth_token');
    const customConfig = config || {};
    customConfig.headers = {
      ...customConfig.headers,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const response = await originalFetch(resource, customConfig);

    // Handle 401: clear stale token and reload to show login screen
    if (response.status === 401 && !resource.includes('/login')) {
      localStorage.removeItem('auth_token');
      window.location.reload();
    }

    return response;
  }

  return originalFetch(...args);
};

// Reload loop detection - disabled in development to prevent false positives from HMR
const checkReloadLoop = () => {
  // Skip in development mode - HMR naturally causes rapid reloads
  if (import.meta.env.DEV) {
    return;
  }

  const MAX_RELOADS = 10;  // Increased threshold
  const RELOAD_RESET_TIME = 3000; // Reduced window

  const lastReload = parseInt(sessionStorage.getItem('last_reload_time') || '0', 10);
  const reloadCount = parseInt(sessionStorage.getItem('reload_count') || '0', 10);
  const now = Date.now();

  if (now - lastReload < RELOAD_RESET_TIME) {
    const newCount = reloadCount + 1;
    sessionStorage.setItem('reload_count', newCount.toString());
    sessionStorage.setItem('last_reload_time', now.toString());

    if (newCount > MAX_RELOADS) {
      console.error("🚨 POTENTIAL INFINITE RELOAD LOOP DETECTED 🚨");
      sessionStorage.removeItem('reload_count');
      sessionStorage.removeItem('last_reload_time');
      throw new Error(`Infinite Reload Loop Detected! App has reloaded ${newCount} times in under ${RELOAD_RESET_TIME / 1000}s.`);
    }
  } else {
    sessionStorage.setItem('reload_count', '1');
    sessionStorage.setItem('last_reload_time', now.toString());
  }
};

checkReloadLoop();

// Simple Error Boundary for debugging
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: 'red', padding: '20px', background: 'white', zIndex: 9999, position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error?.toString()}</pre>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}


console.log("Mounting React App...");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
