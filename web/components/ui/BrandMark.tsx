import { cn } from "@/lib/utils";

/**
 * Sify DMS brand mark. The glyph is drawn inline so it renders identically on any
 * background and needs no asset request.
 */
export function BrandMark({
  size = "md",
  showWordmark = true,
  tone = "light",
  className,
}: {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  tone?: "light" | "dark";
  className?: string;
}) {
  const glyph = {
    sm: "h-7 w-7 rounded-[7px]",
    md: "h-9 w-9 rounded-[9px]",
    lg: "h-11 w-11 rounded-[11px]",
  }[size];

  const title = {
    sm: "text-[13px]",
    md: "text-[15px]",
    lg: "text-[17px]",
  }[size];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden",
          glyph,
          tone === "dark" ? "bg-white/10 ring-1 ring-white/15" : "bg-[var(--accent)]"
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-1/2 w-1/2" aria-hidden>
          <path
            d="M14.5 3.5H8.2A2.7 2.7 0 0 0 5.5 6.2v11.6a2.7 2.7 0 0 0 2.7 2.7h7.6a2.7 2.7 0 0 0 2.7-2.7V7.8l-4-4.3Z"
            stroke="white"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M14 3.8v3.4h3.6" stroke="white" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9 12.4h6M9 15.6h4" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      {showWordmark && (
        <span className="min-w-0">
          <span
            className={cn(
              "block font-semibold tracking-[-0.02em]",
              title,
              tone === "dark" ? "text-white" : "text-[var(--text)]"
            )}
          >
            Sify <span className="font-normal opacity-70">DMS</span>
          </span>
        </span>
      )}
    </span>
  );
}
