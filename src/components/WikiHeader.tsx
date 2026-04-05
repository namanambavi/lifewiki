"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface WikiHeaderProps {
  encyclopediaName: string;
  personSlug?: string;
}

export default function WikiHeader({ encyclopediaName, personSlug }: WikiHeaderProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const basePath = personSlug ? `/${personSlug}` : "";

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`${basePath}/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <div className="wiki-header">
      <a href={basePath || "/"} className="wiki-logo"><b>{encyclopediaName}</b></a>
      <form onSubmit={handleSearch} className="wiki-search">
        <input type="text" placeholder={`Search ${encyclopediaName}`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit">Search</button>
      </form>
    </div>
  );
}
