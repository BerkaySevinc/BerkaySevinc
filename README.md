## easy-github-profile

A zero-effort GitHub profile README setup. Fork it and your profile is live instantly — fully customizable, no coding required.

> 👇 See setup instructions below.

<br>

---

> 👤 Example profile.

<!-- PROFILE:START -->
<img src="assets/header.svg" width="100%"/>
<img src="assets/typing.svg" width="100%"/>
<img src="assets/divider.svg" width="100%"/>
<br>
<div align="center">
  <img src="assets/stats.svg"/>
</div>
<br>
<img src="assets/divider.svg" width="100%"/>
<br>
<div align="center">
  <img src="assets/langs.svg" width="100%"/>
</div>
<br>
<img src="assets/divider.svg" width="100%"/>
<div align="center">
  <img src="assets/labels/lang.svg"/><br>
  <img src="assets/badges/csharp.svg">
  <img src="assets/badges/javascript.svg">
  <img src="assets/badges/html5.svg">
  <img src="assets/badges/css3.svg">
  <br><br>
  <img src="assets/labels/fw.svg"/><br>
  <img src="assets/badges/dotnet.svg">
  <img src="assets/badges/aspnet-core.svg">
  <img src="assets/badges/nodejs.svg">
  <br><br>
  <img src="assets/labels/tools.svg"/><br>
  <img src="assets/badges/git.svg">
  <img src="assets/badges/github.svg">
  <img src="assets/badges/visual-studio.svg">
  <img src="assets/badges/vscode.svg">
  <img src="assets/badges/claude-code.svg">
</div>
<br>
<img src="assets/divider.svg" width="100%"/>
<br>
<img src="assets/contribution-graph.svg" width="100%"/>
<img src="assets/contribution-snake.svg" width="100%"/>
<br>
<img src="assets/footer.svg" width="100%"/>
<!-- PROFILE:END -->

---

<br>

## ✨ Features

- **Up in minutes** — just follow the Quick Start steps below, no configuration required
- **One file to configure** — everything lives in `config.jsonc`, no code to touch

- **Animations** — animated wave header, typewriter effect, and more
- **Dark/light mode support** — labels automatically adapt to the viewer's theme
- **Responsive** — adapts seamlessly to any screen size, from mobile to desktop

- **Fully automatic** — GitHub Actions generates all SVGs on every push and on a daily schedule
- **Daily auto-update** — profile stays in sync with your GitHub data every day at midnight UTC

- **No dependencies** — nothing to install
- **GitHub API integration** — name and bio are pulled directly from your GitHub profile, no manual input needed
- **Fork-friendly** — works for any GitHub username automatically, no hardcoded values

<br>

---

<br>

## 🚀 Quick Start

<br>

### 🍴 1. Fork this repository

Click the **Fork** button at the top right of this page.

<br>

### 🆔 2. Name the repository `{your-username}`

When forking, you can set the name directly. If you missed it, go to **Settings** and rename it there. The name must match your GitHub username exactly for the profile README to work.

> ⚠️ If you already have a `{your-username}` repository, you'll need to delete it first.

<br>

### 🧹 3. Clean up `README.md`

Remove any content that doesn't belong on your profile page — the project title, description, example note, and setup instructions.

<br>

### ▶️ 4. Trigger the Action

Go to **Actions** → **Generate Assets** → **Run workflow**. Your profile is live. 🎉

> ℹ️ From now on, your profile updates itself automatically every day and on every push — it always stays in sync with your GitHub activity.

<br>

### ⭐ 5. Star the repo _(optional)_

Enjoying the project? A star helps support the project — and keeps new features coming.

<br>

### ⚙️ 6. Customize _(optional)_

Edit `config.jsonc` to personalize your typing lines, badge sections, colors, and more. See the [Customize](#%EF%B8%8F-customize) section below for details.

<br>

---

<br>

## ⚙️ Customize

All customization happens in `config.jsonc`.

<br>

### 🖼️ Header

```json
"header": {
  "name": null,
  "bio": null
}
```

| Field | Description |
|-------|-------------|
| `name` | Your display name. `null` = fetched from your GitHub profile |
| `bio` | Your subtitle text. `null` = fetched from your GitHub profile bio |

---

### ⌨️ Typing

```json
"typing": {
  "lines": [
    ".NET & C# Developer",
    "ASP.NET Core · Node.js"
  ]
}
```

| Field | Description |
|-------|-------------|
| `lines` | Lines shown in the typewriter animation, one by one. `null` or `[]` = fetched from your GitHub profile (bio, company, location, blog) |

---

### 📊 Stats

```json
"stats": {
  "show": {
    "commits":   true,
    "prs":       true,
    "issues":    true,
    "stars":     true,
    "repos":     true,
    "followers": true
  }
}
```

| Field | Description |
|-------|-------------|
| `show.commits` | Total commits this year (includes private) |
| `show.prs` | Total pull requests |
| `show.issues` | Total issues opened |
| `show.stars` | Total stars across all repos |
| `show.repos` | Total public repositories |
| `show.followers` | Follower count |

Set any field to `false` to hide it. Remaining stats auto-expand to fill the card.

---

### 🌐 Top Languages

No configuration needed — top languages are fetched automatically from your public repositories and the top 6 are shown.

---

### 🏷️ Labels

```json
"labels": [
  { "id": "lang",  "text": "Languages" },
  { "id": "fw",    "text": "Frameworks & Runtimes" },
  { "id": "tools", "text": "Tools & Environment" }
]
```

| Field | Description |
|-------|-------------|
| `id` | Used as the output filename: `assets/labels/{id}.svg` |
| `text` | The label text displayed |

New labels need to be added to `README.md` manually — see the **Editing README.md** section below.

---

### 📛 Badges

```json
"badges": [
  { "text": "C#",         "color": "#1d7a1a" },
  { "text": "JAVASCRIPT", "color": "#e0c910" }
]
```

| Field | Description |
|-------|-------------|
| `id` | Used as the output filename: `assets/badges/{id}.svg` |
| `text` | Badge label displayed on the badge |
| `color` | Badge background color (hex) |

New badges need to be added to `README.md` manually — see the **Editing README.md** section below.

---

### 🟩 Contribution Graph

```json
"contributionGraph": {
  "effects": {
    "matrixRain":   true,
    "tetrisDropIn": true,
    "digitFlicker": true
  }
}
```

| Field | Description |
|-------|-------------|
| `effects.matrixRain` | Animated digital-rain beams sweep down through the grid |
| `effects.tetrisDropIn` | Cells fall into place column by column, with a settle bounce, instead of appearing statically |
| `effects.digitFlicker` | Active days occasionally flash their own contribution count as a small digit |

Your real contribution calendar, redrawn in a dark phosphor-green grid. Each effect is independent — enable any combination, or set all three to `false` for a plain static grid.

---

### 🐍 Contribution Snake

```json
"contributionSnake": {
  "color": null
}
```

| Field | Description |
|-------|-------------|
| `color` | Hex color for the snake. `null` = uses `theme.accent` instead |

A snake eats through your real contribution calendar, growing as it goes, then loops. The head is a lightened version of the color, fading darker toward the tail.

---

### ➖ Divider / 🔻 Footer

No configuration needed — these are static animated SVGs.

<br>

---

<br>

## 📝 Editing README.md

All generated assets are just image files — place them anywhere in `README.md` however you like. Here's the full example used in this repo:

```html
<img src="assets/header.svg" width="100%"/>
<img src="assets/typing.svg" width="100%"/>
<img src="assets/divider.svg" width="100%"/>
<br>
<div align="center">
  <img src="assets/stats.svg"/>
</div>
<br>
<img src="assets/divider.svg" width="100%"/>
<br>
<div align="center">
  <img src="assets/langs.svg" width="100%"/>
</div>
<br>
<img src="assets/divider.svg" width="100%"/>
<div align="center">
  <img src="assets/labels/lang.svg"/><br>
  <img src="assets/badges/csharp.svg">
  <img src="assets/badges/javascript.svg">
  <br><br>
  <img src="assets/labels/fw.svg"/><br>
  <img src="assets/badges/dotnet.svg">
  <img src="assets/badges/aspnet-core.svg">
</div>
<br>
<img src="assets/divider.svg" width="100%"/>
<br>
<div align="center">
  <img src="assets/contribution-graph.svg" width="100%"/>
  <img src="assets/contribution-snake.svg" width="100%"/>
</div>
<br>
<img src="assets/footer.svg" width="100%"/>
```

| Asset | Path |
|-------|------|
| Header | `assets/header.svg` |
| Typing animation | `assets/typing.svg` |
| Divider | `assets/divider.svg` |
| GitHub Stats | `assets/stats.svg` |
| Top Languages | `assets/langs.svg` |
| Contribution Graph | `assets/contribution-graph.svg` |
| Contribution Snake | `assets/contribution-snake.svg` |
| Label | `assets/labels/{id}.svg` |
| Badge | `assets/badges/{text}.svg` |
| Footer | `assets/footer.svg` |

<br>

---

<br>

## 📄 License

MIT © [BerkaySevinc](https://github.com/BerkaySevinc)

<br>

---

<br>

## 🔗 Built With

[BerkaySevinc/easy-github-profile](https://github.com/BerkaySevinc/easy-github-profile)
