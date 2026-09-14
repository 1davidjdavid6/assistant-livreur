/* ============================================================
   Logique de connexion / inscription (login.html)
   ============================================================ */

(function(){
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const nomField = document.getElementById('nom-field');
  const form = document.getElementById('auth-form');
  const submitBtn = document.getElementById('auth-submit');
  const errorBox = document.getElementById('auth-error');
  const successBox = document.getElementById('auth-success');

  let mode = 'login'; // 'login' | 'signup'

  function setMode(newMode){
    mode = newMode;
    tabLogin.classList.toggle('active', mode === 'login');
    tabSignup.classList.toggle('active', mode === 'signup');
    nomField.hidden = mode !== 'signup';
    submitBtn.textContent = mode === 'login' ? 'Se connecter' : 'Créer mon compte';
    hideMessages();
  }

  function hideMessages(){
    errorBox.classList.remove('show');
    successBox.classList.remove('show');
  }
  function showError(msg){
    errorBox.textContent = msg;
    errorBox.classList.add('show');
    successBox.classList.remove('show');
  }
  function showSuccess(msg){
    successBox.textContent = msg;
    successBox.classList.add('show');
    errorBox.classList.remove('show');
  }

  tabLogin.addEventListener('click', () => setMode('login'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  // Si déjà connecté, direction l'outil
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if(session) window.location.href = 'index.html';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();
    submitBtn.disabled = true;

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const nom = document.getElementById('nom').value.trim();

    try{
      if(mode === 'login'){
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if(error) throw error;
        window.location.href = 'index.html';
      } else {
        const { data, error } = await supabaseClient.auth.signUp({
          email, password,
          options: { data: { nom } }
        });
        if(error) throw error;
        if(data.session){
          window.location.href = 'index.html';
        } else {
          showSuccess('Compte créé — vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.');
          setMode('login');
        }
      }
    } catch(err){
      showError(err.message || 'Une erreur est survenue.');
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
