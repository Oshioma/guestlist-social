# Auth module

Self-contained email/password authentication with member management and
role-based access control. Built on Supabase Auth + `@supabase/ssr` (PKCE).

The same module is designed to drop into any Next.js 15+ App Router project
that uses Supabase. This doc exists so we never have to reinvent this again
and so a second (or third) app can adopt it in 30 minutes.

---

## Routes

| Path | Purpose |
|---|---|
| `/sign-in` | Email + password sign-in |
| `/sign-up` | Public self-signup (disable by deleting the route if you don't want this) |
| `/forgot-password` | Sends a reset-password email |
| `/reset-password` | Sets a new password after clicking the reset link |
| `/accept-invite` | First-time password + name setup after an admin invite |
| `/auth/callback` | Handles PKCE code (OAuth) and OTP `token_hash` (invite / recovery / signup) from Supabase emails |
| `POST /sign-out` | Invalidates the session and redirects to `/sign-in` |
| `/post-login` | Role-based dispatcher after login (admin → `/app/dashboard`, client → `/portal/{id}`) |
| `/app/settings/members` | Admin-only page to invite, edit, and remove teammates |

All of the user-facing forms use React 19 `useActionState` + server actions,
so the Supabase anon key is never invoked from the browser and Zod runs
server-side.

---

## Permissions model

Two dimensions, independent of each other:

- **`user_roles.role`** — `admin` or `member`
  - Admins see `/app/settings/members` and can invite/edit/remove
  - Members don't
- **`user_roles.can_run_ads`** — boolean
  - Gates any page wrapped with `requireAdsAccess()`
  - Read access (dashboards, tables) is not restricted — only create/edit

Portal/client users are separated by the `client_user_links` table. If a
user has a link row, they're a client — they never show up on the members
page and can't reach `/app/*`. Middleware redirects them to their
`/portal/{clientId}`.

First-admin bootstrap is a one-row SQL insert (see below).

---

## File layout

```
app/
  (auth)/                            ← route group; shares one layout + CSS
    layout.tsx                       base frame (no admin shell)
    auth.css
    sign-in/{page.tsx,SignInForm.tsx}
    sign-up/{page.tsx,SignUpForm.tsx}
    forgot-password/{page.tsx,ForgotPasswordForm.tsx}
    reset-password/{page.tsx,ResetPasswordForm.tsx}
    accept-invite/{page.tsx,AcceptInviteForm.tsx,actions.ts}

  auth/callback/route.ts             PKCE + OTP return handler
  sign-out/route.ts                  POST-only logout
  post-login/page.tsx                role dispatcher (admin vs client)

  admin-panel/
    settings/members/
      page.tsx                       list + invite
      InviteMemberForm.tsx
      MemberRow.tsx                  inline edit + remove

lib/
  supabase/
    server.ts                        SSR client (publishable key + cookies)
    client.ts                        browser client
    admin.ts                         service-role client (bypasses RLS)
    middleware.ts                    cookie refresh helper

  auth/
    actions.ts                       sign-in/up, reset, send-reset, sign-out
    next.ts                          safe-redirect helper for ?next=
    turnstile.ts                     optional Cloudflare bot check
    permissions.ts                   getMemberAccess, requireAdmin,
                                     requireAdsAccess, canRunAds, isAdmin
    member-actions.ts                invite / update / remove (service-role)

middleware.ts                        session refresh + protected-route gate

supabase/migrations/
  20260417_user_roles.sql            role + can_run_ads table with RLS
```

---

## How the session lives across requests

1. Sign-in server action calls `supabase.auth.signInWithPassword`. Supabase
   returns an access + refresh token pair and `@supabase/ssr` writes them as
   HTTP-only cookies scoped to this app's domain.
2. `middleware.ts` runs on every request through `lib/supabase/middleware.ts`
   which calls `supabase.auth.getUser()` — this refreshes the tokens when
   near expiry and rewrites cookies on the outgoing response.
3. Server components/actions read the session via
   `lib/supabase/server.ts` (`createClient()`), which wires the same cookies
   through the Next.js `cookies()` API.
4. Browser code uses `lib/supabase/client.ts` (`createBrowserClient`). It's
   only used in rare places; most flows route through server actions.
5. `POST /sign-out` calls `supabase.auth.signOut()` (clears cookies) then
   `NextResponse.redirect('/sign-in', { status: 303 })`.

---

## Invite flow

1. Admin opens `/app/settings/members`, submits email + role + can_run_ads
2. `inviteMember()` (service-role):
   - `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '<site>/auth/callback?type=invite' })`
   - Upserts the `user_roles` row with chosen role + flag
3. Invitee receives email. Click → `/auth/callback?token_hash=…&type=invite`
4. `/auth/callback` calls `verifyOtp({ type: 'invite', token_hash })` →
   session cookies set → redirect to `/accept-invite`
5. Invitee sets a password + full name on `/accept-invite`
6. `acceptInvite()` calls `supabase.auth.updateUser({ password, data: { full_name } })`
7. Redirect to `/post-login` which dispatches based on role

Password recovery is the same shape with `type: 'recovery'` → redirects to
`/reset-password`.

---

## Required environment variables

```
NEXT_PUBLIC_SUPABASE_URL=                      # Supabase project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=          # Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY=                     # server-only; required for invite/delete
NEXT_PUBLIC_SITE_URL=https://yourapp.com       # used for auth-email redirect URLs

# optional bot protection on auth forms
# TURNSTILE_SECRET_KEY=
# NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

## Required Supabase dashboard settings

- **Auth → URL Configuration → Site URL** = production URL
- **Auth → URL Configuration → Redirect URLs** → include
  `https://yourapp.com/auth/callback`

Without the redirect URL, Supabase will refuse to send users back after
email verification / recovery / invites.

---

## One-time setup per app

After deploying and applying the migration:

```sql
-- the migration is idempotent and drops any legacy role values
-- supabase/migrations/20260417_user_roles.sql

-- promote yourself (grab your UID from Supabase → Auth → Users)
insert into user_roles (user_id, role, can_run_ads)
values ('PASTE-YOUR-UID', 'admin', true)
on conflict (user_id) do update
  set role = 'admin', can_run_ads = true;
```

You can now sign in at `/sign-in` and use `/app/settings/members` to invite
the rest of the team.

---

## Porting to another app

The module is deliberately decoupled from everything under `/app/admin-panel`
except for the members page + sidebar wiring. To adopt it in a fresh
Next.js 15 repo:

### 1. Install deps

```bash
npm i @supabase/ssr @supabase/supabase-js zod
```

### 2. Copy files verbatim

Copy these paths unchanged — they're self-contained:

```
app/(auth)/                          ← whole folder
app/auth/callback/route.ts
app/sign-out/route.ts
lib/supabase/{server,client,admin,middleware}.ts
lib/auth/{actions,next,turnstile,permissions,member-actions}.ts
supabase/migrations/20260417_user_roles.sql
```

Optional (only if you want the members admin UI):

```
app/admin-panel/settings/members/{page,InviteMemberForm,MemberRow}.tsx
```

### 3. Adapt four files

- **`middleware.ts`** — copy from guestlist-social, then edit
  `PROTECTED_PREFIXES` / `ADMIN_PREFIXES` to match the new repo's protected
  routes. If the new repo has no client-portal concept, drop the
  `client_user_links` lookup and just redirect unauthed users to
  `/sign-in?next=<path>`.

- **`app/post-login/page.tsx`** — this is the role dispatcher. If the new
  repo has no admin/client split, make it
  `redirect(getSafeNext(next))` and that's it.

- **`lib/auth/permissions.ts`** — if the new repo has no `client_user_links`
  table, remove that query from `getMemberAccess()`. Otherwise leave it.

- **Sidebar/topbar integration** — add a sign-out button anywhere in the
  signed-in shell:
  ```tsx
  <form action="/sign-out" method="post" style={{ margin: 0 }}>
    <button type="submit">Sign out</button>
  </form>
  ```
  And hide the Members nav link behind `isAdmin` (use `getMemberAccess()`
  in the server layout, pass `isAdmin` down as a prop).

### 4. Set env vars + Supabase redirect URL + run migration + promote admin

Same list as the top of this doc.

That's it. End-to-end port is typically under an hour once the env vars
and redirect URL are set.
