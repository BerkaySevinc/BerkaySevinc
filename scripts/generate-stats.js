// easy-github-profile — github.com/BerkaySevinc/easy-github-profile
// Copyright (c) 2025 BerkaySevinc — MIT License

const { writeFileSync, mkdirSync, readFileSync } = require('fs');
const { join, dirname } = require('path');
const { resolveTheme, loadTheme } = require('./theme');

function loadConfig() {
  try {
    return JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf8'));
  } catch { return {}; }
}

async function fetchStats(owner, token) {
  const headers = { 'User-Agent': 'github-profile-generator', 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const query = `query($login: String!) {
    user(login: $login) {
      repositories(ownerAffiliations: OWNER, first: 100) {
        totalCount
        nodes { stargazerCount }
      }
      followers { totalCount }
      contributionsCollection {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        restrictedContributionsCount
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

  const u  = json.data.user;
  const cc = u.contributionsCollection;
  return {
    commits:   cc.totalCommitContributions + cc.restrictedContributionsCount,
    prs:       cc.totalPullRequestContributions,
    issues:    cc.totalIssueContributions,
    stars:     u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0),
    repos:     u.repositories.totalCount,
    followers: u.followers.totalCount,
  };
}

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function buildSvg(stats, show, accent, titleColor) {
  const allItems = [
    { key: 'commits',   value: fmt(stats.commits),   label: 'Commits'       },
    { key: 'prs',       value: fmt(stats.prs),       label: 'Pull Requests' },
    { key: 'issues',    value: fmt(stats.issues),    label: 'Issues'        },
    { key: 'stars',     value: fmt(stats.stars),     label: 'Stars'         },
    { key: 'repos',     value: fmt(stats.repos),     label: 'Repos'         },
    { key: 'followers', value: fmt(stats.followers), label: 'Followers'     },
  ];

  const items = allItems.filter(it => show[it.key] !== false);
  if (!items.length) throw new Error('stats.show: at least one stat must be enabled.');

  const W = 800, H = 148, cols = items.length, cw = W / cols;

  let cells = '';
  for (let i = 0; i < items.length; i++) {
    const cx = (i * cw + cw / 2).toFixed(1);
    if (i > 0)
      cells += `  <line x1="${Math.round(i * cw)}" y1="48" x2="${Math.round(i * cw)}" y2="136" class="div"/>\n`;
    cells += `  <text x="${cx}" y="93"  text-anchor="middle" class="val">${items[i].value}</text>\n`;
    cells += `  <text x="${cx}" y="118" text-anchor="middle" class="lbl">${items[i].label}</text>\n`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    @media (prefers-color-scheme: dark) {
      .bg  { fill: #161b22; stroke: #30363d; }
      .ttl { fill: ${titleColor.dark}; }
      .val { fill: ${accent.dark}; }
      .lbl { fill: #8b949e; }
      .div { stroke: #30363d; }
    }
    @media (prefers-color-scheme: light) {
      .bg  { fill: #f6f8fa; stroke: #d0d7de; }
      .ttl { fill: ${titleColor.light}; }
      .val { fill: ${accent.light}; }
      .lbl { fill: #636e7b; }
      .div { stroke: #d0d7de; }
    }
    .bg  { stroke-width: 1; }
    .ttl { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 14px; font-weight: 600; }
    .val { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 28px; font-weight: 700; }
    .lbl { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size: 11px; font-weight: 500; }
    .div { stroke-width: 1; }
  </style>

  <rect class="bg" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10"/>
  <text class="ttl" x="${W / 2}" y="28" text-anchor="middle">GitHub Stats</text>
  <line class="div" x1="18" y1="40" x2="${W - 18}" y2="40"/>

${cells}
</svg>`;
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!owner) {
    console.error('Error: GITHUB_REPOSITORY_OWNER environment variable is not set.');
    process.exit(1);
  }

  const config = loadConfig();
  const show   = config.stats?.show ?? {};

  const stats = await fetchStats(owner, process.env.GITHUB_TOKEN);
  const outPath = join(__dirname, '..', 'assets', 'stats.svg');
  mkdirSync(dirname(outPath), { recursive: true });
  const { accent, titleColor } = resolveTheme(loadTheme());
  writeFileSync(outPath, buildSvg(stats, show, accent, titleColor), 'utf8');
  console.log(`Generated assets/stats.svg — commits: ${stats.commits}, stars: ${stats.stars}, repos: ${stats.repos}`);
}

main();
