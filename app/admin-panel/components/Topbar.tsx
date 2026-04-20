"use client";

import { usePathname } from "next/navigation";

const titles: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/content": "Content Dashboard",
  "/app/clients": "Clients",
  "/app/engine": "Engine Dashboard",
  "/app/meta-queue": "Meta Queue",
  "/app/whats-working": "Playbook",
  "/app/creative": "Creative Library",
  "/app/reports": "Reports",
  "/app/memory": "Memory",
  "/app/proofer": "Proofer",
  "/app/proofer/publish": "Publish Queue",
  "/app/ideas": "Ideas",
  "/app/tasks": "Tasks",
  "/app/settings": "Settings",
  "/app/settings/members": "Members",
  "/app/guide": "Guide",
  "/app/video-ideas": "Video Ideas",
  "/app/carousel-ideas": "Carousel Ideas",
  "/app/story-ideas": "Story Ideas",
};

function resolveTitle(pathname: string): string {
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith("/app/clients/")) return "Client";
  if (pathname.startsWith("/app/proofer/")) return "Proofer";
  if (pathname.startsWith("/app/settings/")) return "Settings";
  return "Admin";
}

export default function Topbar() {
  const pathname = usePathname();
  const title = resolveTitle(pathname);

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
      <h1
        style={{
          fontSize: 16,
          fontWeight: 600,
          margin: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h1>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <form action="/sign-out" method="post" style={{ margin: 0 }}>
          <button
            type="submit"
            style={{
              background: "transparent",
              border: "1px solid #e4e4e7",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 12,
              color: "#52525b",
              cursor: "pointer",
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            Sign out
          </button>
        </form>
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
      </div>
    </header>
  );
}
