// ══════════════════════════════════════════════════════════════════
//  FEED FLOW UI — load the mixer, then discharge into pens.
//  Design rule: the operator confirms, never types. Every number on
//  these two screens comes off the scale.
// ══════════════════════════════════════════════════════════════════

var _feed = {
  id: null,          // active feeding id
  phase: null,       // 'load' | 'deliver'
  stepIdx: 0,        // which ingredient / which lot
  anchorKg: 0        // mixer weight when the current step began
};

// Weight added (loading) or removed (delivering) since this step started.
// A mixer isn't emptied between ingredients, so every step is a delta, not a tare.
function _stepKg(){
  if(rawWeight === null || rawWeight === undefined) return 0;
  var d = (_feed.phase === 'deliver') ? (_feed.anchorKg - rawWeight) : (rawWeight - _feed.anchorKg);
  return Math.max(0, d);
}

function _anchorHere(){ _feed.anchorKg = (rawWeight === null || rawWeight === undefined) ? 0 : rawWeight; }

// ── Entry point: what should this operator be doing right now? ────
function renderFeedTab(){
  var host = document.getElementById('feed-body');
  if(!host) return;

  var f = openFeeding();
  if(!f){ _feed.id = null; _feed.phase = null; host.innerHTML = _feedIdleHtml(); return; }

  if(_feed.id !== f.id){                       // resuming after a reload
    _feed.id = f.id;
    _feed.phase = f.status === 'delivering' ? 'deliver' : 'load';
    _feed.stepIdx = _firstUnfinished(f);
    _anchorHere();
  }
  host.innerHTML = _feed.phase === 'deliver' ? _deliverHtml(f) : _loadHtml(f);
  _paintFeedStep();
}

function _firstUnfinished(f){
  var rows = f.status === 'delivering' ? deliveriesFor(f.id) : loadsFor(f.id);
  var i = rows.findIndex(function(r){ return r.actualKg === null || r.actualKg === undefined; });
  return i === -1 ? Math.max(0, rows.length - 1) : i;
}

// ── Idle: pick a ration + pens, or resume ─────────────────────────
function _feedIdleHtml(){
  var lots    = cycleLots();
  var rations = getRations().filter(function(r){ return r.active !== false; });

  if(!activeCycleId) return _emptyCard('🗓️', T('No cycle yet'), T('Create a feeding cycle to start recording.'), "openAddCycleSheet()", T('New Cycle'));
  if(!rations.length) return _emptyCard('📋', T('No rations yet'), T('Add the diet your nutritionist prescribed.'), "openRationSheet()", T('New Ration'));
  if(!lots.length)    return _emptyCard('🐂', T('No lots yet'), T('Add the lots you feed.'), "openLotSheet()", T('New Lot'));

  var today = cycleFeedings().filter(function(f){
    return f.startedAt && new Date(f.startedAt).toDateString() === new Date().toDateString();
  });
  var meal = _currentMeal();

  return '' +
  '<div class="card">' +
    '<div class="card-head"><div class="card-title">' + esc(T(meal === 'AM' ? 'Morning feeding' : 'Afternoon feeding')) + '</div></div>' +
    '<div class="card-body">' +
      '<div class="feed-pick-row" onclick="openFeedRationPicker()">' +
        '<div class="fsc-label">' + esc(T('Ration')) + '</div>' +
        '<div class="fsc-value" id="feed-ration-name">' + esc(_pickedRationName()) + '</div>' +
        '<div class="fsc-arrow">›</div>' +
      '</div>' +
      '<div class="feed-pick-row" onclick="openFeedLotPicker()">' +
        '<div class="fsc-label">' + esc(T('Lots')) + '</div>' +
        '<div class="fsc-value" id="feed-lot-count">' + _pickedLotsLabel() + '</div>' +
        '<div class="fsc-arrow">›</div>' +
      '</div>' +
      '<button class="btn-gold-lg" onclick="startFeedingFromPicker()">' + esc(T('Start Feeding')) + '</button>' +
    '</div>' +
  '</div>' +
  (today.length ? _todaySummaryHtml(today) : '');
}

function _emptyCard(icon, title, sub, action, cta){
  return '<div class="card"><div class="card-body" style="text-align:center;padding:32px 20px;">' +
    '<div style="font-size:40px;margin-bottom:10px;">' + icon + '</div>' +
    '<div style="font-size:17px;font-weight:700;margin-bottom:6px;">' + esc(title) + '</div>' +
    '<div style="font-size:14px;color:var(--text3);margin-bottom:18px;">' + esc(sub) + '</div>' +
    '<button class="btn-gold" onclick="' + action + '">' + esc(cta) + '</button>' +
  '</div></div>';
}

// ── Selection held between picker taps ───────────────────────────
var _pick = { groupId: null, rationId: null, lotIds: [] };

function _pickedRationName(){
  var r = rationById(_pick.rationId);
  return r ? r.name : T('Choose…');
}
function _pickedLotsLabel(){
  if(!_pick.lotIds.length) return esc(T('Choose…'));
  var head = _pick.lotIds.reduce(function(s,id){ var l = lotById(id); return s + ((l && l.headCount) || 0); }, 0);
  return esc(_pick.lotIds.length + ' ' + T('lots') + ' · ' + head + ' ' + T('head'));
}

function openFeedRationPicker(){
  var rs = getRations().filter(function(r){ return r.active !== false; });
  _wheelOpen({
    title: T('Ration'),
    items: rs.map(function(r){ return r.name; }),
    selected: _pickedRationName(),
    onConfirm: function(name){
      var r = rs.find(function(x){ return x.name === name; });
      _pick.rationId = r ? r.id : null;
      renderFeedTab();
    }
  });
}

function openFeedLotPicker(){
  var lots = cycleLots().sort(function(a,b){ return (a.routeOrder||0)-(b.routeOrder||0); });
  var body = lots.map(function(l){
    var on = _pick.lotIds.indexOf(l.id) !== -1;
    return '<div class="farm-sel-row" onclick="_toggleFeedLot(\'' + l.id + '\',this)">' +
      '<div class="farm-sel-check' + (on ? ' on' : '') + '">' + (on ? '✓' : '') + '</div>' +
      '<div><div class="farm-sel-name">' + esc(l.name) + '</div>' +
      '<div class="fi-sub">' + (l.headCount||0) + ' ' + esc(T('head')) + '</div></div></div>';
  }).join('');
  document.getElementById('farm-sel-body').innerHTML = body || '<div class="fdp-empty">' + esc(T('No lots')) + '</div>';
  document.getElementById('farm-sel-overlay').classList.add('open');
}

function _toggleFeedLot(id, el){
  var i = _pick.lotIds.indexOf(id);
  if(i === -1) _pick.lotIds.push(id); else _pick.lotIds.splice(i,1);
  var chk = el.querySelector('.farm-sel-check');
  chk.classList.toggle('on');
  chk.textContent = chk.classList.contains('on') ? '✓' : '';
  renderFeedTab();
}

function startFeedingFromPicker(){
  if(!_pick.rationId){ showToast(T('Choose a ration first'), 'warn'); return; }
  if(!_pick.lotIds.length){ showToast(T('Choose at least one lot'), 'warn'); return; }

  var lots = _pick.lotIds.map(lotById).filter(Boolean);
  var mixer = getMixers().find(function(m){ return m.id === _activeMixerId; });
  var f = startFeeding({ groupId: _pick.groupId, rationId: _pick.rationId, lots: lots,
                         mixerId: _activeMixerId, mixerName: mixer ? mixer.name : '' });

  _feed = { id: f.id, phase: 'load', stepIdx: 0, anchorKg: 0 };
  _anchorHere();
  renderFeedTab();
}

// ── LOAD sheet ───────────────────────────────────────────────────
// One bar per ingredient, all visible at once, so the operator can see the
// whole mix taking shape rather than a single step in isolation. The active
// row carries the live weight; the rest show what they landed on.
function _loadHtml(f){
  var rows = loadsFor(f.id);
  if(!rows.length || _feed.stepIdx >= rows.length) return _loadDoneHtml(f);

  return '' +
  '<div class="card">' +
    '<div class="card-head">' +
      '<div class="card-title">' + esc(f.rationName || T('Loading')) + '</div>' +
      '<div class="fi-sub">' + Math.round(f.totalLoadedKg||0) + ' kg</div>' +
    '</div>' +
    '<div class="card-body" style="padding:14px 4px 4px;">' +
      '<button class="btn-gold-lg" onclick="openLoadSheet()">' + esc(T('Add products')) + '</button>' +
    '</div>' +
  '</div>' +
  _loadRowsHtml(rows, false);
}

// Shared by the card preview and the sheet itself.
function _loadRowsHtml(rows, live){
  return '<div class="loadbars">' + rows.map(function(r, i){
    var active = live && i === _feed.stepIdx;
    var kg  = active ? _stepKg() : (r.actualKg || 0);
    var st  = loadBarState(kg, r.targetKg, tolFor(r.ingredientId));
    var done = r.actualKg !== null && r.actualKg !== undefined;

    return '<div class="loadbar' + (active ? ' active' : '') + (done ? ' done' : '') +
             (r.manual ? ' manual' : '') + '"' +
             (live ? ' onclick="feedGoStep(' + i + ')"' : '') + '>' +
      '<div class="loadbar-top">' +
        '<div class="loadbar-name">' + (done ? '✓ ' : '') + esc(r.ingredientName) +
          (r.manual ? ' <span class="loadbar-hand">' + esc(T('by hand')) + '</span>' : '') + '</div>' +
        '<div class="loadbar-pct ' + (r.manual ? '' : st.zone) + '">' +
          (r.manual ? Math.round(r.targetKg) + ' kg' : Math.round(st.pct) + '%') + '</div>' +
      '</div>' +
      (r.manual
        ? '<div class="loadbar-track"><div class="loadbar-fill good" style="width:' +
            (done ? '100' : '0') + '%"></div></div>'
        : '<div class="loadbar-track">' +
            // Tick marks the 100%-of-target point at 75% of the bar, so "full"
            // and "on target" are visibly different places.
            '<div class="loadbar-tick"></div>' +
            '<div class="loadbar-fill ' + st.zone + '" style="width:' + st.fill.toFixed(1) + '%"></div>' +
          '</div>') +
      '<div class="loadbar-bot">' +
        '<span class="loadbar-kg">' + Math.round(kg) + ' / ' + Math.round(r.targetKg) + ' kg</span>' +
        '<span class="loadbar-tol">±' + Math.round(tolFor(r.ingredientId) - 100) + '%</span>' +
      '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function openLoadSheet(){
  var ov = document.getElementById('load-sheet-overlay');
  if(!ov) return;
  _anchorHere();
  ov.classList.add('open');
  _renderLoadSheet();
}

function closeLoadSheet(){
  var ov = document.getElementById('load-sheet-overlay');
  if(ov) ov.classList.remove('open');
  renderFeedTab();
}

function _loadSheetOpen(){
  var ov = document.getElementById('load-sheet-overlay');
  return !!(ov && ov.classList.contains('open'));
}

function _renderLoadSheet(){
  if(!_feed.id) return;
  if(typeof _paintMixTimer === 'function') _paintMixTimer();
  var rows = loadsFor(_feed.id);
  var cur  = rows[_feed.stepIdx];

  var head = document.getElementById('load-sheet-head');
  if(head){
    head.innerHTML = cur
      ? '<div class="feed-step-kicker">' + esc(T('Loading')) + ' · ' + (_feed.stepIdx+1) + '/' + rows.length + '</div>' +
        '<div class="feed-step-name">' + esc(cur.ingredientName) + '</div>'
      : '<div class="feed-step-name">' + esc(T('Mixer loaded')) + '</div>';
  }

  var big = document.getElementById('load-sheet-big');
  if(big) big.style.display = cur ? '' : 'none';

  var body = document.getElementById('load-sheet-body');
  if(body) body.innerHTML = _loadRowsHtml(rows, true);

  var next = document.getElementById('load-sheet-next');
  if(next) next.textContent = (_feed.stepIdx >= rows.length - 1) ? T('Finish loading') : T('Next');

  _paintFeedStep();
}

function _loadDoneHtml(f){
  return '<div class="card"><div class="card-body" style="text-align:center;padding:28px 20px;">' +
    '<div style="font-size:40px;">✅</div>' +
    '<div style="font-size:19px;font-weight:800;margin:8px 0 4px;">' + esc(T('Mixer loaded')) + '</div>' +
    '<div class="feed-total">' + Math.round(f.totalLoadedKg) + ' kg</div>' +
    '<button class="btn-gold-lg" style="margin-top:18px;" onclick="guardedBeginDelivery()">' + esc(T('Start Delivering')) + '</button>' +
  '</div></div>' +
  _loadRowsHtml(loadsFor(f.id), false);
}

// ── DELIVER screen ───────────────────────────────────────────────
function _deliverHtml(f){
  var rows = deliveriesFor(f.id);
  var cur  = rows[_feed.stepIdx];
  if(!cur) return _feedSummaryHtml(f);

  return '' +
  '<div class="feed-step deliver">' +
    '<div class="feed-step-head">' +
      '<div class="feed-step-kicker">' + esc(T('Delivering')) + ' · ' + (_feed.stepIdx+1) + '/' + rows.length + '</div>' +
      '<div class="feed-step-name">' + esc(cur.lotName) + '</div>' +
      '<div class="feed-step-sub">' + cur.headCount + ' ' + esc(T('head')) + '</div>' +
    '</div>' +

    '<div class="load-onmixer" id="deliver-onmixer"></div>' +
    '<div class="feed-big" id="feed-big">0</div>' +
    '<div class="feed-big-unit">' + esc(T('of')) + ' <b id="feed-target">' + Math.round(cur.targetKg) + '</b> kg</div>' +
    '<div class="load-remaining" id="deliver-remaining"></div>' +

    '<div class="feed-bar-track"><div class="feed-bar-fill" id="feed-bar"></div></div>' +
    '<div class="feed-bar-note" id="feed-note">—</div>' +

    '<div class="feed-actions">' +
      '<button class="feed-btn feed-btn-skip" onclick="feedSkipStep()">' + esc(T('Skip')) + '</button>' +
      '<button class="feed-btn feed-btn-ok" id="feed-confirm" onclick="feedConfirmStep()">' + esc(T('Confirm')) + '</button>' +
    '</div>' +

    '<div class="feed-steplist">' + rows.map(function(r,i){
      var st = (r.actualKg !== null && r.actualKg !== undefined) ? 'done' : (i === _feed.stepIdx ? 'now' : '');
      return '<div class="feed-steprow ' + st + '" onclick="feedGoStep(' + i + ')">' +
        '<div class="feed-steprow-name">' + esc(r.lotName) + '</div>' +
        '<div class="feed-steprow-kg">' + (st === 'done' ? Math.round(r.actualKg) + ' kg' : Math.round(r.targetKg) + ' kg') + '</div>' +
      '</div>';
    }).join('') + '</div>' +
  '</div>';
}

// ── Live paint — called from the BLE weight handler ──────────────
function _paintFeedStep(){
  // The return sheet borrows the same live-weight path rather than adding a
  // second BLE listener.
  if(typeof _paintReturn === 'function' &&
     document.getElementById('ret-weigh-overlay') &&
     document.getElementById('ret-weigh-overlay').classList.contains('open')){
    _paintReturn();
    return;
  }
  if(!_feed.id) return;

  var rows = _feed.phase === 'deliver' ? deliveriesFor(_feed.id) : loadsFor(_feed.id);
  var cur  = rows[_feed.stepIdx];
  if(!cur) return;

  var kg = _stepKg();

  if(_feed.phase === 'load' && _loadSheetOpen()){ _paintLoadSheet(rows, cur, kg); return; }
  _paintDeliverStep(cur, kg);
}

// Loading: repaint only the active bar's geometry on each reading. Rebuilding
// the whole list here would fight the operator's scroll position at 10 Hz.
function _paintLoadSheet(rows, cur, kg){
  // Hand-added line: the scale cannot see this amount, so showing a live weight
  // and a tolerance bar would be theatre. Show the dose and let them confirm.
  if(cur.manual){
    var bigM = document.getElementById('load-sheet-big');
    if(bigM) bigM.textContent = Math.round(rawWeight || 0);
    var tgtM = document.getElementById('load-sheet-target');
    if(tgtM) tgtM.textContent = Math.round(feedingTargetKg(_feed.id));
    var remM = document.getElementById('load-sheet-remaining');
    if(remM) remM.textContent = esc(T('Add by hand')) + ': ' + Math.round(cur.targetKg) + ' kg';
    var noteM = document.getElementById('load-sheet-note');
    if(noteM){
      noteM.textContent = T('Add by hand, then confirm');
      noteM.className = 'feed-bar-note manual';
    }
    var btnM = document.getElementById('load-sheet-next');
    if(btnM) btnM.classList.remove('waiting');   // nothing to wait for
    return;
  }

  var st = loadBarState(kg, cur.targetKg, tolFor(cur.ingredientId));

  // The headline is how full the MIXER is, not how far into one ingredient we
  // are — that is what the operator is actually watching as he loads.
  var big = document.getElementById('load-sheet-big');
  if(big) big.textContent = Math.round(rawWeight || 0);

  var tgt = document.getElementById('load-sheet-target');
  if(tgt) tgt.textContent = Math.round(feedingTargetKg(_feed.id));

  var el = document.querySelector('#load-sheet-body .loadbar.active');
  if(el){
    var fill = el.querySelector('.loadbar-fill');
    if(fill){ fill.style.width = st.fill.toFixed(1) + '%'; fill.className = 'loadbar-fill ' + st.zone; }
    var pct = el.querySelector('.loadbar-pct');
    if(pct){ pct.textContent = Math.round(st.pct) + '%'; pct.className = 'loadbar-pct ' + st.zone; }
    var kgl = el.querySelector('.loadbar-kg');
    if(kgl) kgl.textContent = Math.round(kg) + ' / ' + Math.round(cur.targetKg) + ' kg';
  }

  var rem = document.getElementById('load-sheet-remaining');
  if(rem){
    var left = feedingRemainingLoadKg(_feed.id, kg, cur.id);
    rem.textContent = left > 0
      ? T('Still to load') + ': ' + Math.round(left) + ' kg'
      : T('Load complete');
    rem.className = 'load-remaining' + (left > 0 ? '' : ' done');
  }

  var note = document.getElementById('load-sheet-note');
  if(note){
    var d = kg - cur.targetKg;
    // Only the states the bar cannot show on its own. A second "X kg to go"
    // here sat right next to the whole-load figure above and read as a
    // contradiction — the active row's own bar already carries that number.
    note.textContent = !weightStable ? T('Stabilising…')
                     : st.zone === 'over' ? Math.round(d) + ' kg ' + T('over')
                     : st.zone === 'good' ? T('In tolerance')
                     : '';
    note.className = 'feed-bar-note ' + (st.zone === 'good' ? 'good' : st.zone === 'over' ? 'over' : '');
  }

  // Deliberately NOT disabled on instability. The reading is right there on
  // screen; if the operator judges it good enough, the app has no business
  // trapping them — and a stability flag that never arrives (dead sensor, odd
  // firmware) would otherwise make the whole flow impossible to finish.
  // Show the state instead of enforcing it.
  var btn = document.getElementById('load-sheet-next');
  if(btn) btn.classList.toggle('waiting', !weightStable);
}

// Delivering still uses the simple single-bar screen: the operator is watching
// the mixer empty into one pen, not composing a mix.
function _paintDeliverStep(cur, kg){
  var big = document.getElementById('feed-big');
  if(!big) return;

  var tgt = cur.targetKg || 0;
  var pct = tgt ? Math.min(150, (kg / tgt) * 100) : 0;
  big.textContent = Math.round(kg);

  // What is still on the mixer, and what still has to come off it.
  var onMixer = document.getElementById('deliver-onmixer');
  if(onMixer) onMixer.textContent = T('On the mixer') + ': ' + Math.round(rawWeight || 0) + ' kg';

  var rem = document.getElementById('deliver-remaining');
  if(rem){
    var left = feedingRemainingUnloadKg(_feed.id, kg, cur.id);
    var empty = isMixerEmpty(rawWeight);
    rem.textContent = empty ? T('Mixer empty')
                    : left > 0 ? T('Still to unload') + ': ' + Math.round(left) + ' kg'
                    : T('All lots served');
    rem.className = 'load-remaining' + (empty || left <= 0 ? ' done' : '');
  }

  var bar = document.getElementById('feed-bar');
  if(bar){
    bar.style.width = Math.min(100, pct) + '%';
    bar.className = 'feed-bar-fill' + (pct >= 97 && pct <= 103 ? ' good' : pct > 103 ? ' over' : '');
  }

  var note = document.getElementById('feed-note');
  if(note){
    var d = kg - tgt;
    // Same rule as loading: the bar and the "still to unload" line above already
    // carry the shortfall, so repeating it here just puts two different numbers
    // next to each other.
    note.textContent = Math.abs(d) < 1 ? T('On target')
      : (d > 0 ? '+' + Math.round(d) + ' kg ' + T('over') : '');
    note.className = 'feed-bar-note' + (Math.abs(d) <= tgt*0.03 ? ' good' : d > 0 ? ' over' : '');
  }

  var btn = document.getElementById('feed-confirm');
  if(btn) btn.classList.toggle('waiting', !weightStable);
}

// ── Step navigation ──────────────────────────────────────────────
function feedConfirmStep(){
  if(!_feed.id) return;
  var rows = _feed.phase === 'deliver' ? deliveriesFor(_feed.id) : loadsFor(_feed.id);
  var cur  = rows[_feed.stepIdx];
  if(!cur) return;

  // Unloading can ask the operator to confirm the pen's head count first.
  // Everything per-head downstream — intake, gain — divides by that number, and
  // it is the one fact only the person standing at the bunk actually knows. It
  // is per-pen and OFF by default: prompting on every pen every time is how a
  // confirmation gets tapped through without anyone looking at the cattle.
  if(_feed.phase === 'deliver'){
    var _lot = lotById(cur.lotId);
    if(_lot && _lot.confirmHeadCount){ openUnloadConfirm(cur); return; }
  }
  _commitStep(cur, _stepKg(), null);
}

function _commitStep(cur, kg, opts){
  if(_feed.phase === 'deliver') recordDelivery(_feed.id, cur.id, kg, opts);
  else                          recordLoad(_feed.id, cur.id, kg);

  _anchorHere();                              // next step measures from here
  _feed.stepIdx++;
  // recordLoad() starts the mixer once every ingredient is in; pick that up.
  if(typeof startMixTicker === 'function' && _feed.phase === 'load'){
    var _f = openFeeding();
    if(_f && _f.mixStartedAt) startMixTicker();
  }
  showToast((_feed.phase === 'deliver' ? cur.lotName : cur.ingredientName) + ' · ' + Math.round(kg) + ' kg', 'success');

  // Loading happens inside the sheet — closing it on every ingredient would
  // throw the operator back to the tab between each one.
  if(_feed.phase === 'load' && _loadSheetOpen()){
    if(_feed.stepIdx >= loadsFor(_feed.id).length){ closeLoadSheet(); return; }
    _renderLoadSheet();
    return;
  }
  if(_activeTab === 'display' && typeof renderMainStage === 'function'){ renderMainStage(); return; }
  renderFeedTab();
}

function feedSkipStep(){
  _anchorHere(); _feed.stepIdx++;
  if(_feed.phase === 'load' && _loadSheetOpen()){ _renderLoadSheet(); return; }
  if(_activeTab === 'display' && typeof renderMainStage === 'function'){ renderMainStage(); return; }
  renderFeedTab();
}
function feedGoStep(i){
  // Tapping the pen you are ALREADY on must not re-anchor. _anchorHere() resets
  // the zero the step measures from, so 200 kg already dropped into this pen
  // silently became 0 — the operator's own progress wiped by touching the row
  // that was showing it.
  if(i === _feed.stepIdx) return;
  _feed.stepIdx = i; _anchorHere();
  if(_feed.phase === 'load' && _loadSheetOpen()){ _renderLoadSheet(); return; }
  if(_activeTab === 'display' && typeof renderMainStage === 'function'){ renderMainStage(); return; }
  renderFeedTab();
}

function feedBeginDelivery(){
  var f = getFeedings().find(function(x){ return x.id === _feed.id; });
  if(!f) return;
  // f.lotIds is selection order, not route order. Sort by the group's own
  // sequence so the operator drives the pens in the order they arranged.
  var lots = orderLotsForGroup((f.lotIds||[]).map(lotById).filter(Boolean), f.groupId);
  beginDelivery(f.id, lots);
  _feed.phase = 'deliver';
  _feed.stepIdx = 0;
  _anchorHere();
  if(_activeTab === 'display' && typeof renderMainStage === 'function'){ renderMainStage(); return; }
  renderFeedTab();
}

// Back out of a feeding so a different group can be started. States the
// consequence first: feed already in the mixer stays consumed, because it is.
async function feedCancel(){
  var f = openFeeding();
  if(!f){ showToast(T('Nothing to cancel'), 'warn'); return; }
  var imp = cancelImpact(f.id);

  var msg = imp.clean
    ? T('Nothing has been loaded yet, so nothing is affected.')
    : Math.round(imp.residualKg) + ' kg ' + T('is already in the mixer.') + ' ' +
      T('That feed stays counted as used — it left the store. Empty or unload the mixer before loading another group.');

  var ok = await showConfirm(msg, T('Cancel this load?'), '🚜');
  if(!ok) return;

  cancelFeeding(f.id);
  _feed = { id:null, phase:null, stepIdx:0, anchorKg:0 };
  showToast(T('Load cancelled'), 'warn');

  // Leave the group picker alone: changing group is usually the whole reason
  // for cancelling, and clearing it would make them choose twice.
  if(_activeTab === 'display' && typeof renderMainStage === 'function'){
    renderMainStage();
    if(typeof _paintHomeStatus === 'function') _paintHomeStatus();
  } else {
    renderFeedTab();
  }
}

function feedFinish(){
  if(!_feed.id) return;
  var f = finishFeeding(_feed.id);
  _feed = { id:null, phase:null, stepIdx:0, anchorKg:0 };
  _pick = { groupId:null, rationId:null, lotIds:[] };
  showToast(T('Feeding recorded'), 'success');

  // A finished feeding is the record this whole app exists to produce — push it
  // now rather than waiting for someone to remember the sync button. autoSync()
  // is no help: it only fires when the weighings queue is non-empty, which Feed
  // never uses, so finishing used to leave everything sitting on the tablet.
  //
  // Push only, not a full sync: pulling here would be slow, would toast over
  // the confirmation, and there is nothing to pull that matters at this moment.
  // Offline is not an error — the rows stay dirty and the unsynced pill shows
  // the count, so an error toast in a yard with no signal would just be noise.
  if(typeof isOnline !== 'undefined' && isOnline && typeof syncQueue === 'function'){
    Promise.resolve(syncQueue()).catch(function(e){
      console.warn('[feed] sync after finishing failed:', e);
    });
  }
  // The main display hosts the walkthrough now, so it has to be handed back to
  // its idle state — otherwise the finished summary and "Listo" stay on screen
  // with the pens gone.
  if(_activeTab === 'display' && typeof renderMainStage === 'function'){
    if(typeof renderRationPicker === 'function') renderRationPicker();
    renderMainStage();
    if(typeof _paintHomeStatus === 'function') _paintHomeStatus();
  } else {
    renderFeedTab();
  }
  return f;
}

// ── Summary after the last pen ───────────────────────────────────
function _feedSummaryHtml(f){
  var loaded = f.totalLoadedKg || 0, delivered = f.totalDeliveredKg || 0;
  var lost = loaded - delivered;

  return '<div class="card"><div class="card-body" style="text-align:center;padding:26px 20px;">' +
    '<div style="font-size:40px;">🐂</div>' +
    '<div style="font-size:19px;font-weight:800;margin:8px 0 14px;">' + esc(T('Feeding complete')) + '</div>' +
    '<div class="fdp-stats">' +
      _stat(T('Loaded'), Math.round(loaded) + ' kg') +
      _stat(T('Delivered'), Math.round(delivered) + ' kg') +
      _stat(T('Difference'), (lost >= 0 ? '' : '+') + Math.round(-lost) + ' kg') +
    '</div>' +
    '<button class="btn-gold-lg" style="margin-top:18px;" onclick="feedFinish()">' + esc(T('Done')) + '</button>' +
  '</div></div>';
}

function _stat(lbl, val){
  return '<div class="fdp-stat"><div class="fdp-stat-val">' + esc(String(val)) + '</div>' +
         '<div class="fdp-stat-lbl">' + esc(lbl) + '</div></div>';
}

function _money(v){
  // Guaraní has no cents and big numbers — thousands separators do the work.
  return '₲ ' + Math.round(v||0).toLocaleString('es-PY');
}

function _todaySummaryHtml(list){
  return '<div class="card"><div class="card-head"><div class="card-title">' + esc(T('Today')) + '</div></div>' +
    '<div class="card-body">' + list.map(function(f){
      return '<div class="log-item"><div class="log-item-body">' +
        '<div class="log-item-title">' + esc(f.rationName || T('Feeding')) + ' · ' + esc(f.meal) + '</div>' +
        '<div class="log-sub">' + Math.round(f.totalDeliveredKg||0) + ' kg</div>' +
      '</div></div>';
    }).join('') + '</div></div>';
}


// ── Unload confirmation ──────────────────────────────────────────
var _unloadCur = null;

function openUnloadConfirm(cur){
  _unloadCur = cur;
  var lot = lotById(cur.lotId) || {};
  var kg  = _stepKg();

  document.getElementById('uc-lot').textContent = cur.lotName;
  document.getElementById('uc-kg').textContent  = Math.round(kg) + ' kg';
  document.getElementById('uc-head').value      = (lot.headCount || cur.headCount || 0);
  document.getElementById('uc-weight').value    = lot.avgWeightKg || '';
  _ucRecalc();
  document.getElementById('uc-overlay').classList.add('open');
}

function closeUnloadConfirm(){
  document.getElementById('uc-overlay').classList.remove('open');
  _unloadCur = null;
}

// The whole point of the sheet: show what each animal actually gets, live, as
// the operator corrects the head count.
function _ucRecalc(){
  if(!_unloadCur) return;
  var kg   = _stepKg();
  var head = parseInt(document.getElementById('uc-head').value, 10) || 0;
  var wt   = parseFloat(document.getElementById('uc-weight').value) || 0;

  var perHead = head ? kg / head : 0;
  document.getElementById('uc-perhead').textContent = head ? perHead.toFixed(1) + ' kg' : '—';

  // Intake as % of bodyweight is how a nutritionist sanity-checks a ration, and
  // it is always DRY MATTER — finishing cattle sit near 2-3%. Using the as-fed
  // figure on a wet silage ration reads about double that and looks alarming
  // for no reason, so convert with the mix's own DM fraction.
  var pctBw = document.getElementById('uc-pctbw');
  if(pctBw){
    var dmFrac = mixDryMatterFraction(_feed.id);
    if(wt > 0 && head && dmFrac){
      var dmPerHead = perHead * dmFrac;
      pctBw.textContent = dmPerHead.toFixed(1) + ' kg ' + T('DM') + ' · ' +
                          ((dmPerHead / wt) * 100).toFixed(1) + '% ' + T('of bodyweight');
    } else { pctBw.textContent = ''; }
  }
}

function confirmUnload(){
  if(!_unloadCur) return;
  var cur  = _unloadCur;
  var head = parseInt(document.getElementById('uc-head').value, 10) || 0;
  var wt   = parseFloat(document.getElementById('uc-weight').value) || null;

  if(head <= 0){ showToast(T('Enter how many head are in this lot'), 'warn'); return; }

  var kg = _stepKg();
  closeUnloadConfirm();
  _commitStep(cur, kg, { headCount: head, avgWeightKg: wt });
}
