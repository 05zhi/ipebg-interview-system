begin;

update public.candidates set email = null where trim(email) = '';
update public.candidates set phone = null where trim(phone) = '';

alter table public.candidates
  alter column email drop not null,
  alter column phone drop not null;

alter table public.candidates
  drop constraint if exists candidates_email_not_blank;

commit;
