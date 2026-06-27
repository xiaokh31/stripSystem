import Link from "next/link";

export interface OfficeNavItem {
  href: string;
  label: string;
}

export function OfficeNavigation({ items }: { items: OfficeNavItem[] }) {
  return (
    <nav aria-label="Office navigation" className="flex gap-1 overflow-x-auto">
      {items.map((item) => (
        <Link
          className="flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-semibold text-teal-50 transition-colors hover:border-teal-200 hover:text-white"
          href={item.href}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
