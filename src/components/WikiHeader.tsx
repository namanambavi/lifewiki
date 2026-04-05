"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WikiHeader({ encyclopediaName }: { encyclopediaName: string }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <div className="wiki-header">
      <a href="/" className="wiki-logo"><b>{encyclopediaName}</b></a>
      <form onSubmit={handleSearch} className="wiki-search">
        <input type="text" placeholder={`Search ${encyclopediaName}`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit">Search</button>
      </form>
    </div>
  );
}
