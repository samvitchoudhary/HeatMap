export const theme = {
  colors: {
    // Backgrounds
    background: '#FFFFFF',
    surface: '#F5F5F7',
    surfaceLight: '#EEEEF0',

    // Primary accent — red/coral gradient endpoints
    primary: '#FF4D6A', // Vibrant coral-red
    primaryDark: '#E63956', // Deeper red for pressed states
    primaryLight: '#FF7A8F', // Lighter coral for subtle accents

    // Secondary accent — warm orange (complements the red)
    secondary: '#FF8C42', // Warm amber-orange
    secondaryLight: '#FFB074', // Light orange for backgrounds

    // Tertiary accent — deep charcoal (grounds the vibrant colors)
    tertiary: '#2D2D3A', // Near-black with a slight warmth

    // Text
    text: '#1A1A2E', // Very dark navy-black
    textSecondary: '#6B6B7B', // Medium gray with slight warmth
    textTertiary: '#9E9EAE', // Light gray
    textOnPrimary: '#FFFFFF', // White text on colored backgrounds

    // Borders & dividers
    border: '#E5E5EA',
    borderLight: '#F0F0F5',

    // Functional colors
    red: '#FF3B30',
    green: '#34C759',

    // Overlays
    overlay: 'rgba(26, 26, 46, 0.75)',
    overlayMedium: 'rgba(26, 26, 46, 0.5)',

    // Aliases (backwards compatibility)
    light: '#FFFFFF',
    textOnLight: '#FFFFFF',

    // Cards
    cardBackground: '#FFFFFF',
    cardShadow: 'rgba(255, 77, 106, 0.08)', // Subtle pink shadow for cards
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
      shadowColor: '#FF4D6A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 4,
    },
    button: {
      shadowColor: '#FF4D6A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
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
