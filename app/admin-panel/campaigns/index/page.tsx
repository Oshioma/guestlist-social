import Link from "next/link";

// You will later replace the fetch with your Supabase query or a real API call.
export default async function TemplatesIndexPage() {
  // Placeholder: Replace with real data fetch (see below)
  const templates: Array<{id: string, name: string, client_scope: string}> = [
    { id: "1", name: "Local Leads", client_scope: "org" },
    { id: "2", name: "eCom Sales", client_scope: "private" }
  ];
  // Uncomment and use when you create an API route:
  // const templates = await fetch("/api/admin-panel/templates").then(r => r.json());

  return (
    <main>
      <h1 className="text-xl mb-4">🏷️ Campaign Templates</h1>
      <ul>
        {templates.map((tpl) => (
          <li key={tpl.id}>
            <Link href={`/admin-panel/campaigns/launch/${tpl.id}`}>
              {tpl.name} [{tpl.client_scope}]
            </Link>
          </li>
        ))}
      </ul>
      <Link className="btn" href="/admin-panel/campaigns/create">+ New Template</Link>
    </main>
  );
}
