"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SectionCard from "../../components/SectionCard";
import CarouselPreview from "../../components/CarouselPreview";
import BoostPostButton from "../../components/BoostPostButton";
import type {
  ProoferPost,
  ProoferPublishQueueItem,
  ProoferStatus,
  PublishQueuePlatform,
  PublishQueueStatus,
} from "../../lib/types";
import {
  queueProoferPostAction,
  scheduleProoferQueueItemAction,
  markProoferQueueItemPublishedAction,
  markProoferQueueItemFailedAction,
  removeProoferQueueItemAction,
} from "../../lib/proofer-actions";
import { publishMetaQueueItem } from "../../lib/meta-publish";

type ClientLite = { id: string; name: string };

type ConnectedAccount = {
  clientId: string;
  platform: "facebook" | "instagram";
  accountId: string;
  accountName: string;
};

type ReadyPost = ProoferPost & {
  clientName: string;
};

type QueueItem = ProoferPublishQueueItem & {
  clientId: string;
  clientName: string;
  postDate: string;
  caption: string;
  imageUrl: string;
  mediaUrls: string[];
  postStatus: ProoferStatus;
};

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDateTimeLocalInputValue(value: string | null, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalInputValue(value: string) {
  if (!value) return "";
  return new Date(value).toISOString();
}

function getStatusPillStyle(status: PublishQueueStatus): React.CSSProperties {
  if (status === "queued") {
    return {
      background: "#fef9c3",
      border: "1px solid #fde047",
      color: "#854d0e",
    };
  }
  if (status === "scheduled") {
    return {
      background: "#e0f2fe",
      border: "1px solid #38bdf8",
      color: "#075985",
    };
  }
  if (status === "published") {
    return {
      background: "#dcfce7",
      border: "1px solid #86efac",
      color: "#166534",
    };
  }
  return {
    background: "#fee2e2",
    border: "1px solid #fca5a5",
    color: "#991b1b",
  };
}

function platformLabel(platform: PublishQueuePlatform) {
  return platform === "facebook" ? "Facebook" : "Instagram";
}

const buttonBase: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#fff",
  color: "#18181b",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const darkButton: React.CSSProperties = {
  ...buttonBase,
  background: "#18181b",
  border: "1px solid #18181b",
  color: "#fff",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  background: "#fff",
  color: "#18181b",
  fontFamily: "inherit",
};

function getDefault6pmGmt(): string {
  const now = new Date();
  const today6pmUtc = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0)
  );
  if (today6pmUtc.getTime() < now.getTime()) {
    today6pmUtc.setUTCDate(today6pmUtc.getUTCDate() + 1);
  }
  const offsetMs = today6pmUtc.getTimezoneOffset() * 60 * 1000;
  const local = new Date(today6pmUtc.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

export default function PublishQueueBoard({
  readyPosts,
  queueItems,
  defaultScheduleValue,
  clients = [],
  connectedAccounts = [],
  metaConnectionError = null,
}: {
  readyPosts: ReadyPost[];
  queueItems: QueueItem[];
  defaultScheduleValue: string;
  clients?: ClientLite[];
  connectedAccounts?: ConnectedAccount[];
  metaConnectionError?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [connectClientId, setConnectClientId] = useState<string>(
    clients[0]?.id ?? ""
  );

  const default6pm = useMemo(() => getDefault6pmGmt(), []);

  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>(
    {}
  );
  const [publishUrlDrafts, setPublishUrlDrafts] = useState<
    Record<string, string>
  >({});
  const [failureNoteDrafts, setFailureNoteDrafts] = useState<
    Record<string, string>
  >({});

  const clientNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of clients) map[c.id] = c.name;
    return map;
  }, [clients]);

  const accountsByClient = useMemo(() => {
    const map: Record<string, ConnectedAccount[]> = {};
    for (const acc of connectedAccounts) {
      if (!map[acc.clientId]) map[acc.clientId] = [];
      map[acc.clientId].push(acc);
    }
    return map;
  }, [connectedAccounts]);

  const connectedClientIds = useMemo(
    () =>
      Object.keys(accountsByClient).sort((a, b) =>
        (clientNameById[a] ?? "").localeCompare(clientNameById[b] ?? "")
      ),
    [accountsByClient, clientNameById]
  );

  const scheduledItems = useMemo(
    () =>
      queueItems
        .filter((item) => item.status === "scheduled")
        .sort((a, b) =>
          String(a.scheduledFor ?? "").localeCompare(String(b.scheduledFor ?? ""))
        ),
    [queueItems]
  );

  const queuedItems = useMemo(
    () =>
      queueItems
        .filter((item) => item.status === "queued")
        .sort((a, b) => a.postDate.localeCompare(b.postDate)),
    [queueItems]
  );

  const publishedItems = useMemo(
    () =>
      queueItems
        .filter((item) => item.status === "published")
        .sort((a, b) =>
          String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? ""))
        ),
    [queueItems]
  );

  const failedItems = useMemo(
    () =>
      queueItems
        .filter((item) => item.status === "failed")
        .sort((a, b) =>
          String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
        ),
    [queueItems]
  );

  function refresh() {
    router.refresh();
  }

  function handleQueue(postId: string, platform: PublishQueuePlatform) {
    startTransition(async () => {
      try {
        await queueProoferPostAction(postId, platform);
        refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not add to queue");
      }
    });
  }

  function handleSchedule(queueId: string) {
    const draft = scheduleDrafts[queueId] ?? defaultScheduleValue;
    if (!draft) {
      alert("Pick a scheduled time first.");
      return;
    }

    startTransition(async () => {
      try {
        await scheduleProoferQueueItemAction(
          queueId,
          fromDateTimeLocalInputValue(draft)
        );
        refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not schedule item");
      }
    });
  }

  function handleMarkPublished(queueId: string) {
    const publishUrl = (publishUrlDrafts[queueId] ?? "").trim();

    startTransition(async () => {
      try {
        await markProoferQueueItemPublishedAction(
          queueId,
          publishUrl || undefined
        );
        setPublishUrlDrafts((prev) => {
          const next = { ...prev };
          delete next[queueId];
          return next;
        });
        refresh();
      } catch (err) {
        alert(
          err instanceof Error ? err.message : "Could not mark as published"
        );
      }
    });
  }

  async function handlePublishNow(queueId: string) {
    if (
      !confirm(
        "Publish this post to Meta right now? It will go live on the connected Facebook Page or Instagram account."
      )
    ) {
      return;
    }
    try {
      const result = await publishMetaQueueItem(queueId);
      if (result.ok) {
        alert(
          result.publishUrl
            ? `Published! ${result.publishUrl}`
            : "Published to Meta."
        );
      } else {
        alert(`Publish failed: ${result.error}`);
      }
      refresh();
    } catch (err) {
      alert(
        `Publish error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  function handleConnectMeta() {
    if (!connectClientId) {
      alert("Pick a client first.");
      return;
    }
    window.location.href = `/api/meta/connect?clientId=${encodeURIComponent(
      connectClientId
    )}`;
  }

  function handleMarkFailed(queueId: string) {
    const note = (failureNoteDrafts[queueId] ?? "").trim();

    startTransition(async () => {
      try {
        await markProoferQueueItemFailedAction(queueId, note || undefined);
        refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not mark as failed");
      }
    });
  }

  function handleRemove(queueId: string) {
    if (!confirm("Remove this item from the publish queue?")) return;

    startTransition(async () => {
      try {
        await removeProoferQueueItemAction(queueId);
        refresh();
      } catch (err) {
        alert(
          err instanceof Error ? err.message : "Could not remove queue item"
        );
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Link
          href="/app/proofer"
          style={{
            fontSize: 13,
            color: "#71717a",
            textDecoration: "none",
            display: "inline-block",
            marginBottom: 8,
          }}
        >
          &larr; Back to Proofer
        </Link>
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            lineHeight: 1.05,
            fontWeight: 700,
            color: "#18181b",
            letterSpacing: "-0.03em",
          }}
        >
          Publish Queue
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "#71717a",
            maxWidth: 900,
          }}
        >
          Proofed posts move here for delivery. Queue them for Instagram or
          Facebook, schedule them, then mark them published or failed.
        </p>
      </div>

      <SectionCard title="Meta connection">
        <div
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 13, color: "#52525b" }}>
              Connect a Facebook Page (and the linked Instagram professional
              account) so approved posts can be published straight from the
              queue.
            </span>
            <select
              value={connectClientId}
              onChange={(e) => setConnectClientId(e.target.value)}
              disabled={clients.length === 0}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                background: "#fff",
                fontSize: 12,
                fontWeight: 600,
                color: "#18181b",
              }}
            >
              {clients.length === 0 && <option value="">No clients</option>}
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleConnectMeta}
              disabled={!connectClientId}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: connectClientId ? "#1877f2" : "#e4e4e7",
                color: connectClientId ? "#fff" : "#a1a1aa",
                border: "none",
                fontSize: 12,
                fontWeight: 700,
                cursor: connectClientId ? "pointer" : "not-allowed",
              }}
            >
              Connect Meta
            </button>
          </div>

          <div
            style={{
              borderTop: "1px solid #f4f4f5",
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "#71717a",
                fontWeight: 700,
              }}
            >
              Currently connected
            </div>

            {metaConnectionError && (
              <div
                style={{
                  fontSize: 12,
                  color: "#991b1b",
                  background: "#fee2e2",
                  border: "1px solid #fca5a5",
                  borderRadius: 8,
                  padding: "8px 12px",
                  marginBottom: 4,
                }}
              >
                Error loading connected accounts: {metaConnectionError}
              </div>
            )}

            {connectedClientIds.length === 0 && !metaConnectionError ? (
              <div style={{ fontSize: 13, color: "#71717a" }}>
                No connected Meta accounts yet. Pick a client above and click
                Connect Meta.
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {connectedClientIds.map((cid) => {
                  const accs = accountsByClient[cid] ?? [];
                  const fb = accs.filter((a) => a.platform === "facebook");
                  const ig = accs.filter((a) => a.platform === "instagram");
                  return (
                    <div
                      key={cid}
                      style={{
                        border: "1px solid #e4e4e7",
                        borderRadius: 10,
                        padding: "10px 12px",
                        background: "#fafafa",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: "#18181b",
                        }}
                      >
                        {clientNameById[cid] ?? `Client ${cid}`}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        {fb.map((a) => (
                          <span
                            key={`fb-${a.accountId}`}
                            title={`Facebook Page ${a.accountId}`}
                            style={{
                              padding: "3px 9px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              background: "#e7f0fe",
                              border: "1px solid #1877f2",
                              color: "#1d4ed8",
                            }}
                          >
                            FB · {a.accountName || a.accountId}
                          </span>
                        ))}
                        {ig.map((a) => (
                          <span
                            key={`ig-${a.accountId}`}
                            title={`Instagram ${a.accountId}`}
                            style={{
                              padding: "3px 9px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              background: "#fdf2f8",
                              border: "1px solid #ec4899",
                              color: "#be185d",
                            }}
                          >
                            IG · @{a.accountName || a.accountId}
                          </span>
                        ))}
                        {fb.length === 0 && ig.length === 0 && (
                          <span
                            style={{ fontSize: 12, color: "#71717a" }}
                          >
                            No Pages or IG accounts
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Overview">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          {[
            { label: "Ready to queue", value: readyPosts.length },
            { label: "Queued", value: queuedItems.length },
            { label: "Scheduled", value: scheduledItems.length },
            { label: "Published", value: publishedItems.length },
            { label: "Failed", value: failedItems.length },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                padding: 14,
                background: "#fff",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "#71717a",
                  fontWeight: 700,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 24,
                  fontWeight: 800,
                  color: "#18181b",
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Ready to queue">
        {readyPosts.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No approved posts waiting to be queued.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {readyPosts.map((post) => (
              <div
                key={post.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  padding: 14,
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "#18181b",
                        }}
                      >
                        {post.clientName}
                      </div>
                      <div style={{ fontSize: 12, color: "#71717a" }}>
                        {formatDate(post.postDate)}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: "#e0f2fe",
                        border: "1px solid #38bdf8",
                        color: "#075985",
                        fontSize: 12,
                        fontWeight: 700,
                        alignSelf: "flex-start",
                      }}
                    >
                      Proofed
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#27272a",
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {post.caption || "No caption"}
                  </div>

                  <CarouselPreview
                    urls={
                      post.mediaUrls.length > 0
                        ? post.mediaUrls
                        : post.imageUrl
                        ? [post.imageUrl]
                        : []
                    }
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 4,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleQueue(post.id, "instagram")}
                      disabled={isPending}
                      style={darkButton}
                    >
                      Queue for Instagram
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQueue(post.id, "facebook")}
                      disabled={isPending}
                      style={buttonBase}
                    >
                      Queue for Facebook
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (isPending) return;
                        startTransition(async () => {
                          try {
                            await queueProoferPostAction(post.id, "instagram");
                            await queueProoferPostAction(post.id, "facebook");
                            refresh();
                          } catch (err) {
                            alert(
                              err instanceof Error
                                ? err.message
                                : "Could not queue both platforms"
                            );
                          }
                        });
                      }}
                      disabled={isPending}
                      style={buttonBase}
                    >
                      Queue both
                    </button>
                  </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Queued">
        {queuedItems.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No queued items right now.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {queuedItems.map((item) => {
              const scheduleValue =
                scheduleDrafts[item.id] ??
                toDateTimeLocalInputValue(item.scheduledFor, default6pm);

              return (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 12,
                    padding: 14,
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "#18181b",
                        }}
                      >
                        {item.clientName} · {platformLabel(item.platform)}
                      </div>
                      <div style={{ fontSize: 12, color: "#71717a" }}>
                        {formatDate(item.postDate)}
                      </div>
                    </div>

                    <div
                      style={{
                        ...getStatusPillStyle(item.status),
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        alignSelf: "flex-start",
                      }}
                    >
                      {item.status}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: "#27272a",
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {item.caption || "No caption"}
                  </div>

                  <CarouselPreview
                    urls={
                      item.mediaUrls.length > 0
                        ? item.mediaUrls
                        : item.imageUrl
                        ? [item.imageUrl]
                        : []
                    }
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <input
                        type="datetime-local"
                        value={scheduleValue}
                        onChange={(e) =>
                          setScheduleDrafts((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 10, color: "#a1a1aa" }}>
                        Default: 6 PM GMT
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSchedule(item.id)}
                      disabled={isPending}
                      style={darkButton}
                    >
                      Schedule
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePublishNow(item.id)}
                      disabled={isPending}
                      style={{
                        ...darkButton,
                        background: "#1877f2",
                        borderColor: "#1877f2",
                      }}
                    >
                      Publish now
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMarkPublished(item.id)}
                      disabled={isPending}
                      style={buttonBase}
                    >
                      Mark published
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      disabled={isPending}
                      style={{
                        ...buttonBase,
                        color: "#991b1b",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Scheduled">
        {scheduledItems.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No scheduled items right now.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {scheduledItems.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  padding: 14,
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: "#18181b",
                      }}
                    >
                      {item.clientName} · {platformLabel(item.platform)}
                    </div>
                    <div style={{ fontSize: 12, color: "#71717a" }}>
                      {formatDate(item.postDate)} · Scheduled for{" "}
                      {formatDateTime(item.scheduledFor)}
                    </div>
                  </div>

                  <div
                    style={{
                      ...getStatusPillStyle(item.status),
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      alignSelf: "flex-start",
                    }}
                  >
                    {item.status}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: "#27272a",
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {item.caption || "No caption"}
                </div>

                <CarouselPreview
                  urls={
                    item.mediaUrls.length > 0
                      ? item.mediaUrls
                      : item.imageUrl
                      ? [item.imageUrl]
                      : []
                  }
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 1fr) auto auto",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <input
                    type="text"
                    value={publishUrlDrafts[item.id] ?? ""}
                    onChange={(e) =>
                      setPublishUrlDrafts((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                    placeholder="Paste published URL (optional)"
                    style={inputStyle}
                  />

                  <button
                    type="button"
                    onClick={() => handleMarkPublished(item.id)}
                    disabled={isPending}
                    style={darkButton}
                  >
                    Mark published
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    disabled={isPending}
                    style={buttonBase}
                  >
                    Remove
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 1fr) auto",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <input
                    type="text"
                    value={failureNoteDrafts[item.id] ?? ""}
                    onChange={(e) =>
                      setFailureNoteDrafts((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                    placeholder="Failure note (optional)"
                    style={inputStyle}
                  />

                  <button
                    type="button"
                    onClick={() => handleMarkFailed(item.id)}
                    disabled={isPending}
                    style={{
                      ...buttonBase,
                      color: "#991b1b",
                    }}
                  >
                    Mark failed
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Published">
        {publishedItems.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No published items yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {publishedItems.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  padding: 14,
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: "#18181b",
                    }}
                  >
                    {item.clientName} · {platformLabel(item.platform)}
                  </div>
                  <div style={{ fontSize: 12, color: "#71717a" }}>
                    {formatDate(item.postDate)} · Published{" "}
                    {formatDateTime(item.publishedAt)}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {item.publishUrl ? (
                    <a
                      href={item.publishUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        ...buttonBase,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      View post
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: "#71717a" }}>
                      No URL saved
                    </span>
                  )}

                  <BoostPostButton
                    clientId={item.clientId}
                    platform={item.platform}
                    metaPostId={null}
                    publishUrl={item.publishUrl}
                  />

                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    disabled={isPending}
                    style={buttonBase}
                  >
                    Remove
                  </button>
                </div>
                </div>

                <CarouselPreview
                  urls={
                    item.mediaUrls.length > 0
                      ? item.mediaUrls
                      : item.imageUrl
                      ? [item.imageUrl]
                      : []
                  }
                />

                {item.insightsFetchedAt && (
                  <div
                    style={{
                      width: "100%",
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      padding: "8px 12px",
                      background: "#f8fafc",
                      border: "1px solid #f1f5f9",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  >
                    {item.insightsReach != null && (
                      <span><strong style={{ color: "#18181b" }}>{item.insightsReach.toLocaleString()}</strong> <span style={{ color: "#71717a" }}>reach</span></span>
                    )}
                    {item.insightsImpressions != null && (
                      <span><strong style={{ color: "#18181b" }}>{item.insightsImpressions.toLocaleString()}</strong> <span style={{ color: "#71717a" }}>impressions</span></span>
                    )}
                    {item.insightsEngagement != null && (
                      <span><strong style={{ color: "#18181b" }}>{item.insightsEngagement.toLocaleString()}</strong> <span style={{ color: "#71717a" }}>engagement</span></span>
                    )}
                    {item.insightsLikes != null && (
                      <span><strong style={{ color: "#18181b" }}>{item.insightsLikes.toLocaleString()}</strong> <span style={{ color: "#71717a" }}>likes</span></span>
                    )}
                    {item.insightsComments != null && (
                      <span><strong style={{ color: "#18181b" }}>{item.insightsComments.toLocaleString()}</strong> <span style={{ color: "#71717a" }}>comments</span></span>
                    )}
                    <span style={{ marginLeft: "auto", color: "#a1a1aa", fontSize: 11 }}>
                      fetched {new Date(item.insightsFetchedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Failed">
        {failedItems.length === 0 ? (
          <div style={{ fontSize: 13, color: "#71717a" }}>
            No failed items right now.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {failedItems.map((item) => {
              const scheduleValue =
                scheduleDrafts[item.id] ??
                toDateTimeLocalInputValue(item.scheduledFor, default6pm);

              return (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #fecaca",
                    borderRadius: 12,
                    padding: 14,
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "#18181b",
                        }}
                      >
                        {item.clientName} · {platformLabel(item.platform)}
                      </div>
                      <div style={{ fontSize: 12, color: "#71717a" }}>
                        {formatDate(item.postDate)}
                      </div>
                    </div>

                    <div
                      style={{
                        ...getStatusPillStyle(item.status),
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        alignSelf: "flex-start",
                      }}
                    >
                      {item.status}
                    </div>
                  </div>

                  {item.notes && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#991b1b",
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {item.notes}
                    </div>
                  )}

                  <CarouselPreview
                    urls={
                      item.mediaUrls.length > 0
                        ? item.mediaUrls
                        : item.imageUrl
                        ? [item.imageUrl]
                        : []
                    }
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="datetime-local"
                      value={scheduleValue}
                      onChange={(e) =>
                        setScheduleDrafts((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      style={inputStyle}
                    />

                    <button
                      type="button"
                      onClick={() => handleSchedule(item.id)}
                      disabled={isPending}
                      style={darkButton}
                    >
                      Reschedule
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      disabled={isPending}
                      style={buttonBase}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
