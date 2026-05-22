const sharp = require('sharp');
const path  = require('path');

const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="1200" height="630" fill="#0e0e0e"/>

  <!-- Right-side concentric circles decoration -->
  <circle cx="1080" cy="315" r="360" fill="#131313"/>
  <circle cx="1080" cy="315" r="260" fill="#171717"/>
  <circle cx="1080" cy="315" r="160" fill="#1b1b1b"/>

  <!-- Left green accent bar -->
  <rect x="0" y="0" width="7" height="630" fill="#3a8c5e"/>

  <!-- Eyebrow label -->
  <text x="84" y="210"
    font-family="'Courier New', Courier, monospace"
    font-size="18"
    fill="#3a8c5e"
    letter-spacing="4">DRINK MENU ANALYZER</text>

  <!-- Main title -->
  <text x="80" y="316"
    font-family="'Courier New', Courier, monospace"
    font-size="96"
    font-weight="700"
    fill="#f0ebe0"
    letter-spacing="-4">drink guide</text>

  <!-- Tagline -->
  <text x="84" y="374"
    font-family="'Courier New', Courier, monospace"
    font-size="24"
    fill="#555555"
    letter-spacing="2">scan any menu  ·  know every drink</text>

  <!-- Feature pill: ABV -->
  <rect x="84" y="424" width="88" height="32" rx="5" fill="#1a2d1a"/>
  <text x="128" y="445"
    font-family="'Courier New', Courier, monospace"
    font-size="13" fill="#3a8c5e" text-anchor="middle" letter-spacing="1">ABV</text>

  <!-- Feature pill: Calories -->
  <rect x="182" y="424" width="116" height="32" rx="5" fill="#1a2d1a"/>
  <text x="240" y="445"
    font-family="'Courier New', Courier, monospace"
    font-size="13" fill="#3a8c5e" text-anchor="middle" letter-spacing="1">CALORIES</text>

  <!-- Feature pill: Markup -->
  <rect x="308" y="424" width="112" height="32" rx="5" fill="#1a2d1a"/>
  <text x="364" y="445"
    font-family="'Courier New', Courier, monospace"
    font-size="13" fill="#3a8c5e" text-anchor="middle" letter-spacing="1">MARKUP</text>

  <!-- Feature pill: Critic Score -->
  <rect x="430" y="424" width="158" height="32" rx="5" fill="#1a2d1a"/>
  <text x="509" y="445"
    font-family="'Courier New', Courier, monospace"
    font-size="13" fill="#3a8c5e" text-anchor="middle" letter-spacing="1">CRITIC SCORE</text>

  <!-- Feature pill: Pairings -->
  <rect x="598" y="424" width="116" height="32" rx="5" fill="#1a2d1a"/>
  <text x="656" y="445"
    font-family="'Courier New', Courier, monospace"
    font-size="13" fill="#3a8c5e" text-anchor="middle" letter-spacing="1">PAIRINGS</text>

  <!-- Bottom green accent line -->
  <rect x="0" y="616" width="1200" height="14" fill="#3a8c5e" opacity="0.3"/>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile(path.join(__dirname, 'og-image.png'))
  .then(() => console.log('✓ og-image.png generated'))
  .catch(err => { console.error('Failed:', err); process.exit(1); });
