// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { writeFileSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const { resolveTheme, loadTheme } = require('./theme');

const MAX_LANGS = 6;
const BAR_X = 20, BAR_Y = 42, BAR_W = 760, BAR_H = 22;

async function fetchLangs(owner, token) {
  const headers = { 'User-Agent': 'github-profile-generator', 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const query = `query($login: String!) {
    user(login: $login) {
      repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
        nodes {
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
        }
      }
    }
  }`;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST', headers,
    body: JSON.stringify({ query, variables: { login: owner } }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${res.statusText}`);

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);

  const totals = new Map();
  for (const repo of json.data.user.repositories.nodes) {
    for (const { size, node } of repo.languages.edges) {
      const existing = totals.get(node.name);
      if (existing) {
        existing.size += size;
      } else {
        totals.set(node.name, { size, color: node.color || '#808080' });
      }
    }
  }

  return [...totals.entries()]
    .map(([name, { size, color }]) => ({ name, size, color }))
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_LANGS);
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildSvg(langs, titleColor) {
  const W = 800, H = 120;

  if (!langs.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="60" viewBox="0 0 ${W} 60">
  <style>
    @media (prefers-color-scheme: dark)  { .msg { fill: #8b949e; } }
    @media (prefers-color-scheme: light) { .msg { fill: #636e7b; } }
    .msg { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 13px; }
  </style>
  <text class="msg" x="${W / 2}" y="35" text-anchor="middle">No language data available.</text>
</svg>`;
  }

  const totalSize = langs.reduce((s, l) => s + l.size, 0);
  const withPct   = langs.map(l => ({ ...l, pct: l.size / totalSize }));

  // Stacked bar segments
  let barX = BAR_X;
  let barSegs = '';
  for (const lang of withPct) {
    const segW = Math.round(lang.pct * BAR_W);
    if (segW < 1) continue;
    barSegs += `      <rect x="${barX}" y="${BAR_Y}" width="${segW}" height="${BAR_H}" fill="${lang.color}"/>\n`;
    barX += segW;
  }

  // Legend circles with pulse animation (staggered per language)
  const itemW = Math.floor((W - 40) / langs.length);
  let legendAnimated = '';
  for (let i = 0; i < langs.length; i++) {
    const lx = 20 + i * itemW;
    const delay = (i * 0.4).toFixed(1);
    legendAnimated += `  <circle cx="${lx + 5}" cy="88" r="5" fill="${langs[i].color}">
    <animate attributeName="r" values="5;6.5;5" dur="2.5s" begin="${delay}s" repeatCount="indefinite"
             calcMode="spline" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>
  </circle>\n`;
    legendAnimated += `  <text x="${lx + 16}" y="92.5" class="leg">${escapeXml(langs[i].name)} ${(withPct[i].pct * 100).toFixed(1)}%</text>\n`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="bar-shape">
      <rect x="${BAR_X}" y="${BAR_Y}" width="${BAR_W}" height="${BAR_H}" rx="4"/>
    </clipPath>
    <!-- Shimmer gradient — fills the moving rect left to right -->
    <linearGradient id="shimmer-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="white" stop-opacity="0"/>
      <stop offset="10%"  stop-color="white" stop-opacity="0.05"/>
      <stop offset="20%"  stop-color="white" stop-opacity="0.15"/>
      <stop offset="30%"  stop-color="white" stop-opacity="0.3"/>
      <stop offset="40%"  stop-color="white" stop-opacity="0.55"/>
      <stop offset="50%"  stop-color="white" stop-opacity="0.8"/>
      <stop offset="60%"  stop-color="white" stop-opacity="0.55"/>
      <stop offset="70%"  stop-color="white" stop-opacity="0.3"/>
      <stop offset="80%"  stop-color="white" stop-opacity="0.15"/>
      <stop offset="90%"  stop-color="white" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="shimmer-clip">
      <rect x="${BAR_X}" y="${BAR_Y}" width="${BAR_W}" height="${BAR_H}" rx="4"/>
    </clipPath>
  </defs>
  <style>
    @media (prefers-color-scheme: dark) {
      .ttl { fill: ${titleColor.dark}; }
      .trk { fill: #21262d; }
      .leg { fill: #b1bac4; }
    }
    @media (prefers-color-scheme: light) {
      .ttl { fill: ${titleColor.light}; }
      .trk { fill: #eaeef2; }
      .leg { fill: #424a53; }
    }
    .ttl { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 14px; font-weight: 600; }
    .leg { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 12px; font-weight: 500; }
  </style>

  <text class="ttl" x="${W / 2}" y="24" text-anchor="middle">Top Languages</text>

  <!-- Bar track (background) -->
  <rect class="trk" x="${BAR_X}" y="${BAR_Y}" width="${BAR_W}" height="${BAR_H}" rx="4"/>

  <!-- Colored segments -->
  <g clip-path="url(#bar-shape)">
${barSegs}  </g>

  <!-- Shimmer overlay on bar: diagonal rect translates across, clipped to bar -->
  <g clip-path="url(#shimmer-clip)">
    <g transform="skewX(-20)">
      <rect x="0" y="${BAR_Y - 4}" width="160" height="${BAR_H + 8}" fill="url(#shimmer-grad)">
        <animateTransform attributeName="transform" type="translate"
          values="-180 0; -180 0; ${BAR_X + BAR_W + 180} 0"
          keyTimes="0; 0.72; 1"
          calcMode="spline" keySplines="0 0 1 1; 0.3 0 0.7 1"
          dur="8s" repeatCount="indefinite"/>
      </rect>
    </g>
  </g>

  <!-- Legend with pulse -->
${legendAnimated}
</svg>`;
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!owner) {
    console.error('Error: GITHUB_REPOSITORY_OWNER environment variable is not set.');
    process.exit(1);
  }

  const langs = await fetchLangs(owner, process.env.GITHUB_TOKEN);
  const outPath = join(__dirname, '..', 'assets', 'langs.svg');
  mkdirSync(dirname(outPath), { recursive: true });
  const { titleColor } = resolveTheme(loadTheme());
  writeFileSync(outPath, buildSvg(langs, titleColor), 'utf8');
  console.log(`Generated assets/langs.svg — ${langs.map(l => l.name).join(', ')}`);
}

main();
