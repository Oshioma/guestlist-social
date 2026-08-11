import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "./lib/supabase/middleware";

// Anything under one of these prefixes requires a logged-in user. The role
// gating below additionally restricts each prefix to admins or clients.
const PROTECTED_PREFIXES = ["/app", "/admin-panel", "/portal", "/proofer"];
const ADMIN_PREFIXES = ["/app", "/admin-panel", "/proofer"];

// Hosts that serve the standalone Proofer at their own root. On these hosts the
// Proofer route tree (which physically lives under /proofer) is exposed with
// the /proofer prefix hidden, so postproofer.com/ IS the board, /pillars is the
// pillars page, and so on. Keep this list in sync with app/proofer/base.ts.
const PROOFER_HOSTS = new Set(["postproofer.com", "www.postproofer.com"]);

// The clean (prefix-less) paths that map onto the /proofer route tree on a
// Proofer host. Everything else on that host either passes straight through
// (auth pages, API, assets) or is bounced (the other product surfaces).
function isProoferSurfacePath(path: string): boolean {
  return (
    path === "/" ||
    path === "/pillars" ||
    path.startsWith("/pillars/") ||
    path === "/clients" ||
    path.startsWith("/clients/") ||
    path === "/teams" ||
    path.startsWith("/teams/") ||
    path === "/super-admin" ||
    path.startsWith("/super-admin/") ||
    path === "/publish" ||
    path === "/onboarding"
  );
}

export async function middleware(request: NextRequest) {
  const host =
    request.headers.get("host")?.toLowerCase().split(":")[0] ?? "";
  const isProoferHost = PROOFER_HOSTS.has(host);
  const path = request.nextUrl.pathname;

  // `internalPath` is the route the app actually serves. On a Proofer host the
  // clean URL is mapped onto the physical /proofer/* tree; everywhere else it
  // is just the request path unchanged.
  let internalPath = path;

  if (isProoferHost) {
    // Canonical URLs on this domain never show the /proofer prefix. If an old
    // or server-generated link leaks one in, redirect to the clean address so
    // there's a single URL per page.
    if (path === "/proofer" || path.startsWith("/proofer/")) {
      const url = request.nextUrl.clone();
      url.pathname = path.slice("/proofer".length) || "/";
      return NextResponse.redirect(url);
    }

    // This domain only exposes Proofer plus the shared auth pages. The other
    // product surfaces don't belong here — send them to the Proofer home.
    if (
      path.startsWith("/admin-panel") ||
      path.startsWith("/app") ||
      path.startsWith("/portal")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isProoferSurfacePath(path)) {
      internalPath = path === "/" ? "/proofer" : `/proofer${path}`;
    }
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => internalPath.startsWith(p));

  // Non-protected requests (auth pages, API, static, marketing pages) pass
  // straight through. The matcher is broad enough to run on the Proofer host's
  // clean root, so this early exit keeps every other route behaving as before.
  if (!isProtected) return NextResponse.next();

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
    // On a Proofer host the domain root is public: a logged-out visitor lands
    // on the marketing / sign-up home page instead of a bare sign-in bounce.
    // Deep links still go through sign-in so they return where they asked.
    if (isProoferHost && path === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/welcome";
      url.search = "";
      const rewrite = NextResponse.rewrite(url, { request });
      response.cookies
        .getAll()
        .forEach((cookie) => rewrite.cookies.set(cookie));
      return rewrite;
    }

    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    // Return the viewer to the clean URL they asked for, not the internal one.
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Resolve the viewer team-side, mirroring getViewer() (which middleware
  // can't import — that file is server-only and this runs in the edge
  // runtime). Agency staff take precedence: a user_roles row → admin, who
  // roams. Otherwise the client account comes from team membership; RLS
  // scopes team_accounts to the caller's own teams, so this only returns
  // accounts they belong to.
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const isStaff = roleRow !== null;

  // Non-staff posture comes from team membership. A posting role (owner/admin/
  // member) in any team makes them a poster (Proofer surface); otherwise a
  // 'client' membership with an account makes them a portal client. RLS scopes
  // team_members/team_accounts to the caller's own rows.
  let isPoster = false;
  let linkedClientId: number | null = null;
  if (!isStaff) {
    const { data: memberships } = await supabase
      .from("team_members")
      .select("role")
      .eq("user_id", user.id);
    const roles = (memberships as { role: string }[] | null)?.map((m) => m.role) ?? [];
    isPoster = roles.some(
      (r) => r === "owner" || r === "admin" || r === "proofer" || r === "member"
    );
    if (!isPoster) {
      const { data: acct } = await supabase
        .from("team_accounts")
        .select("client_id")
        .order("client_id", { ascending: true })
        .limit(1)
        .maybeSingle();
      linkedClientId = (acct as { client_id: number } | null)?.client_id ?? null;
    }
  }
  const isClientUser = !isStaff && !isPoster && linkedClientId !== null;

  // Admission is deny-by-default. A logged-in account that is neither agency
  // staff (user_roles), a team poster, nor a team client is NOT admitted —
  // bounce it to /sign-in instead of letting it roam. Keep in sync with
  // getViewer()/getProoferAccess().
  if (!isStaff && !isPoster && !isClientUser) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("error", "not-authorized");
    return NextResponse.redirect(url);
  }

  // Team posters: the Proofer board is their only surface. On a Proofer host
  // the top-of-middleware block already fenced off the other product surfaces
  // and maps clean paths onto /proofer, so only the normal host needs a nudge
  // off the admin panel and portal.
  if (isPoster && !isProoferHost) {
    if (
      path.startsWith("/app") ||
      path.startsWith("/admin-panel") ||
      path.startsWith("/portal")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/proofer";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Client users can only see /portal/{theirClientId}/*. Anywhere else gets
  // bounced. The bounce target is always their own portal — that's the
  // "calmer mirror" the feature promises.
  if (isClientUser) {
    // The standalone Proofer domain has no portal to bounce to — Proofer is an
    // admin-only surface, so a client account simply isn't authorised here.
    if (isProoferHost) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = "";
      url.searchParams.set("error", "not-authorized");
      return NextResponse.redirect(url);
    }

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
  // previewing what a client sees. On a Proofer host, serve the physical
  // /proofer/* route behind the clean URL, carrying the refreshed session
  // cookies onto the rewrite response.
  if (internalPath !== path) {
    const url = request.nextUrl.clone();
    url.pathname = internalPath;
    const rewrite = NextResponse.rewrite(url, { request });
    response.cookies.getAll().forEach((cookie) => rewrite.cookies.set(cookie));
    return rewrite;
  }

  return response;
}

export const config = {
  // Only the routes that need gating. This covers the product surfaces plus the
  // Proofer host's clean paths ("/", "/pillars", "/clients", "/teams",
  // "/super-admin", "/publish") so that host rewrites them onto the /proofer
  // tree — without
  // running the session refresh + auth queries on every asset, API call, RSC
  // fetch and server action across the whole app (which the previous catch-all
  // matcher did, making saves crawl). Keep this in sync with
  // isProoferSurfacePath above: every clean path it maps must be matched here,
  // or the middleware never runs for it on the Proofer host and it 404s.
  matcher: [
    "/",
    "/app/:path*",
    "/admin-panel/:path*",
    "/portal/:path*",
    "/proofer/:path*",
    "/pillars/:path*",
    "/clients/:path*",
    "/teams/:path*",
    "/teams",
    "/super-admin/:path*",
    "/super-admin",
    "/publish",
    "/onboarding",
  ],
};
