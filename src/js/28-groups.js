// ══════════════════════════════════════════════════════════════════
//  FEED GROUPS SCREEN
//  Each card is one mixer load: its ration, its pens, and what that
//  works out to. Membership is edited here rather than on the pen,
//  because the group is what the operator actually loads for.
// ══════════════════════════════════════════════════════════════════

function openGroupsPanel(){
  openMorePanel('sp-groups');
  renderGroups();
}

function renderGroups(){
  var host = document.getElementById('groups-body');
  if(!host) return;

  var groups = cycleGroups();
  if(!groups.length){
    host.innerHTML = '<div class="fdp-empty">' + esc(T('No feed groups yet')) + '</div>';
    return;
  }

  host.innerHTML = groups.map(function(g){
    var lots = lotsInGroup(g.id);
    var head = lots.reduce(function(s,l){ return s + (l.headCount||0); }, 0);
    var kg   = rationKgPerHead(g.rationId);
    // One LOAD, not a day's worth — this is the number that decides whether it
    // fits in the mixer, and a 2x/day group loads half the daily ration.
    var total = groupLoadKg(g.id);

    return '<div class="grp-card">' +
      '<div class="grp-head" onclick="openGroupSheet(\'' + g.id + '\')">' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="grp-name">' + esc(g.name) + '</div>' +
          '<div class="grp-sub">' + esc((rationById(g.rationId)||{}).name || T('No ration')) +
            ' · ' + kg.toFixed(1) + ' ' + esc(T('kg/head')) +
            ' · ' + (g.mealsPerDay||2) + '× ' + esc(T('per day')) + '</div>' +
        '</div>' +
        '<div class="grp-total">' +
          '<div class="grp-kg">' + Math.round(total) + ' kg</div>' +
          '<div class="grp-sub">' + esc(T('per load')) + ' · ' + head + ' ' + esc(T('head')) + '</div>' +
        '</div>' +
      '</div>' +
      (g.mealsPerDay > 1 ? '<div class="grp-meals">' + groupDayLoads(g.id).map(function(m){
          var w = groupWindows(g)[m.mealIndex-1];
          return '<div class="grp-meal"><span>' + esc(m.label) + '</span>' +
                 '<b>' + Math.round(m.kg) + ' kg</b>' +
                 '<i>' + Math.round(m.pct) + '%' + (w ? ' · ' + esc(w.text) : '') + '</i></div>';
        }).join('') + '</div>' : '') +
      '<div class="grp-pens">' + (lots.length
        ? lots.map(function(l){ return '<span class="grp-pen">' + esc(l.name) + '</span>'; }).join('')
        : '<span class="grp-none">' + esc(T('No lots')) + '</span>') + '</div>' +
      '<div class="ing-actions">' +
        '<button class="ing-btn" onclick="openGroupPens(\'' + g.id + '\')">' + esc(T('Lots')) + '</button>' +
        '<button class="ing-btn" onclick="openGroupSheet(\'' + g.id + '\')">' + esc(T('Edit')) + '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ── Create / edit a group ────────────────────────────────────────
var _gsId = null;
var _gsMeals = 2;
var _gsSplits = [50, 50];
var _gsWindows = ['', ''];

function openGroupSheet(id){
  var rations = getRations().filter(function(r){ return r.active !== false; });
  if(!rations.length){ openRationSheet(); return; }   // nothing to point at yet

  var g = id ? groupById(id) : {};
  _gsId     = id || null;
  _gsMeals  = (g.mealsPerDay > 0) ? Math.round(g.mealsPerDay) : 2;
  _gsSplits = groupSplits({ mealsPerDay: _gsMeals, mealSplits: g.mealSplits });
  _gsWindows = groupWindows({ mealsPerDay: _gsMeals, mealWindows: g.mealWindows })
                 .map(function(w){ return w ? w.text : ''; });

  document.getElementById('gs-title').textContent = id ? T('Edit group') : T('New group');
  document.getElementById('gs-name').value = g.name || '';
  document.getElementById('gs-order').value = g.routeOrder != null ? g.routeOrder : cycleGroups().length;
  document.getElementById('gs-ration').innerHTML = rations.map(function(r){
    return '<option value="' + r.id + '"' + (r.id === g.rationId ? ' selected' : '') + '>' + esc(r.name) + '</option>';
  }).join('');
  document.getElementById('gs-delete').style.display = id ? '' : 'none';

  _gsIntakeMode = g.intakeMode || 'kg';
  document.getElementById('gs-intake-kg-val').value = g.intakeKgPerHead || '';
  document.getElementById('gs-intake-bw-val').value = g.intakeBwPct || '';
  gsSetIntakeMode(_gsIntakeMode);
  gsRationChanged();

  _renderGsSplits();
  document.getElementById('group-sheet-overlay').classList.add('open');
}

var _gsIntakeMode = 'kg';

// Intake only has to be answered for a percentage ration.
function gsRationChanged(){
  var rid  = document.getElementById('gs-ration').value;
  var wrap = document.getElementById('gs-intake-wrap');
  if(wrap) wrap.style.display = (rid && rationMode(rid) === 'pct') ? '' : 'none';
}

function gsSetIntakeMode(mode){
  _gsIntakeMode = (mode === 'bw_pct') ? 'bw_pct' : 'kg';
  var bw = _gsIntakeMode === 'bw_pct';
  document.getElementById('gs-intake-kg').classList.toggle('active', !bw);
  document.getElementById('gs-intake-bw').classList.toggle('active',  bw);
  document.getElementById('gs-intake-kg-wrap').style.display = bw ? 'none' : '';
  document.getElementById('gs-intake-bw-wrap').style.display = bw ? '' : 'none';
}

function closeGroupSheet(){ document.getElementById('group-sheet-overlay').classList.remove('open'); }

function gsSetMeals(n){
  n = Math.max(1, Math.min(4, n));
  if(n === _gsMeals) return;
  _gsMeals   = n;
  _gsSplits  = _evenSplit(n);     // a changed meal count invalidates the old shares
  _gsWindows = _gsWindows.slice(0, n);
  while(_gsWindows.length < n) _gsWindows.push('');
  _renderGsSplits();
}

function _renderGsSplits(){
  document.getElementById('gs-meals').textContent = _gsMeals;

  var host = document.getElementById('gs-splits');
  var fake = { mealsPerDay: _gsMeals };
  host.innerHTML = _gsSplits.map(function(p, i){
    return '<div class="gs-split-row">' +
      '<span class="gs-split-lbl">' + esc(mealLabel(fake, i+1)) + '</span>' +
      '<input class="gs-split-in" type="number" inputmode="numeric" min="0" max="100" ' +
        'id="gs-split-' + i + '" value="' + Math.round(p) + '" oninput="_gsSplitInput(' + i + ')">' +
      '<span class="gs-split-pct">%</span>' +
    '</div>' +
    // The delivery window sits with its share: both describe the same feeding.
    '<div class="gs-win-row">' +
      '<span class="gs-win-lbl">' + esc(T('Delivery window')) + '</span>' +
      _gsWinBtn(i, 0) + '<span class="gs-win-dash">–</span>' + _gsWinBtn(i, 1) +
    '</div>';
  }).join('');
  _gsSplitTotal();

  // One feeding has nothing to split.
  document.getElementById('gs-split-wrap').style.display = _gsMeals > 1 ? '' : 'none';
}

// The two ends of one window. Rendered as buttons rather than <input type="time">
// so both edges use the app's own drum picker instead of Android's clock dial.
function _gsWinBtn(i, end){
  var v = (_gsWindows[i] || '').split('-')[end] || '';
  return '<button class="gs-win-in' + (v ? '' : ' empty') + '" ' +
         'onclick="_gsWinPick(' + i + ',' + end + ')">' + (v || '--:--') + '</button>';
}

function _gsWinPick(i, end){
  var cur = (_gsWindows[i] || '').split('-');
  openTimeWheel(T(end === 0 ? 'Window starts' : 'Window ends'), cur[end] || '', function(v){
    // Only a complete pair is a window; a half-filled one must not start judging
    // deliveries against a boundary that was never set.
    cur[end] = v;
    _gsWindows[i] = (cur[0] && cur[1]) ? (cur[0] + '-' + cur[1]) : '';
    // Redraw only this row's buttons — re-rendering the whole split list would
    // throw away whatever share the operator is part-way through typing.
    var row = document.getElementById('gs-split-' + i);
    var host = row && row.closest('.gs-split-row');
    var winRow = host && host.nextElementSibling;
    if(winRow && winRow.classList.contains('gs-win-row')){
      var btns = winRow.querySelectorAll('.gs-win-in');
      [0,1].forEach(function(e){
        if(!btns[e]) return;
        var t = cur[e] || '';
        btns[e].textContent = t || '--:--';
        btns[e].classList.toggle('empty', !t);
      });
    }
  });
}

function _gsSplitInput(i){
  var el = document.getElementById('gs-split-' + i);
  _gsSplits[i] = parseFloat(el.value) || 0;
  _gsSplitTotal();
}

function _gsSplitTotal(){
  var sum = _gsSplits.reduce(function(a,b){ return a+b; }, 0);
  var el = document.getElementById('gs-split-total');
  if(!el) return;
  el.textContent = Math.round(sum) + '%';
  // Shares are normalised on save, so an off-100 total is a warning, not a
  // blocker — but it almost always means a typo.
  el.className = 'gs-split-total' + (Math.abs(sum - 100) > 0.5 ? ' bad' : '');
}

function gsEvenSplit(){
  _gsSplits = _evenSplit(_gsMeals);
  _renderGsSplits();
}

function saveGroupSheet(){
  var name = (document.getElementById('gs-name').value || '').trim();
  if(!name){ showToast(T('Name required'), 'warn'); return; }

  var sum = _gsSplits.reduce(function(a,b){ return a+b; }, 0);
  if(sum <= 0){ showToast(T('Splits must add up to 100%'), 'warn'); return; }

  // Intake is only asked for — and only stored — when the ration needs it.
  var rid = document.getElementById('gs-ration').value || null;
  var needsIntake = rid && rationMode(rid) === 'pct';
  var intakeKg = parseFloat(document.getElementById('gs-intake-kg-val').value) || null;
  var intakeBw = parseFloat(document.getElementById('gs-intake-bw-val').value) || null;
  var intakeMode = needsIntake ? _gsIntakeMode : null;
  if(needsIntake){
    if(intakeMode === 'kg' && !(intakeKg > 0)){
      showToast(T('Enter how many kg per head'), 'warn'); return;
    }
    if(intakeMode === 'bw_pct' && !(intakeBw > 0 && intakeBw <= 6)){
      showToast(T('Enter a bodyweight percentage between 0 and 6'), 'warn'); return;
    }
  }

  var g = _gsId ? groupById(_gsId) : {};
  saveFeedGroup(Object.assign({}, g, {
    id: _gsId || undefined,
    name: name,
    rationId: document.getElementById('gs-ration').value || null,
    mealsPerDay: _gsMeals,
    // Normalise to percentages of 100 so the stored value is trustworthy even
    // if it was typed as 45/50.
    mealSplits: _gsSplits.map(function(p){ return Math.round((p/sum)*1000)/10; }).join(','),
    mealWindows: _gsWindows.some(function(w){ return w; }) ? _gsWindows.join(',') : null,
    routeOrder: parseInt(document.getElementById('gs-order').value, 10) || 0,
    // Only one of the two is ever stored — the database rejects both being set,
    // and a leftover value from the other mode would be a second source of truth.
    intakeMode:      intakeMode,
    intakeKgPerHead: intakeMode === 'kg'     ? intakeKg : null,
    intakeBwPct:     intakeMode === 'bw_pct' ? intakeBw : null
  }));

  closeGroupSheet();
  renderGroups();
  if(typeof renderRationPicker === 'function') renderRationPicker();
  showToast(T('Saved'), 'success');
}

function gsDelete(){
  var id = _gsId;
  closeGroupSheet();
  if(id) deleteGroupConfirm(id);
}

async function deleteGroupConfirm(id){
  var g = groupById(id);
  if(await showConfirm(T('The lots stay; only the group is removed.'), (g&&g.name)||T('Delete group'), '🗑️')){
    deleteFeedGroup(id);
    renderGroups();
    if(typeof renderRationPicker === 'function') renderRationPicker();
  }
}

// ── Which pens are in this group ─────────────────────────────────
var _groupPensId = null;

function openGroupPens(groupId){
  _groupPensId = groupId;
  var g = groupById(groupId);
  document.getElementById('gp-title').textContent = (g && g.name) || T('Lots');
  _renderGroupPens();
  document.getElementById('group-pens-overlay').classList.add('open');
}

function closeGroupPens(){
  reorderReset('gpens');
  document.getElementById('group-pens-overlay').classList.remove('open');
  _groupPensId = null;
  renderGroups();
  if(typeof renderRationPicker === 'function') renderRationPicker();
}

function _renderGroupPens(){
  reorderRegister('gpens', {
    getIds: function(){ return lotsInGroup(_groupPensId).map(function(l){ return l.id; }); },
    setIds: function(ids){ reorderGroupLots(_groupPensId, ids); },
    render: _renderGroupPens
  });
  var host = document.getElementById('gp-body');
  var all  = cycleLots();
  if(!all.length){ host.innerHTML = '<div class="fdp-empty">' + esc(T('No lots yet')) + '</div>'; return; }

  // Two lists, not one checkbox list: the pens IN the group are a ROUTE, and a
  // route has an order the operator drives. Mixed in with every other pen there
  // was nowhere to express that.
  var members = lotsInGroup(_groupPensId);
  var inIds   = members.map(function(l){ return l.id; });
  var rest    = all.filter(function(l){ return inIds.indexOf(l.id) === -1; })
                   .sort(function(a,b){ return (a.routeOrder||0)-(b.routeOrder||0); });

  var sorting = reorderActive('gpens');
  var html = '<div class="rr-head">' +
      '<div class="gp-sec-lbl">' + esc(T('Delivery order')) + '</div>' +
      (members.length > 1 ? reorderButtonHtml('gpens') : '') +
    '</div>';

  // Weigh-off error accumulates into the last drop, so ending on the biggest pen
  // makes the same kilos the smallest percentage error. Offered, not imposed —
  // the physical route around the yard is the operator's call.
  if(members.length > 1 && !routeEndsOnLargest(_groupPensId)){
    html += '<div class="gp-hint" onclick="_gpSortLargestLast()">' +
      esc(T('Tip: end on the biggest lot — tap to reorder')) + '</div>';
  }

  if(!members.length){
    html += '<div class="fdp-empty">' + esc(T('No lots in this group yet')) + '</div>';
  } else {
    html += members.map(function(l, i){
      var others = groupsForLot(l.id).filter(function(g){ return g.id !== _groupPensId; });
      return '<div class="gp-row' + (sorting ? ' sorting' : '') + '" data-rid="' + l.id + '">' +
        (sorting ? reorderHandleHtml(l.id) : '') +
        '<div class="gp-seq">' + (i+1) + '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="farm-sel-name">' + esc(l.name) + '</div>' +
          '<div class="fi-sub">' + (l.headCount||0) + ' ' + esc(T('head')) +
            (others.length ? ' · ' + esc(T('also in')) + ' ' + others.map(function(g){ return esc(g.name); }).join(', ') : '') +
          '</div>' +
        '</div>' +
        (sorting ? '' :
          '<div class="gp-remove" onclick="_toggleGroupPen(\'' + l.id + '\')">&#10005;</div>') +
      '</div>';
    }).join('');
  }

  if(sorting) rest = [];
  if(rest.length){
    html += '<div class="gp-sec-lbl">' + esc(T('Add a lot')) + '</div>';
    html += rest.map(function(l){
      var others = groupsForLot(l.id);
      return '<div class="farm-sel-row" onclick="_toggleGroupPen(\'' + l.id + '\')">' +
        '<div class="farm-sel-check"></div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="farm-sel-name">' + esc(l.name) + '</div>' +
          '<div class="fi-sub">' + (l.headCount||0) + ' ' + esc(T('head')) +
            (others.length ? ' · ' + esc(T('also in')) + ' ' + others.map(function(g){ return esc(g.name); }).join(', ') : '') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  host.innerHTML = html;
}

function _gpSortLargestLast(){
  reorderGroupLots(_groupPensId, suggestRouteOrder(_groupPensId));
  _renderGroupPens();
  if(typeof renderMainPens === 'function') renderMainPens();
  showToast(T('Route reordered'), 'success');
}

// Move one pen up or down the route and persist the whole order.
function _gpMove(lotId, delta){
  var ids = lotsInGroup(_groupPensId).map(function(l){ return l.id; });
  var i = ids.indexOf(lotId);
  var j = i + delta;
  if(i === -1 || j < 0 || j >= ids.length) return;
  ids.splice(j, 0, ids.splice(i, 1)[0]);
  reorderGroupLots(_groupPensId, ids);
  _renderGroupPens();
  if(typeof renderMainPens === 'function') renderMainPens();
}

function _toggleGroupPen(lotId){
  var isIn = lotsInGroup(_groupPensId).some(function(l){ return l.id === lotId; });
  // Added pens go to the END of the route. Adopting the pen's global
  // routeOrder (what this used to do) dropped every new pen into the middle.
  setLotInGroup(lotId, _groupPensId, !isIn, isIn ? 0 : nextGroupSeq(_groupPensId));
  if(isIn) reorderGroupLots(_groupPensId, lotsInGroup(_groupPensId).map(function(l){ return l.id; }));
  _renderGroupPens();
  if(typeof renderMainPens === 'function') renderMainPens();
}

