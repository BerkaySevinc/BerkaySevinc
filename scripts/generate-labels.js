// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { writeFileSync, readFileSync, mkdirSync } = require('fs');
const { join } = require('path');
const { resolveTheme, loadTheme } = require('./theme');

const FONT_SIZE = 15;
const FONT_W    = 8.5; // approximate px per character at font-size 15, weight 600
const PAD       = 12;  // padding on all sides
const LABEL_H   = FONT_SIZE + PAD * 2; // 47

function loadConfig() {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf8'));
  } catch { return {}; }
}

function escapeXml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildLabelSvg(text, titleColor) {
  const svgW = Math.round(text.length * FONT_W + PAD * 2);
  const textY = Math.round(LABEL_H / 2);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${LABEL_H}" viewBox="0 0 ${svgW} ${LABEL_H}">\n`;
  svg += `  <style>\n`;
  svg += `    @media (prefers-color-scheme: light) { .label { fill: ${titleColor.light}; } }\n`;
  svg += `    @media (prefers-color-scheme: dark)  { .label { fill: ${titleColor.dark}; } }\n`;
  svg += `  </style>\n`;
  svg += `  <text class="label" x="${svgW / 2}" y="${textY}" dominant-baseline="middle" text-anchor="middle"`;
  svg += ` font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;
  svg += ` font-size="${FONT_SIZE}" font-weight="600">${escapeXml(text)}</text>\n`;
  svg += `</svg>`;
  return svg;
}

function main() {
  const config = loadConfig();
  const labels = (config.labels ?? []).filter(l => l && l.id && l.text);
  const { titleColor } = resolveTheme(loadTheme());

  if (!labels.length) { console.error('Error: config.json has no valid labels.'); process.exit(1); }

  const outDir = join(__dirname, '..', 'assets', 'labels');
  mkdirSync(outDir, { recursive: true });

  for (const { id, text } of labels) {
    writeFileSync(join(outDir, `${id}.svg`), buildLabelSvg(text, titleColor), 'utf8');
    console.log(`Generated assets/labels/${id}.svg — "${text}"`);
  }
}

main();
