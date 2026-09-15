let allCourses = [];
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

  document.getElementById('search-input').addEventListener('input', renderTable);
  document.getElementById('filter-statut').addEventListener('change', renderTable);
  document.getElementById('sort-select').addEventListener('change', renderTable);
}

async function loadProfilesMap(){
  const { data, error } = await supabaseClient.from('profiles').select('id, nom');
  if(error){ console.error('Erreur profils :', error); return; }
  profilesMap = {};
  (data || []).forEach(p => { profilesMap[p.id] = p.nom || 'Livreur'; });
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
