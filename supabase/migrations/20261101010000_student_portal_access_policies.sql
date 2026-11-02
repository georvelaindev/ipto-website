-- Politiques d'accès pour le portail étudiant IPTO.
-- Les opérations administratives initiales doivent être réalisées depuis Supabase SQL Editor.

create function public.is_course_enrolled(_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.has_role('student'::public.app_role)
       and exists (
           select 1
           from public.course_enrollments
           where student_id = (select auth.uid())
             and course_id = _course_id
       );
$$;

create function public.teaches_course(_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.has_role('teacher'::public.app_role)
       and exists (
           select 1
           from public.courses
           where id = _course_id
             and teacher_id = (select auth.uid())
       );
$$;

create function public.can_manage_student_document_path(_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.has_role('admin'::public.app_role)
        or (
            public.has_role('teacher'::public.app_role)
            and case
                when (storage.foldername(_path))[1] ~*
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then public.teaches_course(((storage.foldername(_path))[1])::uuid)
                else false
            end
        );
$$;

create function public.admin_update_profile(
    _profile_id uuid,
    _first_name text,
    _last_name text,
    _phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.has_role('admin'::public.app_role) then
        raise exception 'Administrator role required'
            using errcode = '42501';
    end if;

    update public.profiles
    set first_name = nullif(trim(_first_name), ''),
        last_name = nullif(trim(_last_name), ''),
        phone = nullif(trim(_phone), '')
    where id = _profile_id;

    if not found then
        raise exception 'Profile not found'
            using errcode = 'P0002';
    end if;
end;
$$;

create function public.admin_set_user_role(
    _user_id uuid,
    _role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not public.has_role('admin'::public.app_role) then
        raise exception 'Administrator role required'
            using errcode = '42501';
    end if;

    lock table public.user_roles in share row exclusive mode;

    if not public.has_role('admin'::public.app_role) then
        raise exception 'Administrator role required'
            using errcode = '42501';
    end if;

    if _role is null then
        raise exception 'A role is required'
            using errcode = '22004';
    end if;

    if not exists (
        select 1
        from auth.users
        where id = _user_id
    ) then
        raise exception 'Authentication user not found'
            using errcode = 'P0002';
    end if;

    if _role <> 'admin'::public.app_role
       and exists (
           select 1
           from public.user_roles
           where user_id = _user_id
             and role = 'admin'::public.app_role
       )
       and (
           select count(*)
           from public.user_roles
           where role = 'admin'::public.app_role
       ) <= 1 then
        raise exception 'Cannot remove the last administrator'
            using errcode = '23514';
    end if;

    insert into public.profiles (id)
    values (_user_id)
    on conflict (id) do nothing;

    insert into public.user_roles (user_id, role)
    values (_user_id, _role)
    on conflict (user_id)
    do update set role = excluded.role;
end;
$$;

revoke all on function public.has_role(public.app_role) from public, anon;
revoke all on function public.is_course_enrolled(uuid) from public, anon;
revoke all on function public.teaches_course(uuid) from public, anon;
revoke all on function public.can_manage_student_document_path(text) from public, anon;
revoke all on function public.admin_update_profile(uuid, text, text, text) from public, anon;
revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;

grant execute on function public.is_course_enrolled(uuid) to authenticated;
grant execute on function public.teaches_course(uuid) to authenticated;
grant execute on function public.can_manage_student_document_path(text) to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
grant usage on type public.app_role to authenticated;

grant select on table
    public.profiles,
    public.user_roles,
    public.students,
    public.academic_years,
    public.programs,
    public.levels,
    public.subjects,
    public.enrollments,
    public.academic_periods,
    public.courses,
    public.course_enrollments,
    public.grades,
    public.schedules,
    public.documents,
    public.announcements,
    public.internships
to authenticated;

grant update (phone) on table public.profiles to authenticated;

grant insert, update, delete on table
    public.students,
    public.academic_years,
    public.programs,
    public.levels,
    public.subjects,
    public.enrollments,
    public.academic_periods,
    public.courses,
    public.course_enrollments,
    public.grades,
    public.schedules,
    public.documents,
    public.announcements,
    public.internships
to authenticated;

create policy profiles_select_own_or_admin
    on public.profiles for select to authenticated
    using (id = (select auth.uid()) or public.has_role('admin'::public.app_role));

create policy profiles_update_own_contact
    on public.profiles for update to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

create policy profiles_update_admin
    on public.profiles for update to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy user_roles_select_own_or_admin
    on public.user_roles for select to authenticated
    using (
        user_id = (select auth.uid())
        or public.has_role('admin'::public.app_role)
    );

create policy students_select_own_or_admin
    on public.students for select to authenticated
    using (
        (id = (select auth.uid()) and public.has_role('student'::public.app_role))
        or public.has_role('admin'::public.app_role)
    );

create policy students_admin_manage
    on public.students for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy academic_years_authenticated_read
    on public.academic_years for select to authenticated
    using (true);

create policy academic_years_admin_manage
    on public.academic_years for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy programs_authenticated_read
    on public.programs for select to authenticated
    using (true);

create policy programs_admin_manage
    on public.programs for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy levels_authenticated_read
    on public.levels for select to authenticated
    using (true);

create policy levels_admin_manage
    on public.levels for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy subjects_authenticated_read
    on public.subjects for select to authenticated
    using (true);

create policy subjects_admin_manage
    on public.subjects for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy enrollments_select_own_or_admin
    on public.enrollments for select to authenticated
    using (
        (student_id = (select auth.uid()) and public.has_role('student'::public.app_role))
        or public.has_role('admin'::public.app_role)
    );

create policy enrollments_admin_manage
    on public.enrollments for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy academic_periods_authenticated_read
    on public.academic_periods for select to authenticated
    using (true);

create policy academic_periods_admin_manage
    on public.academic_periods for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy courses_select_by_role
    on public.courses for select to authenticated
    using (
        public.has_role('admin'::public.app_role)
        or public.teaches_course(id)
        or public.is_course_enrolled(id)
    );

create policy courses_admin_manage
    on public.courses for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy course_enrollments_select_by_role
    on public.course_enrollments for select to authenticated
    using (
        (student_id = (select auth.uid()) and public.has_role('student'::public.app_role))
        or public.teaches_course(course_id)
        or public.has_role('admin'::public.app_role)
    );

create policy course_enrollments_admin_manage
    on public.course_enrollments for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy grades_select_by_role
    on public.grades for select to authenticated
    using (
        public.has_role('admin'::public.app_role)
        or public.teaches_course(course_id)
        or (
            student_id = (select auth.uid())
            and public.has_role('student'::public.app_role)
            and is_published
        )
    );

create policy grades_admin_manage
    on public.grades for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy grades_teacher_manage_assigned_courses
    on public.grades for all to authenticated
    using (public.teaches_course(course_id))
    with check (public.teaches_course(course_id));

create policy schedules_select_by_role
    on public.schedules for select to authenticated
    using (
        public.has_role('admin'::public.app_role)
        or public.teaches_course(course_id)
        or public.is_course_enrolled(course_id)
    );

create policy schedules_admin_manage
    on public.schedules for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy schedules_teacher_manage_assigned_courses
    on public.schedules for all to authenticated
    using (public.teaches_course(course_id))
    with check (public.teaches_course(course_id));

create policy documents_select_by_role
    on public.documents for select to authenticated
    using (
        public.has_role('admin'::public.app_role)
        or (
            public.has_role('student'::public.app_role)
            and is_published
            and published_at <= now()
            and (course_id is null or public.is_course_enrolled(course_id))
        )
        or (
            public.has_role('teacher'::public.app_role)
            and (
                uploaded_by = (select auth.uid())
                or (course_id is not null and public.teaches_course(course_id))
            )
        )
    );

create policy documents_admin_manage
    on public.documents for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy documents_teacher_manage_assigned_courses
    on public.documents for all to authenticated
    using (
        uploaded_by = (select auth.uid())
        and course_id is not null
        and public.teaches_course(course_id)
    )
    with check (
        uploaded_by = (select auth.uid())
        and course_id is not null
        and public.teaches_course(course_id)
    );

create policy announcements_select_by_audience
    on public.announcements for select to authenticated
    using (
        public.has_role('admin'::public.app_role)
        or (
            public.has_role('teacher'::public.app_role)
            and is_published
            and published_at <= now()
            and (visible_until is null or visible_until >= now())
        )
        or (
            public.has_role('student'::public.app_role)
            and is_published
            and published_at <= now()
            and (visible_until is null or visible_until >= now())
            and exists (
                select 1
                from public.enrollments
                where student_id = (select auth.uid())
                  and status = 'active'
                  and (program_id is null or program_id = announcements.program_id)
                  and (level_id is null or level_id = announcements.level_id)
            )
        )
    );

create policy announcements_admin_manage
    on public.announcements for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

create policy internships_select_published
    on public.internships for select to authenticated
    using (
        public.has_role('admin'::public.app_role)
        or (
            (public.has_role('student'::public.app_role)
             or public.has_role('teacher'::public.app_role))
            and is_published
            and published_at <= now()
            and (deadline is null or deadline >= current_date)
            and (
                public.has_role('teacher'::public.app_role)
                or program_id is null
                or exists (
                    select 1
                    from public.enrollments
                    where student_id = (select auth.uid())
                      and status = 'active'
                      and program_id = internships.program_id
                )
            )
        )
    );

create policy internships_admin_manage
    on public.internships for all to authenticated
    using (public.has_role('admin'::public.app_role))
    with check (public.has_role('admin'::public.app_role));

insert into storage.buckets (id, name, public)
values ('student-documents', 'student-documents', false)
on conflict (id)
do update set public = false;

create policy student_documents_select_authorized
    on storage.objects for select to authenticated
    using (
        bucket_id = 'student-documents'
        and exists (
            select 1
            from public.documents
            where storage_bucket = storage.objects.bucket_id
              and storage_path = storage.objects.name
        )
    );

create policy student_documents_insert_authorized
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'student-documents'
        and public.can_manage_student_document_path(name)
    );

create policy student_documents_update_authorized
    on storage.objects for update to authenticated
    using (
        bucket_id = 'student-documents'
        and public.can_manage_student_document_path(name)
    )
    with check (
        bucket_id = 'student-documents'
        and public.can_manage_student_document_path(name)
    );

create policy student_documents_delete_authorized
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'student-documents'
        and public.can_manage_student_document_path(name)
    );
