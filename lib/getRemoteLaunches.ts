export async function getRemoteLaunches() {
  const res = await fetch("https://myapi.com/launches", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch launches from API");
  return res.json(); // Should return an array of launches
}
