-- Autorise les enseignants à lire le matricule des étudiants inscrits à leurs cours.
-- Les autres champs des profils personnels restent protégés par leurs politiques existantes.

create policy students_select_by_assigned_course_teacher
    on public.students for select to authenticated
    using (
        public.has_role('teacher'::public.app_role)
        and exists (
            select 1
            from public.course_enrollments
            where student_id = students.id
              and public.teaches_course(course_id)
        )
    );
