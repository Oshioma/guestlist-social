"use client";

import { usePathname } from "next/navigation";

const subtitles: Record<string, string> = {
  "/app/dashboard": "Activity across all apps · last 30 days",
};

const titles: Record<string, string> = {
  "/app/dashboard": "Dashboard",
  "/app/content": "Content Dashboard",
  "/app/clients": "Clients",
  "/app/engine": "Engine Dashboard",
  "/app/engine-settings": "Engine Settings",
  "/app/outcomes": "Outcomes",
  "/app/interaction": "Interaction",
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
  "/app/settings/consultation": "Consultation Questions",
  "/app/guide": "Guide",
  "/app/video-ideas": "Video Ideas",
  "/app/carousel-ideas": "Carousel Ideas",
  "/app/story-ideas": "Story Ideas",
};

function resolveTitle(pathname: string): string {
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith("/app/clients/")) return "Client";
  if (pathname.startsWith("/app/interaction")) return "Interaction";
  if (pathname.startsWith("/app/proofer/")) return "Proofer";
  if (pathname.startsWith("/app/settings/")) return "Settings";
  return "Admin";
}

export default function Topbar() {
  const pathname = usePathname();
  const title = resolveTitle(pathname);
  const subtitle = subtitles[pathname] ?? null;
  // Proofer page pins a day scrubber to the right edge — pull the
  // topbar's right-side controls inward so they sit clear of it.
  const paddingRight = pathname === "/app/proofer" ? 80 : 24;

  return (
    <header
      style={{
        height: 56,
        borderBottom: "1px solid #e4e4e7",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 ${paddingRight}px 0 24px`,
        background: "#fff",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
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
        {subtitle && (
          <span style={{ fontSize: 12, color: "#a1a1aa" }}>{subtitle}</span>
        )}
      </div>
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
