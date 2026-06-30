/**
 * Brand mark for Cognera: a minimal geometric icon (overlapping circle +
 * triangle, suggesting focus/insight) paired with the wordmark. Built as
 * inline SVG (not an image file) so the gradient is crisp at any size and
 * needs no extra network request.
 */

export function CogneraMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Cognera"
    >
      <defs>
        <linearGradient id="cognera-gradient" x1="0" y1="0" x2="28" y2="28">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="55%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <circle cx="14" cy="14" r="13" stroke="url(#cognera-gradient)" strokeWidth="2" />
      <path d="M14 7L19.5 17H8.5L14 7Z" fill="url(#cognera-gradient)" />
    </svg>
  );
}

export function CogneraWordmark({
  iconSize = 28,
  className = "",
}: {
  iconSize?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <CogneraMark size={iconSize} />
      <span className="whitespace-nowrap text-base font-medium tracking-tight text-ink">
        Cognera
      </span>
    </div>
  );
}
