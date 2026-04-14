"use client";
import { useState } from "react";
import Link from "next/link";

// All the wizard steps—no changes needed from previous assistant messages

function StepProgress({ step }: { step: number }) {
  const steps = [
    "Campaign Details",
    "Ad Set",
    "Ad Creative",
    "Review & Confirm"
  ];
  return (
    <ol className="flex items-center mb-8 space-x-4 md:space-x-8">
      {steps.map((label, i) => (
        <li key={label} className="flex items-center text-sm font-medium">
          <div
            className={[
              "w-8 h-8 flex items-center justify-center rounded-full border-2",
              i + 1 < step
                ? "border-green-500 bg-green-500 text-white"
                : i + 1 === step
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-gray-100 text-gray-400"
            ].join(" ")}
          >
            {i + 1}
          </div>
          <span className="ml-2">{label}</span>
          {i < steps.length - 1 && (
            <svg className="w-4 h-4 mx-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </li>
      ))}
    </ol>
  );
}

function CampaignDetails({ next, data }: any) {
  const [name, setName] = useState(data.name || "");
  const [objective, setObjective] = useState(data.objective || "");

  return (
    <form
      className="space-y-6"
      onSubmit={e => { e.preventDefault(); next({ name, objective }); }}
    >
      <StepProgress step={1} />
      <h2 className="text-2xl font-semibold text-blue-700 mb-3">Campaign Details</h2>
      <div>
        <label className="block font-medium mb-1">Campaign Name:</label>
        <input
          className="block w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-400"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Spring Sale 2026"
        />
      </div>
      <div>
        <label className="block font-medium mb-1">Objective:</label>
        <select
          required
          className="block w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-400"
          value={objective}
          onChange={e => setObjective(e.target.value)}
        >
          <option value="">Select…</option>
          <option value="awareness">Brand Awareness</option>
          <option value="traffic">Traffic</option>
          <option value="leads">Leads</option>
          <option value="conversions">Conversions</option>
        </select>
      </div>
      <div className="flex justify-end">
        <button type="submit" className="bg-blue-700 hover:bg-blue-800 px-5 py-2 text-white font-semibold rounded">
          Next
        </button>
      </div>
    </form>
  );
}

// ...the rest of the steps (AdSetDetails, AdCreative, Review) and the main FacebookAdWizard function
// (identical to my previous, validated code)

function AdSetDetails({ next, back, data }: any) {
  const [audience, setAudience] = useState(data.audience || "");
  const [budget, setBudget] = useState(data.budget || "");
  const [schedule, setSchedule] = useState(data.schedule || "");
  const [placement, setPlacement] = useState(data.placement || "automatic");

  return (
    <form className="space-y-6" onSubmit={e => { e.preventDefault(); next({ audience, budget, schedule, placement }); }}>
      <StepProgress step={2} />
      <h2 className="text-2xl font-semibold text-blue-700 mb-3">Ad Set Details</h2>
      <div>
        <label className="block font-medium mb-1">Audience:</label>
        <input
          className="block w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-400"
          required
          value={audience}
          onChange={e => setAudience(e.target.value)}
          placeholder='e.g. "Women, 25-45, USA"'
        />
      </div>
      <div>
        <label className="block font-medium mb-1">Daily Budget ($):</label>
        <input
          type="number"
          min="1"
          required
          className="block w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-400"
          value={budget}
          onChange={e => setBudget(e.target.value)}
          placeholder="50"
        />
      </div>
      <div>
        <label className="block font-medium mb-1">Schedule:</label>
        <input
          required
          className="block w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-400"
          value={schedule}
          onChange={e => setSchedule(e.target.value)}
          placeholder='e.g. "2026-05-01 to 2026-05-10"'
        />
      </div>
      <div>
        <label className="block font-medium mb-1">Placement:</label>
        <select
          className="block w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-400"
          value={placement}
          onChange={e => setPlacement(e.target.value)}
        >
          <option value="automatic">Automatic (Recommended)</option>
          <option value="manual">Manual</option>
        </select>
      </div>
      <div className="flex justify-between">
        <button type="button" onClick={back} className="bg-gray-300 px-5 py-2 rounded font-semibold">Back</button>
        <button type="submit" className="bg-blue-700 hover:bg-blue-800 px-5 py-2 text-white font-semibold rounded">
          Next
        </button>
      </div>
    </form>
  );
}

function AdCreative({ next, back, data }: any) {
  const [headline, setHeadline] = useState(data.headline || "");
  const [description, setDescription] = useState(data.description || "");
  const [url, setUrl] = useState(data.url || "");
  const [cta, setCta] = useState(data.cta || "Learn More");

  return (
    <form className="space-y-6" onSubmit={e => { e.preventDefault(); next({ headline, description, url, cta }); }}>
      <StepProgress step={3} />
      <h2 className="text-2xl font-semibold text-blue-700 mb-3">Ad Creative</h2>
      <div>
        <label className="block font-medium mb-1">Headline:</label>
        <input
          className="block w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-400"
          required
          value={headline}
          onChange={e => setHeadline(e.target.value)}
          placeholder="e.g. 'Spring Sale Now On!'"
        />
      </div>
      <div>
        <label className="block font-medium mb-1">Description:</label>
        <textarea
          className="block w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-400"
          required
          rows={2}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label className="block font-medium mb-1">Destination URL:</label>
        <input
          className="block w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-400"
          type="url"
          required
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://yourbrand.com/landing"
        />
      </div>
      <div>
        <label className="block font-medium mb-1">Call to Action:</label>
        <select
          className="block w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-400"
          value={cta}
          onChange={e => setCta(e.target.value)}
        >
          <option value="Learn More">Learn More</option>
          <option value="Shop Now">Shop Now</option>
          <option value="Sign Up">Sign Up</option>
          <option value="Contact Us">Contact Us</option>
        </select>
      </div>
      <div className="flex justify-between">
        <button type="button" onClick={back} className="bg-gray-300 px-5 py-2 rounded font-semibold">Back</button>
        <button type="submit" className="bg-blue-700 hover:bg-blue-800 px-5 py-2 text-white font-semibold rounded">
          Next
        </button>
      </div>
    </form>
  );
}

function Review({ allData, back, submit, submitting, error }: any) {
  return (
    <div className="space-y-5">
      <StepProgress step={4} />
      <h2 className="text-2xl font-semibold text-blue-700 mb-4">Review &amp; Confirm</h2>
      <div className="bg-gray-50 rounded border mb-4 p-4 text-sm">
        <strong>Campaign Name:</strong> {allData.name} <br />
        <strong>Objective:</strong> {allData.objective} <hr className="my-2"/>
        <strong>Audience:</strong> {allData.audience} <br />
        <strong>Budget:</strong> ${allData.budget}/day <br />
        <strong>Schedule:</strong> {allData.schedule} <br />
        <strong>Placement:</strong> {allData.placement} <hr className="my-2"/>
        <strong>Headline:</strong> {allData.headline} <br />
        <strong>Description:</strong> {allData.description} <br />
        <strong>Landing URL:</strong> {allData.url} <br />
        <strong>Call to Action:</strong> {allData.cta}
      </div>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <div className="flex justify-between">
        <button type="button" onClick={back} className="bg-gray-300 px-5 py-2 rounded font-semibold">
          Back
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="bg-green-600 hover:bg-green-700 px-5 py-2 rounded text-white font-semibold"
        >
          {submitting ? "Placing Ad..." : "Launch Campaign"}
        </button>
      </div>
    </div>
  );
}

export default function FacebookAdWizard() {
  const [step, setStep] = useState(1);
  const [collected, setCollected] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function next(fields: any) {
    setCollected((prev: any) => ({ ...prev, ...fields }));
    setStep(step + 1);
  }
  function back() {
    setStep(step - 1);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-panel/campaigns/launches", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          ...collected,
          type: "advertising"
        })
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Unknown error");
        setSubmitting(false);
      } else {
        setStep(step + 1);
        setSubmitting(false);
      }
    } catch (e: any) {
      setError(e.message || "Network error");
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto pt-8 px-3">
      <Link href="/admin-panel/campaigns" className="text-blue-600 hover:underline mb-6 inline-block">
        ← Back to Campaigns Dashboard
      </Link>
      {step === 1 && <CampaignDetails next={next} data={collected} />}
      {step === 2 && <AdSetDetails next={next} back={back} data={collected} />}
      {step === 3 && <AdCreative next={next} back={back} data={collected} />}
      {step === 4 && (
        <Review
          allData={collected}
          back={back}
          submit={handleSubmit}
          submitting={submitting}
          error={error}
        />
      )}
      {step === 5 && (
        <section className="flex items-center flex-col justify-center h-72">
          <div className="text-5xl text-green-500 mb-4">🎉</div>
          <div className="text-2xl font-bold mb-4">Your Facebook ad campaign has been launched!</div>
          <Link href="/admin-panel/campaigns" className="text-blue-600 hover:underline font-semibold">← Back to Campaigns Dashboard</Link>
        </section>
      )}
    </main>
  );
}
