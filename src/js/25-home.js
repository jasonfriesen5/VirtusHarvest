// ══════════════════════════════════════════════════════════════════
//  HOME EXTRAS — the inline ration picker and the transactions list.
// ══════════════════════════════════════════════════════════════════

// ── Inline rotating ration picker ────────────────────────────────
// Sits directly under the Load button because it decides what that button
// does. Scroll-snap rather than a modal wheel: the operator can see the
// choice without a tap, and change it with a flick wearing gloves.
// The group is now chosen from a sheet rather than a horizontal strip — the
// right-hand column is too narrow for a scroller, and a sheet shows more of
// each group anyway.
function renderRationPicker(){
  var groups = cycleGroups();

  if(groups.length && (!_pick.groupId || !groups.some(function(g){ return g.id === _pick.groupId; }))){
    // Default to the group with the most head behind it — the main mix.
    var best = groups.slice().sort(function(a,b){ return _groupHead(b.id) - _groupHead(a.id); })[0];
    _pick.groupId  = best.id;
    _pick.rationId = best.rationId;
  }

  var nameEl = document.getElementById('md-group-name');
  var subEl  = document.getElementById('md-group-sub');
  var g = _pick.groupId ? groupById(_pick.groupId) : null;

  if(nameEl) nameEl.textContent = g ? g.name : T('Tap to choose');
  if(nameEl) nameEl.classList.toggle('unset', !g);
  if(subEl){
    if(!g){ subEl.textContent = ''; }
    else {
      var lots = lotsInGroup(g.id);
      var head = lots.reduce(function(s,l){ return s + (l.headCount||0); }, 0);
      subEl.textContent = lots.length + ' ' + T('lots') + ' · ' + head + ' ' + T('head');
    }
  }
  renderMainPens();
}

// ── Group picker sheet ───────────────────────────────────────────
function openGroupPicker(){
  var groups = cycleGroups();
  if(!groups.length){ openGroupsPanel(); return; }

  document.getElementById('gpick-body').innerHTML = groups.map(function(g){
    var lots = lotsInGroup(g.id);
    var head = lots.reduce(function(s,l){ return s + (l.headCount||0); }, 0);
    var on = g.id === _pick.groupId;
    // Choosing a feed group picks ONE, so a checkbox was the wrong control —
    // it promises multi-select. The row itself carries the state instead:
    // tinted, accent-edged and bolder when current.
    return '<div class="gsel-row' + (on ? ' on' : '') + '" onclick="pickGroup(\'' + g.id + '\');closeGroupPicker();">' +
      '<div class="gsel-main">' +
        '<div class="gsel-name">' + esc(g.name) + '</div>' +
        '<div class="gsel-sub">' + esc((rationById(g.rationId)||{}).name || T('No ration')) +
          ' · ' + head + ' ' + esc(T('head')) + '</div>' +
      '</div>' +
      '<div class="gsel-kg">' +
        '<div class="gsel-kg-val">' + Math.round(groupLoadKg(g.id)).toLocaleString('es-PY') + ' kg</div>' +
        '<div class="gsel-kg-lbl">' + esc(T('per load')) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  document.getElementById('gpick-overlay').classList.add('open');
}

function closeGroupPicker(){ document.getElementById('gpick-overlay').classList.remove('open'); }

// ══ MAIN-DISPLAY STAGE ══
// Loading and unloading walk through here, under the big weight, rather than in
// a sheet that carried its own copy of the readout. One weight on screen, one
// place to look. Idle shows the pens; mid-feeding they become the step list.
function renderMainStage(){
  var step = document.getElementById('md-step');
  if(!step) return;
  var f = openFeeding();

  // Not mid-feeding, or this device is not the one driving it.
  if(!f || !_feed || _feed.id !== f.id){
    step.innerHTML = '';
    renderMainPens();
    _paintMainActions(null);
    return;
  }

  var deliver = (_feed.phase === 'deliver');
  var rows = deliver ? deliveriesFor(f.id) : loadsFor(f.id);
  var cur  = rows[_feed.stepIdx];

  if(!cur){
    // Every line done: hand over to the phase's own finish action.
    step.innerHTML =
      '<div class="ms-head"><div class="ms-name">' +
        esc(deliver ? T('Feeding complete') : T('Mixer loaded')) + '</div>' +
      '<div class="ms-sub">' + Math.round(deliver ? (f.totalDeliveredKg||0) : (f.totalLoadedKg||0)) + ' kg</div></div>';
    document.getElementById('md-pens').innerHTML = deliver
      ? _stageRowsDeliver(rows) : _loadRowsHtml(rows, true);
    _paintMainActions(deliver ? 'finish-deliver' : 'finish-load');
    return;
  }

  // The bar here tracks the WHOLE batch, not the ingredient in hand — the row
  // below already shows that, and repeating it wasted the one place that could
  // answer "how full is the mixer". The active line's over/under moves up
  // beside its name, where it belongs.
  step.innerHTML =
    '<div class="ms-head">' +
      '<div class="ms-kicker">' + esc(deliver ? T('Delivering') : T('Loading')) +
        ' · ' + (_feed.stepIdx+1) + '/' + rows.length + '</div>' +
      '<div class="ms-name">' + esc(deliver ? cur.lotName : cur.ingredientName) + '</div>' +
      '<div class="feed-bar-note ms-note-inline" id="ms-note"></div>' +
    '</div>' +
    '<div class="ms-target">' +
      esc(deliver ? T('Out of the mixer') : T('In the mixer')) + ' ' +
      '<b id="ms-total">0</b> ' + esc(T('of')) + ' <b id="ms-batch">0</b> kg' +
      '<span class="ms-remaining" id="ms-remaining"></span>' +
    '</div>' +
    '<div class="feed-bar-track"><div class="feed-bar-fill" id="ms-bar"></div></div>';

  document.getElementById('md-pens').innerHTML = deliver
    ? _stageRowsDeliver(rows) : _loadRowsHtml(rows, true);

  _paintMainActions(deliver ? 'deliver' : 'load');
  _paintMainStage();
}

function _stageRowsDeliver(rows){
  return '<div class="feed-steplist">' + rows.map(function(r, i){
    var st = (r.actualKg !== null && r.actualKg !== undefined) ? 'done'
           : (i === _feed.stepIdx ? 'now' : '');
    return '<div class="feed-steprow ' + st + '" onclick="feedGoStep(' + i + ')">' +
      '<div class="feed-steprow-name">' + esc(r.lotName) + '</div>' +
      '<div class="feed-steprow-kg">' +
        (st === 'done' ? Math.round(r.actualKg) : Math.round(r.targetKg)) + ' kg</div>' +
    '</div>';
  }).join('') + '</div>';
}

// The live half: runs on every weight tick, so it only touches numbers.
function _paintMainStage(){
  var f = openFeeding();
  if(!f || !_feed || _feed.id !== f.id) return;
  var deliver = (_feed.phase === 'deliver');
  var rows = deliver ? deliveriesFor(f.id) : loadsFor(f.id);
  var cur  = rows[_feed.stepIdx];
  if(!cur) return;

  var kg  = (typeof _stepKg === 'function') ? _stepKg() : 0;
  var tol = deliver ? DEFAULT_TOL_PCT : tolFor(cur.ingredientId);
  var st  = loadBarState(kg, cur.targetKg, tol);

  // ── Whole batch, not the line in hand ──
  var done  = deliver ? (f.totalDeliveredKg || 0) : (f.totalLoadedKg || 0);
  var total = rows.reduce(function(s2, r){ return s2 + (r.targetKg || 0); }, 0);
  var live  = done + kg;                       // confirmed lines plus what is going in now

  var tEl = document.getElementById('ms-total'); if(tEl) tEl.textContent = Math.round(live);
  var bEl = document.getElementById('ms-batch'); if(bEl) bEl.textContent = Math.round(total);

  var bar = document.getElementById('ms-bar');
  if(bar){
    var pct = total > 0 ? Math.min(100, (live / total) * 100) : 0;
    bar.style.width = pct.toFixed(1) + '%';
    // One colour the whole way: the batch has no tolerance band of its own — a
    // line can run over while the batch is still short — so it must not borrow
    // the active line's zone. It is still progress, so it is not grey either.
    bar.className = 'feed-bar-fill batch';
  }

  var rem = document.getElementById('ms-remaining');
  if(rem){
    var leftAll = total - live;
    rem.textContent = leftAll > 0 ? ' · ' + Math.round(leftAll) + ' kg ' + T('to go') : '';
  }

  var note = document.getElementById('ms-note');
  if(note){
    var d = kg - cur.targetKg;
    note.textContent = cur.manual ? T('Add by hand, then confirm')
      : Math.abs(d) < 1 ? T('On target')
      : d > 0 ? '+' + Math.round(d) + ' kg ' + T('over') : '';
    note.className = 'feed-bar-note' + (Math.abs(d) <= cur.targetKg*0.03 ? ' good' : d > 0 ? ' over' : '');
  }

  // The row in the list has to move with the header, or the two disagree on
  // screen — the header read 1235 while its own bar still said 843.
  var row = document.querySelector('#md-pens .loadbar.active');
  if(row){
    var fill = row.querySelector('.loadbar-fill');
    if(fill){ fill.style.width = st.fill.toFixed(1) + '%'; fill.className = 'loadbar-fill ' + st.zone; }
    var pct = row.querySelector('.loadbar-pct');
    if(pct && !cur.manual){ pct.textContent = Math.round(st.pct) + '%'; pct.className = 'loadbar-pct ' + st.zone; }
    var kgEl = row.querySelector('.loadbar-kg');
    if(kgEl) kgEl.textContent = Math.round(kg) + ' / ' + Math.round(cur.targetKg) + ' kg';
  }
  // Delivering uses the simpler step list; keep its active row honest too.
  var drow = document.querySelector('#md-pens .feed-steprow.now .feed-steprow-kg');
  if(drow) drow.textContent = Math.round(kg) + ' / ' + Math.round(cur.targetKg) + ' kg';

  // Same rule as the sheet: never hard-disable, just show it is unsettled.
  var ok = document.getElementById('home-load-btn');
  if(ok) ok.classList.toggle('waiting', !weightStable);
  _paintTareGross();
}

// Tare and Clear light up only when they can do something: Tare needs a live
// reading to zero, Clear needs a tare to remove. A control that looks the same
// whether or not it will act teaches the operator to ignore its appearance.
function _paintScaleButtons(){
  var live  = (rawWeight !== null && rawWeight !== undefined);
  var tared = !!tareOffset;
  var t = document.getElementById('md-tare-btn');
  var c = document.getElementById('md-clear-btn');
  if(t){ t.classList.toggle('armed', live);  t.classList.toggle('idle', !live); }
  if(c){ c.classList.toggle('armed', tared); c.classList.toggle('idle', !tared); }
}

// The big number is NET once a tare is set, so show the reading it came from
// directly beneath it. Hidden with no tare applied, where it would only repeat
// the number above.
function _paintTareGross(){
  _paintScaleButtons();
  var el = document.getElementById('md-gross');
  if(!el) return;
  if(rawWeight === null || rawWeight === undefined || !tareOffset){
    el.textContent = ''; el.style.display = 'none'; return;
  }
  el.style.display = '';
  // Label over value, the way a scale head shows its secondary reading. Two
  // decimals to match the big number — a gross that rounds differently from the
  // net it was derived from invites a "these do not add up" second look.
  el.innerHTML =
    '<div class="md-gross-lbl">' + esc(T('Gross')) + '</div>' +
    '<div class="md-gross-val">' + rawWeight.toFixed(2) + '</div>' +
    '<div class="md-gross-tare">' + esc(T('Tare')) + ' ' + Math.round(tareOffset) + ' kg</div>';
}

// The right-hand strip is the action bar for whatever is happening.
function _paintMainActions(mode){
  var go   = document.getElementById('home-load-btn');
  var skip = document.getElementById('md-skip-btn');
  var cxl  = document.getElementById('md-cancel-btn');
  if(cxl) cxl.style.display = mode ? '' : 'none';
  if(!go) return;

  if(!mode){
    go.textContent = T('Load feed');
    go.onclick = homeLoadFeed;
    go.classList.remove('waiting');
    if(skip) skip.style.display = 'none';
    return;
  }
  if(mode === 'finish-load'){
    go.textContent = T('Start unloading');
    // guardedBeginDelivery, NOT feedBeginDelivery: the mix-timer warning lives
    // in the wrapper. Calling the inner function straight from the new main
    // display skipped the "still mixing" check entirely, so an operator could
    // unload under-mixed feed with nothing said and nothing recorded.
    go.onclick = guardedBeginDelivery;
    if(skip) skip.style.display = 'none';
    return;
  }
  if(mode === 'finish-deliver'){
    go.textContent = T('Done');
    go.onclick = feedFinish;
    if(skip) skip.style.display = 'none';
    return;
  }
  go.textContent = T('Confirm');
  go.onclick = feedConfirmStep;
  if(skip) skip.style.display = '';
}

// ── Pens on the main display ─────────────────────────────────────
// Every pen in the cycle, with the ones in the selected group brought forward.
// Seeing the pens that are NOT about to be fed is the point — that is how you
// notice one has been left off the round.
function renderMainPens(){
  var host = document.getElementById('md-pens');
  if(!host) return;

  var all = cycleLots();
  if(!all.length){
    host.innerHTML = '<div class="md-empty" onclick="showTab(\'lots\')">' +
      esc(T('No lots yet — tap to add one')) + '</div>';
    return;
  }

  var inGroup = _pick.groupId
    ? lotsInGroup(_pick.groupId).map(function(l){ return l.id; })
    : [];

  // Members first, in the group's route order (inGroup already comes from
  // lotsInGroup, which is seq-sorted); everything else after, by global order.
  var rows = all.slice().sort(function(a,b){
    var ai = inGroup.indexOf(a.id), bi = inGroup.indexOf(b.id);
    if(ai !== -1 && bi !== -1) return ai - bi;
    if(ai !== -1) return -1;
    if(bi !== -1) return 1;
    return (a.routeOrder||0) - (b.routeOrder||0);
  });

  var head = inGroup.reduce(function(s,id){ var l = lotById(id); return s + ((l&&l.headCount)||0); }, 0);
  var g = _pick.groupId ? groupById(_pick.groupId) : null;
  var share = g ? mealShare(g, nextMealIndex(g.id)) : 1;
  var mealName = g && g.mealsPerDay > 1 ? mealLabel(g, nextMealIndex(g.id)) : '';

  host.innerHTML =
    (g ? '<div class="md-pens-head">' +
        '<span>' + esc(g.name) + (mealName ? ' · ' + esc(mealName) : '') + '</span>' +
        '<b>' + Math.round(groupLoadKg(g.id)) + ' kg · ' + head + ' ' + esc(T('head')) + '</b>' +
      '</div>' : '') +
    rows.map(function(l){
      var on = inGroup.indexOf(l.id) !== -1;
      // Per head for THIS load, not the whole day. The header shows one meal,
      // so the rows have to be on the same basis or they will not add up to it
      // — and an operator who spots that stops trusting both numbers.
      var kg = on && g ? rationKgPerHead(g.rationId) * lotFeedFactor(l) * share : 0;
      var groups = groupsForLot(l.id);
      var off = Math.round((lotFeedFactor(l) - 1) * 100);
      var bunk = latestBunkScore(l.id);

      return '<div class="md-pen' + (on ? '' : ' off') + '" onclick="openLotDetail(\'' + l.id + '\')">' +
        '<div class="md-pen-main">' +
          '<div class="md-pen-name">' + esc(l.name) +
            (off ? ' <span class="md-pen-adj ' + (off>0?'up':'down') + '">' + (off>0?'+':'') + off + '%</span>' : '') +
          '</div>' +
          '<div class="md-pen-sub">' +
            (l.headCount||0) + ' ' + esc(T('head')) +
            (groups.length ? ' · ' + groups.map(function(x){ return esc(x.name); }).join(', ')
                           : ' · ' + esc(T('Not in any group'))) +
            (bunk && bunk.score != null ? ' · ' + esc(T('bunk')) + ' ' + bunk.score : '') +
          '</div>' +
        '</div>' +
        '<div class="md-pen-right">' +
          (on ? '<div class="md-pen-kg">' + Math.round(kg * (l.headCount||0)) + ' kg</div>' +
                '<div class="md-pen-per">' + kg.toFixed(1) + ' ' + esc(T('kg/head')) + '</div>'
              : '<div class="md-pen-per">' + esc(T('not this load')) + '</div>') +
        '</div>' +
      '</div>';
    }).join('');
}

function _groupHead(gid){
  return lotsInGroup(gid).reduce(function(s,l){ return s + (l.headCount||0); }, 0);
}

function pickGroup(id){
  var g = groupById(id);
  _pick.groupId  = id;
  _pick.rationId = g ? g.rationId : null;
  renderRationPicker();
  _paintHomeStatus();
}

function pickRation(id){
  _pick.rationId = id;
  renderRationPicker();
  _paintHomeStatus();
}

// ── Transactions ─────────────────────────────────────────────────
// Every unload, newest first: what each pen got, per head, and what it cost.
// This is the row the desktop will show too, so it is built from the same
// deliveryDetail() the reports use.
function renderTransactions(){
  var host = document.getElementById('tx-body');
  if(!host) return;

  var rows = getDeliveries()
    .filter(function(d){ return d.actualKg; })
    .sort(function(a,b){ return new Date(b.at) - new Date(a.at); })
    .slice(0, 120);

  if(!rows.length){ host.innerHTML = '<div class="fdp-empty">' + esc(T('Nothing unloaded yet')) + '</div>'; return; }

  var lastDay = null;
  host.innerHTML = rows.map(function(d){
    var det = deliveryDetail(d.id);
    var day = d.at ? new Date(d.at).toLocaleDateString('es-PY', {weekday:'short', day:'numeric', month:'short'}) : '';
    var hdr = (day !== lastDay) ? '<div class="tx-day">' + esc(day) + '</div>' : '';
    lastDay = day;

    var perHead = (d.kgPerHead != null) ? d.kgPerHead
                : (d.headCount ? d.actualKg / d.headCount : null);

    return hdr +
    '<div class="tx-row">' +
      '<div class="tx-main">' +
        '<div class="tx-lot">' + esc(d.lotName || '—') + '</div>' +
        '<div class="tx-meta">' +
          (d.at ? new Date(d.at).toLocaleTimeString('es-PY',{hour:'2-digit',minute:'2-digit'}) : '') +
          (det && det.ration ? ' · ' + esc(det.ration) : '') +
          (d.headCount ? ' · ' + d.headCount + ' ' + esc(T('head')) : '') +
        '</div>' +
      '</div>' +
      '<div class="tx-right">' +
        '<div class="tx-kg">' + Math.round(d.actualKg) + ' kg</div>' +
        '<div class="tx-per">' + (perHead != null ? perHead.toFixed(1) + ' ' + esc(T('kg/head')) : '') + '</div>' +
        // Dry matter is how intake is actually judged; as-fed alone says as much
        // about how wet the silage was as about what the animal ate.
        '<div class="tx-dm">' + (det && det.dmPerHead != null
            ? det.dmPerHead.toFixed(1) + ' ' + esc(T('kg DM/head')) : '') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}
