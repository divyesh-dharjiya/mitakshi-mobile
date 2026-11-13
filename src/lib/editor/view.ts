import { rt } from './runtime';
import { type Tab, useEditor } from './store';

/** Navigation and view state: tabs, before/after compare, press-and-hold and zoom. */

/** Switch tools. The background engine starts only when a background mode is picked, not on opening the tab. */
export function setTab(tab: Tab) {
  const s = useEditor.getState();
  useEditor.setState({ tab });
  // The before/after split belongs to Enhance: with it left on, half the photo would ignore every edit.
  if (tab !== 'enhance' && s.compare) setCompare(false);
}

export function setCompare(on: boolean) {
  useEditor.setState({ compare: on });
  rt.viewer?.setCompare(on);
}

export const toggleCompare = () => setCompare(!useEditor.getState().compare);

/** Show the untouched original while held. */
export const setHold = (on: boolean) => rt.viewer?.hold(on);

export const zoomIn = () => rt.viewer?.zoomBy(1.25);
export const zoomOut = () => rt.viewer?.zoomBy(0.8);
export const fitView = () => rt.viewer?.fit();
export const actualSize = () => rt.viewer?.actualSize();
