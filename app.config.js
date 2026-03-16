/**
 * app.config.js
 *
 * Expo configuration for HeatMap.
 *
 * Key settings:
 * - name, slug, version, orientation (portrait)
 * - iOS/Android: googleMapsApiKey from env (for MapView, Places API)
 * - iOS: bundleIdentifier; Android: adaptive icon, edgeToEdgeEnabled
 * - newArchEnabled: React Native new architecture
 */

/**
 * app.config.js
 *
 * Expo configuration for HeatMap.
 */

require('dotenv/config');

module.exports = {
  expo: {
    name: 'HeatMap',
    slug: 'HeatMap',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
      bundleIdentifier: 'com.samvit.heatmap',
      buildNumber: '1',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      eas: {
        projectId: '591c9f50-6fac-4d24-8649-a35349187629',
      },
    },
  },
};