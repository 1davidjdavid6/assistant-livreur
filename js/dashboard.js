let allCourses = [];
let allProfiles = [];
let profilesMap = {};

async function initDashboard(){
  const session = await requireSession();
  if(!session) return;
  window.__dashboardUserId = session.user.id;

  const profile = await getMyProfile(session.user.id);
  if(!profile || profile.role !== 'admin'){
    document.getElementById('dashboard-content').hidden = true;
    document.getElementById('access-denied').hidden = false;
    return;
  }

  document.getElementById('admin-greeting').textContent = profile.nom
    ? `Connecté en tant que ${profile.nom} (admin)`
    : 'Connecté en tant qu\'admin';
  document.getElementById('logout-btn').addEventListener('click', logout);

  await loadProfilesMap();
  await loadCourses();
  subscribeRealtime();
  if(window.initEventsAdmin) window.initEventsAdmin();
  if(window.initCsvImport) window.initCsvImport();

  document.getElementById('search-input').addEventListener('input', renderTable);
  document.getElementById('filter-statut').addEventListener('change', renderTable);
  document.getElementById('sort-select').addEventListener('change', renderTable);
}

async function loadProfilesMap(){
  const { data, error } = await supabaseClient.from('profiles').select('id, nom, role, uber_identifiant');
  if(error){ console.error('Erreur profils :', error); return; }
  profilesMap = {};
  allProfiles = data || [];
  allProfiles.forEach(p => { profilesMap[p.id] = p.nom || 'Livreur'; });
  renderUsersSection();
}

function renderUsersSection(){
  const container = document.getElementById('users-list');
  document.getElementById('users-count').textContent = `${allProfiles.length} utilisateur${allProfiles.length > 1 ? 's' : ''}`;
  container.innerHTML = '';

  allProfiles.forEach(p => {
    const row = document.createElement('div');
    row.className = 'event-list-item';
    row.innerHTML = `
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <strong>${escapeHtml(p.nom || 'Sans nom')}</strong>
          <span class="badge-pill ${p.role === 'admin' ? 'st-en_cours' : 'st-en_attente'}">${p.role === 'admin' ? 'Admin' : 'Livreur'}</span>
        </div>
        <input type="text" data-user-id="${p.id}" class="uber-id-input" placeholder="Identifiant Uber (email ou nom)" value="${escapeHtml(p.uber_identifiant || '')}" style="width:100%;">
      </div>
      <div class="event-actions">
        <button type="button" data-action="save-uber-id" data-user-id="${p.id}">Enregistrer</button>
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-action="save-uber-id"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.userId;
      const input = container.querySelector(`.uber-id-input[data-user-id="${userId}"]`);
      btn.disabled = true;
      btn.textContent = '…';
      const { error } = await supabaseClient
        .from('profiles')
        .update({ uber_identifiant: input.value.trim() || null })
        .eq('id', userId);
      btn.disabled = false;
      btn.textContent = 'Enregistrer';
      if(error){
        if(error.code === '23505'){
          alert('Cet identifiant Uber est déjà utilisé par un autre livreur. Chaque identifiant doit être unique.');
        } else {
          alert('Erreur : ' + error.message);
        }
        return;
      }
      const p = allProfiles.find(x => x.id === userId);
      if(p) p.uber_identifiant = input.value.trim() || null;
    });
  });
}

async function loadCourses(){
  const { data, error } = await supabaseClient
    .from('courses')
    .select('*')
    .order('created_at', { ascending: false });
  if(error){ console.error('Erreur courses :', error); return; }
  allCourses = data || [];
  renderTable();
}

function subscribeRealtime(){
  supabaseClient
    .channel('courses-dashboard')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courses' }, (payload) => {
      if(payload.eventType === 'INSERT'){
        allCourses.unshift(payload.new);
      } else if(payload.eventType === 'UPDATE'){
        const idx = allCourses.findIndex(c => c.id === payload.new.id);
        if(idx !== -1) allCourses[idx] = payload.new; else allCourses.unshift(payload.new);
      } else if(payload.eventType === 'DELETE'){
        allCourses = allCourses.filter(c => c.id !== payload.old.id);
      }
      renderTable();
    })
    .subscribe();
}

function statutLabel(s){
  return { en_attente:'En attente', en_cours:'En cours', validee:'Validée', annulee:'Annulée' }[s] || s;
}
function formatDateTime(iso){
  return new Date(iso).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function renderTable(){
  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const statutFilter = document.getElementById('filter-statut').value;
  const sortValue = document.getElementById('sort-select').value;

  let rows = allCourses.filter(c => {
    if(statutFilter !== 'tous' && c.statut !== statutFilter) return false;
    if(search){
      const nom = (profilesMap[c.created_by] || '').toLowerCase();
      if(!nom.includes(search)) return false;
    }
    return true;
  });

  rows = [...rows].sort((a,b)=>{
    switch(sortValue){
      case 'date_asc': return new Date(a.created_at) - new Date(b.created_at);
      case 'euro_km_desc': return (b.euro_km||0) - (a.euro_km||0);
      case 'euro_km_asc': return (a.euro_km||0) - (b.euro_km||0);
      case 'date_desc':
      default: return new Date(b.created_at) - new Date(a.created_at);
    }
  });

  const tbody = document.getElementById('dash-tbody');
  tbody.innerHTML = '';
  document.getElementById('dash-empty').hidden = rows.length > 0;
  document.getElementById('dash-count').textContent = `${rows.length} course${rows.length > 1 ? 's' : ''}`;

  rows.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(profilesMap[c.created_by] || 'Livreur')}</td>
      <td>${Number(c.prix).toFixed(2)} €</td>
      <td>${Number(c.distance).toFixed(1)} km</td>
      <td>${c.euro_km != null ? Number(c.euro_km).toFixed(2) : '—'} €/km</td>
      <td>${escapeHtml(c.decision) || '—'}</td>
      <td><span class="badge-pill st-${c.statut}">${statutLabel(c.statut)}</span></td>
      <td>${formatDateTime(c.created_at)}</td>
    `;
    tbody.appendChild(tr);
  });
}

initDashboard();
