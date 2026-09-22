"use client";

import { useEffect, useState } from "react";
import LinkCard from "@/componets/LinkCard";

type Link = {
  id: string;
  label: string;
  url: string;
  icon: React.ReactNode;
};

type LinkListProps = {
  links: Link[];
};

export default function LinkList({ links }: LinkListProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/clicks")
      .then((res) => res.json())
      .then((data: Record<string, number>) => setCounts(data))
      .catch(() => {});
  }, []);

  const handleClick = (id: string) => {
    setCounts((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
    fetch(`/api/clicks/${id}`, { method: "POST", keepalive: true }).catch(() => {});
  };

  return (
    <>
      {links.map((link) => (
        <LinkCard
          key={link.id}
          label={link.label}
          url={link.url}
          icon={link.icon}
          count={counts[link.id] ?? 0}
          onClick={() => handleClick(link.id)}
        />
      ))}
    </>
  );
}
