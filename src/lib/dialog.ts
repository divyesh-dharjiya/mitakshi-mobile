import { Platform } from 'react-native';
import { create } from 'zustand';

export interface DialogRequest {
  title: string;
  message: string;
  ok: string;
  destructive: boolean;
  resolve: (yes: boolean) => void;
}

/** The question currently on screen (shown by `DialogHost`), if any. */
export const useDialog = create<{ current: DialogRequest | null }>(() => ({ current: null }));

/** Yes / no question: the browser's dialog on web, the app's own themed dialog elsewhere. */
export function ask(title: string, message: string, ok: string, destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    // A second question while one is open counts as "no" for the first.
    useDialog.getState().current?.resolve(false);
    useDialog.setState({ current: { title, message, ok, destructive, resolve } });
  });
}

/** Called by the dialog's buttons. */
export function answer(yes: boolean) {
  const cur = useDialog.getState().current;
  useDialog.setState({ current: null });
  cur?.resolve(yes);
}

/** Confirmation before deleting something. */
export const confirm = (message: string, ok = 'Delete') => ask('Are you sure?', message, ok, true);
