const { writeFileSync, readFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const BADGE_H    = 28;
const BADGE_GAP  = 8;
const LABEL_H    = 44;
const SECTION_GAP = 8;
const SVG_H      = LABEL_H + SECTION_GAP + BADGE_H; // 80

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

function buildSectionSvg(label, badges) {
  const widths = badges.map(b => badgeWidth(b.text));
  const totalBadgesW = widths.reduce((sum, w) => sum + w, 0) + (badges.length - 1) * BADGE_GAP;
  const labelTextW   = label.length * 8.5 + 20;
  const svgW         = Math.round(Math.max(totalBadgesW, labelTextW));
  const badgesStartX = Math.round((svgW - totalBadgesW) / 2);
  const badgesY      = LABEL_H + SECTION_GAP;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${SVG_H}" viewBox="0 0 ${svgW} ${SVG_H}">\n`;
  svg += `  <style>\n`;
  svg += `    @media (prefers-color-scheme: light) { .label { fill: #1e1b4b; } }\n`;
  svg += `    @media (prefers-color-scheme: dark)  { .label { fill: #ffffff; } }\n`;
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
    const textColor = isLight(color) ? '#1a1a1a' : '#ffffff';
    const textX     = Math.round(x + (w + 7) / 2); // offset for left stripe

    svg += `  <!-- ${escapeXml(text)} -->\n`;
    svg += `  <rect x="${x}"     y="${badgesY}" width="${w}" height="${BADGE_H}" rx="4" fill="${color}"/>\n`;
    svg += `  <rect x="${x}"     y="${badgesY}" width="7"    height="${BADGE_H}" rx="4" fill="${darkColor}"/>\n`;
    svg += `  <rect x="${x + 3}" y="${badgesY}" width="4"    height="${BADGE_H}"        fill="${darkColor}"/>\n`;
    svg += `  <text x="${textX}" y="${badgesY + 18}" text-anchor="middle" fill="${textColor}"`;
    svg += ` font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;
    svg += ` font-size="11" font-weight="700" letter-spacing="0.8">${escapeXml(text)}</text>\n\n`;

    x += w + BADGE_GAP;
  }

  svg += `</svg>`;
  return svg;
}

function main() {
  const config   = loadConfig();
  const sections = (config.sections ?? []).filter(s => s && typeof s === 'object' && s.id);

  if (!sections.length) {
    console.error('Error: config.json has no valid sections.');
    process.exit(1);
  }

  const outDir = join(__dirname, '..', 'assets', 'sections');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const section of sections) {
    if (!section.label || !section.badges?.length) {
      console.warn(`Skipping section "${section.id}": missing label or badges.`);
      continue;
    }
    const svg     = buildSectionSvg(section.label, section.badges);
    const outPath = join(outDir, `${section.id}.svg`);
    writeFileSync(outPath, svg, 'utf8');
    console.log(`Generated assets/sections/${section.id}.svg — ${section.badges.length} badges`);
  }
}

main();
