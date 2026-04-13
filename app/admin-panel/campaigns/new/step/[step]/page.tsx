"use client";
import { useWizard } from "../../WizardContext";
import { useRouter } from "next/navigation";

const CLIENTS = [
  { id: "c1", name: "Acme Corp" },
  { id: "c2", name: "Globex Ltd" }
];

const TEMPLATES = [
  { id: "modern", name: "Modern Promo", preview: "/templates/modern.png" },
  { id: "classic", name: "Classic Banner", preview: "/templates/classic.png" },
  { id: "minimal", name: "Minimalist", preview: "/templates/minimal.png" }
];

export default function StepPage({ params }: { params: { step: string } }) {
  const { data, setData } = useWizard();
  const router = useRouter();
  const step = Number(params.step);

  // Step 1: Client selection
  if (step === 1) {
    return (
      <main className="max-w-lg mx-auto pt-20">
        <h1 className="text-2xl font-bold mb-4">Step 1: Select Client</h1>
        <ul className="mb-8">
          {CLIENTS.map(c => (
            <li key={c.id}>
              <button
                className={`block w-full text-left px-4 py-3 rounded border mb-2 ${
                  data.client === c.id ? "bg-blue-100 border-blue-500" : "bg-white"
                }`}
                onClick={() => setData({ client: c.id })}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
        <button
          disabled={!data.client}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
          onClick={() => router.push(`/admin-panel/campaigns/new/step/2`)}
        >
          Next
        </button>
      </main>
    );
  }

  // Step 2: Goal selection
  if (step === 2) {
    return (
      <main className="max-w-lg mx-auto pt-20">
        <h1 className="text-2xl font-bold mb-4">Step 2: Campaign Goal</h1>
        <div className="mb-8 space-y-2">
          {["Leads", "Sales", "Traffic"].map(goal => (
            <button
              key={goal}
              className={`block w-full px-4 py-3 rounded border ${
                data.goal === goal ? "bg-blue-100 border-blue-500" : "bg-white"
              }`}
              onClick={() => setData({ goal })}
            >
              {goal}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <button
            className="px-4 py-2 rounded border"
            onClick={() => router.push(`/admin-panel/campaigns/new/step/1`)}
          >
            Back
          </button>
          <button
            disabled={!data.goal}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
            onClick={() => router.push(`/admin-panel/campaigns/new/step/3`)}
          >
            Next
          </button>
        </div>
      </main>
    );
  }

  // Step 3: Template selection (with image previews)
  if (step === 3) {
    return (
      <main className="max-w-lg mx-auto pt-20">
        <h1 className="text-2xl font-bold mb-4">Step 3: Pick an Ad Template</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
          {TEMPLATES.map(temp => (
            <button
              type="button"
              key={temp.id}
              onClick={() => setData({ template: temp.id })}
              className={`text-left rounded-lg border-2 p-4 transition ${
                data.template === temp.id
                  ? "border-blue-600 shadow-lg ring-2 ring-blue-400"
                  : "border-gray-200 hover:border-blue-300"
              }`}
            >
              <img
                src={temp.preview}
                alt={temp.name}
                className="w-full h-24 object-contain mb-2 bg-gray-50 rounded"
                style={{ pointerEvents: "none" }}
              />
              <div className="font-semibold">{temp.name}</div>
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <button
            className="px-4 py-2 rounded border"
            onClick={() => router.push(`/admin-panel/campaigns/new/step/2`)}
          >
            Back
          </button>
          <button
            disabled={!data.template}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-300"
            onClick={() => router.push(`/admin-panel/campaigns/new/step/4`)}
          >
            Next
          </button>
        </div>
      </main>
    );
  }

  // Placeholder for steps 4+
  return (
    <div className="max-w-lg mx-auto pt-20">
      <h1 className="text-xl font-bold">More steps coming soon!</h1>
      <button
        className="mt-4 bg-gray-200 px-4 py-2 rounded"
        onClick={() => router.push(`/admin-panel/campaigns/new/step/${step - 1}`)}
      >
        Back
      </button>
    </div>
  );
}
