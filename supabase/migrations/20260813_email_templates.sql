-- Editable transactional email templates.
--
-- The site sends a small set of transactional emails (team invites, review
-- digests) through Resend. Their subject + body live in code as defaults; this
-- table lets the platform owner override them from the Super admin → Emails
-- tab. A missing row means "use the built-in default", so the feature is purely
-- additive and every send degrades gracefully if this table is empty or absent.
--
-- Access: only ever read/written through the service-role client behind a
-- super-admin gate (lib/email/template-actions.ts). RLS is enabled with NO
-- policies so no tenant session can read or write it; the service role bypasses
-- RLS as designed.

create table if not exists public.email_templates (
  key          text primary key,
  subject      text not null,
  body_html    text not null,
  button_label text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null
);

alter table public.email_templates enable row level security;

-- No policies: locked to the service role only (super-admin tooling).
