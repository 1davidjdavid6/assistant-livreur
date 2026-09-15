const $ = (id) => document.getElementById(id);
const MAX_OFFERS = 4;

const offersList = $('offers-list');
const template = $('offer-row-template');

let currentSession = null;
let currentProfile = null;
const activeTimers = {};
let allEvenements = [];
let shiftIntervalId = null;

function num(el, fallback){
  if(!el) return fallback;
  const v = parseFloat(el.value);
  return isNaN(v) ? fallback : v;
}
function fmtEuro(n){ return Number(n).toFixed(2); }
function fmtKm(n){ return Number(n).toFixed(1); }
function escapeHtmlLocal(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

/* ============================================================
   NAVIGATION PAR ONGLETS
   ============================================================ */
function initTabs(){
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
function switchTab(tabName){
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.hidden = panel.id !== `tab-${tabName}`;
  });
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  if(tabName === 'historique') loadHistorique();
}

/* ============================================================
   AUTH
   ============================================================ */
async function initAuth(){
  currentSession = await requireSession();
  if(!currentSession) return;
  currentProfile = await getMyProfile(currentSession.user.id);

  $('profil-nom').textContent = currentProfile && currentProfile.nom ? currentProfile.nom : 'Livreur';
  $('profil-email').textContent = currentSession.user.email;
  $('profil-role').textContent = currentProfile && currentProfile.role === 'admin' ? 'Rôle : administrateur' : 'Rôle : livreur';
  $('logout-btn').addEventListener('click', logout);

  initShiftUI();
  loadActiveOrders();
  loadEvenements();
  subscribeEvenementsRealtime();
}

/* ============================================================
   SERVICE (démarrage / heures écoulées automatiques)
   ============================================================ */
function initShiftUI(){
  $('shift-toggle-btn').addEventListener('click', toggleShift);
  renderShiftUI();
  if(currentProfile && currentProfile.shift_started_at){
    shiftIntervalId = setInterval(renderShiftUI, 1000 * 30); // rafraîchit toutes les 30s, suffisant pour un affichage en heures
  }
}

function getShiftHours(){
  if(!currentProfile || !currentProfile.shift_started_at) return 0;
  const elapsedMs = Date.now() - new Date(currentProfile.shift_started_at).getTime();
  return Math.max(0, elapsedMs / 1000 / 3600);
}

function renderShiftUI(){
  const started = currentProfile && currentProfile.shift_started_at;
  const statusEl = $('shift-status');
  const elapsedEl = $('shift-elapsed');
  const btn = $('shift-toggle-btn');

  if(started){
    const hours = getShiftHours();
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    statusEl.textContent = 'Service en cours depuis';
    elapsedEl.hidden = false;
    elapsedEl.textContent = `${String(h).padStart(2,'0')}h${String(m).padStart(2,'0')}`;
    btn.textContent = 'Terminer ma journée';
  } else {
    statusEl.textContent = 'Service non démarré';
    elapsedEl.hidden = true;
    btn.textContent = 'Démarrer ma journée';
  }
  recalcAll();
}

async function toggleShift(){
  const btn = $('shift-toggle-btn');
  btn.disabled = true;
  const starting = !(currentProfile && currentProfile.shift_started_at);
  const value = starting ? new Date().toISOString() : null;

  const { error } = await supabaseClient
    .from('profiles')
    .update({ shift_started_at: value })
    .eq('id', currentSession.user.id);

  btn.disabled = false;
  if(error){ alert("Erreur : " + error.message); return; }

  currentProfile.shift_started_at = value;
  if(starting){
    shiftIntervalId = setInterval(renderShiftUI, 1000 * 30);
  } else if(shiftIntervalId){
    clearInterval(shiftIntervalId);
    shiftIntervalId = null;
  }
  renderShiftUI();
}

/* ============================================================
   Période auto-detect
   ============================================================ */
function setPeriodeAuto(){
  const now = new Date();
  const mins = now.getHours()*60 + now.getMinutes();
  const isPeak = (mins>=705 && mins<=840) || (mins>=1110 && mins<=1320);
  if(isPeak){ $('periode-pointe').checked = true; } else { $('periode-creuse').checked = true; }
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  $('periode-auto').textContent = `Détecté automatiquement à ${hh}:${mm} — modifiable ci-dessus.`;
  updatePillStates();
}
function updatePillStates(){
  document.querySelectorAll('.radio-pill').forEach(p=>{
    const input = p.querySelector('input');
    p.classList.toggle('active', input.checked);
  });
}

/* ============================================================
   Événements (lecture) + dérivation auto du flag "événement en cours"
   ============================================================ */
function isEventLive(ev){
  const now = Date.now();
  return new Date(ev.date_debut).getTime() <= now && now <= new Date(ev.date_fin).getTime();
}

async function loadEvenements(){
  const { data, error } = await supabaseClient
    .from('evenements')
    .select('*')
    .order('date_debut', { ascending: true });
  if(error){ console.error('Erreur événements :', error); return; }
  allEvenements = data || [];
  renderEvenements();
  renderLiveEventBanner();
  recalcAll();
}

function subscribeEvenementsRealtime(){
  supabaseClient
    .channel('evenements-livreur')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'evenements' }, () => loadEvenements())
    .subscribe();
}

function formatEventDate(iso){
  return new Date(iso).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function renderEvenements(){
  const now = Date.now();
  const upcoming = allEvenements.filter(e => new Date(e.date_fin).getTime() >= now);
  upcoming.sort((a,b)=>{
    const aLive = isEventLive(a), bLive = isEventLive(b);
    if(aLive !== bLive) return aLive ? -1 : 1;
    return new Date(a.date_debut) - new Date(b.date_debut);
  });

  const container = $('evenements-list');
  container.innerHTML = '';
  $('evenements-empty').hidden = upcoming.length > 0;

  upcoming.forEach(ev => {
    const isLive = isEventLive(ev);
    const card = document.createElement('div');
    card.className = 'event-card' + (isLive ? ' event-live' : '');
    card.innerHTML = `
      <div class="active-order-head">
        <span class="meta">${formatEventDate(ev.date_debut)} → ${formatEventDate(ev.date_fin)}</span>
        <span class="badge-pill ${isLive ? 'st-en_cours' : 'st-en_attente'}">${isLive ? 'EN COURS' : 'À VENIR'}</span>
      </div>
      <div class="event-title">${escapeHtmlLocal(ev.titre)}</div>
      ${ev.description ? `<p class="event-desc">${escapeHtmlLocal(ev.description)}</p>` : ''}
    `;
    container.appendChild(card);
  });
}

function renderLiveEventBanner(){
  const banner = $('live-event-banner');
  const live = allEvenements.filter(isEventLive);
  if(live.length === 0){ banner.hidden = true; return; }
  banner.hidden = false;
  banner.innerHTML = `<span class="dot"></span><span>Événement en cours : <strong>${escapeHtmlLocal(live[0].titre)}</strong>${live.length > 1 ? ` (+${live.length - 1} autre${live.length > 2 ? 's' : ''})` : ''}</span>`;
  banner.onclick = () => switchTab('evenements');
}

/* ============================================================
   Moteur de décision (inchangé)
   ============================================================ */
function evaluateCourse(prix, distance, cond){
  const euroKm = prix/distance;
  const baseMin = cond.periode==='pointe' ? 1.70 : 2.00;
  const baseMaxDist = cond.periode==='pointe' ? 4.5 : 3.5;
  const hasCapModifier = cond.pluie || cond.chaleur || cond.fatigue;

  let weatherFatigueCap = Infinity;
  let adjMin = baseMin;
  const notes = [];

  if(cond.pluie){
    adjMin -= 0.20;
    weatherFatigueCap = Math.min(weatherFatigueCap, 3.5);
    notes.push('🌧️ Pluie : tarifs souvent majorés, seuil assoupli — distance limitée à 3.5 km.');
  }
  if(cond.fatigue){
    adjMin += 0.30;
    weatherFatigueCap = Math.min(weatherFatigueCap, 2.5);
    notes.push('😓 Mode conservation : courses courtes et excellentes uniquement.');
  }
  if(cond.chaleur){
    adjMin = Math.max(adjMin, 1.90);
    weatherFatigueCap = Math.min(weatherFatigueCap, 3.0);
    notes.push('🌡️ Forte chaleur : hydrate-toi — distance limitée à 3 km.');
  }
  if(cond.afterFour > 0){
    notes.push('⏱️ +4h de service : tous les seuils relevés de 0.25 €/km.');
  }

  const effectiveMin = adjMin + cond.afterFour;
  const effectiveMaxDist = Math.min(baseMaxDist, weatherFatigueCap);
  const isLong = distance > 6;

  let decision, reason;

  if(isLong){
    const longThreshold = 2.40 + cond.afterFour;
    if(distance > weatherFatigueCap){
      decision = 'REFUSER';
      reason = `Distance (${fmtKm(distance)} km) au-delà du plafond météo/fatigue (${fmtKm(weatherFatigueCap)} km).`;
    } else if(cond.nbLongues >= 2){
      decision = 'REFUSER';
      reason = '2 courses longues déjà enchaînées — pause ou course courte recommandée.';
    } else if(euroKm >= longThreshold){
      decision = 'ACCEPTER';
      reason = `Course longue rentable (seuil ${fmtEuro(longThreshold)} €/km atteint).`;
    } else {
      decision = 'REFUSER';
      reason = `Sous le seuil course longue requis (${fmtEuro(longThreshold)} €/km).`;
    }
  } else if(distance > effectiveMaxDist){
    if(!hasCapModifier){
      decision = 'PEUT-ÊTRE';
      reason = `Entre le seuil standard (${fmtKm(baseMaxDist)} km) et le seuil course longue (6 km) — non couvert par les règles.`;
    } else {
      decision = 'REFUSER';
      reason = `Distance (${fmtKm(distance)} km) au-delà du plafond ajusté (${fmtKm(effectiveMaxDist)} km).`;
    }
  } else {
    if(euroKm >= effectiveMin){
      decision = 'ACCEPTER';
      reason = `Rentable : ${fmtEuro(euroKm)} €/km ≥ seuil ${fmtEuro(effectiveMin)} €/km.`;
    } else {
      decision = 'REFUSER';
      reason = `Sous le seuil minimum (${fmtEuro(effectiveMin)} €/km).`;
    }
  }

  return { decision, euroKm, reason, notes, effectiveMin, effectiveMaxDist, isLong };
}

/* ============================================================
   Gestion des lignes "courses en attente"
   ============================================================ */
function bindOfferRow(row){
  row.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('input', recalcAll);
  });
  row.querySelector('.offer-remove').addEventListener('click', ()=>{
    if(offersList.children.length<=1) return;
    row.remove();
    updateOffersUI();
    recalcAll();
  });
  row.querySelector('.save-btn').addEventListener('click', () => handleSaveOffer(row));
}

function addOfferRow(){
  if(offersList.children.length >= MAX_OFFERS) return;
  const node = template.content.firstElementChild.cloneNode(true);
  offersList.appendChild(node);
  bindOfferRow(node);
  updateOffersUI();
  recalcAll();
}

function updateOffersUI(){
  const rows = [...offersList.children];
  $('offers-counter').textContent = `${rows.length}/${MAX_OFFERS}`;
  const addBtn = $('add-offer');
  addBtn.disabled = rows.length >= MAX_OFFERS;
  addBtn.textContent = rows.length >= MAX_OFFERS ? 'Maximum atteint (4)' : '+ Ajouter une course simultanée';
  rows.forEach(r=>{
    r.querySelector('.offer-remove').style.visibility = rows.length<=1 ? 'hidden' : 'visible';
  });
}

function readGlobalConditions(){
  const periode = $('periode-pointe').checked ? 'pointe' : 'creuse';
  const pluie = $('pluie').checked;
  const tempVal = $('temperature').value === '' ? null : parseFloat($('temperature').value);
  const chaleur = $('chaleur').checked || (tempVal !== null && !isNaN(tempVal) && tempVal > 28);
  const fatigue = $('fatigue').checked;
  const heuresService = getShiftHours();
  const afterFour = heuresService > 4 ? 0.25 : 0;
  const nbLongues = num($('longues'), 0);
  const evenement = allEvenements.some(isEventLive);
  return { periode, pluie, chaleur, fatigue, heuresService, afterFour, nbLongues, evenement };
}

function recalcAll(){
  const cond = readGlobalConditions();
  const rows = [...offersList.children];
  const results = [];

  rows.forEach(row=>{
    const prixEl = row.querySelector('.offer-prix');
    const distEl = row.querySelector('.offer-distance');
    const badgeEl = row.querySelector('.offer-badge');
    const saveBtn = row.querySelector('.save-btn');
    const prix = num(prixEl, NaN);
    const distance = num(distEl, NaN);

    row.classList.remove('row-ok','row-maybe','row-no');

    if(isNaN(prix) || isNaN(distance) || prix<=0 || distance<=0){
      badgeEl.textContent = '';
      badgeEl.className = 'offer-badge';
      saveBtn.disabled = true;
      return;
    }

    const evalRes = evaluateCourse(prix, distance, cond);
    const cls = evalRes.decision==='ACCEPTER' ? 'ok' : (evalRes.decision==='PEUT-ÊTRE' ? 'maybe' : 'no');
    row.classList.add('row-'+cls);
    saveBtn.disabled = false;

    badgeEl.textContent = `${evalRes.decision} · ${fmtEuro(evalRes.euroKm)} €/km`;
    badgeEl.className = 'offer-badge badge-'+cls;

    results.push({ evalRes, prix, distance, cls });
  });

  updateOffersUI();
  renderTop(results, cond);
}

function renderTop(results, cond){
  const panel = $('verdict-panel');
  panel.classList.remove('status-ok','status-maybe','status-no');

  if(results.length === 0){
    $('verdict-rate-big').textContent = '— €/km';
    $('verdict-subline').textContent = 'Renseigne au moins une course.';
    $('verdict-status').textContent = 'EN ATTENTE';
    $('verdict-status').className = 'verdict-status';
    $('verdict-reason').textContent = '';
    $('verdict-notes').innerHTML = '';
    $('verdict-thresholds').textContent = '';
    return;
  }

  const rank = { 'ACCEPTER':0, 'PEUT-ÊTRE':1, 'REFUSER':2 };
  const pool = [...results].sort((a,b)=>{
    if(rank[a.evalRes.decision] !== rank[b.evalRes.decision]) return rank[a.evalRes.decision]-rank[b.evalRes.decision];
    return b.evalRes.euroKm - a.evalRes.euroKm;
  });

  const best = pool[0];
  panel.classList.add('status-'+best.cls);

  $('verdict-rate-big').textContent = `${fmtEuro(best.evalRes.euroKm)} €/km`;

  let subline = `${fmtEuro(best.prix)} € · ${fmtKm(best.distance)} km`;
  if(results.length > 1) subline += ` · meilleure de ${results.length}`;
  $('verdict-subline').textContent = subline;

  $('verdict-status').textContent = best.evalRes.decision;
  $('verdict-status').className = 'verdict-status c-'+best.cls;
  $('verdict-reason').textContent = best.evalRes.reason;

  $('verdict-notes').innerHTML = '';
  const addNote = (txt) => { const li=document.createElement('li'); li.textContent=txt; $('verdict-notes').appendChild(li); };
  best.evalRes.notes.forEach(addNote);
  if(cond.evenement && best.evalRes.decision !== 'REFUSER'){
    addNote('🎉 Événement en cours à proximité : reste dans la zone si le €/km suit.');
  }

  $('verdict-thresholds').textContent = `Seuil requis : ${fmtEuro(best.evalRes.effectiveMin)} €/km · Distance max : ${fmtKm(best.evalRes.effectiveMaxDist)} km`;
}

/* ============================================================
   Réinitialisation du formulaire "Courses en attente"
   ============================================================ */
function resetOfferForm(){
  [...offersList.children].forEach((row, i)=>{
    if(i > 0){ row.remove(); }
    else {
      row.querySelectorAll('input').forEach(inp => inp.value = '');
      row.querySelector('.offer-badge').textContent = '';
      row.querySelector('.offer-badge').className = 'offer-badge';
      row.querySelector('.save-btn').disabled = true;
      row.classList.remove('row-ok','row-maybe','row-no');
    }
  });
  updateOffersUI();
  recalcAll();
}

/* ============================================================
   Sauvegarde d'une course + suivi (commandes en cours + chrono)
   ============================================================ */
async function handleSaveOffer(row){
  const cond = readGlobalConditions();
  const prix = num(row.querySelector('.offer-prix'), NaN);
  const distance = num(row.querySelector('.offer-distance'), NaN);
  if(isNaN(prix) || isNaN(distance) || prix<=0 || distance<=0) return;

  const evalRes = evaluateCourse(prix, distance, cond);
  const saveBtn = row.querySelector('.save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Enregistrement…';

  const { data, error } = await supabaseClient.from('courses').insert({
    created_by: currentSession.user.id,
    prix, distance,
    euro_km: evalRes.euroKm,
    decision: evalRes.decision,
    statut: 'en_cours',
    timer_duration_seconds: LivreurTimer.TIMER_DEFAULT_DURATION
  }).select().single();

  saveBtn.textContent = 'Enregistrer cette course';
  saveBtn.disabled = false;

  if(error){
    alert("Erreur d'enregistrement : " + error.message);
    return;
  }
  addActiveOrderCard(data);
  $('active-orders-section').scrollIntoView({ behavior:'smooth', block:'start' });
}

async function loadActiveOrders(){
  const { data, error } = await supabaseClient
    .from('courses')
    .select('*')
    .eq('created_by', currentSession.user.id)
    .eq('statut', 'en_cours')
    .order('created_at', { ascending: false });
  if(error){ console.error(error); return; }
  const container = $('active-orders');
  container.innerHTML = '';
  (data || []).forEach(addActiveOrderCard);
  toggleActiveOrdersEmpty();
}

function toggleActiveOrdersEmpty(){
  const container = $('active-orders');
  $('active-orders-empty').hidden = container.children.length > 0;
}

function computeInitialRemaining(order){
  if(!order.timer_started_at) return order.timer_duration_seconds;
  const elapsed = Math.floor((Date.now() - new Date(order.timer_started_at).getTime()) / 1000);
  return Math.max(0, order.timer_duration_seconds - elapsed);
}

function addActiveOrderCard(order){
  const container = $('active-orders');
  const card = document.createElement('div');
  card.className = 'active-order';
  card.dataset.id = order.id;
  card.innerHTML = `
    <div class="active-order-head">
      <span class="meta">${fmtEuro(order.prix)} € · ${fmtKm(order.distance)} km · ${fmtEuro(order.euro_km)} €/km</span>
      <span class="badge-pill st-en_cours">EN COURS</span>
    </div>
    <div class="timer-display" data-role="timer">00:15:00</div>
    <p class="timer-expired-msg" data-role="expired" hidden>⏰ 15 minutes écoulées — tu peux annuler la commande.</p>
    <div class="timer-controls">
      <button type="button" data-action="start">Démarrer</button>
      <button type="button" data-action="pause">Pause</button>
      <button type="button" data-action="reset">Réinitialiser</button>
    </div>
    <div class="order-actions">
      <button type="button" class="btn-validee" data-action="valider">Marquer validée</button>
      <button type="button" class="btn-annuler" data-action="annuler">Annuler</button>
    </div>
  `;
  container.appendChild(card);
  toggleActiveOrdersEmpty();

  const timerEl = card.querySelector('[data-role="timer"]');
  const expiredEl = card.querySelector('[data-role="expired"]');
  const initialRemaining = computeInitialRemaining(order);

  const timer = LivreurTimer.createTimer({
    remainingSeconds: initialRemaining,
    onTick: (remaining) => { timerEl.textContent = LivreurTimer.formatTimer(remaining); },
    onStateChange: (state) => {
      timerEl.classList.remove('state-avertissement','state-alerte','state-expired');
      if(state !== 'normal') timerEl.classList.add('state-'+state);
      expiredEl.hidden = state !== 'expired';
    }
  });
  activeTimers[order.id] = timer;

  if(order.timer_started_at && initialRemaining > 0){
    timer.start();
  }

  card.querySelector('[data-action="start"]').addEventListener('click', async () => {
    if(!order.timer_started_at){
      const now = new Date().toISOString();
      order.timer_started_at = now;
      await supabaseClient.from('courses').update({ timer_started_at: now }).eq('id', order.id);
    }
    timer.start();
  });
  card.querySelector('[data-action="pause"]').addEventListener('click', () => timer.pause());
  card.querySelector('[data-action="reset"]').addEventListener('click', async () => {
    order.timer_started_at = null;
    await supabaseClient.from('courses').update({ timer_started_at: null }).eq('id', order.id);
    timer.reset(order.timer_duration_seconds);
  });
  card.querySelector('[data-action="valider"]').addEventListener('click', async () => {
    await supabaseClient.from('courses').update({ statut: 'validee' }).eq('id', order.id);
    timer.pause();
    delete activeTimers[order.id];
    card.remove();
    toggleActiveOrdersEmpty();
    resetOfferForm();
  });
  card.querySelector('[data-action="annuler"]').addEventListener('click', async () => {
    await supabaseClient.from('courses').update({ statut: 'annulee' }).eq('id', order.id);
    timer.pause();
    delete activeTimers[order.id];
    card.remove();
    toggleActiveOrdersEmpty();
  });
}

/* ============================================================
   Historique
   ============================================================ */
async function loadHistorique(){
  const filter = $('historique-filter').value;
  let query = supabaseClient
    .from('courses')
    .select('*')
    .eq('created_by', currentSession.user.id)
    .in('statut', ['validee','annulee'])
    .order('updated_at', { ascending: false })
    .limit(100);

  if(filter !== 'tous') query = query.eq('statut', filter);

  const { data, error } = await query;
  if(error){ console.error(error); return; }
  renderHistorique(data || []);
}

function renderHistorique(rows){
  const container = $('historique-list');
  container.innerHTML = '';
  $('historique-empty').hidden = rows.length > 0;
  $('historique-count').textContent = `${rows.length} course${rows.length > 1 ? 's' : ''}`;

  rows.forEach(c => {
    const item = document.createElement('div');
    item.className = 'historique-item';
    item.innerHTML = `
      <div>
        <div>${fmtEuro(c.prix)} € · ${fmtKm(c.distance)} km · ${c.euro_km != null ? fmtEuro(c.euro_km) : '—'} €/km</div>
        <div class="meta">${new Date(c.updated_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</div>
      </div>
      <span class="badge-pill st-${c.statut}">${c.statut === 'validee' ? 'Validée' : 'Annulée'}</span>
    `;
    container.appendChild(item);
  });
}

/* ============================================================
   Câblage global
   ============================================================ */
['pluie','chaleur','fatigue'].forEach(id => $(id).addEventListener('change', recalcAll));
$('temperature').addEventListener('input', recalcAll);
$('longues').addEventListener('input', recalcAll);
document.querySelectorAll('input[name=periode]').forEach(r => r.addEventListener('change', ()=>{ updatePillStates(); recalcAll(); }));

$('add-offer').addEventListener('click', addOfferRow);
$('historique-filter').addEventListener('change', loadHistorique);

$('reset').addEventListener('click', ()=>{
  $('pluie').checked = false;
  $('chaleur').checked = false;
  $('fatigue').checked = false;
  $('temperature').value = '';
  $('longues').value = '';
  setPeriodeAuto();
  resetOfferForm();
});

/* ============================================================
   Init
   ============================================================ */
bindOfferRow(offersList.children[0]);
initTabs();
setPeriodeAuto();
updateOffersUI();
recalcAll();
initAuth();
