import {
  getVideoIdeasData,
  getCarouselIdeasData,
  getStoryIdeasData,
} from "../lib/queries";
import EmptyState from "../components/EmptyState";
import IdeasTabs from "./IdeasTabs";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  try {
    const [video, carousel, story] = await Promise.all([
      getVideoIdeasData(),
      getCarouselIdeasData(),
      getStoryIdeasData(),
    ]);

    const stats = {
      totalVideo: video.ideas.length,
      totalCarousel: carousel.ideas.length,
      totalStory: story.ideas.length,
      totalThemes:
        video.themes.length + carousel.themes.length + story.themes.length,
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: "#18181b",
              letterSpacing: "-0.02em",
            }}
          >
            Ideas
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 14,
              color: "#71717a",
            }}
          >
            Plan content strategy with monthly themes, goals, and categorized
            ideas for each client — video, carousel, and story in one place.
          </p>
        </div>

        <IdeasTabs
          video={video}
          carousel={carousel}
          story={story}
          stats={stats}
        />
      </div>
    );
  } catch (error) {
    console.error("Ideas page error:", error);
    return (
      <EmptyState
        title="Ideas failed to load"
        description="Something went wrong while loading ideas data."
      />
    );
  }
}
