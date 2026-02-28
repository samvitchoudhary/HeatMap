export const theme = {
  colors: {
    // Backgrounds — clean whites
    background: '#FFFFFF',
    surface: '#F5F5F5',
    surfaceLight: '#EEEEEE',

    // Primary — bold vibrant coral/red
    primary: '#FF2D55',
    primaryDark: '#E6002E',
    primaryLight: '#FF6B8A',

    // Secondary — warm vibrant orange
    secondary: '#FF9500',
    secondaryLight: '#FFB366',

    // Tertiary — deep charcoal
    tertiary: '#1A1A1A',

    // Text — strong contrast
    text: '#1A1A1A',
    textSecondary: '#555555',
    textTertiary: '#888888',
    textOnPrimary: '#FFFFFF',

    // Borders
    border: '#DDDDDD',
    borderLight: '#EEEEEE',

    // Functional colors — bold and vivid
    red: '#FF3B30',
    green: '#34C759',
    blue: '#007AFF',
    orange: '#FF9500',
    yellow: '#FFCC00',

    // Overlays
    overlay: 'rgba(0, 0, 0, 0.6)',
    overlayMedium: 'rgba(0, 0, 0, 0.5)',

    // Aliases (backwards compatibility)
    light: '#FFFFFF',
    textOnLight: '#FFFFFF',

    // Cards
    cardBackground: '#FFFFFF',
    cardShadow: 'rgba(255, 45, 85, 0.12)',

    // Tab bar
    tabActive: '#FF2D55',
    tabInactive: '#BBBBBB',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  shadows: {
    card: {
      shadowColor: '#FF2D55',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 4,
    },
    button: {
      shadowColor: '#FF2D55',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 3,
    },
  },
  // Layout (backwards compatibility)
  screenPadding: 20,
  inputHeight: 48,
  listRowGap: 12,
  button: {
    primaryHeight: 48,
    secondaryHeight: 40,
    borderRadius: 12,
  },
};
