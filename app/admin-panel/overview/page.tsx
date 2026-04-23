export default async function OverviewPage() {
  const stats = {
    spend: 420,
    conversions: 38,
    ctr: 1.8,
  };

  const topAds = [
    { name: "Beach Couples", ctr: 3.2 },
    { name: "Sunset Reel", ctr: 2.8 },
  ];

  const weakAds = [
    { name: "Summer Escape", ctr: 0.4 },
    { name: "Dinner Promo", ctr: 0.6 },
  ];

  const recentDecisions = [
    { action: "Paused Summer Escape", result: "Positive" },
    { action: "Scaled Beach Couples", result: "Neutral" },
    { action: "Tested Sunset Promo", result: "Negative" },
  ];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f7f8_0%,#f2f4f7_52%,#edf1f4_100%)] text-slate-900">
      <div className="mx-auto max-w-6xl p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Quick understanding. No clutter.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
            <p className="text-sm text-slate-500">Spend (7d)</p>
            <p className="text-2xl font-semibold">£{stats.spend}</p>
          </div>
          <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
            <p className="text-sm text-slate-500">Conversions</p>
            <p className="text-2xl font-semibold">{stats.conversions}</p>
          </div>
          <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
            <p className="text-sm text-slate-500">CTR</p>
            <p className="text-2xl font-semibold">{stats.ctr}%</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
            <h2 className="font-semibold mb-3">Top Ads</h2>
            {topAds.map((ad) => (
              <div key={ad.name} className="flex justify-between text-sm py-2">
                <span>{ad.name}</span>
                <span className="font-medium text-emerald-600">{ad.ctr}%</span>
              </div>
            ))}
          </div>
          <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
            <h2 className="font-semibold mb-3">Needs Attention</h2>
            {weakAds.map((ad) => (
              <div key={ad.name} className="flex justify-between text-sm py-2">
                <span>{ad.name}</span>
                <span className="font-medium text-red-500">{ad.ctr}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur rounded-2xl p-5 border border-slate-200">
          <h2 className="font-semibold mb-4">Recent Decisions</h2>
          {recentDecisions.map((d, i) => (
            <div
              key={i}
              className="flex justify-between items-center py-3 border-b last:border-none"
            >
              <span className="text-sm">{d.action}</span>
              <span
                className={`text-sm font-medium px-3 py-1 rounded-full ${
                  d.result === "Positive"
                    ? "bg-emerald-50 text-emerald-700"
                    : d.result === "Negative"
                    ? "bg-red-50 text-red-600"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {d.result}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
