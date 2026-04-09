// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { readFileSync } = require('fs');
const { join } = require('path');

const DEFAULT_GRADIENT_COLORS = ['transparent', 'transparent'];
const DEFAULT_ACCENT          = { dark: '#e6edf3', light: '#1f2328' };
const FADE_OFFSET             = 50;

// Named CSS colors → { r, g, b, a }
const NAMED_COLORS = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  none:        { r: 0, g: 0, b: 0, a: 0 },
  black:       { r: 0,   g: 0,   b: 0,   a: 1 },
  white:       { r: 255, g: 255, b: 255, a: 1 },
  red:         { r: 255, g: 0,   b: 0,   a: 1 },
  green:       { r: 0,   g: 128, b: 0,   a: 1 },
  blue:        { r: 0,   g: 0,   b: 255, a: 1 },
  yellow:      { r: 255, g: 255, b: 0,   a: 1 },
  cyan:        { r: 0,   g: 255, b: 255, a: 1 },
  magenta:     { r: 255, g: 0,   b: 255, a: 1 },
  orange:      { r: 255, g: 165, b: 0,   a: 1 },
  purple:      { r: 128, g: 0,   b: 128, a: 1 },
  pink:        { r: 255, g: 192, b: 203, a: 1 },
  gray:        { r: 128, g: 128, b: 128, a: 1 },
  grey:        { r: 128, g: 128, b: 128, a: 1 },
};

function parseColor(v) {
  if (!v || typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();

  if (NAMED_COLORS[s]) return { ...NAMED_COLORS[s] };

  if (/^#[0-9a-f]{6}$/.test(s))
    return { r: parseInt(s.slice(1,3),16), g: parseInt(s.slice(3,5),16), b: parseInt(s.slice(5,7),16), a: 1 };

  if (/^#[0-9a-f]{8}$/.test(s))
    return { r: parseInt(s.slice(1,3),16), g: parseInt(s.slice(3,5),16), b: parseInt(s.slice(5,7),16), a: parseInt(s.slice(7,9),16)/255 };

  if (/^#[0-9a-f]{3}$/.test(s))
    return { r: parseInt(s[1]+s[1],16), g: parseInt(s[2]+s[2],16), b: parseInt(s[3]+s[3],16), a: 1 };

  const rgb = s.match(/^rgba?\s*\(\s*([\d.%]+)\s*,\s*([\d.%]+)\s*,\s*([\d.%]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (rgb) {
    const ch = v => v.endsWith('%') ? parseFloat(v)/100*255 : parseFloat(v);
    return { r: ch(rgb[1]), g: ch(rgb[2]), b: ch(rgb[3]), a: rgb[4] !== undefined ? parseFloat(rgb[4]) : 1 };
  }

  const hsl = s.match(/^hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/);
  if (hsl) {
    const h = parseFloat(hsl[1])/360, sv = parseFloat(hsl[2])/100, l = parseFloat(hsl[3])/100;
    const a = hsl[4] !== undefined ? parseFloat(hsl[4]) : 1;
    if (sv === 0) { const val = Math.round(l*255); return { r: val, g: val, b: val, a }; }
    const q = l < 0.5 ? l*(1+sv) : l+sv-l*sv, p = 2*l-q;
    const hue2rgb = t => { const tn = ((t%1)+1)%1; if (tn<1/6) return p+(q-p)*6*tn; if (tn<1/2) return q; if (tn<2/3) return p+(q-p)*(2/3-tn)*6; return p; };
    return { r: hue2rgb(h+1/3)*255, g: hue2rgb(h)*255, b: hue2rgb(h-1/3)*255, a };
  }

  return { r: 0, g: 0, b: 0, a: 0 };
}

function colorToRgba({ r, g, b, a }) {
  const c = v => Math.round(Math.max(0, Math.min(255, v)));
  const alpha = Math.max(0, Math.min(1, a));
  if (alpha === 1) return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
  return `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${parseFloat(alpha.toFixed(4))})`;
}

function isValidColor(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Returns { gradientStops, accent, titleColor, fade }.
 * fade: { left: bool, right: bool }
 */
function resolveTheme(theme) {
  const grad   = theme?.gradient;
  const colors = grad?.colors;
  const [start, end] = (Array.isArray(colors) && colors.length === 2 && colors.every(isValidColor))
    ? colors : DEFAULT_GRADIENT_COLORS;

  const accent = isValidColor(theme?.accent)
    ? { dark: theme.accent, light: theme.accent }
    : DEFAULT_ACCENT;

  const fade = {
    left:  grad?.fade?.left  !== false,
    right: grad?.fade?.right !== false,
  };

  const startP = parseColor(start);
  const endP   = parseColor(end);

  return {
    gradientStops: [
      { offset: '0%',   color: colorToRgba(startP) },
      { offset: '100%', color: colorToRgba(endP)   },
    ],
    accent,
    titleColor: DEFAULT_ACCENT,
    gradientEnd: end,
    fade,
  };
}

/**
 * Returns SVG defs markup for a combined fade mask based on fade.left / fade.right.
 * Returns null if both sides are disabled.
 * Usage: add returned string inside <defs>, then wrap content with <g mask="url(#fade-mask)">
 */
function buildFadeMask(fade) {
  if (!fade.left && !fade.right) return null;

  const stops = [];
  if (fade.left) {
    stops.push(`      <stop offset="0%"              stop-color="white" stop-opacity="0"/>`);
    stops.push(`      <stop offset="${FADE_OFFSET}%"  stop-color="white" stop-opacity="1"/>`);
  } else {
    stops.push(`      <stop offset="0%"              stop-color="white" stop-opacity="1"/>`);
  }
  if (fade.right) {
    stops.push(`      <stop offset="${100 - FADE_OFFSET}%" stop-color="white" stop-opacity="1"/>`);
    stops.push(`      <stop offset="100%"             stop-color="white" stop-opacity="0"/>`);
  } else {
    stops.push(`      <stop offset="100%"             stop-color="white" stop-opacity="1"/>`);
  }

  return `    <linearGradient id="fade-grad" x1="0" y1="0" x2="1" y2="0">
${stops.join('\n')}
    </linearGradient>
    <mask id="fade-mask">
      <rect width="100%" height="100%" fill="url(#fade-grad)"/>
    </mask>`;
}

function loadTheme() {
  try {
    const config = JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf8'));
    return config.theme ?? {};
  } catch {
    return {};
  }
}

module.exports = { resolveTheme, loadTheme, buildFadeMask };
