import { cn } from "@/lib/utils";

export function XntLogo({
  className,
  markOnly = false,
}: {
  className?: string;
  markOnly?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative grid h-10 w-10 place-items-center rounded-lg border border-primary/35 bg-primary/10 shadow-[0_0_28px_rgba(0,191,255,0.22)]">
        <svg viewBox="0 0 48 48" aria-hidden="true" className="h-8 w-8 overflow-visible">
          <defs>
            <linearGradient id="xnt-logo-gradient" x1="8" y1="6" x2="42" y2="42">
              <stop offset="0%" stopColor="#00BFFF" />
              <stop offset="55%" stopColor="#4F46E5" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
            <filter id="xnt-logo-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M10 9H21L30 20L37 9H45L34 25L45 39H34L26 29L18 39H4L18 23L10 9Z"
            fill="none"
            stroke="url(#xnt-logo-gradient)"
            strokeWidth="4.8"
            strokeLinejoin="round"
            filter="url(#xnt-logo-glow)"
          />
          <path
            d="M14 12L24 24L14 36M36 12L26 24L36 36"
            fill="none"
            stroke="#EDF7FF"
            strokeOpacity="0.78"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!markOnly && (
        <span className="font-display text-lg font-bold leading-none">
          XNT<span className="xnt-text-glow">SERVERS</span>
        </span>
      )}
    </span>
  );
}
