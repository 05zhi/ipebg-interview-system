begin;

insert into public.system_settings (key, value)
values ('email_notifications_enabled', 'false'::jsonb)
on conflict (key) do nothing;

commit;
