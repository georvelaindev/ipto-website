-- Schéma initial du portail étudiant IPTO.
-- Les tables sont immédiatement protégées par RLS ; les politiques d'accès seront ajoutées en phase 4.

create type public.app_role as enum ('student', 'teacher', 'admin');

create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    first_name text check (first_name is null or length(trim(first_name)) between 1 and 100),
    last_name text check (last_name is null or length(trim(last_name)) between 1 and 100),
    phone text check (phone is null or length(trim(phone)) between 6 and 32),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.user_roles (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    role public.app_role not null,
    created_at timestamptz not null default now()
);

create table public.students (
    id uuid primary key references public.profiles (id) on delete cascade,
    matricule text not null unique
        check (length(trim(matricule)) between 1 and 64),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.academic_years (
    id uuid primary key default gen_random_uuid(),
    label text not null unique check (length(trim(label)) > 0),
    starts_on date not null,
    ends_on date not null,
    is_current boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint academic_years_dates_valid check (ends_on > starts_on)
);

create unique index academic_years_one_current_idx
    on public.academic_years (is_current)
    where is_current;

create table public.programs (
    id uuid primary key default gen_random_uuid(),
    code text not null unique check (length(trim(code)) > 0),
    name text not null check (length(trim(name)) > 0),
    description text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.levels (
    id uuid primary key default gen_random_uuid(),
    code text not null unique check (length(trim(code)) > 0),
    name text not null check (length(trim(name)) > 0),
    position smallint not null unique check (position > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.subjects (
    id uuid primary key default gen_random_uuid(),
    code text not null unique check (length(trim(code)) > 0),
    name text not null check (length(trim(name)) > 0),
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.enrollments (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students (id) on delete cascade,
    program_id uuid not null references public.programs (id) on delete restrict,
    level_id uuid not null references public.levels (id) on delete restrict,
    academic_year_id uuid not null references public.academic_years (id) on delete restrict,
    status text not null default 'active'
        check (status in ('active', 'completed', 'suspended', 'withdrawn')),
    enrolled_at date not null default current_date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint enrollments_one_per_year unique (student_id, academic_year_id),
    constraint enrollments_cohort_reference
        unique (id, student_id, program_id, level_id, academic_year_id)
);

create table public.academic_periods (
    id uuid primary key default gen_random_uuid(),
    academic_year_id uuid not null references public.academic_years (id) on delete cascade,
    label text not null check (length(trim(label)) > 0),
    starts_on date not null,
    ends_on date not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint academic_periods_dates_valid check (ends_on >= starts_on),
    constraint academic_periods_label_per_year unique (academic_year_id, label),
    constraint academic_periods_id_year_unique unique (id, academic_year_id)
);

create table public.courses (
    id uuid primary key default gen_random_uuid(),
    subject_id uuid not null references public.subjects (id) on delete restrict,
    program_id uuid not null references public.programs (id) on delete restrict,
    level_id uuid not null references public.levels (id) on delete restrict,
    academic_year_id uuid not null references public.academic_years (id) on delete restrict,
    teacher_id uuid references public.profiles (id) on delete set null,
    description text,
    created_by uuid not null references public.profiles (id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint courses_cohort_reference
        unique (id, program_id, level_id, academic_year_id),
    constraint courses_id_year_reference
        unique (id, academic_year_id)
);

create table public.course_enrollments (
    student_id uuid not null references public.students (id) on delete cascade,
    enrollment_id uuid not null,
    course_id uuid not null,
    program_id uuid not null,
    level_id uuid not null,
    academic_year_id uuid not null,
    enrolled_at timestamptz not null default now(),
    primary key (student_id, course_id),
    constraint course_enrollments_enrollment_cohort_fk
        foreign key (enrollment_id, student_id, program_id, level_id, academic_year_id)
        references public.enrollments (id, student_id, program_id, level_id, academic_year_id)
        on delete cascade,
    constraint course_enrollments_course_cohort_fk
        foreign key (course_id, program_id, level_id, academic_year_id)
        references public.courses (id, program_id, level_id, academic_year_id)
        on delete cascade
);

create table public.grades (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null,
    course_id uuid not null,
    academic_year_id uuid not null,
    academic_period_id uuid not null,
    assessment_type text not null
        check (assessment_type in ('homework', 'lab', 'exam')),
    assessment_name text not null check (length(trim(assessment_name)) > 0),
    score numeric(7, 2) not null check (score >= 0),
    max_score numeric(7, 2) not null check (max_score > 0 and score <= max_score),
    weight numeric(7, 2) check (weight is null or weight > 0),
    is_published boolean not null default false,
    published_at timestamptz,
    entered_by uuid not null references public.profiles (id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint grades_student_course_fk
        foreign key (student_id, course_id)
        references public.course_enrollments (student_id, course_id)
        on delete cascade,
    constraint grades_course_year_fk
        foreign key (course_id, academic_year_id)
        references public.courses (id, academic_year_id)
        on delete cascade,
    constraint grades_period_year_fk
        foreign key (academic_period_id, academic_year_id)
        references public.academic_periods (id, academic_year_id)
        on delete restrict,
    constraint grades_publication_timestamp
        check (not is_published or published_at is not null)
);

create table public.schedules (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null,
    academic_year_id uuid not null,
    academic_period_id uuid not null,
    weekday smallint not null check (weekday between 1 and 7),
    starts_at time not null,
    ends_at time not null,
    room text,
    created_by uuid not null references public.profiles (id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint schedules_time_range_valid check (ends_at > starts_at),
    constraint schedules_course_year_fk
        foreign key (course_id, academic_year_id)
        references public.courses (id, academic_year_id)
        on delete cascade,
    constraint schedules_period_year_fk
        foreign key (academic_period_id, academic_year_id)
        references public.academic_periods (id, academic_year_id)
        on delete cascade
);

create table public.documents (
    id uuid primary key default gen_random_uuid(),
    course_id uuid references public.courses (id) on delete set null,
    subject_id uuid references public.subjects (id) on delete set null,
    title text not null check (length(trim(title)) > 0),
    description text,
    document_type text not null
        check (document_type in ('course', 'exercise', 'tutorial', 'lab', 'supplement')),
    storage_bucket text not null default 'student-documents'
        check (storage_bucket = 'student-documents'),
    storage_path text not null unique check (length(trim(storage_path)) > 0),
    is_published boolean not null default false,
    published_at timestamptz,
    uploaded_by uuid not null references public.profiles (id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint documents_publication_timestamp
        check (not is_published or published_at is not null)
);

create table public.announcements (
    id uuid primary key default gen_random_uuid(),
    title text not null check (length(trim(title)) > 0),
    body text not null check (length(trim(body)) > 0),
    category text not null check (length(trim(category)) > 0),
    priority text not null default 'normal'
        check (priority in ('normal', 'important', 'urgent')),
    program_id uuid references public.programs (id) on delete restrict,
    level_id uuid references public.levels (id) on delete restrict,
    is_published boolean not null default false,
    published_at timestamptz,
    visible_until timestamptz,
    published_by uuid not null references public.profiles (id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint announcements_publication_timestamp
        check (not is_published or published_at is not null),
    constraint announcements_visibility_range
        check (visible_until is null or published_at is null or visible_until >= published_at)
);

create table public.internships (
    id uuid primary key default gen_random_uuid(),
    title text not null check (length(trim(title)) > 0),
    company text not null check (length(trim(company)) > 0),
    description text not null check (length(trim(description)) > 0),
    sought_skills text,
    deadline date,
    requirements text,
    application_instructions text,
    application_url text,
    program_id uuid references public.programs (id) on delete restrict,
    is_published boolean not null default false,
    published_at timestamptz,
    created_by uuid not null references public.profiles (id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint internships_publication_timestamp
        check (not is_published or published_at is not null)
);

create index enrollments_program_level_idx
    on public.enrollments (program_id, level_id, academic_year_id);
create index academic_periods_year_dates_idx
    on public.academic_periods (academic_year_id, starts_on, ends_on);
create index courses_cohort_idx
    on public.courses (program_id, level_id, academic_year_id);
create index courses_subject_idx
    on public.courses (subject_id, program_id, level_id, academic_year_id);
create index courses_teacher_idx
    on public.courses (teacher_id) where teacher_id is not null;
create index course_enrollments_course_idx
    on public.course_enrollments (course_id);
create index grades_student_period_idx
    on public.grades (student_id, academic_period_id, is_published);
create index grades_course_period_idx
    on public.grades (course_id, academic_period_id);
create index schedules_period_weekday_idx
    on public.schedules (academic_period_id, weekday, starts_at);
create index documents_course_published_idx
    on public.documents (course_id, is_published, published_at desc);
create index announcements_audience_published_idx
    on public.announcements (program_id, level_id, is_published, published_at desc);
create index internships_published_deadline_idx
    on public.internships (is_published, deadline);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();
create trigger students_set_updated_at
    before update on public.students
    for each row execute function public.set_updated_at();
create trigger academic_years_set_updated_at
    before update on public.academic_years
    for each row execute function public.set_updated_at();
create trigger programs_set_updated_at
    before update on public.programs
    for each row execute function public.set_updated_at();
create trigger levels_set_updated_at
    before update on public.levels
    for each row execute function public.set_updated_at();
create trigger subjects_set_updated_at
    before update on public.subjects
    for each row execute function public.set_updated_at();
create trigger enrollments_set_updated_at
    before update on public.enrollments
    for each row execute function public.set_updated_at();
create trigger academic_periods_set_updated_at
    before update on public.academic_periods
    for each row execute function public.set_updated_at();
create trigger courses_set_updated_at
    before update on public.courses
    for each row execute function public.set_updated_at();
create trigger grades_set_updated_at
    before update on public.grades
    for each row execute function public.set_updated_at();
create trigger schedules_set_updated_at
    before update on public.schedules
    for each row execute function public.set_updated_at();
create trigger documents_set_updated_at
    before update on public.documents
    for each row execute function public.set_updated_at();
create trigger announcements_set_updated_at
    before update on public.announcements
    for each row execute function public.set_updated_at();
create trigger internships_set_updated_at
    before update on public.internships
    for each row execute function public.set_updated_at();

create function public.has_role(_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.user_roles
        where user_id = (select auth.uid())
          and role = _role
    );
$$;

revoke all on function public.has_role(public.app_role) from public;
grant execute on function public.has_role(public.app_role) to authenticated;

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id)
    values (new.id)
    on conflict (id) do nothing;
    return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

insert into public.profiles (id)
select id
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.students enable row level security;
alter table public.academic_years enable row level security;
alter table public.programs enable row level security;
alter table public.levels enable row level security;
alter table public.subjects enable row level security;
alter table public.enrollments enable row level security;
alter table public.academic_periods enable row level security;
alter table public.courses enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.grades enable row level security;
alter table public.schedules enable row level security;
alter table public.documents enable row level security;
alter table public.announcements enable row level security;
alter table public.internships enable row level security;
