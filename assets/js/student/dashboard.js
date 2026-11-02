import { createSupabaseClient, getStudentUser } from './supabase-client.js';
import { fetchStudentBasics, formatTimestamp, relatedRecord } from './student-data.js';

const loading = document.querySelector('#dashboard-loading');
const shell = document.querySelector('#dashboard-shell');
const dashboardAlert = document.querySelector('#dashboard-alert');
const accountEmail = document.querySelector('#account-email');
const welcomeTitle = document.querySelector('#welcome-title');
const matricule = document.querySelector('#student-matricule');
const programLevel = document.querySelector('#student-program-level');
const courseCount = document.querySelector('#student-course-count');
const nextCourse = document.querySelector('#student-next-course');
const recentAnnouncements = document.querySelector('#recent-announcements');
const recentDocuments = document.querySelector('#recent-documents');
const logoutButton = document.querySelector('#logout-button');
const sidebar = document.querySelector('#student-sidebar');
const menuToggle = document.querySelector('#mobile-menu-toggle');
const sidebarOverlay = document.querySelector('#sidebar-overlay');
let supabase;

function reportError(message) {
    const currentMessage = dashboardAlert.textContent;
    dashboardAlert.textContent = currentMessage ? `${currentMessage} ${message}` : message;
    dashboardAlert.hidden = false;
}

function related(value) {
    return relatedRecord(value);
}

function renderRecentItems(container, records, view, emptyMessage) {
    container.replaceChildren();
    if (!records.length) {
        const empty = document.createElement('p');
        empty.className = 'pending-message';
        empty.textContent = emptyMessage;
        container.append(empty);
        return;
    }

    records.forEach((record) => {
        const link = document.createElement('a');
        link.className = 'recent-item';
        link.href = `modules.html?view=${view}`;
        const title = document.createElement('strong');
        title.textContent = record.title;
        const date = document.createElement('small');
        date.textContent = formatTimestamp(record.published_at);
        link.append(title, date);
        container.append(link);
    });
}

function getNextSchedule(schedules) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const candidates = schedules.flatMap((schedule) => {
        const period = related(schedule.academic_periods);
        if (!period?.starts_on || !period?.ends_on) return [];

        const periodStart = new Date(`${period.starts_on}T00:00:00`);
        const periodEnd = new Date(`${period.ends_on}T23:59:59.999`);
        if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd < today) return [];

        const candidate = new Date(Math.max(today.getTime(), periodStart.getTime()));
        const weekday = Number(schedule.weekday);
        if (weekday < 1 || weekday > 7) return [];
        const currentWeekday = candidate.getDay() || 7;
        candidate.setDate(candidate.getDate() + ((weekday - currentWeekday + 7) % 7));

        const [hours, minutes] = String(schedule.starts_at || '').split(':').map(Number);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return [];
        candidate.setHours(hours, minutes, 0, 0);
        if (candidate < now) candidate.setDate(candidate.getDate() + 7);
        if (candidate > periodEnd || candidate < now) return [];

        return [{ schedule, date: candidate }];
    });

    candidates.sort((first, second) => first.date - second.date);
    return candidates[0] || null;
}

async function loadDashboard(user) {
    const [basicsResult, announcementsResult, documentsResult] = await Promise.allSettled([
        fetchStudentBasics(supabase, user.id),
        supabase.from('announcements')
            .select('title,published_at')
            .eq('is_published', true)
            .order('published_at', { ascending: false })
            .limit(3)
            .then(({ data, error }) => {
                if (error) throw new Error('Impossible de charger les annonces récentes.');
                return data || [];
            }),
        supabase.from('documents')
            .select('title,published_at')
            .eq('is_published', true)
            .order('published_at', { ascending: false })
            .limit(3)
            .then(({ data, error }) => {
                if (error) throw new Error('Impossible de charger les documents récents.');
                return data || [];
            })
    ]);

    if (basicsResult.status === 'fulfilled') {
        const { profile, student, enrollment } = basicsResult.value;
        const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
        welcomeTitle.textContent = fullName ? `Bienvenue, ${fullName}` : 'Votre espace étudiant';
        matricule.textContent = student?.matricule || 'Non renseigné';

        const program = related(enrollment?.programs);
        const level = related(enrollment?.levels);
        programLevel.textContent = [program?.name, level?.name].filter(Boolean).join(' · ') || 'Inscription non renseignée';

        if (!enrollment) {
            courseCount.textContent = '0';
            nextCourse.textContent = 'Aucun cours planifié';
        } else {
            try {
                const coursesResult = await supabase.from('course_enrollments')
                    .select('course_id')
                    .eq('student_id', user.id)
                    .eq('enrollment_id', enrollment.id);
                if (coursesResult.error) throw new Error('Impossible de charger la liste de vos cours.');

                const courses = coursesResult.data || [];
                courseCount.textContent = String(courses.length);
                if (!courses.length) {
                    nextCourse.textContent = 'Aucun cours planifié';
                } else {
                    const schedulesResult = await supabase.from('schedules')
                        .select('weekday,starts_at,academic_periods(starts_on,ends_on),courses(subjects(name))')
                        .in('course_id', courses.map((course) => course.course_id))
                        .eq('academic_year_id', enrollment.academic_year_id)
                        .order('weekday')
                        .order('starts_at');
                    if (schedulesResult.error) throw new Error('Impossible de charger le prochain cours.');
                    const upcoming = getNextSchedule(schedulesResult.data || []);
                    if (upcoming) {
                        const course = related(upcoming.schedule.courses);
                        const subject = related(course?.subjects);
                        const date = new Intl.DateTimeFormat('fr-FR', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                        }).format(upcoming.date);
                        nextCourse.textContent = [subject?.name, date].filter(Boolean).join(' · ');
                    } else {
                        nextCourse.textContent = 'Aucun cours planifié';
                    }
                }
            } catch (error) {
                courseCount.textContent = 'Indisponible';
                nextCourse.textContent = 'Indisponible';
                reportError(error instanceof Error
                    ? error.message
                    : 'Impossible de charger vos cours et votre prochain cours.');
            }
        }
    } else {
        reportError(basicsResult.reason.message || 'Impossible de charger votre profil étudiant.');
        matricule.textContent = 'Indisponible';
        programLevel.textContent = 'Indisponible';
        courseCount.textContent = 'Indisponible';
        nextCourse.textContent = 'Indisponible';
    }

    if (announcementsResult.status === 'fulfilled') {
        renderRecentItems(recentAnnouncements, announcementsResult.value, 'announcements', 'Aucune annonce récente.');
    } else {
        renderRecentItems(recentAnnouncements, [], 'announcements', 'Annonces indisponibles.');
        reportError(announcementsResult.reason.message || 'Impossible de charger les annonces récentes.');
    }

    if (documentsResult.status === 'fulfilled') {
        renderRecentItems(recentDocuments, documentsResult.value, 'documents', 'Aucun document récent.');
    } else {
        renderRecentItems(recentDocuments, [], 'documents', 'Documents indisponibles.');
        reportError(documentsResult.reason.message || 'Impossible de charger les documents récents.');
    }
}

function closeSidebar() {
    sidebar.classList.remove('is-open');
    sidebarOverlay.classList.remove('is-visible');
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('sidebar-open');
}

function openSidebar() {
    sidebar.classList.add('is-open');
    sidebarOverlay.classList.add('is-visible');
    menuToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('sidebar-open');
}

menuToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('is-open')) closeSidebar();
    else openSidebar();
});
sidebarOverlay.addEventListener('click', closeSidebar);
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebar();
});

logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        window.location.replace('login.html');
    } catch {
        logoutButton.disabled = false;
        window.alert('La déconnexion n’a pas abouti. Vérifiez votre connexion puis réessayez.');
    }
});

try {
    supabase = createSupabaseClient();
} catch (error) {
    const reason = error.message.startsWith('Supabase n’est pas encore configuré')
        ? 'configuration'
        : 'session';
    window.location.replace(`login.html?reason=${reason}`);
}

if (supabase) {
    const { user, reason } = await getStudentUser(supabase);
    if (!user) {
        window.location.replace(`login.html?reason=${reason}`);
    } else {
        accountEmail.textContent = user.email || 'Compte étudiant';
        loading.hidden = true;
        shell.hidden = false;
        supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') window.location.replace('login.html?reason=session');
        });

        try {
            await loadDashboard(user);
        } catch (error) {
            reportError(error instanceof Error
                ? error.message
                : 'Une erreur est survenue lors du chargement du tableau de bord.');
        }
    }
}
