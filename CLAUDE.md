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
└── .env           ← API key (never commit)
```

No `public/` folder — `index.html` is served from the project root via `express.static(__dirname)`.

## How the analysis works (two API calls total)

**Call 1 — Extraction (vision):** Sends the menu image to Haiku. Returns a JSON object with `venue` (restaurant name or null) and `drinks` (array of every item with name, category, price, region, etc.).

**Call 2 — Research (text):** Sends all drinks in one batch. Returns a JSON array (same index order) with ABV, calories, flavor profile, food pairings, simple comparison, and pour_ml (used as fallback if not extracted from menu).

## Derived calculations (done in server.js, not by Claude)
- **APD (internal):** `(abv/100 × pour_ml) / pour_price`. Prefers bottle price; falls back to glass price. Not shown to user — used only to compute Value Index.
- **Value Index (0–100):** Normalizes APD within broad category (all wine_* + sake = "wine", beer = "beer"). Best value in group = 100, worst = 0. Ranked separately per group so wines don't compete against beers.
- **Markup:** `bottle_price / retail_price`
- **Pour price from bottle:** `bottle_price / (750 / pour_ml)`

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
- Share results as a link or screenshot-friendly card
- Side-by-side comparison of two drinks
- Add a dark mode with white text

### Monetization
- Somm mode — deeper tasting notes, producer background, terroir info (uses Sonnet, charges more)

## Key things to avoid
- Do not split research into per-drink API calls — the single-batch approach was an intentional optimization
- Do not add a `public/` folder and move `index.html` there without also updating the static path in `server.js`
- Do not commit `.env`
- Do not lower max_tokens below 16384 for extraction — large menus truncate mid-JSON and fail silently
