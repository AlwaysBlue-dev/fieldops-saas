import { cn } from "cn";
import Image from "next/image";

export function BrandMark({
  className,
  inverted = false,
  variant = "mark",
  alt = "FieldKeel",
}: {
  className?: string;
  inverted?: boolean;
  variant?: "mark" | "full";
  alt?: string;
}) {
  return (
    <Image
      src={variant === "full" ? "/icons/logo.png" : "/icons/icon.png"}
      alt={alt}
      width={variant === "full" ? 1448 : 1254}
      height={variant === "full" ? 1086 : 1254}
      className={cn(
        "inline-block shrink-0 rounded-md object-contain",
        variant === "full" ? "h-12 w-16" : "size-7",
        // The official navy artwork needs a light surface on dark backgrounds.
        inverted ? "bg-white" : "dark:bg-white",
        className,
      )}
    />
  );
}
