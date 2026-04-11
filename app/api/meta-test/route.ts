export async function GET() {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;

  if (!token || !account) {
    return new Response("Missing env vars", { status: 500 });
  }

  const url = `https://graph.facebook.com/v25.0/${account}?fields=id,name&access_token=${token}`;

  const res = await fetch(url);
  const data = await res.json();

  return Response.json(data);
}
