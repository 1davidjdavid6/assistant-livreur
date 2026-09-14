/* ============================================================
   Chronomètre 15 minutes — délai d'attente avant annulation
   Module isolé : ne dépend d'aucune autre partie de l'application.
   ============================================================ */

const TIMER_DEFAULT_DURATION = 900; // 15 minutes en secondes

/**
 * Crée une instance de chronomètre.
 * @param {Object} opts
 * @param {number} opts.remainingSeconds - temps restant initial
 * @param {function(number):void} opts.onTick - appelé chaque seconde avec le temps restant
 * @param {function(string):void} opts.onStateChange - appelé quand l'état change (normal|avertissement|alerte|expired)
 */
function createTimer({ remainingSeconds = TIMER_DEFAULT_DURATION, onTick, onStateChange } = {}){
  let remaining = Math.max(0, Math.floor(remainingSeconds));
  let intervalId = null;
  let running = false;
  let lastState = null;

  function computeState(){
    if(remaining <= 0) return 'expired';
    if(remaining <= 300) return 'alerte';        // moins de 5 min
    if(remaining <= 600) return 'avertissement';  // entre 5 et 10 min
    return 'normal';                              // plus de 10 min
  }

  function notifyState(){
    const state = computeState();
    if(state !== lastState){
      lastState = state;
      onStateChange && onStateChange(state);
    }
  }

  function tick(){
    if(remaining > 0){
      remaining -= 1;
    }
    if(remaining <= 0){
      remaining = 0; // ne jamais passer en négatif
      pause();
    }
    onTick && onTick(remaining);
    notifyState();
  }

  function start(){
    if(running || remaining <= 0) return;
    running = true;
    intervalId = setInterval(tick, 1000);
  }

  function pause(){
    running = false;
    if(intervalId){ clearInterval(intervalId); intervalId = null; }
  }

  function reset(newDuration = TIMER_DEFAULT_DURATION){
    pause();
    remaining = Math.max(0, Math.floor(newDuration));
    onTick && onTick(remaining);
    notifyState();
  }

  // état initial
  onTick && onTick(remaining);
  notifyState();

  return {
    start,
    pause,
    reset,
    isRunning: () => running,
    getRemaining: () => remaining,
    getState: computeState
  };
}

/**
 * Formate un nombre de secondes en 00:MM:SS (heures toujours à 00,
 * la durée max étant 15 minutes).
 */
function formatTimer(totalSeconds){
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `00:${mm}:${ss}`;
}

window.LivreurTimer = { createTimer, formatTimer, TIMER_DEFAULT_DURATION };
