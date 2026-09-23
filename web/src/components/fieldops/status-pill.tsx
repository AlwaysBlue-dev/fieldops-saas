import { cn } from "cn";

const tones = {
  muted: "bg-muted text-muted-foreground",
  cobalt: "bg-accent text-accent-foreground",
  teal: "bg-[oklch(0.52_0.10_175/12%)] text-[oklch(0.38_0.09_175)]",
  emerald: "bg-[oklch(0.55_0.14_150/12%)] text-[oklch(0.38_0.12_150)]",
  amber: "bg-[oklch(0.72_0.14_75/18%)] text-[oklch(0.42_0.1_70)]",
  crimson: "bg-destructive/10 text-destructive",
} as const;

export function StatusPill({
  label,
  tone = "muted",
  live = false,
  className,
}: {
  label: string;
  tone?: keyof typeof tones;
  live?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          live ? "bg-teal" : "bg-current opacity-70",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
