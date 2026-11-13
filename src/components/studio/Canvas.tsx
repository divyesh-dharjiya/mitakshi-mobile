/**
 * Type entry for the stage canvas. The bundler picks Canvas.web.tsx (DOM + WebGL2) in the browser
 * and Canvas.native.tsx (Skia + gesture handler) on iOS / Android; both take the same props.
 */
export { Canvas } from './Canvas.web';
