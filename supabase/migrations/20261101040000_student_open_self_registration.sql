-- L'inscription publique crée le dossier étudiant après confirmation de l'e-mail.

drop function if exists public.admin_import_student_roster(jsonb);

create or replace function public.complete_student_registration()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    _user_id uuid := auth.uid();
    _auth_user auth.users%rowtype;
    _first_name text;
    _last_name text;
    _phone text;
    _matricule text;
    _existing_matricule text;
    _existing_role public.app_role;
begin
    if _user_id is null then
        raise exception 'Sign in to complete student registration'
            using errcode = '42501';
    end if;

    select *
    into _auth_user
    from auth.users
    where id = _user_id;

    if not found or _auth_user.email_confirmed_at is null then
        raise exception 'Confirm your email address before completing registration'
            using errcode = '42501';
    end if;

    if _auth_user.raw_user_meta_data ->> 'ipto_student_registration' is distinct from 'true' then
        raise exception 'This account was not created through student registration'
            using errcode = '42501';
    end if;

    _first_name := nullif(trim(_auth_user.raw_user_meta_data ->> 'first_name'), '');
    _last_name := nullif(trim(_auth_user.raw_user_meta_data ->> 'last_name'), '');
    _phone := nullif(trim(_auth_user.raw_user_meta_data ->> 'phone'), '');
    _matricule := nullif(trim(_auth_user.raw_user_meta_data ->> 'matricule'), '');

    if _first_name is null or length(_first_name) > 100
       or _last_name is null or length(_last_name) > 100
       or _matricule is null or length(_matricule) > 64
       or (_phone is not null and length(_phone) not between 6 and 32) then
        raise exception 'Invalid student registration details'
            using errcode = '22023';
    end if;

    select role
    into _existing_role
    from public.user_roles
    where user_id = _user_id;

    if found and _existing_role <> 'student'::public.app_role then
        raise exception 'This account already has a different role'
            using errcode = '23514';
    end if;

    select matricule
    into _existing_matricule
    from public.students
    where id = _user_id;

    if found and _existing_matricule <> _matricule then
        raise exception 'This account already has a different student number'
            using errcode = '23514';
    end if;

    insert into public.profiles (id, first_name, last_name, phone)
    values (_user_id, _first_name, _last_name, _phone)
    on conflict (id) do update
        set first_name = excluded.first_name,
            last_name = excluded.last_name,
            phone = excluded.phone;

    insert into public.students (id, matricule)
    values (_user_id, _matricule)
    on conflict (id) do nothing;

    insert into public.user_roles (user_id, role)
    values (_user_id, 'student'::public.app_role)
    on conflict (user_id) do nothing;

    if not exists (
        select 1
        from public.user_roles
        where user_id = _user_id
          and role = 'student'::public.app_role
    ) then
        raise exception 'This account already has a different role'
            using errcode = '23514';
    end if;
end;
$$;

revoke all on function public.complete_student_registration() from public, anon;
grant execute on function public.complete_student_registration() to authenticated;
