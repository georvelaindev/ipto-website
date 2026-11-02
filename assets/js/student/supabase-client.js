import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { supabaseAnonKey, supabaseUrl } from './supabase-config.js';

export function createSupabaseClient() {
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase n’est pas encore configuré. Renseignez l’URL du projet et sa clé publique dans assets/js/student/supabase-config.js.');
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    });
}

export async function getUserWithRole(supabase, expectedRole) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) return { user: null, reason: 'session' };
    if (!userData.user) return { user: null, reason: 'session' };

    const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .maybeSingle();

    if (roleError) return { user: null, reason: 'authorization' };
    if (roleData?.role !== expectedRole) return { user: null, reason: 'role' };
    return { user: userData.user, reason: null };
}

export function getStudentUser(supabase) {
    return getUserWithRole(supabase, 'student');
}

export function getAdminUser(supabase) {
    return getUserWithRole(supabase, 'admin');
}

export function getTeacherUser(supabase) {
    return getUserWithRole(supabase, 'teacher');
}
