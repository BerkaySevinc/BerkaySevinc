// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2026 BerkaySevinc — MIT License

const { writeFileSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const { loadConfig } = require('./lib/config');

// GitHub's own quartile bucketing, so levels match the real graph exactly.
const CONTRIBUTION_LEVEL = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

async function fetchCalendar(owner, token) {
  const headers = { 'User-Agent': 'github-profile-generator', 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays { contributionLevel date }
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

  // First/last weeks aren't padded to 7 days by GitHub, so align each day
  // by its actual day-of-week instead of array index; `null` = no such day.
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .map(week => {
      const row = Array(7).fill(null);
      for (const day of week.contributionDays) {
        const dayOfWeek = new Date(`${day.date}T00:00:00Z`).getUTCDay();
        row[dayOfWeek] = CONTRIBUTION_LEVEL[day.contributionLevel] ?? 0;
      }
      return row;
    });
}

const CELL = 10, GAP = 2.5, MARGIN = 6;
const STEP = CELL + GAP;
// Matches contribution-snake.svg's padding so both share the same cell scale.
const PAD_TOP = 1, PAD_BOTTOM = 1, PAD_LEFT = 1, PAD_RIGHT = 1;
// Level 0 matches GitHub's light/dark empty-cell color; 1-4 are theme-fixed.
const LEVEL0_LIGHT = '#ebedf0';
const LEVEL0_DARK   = '#161b22';
const LEVEL_FILL = [null, '#0f5b2c', '#12923f', '#22c95a', '#5dffa0'];
const LEVEL_GLOW = [false, false, false, true, true];

function buildSvg(grid, effects) {
  const WEEKS = grid.length;
  const DAYS = 7;
  const W = MARGIN * 2 + (WEEKS + PAD_LEFT + PAD_RIGHT) * STEP - GAP;
  const H = MARGIN * 2 + (DAYS + PAD_TOP + PAD_BOTTOM) * STEP - GAP;

  const cx = c => MARGIN + PAD_LEFT * STEP + c * STEP + CELL / 2;
  const cy = r => MARGIN + PAD_TOP * STEP + r * STEP + CELL / 2;

  // Filter region sized to the blur's actual reach (~40% margin), not more.
  // Shared cell shape, referenced via <use> instead of repeating geometry.
  let defs = `<rect id="cs" width="${CELL}" height="${CELL}" rx="2.4"/><filter id="cell-glow" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="0.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;
  let style = `
    @media (prefers-color-scheme: light) { .lvl0 { fill: ${LEVEL0_LIGHT}; } }
    @media (prefers-color-scheme: dark)  { .lvl0 { fill: ${LEVEL0_DARK}; } }
    .lvl1{fill:${LEVEL_FILL[1]};} .lvl2{fill:${LEVEL_FILL[2]};} .lvl3{fill:${LEVEL_FILL[3]};} .lvl4{fill:${LEVEL_FILL[4]};}`;
  let cells = '';
  let rainLayer = '';
  let digitsLayer = '';

  // ---- cells (static, or animating in via Tetris Drop-in) ----
  const tetrisDur = 6.5;
  if (effects.tetrisDropIn) {
    style += `@keyframes tet-drop{
      0%{transform:translateY(-${MARGIN + 20}px);opacity:0;}
      6%{opacity:1;}9%{transform:translateY(0);}10.5%{transform:translateY(-2px);}12%{transform:translateY(0);}
      70%{transform:translateY(0);opacity:1;}100%{transform:translateY(0);opacity:1;}}
    @keyframes tet-drop-pos{
      0%{transform:translateY(-${MARGIN + 20}px);}
      9%{transform:translateY(0);}10.5%{transform:translateY(-2px);}12%{transform:translateY(0);}
      100%{transform:translateY(0);}}`;
  }
  for (let c = 0; c < WEEKS; c++) {
    for (let r = 0; r < DAYS; r++) {
      const level = grid[c][r];
      if (level === null) continue; // no real calendar day at this slot
      const x = cx(c) - CELL / 2, y = cy(r) - CELL / 2;
      const glow = LEVEL_GLOW[level] ? ' filter="url(#cell-glow)"' : '';
      const fillAttr = ` class="lvl${level}"`;
      if (effects.tetrisDropIn) {
        const delayFrac = (c / WEEKS) * 0.55 + (r / DAYS) * 0.1;
        // Pure translateY/opacity, so transform-origin has no effect here —
        // no fill-box lookup to pay for.
        cells += `<use href="#cs" x="${x.toFixed(1)}" y="${y.toFixed(1)}"${fillAttr}${glow} style="animation:tet-drop ${tetrisDur}s cubic-bezier(.2,.9,.3,1.2) infinite;animation-delay:${(-delayFrac * tetrisDur).toFixed(2)}s;"/>`;
      } else {
        cells += `<use href="#cs" x="${x.toFixed(1)}" y="${y.toFixed(1)}"${fillAttr}${glow}/>`;
      }
    }
  }

  // ---- Matrix Rain overlay ----
  if (effects.matrixRain) {
    let beams = '';
    // One independently-cycling slot per column keeps the visible set
    // recombining instead of a fixed set of pillars repeating. DUTY_CYCLE
    // keeps rain density constant regardless of week count.
    const count = WEEKS;
    const TARGET_VISIBLE = 7;
    const DUTY_CYCLE = TARGET_VISIBLE / count;
    // Stratified sampling (equal position/phase slots + jitter, slots
    // shuffled independently) avoids the clumping plain random() gives.
    const colSlots = Array.from({ length: count }, (_, k) => k);
    for (let k = colSlots.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [colSlots[k], colSlots[j]] = [colSlots[j], colSlots[k]];
    }
    for (let i = 0; i < count; i++) {
      const col = Math.min(WEEKS - 1, Math.floor((colSlots[i] + Math.random()) * WEEKS / count));
      const x = cx(col);
      // Shorter beams read as falling drops, not a solid bar.
      const beamH = H * (0.2 + Math.random() * 0.25);
      const fallDur = 2.6 + Math.random() * 2.4;
      const totalDur = (fallDur / DUTY_CYCLE).toFixed(2);
      const phase = (i + Math.random()) / count; // 0..1, evenly stratified
      const delay = (-phase * totalDur).toFixed(2);
      const id = `rain-${i}`;
      // Mask applied per-beam, not once to the whole canvas — same fade,
      // smaller footprint per frame. Must sit on a transform-less wrapper:
      // a mask on the animated element itself would freeze to its start
      // position instead of tracking it.
      beams += `<g mask="url(#rain-fade-mask)"><rect id="${id}" class="rain-beam" x="${(x - 1.1).toFixed(1)}" y="${(-beamH).toFixed(1)}" width="2.2" height="${beamH.toFixed(1)}"/></g>`;
      style += `#${id}{will-change:transform;animation:rain-fall ${totalDur}s linear infinite;animation-delay:${delay}s;}`;
    }
    const fallPct = (DUTY_CYCLE * 100).toFixed(1);
    style += `@keyframes rain-fall{0%{transform:translateY(0);}${fallPct}%{transform:translateY(${(H + 40).toFixed(1)}px);}100%{transform:translateY(${(H + 40).toFixed(1)}px);}}`;
    // Screen-blend glow reads fine on dark but is invisible on light, so
    // light mode swaps to a dark "ink" streak with multiply blend instead.
    defs += `<linearGradient id="rain-grad-dark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#eafff0" stop-opacity="0"/>
      <stop offset="78%" stop-color="#eafff0" stop-opacity="0.05"/>
      <stop offset="96%" stop-color="#eafff0" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#c8ffe0" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="rain-grad-light" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1f2328" stop-opacity="0"/>
      <stop offset="78%" stop-color="#1f2328" stop-opacity="0.08"/>
      <stop offset="96%" stop-color="#1f2328" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#1f2328" stop-opacity="1"/>
    </linearGradient>`;
    style += `
      .rain-layer { mix-blend-mode: screen; }
      .rain-beam { fill: url(#rain-grad-dark); }
      @media (prefers-color-scheme: light) {
        .rain-layer { mix-blend-mode: multiply; }
        .rain-beam { fill: url(#rain-grad-light); }
      }`;
    // Fades beams out within the top/bottom padding band (before they reach
    // the actual cell rows), instead of hard-clipping at the viewBox edge.
    const topBorder = MARGIN + PAD_TOP * STEP;
    const bottomBorder = MARGIN + PAD_BOTTOM * STEP;
    const topPct = (topBorder / H * 100).toFixed(1);
    const bottomPct = (100 - bottomBorder / H * 100).toFixed(1);
    defs += `<linearGradient id="rain-fade-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="white" stop-opacity="0"/>
      <stop offset="${topPct}%" stop-color="white" stop-opacity="1"/>
      <stop offset="${bottomPct}%" stop-color="white" stop-opacity="1"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <mask id="rain-fade-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="url(#rain-fade-grad)"/>
    </mask>`;
    rainLayer = `<g class="rain-layer">${beams}</g>`;
  }

  // ---- Digit Flicker overlay ----
  if (effects.digitFlicker) {
    const loopDur = 9;
    style += `@keyframes dg-flicker{0%{opacity:0;}2%{opacity:1;}4%{opacity:1;}9%{opacity:0;}100%{opacity:0;}}`;
    let glyphs = '';
    let i = 0;
    for (let c = 0; c < WEEKS; c++) {
      for (let r = 0; r < DAYS; r++) {
        const level = grid[c][r];
        if (!level || Math.random() < 0.55) { i++; continue; } // null (no day) or 0 (no contributions)
        const x = cx(c), y = cy(r);
        const delay = -((i % 40) / 40) * loopDur - Math.random() * 0.6;
        // When cells also drop in, layer tet-drop-pos (transform only, no
        // opacity) alongside dg-flicker so the digit falls with its own
        // cell instead of flickering in place while the square drops past
        // it — same per-cell delay as the cell's own tet-drop.
        let glyphStyle;
        if (effects.tetrisDropIn) {
          const dropDelayFrac = (c / WEEKS) * 0.55 + (r / DAYS) * 0.1;
          glyphStyle = `animation-name:dg-flicker,tet-drop-pos;` +
            `animation-duration:${loopDur}s,${tetrisDur}s;` +
            `animation-timing-function:linear,cubic-bezier(.2,.9,.3,1.2);` +
            `animation-iteration-count:infinite,infinite;` +
            `animation-delay:${delay.toFixed(2)}s,${(-dropDelayFrac * tetrisDur).toFixed(2)}s;`;
        } else {
          glyphStyle = `animation:dg-flicker ${loopDur}s linear infinite;animation-delay:${delay.toFixed(2)}s;`;
        }
        glyphs += `<text x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}" text-anchor="middle" font-family="ui-monospace,'IBM Plex Mono',monospace" font-size="7.5" fill="#eafff0" style="${glyphStyle}">${level}</text>`;
        i++;
      }
    }
    digitsLayer = `<g style="mix-blend-mode:screen">${glyphs}</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%">
  <defs>
    ${defs}
    <style>${style}</style>
  </defs>
  ${cells}
  ${rainLayer}
  ${digitsLayer}
</svg>`;
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!owner) {
    console.error('Error: GITHUB_REPOSITORY_OWNER environment variable is not set.');
    process.exit(1);
  }

  const config = loadConfig();
  const effects = {
    matrixRain: config.contributionGraph?.effects?.matrixRain === true,
    tetrisDropIn: config.contributionGraph?.effects?.tetrisDropIn === true,
    digitFlicker: config.contributionGraph?.effects?.digitFlicker === true,
  };

  const grid = await fetchCalendar(owner, process.env.GITHUB_TOKEN);

  const outPath = join(__dirname, '..', 'assets', 'contribution-graph.svg');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buildSvg(grid, effects), 'utf8');

  const active = Object.entries(effects).filter(([, on]) => on).map(([name]) => name);
  console.log(`Generated assets/contribution-graph.svg — ${grid.length} weeks, effects: ${active.length ? active.join(', ') : 'none'}`);
}

main();
