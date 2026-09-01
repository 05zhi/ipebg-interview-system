begin;
insert into public.system_settings (key, value) values ('scorecard_templates_enabled', 'false'::jsonb) on conflict (key) do nothing;
commit;
