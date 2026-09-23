import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

export function SkeletonBlock({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-8 w-full rounded-md" />
      ))}
    </div>
  );
}

export { SkeletonBlock as FieldOpsSkeleton };
