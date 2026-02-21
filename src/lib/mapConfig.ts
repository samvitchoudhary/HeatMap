/**
 * Map styles and heatmap gradient for HomeScreen.
 */

export const LIGHT_MAP_STYLE = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e0f0ff' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e0e0e0' }] },
];

export const HEATMAP_GRADIENT = {
  colors: ['rgba(255, 77, 106, 0.15)', 'rgba(255, 77, 106, 0.4)', 'rgba(255, 77, 106, 0.7)', 'rgba(255, 59, 48, 1.0)'],
  startPoints: [0.1, 0.3, 0.6, 1.0],
  colorMapSize: 256,
};
