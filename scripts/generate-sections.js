// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { writeFileSync, readFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');
const { resolveTheme, loadTheme } = require('./theme');

const BADGE_H    = 28;
const BADGE_GAP  = 8;
const LABEL_H    = 44;
const SECTION_GAP = 8;
const GLOW_PAD   = 12; // extra space for glow overflow on all sides
const SVG_H      = LABEL_H + SECTION_GAP + BADGE_H + GLOW_PAD; // 92

function loadConfig() {
  try {
    const raw = readFileSync(join(__dirname, '..', 'config.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function darkenHex(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const d = v => Math.round(v * 0.68).toString(16).padStart(2, '0');
  return `#${d(r)}${d(g)}${d(b)}`;
}

function isLight(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 128;
}

// Approximate badge width for uppercase text at font-size 11, bold, letter-spacing 0.8
function badgeWidth(text) {
  const textW = text.length * 7.8 + (text.length - 1) * 0.8;
  return Math.round(Math.max(50, textW) + 46); // 46 = stripe(7) + left + right padding
}

function buildSectionSvg(label, badges, titleColor) {
  const widths = badges.map(b => badgeWidth(b.text));
  const totalBadgesW = widths.reduce((sum, w) => sum + w, 0) + (badges.length - 1) * BADGE_GAP;
  const labelTextW   = label.length * 8.5 + 20;
  const innerW       = Math.round(Math.max(totalBadgesW, labelTextW));
  const svgW         = innerW + GLOW_PAD * 2;
  const badgesStartX = Math.round((innerW - totalBadgesW) / 2) + GLOW_PAD;
  const badgesY      = LABEL_H + SECTION_GAP;

  // Build per-badge filters: glow pulse + text shadow
  let filters = '';
  for (let i = 0; i < badges.length; i++) {
    const { color } = badges[i];
    const delay = (i * 1.2).toFixed(2);
    filters += `  <filter id="glow-${i}" x="-20%" y="-60%" width="140%" height="220%">\n`;
    filters += `    <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="${color}" flood-opacity="0">\n`;
    filters += `      <animate attributeName="flood-opacity"\n`;
    // 20-point sine curve: sin(i/19 * π) * 0.75
    const steps = 20;
    const opacityVals = Array.from({ length: steps }, (_, i) => (Math.sin((i / (steps - 1)) * Math.PI) * 0.75).toFixed(3));
    const keyTimesVals = Array.from({ length: steps }, (_, i) => (i / (steps - 1)).toFixed(3));
    const keySplinesVals = Array.from({ length: steps - 1 }, () => '0.4 0 0.6 1');
    filters += `        values="${opacityVals.join(';')}" dur="4s" begin="${delay}s" repeatCount="indefinite"\n`;
    filters += `               calcMode="spline" keyTimes="${keyTimesVals.join(';')}"\n`;
    filters += `               keySplines="${keySplinesVals.join(';')}"/>\n`;
    filters += `    </feDropShadow>\n`;
    filters += `  </filter>\n`;
  }
  // Shared blur filter for shadow text layer
  filters += `  <filter id="text-blur" x="-60%" y="-80%" width="220%" height="260%">\n`;
  filters += `    <feGaussianBlur stdDeviation="8 3"/>\n`;
  filters += `  </filter>\n`;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${SVG_H}" viewBox="0 0 ${svgW} ${SVG_H}">\n`;
  svg += `  <defs>\n${filters}  </defs>\n`;
  svg += `  <style>\n`;
  svg += `    @media (prefers-color-scheme: light) { .label { fill: ${titleColor.light}; } }\n`;
  svg += `    @media (prefers-color-scheme: dark)  { .label { fill: ${titleColor.dark}; } }\n`;
  svg += `  </style>\n\n`;

  // Label
  svg += `  <!-- Label -->\n`;
  svg += `  <text class="label" x="${svgW / 2}" y="26" text-anchor="middle"`;
  svg += ` font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;
  svg += ` font-size="15" font-weight="600">${escapeXml(label)}</text>\n\n`;

  // Badges
  svg += `  <!-- Badges -->\n`;
  let x = badgesStartX;
  for (let i = 0; i < badges.length; i++) {
    const { text, color } = badges[i];
    const w         = widths[i];
    const darkColor = darkenHex(color);
    const light      = isLight(color);
    const textColor  = light ? '#1a1a1a' : '#ffffff';
    const shadowColor = light ? '#ffffff' : '#000000';
    const shadowOpacity = '0.5';
    const textX      = Math.round(x + (w + 7) / 2); // offset for left stripe
    const textY      = badgesY + 18;
    const scaleX     = 1.0; // no horizontal stretch
    // shadow pivot is textX, so translate back: tx = textX - textX * scaleX = textX * (1 - scaleX)
    const tx         = Math.round(textX * (1 - scaleX));

    svg += `  <!-- ${escapeXml(text)} -->\n`;
    svg += `  <rect x="${x}"     y="${badgesY}" width="${w}" height="${BADGE_H}" rx="4" fill="${color}" filter="url(#glow-${i})"/>\n`;
    svg += `  <rect x="${x}"     y="${badgesY}" width="7"    height="${BADGE_H}" rx="4" fill="${darkColor}"/>\n`;
    svg += `  <rect x="${x + 3}" y="${badgesY}" width="4"    height="${BADGE_H}"        fill="${darkColor}"/>\n`;
    // Shadow layer: repeated 4x for density
    for (let s = 0; s < 2; s++) {
      svg += `  <text x="${textX}" y="${textY}" text-anchor="middle" fill="${shadowColor}" opacity="${shadowOpacity}"`;
      svg += ` transform="translate(${tx}, 0) scale(${scaleX}, 1)"`;
      svg += ` filter="url(#text-blur)"`;
      svg += ` font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;
      svg += ` font-size="11" font-weight="700" letter-spacing="0.8">${escapeXml(text)}</text>\n`;
    }
    // Real text on top
    svg += `  <text x="${textX}" y="${textY}" text-anchor="middle" fill="${textColor}"`;
    svg += ` font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;
    svg += ` font-size="11" font-weight="700" letter-spacing="0.8">${escapeXml(text)}</text>\n\n`;

    x += w + BADGE_GAP;
  }

  svg += `</svg>`;
  return svg;
}

function main() {
  const config      = loadConfig();
  const sections    = (config.sections ?? []).filter(s => s && typeof s === 'object' && s.id);
  const { titleColor } = resolveTheme(loadTheme());

  if (!sections.length) {
    console.error('Error: config.json has no valid sections.');
    process.exit(1);
  }

  const outDir = join(__dirname, '..', 'assets', 'sections');
  mkdirSync(outDir, { recursive: true });

  for (const section of sections) {
    if (!section.label || !section.badges?.length) {
      console.warn(`Skipping section "${section.id}": missing label or badges.`);
      continue;
    }
    const svg     = buildSectionSvg(section.label, section.badges, titleColor);
    const outPath = join(outDir, `${section.id}.svg`);
    writeFileSync(outPath, svg, 'utf8');
    console.log(`Generated assets/sections/${section.id}.svg — ${section.badges.length} badges`);
  }
}

main();
