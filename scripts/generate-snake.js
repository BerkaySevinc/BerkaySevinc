// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2026 BerkaySevinc — MIT License

const { writeFileSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const { loadConfig } = require('./lib/config');

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

// ---- geometry (matches contribution-graph.svg) ----
const CELL = 10, GAP = 2.5, MARGIN = 6;
const STEP = CELL + GAP;
const DAYS = 7;
const PAD_TOP = 1, PAD_BOTTOM = 1, PAD_LEFT = 1, PAD_RIGHT = 1;
const LEVEL0_LIGHT = '#ebedf0', LEVEL0_DARK = '#161b22';
const LEVEL_FILL = [null, '#0f5b2c', '#12923f', '#22c95a', '#5dffa0'];

const START_LEN = 4;
const BODY_LIMIT = 20;
const STEPS_PER_SEC = 6;

// Length follows a sqrt curve toward BODY_LIMIT, capped at +1 per eaten cell
// so growth never jumps by more than one unit at a time.
const _lenTableCache = new Map();
function getLenTable(total) {
  if (_lenTableCache.has(total)) return _lenTableCache.get(total);
  const table = new Array(total + 1);
  table[0] = START_LEN;
  if (total <= BODY_LIMIT - START_LEN) {
    for (let e = 1; e <= total; e++) table[e] = START_LEN + e;
  } else {
    for (let e = 1; e <= total; e++) {
      const ideal = START_LEN + (BODY_LIMIT - START_LEN) * Math.sqrt(e / total);
      table[e] = Math.min(table[e - 1] + 1, Math.round(ideal));
    }
  }
  _lenTableCache.set(total, table);
  return table;
}
function bodyLenAt(eaten, total) {
  if (total <= 0) return START_LEN;
  const table = getLenTable(total);
  return table[Math.max(0, Math.min(total, Math.round(eaten)))];
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const l = v => Math.round(v + (255 - v) * amt);
  return '#' + [l(r), l(g), l(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function darken(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const d = v => Math.round(v * (1 - amt));
  return '#' + [d(r), d(g), d(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function lerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const l = (av, bv) => Math.round(av + (bv - av) * t);
  const r = l((a >> 16) & 255, (b >> 16) & 255);
  const g = l((a >> 8) & 255, (b >> 8) & 255);
  const bl = l(a & 255, b & 255);
  return `rgb(${r},${g},${bl})`;
}

// Pure data solver — no DOM, runs at build time.
function solveSnake(grid) {
  const WEEKS = grid.length;
  const DAYS_TOTAL = DAYS + PAD_TOP + PAD_BOTTOM;
  const WEEKS_TOTAL = WEEKS + PAD_LEFT + PAD_RIGHT;

  const state = [];
  for (let x = 0; x < WEEKS_TOTAL; x++) {
    const col = [];
    const inCol = x >= PAD_LEFT && x < PAD_LEFT + WEEKS;
    for (let y = 0; y < DAYS_TOTAL; y++) {
      const inRow = y >= PAD_TOP && y < PAD_TOP + DAYS;
      if (!inCol || !inRow) { col.push({ level: 0, eaten: false }); continue; }
      col.push({ level: grid[x - PAD_LEFT][y - PAD_TOP], eaten: false });
    }
    state.push(col);
  }

  const trail = [];
  const growAt = [];
  let totalEatable = 0;
  for (let c = 0; c < WEEKS; c++) for (let r = 0; r < DAYS; r++) if (grid[c][r] > 0) totalEatable++;

  const spawnPoint = { x: Math.min(10, WEEKS_TOTAL - 1), y: 0 };
  const cornerPoint = { x: 0, y: 0 };

  let head = spawnPoint;
  let eatenCount = 0;
  trail.push(head); growAt.push(false);

  function bodyAgeMap() {
    const len = Math.max(1, Math.round(bodyLenAt(eatenCount, totalEatable)));
    const map = new Map();
    for (let i = trail.length - 1, n = 0; i >= 0 && n < len; i--, n++) {
      const key = trail[i].x + ',' + trail[i].y;
      if (!map.has(key)) map.set(key, n);
    }
    return { map, len };
  }

  function weightedNearestTarget(targetLevel, allowTunnel) {
    const { map: bodyAge, len: bodyLen } = bodyAgeMap();
    const BIG = 1e6;
    const startKey = head.x + ',' + head.y;
    const dist = new Map([[startKey, 0]]);
    const prev = new Map();
    const coordOf = new Map([[startKey, { x: head.x, y: head.y }]]);
    const finalized = new Set();
    const pq = [{ key: startKey, x: head.x, y: head.y, d: 0, hops: 0 }];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    while (pq.length) {
      let bi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i].d < pq[bi].d) bi = i;
      const cur = pq.splice(bi, 1)[0];
      if (finalized.has(cur.key)) continue;
      finalized.add(cur.key);

      const cell = state[cur.x][cur.y];
      if (cell.level === targetLevel && !cell.eaten && cur.key !== startKey) {
        const path = [];
        let k = cur.key;
        while (k !== startKey) { path.push(coordOf.get(k)); k = prev.get(k); }
        path.reverse();
        return path;
      }

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= WEEKS_TOTAL || ny < 0 || ny >= DAYS_TOTAL) continue;
        const key = nx + ',' + ny;
        if (finalized.has(key)) continue;
        const ncell = state[nx][ny];
        const isTarget = ncell.level === targetLevel && !ncell.eaten;
        const isWall = !(ncell.level === 0 || ncell.level === null || ncell.eaten || isTarget);
        if (isWall && !allowTunnel) continue;
        const nhops = cur.hops + 1;
        const age = bodyAge.get(key);
        const stillOccupied = age !== undefined && nhops < bodyLen - age;
        const wallCost = isWall ? 1 : 0;
        const bodyCost = stillOccupied ? 1 : 0;
        const stepCost = wallCost * BIG * BIG + bodyCost * BIG + 1;
        const nd = cur.d + stepCost;
        if (!dist.has(key) || nd < dist.get(key)) {
          dist.set(key, nd);
          prev.set(key, cur.key);
          coordOf.set(key, { x: nx, y: ny });
          pq.push({ key, x: nx, y: ny, d: nd, hops: nhops });
        }
      }
    }
    return null;
  }

  function pathToPoint(toX, toY, forbidTop, confineTop) {
    const { map: bodyAge, len: bodyLen } = bodyAgeMap();
    const BIG = 1e6;
    const startKey = head.x + ',' + head.y;
    const goalKey = toX + ',' + toY;
    const dist = new Map([[startKey, 0]]);
    const prev = new Map();
    const coordOf = new Map([[startKey, { x: head.x, y: head.y }]]);
    const finalized = new Set();
    const pq = [{ key: startKey, x: head.x, y: head.y, d: 0, hops: 0 }];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    while (pq.length) {
      let bi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i].d < pq[bi].d) bi = i;
      const cur = pq.splice(bi, 1)[0];
      if (finalized.has(cur.key)) continue;
      finalized.add(cur.key);
      if (cur.key === goalKey) {
        const path = [];
        let k = cur.key;
        while (k !== startKey) { path.push(coordOf.get(k)); k = prev.get(k); }
        path.reverse();
        return path;
      }

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= WEEKS_TOTAL || ny < 0 || ny >= DAYS_TOTAL) continue;
        if (forbidTop && ny === 0) continue;
        if (confineTop && ny !== 0) continue;
        const key = nx + ',' + ny;
        if (finalized.has(key)) continue;
        const ncell = state[nx][ny];
        const isWall = !(ncell.level === 0 || ncell.level === null || ncell.eaten);
        if (isWall) continue;
        const nhops = cur.hops + 1;
        const age = bodyAge.get(key);
        const stillOccupied = age !== undefined && nhops < bodyLen - age;
        const bodyCost = stillOccupied ? 1 : 0;
        const stepCost = bodyCost * BIG + 1;
        const nd = cur.d + stepCost;
        if (!dist.has(key) || nd < dist.get(key)) {
          dist.set(key, nd);
          prev.set(key, cur.key);
          coordOf.set(key, { x: nx, y: ny });
          pq.push({ key, x: nx, y: ny, d: nd, hops: nhops });
        }
      }
    }
    return null;
  }

  const entrancePath = pathToPoint(cornerPoint.x, cornerPoint.y);
  if (entrancePath) for (const step of entrancePath) { head = step; trail.push(head); growAt.push(false); }

  for (let level = 1; level <= 4; level++) {
    let remaining = 0;
    for (let c = 0; c < WEEKS_TOTAL; c++) for (let y = 0; y < DAYS_TOTAL; y++) if (state[c][y].level === level) remaining++;

    while (remaining > 0) {
      let path = weightedNearestTarget(level, false);
      if (!path) path = weightedNearestTarget(level, true);
      if (!path) break;

      for (const step of path) {
        head = step;
        trail.push(head);
        const cell = state[head.x][head.y];
        if (cell.level === level && !cell.eaten) {
          cell.eaten = true;
          eatenCount++;
          growAt.push(true);
          remaining--;
        } else {
          growAt.push(false);
        }
      }
    }
  }

  const preExitPoint = { x: WEEKS_TOTAL - 1, y: PAD_TOP };
  const exitCornerPoint = { x: WEEKS_TOTAL - 1, y: 0 };

  const legA = pathToPoint(preExitPoint.x, preExitPoint.y, true);
  if (legA) for (const step of legA) { head = step; trail.push(head); growAt.push(false); }

  const legB = pathToPoint(exitCornerPoint.x, exitCornerPoint.y);
  if (legB) for (const step of legB) { head = step; trail.push(head); growAt.push(false); }

  const legCStartIndex = trail.length - 1;
  const returnPath = pathToPoint(spawnPoint.x, spawnPoint.y, false, true);
  if (returnPath) for (const step of returnPath) { head = step; trail.push(head); growAt.push(false); }

  const legCEndIndex = trail.length - 1;
  const eatenCells = trail.filter((_, i) => growAt[i]);

  return { trail, growAt, legCStartIndex, legCEndIndex, eatenCells, totalEatable, WEEKS_TOTAL, DAYS_TOTAL, WEEKS };
}

// Bakes the trail into CSS keyframes — GitHub renders this as a static
// <img>, no JS at runtime.

// Collapse straight runs down to direction-change corners — CSS's linear
// interpolation reconstructs the run exactly, so every intermediate step
// would just bloat the file.
function collapseCollinear(trail) {
  const stops = [{ i: 0, x: trail[0].x, y: trail[0].y }];
  for (let i = 1; i < trail.length - 1; i++) {
    const prev = trail[i - 1], cur = trail[i], next = trail[i + 1];
    const d1x = cur.x - prev.x, d1y = cur.y - prev.y;
    const d2x = next.x - cur.x, d2y = next.y - cur.y;
    if (d1x !== d2x || d1y !== d2y) stops.push({ i, x: cur.x, y: cur.y });
  }
  stops.push({ i: trail.length - 1, x: trail[trail.length - 1].x, y: trail[trail.length - 1].y });
  return stops;
}

function buildSvg(grid, colors) {
  const solved = solveSnake(grid);
  const { trail, growAt, legCStartIndex, legCEndIndex, eatenCells, WEEKS_TOTAL, DAYS_TOTAL, WEEKS } = solved;
  const lastIdx = trail.length - 1;
  const totalDuration = trail.length / STEPS_PER_SEC;

  const cx = c => MARGIN + c * STEP + CELL / 2;
  const cy = r => MARGIN + r * STEP + CELL / 2;
  const W = MARGIN * 2 + WEEKS_TOTAL * STEP - GAP;
  const H = MARGIN * 2 + DAYS_TOTAL * STEP - GAP;

  const HEAD_COLOR = lighten(colors.base, 0.4);
  const BODY_COLOR = colors.base;
  const TAIL_COLOR = darken(colors.base, 0.6);

  let style = `:root{--lvl0:${LEVEL0_DARK};}@media (prefers-color-scheme: light){:root{--lvl0:${LEVEL0_LIGHT};}}`;

  // ---- grid cells: static level-0, per-cell hide/reveal keyframe for eaten ones ----
  const eatenIndexOf = new Map();
  for (let k = 0; k < trail.length; k++) if (growAt[k]) eatenIndexOf.set(trail[k].x + ',' + trail[k].y, k);

  const legCFinishSpan = Math.max(1, (legCEndIndex - legCStartIndex) - 1);
  const revealIndexOf = new Map();
  eatenCells.forEach((p, m) => {
    revealIndexOf.set(p.x + ',' + p.y, legCStartIndex + (m / eatenCells.length) * legCFinishSpan);
  });

  let cells = '';
  let cellAnimId = 0;
  for (let c = 0; c < WEEKS; c++) {
    for (let r = 0; r < DAYS; r++) {
      const level = grid[c][r];
      if (level === null) continue;
      const x = c + PAD_LEFT, y = r + PAD_TOP;
      const px = (cx(x) - CELL / 2).toFixed(1), py = (cy(y) - CELL / 2).toFixed(1);
      if (level === 0) {
        cells += `<use href="#cs" x="${px}" y="${py}" fill="var(--lvl0)"/>`;
        continue;
      }
      const key = x + ',' + y;
      const tEaten = (eatenIndexOf.get(key) / lastIdx) * 100;
      const tReveal = (revealIndexOf.get(key) / lastIdx) * 100;
      const color = LEVEL_FILL[level];
      const name = `cg${cellAnimId++}`;
      const eps = 0.03;
      style += `@keyframes ${name}{`
        + `0%{fill:${color};opacity:1;transform:scale(1);}`
        + `${(tEaten).toFixed(2)}%{fill:${color};opacity:1;transform:scale(1);}`
        + `${(tEaten + eps).toFixed(2)}%{fill:var(--lvl0);opacity:1;transform:scale(1);}`
        + `${(tReveal).toFixed(2)}%{fill:var(--lvl0);opacity:1;transform:scale(1);}`
        + `${(tReveal + eps).toFixed(2)}%{fill:${color};opacity:0;transform:scale(0.2);}`
        + `${Math.min(100, tReveal + eps + 1.6).toFixed(2)}%{fill:${color};opacity:1;transform:scale(1.12);}`
        + `${Math.min(100, tReveal + eps + 2.4).toFixed(2)}%{fill:${color};opacity:1;transform:scale(1);}`
        + `100%{fill:${color};opacity:1;transform:scale(1);}`
        + `}`;
      // Cells are static, so origin can use view-box, computed once at build
      // time (segments move, so they need fill-box instead — see below).
      cells += `<use href="#cs" x="${px}" y="${py}" style="will-change:transform;animation:${name} ${totalDuration.toFixed(2)}s linear infinite;transform-box:view-box;transform-origin:${cx(x).toFixed(1)}px ${cy(y).toFixed(1)}px;"/>`;
    }
  }

  // One shared position keyframe, reused by every segment via a delayed
  // animation-delay — keeps file size sane regardless of segment count.
  const posStops = collapseCollinear(trail);
  const originPx = cx(trail[0].x), originPy = cy(trail[0].y);
  style += `@keyframes snake-pos{`
    + posStops.map(s => `${((s.i / lastIdx) * 100).toFixed(2)}%{transform:translate(${(cx(s.x) - originPx).toFixed(2)}px,${(cy(s.y) - originPy).toFixed(2)}px);}`).join('')
    + `}`;

  // Per-segment size/color: each segment's alive window is found by binary
  // search, then sampled only inside it — even sampling across the whole
  // cycle would starve the birth moment, where the growth curve is steepest.
  const MIN_SIZE = CELL * 0.28, MAX_SIZE = CELL;

  const cumEaten = new Array(trail.length);
  { let e = 0; for (let i = 0; i < trail.length; i++) { if (growAt[i]) e++; cumEaten[i] = e; } }

  // Rounded to match bodyAgeMap — a raw float let tt = n/(len-1) exceed 1,
  // shrinking a segment below its minimum size right at birth.
  function bodyLenAtStep(i) {
    let raw;
    if (i <= legCStartIndex) raw = bodyLenAt(cumEaten[i], solved.totalEatable);
    else {
      const p = Math.min(1, (i - legCStartIndex) / legCFinishSpan);
      const full = bodyLenAt(solved.totalEatable, solved.totalEatable);
      raw = full + (START_LEN - full) * p;
    }
    return Math.max(1, Math.round(raw));
  }

  function findBirth(n) {
    if (bodyLenAtStep(0) > n) return 0;
    let lo = 0, hi = legCStartIndex;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bodyLenAtStep(mid) > n) hi = mid; else lo = mid + 1;
    }
    return lo;
  }
  function findDeath(n) {
    if (bodyLenAtStep(legCEndIndex) > n) return null; // never dies
    let lo = legCStartIndex, hi = legCEndIndex;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bodyLenAtStep(mid) <= n) hi = mid; else lo = mid + 1;
    }
    return lo;
  }
  function shapeAt(n, i) {
    const len = bodyLenAtStep(i);
    const tt = len <= 1 ? 0 : n / (len - 1);
    const size = MAX_SIZE - (MAX_SIZE - MIN_SIZE) * (tt * tt);
    return { scale: size / MAX_SIZE, fill: lerpColor(BODY_COLOR, TAIL_COLOR, tt) };
  }

  let segments = '';
  const segCount = Math.min(Math.round(bodyLenAt(solved.totalEatable, solved.totalEatable)), BODY_LIMIT);

  for (let n = 0; n < segCount; n++) {
    // Positive delay trails segment n behind the head by n steps (wrapper
    // position only — the shape animation below is already absolute-timed
    // and must not be delayed again).
    const posDelay = n / STEPS_PER_SEC;
    if (n === 0) {
      segments += `<g style="will-change:transform;animation:snake-pos ${totalDuration.toFixed(2)}s linear infinite;animation-delay:${posDelay.toFixed(3)}s;">`
        + `<rect x="${(-MAX_SIZE / 2).toFixed(2)}" y="${(-MAX_SIZE / 2).toFixed(2)}" width="${MAX_SIZE}" height="${MAX_SIZE}" rx="${(MAX_SIZE * 0.32).toFixed(2)}" fill="${HEAD_COLOR}"/>`
        + `</g>`;
      continue;
    }
    const birth = findBirth(n);
    const death = findDeath(n);
    const pctOf = i => (i / lastIdx) * 100;

    const stopList = [];
    if (birth > 0) stopList.push([0, 'opacity:0;transform:scale(0);']);

    // A stop at every step where the rounded body length actually changes
    // (not N evenly-spaced samples) — eating pace is uneven, so even
    // sampling could miss bursts of several eat-events in a row.
    const aliveEnd = death != null ? death - 1 : lastIdx;
    const events = [];
    let prevLen = null;
    for (let i = birth; i <= aliveEnd; i++) {
      const len = bodyLenAtStep(i);
      if (len === prevLen) continue;
      prevLen = len;
      events.push({ pct: pctOf(i), ...shapeAt(n, i) });
    }
    if (!events.length || events[events.length - 1].pct < pctOf(aliveEnd)) {
      events.push({ pct: pctOf(aliveEnd), ...shapeAt(n, aliveEnd) });
    }

    // React to eating rather than anticipate it: hold, then ramp to the new
    // value over at most HOLD_CAP seconds — otherwise a late-cycle gap
    // between eat-events (growth flattens near the end) gets smeared across
    // the whole gap, repainting every frame for a change nobody can see.
    // Birth/death reuse the same ramp for appearing/vanishing.
    const HOLD_CAP = 0.3;
    const capPct = (HOLD_CAP / totalDuration) * 100;
    const styleOf = e => `opacity:1;transform:scale(${e.scale.toFixed(2)});fill:${e.fill};`;
    const pushStop = (pct, s) => {
      const last = stopList[stopList.length - 1];
      if (last && last[0] === pct && last[1] === s) return;
      stopList.push([pct, s]);
    };

    if (birth > 0) {
      const nextPct = events.length > 1 ? events[1].pct : pctOf(aliveEnd);
      pushStop(events[0].pct, 'opacity:0;transform:scale(0);');
      pushStop(Math.min(events[0].pct + capPct, nextPct), styleOf(events[0]));
    } else {
      pushStop(events[0].pct, styleOf(events[0]));
    }
    for (let k = 1; k < events.length; k++) {
      const prevEvt = events[k - 1], curEvt = events[k];
      const nextPct = k + 1 < events.length ? events[k + 1].pct : pctOf(aliveEnd);
      pushStop(curEvt.pct, styleOf(prevEvt));
      pushStop(Math.min(curEvt.pct + capPct, nextPct), styleOf(curEvt));
    }
    if (death != null) {
      const deathPct = pctOf(death);
      pushStop(deathPct, stopList[stopList.length - 1][1]);
      pushStop(Math.min(deathPct + capPct, 100), 'opacity:0;transform:scale(0);');
      pushStop(100, 'opacity:0;transform:scale(0);');
    }

    let kf = '';
    for (const [pct, bit] of stopList) kf += `${pct.toFixed(2)}%{${bit}}`;
    const name = `seg${n}`;
    style += `@keyframes ${name}{${kf}}`;
    segments += `<g style="will-change:transform;animation:snake-pos ${totalDuration.toFixed(2)}s linear infinite;animation-delay:${posDelay.toFixed(3)}s;">`
      + `<rect x="${(-MAX_SIZE / 2).toFixed(2)}" y="${(-MAX_SIZE / 2).toFixed(2)}" width="${MAX_SIZE}" height="${MAX_SIZE}" rx="${(MAX_SIZE * 0.32).toFixed(2)}" fill="${BODY_COLOR}" style="will-change:transform;animation:${name} ${totalDuration.toFixed(2)}s linear infinite;transform-box:fill-box;transform-origin:center;"/>`
      + `</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="100%" height="100%">
  <defs><rect id="cs" width="${CELL}" height="${CELL}" rx="2.4"/><style>${style}</style></defs>
  ${cells}
  <g transform="translate(${originPx.toFixed(2)},${originPy.toFixed(2)})">${segments}</g>
</svg>`;
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!owner) {
    console.error('Error: GITHUB_REPOSITORY_OWNER environment variable is not set.');
    process.exit(1);
  }

  const config = loadConfig();
  // contributionSnake.color is independent of theme.gradient — if unset, falls back to theme.accent.
  const colors = {
    base: config.contributionSnake?.color ?? config.theme?.accent ?? '#a78bfa',
  };

  const grid = await fetchCalendar(owner, process.env.GITHUB_TOKEN);

  const outPath = join(__dirname, '..', 'assets', 'contribution-snake.svg');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buildSvg(grid, colors), 'utf8');

  console.log(`Generated assets/contribution-snake.svg — ${grid.length} weeks`);
}

main();
