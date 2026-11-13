import { useEffect } from 'react';
import { Platform } from 'react-native';
import {
  actualSize,
  addBatchFiles,
  closeBatch,
  downloadImage,
  fitView,
  loadPhoto,
  openBatch,
  pickPhoto,
  setHold,
  toggleCompare,
  undo,
  useEditor,
  zoomIn,
  zoomOut,
} from '@/lib/editor';

/**
 * Window-level behaviour: keyboard shortcuts, drag-and-drop of photos, and pasting.
 * Mounted once by the studio.
 */
export function useGlobalEvents() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let depth = 0;

    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      depth++;
      useEditor.setState({ dragging: true });
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDragLeave = () => {
      if (--depth <= 0) {
        depth = 0;
        useEditor.setState({ dragging: false });
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      useEditor.setState({ dragging: false });
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      // Several photos (or a drop while the batch dialog is open) go to batch mode.
      if (useEditor.getState().batchOpen || files.length > 1) {
        openBatch();
        addBatchFiles(files);
      } else void loadPhoto(files[0], files[0].name);
    };
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (file) void loadPhoto(file, file.name || 'pasted');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') return (e.preventDefault(), void undo());
      if (mod && key === 'o') return (e.preventDefault(), pickPhoto());
      if (mod && key === 's') return (e.preventDefault(), void downloadImage());
      if (e.key === 'Escape' && useEditor.getState().batchOpen) return closeBatch();

      const s = useEditor.getState();
      if (mod || !s.work || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === '\\' && !e.repeat) setHold(true);
      else if (key === 'c') toggleCompare();
      else if (e.key === '0') fitView();
      else if (e.key === '1') actualSize();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === '\\') setHold(false);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
