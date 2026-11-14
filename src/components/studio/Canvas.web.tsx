import { type CSSProperties, useEffect, useRef } from 'react';
import { ChevronsLeftRight } from '@/components/icons';
import { Viewer } from '@/lib/viewer';
import { ensureCompositor, rt, scheduleRender } from '@/lib/editor/runtime';
import { useEditor } from '@/lib/editor';

/**
 * The GPU-rendered picture, the before/after split handle and the
 * pan/zoom viewer. On web these are real DOM canvases (WebGL2 + 2D), driven imperatively so
 * panning, zooming and slider moves never re-render React.
 */
export function Canvas({ insetBottom }: { insetBottom: number }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);

  const hasPhoto = useEditor((s) => s.work !== null);

  // Attach the GPU compositor and the viewer once the canvases exist.
  useEffect(() => {
    const canvas = canvasRef.current!;
    let comp;
    try {
      comp = ensureCompositor(canvas);
    } catch (e) {
      console.error(e);
      return;
    }
    const viewer = new Viewer(stageRef.current!, artRef.current!, splitRef.current!, {
      onSplit: (uv) => {
        comp.setSplit(uv);
        scheduleRender();
      },
      onZoom: (zoom) => {
        if (useEditor.getState().zoom !== zoom) useEditor.setState({ zoom });
      },
    });
    rt.viewer = viewer;

    // A fresh canvas has an empty GPU context: re-upload the current picture if one is open.
    const s = useEditor.getState();
    if (s.origPreview && s.preview) {
      comp.setOriginal(s.origPreview);
      comp.setImage(s.preview);
      comp.setMask(s.mask);
      viewer.setImageSize(s.preview.width, s.preview.height);
      viewer.setCompare(s.compare);
      scheduleRender();
    }
    return () => {
      viewer.destroy();
      if (rt.viewer === viewer) rt.viewer = null;
    };
  }, []);

  // Panels and the zoom bar change the clear area, so re-centre the picture.
  useEffect(() => {
    if (hasPhoto) rt.viewer?.fit(true);
  }, [hasPhoto, insetBottom]);

  return (
    <div
      ref={stageRef}
      aria-label="Preview"
      style={{ ...css.stage, cursor: 'grab', ['--inset-bottom' as string]: `${hasPhoto ? insetBottom : 0}px` }}
    >
      <div ref={artRef} style={{ ...css.art, visibility: hasPhoto ? 'visible' : 'hidden' }}>
        <canvas ref={canvasRef} style={css.layer} aria-label="Edited photo" />
      </div>

      <div ref={splitRef} style={{ ...css.split, bottom: hasPhoto ? insetBottom : 0 }} data-viewer-ignore>
        <div style={css.splitHit} />
        <div style={css.splitLine} />
        <div style={css.splitKnob}>
          <ChevronsLeftRight size={18} color="#17140d" />
        </div>
        <span style={{ ...css.splitTag, right: 14 }}>Before</span>
        <span style={{ ...css.splitTag, left: 14 }}>After</span>
      </div>
    </div>
  );
}

const css = {
  stage: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    touchAction: 'none',
    userSelect: 'none',
  },
  art: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    transformOrigin: '0 0',
    willChange: 'transform',
    borderRadius: 4,
    boxShadow: '0 30px 80px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.05)',
  },
  layer: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', borderRadius: 4 },
  split: { position: 'absolute', top: 0, left: 0, width: 0, zIndex: 2, cursor: 'ew-resize', display: 'none' },
  splitHit: { position: 'absolute', top: 0, bottom: 0, left: -18, width: 36 },
  splitLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -1,
    width: 2,
    borderRadius: 2,
    background: '#fff',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.12), 0 0 14px rgba(0,0,0,0.45)',
  },
  splitKnob: {
    position: 'absolute',
    top: '50%',
    left: -22,
    width: 44,
    height: 44,
    marginTop: -22,
    display: 'grid',
    placeItems: 'center',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.92)',
    boxShadow: '0 10px 28px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.6)',
  },
  splitTag: {
    position: 'absolute',
    top: 14,
    padding: '5px 11px',
    borderRadius: 999,
    background: 'rgba(12,12,13,0.6)',
    backdropFilter: 'blur(10px)',
    color: '#fff',
    fontFamily: 'Inter_600SemiBold, system-ui, sans-serif',
    fontSize: 11,
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
} satisfies Record<string, CSSProperties>;
