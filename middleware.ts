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
    path.startsWith("/clients/")
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
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    // Return the viewer to the clean URL they asked for, not the internal one.
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

  // Admission is deny-by-default. A logged-in account that is neither a
  // client (client_user_links) nor an invited admin-panel user (user_roles)
  // is NOT admitted — bounce it to /sign-in instead of letting it roam the
  // admin panel. This is the gate that stops an account created outside the
  // invite flow from gaining access. Keep it in sync with getViewer().
  if (!isClientUser) {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!roleRow) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = "";
      url.searchParams.set("error", "not-authorized");
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
  // Proofer host's clean paths ("/", "/pillars", "/clients") so that host still
  // rewrites correctly — without running the session refresh + auth queries on
  // every asset, API call, RSC fetch and server action across the whole app
  // (which the previous catch-all matcher did, making saves crawl).
  matcher: [
    "/",
    "/app/:path*",
    "/admin-panel/:path*",
    "/portal/:path*",
    "/proofer/:path*",
    "/pillars/:path*",
    "/clients/:path*",
  ],
};
