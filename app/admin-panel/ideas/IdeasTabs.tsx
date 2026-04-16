"use client";

import { useState } from "react";
import VideoIdeasBoard from "../video-ideas/VideoIdeasBoard";
import CarouselIdeasBoard from "../carousel-ideas/CarouselIdeasBoard";
import StoryIdeasBoard from "../story-ideas/StoryIdeasBoard";
import type { ContentPillar } from "../lib/types";

const TABS = ["Video", "Carousel", "Story"] as const;
type Tab = (typeof TABS)[number];

type TabColor = { bg: string; text: string; activeBg: string };
const TAB_COLORS: Record<Tab, TabColor> = {
  Video: { bg: "#dcfce7", text: "#166534", activeBg: "#166534" },
  Carousel: { bg: "#dbeafe", text: "#1e40af", activeBg: "#1e40af" },
  Story: { bg: "#fef9c3", text: "#854d0e", activeBg: "#854d0e" },
};

type Props = {
  video: {
    clients: { id: string; name: string }[];
    themes: any[];
    ideas: any[];
    pillars: ContentPillar[];
  };
  carousel: {
    clients: { id: string; name: string }[];
    themes: any[];
    ideas: any[];
    pillars: ContentPillar[];
  };
  story: {
    clients: { id: string; name: string }[];
    themes: any[];
    ideas: any[];
    pillars: ContentPillar[];
  };
  stats: {
    totalVideo: number;
    totalCarousel: number;
    totalStory: number;
    totalThemes: number;
  };
};

export default function IdeasTabs({ video, carousel, story, stats }: Props) {
  const [tab, setTab] = useState<Tab>("Video");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontSize: 11,
            color: "#71717a",
          }}
        >
          <StatPill label="Video" count={stats.totalVideo} color={TAB_COLORS.Video} />
          <StatPill label="Carousel" count={stats.totalCarousel} color={TAB_COLORS.Carousel} />
          <StatPill label="Story" count={stats.totalStory} color={TAB_COLORS.Story} />
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {TABS.map((t) => {
            const active = tab === t;
            const c = TAB_COLORS[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  color: active ? "#fff" : c.text,
                  background: active ? c.activeBg : c.bg,
                  transition: "background 100ms, color 100ms",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "Video" && (
        <VideoIdeasBoard
          clients={video.clients}
          themes={video.themes}
          ideas={video.ideas}
          pillars={video.pillars}
        />
      )}
      {tab === "Carousel" && (
        <CarouselIdeasBoard
          clients={carousel.clients}
          themes={carousel.themes}
          ideas={carousel.ideas}
          pillars={carousel.pillars}
        />
      )}
      {tab === "Story" && (
        <StoryIdeasBoard
          clients={story.clients}
          themes={story.themes}
          ideas={story.ideas}
          pillars={story.pillars}
        />
      )}
    </div>
  );
}

function StatPill({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: TabColor;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: color.bg,
        color: color.text,
      }}
    >
      {count} {label}
    </span>
  );
}
