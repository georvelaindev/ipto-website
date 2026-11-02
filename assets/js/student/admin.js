import { createSupabaseClient, getAdminUser } from './supabase-client.js';
import { relatedRecord } from './student-data.js';

const loading = document.querySelector('#admin-loading');
const shell = document.querySelector('#admin-shell');
const title = document.querySelector('#admin-title');
const email = document.querySelector('#admin-email');
const alertBox = document.querySelector('#admin-alert');
const viewRoot = document.querySelector('#admin-view');
const logoutButton = document.querySelector('#admin-logout');
const sidebar = document.querySelector('#admin-sidebar');
const menuToggle = document.querySelector('#admin-menu-toggle');
const overlay = document.querySelector('#admin-overlay');

const views = {
    overview: 'Vue d’ensemble',
    students: 'Dossiers étudiants',
    enrollments: 'Inscriptions',
    catalog: 'Catalogue académique',
    announcements: 'Annonces',
    internships: 'Offres de stage',
    documents: 'Documents pédagogiques'
};

const currentView = new URLSearchParams(window.location.search).get('view') || 'overview';
let supabase;
let currentUser;
let catalogOptions = {};
let catalogEditId = null;
let catalogEntity = 'academic_years';

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

function runAction(action, fallbackMessage) {
    return Promise.resolve()
        .then(action)
        .catch((error) => notify(error instanceof Error ? error.message : fallbackMessage));
}

function clearAlert() {
    alertBox.textContent = '';
    alertBox.hidden = true;
    alertBox.classList.remove('success');
}

async function queryData(query, message) {
    const { data, error } = await query;
    if (error) throw new Error(`${message} ${error.message}`);
    return data;
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
        node('p', 'student-eyebrow', 'Administration IPTO'),
        node('p', 'module-description', description)
    );
    viewRoot.append(intro);
}

function makeSection(heading, description) {
    const section = node('section', 'admin-section');
    section.append(node('h2', '', heading));
    if (description) section.append(node('p', '', description));
    viewRoot.append(section);
    return section;
}

function makeField(form, spec, value) {
    const wrapper = node('div', 'admin-field');
    const id = `admin-field-${spec.name}`;
    let control;

    if (spec.type === 'checkbox') {
        const label = node('label', 'admin-checkbox');
        control = document.createElement('input');
        control.type = 'checkbox';
        control.name = spec.name;
        control.id = id;
        control.checked = Boolean(value ?? spec.checked);
        control.defaultChecked = Boolean(spec.checked);
        label.append(control, node('span', '', spec.label));
        wrapper.append(label);
        form.append(wrapper);
        return control;
    }

    const label = node('label', '', spec.label);
    label.htmlFor = id;
    if (spec.type === 'select') {
        control = document.createElement('select');
        control.className = 'module-select';
        const placeholder = node('option', '', spec.placeholder || 'Choisir…');
        placeholder.value = '';
        control.append(placeholder);
        (spec.options || []).forEach((option) => {
            const optionNode = node('option', '', option.label);
            optionNode.value = option.value;
            control.append(optionNode);
        });
    } else if (spec.type === 'textarea') {
        control = document.createElement('textarea');
    } else {
        control = document.createElement('input');
        control.type = spec.type || 'text';
    }

    control.id = id;
    control.name = spec.name;
    control.required = Boolean(spec.required);
    if (spec.minLength) control.minLength = spec.minLength;
    if (spec.maxLength) control.maxLength = spec.maxLength;
    if (spec.min !== undefined) control.min = String(spec.min);
    if (spec.step) control.step = spec.step;
    if (spec.placeholder) control.placeholder = spec.placeholder;
    if (value !== undefined && value !== null) control.value = String(value);
    wrapper.append(label, control);
    form.append(wrapper);
    return control;
}

function makeForm(section, fields, submitLabel, onSubmit) {
    const form = node('form', 'admin-form');
    const grid = node('div', 'admin-form-grid');
    form.append(grid);
    section.append(form);
    const controls = new Map();
    fields.forEach((spec) => controls.set(spec.name, makeField(grid, spec)));
    const actions = node('div', 'admin-actions');
    const submit = node('button', 'student-button student-button-primary', submitLabel);
    submit.type = 'submit';
    actions.append(submit);
    form.append(actions);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();
        submit.disabled = true;
        try {
            await onSubmit(controls, form);
        } catch (error) {
            notify(error instanceof Error ? error.message : 'L’opération a échoué.');
        } finally {
            submit.disabled = false;
        }
    });
    return { form, controls, actions };
}

function fieldValue(controls, name) {
    const control = controls.get(name);
    if (control.type === 'checkbox') return control.checked;
    if (control.value === '') return null;
    if (control.type === 'number') return Number(control.value);
    return control.value.trim();
}

function makeTable(headers, rows, emptyMessage) {
    if (!rows.length) return node('p', 'module-empty', emptyMessage);
    const wrapper = node('div', 'admin-table-wrap');
    const table = node('table', 'admin-table');
    const thead = node('thead');
    const header = node('tr');
    headers.forEach((label) => header.append(node('th', '', label)));
    thead.append(header);
    const body = node('tbody');
    rows.forEach((cells) => {
        const row = node('tr');
        cells.forEach((cell) => row.append(cell instanceof Node ? cell : node('td', '', cell)));
        body.append(row);
    });
    table.append(thead, body);
    wrapper.append(table);
    return wrapper;
}

function profileLabel(profile) {
    return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Nom non renseigné';
}

function selectOptions(records, labelFor, valueField = 'id') {
    return records.map((record) => ({ value: record[valueField], label: labelFor(record) }));
}

function makeSelect(name, options, value) {
    const select = node('select', 'module-select');
    select.name = name;
    options.forEach((option) => {
        const item = node('option', '', option.label);
        item.value = option.value;
        select.append(item);
    });
    select.value = value;
    return select;
}

async function renderOverview() {
    makeIntro('Vue rapide des données accessibles à votre rôle administrateur.');
    const resources = [
        ['Étudiants', 'students', null],
        ['Inscriptions actives', 'enrollments', 'active'],
        ['Cours', 'courses', null],
        ['Annonces publiées', 'announcements', 'published']
    ];
    const counts = await Promise.all(resources.map(async ([label, table, filter]) => {
        let query = supabase.from(table).select('id', { count: 'exact', head: true });
        if (filter === 'active') query = query.eq('status', 'active');
        if (filter === 'published') query = query.eq('is_published', true);
        const { count, error } = await query;
        if (error) throw new Error(`Impossible de compter ${label.toLocaleLowerCase('fr')}. ${error.message}`);
        return { label, count: count || 0 };
    }));

    const grid = node('div', 'admin-stat-grid');
    counts.forEach(({ label, count }) => {
        const card = node('article', 'admin-stat-card');
        card.append(node('span', '', label), node('strong', '', count));
        grid.append(card);
    });
    viewRoot.append(grid);

}

async function renderStudents() {
    makeIntro('Gérez les rôles et les dossiers étudiants. Votre compte administrateur est déjà configuré.');
    const addSection = makeSection('Rattacher un compte étudiant existant', 'Pour un étudiant ayant déjà un compte Auth, saisissez son UUID et son matricule. Les nouveaux étudiants peuvent s’inscrire eux-mêmes depuis la page de connexion.');

    const studentFields = [
        { name: 'user_id', label: 'UUID du compte Auth', required: true, minLength: 36, maxLength: 36, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
        { name: 'matricule', label: 'Matricule étudiant', required: true, maxLength: 64 }
    ];
    makeForm(addSection, studentFields, 'Créer le dossier étudiant', async (controls, form) => {
        const userId = fieldValue(controls, 'user_id');
        const matricule = fieldValue(controls, 'matricule');
        if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(userId)) {
            throw new Error('Saisissez un UUID de compte Auth valide.');
        }
        if (!matricule) throw new Error('Saisissez un matricule étudiant.');
        const { error: roleError } = await supabase.rpc('admin_set_user_role', {
            _user_id: userId,
            _role: 'student'
        });
        if (roleError) throw new Error(`Impossible d’attribuer le rôle étudiant. ${roleError.message}`);

        const { error } = await supabase.from('students').upsert(
            { id: userId, matricule },
            { onConflict: 'id' }
        );
        if (error) {
            throw new Error(`Le rôle étudiant a été attribué, mais le dossier n’a pas été enregistré. ${error.message}`);
        }
        form.reset();
        await renderCurrentView();
        notify('Le dossier étudiant a été enregistré.', true);
    });

    const editSection = makeSection('Modifier un profil', 'Sélectionnez un profil dans la liste pour modifier ses informations.');
    const editForm = node('form', 'admin-form');
    const editGrid = node('div', 'admin-form-grid');
    editForm.append(editGrid);
    const firstName = makeField(editGrid, { name: 'first_name', label: 'Prénom', maxLength: 100 });
    const lastName = makeField(editGrid, { name: 'last_name', label: 'Nom', maxLength: 100 });
    const phone = makeField(editGrid, { name: 'phone', label: 'Téléphone', maxLength: 32, placeholder: 'Ex. +242…' });
    const editActions = node('div', 'admin-actions');
    const saveProfile = node('button', 'student-button student-button-primary', 'Enregistrer le profil');
    saveProfile.type = 'submit';
    const cancelEdit = node('button', 'student-button student-button-secondary', 'Annuler');
    cancelEdit.type = 'button';
    editActions.append(saveProfile, cancelEdit);
    editForm.append(editActions);
    editSection.append(editForm);
    editSection.hidden = true;
    let editingProfileId = null;

    cancelEdit.addEventListener('click', () => {
        editingProfileId = null;
        editForm.reset();
        editSection.hidden = true;
    });

    editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!editingProfileId) return;
        saveProfile.disabled = true;
        try {
            const { error } = await supabase.rpc('admin_update_profile', {
                _profile_id: editingProfileId,
                _first_name: firstName.value.trim() || null,
                _last_name: lastName.value.trim() || null,
                _phone: phone.value.trim() || null
            });
            if (error) throw new Error(`Impossible de modifier le profil. ${error.message}`);
            await renderCurrentView();
            notify('Le profil a été mis à jour.', true);
        } catch (error) {
            notify(error instanceof Error ? error.message : 'La mise à jour du profil a échoué.');
        } finally {
            saveProfile.disabled = false;
        }
    });

    const listSection = makeSection('Comptes connus', 'Le rôle sélectionné est appliqué par la fonction sécurisée admin_set_user_role.');
    const records = await queryData(
        supabase.from('profiles')
            .select('id,first_name,last_name,phone,students(matricule),user_roles(role)')
            .order('last_name'),
        'Impossible de charger les profils.'
    ) || [];

    const search = node('input', 'module-search admin-search');
    search.type = 'search';
    search.placeholder = 'Rechercher par nom, matricule ou UUID';
    search.setAttribute('aria-label', 'Rechercher un profil');
    listSection.append(search);
    const tableHost = node('div');
    listSection.append(tableHost);

    function updateList() {
        const term = search.value.trim().toLocaleLowerCase('fr');
        const filtered = records.filter((record) => [
            record.first_name, record.last_name, relation(record.students)?.matricule, record.id
        ].filter(Boolean).join(' ').toLocaleLowerCase('fr').includes(term));

        const rows = filtered.map((record) => {
            const role = relation(record.user_roles)?.role || '';
            const roleSelect = makeSelect('role', [
                { value: '', label: 'Aucun rôle' },
                { value: 'student', label: 'Étudiant' },
                { value: 'teacher', label: 'Enseignant' },
                { value: 'admin', label: 'Administrateur' }
            ], role);
            roleSelect.setAttribute('aria-label', `Rôle du compte ${record.id}`);
            roleSelect.addEventListener('change', () => runAction(async () => {
                if (!window.confirm(`Confirmer le rôle « ${roleSelect.selectedOptions[0].textContent} » pour ce compte ?`)) {
                    roleSelect.value = role;
                    return;
                }
                if (!roleSelect.value) {
                    roleSelect.value = role;
                    notify('Un compte doit conserver un rôle. Les rôles ne peuvent pas être supprimés depuis cette interface.');
                    return;
                }
                roleSelect.disabled = true;
                let error;
                try {
                    ({ error } = await supabase.rpc('admin_set_user_role', {
                        _user_id: record.id,
                        _role: roleSelect.value
                    }));
                } catch (requestError) {
                    roleSelect.value = role;
                    roleSelect.disabled = false;
                    throw requestError;
                }
                if (error) {
                    notify(`Impossible de modifier le rôle. ${error.message}`);
                    roleSelect.value = role;
                    roleSelect.disabled = false;
                    return;
                }
                if (record.id === currentUser.id && roleSelect.value !== 'admin') {
                    window.location.replace('login.html');
                    return;
                }
                await renderCurrentView();
                notify('Le rôle a été modifié.', true);
            }, 'Impossible de modifier le rôle.'));

            const editButton = node('button', 'student-button student-button-secondary', 'Modifier');
            editButton.type = 'button';
            editButton.addEventListener('click', () => {
                editingProfileId = record.id;
                firstName.value = record.first_name || '';
                lastName.value = record.last_name || '';
                phone.value = record.phone || '';
                editSection.hidden = false;
                editSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstName.focus();
            });

            const idCell = node('td');
            idCell.append(node('code', '', record.id));
            const nameCell = node('td', '', profileLabel(record));
            const student = relation(record.students);
            const matriculeCell = node('td', '', student?.matricule || '—');
            const roleCell = node('td');
            roleCell.append(roleSelect);
            const actionCell = node('td');
            actionCell.append(editButton);
            return [nameCell, idCell, matriculeCell, roleCell, actionCell];
        });
        tableHost.replaceChildren(makeTable(['Nom', 'UUID Auth', 'Matricule', 'Rôle', 'Profil'], rows, 'Aucun profil n’est disponible.'));
    }

    search.addEventListener('input', updateList);
    updateList();
}

async function getEnrollmentOptions() {
    const [students, programs, levels, years] = await Promise.all([
        queryData(
            supabase.from('students').select('id,matricule,profiles(first_name,last_name)').order('matricule'),
            'Impossible de charger les étudiants.'
        ),
        queryData(supabase.from('programs').select('id,name').order('name'), 'Impossible de charger les filières.'),
        queryData(supabase.from('levels').select('id,name,position').order('position'), 'Impossible de charger les niveaux.'),
        queryData(supabase.from('academic_years').select('id,label,is_current').order('starts_on', { ascending: false }), 'Impossible de charger les années académiques.')
    ]);
    return { students: students || [], programs: programs || [], levels: levels || [], years: years || [] };
}

async function renderEnrollments() {
    makeIntro('Créez une inscription annuelle et suivez son statut administratif.');
    const options = await getEnrollmentOptions();
    const studentOptions = selectOptions(options.students, (student) => (
        `${student.matricule} — ${profileLabel(relation(student.profiles))}`
    ));
    const programOptions = selectOptions(options.programs, (program) => program.name);
    const levelOptions = selectOptions(options.levels, (level) => level.name);
    const yearOptions = selectOptions(options.years, (year) => `${year.label}${year.is_current ? ' (en cours)' : ''}`);

    const section = makeSection('Créer une inscription', 'Un étudiant ne peut avoir qu’une inscription par année académique.');
    const specs = [
        { name: 'student_id', label: 'Étudiant', type: 'select', required: true, options: studentOptions },
        { name: 'program_id', label: 'Filière', type: 'select', required: true, options: programOptions },
        { name: 'level_id', label: 'Niveau', type: 'select', required: true, options: levelOptions },
        { name: 'academic_year_id', label: 'Année académique', type: 'select', required: true, options: yearOptions },
        { name: 'status', label: 'Statut', type: 'select', required: true, options: [
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Terminée' },
            { value: 'suspended', label: 'Suspendue' },
            { value: 'withdrawn', label: 'Retirée' }
        ] },
        { name: 'enrolled_at', label: 'Date d’inscription', type: 'date', required: true }
    ];
    const { controls, form } = makeForm(section, specs, 'Enregistrer l’inscription', async (fields, currentForm) => {
        const payload = Object.fromEntries(specs.map((spec) => [spec.name, fieldValue(fields, spec.name)]));
        const { error } = await supabase.from('enrollments').insert(payload);
        if (error) throw new Error(`Impossible d’enregistrer l’inscription. ${error.message}`);
        currentForm.reset();
        controls.get('status').value = 'active';
        controls.get('enrolled_at').value = new Date().toISOString().slice(0, 10);
        await renderCurrentView();
        notify('L’inscription a été créée.', true);
    });
    controls.get('status').value = 'active';
    controls.get('enrolled_at').value = new Date().toISOString().slice(0, 10);

    const listSection = makeSection('Inscriptions enregistrées', '');
    const records = await queryData(
        supabase.from('enrollments')
            .select('id,student_id,status,enrolled_at,students(matricule,profiles(first_name,last_name)),programs(name),levels(name),academic_years(label)')
            .order('enrolled_at', { ascending: false }),
        'Impossible de charger les inscriptions.'
    ) || [];

    const rows = records.map((record) => {
        const status = makeSelect('status', [
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Terminée' },
            { value: 'suspended', label: 'Suspendue' },
            { value: 'withdrawn', label: 'Retirée' }
        ], record.status);
        status.setAttribute('aria-label', `Statut d’inscription ${record.id}`);
        status.addEventListener('change', () => runAction(async () => {
            let error;
            try {
                ({ error } = await supabase.from('enrollments').update({ status: status.value }).eq('id', record.id));
            } catch (requestError) {
                status.value = record.status;
                throw requestError;
            }
            if (error) {
                notify(`Impossible de modifier le statut. ${error.message}`);
                status.value = record.status;
                return;
            }
            notify('Le statut de l’inscription a été mis à jour.', true);
        }, 'Impossible de modifier le statut de l’inscription.'));
        const student = relation(record.students);
        const profile = relation(student?.profiles);
        const studentInfo = node('td', '', `${student?.matricule || 'Sans matricule'} — ${profileLabel(profile)}`);
        const program = relation(record.programs)?.name || '—';
        const level = relation(record.levels)?.name || '—';
        const year = relation(record.academic_years)?.label || '—';
        const statusCell = node('td');
        statusCell.append(status);
        return [studentInfo, node('td', '', program), node('td', '', level), node('td', '', year), node('td', '', record.enrolled_at), statusCell];
    });
    listSection.append(makeTable(['Étudiant', 'Filière', 'Niveau', 'Année', 'Inscription', 'Statut'], rows, 'Aucune inscription n’est enregistrée.'));

    const [activeEnrollments, courses, assignments] = await Promise.all([
        queryData(
            supabase.from('enrollments')
                .select('id,student_id,program_id,level_id,academic_year_id,students(matricule),programs(name),levels(name),academic_years(label)')
                .eq('status', 'active')
                .order('enrolled_at', { ascending: false }),
            'Impossible de charger les inscriptions actives.'
        ),
        queryData(
            supabase.from('courses')
                .select('id,program_id,level_id,academic_year_id,subjects(name),programs(name),levels(name),academic_years(label)')
                .order('created_at', { ascending: false }),
            'Impossible de charger les cours.'
        ),
        queryData(
            supabase.from('course_enrollments')
                .select('student_id,course_id,program_id,level_id,academic_year_id,students(matricule),courses(subjects(name))')
                .order('enrolled_at', { ascending: false }),
            'Impossible de charger les associations de cours.'
        )
    ]);

    const activeRecords = activeEnrollments || [];
    const courseRecords = courses || [];
    const assignmentSection = makeSection('Associer un cours à un étudiant', 'Le cours doit correspondre à la filière, au niveau et à l’année de l’inscription.');
    const assignmentFields = [
        {
            name: 'enrollment_id',
            label: 'Inscription active',
            type: 'select',
            required: true,
            options: activeRecords.map((record) => ({
                value: record.id,
                label: [
                    relation(record.students)?.matricule || record.student_id,
                    relation(record.programs)?.name,
                    relation(record.levels)?.name,
                    relation(record.academic_years)?.label
                ].filter(Boolean).join(' · ')
            }))
        },
        {
            name: 'course_id',
            label: 'Cours',
            type: 'select',
            required: true,
            options: courseRecords.map((course) => ({
                value: course.id,
                label: [
                    relation(course.subjects)?.name,
                    relation(course.programs)?.name,
                    relation(course.levels)?.name,
                    relation(course.academic_years)?.label
                ].filter(Boolean).join(' · ')
            }))
        }
    ];
    makeForm(assignmentSection, assignmentFields, 'Associer le cours', async (controls) => {
        const enrollment = activeRecords.find((record) => record.id === fieldValue(controls, 'enrollment_id'));
        const course = courseRecords.find((record) => record.id === fieldValue(controls, 'course_id'));
        if (!enrollment || !course) throw new Error('Choisissez une inscription et un cours valides.');
        if (
            enrollment.program_id !== course.program_id
            || enrollment.level_id !== course.level_id
            || enrollment.academic_year_id !== course.academic_year_id
        ) {
            throw new Error('Le cours et l’inscription doivent appartenir à la même filière, au même niveau et à la même année.');
        }

        const { error } = await supabase.from('course_enrollments').insert({
            enrollment_id: enrollment.id,
            student_id: enrollment.student_id,
            course_id: course.id,
            program_id: course.program_id,
            level_id: course.level_id,
            academic_year_id: course.academic_year_id
        });
        if (error) throw new Error(`Impossible d’associer le cours. ${error.message}`);
        await renderCurrentView();
        notify('Le cours a été associé à l’étudiant.', true);
    });

    const assignmentList = makeSection('Cours associés', '');
    const assignmentRows = (assignments || []).map((assignment) => {
        const student = relation(assignment.students);
        const course = relation(assignment.courses);
        const subject = relation(course?.subjects);
        const remove = node('button', 'student-button student-button-secondary', 'Retirer');
        remove.type = 'button';
        remove.addEventListener('click', () => runAction(async () => {
            if (!window.confirm('Retirer ce cours de l’inscription ?')) return;
            const { error } = await supabase.from('course_enrollments')
                .delete()
                .eq('student_id', assignment.student_id)
                .eq('course_id', assignment.course_id);
            if (error) {
                notify(`Impossible de retirer le cours. ${error.message}`);
                return;
            }
            await renderCurrentView();
            notify('Le cours a été retiré de l’inscription.', true);
        }, 'Impossible de retirer le cours.'));
        const actions = node('td');
        actions.append(remove);
        return [
            node('td', '', student?.matricule || assignment.student_id),
            node('td', '', subject?.name || 'Matière non renseignée'),
            actions
        ];
    });
    assignmentList.append(makeTable(['Étudiant', 'Cours', 'Actions'], assignmentRows, 'Aucun cours n’est associé aux inscriptions.'));
}

const catalogDefinitions = {
    academic_years: {
        title: 'Années académiques',
        table: 'academic_years',
        columns: ['label', 'starts_on', 'ends_on', 'is_current'],
        specs: [
            { name: 'label', label: 'Libellé', required: true, maxLength: 80 },
            { name: 'starts_on', label: 'Début', type: 'date', required: true },
            { name: 'ends_on', label: 'Fin', type: 'date', required: true },
            { name: 'is_current', label: 'Année en cours', type: 'checkbox' }
        ]
    },
    programs: {
        title: 'Filières',
        table: 'programs',
        columns: ['code', 'name', 'is_active'],
        specs: [
            { name: 'code', label: 'Code', required: true, maxLength: 32 },
            { name: 'name', label: 'Nom', required: true, maxLength: 120 },
            { name: 'description', label: 'Description', type: 'textarea', maxLength: 2000 },
            { name: 'is_active', label: 'Filière active', type: 'checkbox', checked: true }
        ]
    },
    levels: {
        title: 'Niveaux',
        table: 'levels',
        columns: ['code', 'name', 'position'],
        specs: [
            { name: 'code', label: 'Code', required: true, maxLength: 32 },
            { name: 'name', label: 'Nom', required: true, maxLength: 120 },
            { name: 'position', label: 'Ordre', type: 'number', required: true, min: 1, step: '1' }
        ]
    },
    subjects: {
        title: 'Matières',
        table: 'subjects',
        columns: ['code', 'name'],
        specs: [
            { name: 'code', label: 'Code', required: true, maxLength: 32 },
            { name: 'name', label: 'Nom', required: true, maxLength: 120 },
            { name: 'description', label: 'Description', type: 'textarea', maxLength: 2000 }
        ]
    },
    academic_periods: {
        title: 'Périodes académiques',
        table: 'academic_periods',
        columns: ['label', 'academic_year_id', 'starts_on', 'ends_on'],
        specs: (options) => [
            { name: 'academic_year_id', label: 'Année académique', type: 'select', required: true, options: selectOptions(options.years, (year) => year.label) },
            { name: 'label', label: 'Libellé de la période', required: true, maxLength: 80 },
            { name: 'starts_on', label: 'Début', type: 'date', required: true },
            { name: 'ends_on', label: 'Fin', type: 'date', required: true }
        ]
    },
    courses: {
        title: 'Cours',
        table: 'courses',
        columns: ['subject_id', 'program_id', 'level_id', 'academic_year_id'],
        specs: (options) => [
            { name: 'subject_id', label: 'Matière', type: 'select', required: true, options: selectOptions(options.subjects, (row) => row.name) },
            { name: 'program_id', label: 'Filière', type: 'select', required: true, options: selectOptions(options.programs, (row) => row.name) },
            { name: 'level_id', label: 'Niveau', type: 'select', required: true, options: selectOptions(options.levels, (row) => row.name) },
            { name: 'academic_year_id', label: 'Année', type: 'select', required: true, options: selectOptions(options.years, (row) => row.label) },
            { name: 'teacher_id', label: 'Enseignant (facultatif)', type: 'select', options: selectOptions(options.teachers, profileLabel) },
            { name: 'description', label: 'Description', type: 'textarea', maxLength: 2000 }
        ]
    },
    schedules: {
        title: 'Emplois du temps',
        table: 'schedules',
        columns: ['course_id', 'academic_period_id', 'weekday', 'starts_at', 'ends_at', 'room'],
        specs: (options) => [
            {
                name: 'course_id',
                label: 'Cours',
                type: 'select',
                required: true,
                options: options.courses.map((course) => ({
                    value: course.id,
                    label: [
                        relation(course.subjects)?.name,
                        relation(course.programs)?.name,
                        relation(course.levels)?.name,
                        relation(course.academic_years)?.label
                    ].filter(Boolean).join(' · ')
                }))
            },
            { name: 'academic_year_id', label: 'Année académique', type: 'select', required: true, options: selectOptions(options.years, (year) => year.label) },
            {
                name: 'academic_period_id',
                label: 'Période',
                type: 'select',
                required: true,
                options: options.periods.map((period) => ({
                    value: period.id,
                    label: `${period.label} · ${options.years.find((year) => year.id === period.academic_year_id)?.label || ''}`
                }))
            },
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
        ]
    }
};

async function loadCatalogOptions() {
    const [years, programs, levels, subjects, periods, courses, profiles] = await Promise.all([
        queryData(supabase.from('academic_years').select('id,label,is_current').order('starts_on', { ascending: false }), 'Impossible de charger les années académiques.'),
        queryData(supabase.from('programs').select('id,code,name,is_active').order('name'), 'Impossible de charger les filières.'),
        queryData(supabase.from('levels').select('id,code,name,position').order('position'), 'Impossible de charger les niveaux.'),
        queryData(supabase.from('subjects').select('id,code,name').order('name'), 'Impossible de charger les matières.'),
        queryData(supabase.from('academic_periods').select('id,label,academic_year_id').order('starts_on'), 'Impossible de charger les périodes.'),
        queryData(supabase.from('courses').select('id,academic_year_id,subjects(name),programs(name),levels(name),academic_years(label)').order('created_at', { ascending: false }), 'Impossible de charger les cours.'),
        queryData(supabase.from('profiles').select('id,first_name,last_name,user_roles(role)').order('last_name'), 'Impossible de charger les enseignants.')
    ]);
    const teachers = (profiles || []).filter((profile) => relation(profile.user_roles)?.role === 'teacher');
    return {
        years: years || [],
        programs: programs || [],
        levels: levels || [],
        subjects: subjects || [],
        periods: periods || [],
        courses: courses || [],
        teachers
    };
}

function catalogCell(row, field) {
    if (field === 'is_current' || field === 'is_active') return row[field] ? 'Oui' : 'Non';
    if (field === 'academic_year_id') {
        return catalogOptions.years.find((year) => year.id === row[field])?.label || '—';
    }
    if (field === 'program_id') return catalogOptions.programs.find((program) => program.id === row[field])?.name || '—';
    if (field === 'level_id') return catalogOptions.levels.find((level) => level.id === row[field])?.name || '—';
    if (field === 'subject_id') return catalogOptions.subjects.find((subject) => subject.id === row[field])?.name || '—';
    if (field === 'course_id') {
        const course = catalogOptions.courses.find((item) => item.id === row[field]);
        return relation(course?.subjects)?.name || '—';
    }
    if (field === 'academic_period_id') return catalogOptions.periods.find((period) => period.id === row[field])?.label || '—';
    return row[field] ?? '—';
}

async function renderCatalog() {
    makeIntro('Gérez les référentiels utilisés pour les inscriptions, les cours et les périodes académiques.');
    catalogOptions = await loadCatalogOptions();
    const selectorSection = makeSection('Choisir un référentiel', '');
    const entitySelect = document.createElement('select');
    entitySelect.className = 'module-select';
    entitySelect.setAttribute('aria-label', 'Référentiel académique');
    Object.entries(catalogDefinitions).forEach(([key, definition]) => {
        const option = node('option', '', definition.title);
        option.value = key;
        entitySelect.append(option);
    });
    const selectorWrap = node('div', 'admin-field');
    selectorWrap.append(node('label', '', 'Type de données'), entitySelect);
    selectorSection.append(selectorWrap);

    const editorSection = makeSection('', '');
    const listSection = makeSection('Données enregistrées', '');

    async function drawCatalog(entity) {
        const definition = catalogDefinitions[entity];
        catalogEditId = null;
        editorSection.replaceChildren(node('h2', '', definition.title), node('p', '', 'Les suppressions de données liées sont refusées par les contraintes de la base.'));
        listSection.replaceChildren(node('h2', '', `Liste : ${definition.title}`));
        const specs = typeof definition.specs === 'function' ? definition.specs(catalogOptions) : definition.specs;
        const form = node('form', 'admin-form');
        const grid = node('div', 'admin-form-grid');
        form.append(grid);
        const controls = new Map();
        specs.forEach((spec) => controls.set(spec.name, makeField(grid, spec)));
        const actions = node('div', 'admin-actions');
        const submit = node('button', 'student-button student-button-primary', 'Ajouter');
        submit.type = 'submit';
        const cancel = node('button', 'student-button student-button-secondary', 'Annuler la modification');
        cancel.type = 'button';
        cancel.hidden = true;
        actions.append(submit, cancel);
        form.append(actions);
        editorSection.append(form);

        cancel.addEventListener('click', () => {
            catalogEditId = null;
            form.reset();
            submit.textContent = 'Ajouter';
            cancel.hidden = true;
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            submit.disabled = true;
            clearAlert();
            try {
                const payload = Object.fromEntries(specs.map((spec) => [spec.name, fieldValue(controls, spec.name)]));
                if (entity === 'courses' || entity === 'schedules') payload.created_by = currentUser.id;
                if (entity === 'schedules') {
                    payload.weekday = Number(payload.weekday);
                    const course = catalogOptions.courses.find((item) => item.id === payload.course_id);
                    const period = catalogOptions.periods.find((item) => item.id === payload.academic_period_id);
                    if (!course || course.academic_year_id !== payload.academic_year_id) {
                        throw new Error('Le cours doit appartenir à l’année académique choisie.');
                    }
                    if (!period || period.academic_year_id !== payload.academic_year_id) {
                        throw new Error('La période doit appartenir à l’année académique choisie.');
                    }
                }
                let result = supabase.from(definition.table);
                result = catalogEditId
                    ? await result.update(payload).eq('id', catalogEditId)
                    : await result.insert(payload);
                if (result.error) throw new Error(`Impossible d’enregistrer ${definition.title.toLocaleLowerCase('fr')}. ${result.error.message}`);
                await renderCurrentView();
                notify(`${definition.title} : enregistrement réussi.`, true);
            } catch (error) {
                notify(error instanceof Error ? error.message : 'L’enregistrement a échoué.');
            } finally {
                submit.disabled = false;
            }
        });

        const orderField = {
            academic_years: 'starts_on',
            programs: 'name',
            levels: 'position',
            subjects: 'name',
            academic_periods: 'starts_on',
            courses: 'created_at',
            schedules: 'weekday'
        }[entity];
        const query = supabase.from(definition.table).select('*').order(orderField, { ascending: true, nullsFirst: false });
        const records = await queryData(query, `Impossible de charger ${definition.title.toLocaleLowerCase('fr')}.`) || [];
        const rows = records.map((record) => {
            const cells = definition.columns.map((field) => node('td', '', catalogCell(record, field)));
            const edit = node('button', 'student-button student-button-secondary', 'Modifier');
            edit.type = 'button';
            edit.addEventListener('click', () => {
                catalogEditId = record.id;
                specs.forEach((spec) => {
                    const control = controls.get(spec.name);
                    if (spec.type === 'checkbox') control.checked = Boolean(record[spec.name]);
                    else control.value = record[spec.name] === null || record[spec.name] === undefined ? '' : String(record[spec.name]);
                });
                submit.textContent = 'Enregistrer les modifications';
                cancel.hidden = false;
                editorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                controls.get(specs[0].name).focus();
            });
            const deleteButton = node('button', 'student-button student-button-secondary', 'Supprimer');
            deleteButton.type = 'button';
            deleteButton.addEventListener('click', () => runAction(async () => {
                if (!window.confirm(`Supprimer cet élément de « ${definition.title} » ?`)) return;
                const { error } = await supabase.from(definition.table).delete().eq('id', record.id);
                if (error) {
                    notify(`Suppression refusée. Vérifiez les données qui utilisent encore cet élément. ${error.message}`);
                    return;
                }
                await renderCurrentView();
                notify('L’élément a été supprimé.', true);
            }, 'Impossible de supprimer cet élément.'));
            const actions = node('td');
            actions.append(edit, deleteButton);
            return [...cells, actions];
        });
        listSection.append(makeTable([...definition.columns.map((field) => field.replaceAll('_', ' ')), 'Actions'], rows, `Aucun élément dans « ${definition.title} ».`));
    }

    entitySelect.value = catalogEntity;
    entitySelect.addEventListener('change', () => {
        catalogEntity = entitySelect.value;
        drawCatalog(catalogEntity).catch((error) => notify(error.message || 'Impossible de charger le référentiel.'));
    });
    await drawCatalog(catalogEntity);
}

async function renderAnnouncements() {
    makeIntro('Publiez des informations destinées à l’ensemble des étudiants ou à une filière et un niveau.');
    const [programs, levels] = await Promise.all([
        queryData(supabase.from('programs').select('id,name').order('name'), 'Impossible de charger les filières.'),
        queryData(supabase.from('levels').select('id,name').order('position'), 'Impossible de charger les niveaux.')
    ]);
    const fields = [
        { name: 'title', label: 'Titre', required: true, maxLength: 180 },
        { name: 'category', label: 'Catégorie', required: true, maxLength: 80 },
        { name: 'priority', label: 'Priorité', type: 'select', required: true, options: [
            { value: 'normal', label: 'Normale' },
            { value: 'important', label: 'Importante' },
            { value: 'urgent', label: 'Urgente' }
        ] },
        { name: 'program_id', label: 'Filière (facultatif)', type: 'select', options: selectOptions(programs || [], (item) => item.name) },
        { name: 'level_id', label: 'Niveau (facultatif)', type: 'select', options: selectOptions(levels || [], (item) => item.name) },
        { name: 'visible_until', label: 'Visible jusqu’au (facultatif)', type: 'date' },
        { name: 'body', label: 'Message', type: 'textarea', required: true, maxLength: 10000 },
        { name: 'is_published', label: 'Publier immédiatement', type: 'checkbox' }
    ];
    const section = makeSection('Créer une annonce', 'Les annonces publiées sont visibles selon leur audience et leur période de validité.');
    const { form, controls } = makeForm(section, fields, 'Enregistrer l’annonce', async (values, currentForm) => {
        const isPublished = fieldValue(values, 'is_published');
        const visibleUntil = fieldValue(values, 'visible_until');
        const payload = {
            title: fieldValue(values, 'title'),
            category: fieldValue(values, 'category'),
            priority: fieldValue(values, 'priority') || 'normal',
            program_id: fieldValue(values, 'program_id'),
            level_id: fieldValue(values, 'level_id'),
            body: fieldValue(values, 'body'),
            visible_until: visibleUntil ? new Date(`${visibleUntil}T23:59:59`).toISOString() : null,
            is_published: isPublished,
            published_at: isPublished ? new Date().toISOString() : null,
            published_by: currentUser.id
        };
        const { error } = await supabase.from('announcements').insert(payload);
        if (error) throw new Error(`Impossible d’enregistrer l’annonce. ${error.message}`);
        currentForm.reset();
        controls.get('priority').value = 'normal';
        await renderCurrentView();
        notify('L’annonce a été enregistrée.', true);
    });
    controls.get('priority').value = 'normal';
    await renderPublicationList('announcements', [
        ['title', 'Titre'],
        ['category', 'Catégorie'],
        ['priority', 'Priorité'],
        ['published_at', 'Publication']
    ], 'Aucune annonce n’est enregistrée.');
}

async function renderInternships() {
    makeIntro('Publiez des offres de stage accessibles selon la filière et la date limite.');
    const programs = await queryData(
        supabase.from('programs').select('id,name').order('name'),
        'Impossible de charger les filières.'
    );
    const fields = [
        { name: 'title', label: 'Intitulé', required: true, maxLength: 180 },
        { name: 'company', label: 'Entreprise', required: true, maxLength: 180 },
        { name: 'deadline', label: 'Date limite', type: 'date' },
        { name: 'program_id', label: 'Filière (facultatif)', type: 'select', options: selectOptions(programs || [], (item) => item.name) },
        { name: 'application_url', label: 'Lien de candidature (http/https)', type: 'url', maxLength: 2048 },
        { name: 'sought_skills', label: 'Compétences recherchées', type: 'textarea', maxLength: 3000 },
        { name: 'requirements', label: 'Conditions', type: 'textarea', maxLength: 3000 },
        { name: 'application_instructions', label: 'Instructions de candidature', type: 'textarea', maxLength: 3000 },
        { name: 'description', label: 'Description', type: 'textarea', required: true, maxLength: 10000 },
        { name: 'is_published', label: 'Publier immédiatement', type: 'checkbox' }
    ];
    const section = makeSection('Créer une offre', '');
    const { form } = makeForm(section, fields, 'Enregistrer l’offre', async (values, currentForm) => {
        const isPublished = fieldValue(values, 'is_published');
        const applicationUrl = fieldValue(values, 'application_url');
        if (applicationUrl) {
            let url;
            try {
                url = new URL(applicationUrl);
            } catch {
                throw new Error('Saisissez une URL de candidature valide.');
            }
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Le lien de candidature doit utiliser HTTP ou HTTPS.');
        }
        const payload = {
            title: fieldValue(values, 'title'),
            company: fieldValue(values, 'company'),
            description: fieldValue(values, 'description'),
            deadline: fieldValue(values, 'deadline'),
            program_id: fieldValue(values, 'program_id'),
            application_url: applicationUrl,
            sought_skills: fieldValue(values, 'sought_skills'),
            requirements: fieldValue(values, 'requirements'),
            application_instructions: fieldValue(values, 'application_instructions'),
            is_published: isPublished,
            published_at: isPublished ? new Date().toISOString() : null,
            created_by: currentUser.id
        };
        const { error } = await supabase.from('internships').insert(payload);
        if (error) throw new Error(`Impossible d’enregistrer l’offre. ${error.message}`);
        currentForm.reset();
        await renderCurrentView();
        notify('L’offre a été enregistrée.', true);
    });
    await renderPublicationList('internships', [
        ['title', 'Offre'],
        ['company', 'Entreprise'],
        ['deadline', 'Date limite'],
        ['published_at', 'Publication']
    ], 'Aucune offre n’est enregistrée.');
}

function displayDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

async function renderPublicationList(tableName, columns, emptyMessage) {
    const records = await queryData(
        supabase.from(tableName).select(`id,is_published,${columns.map(([field]) => field).join(',')}`)
            .order('created_at', { ascending: false }),
        `Impossible de charger les ${tableName === 'announcements' ? 'annonces' : 'offres'}.`
    ) || [];
    const section = makeSection('Contenus enregistrés', '');
    const rows = records.map((record) => {
        const cells = columns.map(([field]) => {
            const value = field === 'published_at' ? displayDate(record[field]) : record[field] || '—';
            return node('td', '', value);
        });
        const publishButton = node(
            'button',
            'student-button student-button-secondary',
            record.is_published ? 'Dépublier' : 'Publier'
        );
        publishButton.type = 'button';
        publishButton.addEventListener('click', () => runAction(async () => {
            const publish = !record.is_published;
            const { error } = await supabase.from(tableName)
                .update({ is_published: publish, published_at: publish ? new Date().toISOString() : null })
                .eq('id', record.id);
            if (error) {
                notify(`Impossible de modifier la publication. ${error.message}`);
                return;
            }
            await renderCurrentView();
            notify(publish ? 'Le contenu est publié.' : 'Le contenu a été dépublié.', true);
        }, 'Impossible de modifier la publication.'));
        const deleteButton = node('button', 'student-button student-button-secondary', 'Supprimer');
        deleteButton.type = 'button';
        deleteButton.addEventListener('click', () => runAction(async () => {
            if (!window.confirm('Supprimer définitivement ce contenu ?')) return;
            const { error } = await supabase.from(tableName).delete().eq('id', record.id);
            if (error) {
                notify(`Impossible de supprimer ce contenu. ${error.message}`);
                return;
            }
            await renderCurrentView();
            notify('Le contenu a été supprimé.', true);
        }, 'Impossible de supprimer ce contenu.'));
        const actions = node('td');
        actions.append(publishButton, deleteButton);
        return [...cells, node('td', '', record.is_published ? 'Publié' : 'Brouillon'), actions];
    });
    section.append(makeTable([
        ...columns.map(([, label]) => label),
        'État',
        'Actions'
    ], rows, emptyMessage));
}

async function renderDocuments() {
    makeIntro('Importez des documents dans le bucket privé et choisissez les cours ou matières concernés.');
    const [courses, subjects] = await Promise.all([
        queryData(
            supabase.from('courses').select('id,subject_id,subjects(name),programs(name),levels(name),academic_years(label)').order('created_at', { ascending: false }),
            'Impossible de charger les cours.'
        ),
        queryData(supabase.from('subjects').select('id,name').order('name'), 'Impossible de charger les matières.')
    ]);
    const fields = [
        { name: 'title', label: 'Titre', required: true, maxLength: 180 },
        { name: 'document_type', label: 'Type', type: 'select', required: true, options: [
            { value: 'course', label: 'Cours' },
            { value: 'exercise', label: 'Exercices' },
            { value: 'tutorial', label: 'Travaux dirigés' },
            { value: 'lab', label: 'Travaux pratiques' },
            { value: 'supplement', label: 'Compléments' }
        ] },
        { name: 'course_id', label: 'Cours (facultatif)', type: 'select', options: selectOptions(courses || [], (course) => {
            const subject = relation(course.subjects)?.name || 'Cours';
            const program = relation(course.programs)?.name || '';
            const level = relation(course.levels)?.name || '';
            const year = relation(course.academic_years)?.label || '';
            return [subject, program, level, year].filter(Boolean).join(' · ');
        }) },
        { name: 'subject_id', label: 'Matière (facultatif)', type: 'select', options: selectOptions(subjects || [], (subject) => subject.name) },
        { name: 'description', label: 'Description', type: 'textarea', maxLength: 5000 },
        { name: 'file', label: 'Fichier', type: 'file', required: true },
        { name: 'is_published', label: 'Publier immédiatement', type: 'checkbox' }
    ];
    const section = makeSection('Ajouter un document', 'Les fichiers restent privés ; un lien de téléchargement temporaire est créé pour chaque accès.');
    const { form, controls } = makeForm(section, fields, 'Importer le document', async (values, currentForm) => {
        const file = controls.get('file').files[0];
        if (!file) throw new Error('Choisissez un fichier à importer.');
        const courseId = fieldValue(values, 'course_id');
        const subjectId = fieldValue(values, 'subject_id');
        const course = (courses || []).find((item) => item.id === courseId);
        if (courseId && subjectId && course?.subject_id !== subjectId) {
            throw new Error('La matière sélectionnée ne correspond pas au cours.');
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '') || 'document';
        const path = `${courseId || 'general'}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
            .from('student-documents')
            .upload(path, file, { upsert: false });
        if (uploadError) throw new Error(`Impossible d’importer le fichier. ${uploadError.message}`);

        const published = fieldValue(values, 'is_published');
        const { error: insertError } = await supabase.from('documents').insert({
            title: fieldValue(values, 'title'),
            description: fieldValue(values, 'description'),
            document_type: fieldValue(values, 'document_type'),
            course_id: courseId,
            subject_id: subjectId,
            storage_bucket: 'student-documents',
            storage_path: path,
            is_published: published,
            published_at: published ? new Date().toISOString() : null,
            uploaded_by: currentUser.id
        });
        if (insertError) {
            const { error: cleanupError } = await supabase.storage.from('student-documents').remove([path]);
            throw new Error(cleanupError
                ? `Le document n’a pas été enregistré et le fichier temporaire n’a pas pu être supprimé. ${insertError.message} ${cleanupError.message}`
                : `Le document n’a pas été enregistré ; le fichier temporaire a été supprimé. ${insertError.message}`);
        }
        currentForm.reset();
        await renderCurrentView();
        notify('Le document a été importé.', true);
    });
    controls.get('file').type = 'file';
    controls.get('file').accept = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png';

    await renderDocumentList();
}

async function renderDocumentList() {
    const records = await queryData(
        supabase.from('documents')
            .select('id,title,document_type,storage_bucket,storage_path,is_published,published_at,subjects(name),courses(subjects(name))')
            .order('created_at', { ascending: false }),
        'Impossible de charger les documents.'
    ) || [];
    const section = makeSection('Documents enregistrés', '');
    const rows = records.map((record) => {
        const course = relation(record.courses);
        const subject = relation(record.subjects) || relation(course?.subjects);
        const download = node('button', 'student-button student-button-secondary', 'Télécharger');
        download.type = 'button';
        download.addEventListener('click', async () => {
            download.disabled = true;
            try {
                const { data, error } = await supabase.storage
                    .from(record.storage_bucket)
                    .createSignedUrl(record.storage_path, 60);
                if (error) throw error;
                if (!data?.signedUrl) throw new Error('Lien temporaire indisponible.');
                window.location.assign(data.signedUrl);
            } catch (error) {
                notify(`Téléchargement impossible. ${error.message || 'Vérifiez les droits Storage.'}`);
            } finally {
                download.disabled = false;
            }
        });

        const publish = node('button', 'student-button student-button-secondary', record.is_published ? 'Dépublier' : 'Publier');
        publish.type = 'button';
        publish.addEventListener('click', () => runAction(async () => {
            const isPublished = !record.is_published;
            const { error } = await supabase.from('documents')
                .update({ is_published: isPublished, published_at: isPublished ? new Date().toISOString() : null })
                .eq('id', record.id);
            if (error) {
                notify(`Impossible de modifier la publication. ${error.message}`);
                return;
            }
            await renderCurrentView();
            notify(isPublished ? 'Le document est publié.' : 'Le document a été dépublié.', true);
        }, 'Impossible de modifier la publication du document.'));

        const remove = node('button', 'student-button student-button-secondary', 'Supprimer');
        remove.type = 'button';
        remove.addEventListener('click', () => runAction(async () => {
            if (!window.confirm('Supprimer ce document et son fichier privé ?')) return;
            const { error: fileError } = await supabase.storage.from(record.storage_bucket).remove([record.storage_path]);
            if (fileError) {
                notify(`Impossible de supprimer le fichier privé ; le document est conservé. ${fileError.message}`);
                return;
            }
            const { error: rowError } = await supabase.from('documents').delete().eq('id', record.id);
            if (rowError) {
                notify(`Le fichier privé a été supprimé, mais la fiche du document n’a pas pu être retirée. ${rowError.message}`);
                return;
            }
            await renderCurrentView();
            notify('Le document et son fichier ont été supprimés.', true);
        }, 'Impossible de supprimer le document.'));

        const actionCell = node('td');
        actionCell.append(download, publish, remove);
        return [
            node('td', '', record.title),
            node('td', '', record.document_type),
            node('td', '', subject?.name || 'Ressource générale'),
            node('td', '', record.is_published ? 'Publié' : 'Brouillon'),
            actionCell
        ];
    });
    section.append(makeTable(['Titre', 'Type', 'Matière', 'État', 'Actions'], rows, 'Aucun document n’est enregistré.'));
}

async function renderCurrentView() {
    viewRoot.replaceChildren();
    clearAlert();
    title.textContent = views[currentView] || views.overview;
    document.title = `${title.textContent} | IPTO`;
    setActiveNavigation();

    const renderers = {
        overview: renderOverview,
        students: renderStudents,
        enrollments: renderEnrollments,
        catalog: renderCatalog,
        announcements: renderAnnouncements,
        internships: renderInternships,
        documents: renderDocuments
    };
    await renderers[currentView]();
}

if (!views[currentView]) {
    window.location.replace('admin.html');
} else {
    try {
        supabase = createSupabaseClient();
    } catch {
        window.location.replace('login.html?reason=configuration');
    }

    if (supabase) {
        const access = await getAdminUser(supabase);
        if (!access.user) {
            window.location.replace(`login.html?reason=${access.reason}`);
        } else {
            currentUser = access.user;
            email.textContent = currentUser.email || 'Compte administrateur';
            loading.hidden = true;
            shell.hidden = false;
            supabase.auth.onAuthStateChange((event) => {
                if (event === 'SIGNED_OUT') window.location.replace('login.html?reason=session');
            });
            await runAction(renderCurrentView, 'Impossible de charger cette section.');
        }
    }
}
