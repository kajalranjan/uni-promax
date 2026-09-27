-- Starter interest list for the Events page. The spec leaves the list open,
-- so edit freely — add rows here and re-run, or edit them in the Supabase Table Editor.
insert into public.interests (name) values
  ('Academic & Career'),
  ('Arts & Music'),
  ('Community Service'),
  ('Cultural'),
  ('Engineering & Tech'),
  ('Entrepreneurship'),
  ('Food'),
  ('Gaming'),
  ('Greek Life'),
  ('Health & Wellness'),
  ('Outdoors'),
  ('Political & Advocacy'),
  ('Religious & Spiritual'),
  ('Science'),
  ('Social'),
  ('Sports & Recreation')
on conflict (name) do nothing;
