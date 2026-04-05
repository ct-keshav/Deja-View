// Deja View - Theme Constants  ("Red Ocean")
// Gradient: #1d4350 (dark teal) → #a43931 (deep red)
// Single source of truth for toolbar (Shadow DOM) colors.
// Keep in sync with lib/theme.css.

var VDiff = window.VDiff || {};

VDiff.theme = {
  // Base backgrounds
  bgPrimary:   '#1f2f33',
  bgSecondary: '#283d41',
  bgTertiary:  '#334b4f',

  // Borders
  borderDefault: '#436065',
  borderMuted:   '#587578',

  // Text
  textPrimary:   '#f5efea',
  textSecondary: '#d2c8be',
  textMuted:     '#a89e96',

  // Accent
  accentTeal:  '#1d4350',
  accentRed:   '#a43931',
  accentWarm:  '#d4605a',
  gradientAccent:       'linear-gradient(135deg, #1d4350 0%, #a43931 100%)',
  gradientAccentBright: 'linear-gradient(135deg, #2e6e80 0%, #d4605a 100%)',

  // Semantic
  colorSuccess: '#4caf7d',
  colorDanger:  '#d44840',
  colorWarning: '#d4a24c',

  // Shadows
  shadowOverlay: '0 2px 12px rgba(0,0,0,0.5)',

  // Tints
  tintAccent3: 'rgba(164, 57, 49, 0.04)',
  tintAccent5: 'rgba(164, 57, 49, 0.07)',
  tintAccent8: 'rgba(164, 57, 49, 0.10)',

  // Radii
  radiusSm: '6px',
  radiusMd: '10px',
};

window.VDiff = VDiff;
