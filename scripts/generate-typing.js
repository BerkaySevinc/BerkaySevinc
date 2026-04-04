const { writeFileSync, readFileSync } = require('fs');
const { join } = require('path');

const CHAR_WIDTH  = 13.2;
const SVG_WIDTH   = 800;
const CYCLE_SECS  = 20;
const FONT_MARKER = '/* Clip rect animations */';


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

// Round to 2 decimal places, strip trailing .00
function r(n) {
  return parseFloat(n.toFixed(2));
}

function buildDynamicCss(lines) {
  const N      = lines.length;
  const window = 100 / N;
  let css = FONT_MARKER + '\n';

  // Clip rect animation class references
  for (let i = 0; i < N; i++) {
    css += `  .cr${i + 1} { animation: cl${i + 1} ${CYCLE_SECS}s infinite; }\n`;
  }

  // Clip rect keyframes
  for (let i = 0; i < N; i++) {
    const n          = i + 1;
    const chars      = lines[i].length;
    const width      = r(chars * CHAR_WIDTH);
    const start      = r(i * window);
    const typeEnd    = r(start + window * 0.35);
    const pauseEnd   = r(start + window * 0.65);
    const deleteEnd  = r(start + window * 0.85);

    css += `\n  /* Line ${n}: ${escapeXml(lines[i])} — ${chars} chars — ${width}px */\n`;
    css += `  @keyframes cl${n} {\n`;
    if (i > 0) css += `    0%, ${r(start - 0.1)}%  { width: 0; }\n`;
    css += `    ${start}%        { width: 0;       animation-timing-function: steps(${chars}, end); }\n`;
    css += `    ${typeEnd}%      { width: ${width}px; animation-timing-function: step-end; }\n`;
    css += `    ${pauseEnd}%     { width: ${width}px; animation-timing-function: steps(${chars}, end); }\n`;
    css += `    ${deleteEnd}%, 100%  { width: 0; }\n`;
    css += `  }\n`;
  }

  // Cursor wrapper animation class references
  css += '\n  /* Cursor wrappers — control position and visibility */\n';
  for (let i = 0; i < N; i++) {
    css += `  .cw${i + 1} { animation: cw${i + 1} ${CYCLE_SECS}s infinite; }\n`;
  }

  // Cursor wrapper keyframes
  for (let i = 0; i < N; i++) {
    const n         = i + 1;
    const chars     = lines[i].length;
    const width     = r(chars * CHAR_WIDTH);
    const start     = r(i * window);
    const typeEnd   = r(start + window * 0.35);
    const pauseEnd  = r(start + window * 0.65);
    const deleteEnd = r(start + window * 0.85);

    css += `\n  @keyframes cw${n} {\n`;
    if (i > 0) {
      css += `    0%, ${r(start - 0.1)}% { visibility: hidden; transform: translateX(0px); }\n`;
    }
    css += `    ${start}%       { transform: translateX(0px);      visibility: visible; animation-timing-function: steps(${chars}, end); }\n`;
    css += `    ${typeEnd}%     { transform: translateX(${width}px); visibility: visible; animation-timing-function: step-end; }\n`;
    css += `    ${pauseEnd}%    { transform: translateX(${width}px); visibility: visible; animation-timing-function: steps(${chars}, end); }\n`;
    css += `    ${deleteEnd}%   { transform: translateX(0px);      visibility: visible; }\n`;
    css += `    ${r(deleteEnd + 0.01)}%    { visibility: hidden; transform: translateX(0px); }\n`;
    css += `    100%      { visibility: hidden; transform: translateX(0px); }\n`;
    css += `  }\n`;
  }

  return css;
}

function buildSvgBody(lines) {
  const metrics = lines.map(line => ({
    textLength: r(line.length * CHAR_WIDTH),
    x:          r((SVG_WIDTH - line.length * CHAR_WIDTH) / 2),
  }));

  let out = '';

  // clipPaths
  out += '<defs>\n';
  for (let i = 0; i < lines.length; i++) {
    out += `  <clipPath id="cp${i + 1}"><rect class="cr${i + 1}" x="${metrics[i].x}" y="0" width="0" height="54"/></clipPath>\n`;
  }
  out += '</defs>\n\n';

  // text elements
  out += '<!-- Text lines -->\n';
  for (let i = 0; i < lines.length; i++) {
    const { x, textLength } = metrics[i];
    out += `<text class="t" clip-path="url(#cp${i + 1})" x="${x}" y="34" textLength="${textLength}" lengthAdjust="spacingAndGlyphs">${escapeXml(lines[i])}</text>\n`;
  }

  // cursor elements
  out += '\n<!-- Cursors -->\n';
  for (let i = 0; i < lines.length; i++) {
    out += `<g class="cw${i + 1}"><rect class="cur" x="${metrics[i].x}" y="16" width="2.5" height="22"/></g>\n`;
  }

  return out;
}

async function fetchProfileLines(owner) {
  const res = await fetch(`https://api.github.com/users/${owner}`, {
    headers: { 'User-Agent': 'github-profile-generator' },
  });
  if (!res.ok) {
    console.error(`GitHub API error: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const { bio, company, location, blog } = await res.json();
  const lines = [bio, company, location, blog].filter(Boolean);
  if (!lines.length) {
    console.error('Error: GitHub profile has no bio, company, location, or blog fields.');
    process.exit(1);
  }
  return lines;
}

async function main() {
  const config = loadConfig();
  let lines = config.typing?.lines?.length > 0 ? config.typing.lines : null;

  if (!lines) {
    const owner = process.env.GITHUB_REPOSITORY_OWNER;
    if (!owner) {
      console.error('Error: GITHUB_REPOSITORY_OWNER environment variable is not set.');
      process.exit(1);
    }
    lines = await fetchProfileLines(owner);
  }

  const existing = readFileSync(join(__dirname, '..', 'assets', 'typing.svg'), 'utf8');
  const markerIdx = existing.indexOf(FONT_MARKER);
  if (markerIdx === -1) {
    console.error('Error: Font marker not found in assets/typing.svg');
    process.exit(1);
  }

  const fontPrefix = existing.slice(0, markerIdx);

  const fixedCssTail = `
  /* Cursor blink */
  .cur { fill: #A78BFA; animation: blink 0.8s step-end infinite; }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0; }
  }
</style>

`;

  const svg = fontPrefix + buildDynamicCss(lines) + fixedCssTail + buildSvgBody(lines) + '\n</svg>';

  const outPath = join(__dirname, '..', 'assets', 'typing.svg');
  writeFileSync(outPath, svg, 'utf8');
  console.log(`Generated assets/typing.svg — ${lines.length} lines`);
}

main();
