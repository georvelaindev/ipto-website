import { createSupabaseClient, getStudentUser } from './supabase-client.js';
import { fetchStudentBasics, formatDate, formatTimestamp, relatedRecord } from './student-data.js';

const loading = document.querySelector('#module-loading');
const shell = document.querySelector('#module-shell');
const accountEmail = document.querySelector('#account-email');
const moduleTitle = document.querySelector('#module-title');
const moduleContent = document.querySelector('#module-content');
const moduleView = document.querySelector('#module-view');
const moduleAlert = document.querySelector('#module-alert');
const logoutButton = document.querySelector('#logout-button');
const sidebar = document.querySelector('#student-sidebar');
const menuToggle = document.querySelector('#mobile-menu-toggle');
const sidebarOverlay = document.querySelector('#sidebar-overlay');

const modules = {
    profile: { title: 'Mon profil', description: 'Vos informations personnelles et votre inscription.' },
    courses: { title: 'Mes cours', description: 'Les matières associées à votre inscription.' },
    grades: { title: 'Mes notes', description: 'Les résultats publiés par vos enseignants.' },
    schedule: { title: 'Emploi du temps', description: 'Les séances planifiées pour vos cours.' },
    documents: { title: 'Documents pédagogiques', description: 'Les ressources auxquelles votre inscription vous donne accès.' },
    announcements: { title: 'Annonces', description: 'Les informations de l’administration pour votre filière et votre niveau.' },
    internships: { title: 'Stages et opportunités', description: 'Les offres publiées pour votre filière.' }
};

const view = new URLSearchParams(window.location.search).get('view');
const currentModule = modules[view];
let supabase;
let currentUser;

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
}

function one(value) {
    return relatedRecord(value);
}

function showError(message) {
    moduleAlert.textContent = message;
    moduleAlert.hidden = false;
}

function clearView() {
    moduleView.replaceChildren();
    moduleAlert.hidden = true;
}

function emptyState(message) {
    return element('p', 'module-empty', message);
}

function addModuleIntro(description) {
    const intro = element('div', 'module-intro');
    intro.append(element('p', 'student-eyebrow', 'Espace étudiant'));
    intro.append(element('p', 'module-description', description));
    moduleView.append(intro);
}

function dataOrThrow(result, message) {
    if (result.error) throw new Error(message);
    return result.data;
}

function addInfoCard(parent, label, value) {
    const card = element('article', 'module-info-card');
    card.append(element('span', 'module-info-label', label));
    card.append(element('strong', 'module-info-value', value || 'Non renseigné'));
    parent.append(card);
}

function makeSearch(label, placeholder) {
    const wrapper = element('div', 'module-filter');
    const inputId = `search-${view}`;
    const labelNode = element('label', '', label);
    labelNode.htmlFor = inputId;
    const input = element('input', 'module-search');
    input.id = inputId;
    input.type = 'search';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    wrapper.append(labelNode, input);
    return { wrapper, input };
}

function makeTable(headers, rows, emptyMessage) {
    if (!rows.length) return emptyState(emptyMessage);

    const wrapper = element('div', 'module-table-wrap');
    const table = element('table', 'module-table');
    const head = element('thead');
    const headerRow = element('tr');
    headers.forEach((header) => headerRow.append(element('th', '', header)));
    head.append(headerRow);
    const body = element('tbody');

    rows.forEach((row) => {
        const rowNode = element('tr');
        row.forEach((value) => rowNode.append(element('td', '', value || '—')));
        body.append(rowNode);
    });

    table.append(head, body);
    wrapper.append(table);
    return wrapper;
}

function setActiveNavigation() {
    document.querySelectorAll('[data-view]').forEach((link) => {
        const active = link.dataset.view === view;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
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

async function renderProfile() {
    const basics = await fetchStudentBasics(supabase, currentUser.id);
    const profile = basics.profile || {};
    const enrollment = basics.enrollment;
    const program = one(enrollment?.programs);
    const level = one(enrollment?.levels);
    const year = one(enrollment?.academic_years);
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
    const grid = element('div', 'module-info-grid');

    addInfoCard(grid, 'Nom et prénom', fullName);
    addInfoCard(grid, 'Matricule', basics.student?.matricule);
    addInfoCard(grid, 'Adresse e-mail', currentUser.email);
    addInfoCard(grid, 'Téléphone', profile.phone);
    addInfoCard(grid, 'Filière', program?.name);
    addInfoCard(grid, 'Niveau', level?.name);
    addInfoCard(grid, 'Année académique', year?.label);
    moduleView.append(grid);

    if (!basics.student || !enrollment) {
        moduleView.append(emptyState('Votre dossier étudiant ou votre inscription active n’a pas encore été renseigné par l’administration.'));
    }
}

function courseSearchText(course) {
    const subject = one(course.subjects);
    const program = one(course.programs);
    const level = one(course.levels);
    const year = one(course.academic_years);
    return [
        subject?.name, subject?.code, course.description,
        program?.name, level?.name, year?.label
    ].filter(Boolean).join(' ').toLocaleLowerCase('fr');
}

function renderCourseCards(records, list, searchTerm) {
    list.replaceChildren();
    const matches = records.filter((course) => courseSearchText(course).includes(searchTerm));

    if (!matches.length) {
        list.append(emptyState(records.length
            ? 'Aucun cours ne correspond à votre recherche.'
            : 'Aucun cours n’est associé à votre inscription.'));
        return;
    }

    matches.forEach((course) => {
        const subject = one(course.subjects);
        const program = one(course.programs);
        const level = one(course.levels);
        const year = one(course.academic_years);
        const card = element('article', 'module-card course-card');
        const heading = element('div', 'module-card-heading');
        heading.append(element('h2', '', subject?.name || 'Matière non renseignée'));
        if (subject?.code) heading.append(element('span', 'module-tag', subject.code));
        card.append(heading);
        if (course.description) card.append(element('p', 'module-card-copy', course.description));
        const meta = [program?.name, level?.name, year?.label].filter(Boolean).join(' · ');
        if (meta) card.append(element('p', 'module-meta', meta));
        card.append(element('p', 'module-meta', 'Enseignant : information non disponible dans votre espace.'));
        list.append(card);
    });
}

async function renderCourses() {
    const records = dataOrThrow(
        await supabase.from('course_enrollments')
            .select('course_id,courses(id,description,subjects(name,code),programs(name),levels(name),academic_years(label))')
            .eq('student_id', currentUser.id)
            .order('enrolled_at', { ascending: false }),
        'Impossible de charger vos cours. Vérifiez les règles d’accès Supabase.'
    ) || [];

    const search = makeSearch('Rechercher un cours', 'Matière, code ou filière');
    const list = element('div', 'module-card-grid');
    search.input.addEventListener('input', () => {
        renderCourseCards(records.map((row) => one(row.courses)).filter(Boolean), list, search.input.value.trim().toLocaleLowerCase('fr'));
    });
    moduleView.append(search.wrapper, list);
    renderCourseCards(records.map((row) => one(row.courses)).filter(Boolean), list, '');
}

function gradeTypeLabel(type) {
    return {
        homework: 'Devoir',
        lab: 'TP',
        exam: 'Examen'
    }[type] || 'Évaluation';
}

async function renderGrades() {
    const grades = dataOrThrow(
        await supabase.from('grades')
            .select('assessment_name,assessment_type,score,max_score,published_at,academic_periods(label),courses(subjects(name))')
            .eq('student_id', currentUser.id)
            .eq('is_published', true)
            .order('published_at', { ascending: false }),
        'Impossible de charger vos résultats publiés. Vérifiez les règles d’accès Supabase.'
    ) || [];

    const rows = grades.map((grade) => {
        const course = one(grade.courses);
        const subject = one(course?.subjects);
        const period = one(grade.academic_periods);
        return [
            subject?.name || 'Matière non renseignée',
            gradeTypeLabel(grade.assessment_type),
            grade.assessment_name,
            `${grade.score} / ${grade.max_score}`,
            period?.label || 'Période non renseignée',
            formatTimestamp(grade.published_at)
        ];
    });

    moduleView.append(makeTable(
        ['Matière', 'Type', 'Évaluation', 'Résultat', 'Période', 'Publication'],
        rows,
        'Aucune note publiée pour le moment.'
    ));
    moduleView.append(element('p', 'dashboard-note', 'Les moyennes ne sont pas calculées tant que les règles officielles de calcul ne sont pas définies.'));
}

const weekdayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

async function renderSchedule() {
    const schedules = dataOrThrow(
        await supabase.from('schedules')
            .select('weekday,starts_at,ends_at,room,courses(subjects(name)),academic_periods(label)')
            .order('weekday')
            .order('starts_at'),
        'Impossible de charger votre emploi du temps. Vérifiez les règles d’accès Supabase.'
    ) || [];

    const rows = schedules.map((item) => {
        const course = one(item.courses);
        const subject = one(course?.subjects);
        const period = one(item.academic_periods);
        return [
            weekdayNames[item.weekday - 1] || 'Jour non renseigné',
            String(item.starts_at || '').slice(0, 5),
            String(item.ends_at || '').slice(0, 5),
            subject?.name || 'Matière non renseignée',
            item.room || 'Salle non renseignée',
            period?.label || 'Période non renseignée'
        ];
    });

    moduleView.append(makeTable(
        ['Jour', 'Début', 'Fin', 'Matière', 'Salle', 'Période'],
        rows,
        'Aucune séance n’est planifiée pour vos cours.'
    ));
}

function documentSearchText(document) {
    const subject = one(document.subjects);
    const course = one(document.courses);
    const courseSubject = one(course?.subjects);
    return [
        document.title, document.description, document.document_type,
        subject?.name, courseSubject?.name
    ].filter(Boolean).join(' ').toLocaleLowerCase('fr');
}

function createDocumentCard(document) {
    const card = element('article', 'module-card document-card');
    const subject = one(document.subjects);
    const course = one(document.courses);
    const courseSubject = one(course?.subjects);
    const subjectName = subject?.name || courseSubject?.name || 'Ressource générale';
    const header = element('div', 'module-card-heading');
    header.append(element('h2', '', document.title));
    header.append(element('span', 'module-tag', document.document_type));
    card.append(header);
    card.append(element('p', 'module-meta', `Matière : ${subjectName}`));
    if (document.description) card.append(element('p', 'module-card-copy', document.description));
    card.append(element('p', 'module-meta', `Publication : ${formatTimestamp(document.published_at)}`));

    const button = element('button', 'student-button student-button-primary document-download', 'Télécharger');
    button.type = 'button';
    const status = element('p', 'module-inline-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    button.addEventListener('click', async () => {
        button.disabled = true;
        status.hidden = true;
        try {
            const { data, error } = await supabase.storage
                .from(document.storage_bucket)
                .createSignedUrl(document.storage_path, 60);
            if (error) throw error;
            if (!data?.signedUrl) throw new Error('URL temporaire de téléchargement manquante.');
            window.location.assign(data.signedUrl);
        } catch {
            status.textContent = 'Téléchargement impossible. Vérifiez vos droits ou contactez l’administration.';
            status.hidden = false;
            button.disabled = false;
        }
    });
    card.append(button, status);
    return card;
}

function renderDocumentCards(records, list, searchTerm, typeFilter) {
    list.replaceChildren();
    const matches = records.filter((record) => (
        documentSearchText(record).includes(searchTerm)
        && (!typeFilter || record.document_type === typeFilter)
    ));
    if (!matches.length) {
        list.append(emptyState(records.length
            ? 'Aucun document ne correspond à vos filtres.'
            : 'Aucun document pédagogique n’est disponible pour vos cours.'));
        return;
    }
    matches.forEach((record) => list.append(createDocumentCard(record)));
}

async function renderDocuments() {
    const records = dataOrThrow(
        await supabase.from('documents')
            .select('title,description,document_type,storage_bucket,storage_path,published_at,subjects(name),courses(subjects(name))')
            .eq('is_published', true)
            .order('published_at', { ascending: false }),
        'Impossible de charger les documents autorisés.'
    ) || [];

    const filterBar = element('div', 'module-filter-bar');
    const search = makeSearch('Rechercher un document', 'Titre, matière ou description');
    const typeLabel = element('label', 'module-type-label', 'Type de document');
    typeLabel.htmlFor = 'document-type-filter';
    const typeSelect = element('select', 'module-select');
    typeSelect.id = 'document-type-filter';
    [
        ['', 'Tous les types'],
        ['course', 'Cours'],
        ['exercise', 'Exercices'],
        ['tutorial', 'Travaux dirigés'],
        ['lab', 'Travaux pratiques'],
        ['supplement', 'Compléments']
    ].forEach(([value, label]) => {
        const option = element('option', '', label);
        option.value = value;
        typeSelect.append(option);
    });
    const selectWrap = element('div', 'module-filter');
    selectWrap.append(typeLabel, typeSelect);
    filterBar.append(search.wrapper, selectWrap);
    const list = element('div', 'module-card-grid');
    const updateList = () => renderDocumentCards(
        records,
        list,
        search.input.value.trim().toLocaleLowerCase('fr'),
        typeSelect.value
    );
    search.input.addEventListener('input', updateList);
    typeSelect.addEventListener('change', updateList);
    moduleView.append(filterBar, list);
    updateList();
}

function createAnnouncementCard(announcement) {
    const card = element('article', 'module-card announcement-card');
    const heading = element('div', 'module-card-heading');
    heading.append(element('h2', '', announcement.title));
    heading.append(element('span', `module-tag priority-${announcement.priority}`, announcement.priority));
    card.append(heading);
    card.append(element('p', 'module-meta', `${announcement.category} · ${formatTimestamp(announcement.published_at)}`));
    card.append(element('p', 'module-card-copy', announcement.body));
    return card;
}

async function renderAnnouncements() {
    const announcements = dataOrThrow(
        await supabase.from('announcements')
            .select('title,body,category,priority,published_at')
            .eq('is_published', true)
            .order('published_at', { ascending: false }),
        'Impossible de charger les annonces qui vous sont destinées.'
    ) || [];

    if (!announcements.length) {
        moduleView.append(emptyState('Aucune annonce ne vous est destinée pour le moment.'));
        return;
    }
    const list = element('div', 'module-card-grid');
    announcements.forEach((announcement) => list.append(createAnnouncementCard(announcement)));
    moduleView.append(list);
}

function safeExternalUrl(value) {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
        return null;
    }
}

function createInternshipCard(offer) {
    const card = element('article', 'module-card internship-card');
    card.append(element('p', 'student-eyebrow', offer.company));
    card.append(element('h2', '', offer.title));
    card.append(element('p', 'module-card-copy', offer.description));
    if (offer.sought_skills) card.append(element('p', 'module-meta', `Compétences : ${offer.sought_skills}`));
    if (offer.deadline) card.append(element('p', 'module-meta', `Date limite : ${formatDate(offer.deadline)}`));
    if (offer.requirements) card.append(element('p', 'module-card-copy', `Conditions : ${offer.requirements}`));
    if (offer.application_instructions) {
        card.append(element('p', 'module-card-copy', `Candidature : ${offer.application_instructions}`));
    }
    const url = safeExternalUrl(offer.application_url);
    if (url) {
        const link = element('a', 'student-button student-button-primary offer-link', 'Consulter l’offre');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.append(link);
    }
    return card;
}

async function renderInternships() {
    const offers = dataOrThrow(
        await supabase.from('internships')
            .select('title,company,description,sought_skills,deadline,requirements,application_instructions,application_url')
            .eq('is_published', true)
            .order('deadline', { ascending: true, nullsFirst: false }),
        'Impossible de charger les offres de stage publiées.'
    ) || [];

    if (!offers.length) {
        moduleView.append(emptyState('Aucune offre de stage ou opportunité n’est disponible pour le moment.'));
        return;
    }
    const list = element('div', 'module-card-grid');
    offers.forEach((offer) => list.append(createInternshipCard(offer)));
    moduleView.append(list);
}

const renderers = {
    profile: renderProfile,
    courses: renderCourses,
    grades: renderGrades,
    schedule: renderSchedule,
    documents: renderDocuments,
    announcements: renderAnnouncements,
    internships: renderInternships
};

if (!currentModule) {
    window.location.replace('dashboard.html');
} else {
    moduleTitle.textContent = currentModule.title;
    document.title = `${currentModule.title} | IPTO`;
    setActiveNavigation();

    try {
        supabase = createSupabaseClient();
    } catch {
        window.location.replace('login.html?reason=configuration');
    }

    if (supabase) {
        const access = await getStudentUser(supabase);
        if (!access.user) {
            window.location.replace(`login.html?reason=${access.reason}`);
        } else {
            currentUser = access.user;
            accountEmail.textContent = currentUser.email || 'Compte étudiant';
            loading.hidden = true;
            shell.hidden = false;
            addModuleIntro(currentModule.description);
            supabase.auth.onAuthStateChange((event) => {
                if (event === 'SIGNED_OUT') window.location.replace('login.html?reason=session');
            });

            try {
                await renderers[view]();
            } catch (error) {
                showError(error instanceof Error
                    ? error.message
                    : 'Une erreur est survenue lors du chargement de ce module.');
            }
        }
    }
}
