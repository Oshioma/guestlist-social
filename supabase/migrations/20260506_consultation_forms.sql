-- ---------------------------------------------------------------------------
-- Consultation intake forms for client onboarding / briefing.
--
-- - Admins can create and manage per-client consultation forms + questions.
-- - Portal users can read their own form and submit responses.
-- - Responses are stored as submissions + answer rows so the admin edit page
--   can display a collapsible history over time.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.consultation_forms (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  title text not null default 'Consultation',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultation_forms_client_idx
  on public.consultation_forms (client_id);

create table if not exists public.consultation_questions (
  id bigserial primary key,
  form_id bigint not null references public.consultation_forms(id) on delete cascade,
  prompt text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultation_questions_form_sort_idx
  on public.consultation_questions (form_id, sort_order);

create table if not exists public.consultation_submissions (
  id bigserial primary key,
  form_id bigint not null references public.consultation_forms(id) on delete cascade,
  client_id bigint not null references public.clients(id) on delete cascade,
  submitted_by uuid default auth.uid(),
  submitted_at timestamptz not null default now()
);

create index if not exists consultation_submissions_form_idx
  on public.consultation_submissions (form_id, submitted_at desc);

create index if not exists consultation_submissions_client_idx
  on public.consultation_submissions (client_id, submitted_at desc);

create table if not exists public.consultation_answers (
  id bigserial primary key,
  submission_id bigint not null references public.consultation_submissions(id) on delete cascade,
  question_id bigint references public.consultation_questions(id) on delete set null,
  question_prompt text not null,
  answer_text text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists consultation_answers_submission_idx
  on public.consultation_answers (submission_id);

alter table public.consultation_forms enable row level security;
alter table public.consultation_questions enable row level security;
alter table public.consultation_submissions enable row level security;
alter table public.consultation_answers enable row level security;

drop policy if exists consultation_forms_admin_all on public.consultation_forms;
create policy consultation_forms_admin_all on public.consultation_forms
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists consultation_forms_portal_select on public.consultation_forms;
create policy consultation_forms_portal_select on public.consultation_forms
  for select to authenticated
  using (client_id in (select public.visible_client_ids()));

drop policy if exists consultation_questions_admin_all on public.consultation_questions;
create policy consultation_questions_admin_all on public.consultation_questions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists consultation_questions_portal_select on public.consultation_questions;
create policy consultation_questions_portal_select on public.consultation_questions
  for select to authenticated
  using (
    exists (
      select 1
      from public.consultation_forms forms
      where forms.id = consultation_questions.form_id
        and forms.client_id in (select public.visible_client_ids())
    )
  );

drop policy if exists consultation_submissions_admin_all on public.consultation_submissions;
create policy consultation_submissions_admin_all on public.consultation_submissions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists consultation_submissions_portal_select on public.consultation_submissions;
create policy consultation_submissions_portal_select on public.consultation_submissions
  for select to authenticated
  using (client_id in (select public.visible_client_ids()));

drop policy if exists consultation_submissions_portal_insert on public.consultation_submissions;
create policy consultation_submissions_portal_insert on public.consultation_submissions
  for insert to authenticated
  with check (
    client_id in (select public.visible_client_ids())
    and submitted_by = auth.uid()
    and exists (
      select 1
      from public.consultation_forms forms
      where forms.id = consultation_submissions.form_id
        and forms.client_id = consultation_submissions.client_id
        and forms.client_id in (select public.visible_client_ids())
    )
  );

drop policy if exists consultation_answers_admin_all on public.consultation_answers;
create policy consultation_answers_admin_all on public.consultation_answers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists consultation_answers_portal_select on public.consultation_answers;
create policy consultation_answers_portal_select on public.consultation_answers
  for select to authenticated
  using (
    exists (
      select 1
      from public.consultation_submissions submissions
      where submissions.id = consultation_answers.submission_id
        and submissions.client_id in (select public.visible_client_ids())
    )
  );

drop policy if exists consultation_answers_portal_insert on public.consultation_answers;
create policy consultation_answers_portal_insert on public.consultation_answers
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.consultation_submissions submissions
      where submissions.id = consultation_answers.submission_id
        and submissions.client_id in (select public.visible_client_ids())
        and submissions.submitted_by = auth.uid()
    )
    and (
      question_id is null
      or exists (
        select 1
        from public.consultation_submissions submissions
        join public.consultation_questions questions
          on questions.form_id = submissions.form_id
        where submissions.id = consultation_answers.submission_id
          and questions.id = consultation_answers.question_id
      )
    )
  );

commit;
