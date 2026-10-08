import Link from "next/link";

const comparisons = [
  { href: "/compare/jobber", label: "Jobber" },
  { href: "/compare/housecall-pro", label: "Housecall Pro" },
  { href: "/compare/servicetitan", label: "ServiceTitan" },
];

export function CompareLinkRow({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="FieldKeel comparisons" className={`text-sm text-muted-foreground ${className}`}>
      <span>Compare FieldKeel with </span>
      {comparisons.map((item, index) => (
        <span key={item.href}>
          {index > 0 ? ", " : null}
          <Link href={item.href} className="text-primary hover:underline">
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
