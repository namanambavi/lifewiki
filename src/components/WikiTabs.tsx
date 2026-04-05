"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

interface WikiTabsProps {
  personSlug: string;
}

export default function WikiTabs({ personSlug }: WikiTabsProps) {
  const pathname = usePathname();

  const tabs = [
    { href: `/${personSlug}`, label: "Main Page" },
    { href: `/${personSlug}/articles`, label: "All articles" },
    { href: `/${personSlug}/sources`, label: "Sources" },
  ];

  return (
    <div className="wiki-tabs">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={pathname === tab.href ? "active" : ""}>
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
