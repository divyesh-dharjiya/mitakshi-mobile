import { create } from 'zustand';

export type ToastKind = 'info' | 'ok' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastState {
  items: ToastItem[];
  dismiss: (id: number) => void;
}

export const useToasts = create<ToastState>()((set) => ({
  items: [],
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

let seq = 0;

/** Show a short message that disappears on its own. */
export function toast(text: string, kind: ToastKind = 'info', ms = 4500) {
  const id = ++seq;
  useToasts.setState((s) => ({ items: [...s.items, { id, kind, text }] }));
  setTimeout(() => useToasts.getState().dismiss(id), ms);
}
