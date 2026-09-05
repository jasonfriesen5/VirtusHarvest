// ══════════════════════════════════════════════════════════════════
//  MIX TIMER UI
//  A countdown on the weight screen while the mixer runs, and a guard
//  on unloading before it finishes. The guard does not block — an
//  operator with a reason must always be able to proceed — it makes
//  the choice visible and records who made it.
// ══════════════════════════════════════════════════════════════════

var _mixTick = null;

function startMixTicker(){
  if(_mixTick) return;
  _mixTick = setInterval(_paintMixTimer, 1000);
}
function stopMixTicker(){
  if(_mixTick){ clearInterval(_mixTick); _mixTick = null; }
}

function _paintMixTimer(){
  var host = document.getElementById('mix-timer');
  if(!host) return;

  var f = openFeeding();
  var running = f && f.mixStartedAt && f.mixRequiredSec > 0 && f.status !== 'delivering';
  if(!running){ host.style.display = 'none'; stopMixTicker(); return; }

  var left = mixRemainingSec(f);
  var done = left <= 0;
  host.style.display = '';
  host.className = 'mix-timer' + (done ? ' done' : '');
  host.innerHTML =
    '<div class="mix-lbl">' + esc(done ? T('Mixing complete') : T('Mixing')) + '</div>' +
    '<div class="mix-clock">' + (done ? '✓' : fmtMMSS(left)) + '</div>' +
    '<div class="mix-sub">' + esc(f.rationName || '') +
      (done ? '' : ' · ' + Math.round(f.mixRequiredSec/60) + ' min') + '</div>' +
    '<div class="mix-bar"><div class="mix-bar-fill" style="width:' +
      Math.min(100, ((f.mixRequiredSec - left) / f.mixRequiredSec) * 100).toFixed(1) + '%"></div></div>';

  if(done) stopMixTicker();
}

// ── Guard on unloading ───────────────────────────────────────────
// Wraps feedBeginDelivery. Returns without starting delivery if the mix is
// still running, and puts the decision in front of the operator instead.
function guardedBeginDelivery(){
  var f = openFeeding();
  if(!f){ return; }

  var left = mixRemainingSec(f);
  if(!f.mixRequiredSec || left <= 0){
    stampMixOutcome(f.id, false);
    feedBeginDelivery();
    _paintMixTimer();
    return;
  }

  document.getElementById('mix-warn-left').textContent = fmtMMSS(left);
  document.getElementById('mix-warn-sub').textContent =
    T('Under-mixed feed sorts in the bunk');
  document.getElementById('mix-warn-overlay').classList.add('open');
  _mixWarnTick();
}

var _mixWarnInt = null;
function _mixWarnTick(){
  if(_mixWarnInt) clearInterval(_mixWarnInt);
  _mixWarnInt = setInterval(function(){
    var f = openFeeding();
    var left = f ? mixRemainingSec(f) : 0;
    var el = document.getElementById('mix-warn-left');
    if(el) el.textContent = fmtMMSS(left);
    // Timer ran out while they were deciding — nothing left to warn about.
    if(left <= 0){ closeMixWarn(); guardedBeginDelivery(); }
  }, 1000);
}

function closeMixWarn(){
  if(_mixWarnInt){ clearInterval(_mixWarnInt); _mixWarnInt = null; }
  var ov = document.getElementById('mix-warn-overlay');
  if(ov) ov.classList.remove('open');
}

function keepMixing(){
  closeMixWarn();
  startMixTicker();
  _paintMixTimer();
}

function unloadAnyway(){
  var f = openFeeding();
  closeMixWarn();
  if(!f) return;
  // Recorded against the operator, and it is their name on it — which is the
  // point: the app does not stop them, it just stops the choice being invisible.
  stampMixOutcome(f.id, true);
  feedBeginDelivery();
  _paintMixTimer();
  showToast(T('Unloaded before mixing finished'), 'warn');
}

// ── Operator roll-ups live on the desktop ────────────────────────
// renderOperatorMixStats() and renderOperatorPunctuality() used to draw the
// 30-day mixing and punctuality cards on this screen. They moved to the web
// console: the app weighs, records and stamps the timings, while reading those
// back as a per-operator score is a management view, and management lives on
// the desktop. The stamps themselves (stampMixOutcome, stampDeliveryTiming)
// stay exactly where they are — the console cannot compute anything without
// them.
