/* ============================================================
   Import CSV Uber — réservé à l'administrateur
   Traitement entièrement côté client : le fichier brut n'est
   jamais envoyé à Supabase, seules les données validées le sont.
   ============================================================ */

const CSV_FIELD_CANDIDATES = {
  date: ['date', 'trip date', 'pickup date', 'created', 'datetime', 'horodatage'],
  montant: ['montant', 'fare', 'earnings', 'total', 'amount', 'revenu', 'net', 'price'],
  external_id: ['trip id', 'trip uuid', 'uuid', 'request id', 'order id', 'id'],
  distance: ['distance', 'km', 'miles', 'trip distance'],
  duree: ['duration', 'durée', 'duree', 'trip time', 'minutes', 'time'],
  utilisateur: ['driver email', 'email', 'driver', 'chauffeur', 'livreur', 'phone', 'driver name']
};

let csvParsedRows = [];
let csvHeaders = [];
let csvMapping = {};
let csvAnalysis = null;
let csvImportInitialized = false;

function initCsvImport(){
  if(csvImportInitialized) return;
  csvImportInitialized = true;

  document.getElementById('csv-file-input').addEventListener('change', handleFileSelected);
  document.getElementById('csv-analyze-btn').addEventListener('click', analyzeCsv);
  document.getElementById('csv-confirm-btn').addEventListener('click', confirmImport);
  document.getElementById('csv-cancel-btn').addEventListener('click', cancelImport);

  loadImportsHistory();
}

function normalizeHeader(h){
  return (h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function guessColumn(candidates){
  let best = null, bestScore = 0;
  csvHeaders.forEach(h => {
    const norm = normalizeHeader(h);
    candidates.forEach(c => {
      if(norm === c){ if(2 > bestScore){ bestScore = 2; best = h; } }
      else if(norm.includes(c) || c.includes(norm)){ if(1 > bestScore){ bestScore = 1; best = h; } }
    });
  });
  return best;
}

function handleFileSelected(e){
  const file = e.target.files[0];
  if(!file) return;

  const MAX_SIZE = 5 * 1024 * 1024; // 5 Mo — largement suffisant pour un relevé Uber, evite de geler le navigateur
  if(file.size > MAX_SIZE){
    alert(`Fichier trop volumineux (${(file.size/1024/1024).toFixed(1)} Mo). Limite : 5 Mo. Sépare le relevé en plusieurs fichiers plus courts si besoin.`);
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    const parsed = Papa.parse(ev.target.result, { header: true, skipEmptyLines: true });
    csvParsedRows = parsed.data;
    csvHeaders = parsed.meta.fields || [];

    if(csvParsedRows.length === 0){
      alert('Fichier vide ou illisible.');
      return;
    }

    csvMapping = {
      date: guessColumn(CSV_FIELD_CANDIDATES.date),
      montant: guessColumn(CSV_FIELD_CANDIDATES.montant),
      external_id: guessColumn(CSV_FIELD_CANDIDATES.external_id),
      distance: guessColumn(CSV_FIELD_CANDIDATES.distance),
      duree: guessColumn(CSV_FIELD_CANDIDATES.duree),
      utilisateur: guessColumn(CSV_FIELD_CANDIDATES.utilisateur)
    };

    renderMappingUI();
    document.getElementById('csv-preview').hidden = false;
    document.getElementById('csv-summary').hidden = true;
  };
  reader.readAsText(file, 'UTF-8');
}

function renderMappingUI(){
  const labels = {
    date: 'Date', montant: 'Montant', external_id: 'Identifiant de course',
    distance: 'Distance', duree: 'Durée', utilisateur: 'Utilisateur (email/nom Uber)'
  };
  const container = document.getElementById('csv-mapping-table');
  container.innerHTML = '';

  Object.keys(labels).forEach(key => {
    const row = document.createElement('div');
    row.className = 'row-2';
    row.style.marginBottom = '10px';
    row.style.alignItems = 'center';

    const label = document.createElement('div');
    label.textContent = labels[key];
    label.style.fontSize = '13.5px';
    label.style.color = 'var(--text-muted)';

    const select = document.createElement('select');
    select.dataset.field = key;
    const noneOpt = document.createElement('option');
    noneOpt.value = ''; noneOpt.textContent = 'Aucune colonne';
    select.appendChild(noneOpt);
    csvHeaders.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h; opt.textContent = h;
      if(csvMapping[key] === h) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => { csvMapping[key] = select.value || null; });

    row.appendChild(label);
    row.appendChild(select);
    container.appendChild(row);
  });
}

function parseMontant(raw){
  if(raw == null) return NaN;
  const cleaned = String(raw).replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(cleaned);
}

function parseDateLoose(raw){
  if(!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

async function analyzeCsv(){
  if(!csvMapping.montant || !csvMapping.external_id){
    alert('Il faut au minimum une colonne "Montant" et "Identifiant de course" pour analyser le fichier.');
    return;
  }

  const btn = document.getElementById('csv-analyze-btn');
  btn.disabled = true;
  btn.textContent = 'Analyse en cours…';

  // IDs déjà en base (dédoublonnage)
  const { data: existing, error: existErr } = await supabaseClient
    .from('courses')
    .select('external_id')
    .not('external_id', 'is', null);
  if(existErr){ alert('Erreur : ' + existErr.message); btn.disabled = false; btn.textContent = 'Analyser le fichier'; return; }
  const existingIds = new Set((existing || []).map(r => r.external_id));

  // Profils avec identifiant Uber connu
  const { data: profils, error: profErr } = await supabaseClient
    .from('profiles')
    .select('id, nom, uber_identifiant')
    .not('uber_identifiant', 'is', null);
  if(profErr){ alert('Erreur : ' + profErr.message); btn.disabled = false; btn.textContent = 'Analyser le fichier'; return; }
  const profilMap = {};
  (profils || []).forEach(p => { profilMap[normalizeHeader(p.uber_identifiant)] = p; });

  const rows = [];
  let minDate = null, maxDate = null;
  const utilisateursConcernes = new Set();
  const nonReconnus = {};

  csvParsedRows.forEach(raw => {
    const external_id = csvMapping.external_id ? String(raw[csvMapping.external_id] || '').trim() : '';
    const montant = parseMontant(csvMapping.montant ? raw[csvMapping.montant] : null);
    const distance = csvMapping.distance ? parseFloat(String(raw[csvMapping.distance]).replace(',', '.')) : null;
    const dureeRaw = csvMapping.duree ? raw[csvMapping.duree] : null;
    const duree = dureeRaw != null ? parseInt(dureeRaw, 10) : null;
    const dateVal = csvMapping.date ? parseDateLoose(raw[csvMapping.date]) : null;
    const utilisateurRaw = csvMapping.utilisateur ? String(raw[csvMapping.utilisateur] || '').trim() : '';
    const profil = utilisateurRaw ? profilMap[normalizeHeader(utilisateurRaw)] : null;

    if(dateVal){
      if(!minDate || dateVal < minDate) minDate = dateVal;
      if(!maxDate || dateVal > maxDate) maxDate = dateVal;
    }

    let statut;
    if(!external_id || isNaN(montant)){
      statut = 'erreur';
    } else if(existingIds.has(external_id)){
      statut = 'doublon';
    } else if(!profil){
      statut = 'utilisateur_non_reconnu';
      if(utilisateurRaw) nonReconnus[utilisateurRaw] = (nonReconnus[utilisateurRaw] || 0) + 1;
    } else {
      statut = 'nouvelle';
      utilisateursConcernes.add(profil.id);
    }

    rows.push({ external_id, montant, distance, duree, dateVal, profil, statut });
  });

  const counts = { nouvelle: 0, doublon: 0, erreur: 0, utilisateur_non_reconnu: 0 };
  rows.forEach(r => counts[r.statut]++);

  csvAnalysis = {
    rows,
    counts,
    minDate, maxDate,
    utilisateursConcernes: [...utilisateursConcernes],
    nonReconnus
  };

  renderSummary();
  btn.disabled = false;
  btn.textContent = 'Analyser le fichier';
}

function renderSummary(){
  const { counts, minDate, maxDate, utilisateursConcernes, nonReconnus, rows } = csvAnalysis;
  const fileInput = document.getElementById('csv-file-input');
  const fileName = fileInput.files[0] ? fileInput.files[0].name : 'fichier.csv';

  const periode = minDate && maxDate
    ? `${minDate.toLocaleDateString('fr-FR')} → ${maxDate.toLocaleDateString('fr-FR')}`
    : 'non détectée';

  let html = `
    <p><strong>${escapeHtmlCsv(fileName)}</strong></p>
    <p class="hint">Période : ${periode}</p>
    <ul class="verdict-notes" style="margin-bottom:14px;">
      <li>${rows.length} lignes lues</li>
      <li>${counts.nouvelle} nouvelles courses</li>
      <li>${counts.doublon} doublons (ignorés)</li>
      <li>${counts.utilisateur_non_reconnu} utilisateur(s) non reconnu(s) (ignorés)</li>
      <li>${counts.erreur} erreurs (ignorées)</li>
    </ul>
  `;

  if(Object.keys(nonReconnus).length > 0){
    html += `<p class="hint">Non reconnus : ${Object.entries(nonReconnus).map(([k,v]) => `${escapeHtmlCsv(k)} (${v})`).join(', ')} — ajoute leur identifiant Uber dans leur profil pour les inclure.</p>`;
  }

  html += `<p class="hint">Utilisateurs concernés par cet import : ${utilisateursConcernes.length}</p>`;

  document.getElementById('csv-summary-content').innerHTML = html;
  document.getElementById('csv-summary').hidden = false;
  document.getElementById('csv-confirm-btn').disabled = counts.nouvelle === 0;
}

async function confirmImport(){
  if(!csvAnalysis || csvAnalysis.counts.nouvelle === 0) return;
  const btn = document.getElementById('csv-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Import en cours…';

  const { data: { session } } = await supabaseClient.auth.getSession();
  const adminId = session.user.id;

  const nouvelles = csvAnalysis.rows.filter(r => r.statut === 'nouvelle').map(r => ({
    created_by: r.profil.id,
    prix: r.montant,
    distance: (isNaN(r.distance) || !r.distance) ? null : r.distance,
    euro_km: (r.distance && !isNaN(r.distance)) ? +(r.montant / r.distance).toFixed(2) : null,
    decision: null,
    statut: 'validee',
    source: 'import_csv',
    external_id: r.external_id,
    duree_minutes: isNaN(r.duree) ? null : r.duree
  }));

  const { error: insertErr } = await supabaseClient.from('courses').insert(nouvelles);
  if(insertErr){
    alert("Erreur lors de l'import : " + insertErr.message);
    btn.disabled = false;
    btn.textContent = "Confirmer l'import";
    return;
  }

  const fileInput = document.getElementById('csv-file-input');
  await supabaseClient.from('csv_imports').insert({
    imported_by: adminId,
    nom_fichier: fileInput.files[0] ? fileInput.files[0].name : 'fichier.csv',
    periode_debut: csvAnalysis.minDate ? csvAnalysis.minDate.toISOString().slice(0,10) : null,
    periode_fin: csvAnalysis.maxDate ? csvAnalysis.maxDate.toISOString().slice(0,10) : null,
    nb_lignes: csvAnalysis.rows.length,
    nb_courses_detectees: csvAnalysis.rows.length,
    nb_nouvelles: csvAnalysis.counts.nouvelle,
    nb_doublons: csvAnalysis.counts.doublon,
    nb_erreurs: csvAnalysis.counts.erreur + csvAnalysis.counts.utilisateur_non_reconnu,
    utilisateurs_concernes: csvAnalysis.utilisateursConcernes,
    statut: (csvAnalysis.counts.erreur + csvAnalysis.counts.utilisateur_non_reconnu) > 0 ? 'termine_avec_erreurs' : 'reussi'
  });

  btn.textContent = "Confirmer l'import";
  cancelImport();
  loadImportsHistory();
  alert(`Import terminé : ${nouvelles.length} course(s) ajoutée(s).`);
}

function cancelImport(){
  csvParsedRows = [];
  csvHeaders = [];
  csvMapping = {};
  csvAnalysis = null;
  document.getElementById('csv-file-input').value = '';
  document.getElementById('csv-preview').hidden = true;
  document.getElementById('csv-summary').hidden = true;
}

async function loadImportsHistory(){
  const { data, error } = await supabaseClient
    .from('csv_imports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if(error){ console.error(error); return; }

  const container = document.getElementById('csv-imports-list');
  const emptyMsg = document.getElementById('csv-imports-empty');
  container.innerHTML = '';
  emptyMsg.hidden = (data || []).length > 0;

  (data || []).forEach(imp => {
    const item = document.createElement('div');
    item.className = 'historique-item';
    const ok = imp.statut === 'reussi';
    item.innerHTML = `
      <div>
        <div>${escapeHtmlCsv(imp.nom_fichier)}</div>
        <div class="meta">${imp.nb_nouvelles} nouvelles · ${imp.nb_doublons} doublons · ${imp.nb_erreurs} erreurs · ${new Date(imp.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</div>
      </div>
      <span class="badge-pill ${ok ? 'st-validee' : 'st-en_attente'}">${ok ? 'Réussi ✅' : 'Avec erreurs'}</span>
    `;
    container.appendChild(item);
  });
}

function escapeHtmlCsv(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

window.initCsvImport = initCsvImport;
