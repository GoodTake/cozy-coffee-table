// The hero illustration: a café table by the window, drawn in SVG.
export function CoffeeArt() {
  return (
    <svg className="hero-art" viewBox="0 0 480 420" role="img" aria-label="Two cups of coffee and a croissant on a café table by the window">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6d9b4" />
          <stop offset="1" stopColor="#f9e9d4" />
        </linearGradient>
        <linearGradient id="tabletop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8683d" />
          <stop offset="1" stopColor="#8a5130" />
        </linearGradient>
      </defs>

      {/* Window */}
      <rect x="70" y="20" width="340" height="230" rx="120" fill="url(#sky)" />
      <circle cx="320" cy="96" r="34" fill="#f3b878" opacity="0.8" />
      <path d="M70 200 q60 -40 120 -10 t120 -6 t100 4 v62 H70z" fill="#d7b48c" opacity="0.55" />
      <path d="M240 20 v230 M70 140 h340" stroke="#fbf5ec" strokeWidth="8" />
      <rect x="70" y="20" width="340" height="230" rx="120" fill="none" stroke="#5a3a28" strokeWidth="10" />

      {/* Plant */}
      <g transform="translate(92 168)">
        <path d="M24 34 q-30 -40 -6 -70 q10 30 6 70z" fill="#7d8f69" />
        <path d="M26 34 q20 -46 44 -54 q-6 36 -44 54z" fill="#93a67d" />
        <path d="M22 34 q-36 -10 -44 -36 q30 0 44 36z" fill="#6a7c58" />
        <path d="M0 34 h50 l-6 40 h-38z" fill="#c7793f" />
      </g>

      {/* Table */}
      <ellipse cx="240" cy="300" rx="215" ry="52" fill="url(#tabletop)" />
      <ellipse cx="240" cy="292" rx="215" ry="48" fill="#b8784a" />
      <rect x="226" y="330" width="28" height="80" fill="#5a3a28" />
      <ellipse cx="240" cy="410" rx="70" ry="10" fill="#5a3a28" />

      {/* Saucer and latte */}
      <g transform="translate(170 250)">
        <ellipse cx="0" cy="38" rx="62" ry="14" fill="#fbf5ec" />
        <path d="M-40 -10 h80 l-8 44 q-32 12 -64 0z" fill="#fbf5ec" />
        <path d="M38 0 q22 2 20 18 q-2 14 -26 14" fill="none" stroke="#fbf5ec" strokeWidth="7" />
        <ellipse cx="0" cy="-10" rx="40" ry="9" fill="#c99668" />
        <path d="M-8 -12 q8 -8 16 0 q-8 6 -16 0z" fill="#fbf5ec" />
        <g fill="none" stroke="#fbf5ec" strokeWidth="4" strokeLinecap="round" opacity="0.9">
          <path className="steam" d="M-14 -28 c-8 -12 8 -18 0 -32" />
          <path className="steam steam-2" d="M6 -30 c-8 -12 8 -18 0 -32" />
        </g>
      </g>

      {/* Espresso cup */}
      <g transform="translate(300 266)">
        <ellipse cx="0" cy="26" rx="40" ry="9" fill="#fbf5ec" />
        <path d="M-24 -6 h48 l-6 30 q-18 8 -36 0z" fill="#2e1f17" />
        <path d="M23 2 q14 1 12 11 q-1 9 -16 9" fill="none" stroke="#2e1f17" strokeWidth="5" />
        <ellipse cx="0" cy="-6" rx="24" ry="5" fill="#6b3f22" />
      </g>

      {/* Croissant */}
      <g transform="translate(372 294) rotate(-12)">
        <path d="M-34 6 q34 -40 68 0 q-34 16 -68 0z" fill="#e3a65c" />
        <path d="M-18 -6 q4 12 0 18 M0 -14 q4 14 0 22 M18 -6 q-4 12 0 18" fill="none" stroke="#b5702f" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}
