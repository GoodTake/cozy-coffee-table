// Everything the café serves, in one place. Prices are in pence.

export const SHOP_NAME = 'The Cozy Coffee Table';
export const SHOP_TIME_ZONE = 'Europe/London';

export const menu = {
  drinks: [
    { id: 'espresso', name: 'Espresso', description: 'Our house blend, short and syrupy.', price: 240 },
    { id: 'cortado', name: 'Cortado', description: 'Equal parts espresso and silky milk.', price: 310 },
    { id: 'flat-white', name: 'Flat white', description: 'Double ristretto, velvet microfoam.', price: 340 },
    { id: 'oat-latte', name: 'Oat latte', description: 'Mellow, nutty and very easy to love.', price: 370 },
    { id: 'chai-latte', name: 'Chai latte', description: 'Spiced in-house with cardamom and clove.', price: 360 },
    { id: 'hot-chocolate', name: 'Hot chocolate', description: '70% dark chocolate, a pinch of sea salt.', price: 350 },
    { id: 'cold-brew', name: 'Cold brew', description: 'Steeped for 18 hours, served over ice.', price: 380 },
  ],
  pastries: [
    { id: 'butter-croissant', name: 'Butter croissant', description: 'Laminated by hand every morning.', price: 280 },
    { id: 'almond-croissant', name: 'Almond croissant', description: 'Twice-baked with frangipane.', price: 340 },
    { id: 'cardamom-bun', name: 'Cardamom bun', description: 'Swedish-style knot, pearl sugar on top.', price: 340 },
    { id: 'banana-bread', name: 'Banana bread', description: 'Toasted, with salted honey butter.', price: 320 },
    { id: 'lemon-drizzle', name: 'Lemon drizzle slice', description: 'Sharp, sticky, gone by noon.', price: 310 },
    { id: 'cheese-scone', name: 'Cheese & chive scone', description: 'Mature cheddar, warm from the oven.', price: 330 },
  ],
};

export const baristaNotes = [
  { note: 'The Ethiopian Guji is tasting of blueberries this week. Ask for it as a pour-over.', barista: 'Maya' },
  { note: 'Rainy mornings call for a cardamom bun and the corner seat by the window.', barista: 'Theo' },
  { note: 'Try your flat white with oat milk today. Our new batch steams beautifully.', barista: 'Priya' },
  { note: 'Cold brew is back on tap. It is smooth enough to drink without milk.', barista: 'Sam' },
  { note: 'If you have never had a cortado, today is the day. Small cup, big comfort.', barista: 'Maya' },
  { note: 'The almond croissants come out at ten. Set an alarm, they go fast.', barista: 'Theo' },
  { note: 'Our chai is brewed from whole spices every morning. Ask for an extra shot to make it dirty.', barista: 'Priya' },
  { note: 'Bring a book, order a pot of filter coffee, and stay as long as you like.', barista: 'Sam' },
];

// One special for each day of the week, Sunday first.
const specials = [
  { name: 'Maple pecan latte', description: 'Espresso, steamed milk and a spoon of real maple syrup, topped with toasted pecans.', price: 420, kind: 'drink', cup: '#f4e3cc', accent: '#b5652c' },
  { name: 'Cinnamon morning bun', description: 'A flaky spiral of croissant dough rolled in orange sugar and cinnamon.', price: 360, kind: 'pastry', cup: '#e9b872', accent: '#8a4b23' },
  { name: 'Honey lavender cortado', description: 'Local wildflower honey and a hint of lavender in a short, sweet cortado.', price: 380, kind: 'drink', cup: '#efe1f0', accent: '#7b5b8f' },
  { name: 'Pistachio cream croissant', description: 'Our butter croissant filled with pistachio cream and dusted with crushed nuts.', price: 390, kind: 'pastry', cup: '#d9c27d', accent: '#5f7f3a' },
  { name: 'Iced brown sugar shaken espresso', description: 'Two shots shaken with brown sugar syrup and topped with oat milk.', price: 410, kind: 'drink', cup: '#e8d2b5', accent: '#6b3f22' },
  { name: 'Raspberry almond tart', description: 'Frangipane, fresh raspberries and a crisp shortcrust base.', price: 400, kind: 'pastry', cup: '#e7a3a0', accent: '#a23b48' },
  { name: 'Spiced orange mocha', description: 'Dark chocolate, espresso and orange zest with a dusting of nutmeg.', price: 430, kind: 'drink', cup: '#f2d7b8', accent: '#c4612a' },
];

export function todaysDate(now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return now.toLocaleDateString('en-CA', { timeZone: SHOP_TIME_ZONE });
}

export function todaysSpecial(now = new Date()) {
  const weekday = new Date(`${todaysDate(now)}T12:00:00Z`).getUTCDay();
  return specials[weekday];
}

// Table slots: every half hour from 08:00 to 17:00.
export const bookingTimes = Array.from({ length: 19 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

function escapeXml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

function drinkArt({ cup, accent }) {
  return `
    <g transform="translate(300 215)">
      <ellipse cx="0" cy="118" rx="170" ry="22" fill="#000" opacity="0.08"/>
      <ellipse cx="0" cy="104" rx="150" ry="26" fill="#fffaf2"/>
      <ellipse cx="0" cy="100" rx="118" ry="17" fill="#efe4d3"/>
      <path d="M-105 -40 L105 -40 L88 78 Q0 112 -88 78 Z" fill="${cup}"/>
      <path d="M100 -12 q58 2 52 46 q-6 40 -66 38" fill="none" stroke="${cup}" stroke-width="18" stroke-linecap="round"/>
      <ellipse cx="0" cy="-40" rx="105" ry="24" fill="#fffaf2"/>
      <ellipse cx="0" cy="-38" rx="92" ry="18" fill="${accent}"/>
      <path d="M0 -24 c-10 -14 -34 -10 -30 6 c4 14 30 22 30 30 c0 -8 26 -16 30 -30 c4 -16 -20 -20 -30 -6 z" fill="#fff6e8" opacity="0.92" transform="translate(0 -14) scale(0.7)"/>
      <g fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round" opacity="0.45">
        <path d="M-40 -88 c-14 -20 14 -34 0 -58"/>
        <path d="M0 -94 c-14 -20 14 -34 0 -58"/>
        <path d="M40 -88 c-14 -20 14 -34 0 -58"/>
      </g>
    </g>`;
}

function pastryArt({ cup, accent }) {
  return `
    <g transform="translate(300 230)">
      <ellipse cx="0" cy="96" rx="190" ry="24" fill="#000" opacity="0.08"/>
      <ellipse cx="0" cy="84" rx="172" ry="30" fill="#fffaf2"/>
      <ellipse cx="0" cy="80" rx="138" ry="20" fill="#efe4d3"/>
      <path d="M-150 40 Q-120 -70 0 -82 Q120 -70 150 40 Q80 74 0 70 Q-80 74 -150 40 Z" fill="${cup}"/>
      <g fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round" opacity="0.55">
        <path d="M-92 46 Q-70 -30 -30 -66"/>
        <path d="M-30 62 Q-14 -10 10 -78"/>
        <path d="M40 60 Q52 -6 66 -64"/>
        <path d="M104 40 Q112 0 118 -30"/>
      </g>
      <g fill="#fff6e8" opacity="0.85">
        <circle cx="-60" cy="-20" r="6"/><circle cx="-6" cy="-40" r="5"/><circle cx="48" cy="-14" r="6"/>
        <circle cx="90" cy="-36" r="4"/><circle cx="-110" cy="10" r="4"/><circle cx="20" cy="20" r="5"/>
      </g>
    </g>`;
}

export function renderSpecialSvg(special) {
  const art = special.kind === 'drink' ? drinkArt(special) : pastryArt(special);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" role="img" aria-label="${escapeXml(special.name)}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="#fff4e2"/>
      <stop offset="100%" stop-color="#f1dcc0"/>
    </radialGradient>
    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.6" fill="${special.accent}" opacity="0.14"/>
    </pattern>
  </defs>
  <rect width="600" height="400" fill="url(#glow)"/>
  <rect width="600" height="400" fill="url(#dots)"/>
  <circle cx="300" cy="200" r="150" fill="${special.accent}" opacity="0.10"/>
  ${art}
</svg>
`;
}
