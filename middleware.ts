// ---------------------------------------------------------------------------
// middleware.ts — root-level request gate.
//
// Responsibility order:
//   1. Let /login and /auth/callback through unconditionally (public routes).
//   2. Require a `token` cookie for every other route; redirect to /login if
//      absent or invalid.  The `isUserMember` function is the single place to
//      swap in real membership logic (see lib/app_memberships.ts).
//   3. For routes under /app, /admin-panel, and /portal run the existing
//      Supabase session refresh + role-based access checks.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "./lib/supabase/middleware";
import { isUserMember } from "./lib/app_memberships";

// Routes that are publicly accessible — the middleware exits early for these
// so unauthenticated users can reach the sign-in flow without redirect loops.
const PUBLIC_PATHS = ["/login", "/auth/callback"];

// Anything under one of these prefixes requires a logged-in Supabase user.
// The role gating below additionally restricts each prefix to admins or clients.
const PROTECTED_PREFIXES = ["/app", "/admin-panel", "/portal"];
const ADMIN_PREFIXES = ["/app", "/admin-panel"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Step 1: skip the public auth routes entirely ─────────────────────────
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // ── Step 2: token-cookie gate (hotname.co.uk auth layer) ─────────────────
  // Every route other than the public ones above requires a `token` cookie.
  const token = request.cookies.get("token")?.value;

  // Validate membership.  For demo purposes isUserMember accepts any non-empty
  // token.  Replace the implementation in lib/app_memberships.ts with a real
  // check against app_memberships before going to production.
  const member = await isUserMember(token);

  if (!member) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // ── Step 3: Supabase session + role-based checks (existing logic) ─────────
  // Only routes under the protected prefixes need the full Supabase auth check.
  const isSupabaseProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isSupabaseProtected) {
    return NextResponse.next();
  }

  const response = await updateSession(request);

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
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
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

    if (ADMIN_PREFIXES.some((p) => pathname.startsWith(p))) {
      const url = request.nextUrl.clone();
      url.pathname = ownPortal;
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (pathname === "/portal" || pathname === "/portal/") {
      const url = request.nextUrl.clone();
      url.pathname = ownPortal;
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Anything under /portal/{otherClientId}/* — kick them back to their own.
    const m = pathname.match(/^\/portal\/(\d+)(?=\/|$)/);
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
  // Run on all routes except Next.js internals and static assets.
  // The PUBLIC_PATHS check at the top of the function handles /login and
  // /auth/callback without needing to exclude them from the matcher.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff|woff2|ttf|eot|ico|map)$).*)",
  ],
};
