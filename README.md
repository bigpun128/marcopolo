# Circles — Landing Page Options

Three landing-page directions for Marco Polo Circles. All static HTML, no build step.

## Structure

```
circles-landing/
├── index.html        → the chooser page (links to all three)
├── v1/index.html     → "Sunrise"  — full color, photo-strip hero
├── v2/index.html     → "Cobalt"   — single dominant blue, full-bleed hero
├── v3/index.html     → "Plum"     — editorial bold, split hero
└── vercel.json       → clean URLs (/v1 instead of /v1/index.html)
```

Once deployed, the pages live at:
- `yoursite.vercel.app/`     → chooser
- `yoursite.vercel.app/v1`   → version 1
- `yoursite.vercel.app/v2`   → version 2
- `yoursite.vercel.app/v3`   → version 3

## Put it on GitHub

From inside this folder:

```bash
git init
git add .
git commit -m "Circles landing page options v1-v3"
```

Then create an empty repo on github.com (no README/gitignore), and:

```bash
git remote add origin https://github.com/YOUR-USERNAME/circles-landing.git
git branch -M main
git push -u origin main
```

(Or, with the GitHub CLI: `gh repo create circles-landing --public --source=. --push`)

## Deploy on Vercel

1. Go to vercel.com → **Add New → Project → Import** your `circles-landing` repo.
2. Framework preset: **Other**. Build command: none. Output dir: leave default.
3. Click **Deploy**. Done — you get a `*.vercel.app` URL in ~20 seconds.

Every `git push` after that auto-deploys. To edit a page, change the file, commit, push.

## Notes

- Images are currently Unsplash links — swap in real Circles/Marco Polo photography before production. Drop image files into the folder and reference them with relative paths (e.g. `/img/hero.jpg`).
- The CTA buttons point to `https://circles.marcopolo.me/survey`. Change per page if you want to track each variant's quiz starts separately (add a `?utm_content=v1` etc.).
- To A/B test for real, point ad traffic at `/v1`, `/v2`, `/v3` with matching UTMs and compare in your analytics.
