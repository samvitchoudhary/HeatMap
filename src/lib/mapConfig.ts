/**
 * mapConfig.ts
 *
 * Heatmap visualization configuration for the map screen.
 *
 * Key responsibilities:
 * - Gradient colors and stop points for heatmap intensity display
 * - Radius and opacity for heatmap points (controls visual density)
 */

/** Gradient from transparent to solid coral - maps intensity to visual heat */
export const HEATMAP_GRADIENT = {
  colors: ['transparent', 'rgba(255,45,85,0.3)', 'rgba(255,45,85,0.5)', 'rgba(255,45,85,0.7)', 'rgba(255,45,85,1)'],
  startPoints: [0.01, 0.05, 0.1, 0.3, 0.5],
  colorMapSize: 256,
};

/** Pixel radius of each heatmap point - larger = more overlap, smoother blobs */
export const HEATMAP_RADIUS = 40;
/** Opacity of heatmap layer (0–1) - 0.8 keeps underlying map visible */
export const HEATMAP_OPACITY = 0.8;
