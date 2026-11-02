import { createSupabaseClient, getTeacherUser } from './supabase-client.js';
import { relatedRecord } from './student-data.js';

const loading = document.querySelector('#teacher-loading');
const shell = document.querySelector('#teacher-shell');
const title = document.querySelector('#teacher-title');
const email = document.querySelector('#teacher-email');
const alertBox = document.querySelector('#teacher-alert');
const viewRoot = document.querySelector('#teacher-view');
const logoutButton = document.querySelector('#teacher-logout');
const sidebar = document.querySelector('#teacher-sidebar');
const menuToggle = document.querySelector('#teacher-menu-toggle');
const overlay = document.querySelector('#teacher-overlay');

const views = {
    overview: 'Vue d’ensemble',
    courses: 'Mes cours',
    grades: 'Notes',
    schedule: 'Emploi du temps',
    documents: 'Documents pédagogiques'
};

const currentView = new URLSearchParams(window.location.search).get('view') || 'overview';
let supabase;
let currentUser;
let teacherCourses = [];
let courseEnrollments = [];
let academicPeriods = [];
let editingRecordId = null;

function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined && text !== null) item.textContent = String(text);
    return item;
}

function relation(value) {
    return relatedRecord(value);
}

function notify(message, success = false) {
    alertBox.textContent = message;
    alertBox.classList.toggle('success', success);
    alertBox.hidden = false;
}

function clearAlert() {
    alertBox.textContent = '';
    alertBox.hidden = true;
    alertBox.classList.remove('success');
}

function runAction(action, fallbackMessage) {
    return Promise.resolve()
        .then(action)
        .catch((error) => notify(error instanceof Error ? error.message : fallbackMessage));
}

async function queryData(query, message) {
    const { data, error } = await query;
    if (error) throw new Error(`${message} ${error.message}`);
    return data;
}

async function queryCount(query, message) {
    const { count, error } = await query;
    if (error) throw new Error(`${message} ${error.message}`);
    return count || 0;
}

function closeSidebar() {
    sidebar.classList.remove('is-open');
    overlay.classList.remove('is-visible');
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('sidebar-open');
}

function openSidebar() {
    sidebar.classList.add('is-open');
    overlay.classList.add('is-visible');
    menuToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('sidebar-open');
}

menuToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('is-open')) closeSidebar();
    else openSidebar();
});
overlay.addEventListener('click', closeSidebar);
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
        notify('La déconnexion n’a pas abouti. Vérifiez votre connexion puis réessayez.');
    }
});

function setActiveNavigation() {
    document.querySelectorAll('[data-view]').forEach((link) => {
        const active = link.dataset.view === currentView;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
}

function makeIntro(description) {
    const intro = node('div', 'module-intro');
    intro.append(
        node('p', 'student-eyebrow', 'Espace enseignant'),
        node('p', 'module-description', description)
    );
    viewRoot.append(intro);
}

function makeSection(heading, description) {
    const section = node('section', 'teacher-section');
    section.append(node('h2', '', heading));
    if (description) section.append(node('p', '', description));
    viewRoot.append(section);
    return section;
}

function makeField(parent, spec) {
    const wrapper = node('div', 'teacher-field');
    const id = `teacher-field-${spec.name}`;
    if (spec.type === 'checkbox') {
        const label = node('label', 'teacher-checkbox');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.name = spec.name;
        label.append(input, node('span', '', spec.label));
        wrapper.append(label);
        parent.append(wrapper);
        return input;
    }

    const label = node('label', '', spec.label);
    label.htmlFor = id;
    let input;
    if (spec.type === 'select') {
        input = document.createElement('select');
        input.className = 'module-select';
        const placeholder = node('option', '', 'Choisir…');
        placeholder.value = '';
        input.append(placeholder);
        (spec.options || []).forEach((option) => {
            const optionNode = node('option', '', option.label);
            optionNode.value = option.value;
            input.append(optionNode);
        });
    } else if (spec.type === 'textarea') {
        input = document.createElement('textarea');
    } else {
        input = document.createElement('input');
        input.type = spec.type || 'text';
    }
    input.id = id;
    input.name = spec.name;
    input.required = Boolean(spec.required);
    if (spec.min !== undefined) input.min = String(spec.min);
    if (spec.step) input.step = spec.step;
    if (spec.maxLength) input.maxLength = spec.maxLength;
    if (spec.accept) input.accept = spec.accept;
    wrapper.append(label, input);
    parent.append(wrapper);
    return input;
}

function fieldValue(controls, name) {
    const input = controls[name];
    if (input.type === 'checkbox') return input.checked;
    if (input.value === '') return null;
    if (input.type === 'number') return Number(input.value);
    return input.value.trim();
}

function fillOptions(select, options, selectedValue = '') {
    select.replaceChildren();
    const placeholder = node('option', '', 'Choisir…');
    placeholder.value = '';
    select.append(placeholder);
    options.forEach((option) => {
        const item = node('option', '', option.label);
        item.value = option.value;
        select.append(item);
    });
    select.value = selectedValue || '';
}

function makeForm(section, specs, submitLabel, onSubmit) {
    const form = node('form', 'teacher-form');
    const grid = node('div', 'teacher-form-grid');
    form.append(grid);
    const controls = {};
    specs.forEach((spec) => {
        controls[spec.name] = makeField(grid, spec);
    });
    const actions = node('div', 'teacher-actions');
    const submit = node('button', 'student-button student-button-primary', submitLabel);
    submit.type = 'submit';
    const cancel = node('button', 'student-button student-button-secondary', 'Annuler la modification');
    cancel.type = 'button';
    cancel.hidden = true;
    actions.append(submit, cancel);
    form.append(actions);
    section.append(form);

    cancel.addEventListener('click', () => {
        editingRecordId = null;
        form.reset();
        cancel.hidden = true;
        submit.textContent = submitLabel;
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        clearAlert();
        try {
            await onSubmit(controls, form, { submit, cancel });
        } catch (error) {
            notify(error instanceof Error ? error.message : 'L’opération a échoué.');
        } finally {
            submit.disabled = false;
        }
    });
    return { form, controls, submit, cancel };
}

function makeTable(headers, rows, emptyMessage) {
    if (!rows.length) return node('p', 'module-empty', emptyMessage);
    const wrapper = node('div', 'module-table-wrap');
    const table = node('table', 'module-table');
    const head = node('thead');
    const headerRow = node('tr');
    headers.forEach((header) => headerRow.append(node('th', '', header)));
    head.append(headerRow);
    const body = node('tbody');
    rows.forEach((cells) => {
        const row = node('tr');
        cells.forEach((cell) => row.append(cell instanceof Node ? cell : node('td', '', cell)));
        body.append(row);
    });
    table.append(head, body);
    wrapper.append(table);
    return wrapper;
}

function courseLabel(course) {
    return [
        relation(course.subjects)?.name || 'Cours',
        relation(course.programs)?.name,
        relation(course.levels)?.name,
        relation(course.academic_years)?.label
    ].filter(Boolean).join(' · ');
}

function courseOptions() {
    return teacherCourses.map((course) => ({ value: course.id, label: courseLabel(course) }));
}

async function loadTeacherCourses() {
    teacherCourses = await queryData(
        supabase.from('courses')
            .select('id,subject_id,program_id,level_id,academic_year_id,description,subjects(name,code),programs(name),levels(name),academic_years(label)')
            .eq('teacher_id', currentUser.id)
            .order('created_at', { ascending: false }),
        'Impossible de charger les cours qui vous sont attribués.'
    ) || [];
    return teacherCourses;
}

async function loadCourseEnrollments() {
    const courseIds = teacherCourses.map((course) => course.id);
    if (!courseIds.length) {
        courseEnrollments = [];
        return courseEnrollments;
    }
    courseEnrollments = await queryData(
        supabase.from('course_enrollments')
            .select('course_id,student_id,students(matricule)')
            .in('course_id', courseIds)
            .order('enrolled_at', { ascending: false }),
        'Impossible de charger les étudiants inscrits à vos cours.'
    ) || [];
    return courseEnrollments;
}

async function loadAcademicPeriods() {
    const yearIds = [...new Set(teacherCourses.map((course) => course.academic_year_id))];
    if (!yearIds.length) {
        academicPeriods = [];
        return academicPeriods;
    }
    academicPeriods = await queryData(
        supabase.from('academic_periods')
            .select('id,label,academic_year_id,starts_on,ends_on')
            .in('academic_year_id', yearIds)
            .order('starts_on'),
        'Impossible de charger les périodes académiques de vos cours.'
    ) || [];
    return academicPeriods;
}

function studentLabel(enrollment) {
    return relation(enrollment.students)?.matricule || enrollment.student_id;
}

async function renderOverview() {
    makeIntro('Consultez les cours qui vous sont attribués et accédez rapidement à vos outils pédagogiques.');
    await loadTeacherCourses();
    const [grades, schedules, documents] = await Promise.all([
        queryCount(
            teacherCourses.length
                ? supabase.from('grades').select('id', { count: 'exact', head: true }).in('course_id', teacherCourses.map((course) => course.id))
                : Promise.resolve({ count: 0, error: null }),
            'Impossible de compter les évaluations.'
        ),
        queryCount(
            teacherCourses.length
                ? supabase.from('schedules').select('id', { count: 'exact', head: true }).in('course_id', teacherCourses.map((course) => course.id))
                : Promise.resolve({ count: 0, error: null }),
            'Impossible de compter les séances.'
        ),
        queryCount(
            teacherCourses.length
                ? supabase.from('documents').select('id', { count: 'exact', head: true }).in('course_id', teacherCourses.map((course) => course.id))
                : Promise.resolve({ count: 0, error: null }),
            'Impossible de compter les documents.'
        )
    ]);

    const stats = node('div', 'teacher-stat-grid');
    [
        ['Cours attribués', teacherCourses.length],
        ['Évaluations', grades],
        ['Séances planifiées', schedules],
        ['Documents de cours', documents]
    ].forEach(([label, count]) => {
        const card = node('article', 'teacher-stat-card');
        card.append(node('span', '', label), node('strong', '', count));
        stats.append(card);
    });
    viewRoot.append(stats);

    const section = makeSection('Mes cours', '');
    const cards = node('div', 'module-card-grid');
    teacherCourses.forEach((course) => {
        const card = node('article', 'module-card');
        const heading = node('div', 'module-card-heading');
        heading.append(node('h2', '', courseLabel(course)));
        const subject = relation(course.subjects);
        if (subject?.code) heading.append(node('span', 'module-tag', subject.code));
        card.replaceChildren(heading);
        if (course.description) card.append(node('p', 'module-card-copy', course.description));
        cards.append(card);
    });
    section.append(cards.children.length ? cards : node('p', 'module-empty', 'Aucun cours ne vous est attribué pour le moment.'));
}

async function renderCourses() {
    makeIntro('Liste des cours dont vous êtes l’enseignant responsable.');
    await loadTeacherCourses();
    const section = makeSection('Cours attribués', '');
    if (!teacherCourses.length) {
        section.append(node('p', 'module-empty', 'Aucun cours ne vous est attribué pour le moment.'));
        return;
    }
    const cards = node('div', 'module-card-grid');
    teacherCourses.forEach((course) => {
        const card = node('article', 'module-card');
        const heading = node('div', 'module-card-heading');
        heading.append(node('h2', '', courseLabel(course)));
        const subject = relation(course.subjects);
        if (subject?.code) heading.append(node('span', 'module-tag', subject.code));
        card.append(heading);
        if (course.description) card.append(node('p', 'module-card-copy', course.description));
        cards.append(card);
    });
    section.append(cards);
}

function gradeTypeLabel(type) {
    return { homework: 'Devoir', lab: 'TP', exam: 'Examen' }[type] || type;
}

async function renderGrades() {
    makeIntro('Saisissez et publiez les résultats uniquement pour les étudiants inscrits à vos cours.');
    await loadTeacherCourses();
    await Promise.all([loadCourseEnrollments(), loadAcademicPeriods()]);

    const section = makeSection('Saisir une note', 'Les notes restent privées jusqu’à leur publication.');
    const specs = [
        { name: 'course_id', label: 'Cours', type: 'select', required: true, options: courseOptions() },
        { name: 'student_id', label: 'Étudiant (matricule)', type: 'select', required: true, options: [] },
        { name: 'academic_period_id', label: 'Période', type: 'select', required: true, options: [] },
        { name: 'assessment_type', label: 'Type d’évaluation', type: 'select', required: true, options: [
            { value: 'homework', label: 'Devoir' },
            { value: 'lab', label: 'TP' },
            { value: 'exam', label: 'Examen' }
        ] },
        { name: 'assessment_name', label: 'Intitulé', required: true, maxLength: 180 },
        { name: 'score', label: 'Note obtenue', type: 'number', required: true, min: 0, step: '0.01' },
        { name: 'max_score', label: 'Note maximale', type: 'number', required: true, min: 0.01, step: '0.01' },
        { name: 'weight', label: 'Coefficient (facultatif)', type: 'number', min: 0.01, step: '0.01' },
        { name: 'is_published', label: 'Publier la note', type: 'checkbox' }
    ];
    const editor = makeForm(section, specs, 'Enregistrer la note', async (controls, form, buttons) => {
        const courseId = fieldValue(controls, 'course_id');
        const studentId = fieldValue(controls, 'student_id');
        const periodId = fieldValue(controls, 'academic_period_id');
        const course = teacherCourses.find((record) => record.id === courseId);
        const enrolled = courseEnrollments.some((record) => record.course_id === courseId && record.student_id === studentId);
        const period = academicPeriods.find((record) => record.id === periodId);
        if (!course || !enrolled) throw new Error('Choisissez un étudiant inscrit à ce cours.');
        if (!period || period.academic_year_id !== course.academic_year_id) {
            throw new Error('Choisissez une période de l’année académique du cours.');
        }
        const score = fieldValue(controls, 'score');
        const maxScore = fieldValue(controls, 'max_score');
        const weight = fieldValue(controls, 'weight');
        if (score === null || score < 0 || maxScore === null || maxScore <= 0 || score > maxScore) {
            throw new Error('La note obtenue doit être positive ou nulle et ne pas dépasser la note maximale.');
        }
        if (weight !== null && weight <= 0) throw new Error('Le coefficient doit être strictement positif.');
        const published = fieldValue(controls, 'is_published');
        const payload = {
            student_id: studentId,
            course_id: courseId,
            academic_year_id: course.academic_year_id,
            academic_period_id: periodId,
            assessment_type: fieldValue(controls, 'assessment_type'),
            assessment_name: fieldValue(controls, 'assessment_name'),
            score,
            max_score: maxScore,
            weight,
            is_published: published,
            published_at: published ? new Date().toISOString() : null,
            entered_by: currentUser.id
        };
        const result = editingRecordId
            ? await supabase.from('grades').update(payload).eq('id', editingRecordId)
            : await supabase.from('grades').insert(payload);
        if (result.error) throw new Error(`Impossible d’enregistrer la note. ${result.error.message}`);
        editingRecordId = null;
        await renderCurrentView();
        notify('La note a été enregistrée.', true);
    });

    const courseSelect = editor.controls.course_id;
    const studentSelect = editor.controls.student_id;
    const periodSelect = editor.controls.academic_period_id;
    function updateGradeOptions() {
        const selectedCourse = teacherCourses.find((course) => course.id === courseSelect.value);
        fillOptions(
            studentSelect,
            courseEnrollments
                .filter((record) => record.course_id === courseSelect.value)
                .map((record) => ({ value: record.student_id, label: studentLabel(record) }))
        );
        fillOptions(
            periodSelect,
            academicPeriods
                .filter((period) => period.academic_year_id === selectedCourse?.academic_year_id)
                .map((period) => ({ value: period.id, label: period.label }))
        );
    }
    courseSelect.addEventListener('change', updateGradeOptions);
    updateGradeOptions();
    if (editingRecordId) editor.cancel.hidden = false;

    const listSection = makeSection('Évaluations', '');
    const courseIds = teacherCourses.map((course) => course.id);
    const grades = courseIds.length
        ? await queryData(
            supabase.from('grades')
                .select('id,student_id,course_id,academic_period_id,assessment_type,assessment_name,score,max_score,weight,is_published,published_at,students(matricule),courses(subjects(name)),academic_periods(label)')
                .in('course_id', courseIds)
                .order('created_at', { ascending: false }),
            'Impossible de charger les évaluations de vos cours.'
        )
        : [];
    const rows = (grades || []).map((grade) => {
        const course = relation(grade.courses);
        const subject = relation(course?.subjects);
        const student = relation(grade.students);
        const period = relation(grade.academic_periods);
        const edit = node('button', 'student-button student-button-secondary', 'Modifier');
        edit.type = 'button';
        edit.addEventListener('click', () => {
            editingRecordId = grade.id;
            courseSelect.value = grade.course_id;
            updateGradeOptions();
            studentSelect.value = grade.student_id;
            periodSelect.value = grade.academic_period_id;
            editor.controls.assessment_type.value = grade.assessment_type;
            editor.controls.assessment_name.value = grade.assessment_name;
            editor.controls.score.value = grade.score;
            editor.controls.max_score.value = grade.max_score;
            editor.controls.weight.value = grade.weight ?? '';
            editor.controls.is_published.checked = grade.is_published;
            editor.submit.textContent = 'Enregistrer les modifications';
            editor.cancel.hidden = false;
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        const publish = node('button', 'student-button student-button-secondary', grade.is_published ? 'Dépublier' : 'Publier');
        publish.type = 'button';
        publish.addEventListener('click', () => runAction(async () => {
            const isPublished = !grade.is_published;
            const { error } = await supabase.from('grades')
                .update({ is_published: isPublished, published_at: isPublished ? new Date().toISOString() : null })
                .eq('id', grade.id);
            if (error) throw new Error(`Impossible de modifier la publication de la note. ${error.message}`);
            await renderCurrentView();
            notify(isPublished ? 'La note est publiée.' : 'La note a été dépubliée.', true);
        }, 'Impossible de modifier la publication de la note.'));
        const remove = node('button', 'student-button student-button-secondary', 'Supprimer');
        remove.type = 'button';
        remove.addEventListener('click', () => runAction(async () => {
            if (!window.confirm('Supprimer définitivement cette note ?')) return;
            const { error } = await supabase.from('grades').delete().eq('id', grade.id);
            if (error) throw new Error(`Impossible de supprimer la note. ${error.message}`);
            await renderCurrentView();
            notify('La note a été supprimée.', true);
        }, 'Impossible de supprimer la note.'));
        const actions = node('td');
        actions.append(edit, publish, remove);
        return [
            node('td', '', student?.matricule || grade.student_id),
            node('td', '', subject?.name || 'Matière inconnue'),
            node('td', '', grade.assessment_name),
            node('td', '', gradeTypeLabel(grade.assessment_type)),
            node('td', '', `${grade.score} / ${grade.max_score}`),
            node('td', '', period?.label || '—'),
            node('td', '', grade.is_published ? 'Publiée' : 'Brouillon'),
            actions
        ];
    });
    listSection.append(makeTable(
        ['Matricule', 'Matière', 'Évaluation', 'Type', 'Résultat', 'Période', 'État', 'Actions'],
        rows,
        'Aucune évaluation n’est enregistrée pour vos cours.'
    ));
}

async function renderSchedule() {
    makeIntro('Planifiez des séances pour les cours qui vous sont attribués.');
    await loadTeacherCourses();
    await loadAcademicPeriods();
    const section = makeSection('Planifier une séance', '');
    const specs = [
        { name: 'course_id', label: 'Cours', type: 'select', required: true, options: courseOptions() },
        { name: 'academic_period_id', label: 'Période', type: 'select', required: true, options: [] },
        { name: 'weekday', label: 'Jour', type: 'select', required: true, options: [
            { value: '1', label: 'Lundi' },
            { value: '2', label: 'Mardi' },
            { value: '3', label: 'Mercredi' },
            { value: '4', label: 'Jeudi' },
            { value: '5', label: 'Vendredi' },
            { value: '6', label: 'Samedi' },
            { value: '7', label: 'Dimanche' }
        ] },
        { name: 'starts_at', label: 'Début', type: 'time', required: true },
        { name: 'ends_at', label: 'Fin', type: 'time', required: true },
        { name: 'room', label: 'Salle (facultatif)', maxLength: 120 }
    ];
    const editor = makeForm(section, specs, 'Enregistrer la séance', async (controls) => {
        const course = teacherCourses.find((record) => record.id === fieldValue(controls, 'course_id'));
        const period = academicPeriods.find((record) => record.id === fieldValue(controls, 'academic_period_id'));
        if (!course) throw new Error('Choisissez un cours attribué à votre compte.');
        if (!period || period.academic_year_id !== course.academic_year_id) {
            throw new Error('Choisissez une période de l’année académique du cours.');
        }
        const startsAt = fieldValue(controls, 'starts_at');
        const endsAt = fieldValue(controls, 'ends_at');
        if (!startsAt || !endsAt || startsAt >= endsAt) throw new Error('L’heure de fin doit être postérieure à l’heure de début.');
        const payload = {
            course_id: course.id,
            academic_year_id: course.academic_year_id,
            academic_period_id: period.id,
            weekday: Number(fieldValue(controls, 'weekday')),
            starts_at: startsAt,
            ends_at: endsAt,
            room: fieldValue(controls, 'room'),
            created_by: currentUser.id
        };
        const result = editingRecordId
            ? await supabase.from('schedules').update(payload).eq('id', editingRecordId)
            : await supabase.from('schedules').insert(payload);
        if (result.error) throw new Error(`Impossible d’enregistrer la séance. ${result.error.message}`);
        editingRecordId = null;
        await renderCurrentView();
        notify('La séance a été enregistrée.', true);
    });
    const courseSelect = editor.controls.course_id;
    const periodSelect = editor.controls.academic_period_id;
    function updatePeriodOptions() {
        const course = teacherCourses.find((record) => record.id === courseSelect.value);
        fillOptions(
            periodSelect,
            academicPeriods
                .filter((period) => period.academic_year_id === course?.academic_year_id)
                .map((period) => ({ value: period.id, label: period.label }))
        );
    }
    courseSelect.addEventListener('change', updatePeriodOptions);
    updatePeriodOptions();

    const listSection = makeSection('Séances planifiées', '');
    const courseIds = teacherCourses.map((course) => course.id);
    const schedules = courseIds.length
        ? await queryData(
            supabase.from('schedules')
                .select('id,course_id,academic_year_id,academic_period_id,weekday,starts_at,ends_at,room,courses(subjects(name)),academic_periods(label)')
                .in('course_id', courseIds)
                .order('weekday')
                .order('starts_at'),
            'Impossible de charger les séances de vos cours.'
        )
        : [];
    const weekdays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const rows = (schedules || []).map((schedule) => {
        const course = relation(schedule.courses);
        const subject = relation(course?.subjects);
        const period = relation(schedule.academic_periods);
        const edit = node('button', 'student-button student-button-secondary', 'Modifier');
        edit.type = 'button';
        edit.addEventListener('click', () => {
            editingRecordId = schedule.id;
            courseSelect.value = schedule.course_id;
            updatePeriodOptions();
            periodSelect.value = schedule.academic_period_id;
            editor.controls.weekday.value = String(schedule.weekday);
            editor.controls.starts_at.value = String(schedule.starts_at).slice(0, 5);
            editor.controls.ends_at.value = String(schedule.ends_at).slice(0, 5);
            editor.controls.room.value = schedule.room || '';
            editor.submit.textContent = 'Enregistrer les modifications';
            editor.cancel.hidden = false;
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        const remove = node('button', 'student-button student-button-secondary', 'Supprimer');
        remove.type = 'button';
        remove.addEventListener('click', () => runAction(async () => {
            if (!window.confirm('Supprimer cette séance ?')) return;
            const { error } = await supabase.from('schedules').delete().eq('id', schedule.id);
            if (error) throw new Error(`Impossible de supprimer la séance. ${error.message}`);
            await renderCurrentView();
            notify('La séance a été supprimée.', true);
        }, 'Impossible de supprimer la séance.'));
        const actions = node('td');
        actions.append(edit, remove);
        return [
            node('td', '', subject?.name || 'Matière inconnue'),
            node('td', '', weekdays[schedule.weekday - 1] || '—'),
            node('td', '', `${String(schedule.starts_at).slice(0, 5)} – ${String(schedule.ends_at).slice(0, 5)}`),
            node('td', '', schedule.room || '—'),
            node('td', '', period?.label || '—'),
            actions
        ];
    });
    listSection.append(makeTable(['Matière', 'Jour', 'Horaire', 'Salle', 'Période', 'Actions'], rows, 'Aucune séance n’est planifiée pour vos cours.'));
}

async function renderDocuments() {
    makeIntro('Déposez des supports privés pour les cours qui vous sont attribués.');
    await loadTeacherCourses();
    const section = makeSection('Ajouter un document de cours', 'Les ressources ne sont visibles par les étudiants qu’après publication.');
    const specs = [
        { name: 'course_id', label: 'Cours', type: 'select', required: true, options: courseOptions() },
        { name: 'title', label: 'Titre', required: true, maxLength: 180 },
        { name: 'document_type', label: 'Type', type: 'select', required: true, options: [
            { value: 'course', label: 'Cours' },
            { value: 'exercise', label: 'Exercices' },
            { value: 'tutorial', label: 'Travaux dirigés' },
            { value: 'lab', label: 'Travaux pratiques' },
            { value: 'supplement', label: 'Compléments' }
        ] },
        { name: 'description', label: 'Description (facultatif)', type: 'textarea', maxLength: 5000 },
        { name: 'file', label: 'Fichier', type: 'file', required: true, accept: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png' },
        { name: 'is_published', label: 'Publier immédiatement', type: 'checkbox' }
    ];
    const editor = makeForm(section, specs, 'Importer le document', async (controls, form) => {
        const course = teacherCourses.find((record) => record.id === fieldValue(controls, 'course_id'));
        const file = controls.file.files[0];
        if (!course) throw new Error('Choisissez un cours qui vous est attribué.');
        if (!file) throw new Error('Choisissez un fichier à importer.');
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '') || 'document';
        const storagePath = `${course.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
            .from('student-documents')
            .upload(storagePath, file, { upsert: false });
        if (uploadError) throw new Error(`Impossible d’importer le fichier. ${uploadError.message}`);

        const published = fieldValue(controls, 'is_published');
        const { error: insertError } = await supabase.from('documents').insert({
            course_id: course.id,
            subject_id: course.subject_id,
            title: fieldValue(controls, 'title'),
            description: fieldValue(controls, 'description'),
            document_type: fieldValue(controls, 'document_type'),
            storage_bucket: 'student-documents',
            storage_path: storagePath,
            is_published: published,
            published_at: published ? new Date().toISOString() : null,
            uploaded_by: currentUser.id
        });
        if (insertError) {
            const { error: cleanupError } = await supabase.storage.from('student-documents').remove([storagePath]);
            throw new Error(cleanupError
                ? `La fiche du document n’a pas été créée et le fichier temporaire n’a pas pu être supprimé. ${insertError.message} ${cleanupError.message}`
                : `La fiche du document n’a pas été créée ; le fichier temporaire a été supprimé. ${insertError.message}`);
        }
        editingRecordId = null;
        form.reset();
        await renderCurrentView();
        notify('Le document a été importé.', true);
    });

    const listSection = makeSection('Documents de cours', '');
    const courseIds = teacherCourses.map((course) => course.id);
    const records = courseIds.length
        ? await queryData(
            supabase.from('documents')
                .select('id,title,document_type,storage_bucket,storage_path,is_published,published_at,uploaded_by,courses(subjects(name))')
                .in('course_id', courseIds)
                .order('created_at', { ascending: false }),
            'Impossible de charger les documents de vos cours.'
        )
        : [];
    const rows = (records || []).map((record) => {
        const download = node('button', 'student-button student-button-secondary', 'Télécharger');
        download.type = 'button';
        download.addEventListener('click', () => runAction(async () => {
            const { data, error } = await supabase.storage
                .from(record.storage_bucket)
                .createSignedUrl(record.storage_path, 60);
            if (error) throw new Error(`Téléchargement impossible. ${error.message}`);
            if (!data?.signedUrl) throw new Error('Lien temporaire de téléchargement manquant.');
            window.location.assign(data.signedUrl);
        }, 'Téléchargement impossible.'));

        const publish = node('button', 'student-button student-button-secondary', record.is_published ? 'Dépublier' : 'Publier');
        publish.type = 'button';
        publish.addEventListener('click', () => runAction(async () => {
            const isPublished = !record.is_published;
            const { error } = await supabase.from('documents')
                .update({ is_published: isPublished, published_at: isPublished ? new Date().toISOString() : null })
                .eq('id', record.id);
            if (error) throw new Error(`Impossible de modifier la publication. ${error.message}`);
            await renderCurrentView();
            notify(isPublished ? 'Le document est publié.' : 'Le document a été dépublié.', true);
        }, 'Impossible de modifier la publication.'));

        const actions = node('td');
        actions.append(download, publish);
        if (record.uploaded_by === currentUser.id) {
            const remove = node('button', 'student-button student-button-secondary', 'Supprimer');
            remove.type = 'button';
            remove.addEventListener('click', () => runAction(async () => {
                if (!window.confirm('Supprimer ce document et son fichier privé ?')) return;
                const { error: fileError } = await supabase.storage.from(record.storage_bucket).remove([record.storage_path]);
                if (fileError) throw new Error(`Impossible de supprimer le fichier privé. ${fileError.message}`);
                const { error: rowError } = await supabase.from('documents').delete().eq('id', record.id);
                if (rowError) throw new Error(`Le fichier a été supprimé, mais la fiche du document n’a pas pu être retirée. ${rowError.message}`);
                await renderCurrentView();
                notify('Le document a été supprimé.', true);
            }, 'Impossible de supprimer le document.'));
            actions.append(remove);
        }
        return [
            node('td', '', record.title),
            node('td', '', record.document_type),
            node('td', '', relation(relation(record.courses)?.subjects)?.name || '—'),
            node('td', '', record.is_published ? 'Publié' : 'Brouillon'),
            actions
        ];
    });
    listSection.append(makeTable(['Titre', 'Type', 'Matière', 'État', 'Actions'], rows, 'Aucun document n’est encore disponible pour vos cours.'));
}

async function renderCurrentView() {
    viewRoot.replaceChildren();
    clearAlert();
    title.textContent = views[currentView] || views.overview;
    document.title = `${title.textContent} | IPTO`;
    setActiveNavigation();

    const renderers = {
        overview: renderOverview,
        courses: renderCourses,
        grades: renderGrades,
        schedule: renderSchedule,
        documents: renderDocuments
    };
    await renderers[currentView]();
}

if (!views[currentView]) {
    window.location.replace('teacher.html');
} else {
    try {
        supabase = createSupabaseClient();
    } catch {
        window.location.replace('login.html?reason=configuration');
    }

    if (supabase) {
        const access = await getTeacherUser(supabase);
        if (!access.user) {
            window.location.replace(`login.html?reason=${access.reason}`);
        } else {
            currentUser = access.user;
            email.textContent = currentUser.email || 'Compte enseignant';
            loading.hidden = true;
            shell.hidden = false;
            supabase.auth.onAuthStateChange((event) => {
                if (event === 'SIGNED_OUT') window.location.replace('login.html?reason=session');
            });
            await runAction(renderCurrentView, 'Impossible de charger cette section.');
        }
    }
}
