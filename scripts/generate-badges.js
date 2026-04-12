// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { writeFileSync, readFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const BADGE_H   = 28;
const GLOW_PAD  = 3;
const FONT_SIZE = 11;
const LETTER_SP = 0.8;
const STRIPE_W  = 7;
const STRIPE_PAD = 3;
const BADGE_RX  = 4;

function loadConfig() {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf8'));
  } catch { return {}; }
}

function escapeXml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function darkenHex(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  const d = v => Math.round(v*0.68).toString(16).padStart(2,'0');
  return `#${d(r)}${d(g)}${d(b)}`;
}

function isLight(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return 0.299*r + 0.587*g + 0.114*b > 128;
}

function badgeWidth(text) {
  const textW = text.length * 7.8 + (text.length - 1) * LETTER_SP;
  return Math.round(Math.max(50, textW) + 46);
}

function buildBadgeSvg(text, color) {
  const w    = badgeWidth(text);
  const svgW = w + GLOW_PAD * 2;
  const svgH = BADGE_H + GLOW_PAD * 2;
  const bx   = GLOW_PAD;
  const by   = GLOW_PAD;
  const textX = Math.round(bx + (w + STRIPE_W) / 2);
  const textY = by + 18;

  const darkColor   = darkenHex(color);
  const light       = isLight(color);
  const textColor   = light ? '#1a1a1a' : '#ffffff';
  const shadowColor = light ? '#ffffff' : '#000000';

  const steps   = 20;
  const vals    = Array.from({length:steps},(_,k)=>(Math.sin((k/(steps-1))*Math.PI)*0.75).toFixed(3));
  const times   = Array.from({length:steps},(_,k)=>(k/(steps-1)).toFixed(3));
  const splines = Array.from({length:steps-1},()=>'0.4 0 0.6 1');

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n`;
  svg += `  <defs>\n`;
  svg += `    <filter id="glow" x="-20%" y="-60%" width="140%" height="220%">\n`;
  svg += `      <feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="${color}" flood-opacity="0">\n`;
  svg += `        <animate attributeName="flood-opacity" values="${vals.join(';')}" dur="4s" repeatCount="indefinite"\n`;
  svg += `                 calcMode="spline" keyTimes="${times.join(';')}" keySplines="${splines.join(';')}"/>\n`;
  svg += `      </feDropShadow>\n`;
  svg += `    </filter>\n`;
  svg += `    <filter id="text-blur" x="-60%" y="-80%" width="220%" height="260%">\n`;
  svg += `      <feGaussianBlur stdDeviation="8 3"/>\n`;
  svg += `    </filter>\n`;
  svg += `  </defs>\n\n`;

  svg += `  <rect x="${bx}" y="${by}" width="${w}" height="${BADGE_H}" rx="${BADGE_RX}" fill="${color}" filter="url(#glow)"/>\n`;
  svg += `  <rect x="${bx}" y="${by}" width="${STRIPE_W}" height="${BADGE_H}" rx="${BADGE_RX}" fill="${darkColor}"/>\n`;
  svg += `  <rect x="${bx+STRIPE_PAD}" y="${by}" width="${STRIPE_W-STRIPE_PAD}" height="${BADGE_H}" fill="${darkColor}"/>\n`;
  for (let s = 0; s < 2; s++) {
    svg += `  <text x="${textX}" y="${textY}" text-anchor="middle" fill="${shadowColor}" opacity="0.5" filter="url(#text-blur)"`;
    svg += ` font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;
    svg += ` font-size="${FONT_SIZE}" font-weight="700" letter-spacing="${LETTER_SP}">${escapeXml(text)}</text>\n`;
  }
  svg += `  <text x="${textX}" y="${textY}" text-anchor="middle" fill="${textColor}"`;
  svg += ` font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;
  svg += ` font-size="${FONT_SIZE}" font-weight="700" letter-spacing="${LETTER_SP}">${escapeXml(text)}</text>\n`;
  svg += `</svg>`;
  return svg;
}

function main() {
  const config = loadConfig();
  const badges = (config.badges ?? []).filter(b => b && b.id && b.text && b.color);

  if (!badges.length) { console.error('Error: config.json has no valid badges.'); process.exit(1); }

  const outDir = join(__dirname, '..', 'assets', 'badges');
  mkdirSync(outDir, { recursive: true });

  for (const { id, text, color } of badges) {
    writeFileSync(join(outDir, `${id}.svg`), buildBadgeSvg(text, color), 'utf8');
    console.log(`Generated assets/badges/${id}.svg`);
  }
}

main();
