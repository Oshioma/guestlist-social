"use client";

import { usePathname } from "next/navigation";

const titles: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/clients": "Clients",
  "/app/content": "Content",
  "/app/video-ideas": "Video Ideas",
  "/app/carousel-ideas": "Carousel Ideas",
  "/app/story-ideas": "Story Ideas",
  "/app/tasks": "Tasks",
  "/app/launch": "Launch",
  "/app/reports": "Reports",
  "/app/memory": "Memory",
  "/app/settings": "Settings",
};

export default function Topbar() {
  const pathname = usePathname();

  const title =
    titles[pathname] ??
    (pathname.startsWith("/app/clients/") ? "Client" : "Admin");

  return (
    <header
      style={{
        height: 56,
        borderBottom: "1px solid #e4e4e7",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        background: "#fff",
        flexShrink: 0,
      }}
    >
      <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h1>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#18181b",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        GS
      </div>
    </header>
  );
}
