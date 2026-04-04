const { writeFileSync, readFileSync } = require('fs');
const { join } = require('path');

const MAX_BIO_LENGTH = 80;

function loadConfig() {
  try {
    const raw = readFileSync(join(__dirname, '..', 'config.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!owner) {
    console.error('Error: GITHUB_REPOSITORY_OWNER environment variable is not set.');
    process.exit(1);
  }

  const config = loadConfig();
  const overrideName = config.header?.name?.trim();
  const overrideBio  = config.header?.bio?.trim();

  let apiName, apiBio;

  if (!overrideName || !overrideBio) {
    const headers = { 'User-Agent': 'github-profile-generator' };
    const res = await fetch(`https://api.github.com/users/${owner}`, { headers });
    if (!res.ok) {
      console.error(`GitHub API error: ${res.status} ${res.statusText}`);
      process.exit(1);
    }
    ({ name: apiName, bio: apiBio } = await res.json());
  }

  const displayName = overrideName || apiName || owner;
  const displayBio  = truncate(overrideBio ?? apiBio ?? '', MAX_BIO_LENGTH);

  const svg     = buildSvg(displayName, displayBio);
  const outPath = join(__dirname, '..', 'assets', 'header.svg');
  writeFileSync(outPath, svg, 'utf8');
  console.log(`Generated assets/header.svg — name: "${displayName}"`);
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max).trimEnd() + '\u2026' : str;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSvg(name, bio) {
  const bioLine = bio
    ? `\n  <!-- DESC -->
  <text x="750" y="178"
    font-family="Segoe UI, Arial, sans-serif"
    font-size="19"
    font-weight="400"
    fill="#e2d9f3"
    text-anchor="middle"
    letter-spacing="0.5"
    filter="url(#text-glow)">
    ${escapeXml(bio)}
  </text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 310" width="100%" height="100%">

  <defs>
    <linearGradient id="bg-grad-inv" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#0d1117"/>
      <stop offset="40%"  stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#4c1d95"/>
    </linearGradient>

    <filter id="alpha-boost-inv">
      <feComponentTransfer>
        <feFuncA type="linear" slope="1.15" />
      </feComponentTransfer>
    </filter>

    <filter id="text-glow" x="-10%" y="-30%" width="120%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#000000" flood-opacity="0.7"/>
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.5"/>
    </filter>

    <mask id="wave-mask-inv">
      <g filter="url(#alpha-boost-inv)">

        <path fill="#ffffff" opacity="0.5" d="M 0 270
C 222 310, 444 310, 667 270
C 889 230, 1111 230, 1334 270
C 1556 310, 1778 310, 2000 270
C 2222 230, 2444 230, 2667 270
C 2889 310, 3111 310, 3334 270
V 0 H 0 Z">
          <animateTransform attributeName="transform" type="translate"
            from="-1334 0" to="0 0" dur="4s" repeatCount="indefinite"/>
        </path>

        <path fill="#ffffff" opacity="0.5" d="M 0 270
C 222 310, 444 310, 667 270
C 889 230, 1111 230, 1334 270
C 1556 310, 1778 310, 2000 270
C 2222 230, 2444 230, 2667 270
C 2889 310, 3111 310, 3334 270
V 0 H 0 Z">
          <animateTransform attributeName="transform" type="translate"
            from="-1334 0" to="0 0" dur="6s" repeatCount="indefinite"/>
        </path>

        <path fill="#ffffff" opacity="0.5" d="M 0 270
C 222 310, 444 310, 667 270
C 889 230, 1111 230, 1334 270
C 1556 310, 1778 310, 2000 270
C 2222 230, 2444 230, 2667 270
C 2889 310, 3111 310, 3334 270
V 0 H 0 Z">
          <animateTransform attributeName="transform" type="translate"
            from="-1334 0" to="0 0" dur="12s" repeatCount="indefinite"/>
        </path>

      </g>
    </mask>
  </defs>

  <!-- Layer 1: Full gradient rect with wave mask (provides wave cutout effect) -->
  <rect width="1500" height="310" fill="url(#bg-grad-inv)" mask="url(#wave-mask-inv)" />

  <!-- Layer 2: Static gradient rect covering text area only — isolates text from mask compositing -->
  <rect width="1500" height="230" fill="url(#bg-grad-inv)" />

  <!-- Layer 3: Text elements -->
  <!-- TITLE -->
  <text x="750" y="130"
    font-family="Segoe UI, Arial, sans-serif"
    font-size="68"
    font-weight="700"
    fill="#fff"
    text-anchor="middle"
    letter-spacing="-1"
    filter="url(#text-glow)">
    ${escapeXml(name)}
  </text>
${bioLine}

</svg>`;
}

main();
