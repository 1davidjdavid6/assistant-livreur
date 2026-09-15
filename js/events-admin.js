/* ============================================================
   Gestion des événements — réservée à l'administrateur
   (le rôle est déjà vérifié par dashboard.js avant d'appeler
   window.initEventsAdmin)
   ============================================================ */

let allAdminEvents = [];
let eventsAdminInitialized = false;

function initEventsAdmin(){
  if(eventsAdminInitialized) return; // évite un double câblage si appelé plusieurs fois
  eventsAdminInitialized = true;

  const form = document.getElementById('event-form');
  const idField = document.getElementById('event-id');
  const titreField = document.getElementById('event-titre');
  const descField = document.getElementById('event-description');
  const debutField = document.getElementById('event-debut');
  const finField = document.getElementById('event-fin');
  const submitBtn = document.getElementById('event-submit-btn');
  const cancelBtn = document.getElementById('event-cancel-edit');

  // Pré-remplissage pratique : fin = début + 2h si vide
  debutField.addEventListener('change', () => {
    if(debutField.value && !finField.value){
      const d = new Date(debutField.value);
      d.setHours(d.getHours() + 2);
      finField.value = toDatetimeLocalValue(d);
    }
  });

  function resetForm(){
    idField.value = '';
    form.reset();
    submitBtn.textContent = "Créer l'événement";
    cancelBtn.style.display = 'none';
  }

  cancelBtn.addEventListener('click', resetForm);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      titre: titreField.value.trim(),
      description: descField.value.trim() || null,
      date_debut: new Date(debutField.value).toISOString(),
      date_fin: new Date(finField.value).toISOString()
    };

    if(new Date(payload.date_fin) <= new Date(payload.date_debut)){
      alert('La date de fin doit être après la date de début.');
      return;
    }

    submitBtn.disabled = true;
    let error;
    if(idField.value){
      ({ error } = await supabaseClient.from('evenements').update(payload).eq('id', idField.value));
    } else {
      payload.created_by = currentSessionUserId();
      ({ error } = await supabaseClient.from('evenements').insert(payload));
    }
    submitBtn.disabled = false;

    if(error){
      alert("Erreur : " + error.message);
      return;
    }
    resetForm();
    loadAdminEvents();
  });

  loadAdminEvents();
  subscribeEventsAdminRealtime();
}

function currentSessionUserId(){
  // currentSessionUserId provient de dashboard.js via une variable globale ;
  // on relit la session pour rester robuste si l'ordre de chargement change.
  return window.__dashboardUserId;
}

async function loadAdminEvents(){
  const { data, error } = await supabaseClient
    .from('evenements')
    .select('*')
    .order('date_debut', { ascending: true });
  if(error){ console.error('Erreur événements (admin) :', error); return; }
  allAdminEvents = data || [];
  renderAdminEvents();
}

function subscribeEventsAdminRealtime(){
  supabaseClient
    .channel('evenements-admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'evenements' }, () => {
      loadAdminEvents();
    })
    .subscribe();
}

function toDatetimeLocalValue(date){
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatAdminEventDate(iso){
  return new Date(iso).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function escapeHtmlEvents(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function renderAdminEvents(){
  const container = document.getElementById('events-admin-list');
  const emptyMsg = document.getElementById('events-admin-empty');
  const countEl = document.getElementById('event-count');

  container.innerHTML = '';
  emptyMsg.hidden = allAdminEvents.length > 0;
  countEl.textContent = `${allAdminEvents.length} événement${allAdminEvents.length > 1 ? 's' : ''}`;

  const now = Date.now();

  allAdminEvents.forEach(ev => {
    const isLive = new Date(ev.date_debut).getTime() <= now && now <= new Date(ev.date_fin).getTime();
    const isPast = new Date(ev.date_fin).getTime() < now;
    const item = document.createElement('div');
    item.className = 'event-list-item';
    item.innerHTML = `
      <div>
        <div class="active-order-head" style="margin-bottom:6px;">
          <span class="event-title" style="font-size:16px;">${escapeHtmlEvents(ev.titre)}</span>
          ${isLive ? '<span class="badge-pill st-en_cours">EN COURS</span>' : (isPast ? '<span class="badge-pill st-annulee">PASSÉ</span>' : '<span class="badge-pill st-en_attente">À VENIR</span>')}
        </div>
        <div class="meta" style="font-size:12.5px;color:var(--text-muted);">${formatAdminEventDate(ev.date_debut)} → ${formatAdminEventDate(ev.date_fin)}</div>
        ${ev.description ? `<p class="event-desc">${escapeHtmlEvents(ev.description)}</p>` : ''}
      </div>
      <div class="event-actions">
        <button type="button" data-action="edit">Modifier</button>
        <button type="button" data-action="delete" class="danger">Supprimer</button>
      </div>
    `;
    item.querySelector('[data-action="edit"]').addEventListener('click', () => startEditEvent(ev));
    item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteEvent(ev));
    container.appendChild(item);
  });
}

function startEditEvent(ev){
  document.getElementById('event-id').value = ev.id;
  document.getElementById('event-titre').value = ev.titre;
  document.getElementById('event-description').value = ev.description || '';
  document.getElementById('event-debut').value = toDatetimeLocalValue(new Date(ev.date_debut));
  document.getElementById('event-fin').value = toDatetimeLocalValue(new Date(ev.date_fin));
  document.getElementById('event-submit-btn').textContent = 'Enregistrer les modifications';
  document.getElementById('event-cancel-edit').style.display = 'block';
  document.getElementById('event-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteEvent(ev){
  if(!confirm(`Supprimer l'événement « ${ev.titre} » ?`)) return;
  const { error } = await supabaseClient.from('evenements').delete().eq('id', ev.id);
  if(error){ alert('Erreur : ' + error.message); return; }
  loadAdminEvents();
}

window.initEventsAdmin = initEventsAdmin;
