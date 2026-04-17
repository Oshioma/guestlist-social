import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "./lib/supabase/middleware";

// Anything under one of these prefixes requires a logged-in user. The role
// gating below additionally restricts each prefix to admins or clients.
const PROTECTED_PREFIXES = ["/app", "/admin-panel", "/portal"];
const ADMIN_PREFIXES = ["/app", "/admin-panel"];

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  if (!isProtected) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Resolve the viewer's client link by reading client_user_links directly.
  // Middleware can't import the full viewer helper because that file is
  // server-only and middleware runs in the edge runtime; this lightweight
  // query is sufficient.
  const { data: link } = await supabase
    .from("client_user_links")
    .select("client_id")
    .eq("auth_user_id", user.id)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  const linkedClientId = (link as { client_id: number } | null)?.client_id ?? null;
  const isClientUser = linkedClientId !== null;

  // Client users can only see /portal/{theirClientId}/*. Anywhere else gets
  // bounced. The bounce target is always their own portal — that's the
  // "calmer mirror" the feature promises.
  if (isClientUser) {
    const ownPortal = `/portal/${linkedClientId}`;

    if (ADMIN_PREFIXES.some((p) => path.startsWith(p))) {
      const url = request.nextUrl.clone();
      url.pathname = ownPortal;
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (path === "/portal" || path === "/portal/") {
      const url = request.nextUrl.clone();
      url.pathname = ownPortal;
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Anything under /portal/{otherClientId}/* — kick them back to their own.
    const m = path.match(/^\/portal\/(\d+)(?=\/|$)/);
    if (m && Number(m[1]) !== linkedClientId) {
      const url = request.nextUrl.clone();
      url.pathname = ownPortal;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Admins are free to roam anywhere — including /portal/{anyClientId} for
  // previewing what a client sees. The "Client view" link in the admin
  // sidebar is the operator's intended entry point.
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/admin-panel/:path*", "/portal/:path*"],
};
