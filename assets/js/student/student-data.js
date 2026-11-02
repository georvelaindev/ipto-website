async function loadQuery(query, message) {
    const { data, error } = await query;
    if (error) throw new Error(message);
    return data;
}

export async function fetchStudentBasics(supabase, userId) {
    const [profile, student, enrollment] = await Promise.all([
        loadQuery(
            supabase.from('profiles')
                .select('first_name,last_name,phone')
                .eq('id', userId)
                .maybeSingle(),
            'Impossible de charger votre profil.'
        ),
        loadQuery(
            supabase.from('students')
                .select('matricule')
                .eq('id', userId)
                .maybeSingle(),
            'Impossible de charger votre dossier étudiant.'
        ),
        loadQuery(
            supabase.from('enrollments')
                .select('id,program_id,level_id,academic_year_id,status,enrolled_at,programs(name),levels(name),academic_years(id,label,is_current)')
                .eq('student_id', userId)
                .eq('status', 'active')
                .order('enrolled_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            'Impossible de charger votre inscription académique.'
        )
    ]);

    return { profile, student, enrollment };
}

export function relatedRecord(value) {
    return Array.isArray(value) ? value[0] || null : value || null;
}

export function formatDate(value) {
    if (!value) return 'Non renseignée';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return 'Non renseignée';
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date);
}

export function formatTimestamp(value) {
    if (!value) return 'Date non renseignée';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date non renseignée';
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}
