begin;

create table if not exists public.consultation_default_questions (
  sort_order integer primary key,
  prompt text not null,
  updated_at timestamptz not null default now()
);

create index if not exists consultation_default_questions_sort_idx
  on public.consultation_default_questions (sort_order);

insert into public.consultation_default_questions (sort_order, prompt)
values
  (1, 'Company name / handles'),
  (2, 'Mission statement'),
  (3, 'How would you describe the personality of your business?'),
  (4, 'How would you describe your MAIN service or product?'),
  (5, 'Are there particular services or products you would like to push?'),
  (6, 'What kind of content do you have that would be good to push out?'),
  (7, 'List any special events happening over the next 2 months?'),
  (8, 'List any platforms we should promote'),
  (9, 'What would you say are your main marketing messages?'),
  (10, 'Who are your main competitors?'),
  (11, 'Competitions / Offers'),
  (12, 'Locations of target market'),
  (13, 'What are common denominators of your target market?'),
  (14, 'List friends of your company - we can tag them in messages'),
  (15, 'Any other information that might assist us in preparing some wonderful messages for you'),
  (16, 'Music Genre'),
  (17, 'What are your opening times? What time / day do most purchases happen (If applicable)'),
  (18, 'What are the most important objectives of your social media campaign and presence?'),
  (19, 'What else would your audience be interested in?'),
  (20, 'Number of followers and fans'),
  (21, 'What is your brand story?'),
  (22, 'Email address for customer querries'),
  (23, 'What causes would you like to or do you support? Is there a cause that would like to become a champion of?'),
  (24, 'What is your quietest time / busiest time?'),
  (25, 'Regular or weekly occurrences that you would like us to include?'),
  (26, 'Based on this personality, what kind of tone/persona would you like to come across?'),
  (27, 'Inspiration'),
  (28, 'What specific goals do you have for the next quarter?'),
  (29, 'What other marketing do you do?'),
  (30, 'What ''behind the scenes'' content do you have we can use?'),
  (31, 'Are there particular people, accounts or influencers you would like to try and engage with or target?'),
  (32, 'Are there any key brand phrases or brand language you would like us to use?'),
  (33, 'Have you got password?'),
  (34, 'Are there any common questions you get asked by customers? What are the responses'),
  (35, 'It''s recommending that we respond with a name')
on conflict (sort_order) do update
set
  prompt = excluded.prompt,
  updated_at = now();

alter table public.consultation_default_questions enable row level security;

drop policy if exists consultation_default_questions_admin_all on public.consultation_default_questions;
create policy consultation_default_questions_admin_all on public.consultation_default_questions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists consultation_default_questions_portal_select on public.consultation_default_questions;
create policy consultation_default_questions_portal_select on public.consultation_default_questions
  for select to authenticated
  using (true);

commit;
