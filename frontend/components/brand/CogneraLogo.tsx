export function CogneraMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-label="Cognera" className={className}>
      <path d="M26 9A12 12 0 1 0 26 23" stroke="#F17300" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M22 12.5A7 7 0 1 0 22 19.5" stroke="#F17300" strokeWidth="1.75"
        strokeLinecap="round" opacity="0.4"/>
      <circle cx="26" cy="16" r="2.25" fill="#F17300"/>
    </svg>
  );
}

export function CogneraWordmark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`} aria-label="Cognera">
      <CogneraMark size={size} />
      <span style={{
        fontFamily: "var(--font-display)", fontSize: size * 0.62,
        fontWeight: 700, letterSpacing: "-0.03em",
        color: "var(--t1)", lineHeight: 1,
      }}>
        Cognera
      </span>
    </span>
  );
}
