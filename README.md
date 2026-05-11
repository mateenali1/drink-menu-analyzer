# Menu Analyzer

Photograph any drink menu. Get instant analysis — ABV, value, calories, food pairings, and alcohol-per-dollar rankings.

---

## What you need

- [Node.js](https://nodejs.org) v18 or higher
- An Anthropic API key → get one at https://console.anthropic.com/settings/keys
- [Claude Code](https://claude.ai/code) (optional but recommended for setup)

---

## Setup in Claude Code

Open this project folder in Claude Code and run these commands one by one.

### 1. Install dependencies
```
npm install
```

### 2. Create your environment file
```
cp .env.example .env
```
Then open `.env` and replace `your_api_key_here` with your actual Anthropic API key.

### 3. Start the server
```
npm start
```
You should see:
```
🍶 Menu Analyzer running at http://localhost:3000
```

### 4. Open in your browser
Go to http://localhost:3000

---

## Using the app

1. Tap **"tap to photograph"** to take a photo or upload an image of a drink menu
2. Tap **Analyze Menu**
3. Wait ~30–60 seconds while Claude reads the menu and researches each drink
4. Browse your results — filter by drink type, sort by value, calories, or ABV

---

## How the analysis works

**Extraction:** Claude reads the menu photo and pulls out every drink — name, producer, price, category, and any printed tasting notes.

**Research:** For each drink, Claude uses its training knowledge to find:
- ABV
- Estimated US retail price (for markup calculation)
- Calories per standard pour
- Flavor profile
- Food pairings
- Simple everyday comparison

**Calculations:**
- **Alcohol per $1** = (ABV% × pour volume in ml) ÷ pour price. Higher = more alcohol per dollar at restaurant prices.
- **Markup** = bottle price ÷ estimated retail price. Green ≤2x, amber 2–2.5x, red >2.5x.
- **Calories** = estimated per standard pour (5oz for wine/sake, 12oz for beer, 1.5oz for spirits)

---

## Deploying so you can use it anywhere (on your phone away from home)

The easiest free option is **Railway**:

1. Push this folder to a GitHub repo
2. Go to https://railway.app and create a free account
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repo
5. Go to Variables and add: `ANTHROPIC_API_KEY` = your key
6. Railway gives you a public URL like `https://menu-analyzer-production.up.railway.app`
7. Save that URL to your phone's home screen as a web app

Other free options: **Render** (https://render.com) or **Fly.io** (https://fly.io) — same process.

---

## Folder structure

```
menu-analyzer/
├── server.js          ← Express server + Claude API calls
├── public/
│   └── index.html     ← Full frontend (upload + results UI)
├── package.json
├── .env.example       ← Copy to .env and add your API key
├── .env               ← Your actual key (never commit this)
└── .gitignore
```

---

## Customizing

**Change the analysis prompt:** Edit the research prompt in `server.js` around line 80. You can ask Claude to include different fields, change the tone of comparisons, or add new calculations.

**Change the UI:** All styles and card layout are in `public/index.html`. The design tokens (colors, fonts) are CSS variables at the top of the `<style>` block.

**Add new sort options:** Add an `<option>` to the `#sorter` select in `index.html`, then add a matching case in the `getSorted()` function.

---

## Cost estimate

Each menu analysis uses approximately:
- 1 Claude API call to read the menu image (~2,000 input tokens)
- 1 API call per drink to research it (~280 input / 300 output tokens each)

Using **Haiku 4.5** ($1/$5 per million tokens):
- A 20-drink menu costs roughly **~$0.04**
- A small 8-drink menu costs roughly **~$0.02**
- You get approximately **24 menus per $1** of API spend
