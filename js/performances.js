/* ============================================================
   Performances — calculées côté client à partir des courses
   validées de l'utilisateur connecté. Aucune donnée inventée :
   si l'historique est trop court pour un indicateur fiable,
   on l'affiche clairement plutôt que d'afficher un chiffre creux.
   ============================================================ */

const PERF_REFERENCE_RATE = 25; // €/h considéré comme "excellent" pour un VAE — sert de base au score /100
let perfCoursesCache = null;

function localDateKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(date, n){
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function fmtEuroPerf(n){ return `${n.toFixed(2)} €`; }
function fmtRatePerf(n){ return `${n.toFixed(2)} €/h`; }

async function loadPerformances(){
  const { data, error } = await supabaseClient
    .from('courses')
    .select('prix, distance, euro_km, created_at, updated_at, duree_minutes')
    .eq('created_by', currentSession.user.id)
    .eq('statut', 'validee')
    .order('created_at', { ascending: true });

  if(error){ console.error('Erreur performances :', error); return; }

  perfCoursesCache = (data || []).map(c => {
    const created = new Date(c.created_at);
    const durationMin = c.duree_minutes != null
      ? c.duree_minutes
      : Math.max(1, (new Date(c.updated_at) - created) / 60000);
    return {
      revenue: Number(c.prix),
      distance: Number(c.distance),
      hour: created.getHours(),
      dateKey: localDateKey(created),
      durationMin
    };
  });

  renderPerformances();
}

function groupByDay(rows){
  const map = {};
  rows.forEach(r => {
    if(!map[r.dateKey]) map[r.dateKey] = { revenue: 0, count: 0, minutes: 0 };
    map[r.dateKey].revenue += r.revenue;
    map[r.dateKey].count += 1;
    map[r.dateKey].minutes += r.durationMin;
  });
  return map;
}

function sumRange(dayMap, keys){
  return keys.reduce((acc, k) => {
    const d = dayMap[k];
    if(d){ acc.revenue += d.revenue; acc.count += d.count; acc.minutes += d.minutes; }
    return acc;
  }, { revenue: 0, count: 0, minutes: 0 });
}

function euroParHeure(stats){
  return stats.minutes > 0 ? stats.revenue / (stats.minutes / 60) : 0;
}

function renderPerformances(){
  const rows = perfCoursesCache || [];
  const dayMap = groupByDay(rows);
  const now = new Date();
  const todayKey = localDateKey(now);
  const yesterdayKey = localDateKey(addDays(now, -1));

  const todayStats = dayMap[todayKey] || { revenue: 0, count: 0, minutes: 0 };
  const yesterdayStats = dayMap[yesterdayKey] || { revenue: 0, count: 0, minutes: 0 };
  const todayRate = euroParHeure(todayStats);

  $('perf-today-revenue').textContent = fmtEuroPerf(todayStats.revenue);
  $('perf-today-rate').textContent = todayStats.count > 0 ? fmtRatePerf(todayRate) : '—';
  $('perf-today-count').textContent = todayStats.count;

  if(yesterdayStats.count === 0){
    $('perf-vs-yesterday').textContent = todayStats.count > 0 ? "Pas de données hier pour comparer." : '';
  } else {
    const diff = todayStats.revenue - yesterdayStats.revenue;
    const pct = yesterdayStats.revenue > 0 ? Math.round((diff / yesterdayStats.revenue) * 100) : null;
    const sign = diff >= 0 ? '+' : '';
    $('perf-vs-yesterday').textContent = pct !== null
      ? `${sign}${pct}% vs hier (${sign}${diff.toFixed(2)} €)`
      : `${sign}${diff.toFixed(2)} € vs hier`;
  }

  // Indice de la journée
  const scoreBadge = $('perf-score-badge');
  const scoreDetail = $('perf-score-detail');
  if(todayStats.count === 0){
    scoreBadge.textContent = '—';
    scoreBadge.className = 'perf-score-badge';
    scoreDetail.textContent = 'Pas encore de courses aujourd\'hui.';
  } else {
    const score = Math.max(0, Math.min(100, Math.round((todayRate / PERF_REFERENCE_RATE) * 100)));
    const tier = score >= 80 ? 'ok' : (score >= 50 ? 'maybe' : 'no');
    scoreBadge.textContent = score;
    scoreBadge.className = 'perf-score-badge tier-' + tier;
    scoreDetail.textContent = `Basé sur ${fmtRatePerf(todayRate)} aujourd'hui.`;
  }

  // Meilleur créneau (bucket horaire avec au moins 2 courses, sur tout l'historique)
  const hourBuckets = {};
  rows.forEach(r => {
    if(!hourBuckets[r.hour]) hourBuckets[r.hour] = { revenue: 0, minutes: 0, count: 0 };
    hourBuckets[r.hour].revenue += r.revenue;
    hourBuckets[r.hour].minutes += r.durationMin;
    hourBuckets[r.hour].count += 1;
  });
  const eligibleHours = Object.entries(hourBuckets).filter(([,b]) => b.count >= 2);
  const bestSlotEl = $('perf-best-slot');
  if(eligibleHours.length === 0){
    bestSlotEl.innerHTML = '<p class="hint">Pas encore assez de données pour identifier un créneau fiable (minimum 2 courses sur une même heure).</p>';
  } else {
    const [bestHour, bestBucket] = eligibleHours.sort((a,b) => euroParHeure(b[1]) - euroParHeure(a[1]))[0];
    const h = parseInt(bestHour, 10);
    bestSlotEl.innerHTML = `
      <div class="perf-hero-grid" style="grid-template-columns:1fr 1fr;">
        <div class="perf-stat"><div class="perf-stat-value" style="font-size:28px;">${String(h).padStart(2,'0')}h–${String((h+1)%24).padStart(2,'0')}h</div><div class="perf-stat-label">Créneau</div></div>
        <div class="perf-stat"><div class="perf-stat-value" style="font-size:28px;">${fmtRatePerf(euroParHeure(bestBucket))}</div><div class="perf-stat-label">Sur ${bestBucket.count} course${bestBucket.count>1?'s':''}</div></div>
      </div>
    `;
  }

  // Heatmap des heures
  const heatmapEl = $('perf-heatmap');
  const hoursWithData = Object.keys(hourBuckets).map(Number).sort((a,b) => a-b);
  if(hoursWithData.length === 0){
    heatmapEl.innerHTML = '<p class="hint">Pas encore de données.</p>';
  } else {
    const rates = hoursWithData.map(h => euroParHeure(hourBuckets[h]));
    const sorted = [...rates].sort((a,b) => a-b);
    const tercile1 = sorted[Math.floor(sorted.length/3)] ?? sorted[0];
    const tercile2 = sorted[Math.floor(sorted.length*2/3)] ?? sorted[sorted.length-1];
    const enoughSpread = hoursWithData.length >= 3;

    heatmapEl.innerHTML = '';
    heatmapEl.className = 'perf-heatmap';
    hoursWithData.forEach(h => {
      const rate = euroParHeure(hourBuckets[h]);
      let tier = 'neutral';
      if(enoughSpread){
        tier = rate <= tercile1 ? 'no' : (rate <= tercile2 ? 'maybe' : 'ok');
      }
      const cell = document.createElement('div');
      cell.className = 'perf-heat-cell tier-' + tier;
      cell.title = `${String(h).padStart(2,'0')}h : ${fmtRatePerf(rate)} (${hourBuckets[h].count} course${hourBuckets[h].count>1?'s':''})`;
      cell.textContent = String(h).padStart(2,'0');
      heatmapEl.appendChild(cell);
    });
  }

  // 7 derniers jours vs 7 jours précédents
  const last7Keys = Array.from({length:7}, (_,i) => localDateKey(addDays(now, -i)));
  const prev7Keys = Array.from({length:7}, (_,i) => localDateKey(addDays(now, -7-i)));
  const week = sumRange(dayMap, last7Keys);
  const prevWeek = sumRange(dayMap, prev7Keys);
  const weekRate = euroParHeure(week);

  $('perf-week-revenue').textContent = fmtEuroPerf(week.revenue);
  $('perf-week-rate').textContent = week.count > 0 ? fmtRatePerf(weekRate) : '—';
  $('perf-week-count').textContent = week.count;

  if(prevWeek.count === 0){
    $('perf-vs-lastweek').textContent = week.count > 0 ? 'Pas de données sur les 7 jours précédents pour comparer.' : '';
  } else {
    const diff = week.revenue - prevWeek.revenue;
    const pct = prevWeek.revenue > 0 ? Math.round((diff / prevWeek.revenue) * 100) : null;
    const sign = diff >= 0 ? '+' : '';
    $('perf-vs-lastweek').textContent = pct !== null
      ? `${sign}${pct}% vs les 7 jours précédents (${sign}${diff.toFixed(2)} €)`
      : `${sign}${diff.toFixed(2)} € vs les 7 jours précédents`;
  }

  // Statistiques globales
  const globalEl = $('perf-global-stats');
  if(rows.length === 0){
    globalEl.innerHTML = '<p class="hint">Pas encore de course validée.</p>';
  } else {
    const totalRevenue = rows.reduce((s,r) => s + r.revenue, 0);
    const totalDistance = rows.reduce((s,r) => s + r.distance, 0);
    const totalMinutes = rows.reduce((s,r) => s + r.durationMin, 0);
    const avgPerCourse = totalRevenue / rows.length;
    const avgDuration = totalMinutes / rows.length;

    const allDaysSorted = Object.entries(dayMap).sort((a,b) => b[1].revenue - a[1].revenue);
    const bestDay = allDaysSorted[0];

    globalEl.innerHTML = `
      <ul class="verdict-notes">
        <li>${rows.length} courses validées au total</li>
        <li>Moyenne par course : ${fmtEuroPerf(avgPerCourse)}</li>
        <li>Durée moyenne par course : ${Math.round(avgDuration)} min</li>
        <li>Distance totale parcourue : ${totalDistance.toFixed(1)} km</li>
        ${bestDay ? `<li>Meilleure journée : ${new Date(bestDay[0]).toLocaleDateString('fr-FR')} (${fmtEuroPerf(bestDay[1].revenue)})</li>` : ''}
      </ul>
    `;
  }
}

window.loadPerformances = loadPerformances;
