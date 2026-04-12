/**
 * Lightweight event-based toast system.
 * Hooks and utilities call showToast() anywhere — no Context required.
 * ToastContainer (mounted in App.tsx) listens for the custom DOM event and renders the UI.
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastDetail {
  id: string;
  type: ToastType;
  message: string;
}

/** Dispatch a toast notification. Import and call this anywhere in the app. */
export const showToast = (type: ToastType, message: string): void => {
  const detail: ToastDetail = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    message,
  };
  window.dispatchEvent(new CustomEvent<ToastDetail>('app:toast', { detail }));
};
