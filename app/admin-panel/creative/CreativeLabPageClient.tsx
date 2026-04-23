"use client";

import { useMemo, useState } from "react";

export type WeakAd = {
  id: number;
  name: string;
  campaign: string;
  problem: string;
  why: string;
  currentHook: string;
  image: string;
  primaryText: string;
  headline: string;
  cta: string;
  suggestions: string[];
};

export default function CreativeLabPageClient({
  weakAds,
}: {
  weakAds: WeakAd[];
}) {
  const [selectedAdId, setSelectedAdId] = useState<number | null>(null);
  const [savedIdeas, setSavedIdeas] = useState<Record<number, string[]>>({});
  const [selectedIdeas, setSelectedIdeas] = useState<
    Record<number, string | null>
  >({});
  const [showCompare, setShowCompare] = useState(true);
  const [pushedTests, setPushedTests] = useState<Record<number, boolean>>({});

  const selectedAd = useMemo(
    () => weakAds.find((ad) => ad.id === selectedAdId) ?? null,
    [selectedAdId, weakAds]
  );

  const getSavedCount = () =>
    Object.values(savedIdeas).reduce((sum, ideas) => sum + ideas.length, 0);

  const toggleSave = (adId: number, idea: string) => {
    setSavedIdeas((prev) => {
      const current = prev[adId] ?? [];
      const next = current.includes(idea)
        ? current.filter((item) => item !== idea)
        : [...current, idea];
      return { ...prev, [adId]: next };
    });
  };

  const selectIdea = (adId: number, idea: string) => {
    setSelectedIdeas((prev) => ({ ...prev, [adId]: idea }));
  };

  const pushToTest = (adId: number) => {
    setPushedTests((prev) => ({ ...prev, [adId]: true }));
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f7f8_0%,#f2f4f7_52%,#edf1f4_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="mb-5 rounded-[28px] border border-slate-200/70 bg-white/75 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Creative Lab</h1>
              <p className="mt-1 text-sm text-slate-500">
                Improve weak ads without turning this into a cluttered creative
                gallery.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm">
                Generate Ideas
              </button>
              <button className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                Weak Ads Only
              </button>
              <button
                onClick={() => setShowCompare((v) => !v)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
              >
                Compare: {showCompare ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Ads to refresh", String(weakAds.length)],
            ["Saved ideas", String(getSavedCount())],
            [
              "Ready to test",
              String(Object.values(selectedIdeas).filter(Boolean).length),
            ],
            [
              "Pushed to test",
              String(Object.values(pushedTests).filter(Boolean).length),
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-[24px] border border-slate-200/70 bg-white/75 p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)] backdrop-blur-xl"
            >
              <div className="text-sm text-slate-500">{label}</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_360px]">
          <section className="rounded-[28px] border border-slate-200/70 bg-white/75 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <div className="border-b border-slate-200/70 px-5 py-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    Ads needing stronger hooks
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Text first. Visuals only where they help decisions.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["All", "Weak hook", "Too generic", "Low urgency", "Saved"].map(
                    (item, i) => (
                      <button
                        key={item}
                        className={`rounded-full border px-4 py-2.5 text-sm font-medium ${
                          i === 0
                            ? "border-slate-300 bg-white text-slate-900 shadow-sm"
                            : "border-slate-200 bg-white/60 text-slate-600"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-4 p-5">
              {weakAds.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                  No weak ads detected right now.
                </div>
              ) : (
                weakAds.map((ad) => {
                  const selectedIdea = selectedIdeas[ad.id] ?? null;
                  const savedForAd = savedIdeas[ad.id] ?? [];
                  const isPushed = Boolean(pushedTests[ad.id]);
                  return (
                    <div
                      key={ad.id}
                      className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                    >
                      <div className="flex gap-4">
                        <button
                          onClick={() => setSelectedAdId(ad.id)}
                          className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={ad.image}
                            alt={ad.name}
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2.5">
                            <div className="text-lg font-semibold tracking-tight">
                              {ad.name}
                            </div>
                            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">
                              {ad.problem}
                            </span>
                            {isPushed ? (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                Test queued
                              </span>
                            ) : null}
                          </div>
                          <div className="mb-2 text-sm text-slate-500">{ad.campaign}</div>
                          <p className="text-[15px] leading-7 text-slate-700">{ad.why}</p>
                        </div>
                      </div>
                      <div
                        className={`mt-4 grid gap-4 ${
                          showCompare
                            ? "xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]"
                            : ""
                        }`}
                      >
                        {showCompare ? (
                          <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Current hook
                            </div>
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-[15px] leading-7 text-slate-700">
                              {ad.currentHook}
                            </div>
                            {selectedIdea ? (
                              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                                  Selected new version
                                </div>
                                <div className="mt-2 text-[15px] leading-7 text-emerald-900">
                                  {selectedIdea}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                                Select a hook to compare against the current
                                version.
                              </div>
                            )}
                          </div>
                        ) : null}
                        <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Suggested directions
                            </div>
                            <div className="text-xs text-slate-500">
                              Saved: {savedForAd.length}
                            </div>
                          </div>
                          <div className="mt-3 space-y-3">
                            {ad.suggestions.map((idea, i) => {
                              const saved = savedForAd.includes(idea);
                              const active = selectedIdea === idea;
                              return (
                                <div
                                  key={idea}
                                  className={`rounded-2xl border bg-white p-4 ${
                                    active
                                      ? "border-slate-900 shadow-sm"
                                      : "border-slate-200"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="text-[15px] leading-7 text-slate-800">
                                      {idea}
                                    </p>
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                      V{i + 1}
                                    </span>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                      onClick={() => toggleSave(ad.id, idea)}
                                      className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                                        saved
                                          ? "bg-emerald-600 text-white"
                                          : "bg-slate-900 text-white"
                                      }`}
                                    >
                                      {saved ? "Saved" : "Save idea"}
                                    </button>
                                    <button
                                      onClick={() => selectIdea(ad.id, idea)}
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                    >
                                      {active ? "Selected" : "Use for test"}
                                    </button>
                                    <button
                                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                      onClick={() => alert(`Rewrite: ${idea}`)}
                                    >
                                      Rewrite
                                    </button>
                                  </div>
                                  {active ? (
                                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                                      Selected for testing. This becomes the
                                      next creative variant for this ad.
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          disabled={!selectedIdea}
                          onClick={() => pushToTest(ad.id)}
                          className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                            selectedIdea
                              ? "bg-slate-900 text-white"
                              : "cursor-not-allowed bg-slate-200 text-slate-500"
                          }`}
                        >
                          Push to test ad
                        </button>
                        <button
                          onClick={() => setSelectedAdId(ad.id)}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                        >
                          Preview ad
                        </button>
                        {isPushed ? (
                          <span className="text-sm font-medium text-emerald-700">
                            Queued for testing in the ad engine
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
          <aside className="space-y-4">
            <div className="rounded-[28px] border border-slate-200/70 bg-white/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <div className="text-lg font-semibold tracking-tight">
                Creative Signals
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Keep the system smart, but readable.
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ["Best recent angle", "Lifestyle + place-based hooks"],
                  ["Weakest pattern", "Generic offer-first intros"],
                  ["Engine recommendation", "Write more scene-led openings"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[28px] border border-slate-200/70 bg-white/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <div className="text-lg font-semibold tracking-tight">
                Quick Prompt Builder
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Lightweight prompt controls, not a giant AI playground.
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ["Tone", "Warm, sharp, scene-led"],
                  ["Audience", "Tourists in Zanzibar"],
                  ["Goal", "More clicks from cold traffic"],
                  ["Format", "3 hook options"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 text-sm"
                  >
                    <span className="text-slate-500">{k}</span>
                    <span className="text-right font-medium text-slate-900">
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
                Generate fresh hooks
              </button>
            </div>
            <div className="rounded-[28px] border border-slate-200/70 bg-white/80 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <div className="text-lg font-semibold tracking-tight">Workflow</div>
              <div className="mt-1 text-sm text-slate-500">
                Keep it tied to real action.
              </div>
              <div className="mt-4 space-y-3">
                {[
                  "1. Spot the weak ad",
                  "2. Compare stronger hooks",
                  "3. Select the best version",
                  "4. Push it into a test ad",
                ].map((step) => (
                  <div
                    key={step}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700"
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
      {selectedAd ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedAdId(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
              <div className="bg-slate-100 p-4 lg:p-5">
                <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedAd.image}
                    alt={selectedAd.name}
                    className="h-72 w-full object-cover"
                  />
                  <div className="p-4">
                    <p className="text-sm leading-6 text-slate-700">
                      {selectedAd.primaryText}
                    </p>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-900">
                        {selectedAd.headline}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{selectedAd.cta}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-5 lg:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-semibold tracking-tight">
                      {selectedAd.name}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {selectedAd.campaign}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedAdId(null)}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-5 grid gap-4">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Current hook
                    </div>
                    <div className="mt-2 text-[15px] leading-7 text-slate-800">
                      {selectedAd.currentHook}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Selected new version
                    </div>
                    <div className="mt-2 text-[15px] leading-7 text-slate-800">
                      {selectedIdeas[selectedAd.id] ?? "No new hook selected yet."}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-900">
                      Push to test
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      This is where the selected hook would move into your ad
                      engine to create a new test variant.
                    </p>
                    <button
                      disabled={!selectedIdeas[selectedAd.id]}
                      onClick={() => pushToTest(selectedAd.id)}
                      className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
                        selectedIdeas[selectedAd.id]
                          ? "bg-slate-900 text-white"
                          : "cursor-not-allowed bg-slate-200 text-slate-500"
                      }`}
                    >
                      {pushedTests[selectedAd.id]
                        ? "Test queued"
                        : "Push selected hook to test"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
