export function CupMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill="var(--caramel)" />
      <path d="M13 21h18v6a9 9 0 0 1-9 9 9 9 0 0 1-9-9z" fill="var(--cream)" />
      <path d="M31 23h2.5a3.5 3.5 0 0 1 0 7H30" fill="none" stroke="var(--cream)" strokeWidth="2.4" />
      <path d="M11 38h24" stroke="var(--cream)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M19 17c-1.5-2 1.5-3 0-5M24 17c-1.5-2 1.5-3 0-5M29 17c-1.5-2 1.5-3 0-5" fill="none" stroke="var(--cream)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
