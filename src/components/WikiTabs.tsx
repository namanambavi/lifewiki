"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

const tabs = [
  { href: "/", label: "Main Page" },
  { href: "/articles", label: "All articles" },
  { href: "/sources", label: "Sources" },
];

export default function WikiTabs() {
  const pathname = usePathname();
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
