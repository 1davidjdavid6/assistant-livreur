/* ============================================================
   Configuration du client Supabase
   La clé "anon" ci-dessous est publique par conception : elle est
   protégée par les politiques RLS définies côté base de données,
   pas par le secret. Ne jamais mettre la clé "service_role" ici.
   ============================================================ */
const SUPABASE_URL = 'https://lhwcgcfdzpkdcnzchrwn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxod2NnY2ZkenBrZGNuemNocnduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNzI1NDksImV4cCI6MjEwNDk0ODU0OX0.5Q_qBRG74wuR9H0p4T008DzBaCrSgYqQaiNOBLYCVLc';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Vérifie qu'une session existe. Si non, redirige vers login.html.
 * À appeler en haut de chaque page protégée.
 * Retourne la session (ou redirige et ne retourne rien).
 */
async function requireSession(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session){
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

/**
 * Récupère le profil (rôle, nom) de l'utilisateur connecté.
 */
async function getMyProfile(userId){
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, role, nom')
    .eq('id', userId)
    .single();
  if(error){ console.error('Erreur profil :', error); return null; }
  return data;
}

async function logout(){
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}
