import { createSupabaseClient } from './supabase-client.js';

const form = document.querySelector('#register-form');
const firstNameInput = document.querySelector('#first-name');
const lastNameInput = document.querySelector('#last-name');
const emailInput = document.querySelector('#email');
const matriculeInput = document.querySelector('#matricule');
const phoneInput = document.querySelector('#phone');
const passwordInput = document.querySelector('#password');
const passwordConfirmInput = document.querySelector('#password-confirm');
const submitButton = document.querySelector('#register-submit');
const feedback = document.querySelector('#register-feedback');

function showFeedback(message, success = false) {
    feedback.textContent = message;
    feedback.hidden = false;
    feedback.classList.toggle('success', success);
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.hidden = true;

    if (passwordInput.value.length < 8) {
        showFeedback('Choisissez un mot de passe d’au moins 8 caractères.');
        return;
    }
    if (passwordInput.value !== passwordConfirmInput.value) {
        showFeedback('Les deux mots de passe ne correspondent pas.');
        return;
    }
    if (!firstNameInput.value.trim() || !lastNameInput.value.trim() || !matriculeInput.value.trim()) {
        showFeedback('Renseignez votre prénom, votre nom et votre matricule.');
        return;
    }
    const phone = phoneInput.value.trim();
    if (phone && (phone.length < 6 || phone.length > 32)) {
        showFeedback('Le numéro de téléphone doit contenir entre 6 et 32 caractères.');
        return;
    }

    submitButton.disabled = true;
    submitButton.querySelector('.button-label').textContent = 'Création du compte…';
    try {
        const supabase = createSupabaseClient();
        const redirectTo = new URL('complete-registration.html', window.location.href).toString();
        const { data, error } = await supabase.auth.signUp({
            email: emailInput.value.trim(),
            password: passwordInput.value,
            options: {
                emailRedirectTo: redirectTo,
                data: {
                    ipto_student_registration: true,
                    first_name: firstNameInput.value.trim(),
                    last_name: lastNameInput.value.trim(),
                    matricule: matriculeInput.value.trim(),
                    phone
                }
            }
        });
        if (error) throw error;

        passwordInput.value = '';
        passwordConfirmInput.value = '';
        form.hidden = true;
        if (data.session) {
            showFeedback('Compte créé. Vérification de votre inscription…', true);
            window.location.replace('complete-registration.html');
            return;
        }
        showFeedback('Un e-mail de confirmation a été envoyé. Cliquez sur son lien pour activer votre espace étudiant.', true);
    } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.startsWith('Supabase n’est pas encore configuré')) {
            showFeedback(message);
        } else if (error?.status === 429 || message.toLowerCase().includes('rate limit')) {
            showFeedback('Trop de tentatives ou d’e-mails envoyés. Réessayez plus tard ou contactez l’administration.');
        } else {
            showFeedback('La demande n’a pas pu être traitée. Vérifiez votre adresse, votre connexion et réessayez.');
        }
    } finally {
        if (!form.hidden) {
            submitButton.disabled = false;
            submitButton.querySelector('.button-label').textContent = 'Créer mon compte';
        }
    }
});
