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

let START_LEN = 4;
let BODY_LIMIT = 20;
const STEPS_PER_SEC = 6;

// Bounds how "smart" (recursive lookahead, instead of a flat hash) a tie
// simulation is allowed to be, at any nesting depth. One depth value drives
// all three limits via the same formulas; each nested smart resolution gets
// depth-2, so the limits shrink geometrically and self-terminate once an
// exponent goes negative — no separate max-recursion flag needed.
const SMART_BASE_DEPTH = 6;
function smartLimits(depth) {
  const p2 = e => (e < 0 ? 0 : Math.pow(2, e));
  return { length: p2(depth), position: p2(depth - 3), count: p2(depth - 5) };
}

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
  const preExitPoint = { x: WEEKS_TOTAL - 1, y: PAD_TOP };
  const exitCornerPoint = { x: WEEKS_TOTAL - 1, y: 0 };

  let head = spawnPoint;
  let eatenCount = 0;
  trail.push(head); growAt.push(false);
  const ctx = { state, trail, head, eatenCount, __smartDepth: SMART_BASE_DEPTH };

  function bodyAgeMap(ctx) {
    const len = Math.max(1, Math.round(bodyLenAt(ctx.eatenCount, totalEatable)));
    const map = new Map();
    for (let i = ctx.trail.length - 1, n = 0; i >= 0 && n < len; i--, n++) {
      const key = ctx.trail[i].x + ',' + ctx.trail[i].y;
      if (!map.has(key)) map.set(key, n);
    }
    return { map, len };
  }

  // Full Dijkstra from the head, blocked by walls (other uneaten levels) —
  // never crosses one, but will step on the snake's own body as a last
  // resort. dist is BIG-dominant (prefers a body-free route to a given
  // cell when one exists, however much longer) — internal routing only.
  // hopsOf holds the REAL number of steps the resulting route actually
  // takes, used for cross-cell distance comparisons below, so a cell that
  // only needed one quick step across the body isn't reported as if it
  // were hundreds of steps away.
  function reachability(ctx, targetLevel) {
    const { map: bodyAge, len: bodyLen } = bodyAgeMap(ctx);
    // Just needs to exceed the longest possible real path (a simple path can
    // never revisit a cell, so it can't exceed the grid's own cell count) —
    // that alone guarantees a body-free route always outweighs a shorter one
    // that touches the body, no matter how much longer the detour is.
    const BIG = WEEKS_TOTAL * DAYS_TOTAL + 1;
    const startKey = ctx.head.x + ',' + ctx.head.y;
    const dist = new Map([[startKey, 0]]);
    const hopsOf = new Map([[startKey, 0]]);
    const bodyHitsOf = new Map([[startKey, 0]]);
    const prev = new Map();
    const coordOf = new Map([[startKey, { x: ctx.head.x, y: ctx.head.y }]]);
    const bestHashOf = new Map([[startKey, -Infinity]]);
    const finalized = new Set();
    const pq = [{ key: startKey, x: ctx.head.x, y: ctx.head.y, d: 0, hops: 0, bodyHits: 0 }];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    while (pq.length) {
      let bi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i].d < pq[bi].d) bi = i;
      const cur = pq.splice(bi, 1)[0];
      if (finalized.has(cur.key)) continue;
      finalized.add(cur.key);

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= WEEKS_TOTAL || ny < 0 || ny >= DAYS_TOTAL) continue;
        const key = nx + ',' + ny;
        if (finalized.has(key)) continue;
        const ncell = ctx.state[nx][ny];
        const isTarget = ncell.level === targetLevel && !ncell.eaten;
        const isWall = !(ncell.level === 0 || ncell.level === null || ncell.eaten || isTarget);
        if (isWall) continue;
        const nhops = cur.hops + 1;
        const age = bodyAge.get(key);
        const stillOccupied = age !== undefined && nhops < bodyLen - age;
        const bodyCost = stillOccupied ? 1 : 0;
        const nBodyHits = cur.bodyHits + bodyCost;
        const nd = cur.d + bodyCost * BIG + 1;
        const curHash = hashTieBreak(ctx, cur.x, cur.y);
        if (!dist.has(key) || nd < dist.get(key) || (nd === dist.get(key) && curHash < bestHashOf.get(key))) {
          dist.set(key, nd);
          hopsOf.set(key, nhops);
          bodyHitsOf.set(key, nBodyHits);
          prev.set(key, cur.key);
          coordOf.set(key, { x: nx, y: ny });
          bestHashOf.set(key, curHash);
          pq.push({ key, x: nx, y: ny, d: nd, hops: nhops, bodyHits: nBodyHits });
        }
      }
    }
    return { dist, hopsOf, bodyHitsOf, prev, coordOf };
  }

  // Full Dijkstra from the head, allowed to cross walls (tunnel) — but
  // minimizing wall crossings first, hop count only as a tie-break among
  // routes tied on wall count. hopsOf holds the REAL number of steps that
  // route actually takes, used for cross-cell distance comparisons below —
  // not an estimate, the true walked length, so a cell chosen as "nearest"
  // is never secretly farther once the wall-minimal route to it turns out
  // longer than its hop-only distance would have suggested.
  function reachabilityMinWalls(ctx, targetLevel) {
    const { map: bodyAge, len: bodyLen } = bodyAgeMap(ctx);
    // Exact integer lexicographic ordering, three tiers: wall count first,
    // own-body crossings second, hop count third. Each tier's multiplier is
    // sized so it can never be overtaken by any possible combination of the
    // tiers below it — MAX_HOPS bounds any single tier's raw count (hops,
    // walls, or body-hits can't exceed the grid's cell count), so a lower
    // tier's worst case (MAX_HOPS-1) times its own multiplier still can't
    // reach one unit of the tier above.
    const MAX_HOPS = WEEKS_TOTAL * DAYS_TOTAL + 1;
    const BIG = MAX_HOPS * MAX_HOPS;
    const startKey = ctx.head.x + ',' + ctx.head.y;
    const dist = new Map([[startKey, 0]]);
    const hopsOf = new Map([[startKey, 0]]);
    const wallsOf = new Map([[startKey, 0]]);
    const bodyHitsOf = new Map([[startKey, 0]]);
    const prev = new Map();
    const coordOf = new Map([[startKey, { x: ctx.head.x, y: ctx.head.y }]]);
    const bestHashOf = new Map([[startKey, -Infinity]]);
    const finalized = new Set();
    const pq = [{ key: startKey, x: ctx.head.x, y: ctx.head.y, d: 0, hops: 0, walls: 0, bodyHits: 0 }];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    while (pq.length) {
      let bi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i].d < pq[bi].d) bi = i;
      const cur = pq.splice(bi, 1)[0];
      if (finalized.has(cur.key)) continue;
      finalized.add(cur.key);

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || nx >= WEEKS_TOTAL || ny < 0 || ny >= DAYS_TOTAL) continue;
        const key = nx + ',' + ny;
        if (finalized.has(key)) continue;
        const ncell = ctx.state[nx][ny];
        const isTarget = ncell.level === targetLevel && !ncell.eaten;
        const isWall = !(ncell.level === 0 || ncell.level === null || ncell.eaten || isTarget);
        const nhops = cur.hops + 1;
        const nwalls = cur.walls + (isWall ? 1 : 0);
        const age = bodyAge.get(key);
        const stillOccupied = age !== undefined && nhops < bodyLen - age;
        const nBodyHits = cur.bodyHits + (stillOccupied ? 1 : 0);
        const nd = nwalls * BIG + nBodyHits * MAX_HOPS + nhops;
        const curHash = hashTieBreak(ctx, cur.x, cur.y);
        if (!dist.has(key) || nd < dist.get(key) || (nd === dist.get(key) && curHash < bestHashOf.get(key))) {
          dist.set(key, nd);
          hopsOf.set(key, nhops);
          wallsOf.set(key, nwalls);
          bodyHitsOf.set(key, nBodyHits);
          prev.set(key, cur.key);
          coordOf.set(key, { x: nx, y: ny });
          bestHashOf.set(key, curHash);
          pq.push({ key, x: nx, y: ny, d: nd, hops: nhops, walls: nwalls, bodyHits: nBodyHits });
        }
      }
    }
    return { hopsOf, wallsOf, bodyHitsOf, prev, coordOf };
  }

  // Deterministic stand-in for randomness: same grid, same eaten-so-far
  // state, and same cell always hash to the same value, so a rerun on
  // identical input reproduces the identical snake — but the value isn't
  // biased toward any particular direction the way grid-scan order is.
  function hashTieBreak(ctx, x, y) {
    let h = (x * 374761393 + y * 668265263 + ctx.head.x * 2246822519 + ctx.head.y * 3266489917 + ctx.eatenCount * 2654435761) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return h >>> 0;
  }

  // Finds every uneaten target-level cell tied for best under the fixed
  // hierarchy: fewest real walked hops, then fewest walls crossed, then
  // fewest self-crossings. A tunnel route to a given cell never loses to a
  // real (non-tunnel) route to that SAME cell, no matter how much shorter
  // tunneling would be — but across DIFFERENT cells, only real walked
  // distance (then walls, then self-crossings) decides.
  function collectBestCandidates(ctx, targetLevel) {
    const startKey = ctx.head.x + ',' + ctx.head.y;
    const open = reachability(ctx, targetLevel);
    const tunneled = reachabilityMinWalls(ctx, targetLevel);

    let bestCost = Infinity, bestWalls = Infinity, bestBodyHits = Infinity;
    let candidates = [];
    for (let x = 0; x < WEEKS_TOTAL; x++) {
      for (let y = 0; y < DAYS_TOTAL; y++) {
        const cell = ctx.state[x][y];
        if (cell.level !== targetLevel || cell.eaten) continue;
        const key = x + ',' + y;
        if (key === startKey) continue;
        const search = open.dist.has(key) ? open : (tunneled.hopsOf.has(key) ? tunneled : null);
        if (!search) continue;
        const cand = {
          key, search, x, y,
          cost: search.hopsOf.get(key),
          walls: search === tunneled ? tunneled.wallsOf.get(key) : 0,
          bodyHits: search.bodyHitsOf.get(key),
        };
        if (
          cand.cost < bestCost ||
          (cand.cost === bestCost && cand.walls < bestWalls) ||
          (cand.cost === bestCost && cand.walls === bestWalls && cand.bodyHits < bestBodyHits)
        ) {
          bestCost = cand.cost; bestWalls = cand.walls; bestBodyHits = cand.bodyHits;
          candidates = [cand];
        } else if (cand.cost === bestCost && cand.walls === bestWalls && cand.bodyHits === bestBodyHits) {
          candidates.push(cand);
        }
      }
    }
    return candidates;
  }

  function buildPathTo(ctx, cand) {
    const startKey = ctx.head.x + ',' + ctx.head.y;
    const path = [];
    let k = cand.key;
    while (k !== startKey) { path.push(cand.search.coordOf.get(k)); k = cand.search.prev.get(k); }
    path.reverse();
    return path;
  }

  function cloneCtx(ctx) {
    return {
      state: ctx.state.map(col => col.map(cell => ({ level: cell.level, eaten: cell.eaten }))),
      trail: ctx.trail.slice(),
      head: { x: ctx.head.x, y: ctx.head.y },
      eatenCount: ctx.eatenCount,
      __smartDepth: ctx.__smartDepth,
      __smartUsed: ctx.__smartUsed,
      __smartUnit: ctx.__smartUnit,
    };
  }

  // Walks ctx along path, eating any target-level cell it lands on, and
  // reports whether the path crossed the snake's own current body (judged
  // against how much of the body will still be there when each step
  // actually arrives).
  // Returns the self-crossing count attributed to each cell EATEN along the
  // way, in order — not one count for the whole path. A path can eat more
  // than one cell if it happens to pass through other uneaten same-level
  // cells en route to the requested one (they're picked up for free, same
  // as the real run), so each eaten cell gets its own count of crossings
  // since the previous eat (or the start of the path, for the first one) —
  // otherwise a leg that ate several cells at once would count as a single
  // comparison unit while a same-length leg that ate only one wouldn't,
  // throwing off any per-cell alignment between two simulated branches.
  function applyPath(ctx, path, targetLevel, remainingRef, growAtOut) {
    const { map: bodyBefore, len: bodyLen } = bodyAgeMap(ctx);
    const perCellCrossCounts = [];
    let sinceLastEat = 0;
    for (let idx = 0; idx < path.length; idx++) {
      const step = path[idx];
      ctx.head = step;
      ctx.trail.push(step);
      const age = bodyBefore.get(step.x + ',' + step.y);
      if (age !== undefined && (idx + 1) < bodyLen - age) sinceLastEat++;
      const cell = ctx.state[step.x][step.y];
      if (cell.level === targetLevel && !cell.eaten) {
        cell.eaten = true;
        ctx.eatenCount++;
        remainingRef.value--;
        if (growAtOut) growAtOut.push(true);
        perCellCrossCounts.push(sinceLastEat);
        sinceLastEat = 0;
      } else if (growAtOut) {
        growAtOut.push(false);
      }
    }
    return perCellCrossCounts;
  }

  // Same crossing check as applyPath, without the eating side effects —
  // for legs that only move the head (the exit/return route), where
  // nothing is ever eaten.
  function applyMovementOnly(ctx, path) {
    const { map: bodyBefore, len: bodyLen } = bodyAgeMap(ctx);
    const crossCount = path.filter((p, idx) => {
      const age = bodyBefore.get(p.x + ',' + p.y);
      return age !== undefined && (idx + 1) < bodyLen - age;
    }).length;
    for (const step of path) {
      ctx.head = step;
      ctx.trail.push(step);
    }
    return crossCount;
  }

  // Resolves a tie without branching — used for every decision inside a
  // simulated branch, so the lookahead below stays exactly one level deep
  // instead of recursing into every nested tie it finds.
  function pickBestFast(ctx, targetLevel) {
    const candidates = collectBestCandidates(ctx, targetLevel);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    let best = candidates[0], bestHash = hashTieBreak(ctx, best.x, best.y);
    for (let i = 1; i < candidates.length; i++) {
      const h = hashTieBreak(ctx, candidates[i].x, candidates[i].y);
      if (h < bestHash) { bestHash = h; best = candidates[i]; }
    }
    return best;
  }

  // Walks ctx forward — first to forcedCand, then via the fast
  // (non-branching) pick for the rest of this level, every level after it,
  // and finally the same exit/return route the real run will eventually
  // take (right edge, top-right corner, back along the top row to spawn) —
  // yielding the self-crossing COUNT attributed to each cell eaten along
  // the way (see applyPath), then one more count for each of the 3 fixed
  // exit-route segments, in order, whether that unit crossed or not.
  // Indexed by cells-eaten-so-far rather than real hops walked, so two
  // candidates are always compared at the same relative point in the
  // eating order — not skewed by one of them happening to walk a
  // physically longer route to get there. Every candidate being compared
  // shares the exact same total count of these units (the set of cells
  // still left to eat, and how many of them exist, doesn't depend on which
  // order they're eaten in or how many are picked up per leg; the exit
  // route is always the same fixed 3 segments), so tied candidates always
  // run out together. Only pulled as far as needed: the caller stops
  // asking for the next one as soon as a comparison is decided, so a
  // branch that separates from its rivals on the very first one never pays
  // for anything beyond that. If it runs out (every unit compared, still
  // tied on all of them), it returns the total walls tunneled through and
  // total hops walked — free extra tie-break tiers for the caller, since
  // this walk already had to compute them.
  function* crossingSequence(ctx, forcedCand, targetLevel, remaining) {
    let steps = 0;
    let walls = 0;
    let level = targetLevel;
    let remainingRef = { value: remaining };
    let nextCand = forcedCand;
    while (level <= 4) {
      while (remainingRef.value > 0) {
        let cand;
        if (nextCand) {
          cand = nextCand;
        } else {
          const { position, count } = smartLimits(ctx.__smartDepth ?? SMART_BASE_DEPTH);
          const eligible = (ctx.__smartUnit || 0) < position && (ctx.__smartUsed || 0) < count;
          const cs = eligible ? collectBestCandidates(ctx, level) : null;
          if (eligible && cs.length > 1) {
            // Resolve this one tie one level deeper (real lookahead) instead
            // of the flat hash pick — the SAME depth-shrink rule applies
            // recursively inside it, so it self-terminates instead of
            // needing a separate max-recursion guard.
            ctx.__smartUsed = (ctx.__smartUsed || 0) + 1;
            const savedDepth = ctx.__smartDepth;
            ctx.__smartDepth = (savedDepth ?? SMART_BASE_DEPTH) - 2;
            cand = pickBestWithLookahead(ctx, level, remainingRef.value);
            ctx.__smartDepth = savedDepth;
          } else if (eligible) {
            cand = cs[0] || null;
          } else {
            cand = pickBestFast(ctx, level);
          }
        }
        nextCand = null;
        if (!cand) break;
        const path = buildPathTo(ctx, cand);
        const crossCounts = applyPath(ctx, path, level, remainingRef, null);
        steps += path.length;
        walls += cand.walls;
        ctx.__smartUnit = (ctx.__smartUnit || 0) + crossCounts.length;
        for (const c of crossCounts) yield c;
      }
      level++;
      if (level > 4) break;
      remainingRef = { value: 0 };
      for (let x = 0; x < WEEKS_TOTAL; x++) for (let y = 0; y < DAYS_TOTAL; y++) {
        if (ctx.state[x][y].level === level && !ctx.state[x][y].eaten) remainingRef.value++;
      }
    }
    for (const [toX, toY, forbidTop, confineTop] of [
      [preExitPoint.x, preExitPoint.y, true, false],
      [exitCornerPoint.x, exitCornerPoint.y, false, false],
      [spawnPoint.x, spawnPoint.y, false, true],
    ]) {
      const legPath = pathToPoint(ctx, toX, toY, forbidTop, confineTop);
      if (!legPath) continue;
      const crossCount = applyMovementOnly(ctx, legPath);
      steps += legPath.length;
      yield crossCount;
    }
    return { walls, steps };
  }

  // Picks the next cell to eat. When several tie for best, simulates each
  // tied option (on a cloned, throwaway copy of the state) forward and
  // compares their crossingSequence unit by unit, at the same unit index for
  // every candidate: whichever crosses FEWEST times on the first unit they
  // differ on wins outright; on an exact tie there, the next unit is
  // compared instead, then the next, and so on. Only candidates still tied
  // at a given unit get simulated one unit deeper, so a decisive comparison
  // (the common case) stays cheap. Every candidate's simulated future has
  // the same total unit count (see crossingSequence), so a group that's
  // still tied after every unit has been compared runs out together —
  // there's nothing left to compare on self-crossing grounds, so the total
  // hops and walls crossingSequence already tallied for free settle it
  // instead — fewer real hops first, then fewer walls, same priority order
  // collectBestCandidates itself uses. Capped to one level of real
  // branching — ties found inside a simulated branch resolve via the fast,
  // non-branching pick above so cost stays bounded instead of exploding
  // combinatorially. Simulating only to the end of THIS level isn't enough:
  // a tie among the last cells of a level doesn't change how many of them
  // get eaten (all tied cells get eaten either way), only the order — but
  // that order decides where the head ends up when the level finishes,
  // which is exactly what determines the next level's (or, for the last
  // level, the exit/return route's) starting point and its crossings.
  function pickBestWithLookahead(ctx, targetLevel, remaining) {
    const candidates = collectBestCandidates(ctx, targetLevel);
    if (candidates.length <= 1) return candidates[0] || null;

    // Only nested (smart-triggered) calls get a pull budget — the outer
    // simulation, run for every real tie regardless of depth, already
    // terminates in bounded time on its own (verified: worst case ~10s on a
    // fully-dense grid, same as before any of this existed) and capping it
    // too would just throw away a real distinction it would have found past
    // the cap, forcing an unnecessary hash fallback for no safety benefit.
    const depth = ctx.__smartDepth ?? SMART_BASE_DEPTH;
    const pullLimit = depth >= SMART_BASE_DEPTH ? Infinity : smartLimits(depth).length;
    let contenders = candidates.map(cand => ({
      cand,
      gen: crossingSequence(cloneCtx(ctx), cand, targetLevel, remaining),
      pos: 0,
      done: false,
      final: null,
    }));
    const pull = c => {
      const n = c.gen.next();
      if (n.done) { c.done = true; c.final = n.value; } else { c.pos = n.value; }
    };
    for (const c of contenders) pull(c);

    let pulls = 1;
    while (!contenders[0].done && pulls < pullLimit) {
      const minPos = Math.min(...contenders.map(c => c.pos));
      contenders = contenders.filter(c => c.pos === minPos);

      if (contenders.length === 1) break;

      for (const c of contenders) pull(c);
      pulls++;
    }

    // Reached the pull budget with several candidates still tied and not
    // actually done (crossingSequence never ran to completion) — c.final is
    // only ever set when a generator finishes, so there's no real
    // steps/walls data to compare here. Skip straight to the hash fallback
    // instead of reading .final off an unfinished contender.
    if (contenders.length > 1 && contenders.every(c => c.done)) {
      const minSteps = Math.min(...contenders.map(c => c.final.steps));
      contenders = contenders.filter(c => c.final.steps === minSteps);

      if (contenders.length > 1) {
        const minWalls = Math.min(...contenders.map(c => c.final.walls));
        contenders = contenders.filter(c => c.final.walls === minWalls);
      }
    }

    if (contenders.length === 1) return contenders[0].cand;

    let best = contenders[0], bestHash = hashTieBreak(ctx, best.cand.x, best.cand.y);
    for (let i = 1; i < contenders.length; i++) {
      const h = hashTieBreak(ctx, contenders[i].cand.x, contenders[i].cand.y);
      if (h < bestHash) { bestHash = h; best = contenders[i]; }
    }
    return best.cand;
  }

  function pathToPoint(ctx, toX, toY, forbidTop, confineTop) {
    const { map: bodyAge, len: bodyLen } = bodyAgeMap(ctx);
    // Same tight bound as reachability's BIG: two routes to the same goal
    // can never differ by more real hops than the grid has cells, so this
    // always outweighs any such difference without needing to be a much
    // larger, arbitrary constant.
    const BIG = WEEKS_TOTAL * DAYS_TOTAL + 1;
    const startKey = ctx.head.x + ',' + ctx.head.y;
    const goalKey = toX + ',' + toY;
    const dist = new Map([[startKey, 0]]);
    const bestHashOf = new Map([[startKey, -Infinity]]);
    const prev = new Map();
    const coordOf = new Map([[startKey, { x: ctx.head.x, y: ctx.head.y }]]);
    const finalized = new Set();
    const pq = [{ key: startKey, x: ctx.head.x, y: ctx.head.y, d: 0, hops: 0 }];
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
        const ncell = ctx.state[nx][ny];
        const isWall = !(ncell.level === 0 || ncell.level === null || ncell.eaten);
        if (isWall) continue;
        const nhops = cur.hops + 1;
        const age = bodyAge.get(key);
        const stillOccupied = age !== undefined && nhops < bodyLen - age;
        const bodyCost = stillOccupied ? 1 : 0;
        const stepCost = bodyCost * BIG + 1;
        const nd = cur.d + stepCost;
        // On an exact cost tie, a deterministic hash of the predecessor
        // decides instead of whichever direction happened to relax first —
        // the same fairness fix applied to reachability/reachabilityMinWalls
        // earlier, just at the level of individual relaxations instead of a
        // single top-level decision (there's only one fixed goal here, no
        // candidate cells to simulate between).
        const curHash = hashTieBreak(ctx, cur.x, cur.y);
        if (!dist.has(key) || nd < dist.get(key) || (nd === dist.get(key) && curHash < bestHashOf.get(key))) {
          dist.set(key, nd);
          bestHashOf.set(key, curHash);
          prev.set(key, cur.key);
          coordOf.set(key, { x: nx, y: ny });
          pq.push({ key, x: nx, y: ny, d: nd, hops: nhops });
        }
      }
    }
    return null;
  }

  const entrancePath = pathToPoint(ctx, cornerPoint.x, cornerPoint.y);
  if (entrancePath) for (const step of entrancePath) { ctx.head = step; ctx.trail.push(step); growAt.push(false); }

  for (let level = 1; level <= 4; level++) {
    let remaining = 0;
    for (let c = 0; c < WEEKS_TOTAL; c++) for (let y = 0; y < DAYS_TOTAL; y++) if (state[c][y].level === level) remaining++;

    while (remaining > 0) {
      const cand = pickBestWithLookahead(ctx, level, remaining);
      if (!cand) break;
      const path = buildPathTo(ctx, cand);
      const remainingRef = { value: remaining };
      applyPath(ctx, path, level, remainingRef, growAt);
      remaining = remainingRef.value;
    }
  }
  const legA = pathToPoint(ctx, preExitPoint.x, preExitPoint.y, true);
  if (legA) for (const step of legA) { ctx.head = step; ctx.trail.push(step); growAt.push(false); }

  const legB = pathToPoint(ctx, exitCornerPoint.x, exitCornerPoint.y);
  if (legB) for (const step of legB) { ctx.head = step; ctx.trail.push(step); growAt.push(false); }

  const legCStartIndex = trail.length - 1;
  const returnPath = pathToPoint(ctx, spawnPoint.x, spawnPoint.y, false, true);
  if (returnPath) for (const step of returnPath) { ctx.head = step; ctx.trail.push(step); growAt.push(false); }

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

function buildSvg(grid, colors, speedMultiplier = 1) {
  const solved = solveSnake(grid);
  const { trail, growAt, legCStartIndex, legCEndIndex, eatenCells, WEEKS_TOTAL, DAYS_TOTAL, WEEKS } = solved;
  const lastIdx = trail.length - 1;
  const stepsPerSec = STEPS_PER_SEC * speedMultiplier;
  const totalDuration = trail.length / stepsPerSec;

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

  // Reveal pop-in takes POP_DUR_SEC real seconds — reserve 1.5x that (in
  // steps) off the end of the return leg so every cell's pop finishes
  // before the loop wraps, instead of only the last few getting cut off.
  const POP_DUR_SEC = 0.4;
  const revealReserve = POP_DUR_SEC * stepsPerSec * 1.5;
  const revealSpan = Math.max(1, legCFinishSpan - revealReserve);
  const revealIndexOf = new Map();
  eatenCells.forEach((p, m) => {
    revealIndexOf.set(p.x + ',' + p.y, legCStartIndex + (m / eatenCells.length) * revealSpan);
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
      // Pop-in spans POP_DUR_SEC total: growPct to the overshoot, the rest
      // settling back down — same 2:1 ratio as the original fixed offsets.
      const popPct = (POP_DUR_SEC / totalDuration) * 100;
      const growPct = popPct * (2 / 3);
      style += `@keyframes ${name}{`
        + `0%{fill:${color};opacity:1;transform:scale(1);}`
        + `${(tEaten).toFixed(2)}%{fill:${color};opacity:1;transform:scale(1);}`
        + `${(tEaten + eps).toFixed(2)}%{fill:var(--lvl0);opacity:1;transform:scale(1);}`
        + `${(tReveal).toFixed(2)}%{fill:var(--lvl0);opacity:1;transform:scale(1);}`
        + `${(tReveal + eps).toFixed(2)}%{fill:${color};opacity:0;transform:scale(0.2);}`
        + `${Math.min(100, tReveal + eps + growPct).toFixed(2)}%{fill:${color};opacity:1;transform:scale(1.12);}`
        + `${Math.min(100, tReveal + eps + popPct).toFixed(2)}%{fill:${color};opacity:1;transform:scale(1);}`
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
  // shrinking a segment below its minimum size right at birth. The
  // return-leg shrink reaches START_LEN by the end of revealSpan (the same
  // window the cell reveals use), not the full return leg, so tail
  // segments finish vanishing with the same safety margin the pops get.
  function bodyLenAtStep(i) {
    let raw;
    if (i <= legCStartIndex) raw = bodyLenAt(cumEaten[i], solved.totalEatable);
    else {
      const p = Math.min(1, (i - legCStartIndex) / revealSpan);
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
  // Shared by both the growth phase (shapeAt, below) and the return-leg
  // checkpoint loop — same formula for a segment's shape given any body
  // length, real or virtual, so shrinking uses the exact same curve as
  // growing instead of a separately hardcoded one.
  function shapeForLen(n, len) {
    // Past the current body length entirely (only possible during the
    // return-leg shrink, as len counts down) — this index isn't part of
    // the body at all anymore, so it's fully gone. The short-body floor
    // below only applies to segments that ARE part of the body; applying
    // it here would leave a departed segment stuck at a visible size.
    if (n >= len) return { scale: 0, fill: TAIL_COLOR, tt: 1 };
    // Anchored at the head end, not the tail: the segment right after the
    // head is always exactly BODY_COLOR, and the tail tip only approaches
    // TAIL_COLOR asymptotically as len grows — never quite reaching it for
    // short bodies, instead of the tail tip being forced there always.
    const tt = len <= 1 ? 0 : (n - 1) / (len - 1);
    // Short bodies get a gentler floor for the tail — full MAX_SIZE at 1
    // segment, ramping linearly down to MIN_SIZE by 10 segments and
    // staying there above that. Same quadratic curve shape either way,
    // just a shallower range.
    const floorT = Math.min(1, Math.max(0, (len - 1) / 9));
    const minForLen = MAX_SIZE - (MAX_SIZE - MIN_SIZE) * floorT;
    const size = MAX_SIZE - (MAX_SIZE - minForLen) * (tt * tt);
    return { scale: size / MAX_SIZE, fill: lerpColor(BODY_COLOR, TAIL_COLOR, tt), tt };
  }
  function shapeAt(n, i) {
    return shapeForLen(n, bodyLenAtStep(i));
  }

  let segments = '';
  const segCount = Math.min(Math.round(bodyLenAt(solved.totalEatable, solved.totalEatable)), BODY_LIMIT);
  const pctOf = i => (i / lastIdx) * 100;

  // Tail-fade: excess segments (beyond the final body length) each get an
  // equal, contiguous slice of the shared window (tail-most first), and
  // drop straight from their held shape to gone — a plain 2-point linear
  // scale-down, not a sampled curve, so there's no stepping.
  const finalLen = bodyLenAtStep(legCEndIndex);
  const dyingCount = Math.max(0, segCount - finalLen);
  const tailFadeSliceSteps = dyingCount > 0 ? revealSpan / dyingCount : 0;

  // React to eating rather than anticipate it: hold, then ramp to the new
  // value over at most HOLD_CAP seconds — otherwise a late-cycle gap
  // between eat-events (growth flattens near the end) gets smeared across
  // the whole gap, repainting every frame for a change nobody can see.
  // Birth/death reuse the same ramp for appearing/vanishing — including the
  // head's own one-shot startup pop below, so every segment (head included)
  // pops in over the exact same real-world duration.
  const HOLD_CAP = 0.3;

  style += `@keyframes head-pop{0%{opacity:0;transform:scale(0);}100%{opacity:1;transform:scale(1);}}`;

  for (let n = 0; n < segCount; n++) {
    // Positive delay trails segment n behind the head by n steps (wrapper
    // position only — the shape animation below is already absolute-timed
    // and must not be delayed again).
    const posDelay = n / stepsPerSec;
    if (n === 0) {
      // Head has no growth/tail-fade animation of its own (fixed size/color
      // always), so unlike the body segments below it doesn't need a
      // hold-then-pop layered over a continuous `name` animation — just a
      // plain one-shot pop-in from scale 0, same HOLD_CAP duration. posDelay
      // is always 0 for the head (n=0), so it pops in immediately at t=0
      // with no hold phase, right as the page loads.
      segments += `<g style="will-change:transform;animation:snake-pos ${totalDuration.toFixed(2)}s linear infinite;animation-delay:${posDelay.toFixed(3)}s;">`
        + `<rect x="${(-MAX_SIZE / 2).toFixed(2)}" y="${(-MAX_SIZE / 2).toFixed(2)}" width="${MAX_SIZE}" height="${MAX_SIZE}" rx="${(MAX_SIZE * 0.32).toFixed(2)}" fill="${HEAD_COLOR}" style="will-change:transform;animation:head-pop ${HOLD_CAP}s linear 1;animation-fill-mode:none;transform-box:fill-box;transform-origin:center;"/>`
        + `</g>`;
      continue;
    }
    const birth = findBirth(n);

    const stopList = [];
    if (birth > 0) stopList.push([0, 'opacity:0;transform:scale(0);']);

    // A stop at every step where the rounded body length actually changes
    // (not N evenly-spaced samples) — eating pace is uneven, so even
    // sampling could miss bursts of several eat-events in a row. Only
    // covers the eating phase — the return leg is handled by the shared
    // checkpoint loop below, for every segment uniformly.
    const aliveEnd = legCStartIndex;
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

    const capPct = (HOLD_CAP / totalDuration) * 100;
    const styleOf = e => `opacity:1;transform:scale(${e.scale.toFixed(2)});fill:${e.fill};`;
    const pushStop = (pct, s) => {
      const last = stopList[stopList.length - 1];
      if (last && last[0] === pct && last[1] === s) return;
      stopList.push([pct, s]);
    };

    // Each transition ramps for up to capPct — but if the next one arrives
    // before that finishes, don't jump straight to either target. Track
    // where the ramp actually is the instant it's interrupted (a plain
    // linear read of its own progress so far — the same value CSS itself
    // would be showing right then) and start the next ramp from there,
    // aimed at the newly-known target. Nothing is ever anticipated ahead
    // of an event that hasn't happened yet — a backlog only makes the next
    // ramp move faster to still land within capPct, never earlier.
    const changePoints = [];
    if (birth > 0) {
      changePoints.push({ pct: events[0].pct, scale: events[0].scale, tt: events[0].tt });
    } else {
      pushStop(events[0].pct, styleOf(events[0]));
    }
    for (let k = 1; k < events.length; k++) {
      changePoints.push({ pct: events[k].pct, scale: events[k].scale, tt: events[k].tt });
    }
    let curPct, curScale, curTt;
    if (birth > 0) {
      curPct = changePoints[0].pct;
      curScale = 0;
      curTt = changePoints[0].tt;
      pushStop(curPct, 'opacity:0;transform:scale(0);');
    } else {
      curPct = events[0].pct;
      curScale = events[0].scale;
      curTt = events[0].tt;
    }
    for (let idx = 0; idx < changePoints.length; idx++) {
      const cp = changePoints[idx];
      const naturalEndPct = curPct + capPct;
      const nextPct = idx + 1 < changePoints.length ? changePoints[idx + 1].pct : pctOf(aliveEnd);
      if (naturalEndPct <= nextPct) {
        const style = styleOf({ scale: cp.scale, fill: lerpColor(BODY_COLOR, TAIL_COLOR, Math.min(cp.tt, 1)) });
        pushStop(naturalEndPct, style);
        if (naturalEndPct < nextPct) pushStop(nextPct, style);
        curPct = nextPct; curScale = cp.scale; curTt = cp.tt;
      } else {
        const f = (nextPct - curPct) / capPct;
        const midScale = curScale + (cp.scale - curScale) * f;
        const midTt = curTt + (cp.tt - curTt) * f;
        pushStop(nextPct, styleOf({ scale: midScale, fill: lerpColor(BODY_COLOR, TAIL_COLOR, Math.min(Math.max(midTt, 0), 1)) }));
        curPct = nextPct; curScale = midScale; curTt = midTt;
      }
    }
    // Return leg: the window is sliced into as many equal steps as
    // segments will vanish, and at every slice boundary EVERY segment
    // (not just whichever one is currently vanishing) gets a new
    // waypoint — its shape as if the body were now exactly one segment
    // shorter (virtualLen counts straight down: segCount, segCount-1, ...,
    // finalLen). A straight line connects each pair of waypoints, so the
    // whole tail moves together instead of one segment fading in isolation.
    for (let k = 1; k <= dyingCount; k++) {
      const virtualLen = segCount - k;
      const { scale, fill } = shapeForLen(n, virtualLen);
      const pct = pctOf(legCStartIndex + k * tailFadeSliceSteps);
      pushStop(pct, `opacity:1;transform:scale(${scale.toFixed(2)});fill:${fill};`);
      if (scale === 0) break;
    }
    pushStop(100, stopList[stopList.length - 1][1]);

    let kf = '';
    for (const [pct, bit] of stopList) kf += `${pct.toFixed(2)}%{${bit}}`;
    const name = `seg${n}`;
    style += `@keyframes ${name}{${kf}}`;

    // Startup segments (birth===0) are already opacity:1/full-scale in
    // `name` above from 0% — but their position <g> hasn't caught up
    // (posDelay) yet, so a one-shot reveal (same pop-in look as a normally
    // grown segment: scale0→target) is layered AFTER `name`, winning while
    // it's active. It holds at scale0/opacity0 until posDelay has passed
    // (position already correct by then, not overlapping it), pops over
    // the next POP_DUR_SEC, then — fill-mode:none, unlike a frozen-forever
    // fade — releases control back to `name` for the rest of the loop, so
    // later real growth/shrink still shows. Runs once (iteration-count:1),
    // so it never replays on a loop reset.
    let segStyle;
    if (birth === 0) {
      const fadeName = `${name}f`;
      const fadeDuration = posDelay + HOLD_CAP;
      const holdPct = (posDelay / fadeDuration) * 100;
      style += `@keyframes ${fadeName}{0%{opacity:0;transform:scale(0);}${holdPct.toFixed(2)}%{opacity:0;transform:scale(0);}100%{${stopList[0][1]}}}`;
      segStyle = `animation-name:${name},${fadeName};`
        + `animation-duration:${totalDuration.toFixed(2)}s,${fadeDuration.toFixed(3)}s;`
        + `animation-timing-function:linear,linear;`
        + `animation-iteration-count:infinite,1;`
        + `animation-fill-mode:none,none;`;
    } else {
      segStyle = `animation:${name} ${totalDuration.toFixed(2)}s linear infinite;`;
    }

    segments += `<g style="will-change:transform;animation:snake-pos ${totalDuration.toFixed(2)}s linear infinite;animation-delay:${posDelay.toFixed(3)}s;">`
      + `<rect x="${(-MAX_SIZE / 2).toFixed(2)}" y="${(-MAX_SIZE / 2).toFixed(2)}" width="${MAX_SIZE}" height="${MAX_SIZE}" rx="${(MAX_SIZE * 0.32).toFixed(2)}" fill="${BODY_COLOR}" style="will-change:transform;${segStyle}transform-box:fill-box;transform-origin:center;"/>`
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
  const rawSpeed = config.contributionSnake?.speed;
  const speedMultiplier = typeof rawSpeed === 'number' && rawSpeed > 0 ? Math.max(0.1, Math.min(rawSpeed, 3)) : 1;

  const rawStartLength = config.contributionSnake?.startLength;
  const rawMaxLength = config.contributionSnake?.maxLength;
  if (typeof rawStartLength === 'number' && rawStartLength >= 0) START_LEN = Math.max(1, Math.min(50, Math.round(rawStartLength)));
  if (typeof rawMaxLength === 'number' && rawMaxLength >= 1) BODY_LIMIT = Math.min(50, Math.round(rawMaxLength));
  if (BODY_LIMIT < START_LEN) BODY_LIMIT = START_LEN;

  const grid = await fetchCalendar(owner, process.env.GITHUB_TOKEN);

  const outPath = join(__dirname, '..', 'assets', 'contribution-snake.svg');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buildSvg(grid, colors, speedMultiplier), 'utf8');

  console.log(`Generated assets/contribution-snake.svg — ${grid.length} weeks`);
}

main();
