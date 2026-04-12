import React, { useState, useEffect, useCallback } from 'react';
import type { ToastDetail, ToastType } from '../utils/toast';

const DISMISS_MS = 5000;

const STYLES: Record<ToastType, { bar: string; icon: string }> = {
  success: { bar: '#22c55e', icon: '✓' },
  error:   { bar: '#ef4444', icon: '✕' },
  warning: { bar: '#f59e0b', icon: '⚠' },
  info:    { bar: '#3b82f6', icon: 'ℹ' },
};

interface ToastItem extends ToastDetail {}

const Toast: React.FC<{ item: ToastItem; onDismiss: (id: string) => void }> = ({ item, onDismiss }) => {
  const { bar, icon } = STYLES[item.type];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        background: '#1a1a1a',
        border: `1px solid ${bar}44`,
        borderLeft: `3px solid ${bar}`,
        borderRadius: '6px',
        padding: '12px 14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        minWidth: '280px',
        maxWidth: '380px',
        animation: 'toast-in 0.2s ease',
      }}
    >
      <span style={{ color: bar, fontWeight: 700, flexShrink: 0, fontSize: '14px', marginTop: '1px' }}>
        {icon}
      </span>
      <span style={{ color: '#e5e5e5', fontSize: '13px', lineHeight: '1.4', flex: 1 }}>
        {item.message}
      </span>
      <button
        onClick={() => onDismiss(item.id)}
        style={{
          color: '#666',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          flexShrink: 0,
          padding: '0 0 0 6px',
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      setToasts(prev => [...prev, detail]);
      setTimeout(() => dismiss(detail.id), DISMISS_MS);
    };
    window.addEventListener('app:toast', handler);
    return () => window.removeEventListener('app:toast', handler);
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <Toast item={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </>
  );
};
