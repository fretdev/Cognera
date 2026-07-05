/**
 * Cognera logo system.
 *
 * The mark: two concentric arcs forming a stylised "C" with a small dot
 * at the opening — suggesting an eye, a focus point, or a thought being
 * completed. Clean at 16px, distinctive at 200px.
 *
 * The wordmark: mark + "Cognera" in Plus Jakarta Sans, display weight.
 * Never use the wordmark at sizes below 20px — use the mark alone.
 */

export function CogneraMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Cognera"
      className={className}
    >
      {/* Outer arc — the "C" */}
      <path
        d="M26 9.5A12 12 0 1 0 26 22.5"
        stroke="#6C6AF6"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Inner arc — depth / secondary layer */}
      <path
        d="M22 12.5A7 7 0 1 0 22 19.5"
        stroke="#6C6AF6"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Focal dot — the focus point */}
      <circle cx="26" cy="16" r="2" fill="#6C6AF6" />
    </svg>
  );
}

export function CogneraWordmark({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
      aria-label="Cognera"
    >
      <CogneraMark size={size} />
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: size * 0.65,
          fontWeight: 600,
          letterSpacing: "-0.025em",
          color: "var(--text-1)",
          lineHeight: 1,
        }}
      >
        Cognera
      </span>
    </span>
  );
}
