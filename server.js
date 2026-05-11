require('dotenv').config();
const express            = require('express');
const multer             = require('multer');
const Anthropic          = require('@anthropic-ai/sdk');
const path               = require('path');
const crypto             = require('crypto');
const { createClient }   = require('@libsql/client');

const SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Local dev uses a SQLite file; production uses Turso via env vars
const db = createClient({
  url:       process.env.TURSO_DATABASE_URL || 'file:shares.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const app    = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  }
});

app.use(express.static(__dirname));
app.use(express.json());

// ─── Main analysis endpoint ───────────────────────────────────────────────────
app.post('/analyze', upload.single('menu'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const imageBase64    = req.file.buffer.toString('base64');
  const imageMediaType = req.file.mimetype;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send('status', { message: 'Reading menu...' });

    // ── Step 1: Extract every drink + venue name from the photo ──────────────
    const extractionResponse = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16384,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: imageMediaType, data: imageBase64 }
          },
          {
            type: 'text',
            text: `You are analyzing a drink menu photo. Extract every drink listed, and identify the restaurant or venue name if visible.

Return a JSON object with two fields:
- "venue": the restaurant or bar name as a string, or null if not visible
- "drinks": an array of drink objects

Each drink object must have:
- name: full name as written on menu
- producer: brand/producer name if visible
- vintage: year if listed, else null
- category: one of [wine_red, wine_white, wine_rose, wine_sparkling, sake, beer, other]
- subcategory: more specific type (e.g. "Junmai Daiginjo", "Single Malt Scotch", "Cabernet Sauvignon", "IPA") or null
- region: region/country/prefecture if listed, else null
- glass_price: price per glass in dollars as number, or null
- bottle_price: price per bottle in dollars as number, or null
- pour_ml: pour size in ml if explicitly stated on the menu (e.g. 500, 330), or null if not listed
- notes: any tasting notes or descriptions printed on the menu, or null

Return ONLY a valid JSON object, no markdown, no explanation.`
          }
        ]
      }]
    });

    let venue, drinks;
    try {
      const rawDebug = extractionResponse.content[0].text;
      const raw  = rawDebug.trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/,'');
      const parsed = JSON.parse(raw);
      venue  = parsed.venue  || null;
      drinks = parsed.drinks;
    } catch (e) {
      // Fallback: try to find a JSON object or bare array
      const text = extractionResponse.content[0].text;
      require('fs').writeFileSync(require('path').join(__dirname, 'debug_response.txt'), `PARSE ERROR: ${e.message}\n\nRAW TEXT:\n${text}`);
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          const parsed = JSON.parse(objMatch[0]);
          venue  = parsed.venue  || null;
          drinks = parsed.drinks;
        } catch (_) { /* fall through */ }
      }
      if (!drinks) {
        const arrMatch = text.match(/\[[\s\S]*\]/);
        if (arrMatch) { drinks = JSON.parse(arrMatch[0]); venue = null; }
        else throw new Error('Could not parse drink list from menu');
      }
    }

    send('status', { message: `Found ${drinks.length} drinks. Researching...` });
    send('count',  { total: drinks.length });

    // ── Step 2: Research ALL drinks in a single API call ─────────────────────
    send('status', { message: 'Researching all drinks...' });

    const researchResponse = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16192,
      messages: [{
        role: 'user',
        content: `Research these drinks and return a JSON array. Use your training knowledge — do not say you cannot look things up.

Drinks to research:
${JSON.stringify(drinks, null, 2)}

Return a JSON array where each element corresponds to the drink at the same index. Each object must have:
- abv: alcohol by volume as a number (e.g. 13.5), use best estimate for the specific producer/style
- abv_level: "low" if abv < 13, "mid" if 13–16, "high" if > 16
- retail_price: estimated US retail price for a standard bottle in dollars, or null if unknown
- calories_per_pour: estimated calories for a standard pour (5oz wine/sake, 12oz beer, 1.5oz spirits, 4oz cocktail), as integer
- flavor_profile: 1–2 sentence description of taste, aroma, and texture
- simple_comparison: 10–15 words starting with "Like a ..." comparing to something most people know
- food_pairings: array of exactly 4 short food pairing strings (e.g. "Grilled salmon", "Aged cheddar")
- tag_class: one of: tag-red, tag-white, tag-rose, tag-sparkling, tag-sake, tag-beer, tag-other
- pour_ml: use the pour_ml already in the drink object if present, otherwise use the standard (148 for wine/sake, 355 for beer)

Return ONLY a valid JSON array, no markdown, no explanation.`
      }]
    });

    let researchData;
    try {
      const raw = researchResponse.content[0].text.trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/,'');
      researchData = JSON.parse(raw.match(/\[[\s\S]*\]/)[0]);
    } catch (e) {
      researchData = drinks.map(() => ({
        abv: null, flavor_profile: 'Information unavailable', food_pairings: [],
        simple_comparison: null, base_spirits: null
      }));
    }

    const enriched = drinks.map((drink, i) => {
      const research = researchData[i] || { abv: null, flavor_profile: 'Information unavailable', food_pairings: [], simple_comparison: null };
      return {
        ...drink,
        ...research,
        // Keep the pour_ml extracted from the menu if present; only fall back to Claude's standard
        pour_ml: drink.pour_ml || research.pour_ml
      };
    });

    send('progress', { done: drinks.length, total: drinks.length });

    // ── Step 3: Compute derived fields ──────────────────────────────────────
    const BOTTLE_ML = 750;

    const withCalcs = enriched.map(d => {
      const pour_ml      = d.pour_ml || 148;
      const bottle_price = d.bottle_price;
      const glass_price  = d.glass_price;
      const retail       = d.retail_price;
      const abv          = d.abv;

      let pour_price = null;
      let apd        = null;
      let apd_source = null;
      let markup     = null;

      if (bottle_price && pour_ml) {
        pour_price = bottle_price / (BOTTLE_ML / pour_ml);
        if (abv) { apd = (abv / 100 * pour_ml) / pour_price; apd_source = 'bottle'; }
      } else if (glass_price && abv) {
        // Fall back to glass price when no bottle price is listed
        pour_price = glass_price;
        apd        = (abv / 100 * pour_ml) / glass_price;
        apd_source = 'glass';
      }

      if (bottle_price && retail) markup = bottle_price / retail;

      return { ...d, pour_price, apd, apd_source, markup };
    });

    send('status',   { message: 'Building your menu guide...' });
    send('complete', { drinks: withCalcs, venue });

  } catch (err) {
    console.error(err);
    send('error', { message: err.message || 'Analysis failed' });
  } finally {
    res.end();
  }
});

// ─── Share endpoints ──────────────────────────────────────────────────────────
app.post('/share', async (req, res) => {
  const { drinks, venue } = req.body || {};
  if (!Array.isArray(drinks)) return res.status(400).json({ error: 'Invalid data' });

  try {
    await db.execute({
      sql:  'DELETE FROM shares WHERE created_at < ?',
      args: [Date.now() - SHARE_TTL_MS]
    });

    const id = crypto.randomBytes(4).toString('hex');
    await db.execute({
      sql:  'INSERT INTO shares (id, data, created_at) VALUES (?, ?, ?)',
      args: [id, JSON.stringify({ drinks, venue: venue || null }), Date.now()]
    });

    const base = `${req.protocol}://${req.get('host')}`;
    res.json({ id, url: `${base}/r/${id}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save share' });
  }
});

app.get('/share-data/:id', async (req, res) => {
  const id = req.params.id.replace(/[^a-f0-9]/gi, '');

  try {
    const result = await db.execute({
      sql:  'SELECT data, created_at FROM shares WHERE id = ?',
      args: [id]
    });

    if (!result.rows.length) return res.status(404).json({ error: 'Link not found or expired' });

    const row = result.rows[0];
    if (Date.now() - Number(row.created_at) > SHARE_TTL_MS) {
      await db.execute({ sql: 'DELETE FROM shares WHERE id = ?', args: [id] });
      return res.status(404).json({ error: 'Link not found or expired' });
    }

    res.json(JSON.parse(row.data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load share' });
  }
});

app.get('/r/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function init() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shares (
      id         TEXT    PRIMARY KEY,
      data       TEXT    NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  app.listen(PORT, () => {
    console.log(`\n🍶 Menu Analyzer running at http://localhost:${PORT}\n`);
  });
}

init().catch(err => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
