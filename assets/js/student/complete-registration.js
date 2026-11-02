import { createSupabaseClient } from './supabase-client.js';

const feedback = document.querySelector('#activation-feedback');

function showFeedback(message, success = false) {
    feedback.textContent = message;
    feedback.classList.toggle('success', success);
}

try {
    const supabase = createSupabaseClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) {
        showFeedback('Le lien de confirmation est expiré ou invalide. Retournez à la connexion ou recommencez votre inscription.');
    } else {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        const user = userData.user;
        if (!user?.email_confirmed_at) {
            showFeedback('Confirmez votre adresse e-mail depuis le message reçu, puis ouvrez à nouveau son lien.');
        } else {
            const { error } = await supabase.rpc('complete_student_registration');
            if (error) {
                if (error.code === '23505') {
                    showFeedback('Ce matricule est déjà associé à un compte étudiant. Vérifiez-le ou contactez l’administration.');
                } else if (error.code === '23514') {
                    showFeedback('Ce compte est déjà associé à un autre profil. Contactez l’administration pour vérifier votre accès.');
                } else {
                    throw error;
                }
            } else {
                showFeedback('Adresse confirmée. Votre espace étudiant va s’ouvrir.', true);
                window.setTimeout(() => window.location.replace('dashboard.html'), 800);
            }
        }
    }
} catch (error) {
    showFeedback(error instanceof Error && error.message.startsWith('Supabase n’est pas encore configuré')
        ? error.message
        : 'La vérification a échoué. Vérifiez la configuration Supabase ou contactez l’administration.');
}
