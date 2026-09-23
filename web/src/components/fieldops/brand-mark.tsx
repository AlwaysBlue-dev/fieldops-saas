import { cn } from "cn";

export function BrandMark({
  className,
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-[11px] font-semibold tracking-tight",
        inverted
          ? "bg-white/12 text-white"
          : "bg-primary text-primary-foreground",
        className,
      )}
      aria-hidden
    >
      FO
    </span>
  );
}
