-- Préautorisation des étudiants et inscription autonome après confirmation de l'e-mail.

create table if not exists public.student_registration_roster (
    email text primary key
        check (email = lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
    matricule text not null unique
        check (length(trim(matricule)) between 1 and 64),
    first_name text
        check (first_name is null or length(trim(first_name)) between 1 and 100),
    last_name text
        check (last_name is null or length(trim(last_name)) between 1 and 100),
    phone text
        check (phone is null or length(trim(phone)) between 6 and 32),
    claimed_by uuid unique,
    claimed_at timestamptz,
    created_by uuid not null references auth.users (id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint student_registration_claim_state
        check ((claimed_by is null) = (claimed_at is null))
);

alter table public.student_registration_roster enable row level security;
revoke all on table public.student_registration_roster from public, anon, authenticated;

create or replace function public.admin_import_student_roster(_students jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    _student jsonb;
    _email text;
    _matricule text;
    _count integer;
begin
    if not public.has_role('admin'::public.app_role) then
        raise exception 'Administrator role required'
            using errcode = '42501';
    end if;

    if _students is null or jsonb_typeof(_students) <> 'array' then
        raise exception 'Student import must be a JSON array'
            using errcode = '22023';
    end if;
    if jsonb_array_length(_students) not between 1 and 100 then
        raise exception 'Import between 1 and 100 students at a time'
            using errcode = '22023';
    end if;

    for _student in select value from jsonb_array_elements(_students) as rows(value)
    loop
        if jsonb_typeof(_student) <> 'object'
           or jsonb_typeof(_student -> 'email') is distinct from 'string'
           or jsonb_typeof(_student -> 'matricule') is distinct from 'string'
           or not coalesce(jsonb_typeof(_student -> 'first_name') in ('string', 'null'), true)
           or not coalesce(jsonb_typeof(_student -> 'last_name') in ('string', 'null'), true)
           or not coalesce(jsonb_typeof(_student -> 'phone') in ('string', 'null'), true) then
            raise exception 'Each row must contain an email and student number'
                using errcode = '22023';
        end if;

        _email := lower(trim(_student ->> 'email'));
        _matricule := trim(_student ->> 'matricule');

        if length(_email) > 254
           or _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
           or length(_matricule) not between 1 and 64
           or coalesce(length(trim(_student ->> 'first_name')), 0) > 100
           or coalesce(length(trim(_student ->> 'last_name')), 0) > 100
           or coalesce(length(trim(_student ->> 'phone')), 0) > 32
           or (
               coalesce(length(trim(_student ->> 'phone')), 0) > 0
               and length(trim(_student ->> 'phone')) < 6
           ) then
            raise exception 'Invalid email, student number, or profile field'
                using errcode = '22023';
        end if;
    end loop;

    if exists (
        select 1
        from jsonb_array_elements(_students) as rows(value)
        group by lower(trim(value ->> 'email'))
        having count(*) > 1
    ) or exists (
        select 1
        from jsonb_array_elements(_students) as rows(value)
        group by trim(value ->> 'matricule')
        having count(*) > 1
    ) then
        raise exception 'Duplicate email or student number in import'
            using errcode = '22023';
    end if;

    if exists (
        select 1
        from jsonb_array_elements(_students) as rows(value)
        join public.students on students.matricule = trim(value ->> 'matricule')
    ) then
        raise exception 'A student number is already assigned to an existing account'
            using errcode = '23505';
    end if;

    insert into public.student_registration_roster (
        email,
        matricule,
        first_name,
        last_name,
        phone,
        created_by
    )
    select
        lower(trim(value ->> 'email')),
        trim(value ->> 'matricule'),
        nullif(trim(value ->> 'first_name'), ''),
        nullif(trim(value ->> 'last_name'), ''),
        nullif(trim(value ->> 'phone'), ''),
        auth.uid()
    from jsonb_array_elements(_students) as rows(value);

    get diagnostics _count = row_count;
    return _count;
exception
    when unique_violation then
        raise exception 'An email or student number is already on the approved student list'
            using errcode = '23505';
end;
$$;

create or replace function public.complete_student_registration()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    _user_id uuid := auth.uid();
    _auth_user auth.users%rowtype;
    _roster public.student_registration_roster%rowtype;
    _requested_matricule text;
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

    _requested_matricule := trim(_auth_user.raw_user_meta_data ->> 'matricule');
    if _requested_matricule is null or _requested_matricule = '' then
        raise exception 'The student number is missing from this registration'
            using errcode = '22023';
    end if;

    select *
    into _roster
    from public.student_registration_roster
    where email = lower(_auth_user.email)
      and matricule = _requested_matricule
    for update;

    if not found then
        raise exception 'This email and student number are not on the approved IPTO list'
            using errcode = '42501';
    end if;

    if _roster.claimed_by is not null and _roster.claimed_by <> _user_id then
        raise exception 'This approved student record has already been claimed'
            using errcode = '23505';
    end if;

    select role
    into _existing_role
    from public.user_roles
    where user_id = _user_id;

    if found and _existing_role <> 'student'::public.app_role then
        raise exception 'This account already has a different role'
            using errcode = '23514';
    end if;

    insert into public.profiles (id, first_name, last_name, phone)
    values (_user_id, _roster.first_name, _roster.last_name, _roster.phone)
    on conflict (id) do update
        set first_name = excluded.first_name,
            last_name = excluded.last_name,
            phone = excluded.phone;

    insert into public.students (id, matricule)
    values (_user_id, _roster.matricule)
    on conflict (id) do update
        set matricule = excluded.matricule;

    insert into public.user_roles (user_id, role)
    values (_user_id, 'student'::public.app_role)
    on conflict (user_id) do update
        set role = excluded.role;

    update public.student_registration_roster
    set claimed_by = _user_id,
        claimed_at = coalesce(claimed_at, now())
    where email = _roster.email;
end;
$$;

revoke all on function public.admin_import_student_roster(jsonb) from public, anon;
revoke all on function public.complete_student_registration() from public, anon;
grant execute on function public.admin_import_student_roster(jsonb) to authenticated;
grant execute on function public.complete_student_registration() to authenticated;
