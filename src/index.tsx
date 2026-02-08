
import React from 'react';
import ReactDOM from 'react-dom/client';
import './tailwind.css';
import App from '@/App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}


const MAX_RELOADS = 5;
const RELOAD_RESET_TIME = 5000; // 5 seconds

const checkReloadLoop = () => {
  const lastReload = parseInt(sessionStorage.getItem('last_reload_time') || '0', 10);
  const reloadCount = parseInt(sessionStorage.getItem('reload_count') || '0', 10);
  const now = Date.now();

  if (now - lastReload < RELOAD_RESET_TIME) {
    const newCount = reloadCount + 1;
    sessionStorage.setItem('reload_count', newCount.toString());
    sessionStorage.setItem('last_reload_time', now.toString());

    if (newCount > MAX_RELOADS) {
      console.error("🚨 POTENTIAL INFINITE RELOAD LOOP DETECTED 🚨");
      // Stop execution
      throw new Error(`Infinite Reload Loop Detected! App has reloaded ${newCount} times in under ${RELOAD_RESET_TIME / 1000}s.`);
    }
  } else {
    // Reset if enough time has passed
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
console.log("Mounting React App...");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
