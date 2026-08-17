# IELTS Vocab 真经 — Liu Hongbo

Single-page PWA: 22 chapters, 3455 words, OALD definitions, Web Speech TTS, selection-to-define popup, dark mode.

## Files

- `index.html` — the entire app (3.5 MB self-contained)
- `manifest.json` — PWA config (name, icons, shortcuts)
- `icon-192.png` / `icon-512.png` — PWA icons
- `icon-maskable-512.png` — Android adaptive icon
- `apple-touch-icon.png` — iOS "Add to Home Screen"
- `favicon.ico` — browser tab

## Deploy to Cloudflare Pages

```bash
# Direct upload (zero config)
npx wrangler pages deploy . --project-name=ielts-vocab --branch=main

# Or: connect this GitHub repo to CF Pages (auto-deploy on push)
#   1. dash.cloudflare.com → Pages → Create → Connect to Git
#   2. Select Toreinm/ielts-vocab
#   3. Framework: None · Build command: (empty) · Build output: /
#   4. Save and Deploy
```

Default URL after deploy: `https://ielts-vocab.pages.dev`

## Source / Build

The source for this site lives in a separate local repo
(`/Users/taorui/.minimax/workspace/ielts-vocab-ch1/`) — see `build_all.py`,
`ch*_data.py`, and the `dist/` rebuild flow. This GitHub repo only
contains the static assets needed to serve the site.
