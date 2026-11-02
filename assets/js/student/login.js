import { createSupabaseClient } from './supabase-client.js';

const form = document.querySelector('#login-form');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const submitButton = document.querySelector('#login-submit');
const feedback = document.querySelector('#login-feedback');
const togglePassword = document.querySelector('#toggle-password');

function showFeedback(message) {
    feedback.textContent = message;
    feedback.hidden = false;
}

function getErrorMessage(error) {
    if (error?.code === 'email_not_confirmed'
        || error?.message?.toLowerCase().includes('email not confirmed')
        || error?.message?.toLowerCase().includes('email_not_confirmed')) {
        return 'Votre adresse e-mail n’est pas encore confirmée. Ouvrez le lien reçu par e-mail avant de vous connecter.';
    }

    if (error?.message?.toLowerCase().includes('invalid login credentials')) {
        return 'Adresse e-mail ou mot de passe incorrect.';
    }

    if (error instanceof TypeError || error?.message?.toLowerCase().includes('fetch')) {
        return 'Le service de connexion est injoignable. Vérifiez votre connexion et la configuration Supabase.';
    }

    return 'La connexion a échoué. Vérifiez vos informations puis réessayez.';
}

function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    submitButton.querySelector('.button-label').textContent = isLoading ? 'Connexion…' : 'Se connecter';
}

async function routeAuthenticatedUser(supabase, userId) {
    const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        showFeedback('Connexion établie, mais les autorisations ne sont pas disponibles. Vérifiez les migrations Supabase.');
        setLoading(false);
        return;
    }

    if (data?.role === 'student') {
        window.location.replace('dashboard.html');
        return;
    }

    if (data?.role === 'admin') {
        window.location.replace('admin.html');
        return;
    }

    if (data?.role === 'teacher') {
        window.location.replace('teacher.html');
        return;
    }

    const message = 'Aucun rôle étudiant n’est associé à ce compte. Contactez l’administration.';
    showFeedback(message);
    setLoading(false);
}

const reason = new URLSearchParams(window.location.search).get('reason');
if (reason === 'session') {
    showFeedback('Votre session n’a pas pu être vérifiée. Veuillez vous reconnecter.');
} else if (reason === 'configuration') {
    showFeedback('L’espace étudiant attend la configuration du projet Supabase.');
} else if (reason === 'authorization') {
    showFeedback('Les autorisations n’ont pas pu être vérifiées. Vérifiez les migrations Supabase.');
}

togglePassword.addEventListener('click', () => {
    const showPassword = passwordInput.type === 'password';
    passwordInput.type = showPassword ? 'text' : 'password';
    togglePassword.setAttribute('aria-pressed', String(showPassword));
    togglePassword.setAttribute('aria-label', showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    togglePassword.querySelector('i').className = showPassword ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
});

try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) await routeAuthenticatedUser(supabase, data.session.user.id);
} catch (error) {
    showFeedback(error.message.startsWith('Supabase n’est pas encore configuré')
        ? error.message
        : 'Le service de connexion n’a pas pu être initialisé. Vérifiez la configuration Supabase et réessayez.');
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.hidden = true;
    setLoading(true);

    try {
        const supabase = createSupabaseClient();
        const { data, error } = await supabase.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passwordInput.value
        });

        if (error) throw error;
        if (!data.session) throw new Error('Supabase n’a pas retourné de session.');
        await routeAuthenticatedUser(supabase, data.session.user.id);
    } catch (error) {
        showFeedback(error.message.startsWith('Supabase n’est pas encore configuré')
            ? error.message
            : getErrorMessage(error));
        setLoading(false);
    }
});
