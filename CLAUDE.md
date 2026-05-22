# Drink Menu Analyzer — CLAUDE.md

## What this is
A Node.js/Express web app that analyzes drink menu photos using the Claude API. Focused on beer and wine. Upload a photo, get instant analysis of every drink: ABV, calories, Value Index (0–100), food pairings, and markup vs retail price.

## How to run
```
npm install
# Create .env with ANTHROPIC_API_KEY=your_key
npm start
# Open http://localhost:3000
```

## File structure
```
drink-menu-analysis/
├── server.js      ← Express server + all Claude API calls
├── index.html     ← Full frontend (single file — HTML/CSS/JS)
├── package.json
├── .env           ← API key (never commit)
└── shares.db      ← local SQLite for share links (auto-created, gitignored)
```

No `public/` folder — `index.html` is served from the project root via `express.static(__dirname)`.

## How the analysis works (two API calls total)

**Call 1 — Extraction (vision):** Sends the menu image to Haiku. Returns a JSON object with `venue` (restaurant name or null) and `drinks` (array of every item with name, category, price, region, etc.).

**Call 2 — Research (text):** Sends all drinks in one batch. Returns a JSON array (same index order) with ABV, calories, flavor profile, food pairings, simple comparison, and pour_ml (used as fallback if not extracted from menu).

## Derived calculations (done in server.js, not by Claude)
- **APD (internal):** `(abv/100 × pour_ml) / pour_price`. Prefers bottle price; falls back to glass price. Not shown to user — used only to compute Value Index.
- **Value Index (0–100):** Normalizes APD within broad category (all wine_* + sake = "wine", beer = "beer"). Best value in group = 100, worst = 0. Ranked separately per group so wines don't compete against beers. Only shown on beer/other cards — wines use critic score instead.
- **Markup:** `bottle_price / retail_price`. Falls back to `glass_price / retail_price` when no bottle price listed.
- **Pour price from bottle:** `bottle_price / (750 / pour_ml)`

## Wine quality fields (returned by research call, not calculated)
- **critic_score:** Estimated 0–100 score on the Wine Spectator / Wine Advocate scale, based on producer reputation, region, and vintage. Wine/sake only; null for beer/other.
- **quality_tier:** One of `Entry`, `Mid`, `Premium`, or `Iconic` based on producer and appellation prestige. Wine/sake only; null for beer/other.
- Wine/sake cards show a "Critic Score" block (critic_score + quality_tier badge) instead of the Value Index block. Beer/other cards still show Value Index.

## Pour size
Extraction prompt asks Claude to read the actual pour size off the menu (e.g. 500ml, 330ml) and store it as `pour_ml`. Server locks in this value and only falls back to Claude's standard if nothing was listed on the menu.

## Standard pour fallbacks
| Category | ml | oz |
|---|---|---|
| Wine / sake | 148 | 5 |
| Beer | 355 | 12 |

## Supported categories
`wine_red`, `wine_white`, `wine_rose`, `wine_sparkling`, `sake`, `beer`, `other`
Cocktails and spirits are intentionally excluded. Anything else falls into `other`.

## Models used
Both calls use `claude-haiku-4-5-20251001` for speed and cost. To improve accuracy, swap to `claude-sonnet-4-6` — costs ~5–10x more per menu.

## Token limits
- Extraction call: `max_tokens: 16384` — large menus (35+ drinks) were hitting 8192 and truncating mid-JSON
- Research call: `max_tokens: 16192`

## Cost estimate (Haiku)
- ~$0.04–0.05 per 35-drink menu
- ~$0.02 per 8-drink menu
- $5 of credits ≈ 100–150 analyses

## Frontend notes
- Single `index.html` — no build step, no framework
- Uses `AbortController` to cancel in-flight requests
- Results saved to `localStorage` under key `menuAnalyzer_results` and restored on next visit
- SSE (server-sent events) used for streaming progress from server to client
- Category filter pills and sort dropdown both call `renderCards()` which re-filters/sorts `allDrinks` in memory — no re-fetching

## Dark mode
- Toggle button (☾/☀) appears top-right on both the upload screen and results header
- Sets `data-theme="dark"` or `data-theme="light"` on `<html>`, which overrides the `@media (prefers-color-scheme)` media query via higher-specificity CSS selectors
- Preference saved to `localStorage` key `theme` and restored on next visit; defaults to system preference if no saved value
- Tag colors (wine_red, beer, etc.) have explicit `[data-theme="dark"]` and `[data-theme="light"]` overrides in addition to the media query versions

## Category filters
- Top-level pills: **All · Wine · Sake · Beer · Other** — only categories present in the scanned menu appear
- All `wine_*` subtypes are grouped under a single **Wine** pill
- Selecting Wine reveals a second sub-filter row (indented with a left border): **All · Red · White · Rosé · Sparkling** — again only subtypes present in data
- State: `currentCat` holds the top-level selection; `currentWineType` holds the wine subtype ('all' | 'wine_red' | 'wine_white' | 'wine_rose' | 'wine_sparkling')
- Switching away from Wine hides the sub-row and resets `currentWineType` to 'all'
- `getFiltered()` applies both levels; `renderCards()` is the single render path for all filter/sort combinations
- Clicking the **All** pill resets the sort dropdown to "Default order" (menu order) so drinks appear top-to-bottom as listed on the menu

## Share feature
- **Share button** appears in the results header (green-tinted, next to "New menu")
- On click: POSTs `{ drinks, venue }` to `POST /share` → server saves to SQLite/Turso → returns a full URL like `http://host/r/a1b2c3d4` → copied to clipboard → "Link copied!" toast shown
- `GET /r/:id` serves `index.html`; the JS detects the `/r/` path, fetches from `GET /share-data/:id`, and renders results in read-only mode (Share button hidden, "New menu" becomes "Analyze your own" linking back to `/`)
- Links expire after 30 days; expired rows are purged on each new share creation
- Share IDs are 8-char hex strings (`crypto.randomBytes(4).toString('hex')`)
- Share links use the request host, so they work correctly whether running locally or deployed

## Share storage — local vs production
- **Local dev:** uses a local SQLite file (`shares.db`, gitignored) via `@libsql/client` with `file:` URL — no credentials needed
- **Production (Turso):** set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` env vars; the same `@libsql/client` package connects to the hosted DB automatically
- Table is created on server startup (`CREATE TABLE IF NOT EXISTS`) — no manual migration needed
- `shares.db` is gitignored; do not commit it

## Multi-page upload
- Up to 10 photos per analysis (e.g. a menu spread across multiple pages)
- Each image runs through extraction (Step 1) separately in a loop; all drinks are concatenated before the single research call (Step 2)
- Progress shows "Reading menu (page 1 of 3)..." etc. when more than one image is uploaded
- Frontend: thumbnail strip replaces the single-image preview. Files are held in `selectedFiles[]`. "Add another page" button triggers the file input; each thumbnail has an ✕ to remove it
- `upload.array('menu', 10)` on the server; FormData appends each file under the same `'menu'` key

## Research index matching
- Research results are matched to drinks **by name**, not by array index
- The research prompt asks Claude to include `"name"` in each response object; server builds a `researchMap` keyed on name
- This prevents off-by-one mismatches when Claude reorders or skips items in longer menus

## Price stripping before research call
- `glass_price` and `bottle_price` are stripped from drink objects before sending to the research call
- Without this, Claude anchors its `retail_price` estimate on the menu price, producing ~1.0x markup for almost all wines
- Prices are preserved on the original `drinks` array for the derived calculations after research returns

## Deployment (Railway + Turso)
- **Live URL:** drink-menu-analyzer-production.up.railway.app
- Turso DB: `menu-analyzer-shares` on `aws-us-west-2`
- Credentials set as Railway env vars: `ANTHROPIC_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- Turso CLI install fails on Windows — use the Turso web dashboard to create the DB and generate tokens instead
- Railway deploys automatically on every push to `master`; no build step needed

## Beer retail price and markup
- The research prompt asks Claude to return `retail_price` for beer as the single-unit retail cost (typical 6-pack price ÷ 6), not a bottle price
- Markup for beers is calculated as `glass_price / retail_price` (bar price vs store price) since beers don't have a menu bottle price
- The "Bottle" pill on beer cards shows "Retail / per unit" instead of being blank

## Price extraction prompt
- Extraction prompt leads with a bolded IMPORTANT block reminding Claude that prices are often in a column to the right of the drink name — look at the full row
- Single unlabeled price → `glass_price`; two prices → smaller is glass, larger is bottle; labeled columns → follow headers
- "null only if truly no price is shown" — pushes Claude harder than "or null if no price listed"

## Known gotcha: Railway reverse proxy and https
`app.set('trust proxy', 1)` is required in server.js. Without it, `req.protocol` returns `http` internally even though Railway serves the app over `https`, causing share links to be generated with the wrong protocol.

## Known gotcha: prices without currency symbols
The extraction prompt explicitly tells Claude to extract the numeric price value regardless of whether a `$` or other currency symbol appears on the menu. Without this, Claude may return `null` for prices on menus that omit the symbol.

## Known gotcha: clipboard API on mobile
`navigator.clipboard.writeText()` can throw on some mobile browsers. The share button wraps it in a try/catch — on failure it falls back to `prompt('Copy your share link:', url)` so the user can still copy the URL manually.

## Known gotcha: Claude wraps JSON in markdown fences
Haiku sometimes returns ` ```json ... ``` ` instead of plain JSON even when told not to.
The parser strips fences with: `.replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/,'')`
Both extraction and research responses need this treatment.

## Future features

### Make it more useful per drink
- "Order this if you like X" — more personalized than the generic simple_comparison field

### Make it more useful for the overall menu
- "Best bottle to split" recommendation — surface one pick at the top of results

### Better UX
- Side-by-side comparison of two drinks
- Screenshot-friendly shareable card (image export)

### Monetization
- Somm mode — deeper tasting notes, producer background, terroir info (uses Sonnet, charges more)

## Image compression
- Claude API rejects base64 images over 5 MB (`5,242,880 bytes`)
- `compressForClaude(buffer)` in server.js auto-compresses any image that exceeds ~3.75 MB raw (the raw size that encodes to 5 MB base64)
- Uses `sharp`: resizes to max 2048×2048 (preserving aspect ratio) and recompresses as JPEG starting at 85% quality, stepping down by 15% each pass until under the limit
- Converts all compressed images to `image/jpeg` regardless of original format
- Images already under the limit pass through untouched

## Key things to avoid
- Do not split research into per-drink API calls — the single-batch approach was an intentional optimization
- Do not add a `public/` folder and move `index.html` there without also updating the static path in `server.js`
- Do not commit `.env` or `shares.db`
- Do not lower max_tokens below 16384 for extraction — large menus truncate mid-JSON and fail silently
- Do not revert share storage back to the filesystem — Railway and most cloud hosts have ephemeral disks that wipe on redeploy
