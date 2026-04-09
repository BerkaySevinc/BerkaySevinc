// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { writeFileSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const { resolveTheme, loadTheme } = require('./theme');

const AMPLITUDE  = 10;
const GAP        = 0;
const TOP_CENTER = AMPLITUDE;                          // 10  — peak touches y=0
const BOT_CENTER = TOP_CENTER + 2 * AMPLITUDE + GAP;  // 33
const H          = BOT_CENTER + AMPLITUDE;             // 43  — valley touches bottom

// fillDir 'down': wave edge is at top, fills downward (top edge of ribbon)
// fillDir 'up':   wave edge is at bottom, fills upward (bottom edge of ribbon)
function wavePath(centerY, amplitude, fillDir, dur) {
  const [a, b] = fillDir === 'down'
    ? [centerY - amplitude, centerY + amplitude]  // peak then valley
    : [centerY + amplitude, centerY - amplitude]; // valley then peak
  const fillTo = fillDir === 'down' ? H : 0;

  return `<path fill="#ffffff" opacity="0.5" d="M 0 ${centerY}
C 222 ${a}, 444 ${a}, 667 ${centerY}
C 889 ${b}, 1111 ${b}, 1334 ${centerY}
C 1556 ${a}, 1778 ${a}, 2000 ${centerY}
C 2222 ${b}, 2444 ${b}, 2667 ${centerY}
C 2889 ${a}, 3111 ${a}, 3334 ${centerY}
V ${fillTo} H 0 Z">
          <animateTransform attributeName="transform" type="translate"
            from="-1334 0" to="0 0" dur="${dur}" repeatCount="indefinite"/>
        </path>`;
}

function main() {
  const { gradientStops } = resolveTheme(loadTheme());
  const stops = gradientStops.map(s => `      <stop offset="${s.offset}" stop-color="${s.color}"/>`).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 ${H}" width="100%" height="100%">
  <defs>
    <linearGradient id="bg-grad" x1="0" y1="0" x2="1" y2="0">
${stops}
    </linearGradient>

    <filter id="alpha-boost">
      <feComponentTransfer>
        <feFuncA type="linear" slope="1.15"/>
      </feComponentTransfer>
    </filter>

    <!-- Top edge: fills downward, creates scalloped top border -->
    <mask id="top-mask">
      <g filter="url(#alpha-boost)">
        ${wavePath(TOP_CENTER, AMPLITUDE, 'down', '5s')}
        ${wavePath(TOP_CENTER, AMPLITUDE, 'down', '8s')}
        ${wavePath(TOP_CENTER, AMPLITUDE, 'down', '13s')}
      </g>
    </mask>

    <!-- Bottom edge: fills upward, creates scalloped bottom border -->
    <mask id="bottom-mask">
      <g filter="url(#alpha-boost)">
        ${wavePath(BOT_CENTER, AMPLITUDE, 'up', '7s')}
        ${wavePath(BOT_CENTER, AMPLITUDE, 'up', '11s')}
        ${wavePath(BOT_CENTER, AMPLITUDE, 'up', '17s')}
      </g>
    </mask>
  </defs>

  <!-- Nested masks intersect: shows only the ribbon between the two wave edges -->
  <g mask="url(#top-mask)">
    <rect width="1500" height="${H}" fill="url(#bg-grad)" mask="url(#bottom-mask)"/>
  </g>

</svg>`;

  const outPath = join(__dirname, '..', 'assets', 'divider.svg');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, svg, 'utf8');
  console.log('Generated assets/divider.svg');
}

main();
