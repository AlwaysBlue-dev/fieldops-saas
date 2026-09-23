import { cn } from "cn";
import type { ReactNode } from "react";

export type TimelineItem = {
  id: string;
  title: string;
  detail?: string;
  time?: string;
};

export function ActivityTimeline({
  items,
  empty,
  className,
}: {
  items: TimelineItem[];
  empty?: ReactNode;
  className?: string;
}) {
  if (items.length === 0) {
    return <div className={className}>{empty}</div>;
  }

  return (
    <ol className={cn("space-y-3", className)}>
      {items.map((item, index) => (
        <li key={item.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="mt-1 size-2 rounded-full bg-primary" />
            {index < items.length - 1 ? (
              <span className="mt-1 w-px flex-1 bg-border" />
            ) : null}
          </div>
          <div className="min-w-0 pb-2">
            <p className="text-sm font-medium">{item.title}</p>
            {item.detail ? (
              <p className="text-sm text-muted-foreground">{item.detail}</p>
            ) : null}
            {item.time ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{item.time}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
