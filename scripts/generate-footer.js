// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { writeFileSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const { resolveTheme, loadTheme } = require('./theme');

function main() {
  const { startColor, endColor, fadeMaskStops } = resolveTheme(loadTheme());

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 160" width="100%" height="100%">
  <defs>
    <linearGradient id="bg-grad-inv" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="${startColor}"/>
      <stop offset="100%" stop-color="${endColor}"/>
    </linearGradient>

    <linearGradient id="fade-mask-grad" x1="0" y1="0" x2="1" y2="0">
${fadeMaskStops}
    </linearGradient>

    <mask id="quad-fade-mask">
      <rect width="1500" height="160" fill="url(#fade-mask-grad)"/>
      <rect width="1500" height="160" fill="url(#fade-mask-grad)"/>
    </mask>

    <filter id="alpha-boost-inv">
      <feComponentTransfer>
        <feFuncA type="linear" slope="1.15" />
      </feComponentTransfer>
    </filter>

    <filter id="text-shadow" x="-10%" y="-30%" width="120%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#000000" flood-opacity="0.7"/>
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.5"/>
    </filter>

    <mask id="wave-mask-inv">
      <g filter="url(#alpha-boost-inv)">

        <path fill="#ffffff" opacity="0.5" d="M 0 40
C 222 0, 444 0, 667 40
C 889 80, 1111 80, 1334 40
C 1556 0, 1778 0, 2000 40
C 2222 80, 2444 80, 2667 40
C 2889 0, 3111 0, 3334 40
V 350 H 0 Z">
          <animateTransform attributeName="transform" type="translate" from="-1334 0" to="0 0" dur="5s" repeatCount="indefinite"/>
        </path>

        <path fill="#ffffff" opacity="0.5" d="M 0 40
C 222 0, 444 0, 667 40
C 889 80, 1111 80, 1334 40
C 1556 0, 1778 0, 2000 40
C 2222 80, 2444 80, 2667 40
C 2889 0, 3111 0, 3334 40
V 350 H 0 Z">
          <animateTransform attributeName="transform" type="translate" from="-1334 0" to="0 0" dur="9s" repeatCount="indefinite"/>
        </path>

        <path fill="#ffffff" opacity="0.5" d="M 0 40
C 222 0, 444 0, 667 40
C 889 80, 1111 80, 1334 40
C 1556 0, 1778 0, 2000 40
C 2222 80, 2444 80, 2667 40
C 2889 0, 3111 0, 3334 40
V 350 H 0 Z">
          <animateTransform attributeName="transform" type="translate" from="-1334 0" to="0 0" dur="14s" repeatCount="indefinite"/>
        </path>

      </g>
    </mask>
  </defs>

  <g mask="url(#quad-fade-mask)">
    <g mask="url(#wave-mask-inv)">
      <rect width="1500" height="160" fill="url(#bg-grad-inv)" />
    </g>
  </g>

  <!-- Powered by -->
  <text x="750" y="138"
    font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
    font-size="18"
    fill="#ffffff"
    fill-opacity="0.5"
    text-anchor="middle"
    letter-spacing="0.5"
    filter="url(#text-shadow)">
    made with BerkaySevinc/easy-github-profile
  </text>

</svg>`;

  const outPath = join(__dirname, '..', 'assets', 'footer.svg');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, svg, 'utf8');
  console.log('Generated assets/footer.svg');
}

main();
