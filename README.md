# rizldizl.com

Landing page for [RizlDizl](https://github.com/ScienceIsNeato/RizlDizl) — reactive
keyboard lighting for Razer keyboards on macOS.

Static site served from `public/` via Cloudflare Workers. Same setup as the sibling
ScienceIsNeato sites.

## Local preview

```bash
npx http-server public      # quick static serve
# or the tracked wrangler dev helper:
npm install
npm run deploy:app          # start, prints a local URL
npm run deploy:app:status
npm run deploy:app:stop
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which runs
`wrangler deploy`. It needs two repo secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The custom domains (`rizldizl.com`, `www.rizldizl.com`) are attached via the
`[[routes]]` blocks in `wrangler.toml` — the domain must live in the same
Cloudflare account.

## Structure

- `public/index.html` — the landing page
- `public/styles.css` — the landing page styles
- `public/assets/` — effect GIFs, posters, and menu-bar screenshots
- `public/robots.txt`, `public/sitemap.xml`, `public/favicon.svg` — SEO/meta
- `wrangler.toml` — Cloudflare Worker static-asset + custom-domain config
- `scripts/deploy_app.sh` — tracked local preview helper
- `.github/workflows/deploy-pages.yml` — deploy on push to main

## TODO

- Add `public/og.png` (1200×630) — referenced by the social-share meta tags.
