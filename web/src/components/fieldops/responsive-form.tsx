import { cn } from "cn";
import type { FormHTMLAttributes, ReactNode } from "react";

export function ResponsiveForm({
  children,
  className,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }) {
  return (
    <form
      className={cn("flex flex-col gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]", className)}
      {...props}
    >
      {children}
    </form>
  );
}

export function FormField({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col gap-1.5", className)}>{children}</div>;
}
