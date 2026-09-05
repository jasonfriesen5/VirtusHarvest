// ══════════════════════════════════════════════════════════════════
//  RATION BUILDER — two steps
//    1. Tick the products this ration uses (all of them, one list)
//    2. Set kg per head for each, and drag them into load order
//
//  Replaces adding one ingredient at a time. A nutritionist writes a
//  diet as a whole, not as five separate visits to the same dialog,
//  and load order only means anything relative to the other rows.
// ══════════════════════════════════════════════════════════════════

var _rbRationId = null;
var _rbPicked   = [];     // ingredient ids, in the order they will load
var _rbManual   = {};     // ingredientId -> hand-added rather than weighed

// ── Step 1: pick products ────────────────────────────────────────
function openRationProductPicker(rationId, keepSelection){
  if(!guardRationEdit()) return;
  _rbRationId = rationId;

  var existing = rationItemsFor(rationId);
  if(!keepSelection){
    // Start from what the ration already uses, so this doubles as "edit the
    // whole diet" rather than being add-only.
    _rbPicked = existing.map(function(it){ return it.ingredientId; });
    _rbManual = {};
    existing.forEach(function(it){ if(it.manualAdd) _rbManual[it.ingredientId] = true; });
  }

  var ings = getIngredients().filter(function(i){ return i.active !== false; });
  if(!ings.length){
    openIngredientSheet(null, function(created){
      if(created) _rbPicked.push(created.id);
      openRationProductPicker(rationId, true);
    });
    return;
  }

  var r = rationById(rationId);
  document.getElementById('rb-pick-title').textContent = (r && r.name) || T('Ration');
  _renderRbPick();
  document.getElementById('rb-pick-overlay').classList.add('open');
}

function _renderRbPick(){
  var ings = getIngredients().filter(function(i){ return i.active !== false; });
  var host = document.getElementById('rb-pick-body');

  host.innerHTML = ings.map(function(i){
    var on = _rbPicked.indexOf(i.id) !== -1;
    return '<div class="farm-sel-row" onclick="_rbToggle(\'' + i.id + '\')">' +
      '<div class="farm-sel-check' + (on ? ' on' : '') + '">' + (on ? '✓' : '') + '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div class="farm-sel-name">' + esc(i.name) + '</div>' +
        '<div class="fi-sub">' + (i.dmPct||100) + '% MS</div>' +
      '</div>' +
    '</div>';
  }).join('') +
  '<div class="rb-new" onclick="_rbNewProduct()">+ ' + esc(T('New Ingredient')) + '</div>';

  var n = _rbPicked.length;
  var btn = document.getElementById('rb-next');
  btn.disabled = n === 0;
  btn.textContent = n ? T('Next') + ' (' + n + ')' : T('Next');
}

function _rbToggle(id){
  var i = _rbPicked.indexOf(id);
  if(i === -1) _rbPicked.push(id); else _rbPicked.splice(i, 1);
  _renderRbPick();
}

function _rbNewProduct(){
  closeRbPick();
  openIngredientSheet(null, function(created){
    if(created) _rbPicked.push(created.id);
    openRationProductPicker(_rbRationId, true);
  });
}

function closeRbPick(){ document.getElementById('rb-pick-overlay').classList.remove('open'); }

function rbNext(){
  if(!_rbPicked.length) return;
  closeRbPick();
  // Keep the ration's existing order for products already in it; anything new
  // goes on the end, which is where a nutritionist adds minerals anyway.
  var existing = rationItemsFor(_rbRationId).map(function(it){ return it.ingredientId; });
  _rbPicked.sort(function(a,b){
    var ia = existing.indexOf(a), ib = existing.indexOf(b);
    if(ia === -1 && ib === -1) return 0;
    if(ia === -1) return 1;
    if(ib === -1) return -1;
    return ia - ib;
  });
  openRationAmounts();
}

// ── Step 2: amounts + order ──────────────────────────────────────
function openRationAmounts(){
  var r = rationById(_rbRationId);
  document.getElementById('rb-amt-title').textContent = (r && r.name) || T('Ration');
  _renderRbAmounts();
  document.getElementById('rb-amt-overlay').classList.add('open');
}

function closeRbAmounts(){ document.getElementById('rb-amt-overlay').classList.remove('open'); }

function _renderRbAmounts(){
  var existing = rationItemsFor(_rbRationId);
  var host = document.getElementById('rb-amt-body');

  host.innerHTML = _rbPicked.map(function(id, idx){
    var ing = ingredientById(id) || {};
    var was = existing.find(function(it){ return it.ingredientId === id; });
    // Keep whatever the operator has already typed across a re-render, so
    // reordering never costs them their numbers.
    var prior = document.getElementById('rb-kg-' + id);
    var val = prior ? prior.value : (was && was.kgPerHead != null ? was.kgPerHead : '');

    var man = !!_rbManual[id];
    var sug = suggestManualAdd(_rbRationId, parseFloat(val) || 0);
    return '<div class="rb-row' + (man ? ' manual' : '') + '" data-id="' + id + '">' +
      '<div class="rb-main">' +
        '<div class="rb-grip" onpointerdown="_rbDragStart(event,\'' + id + '\')">⠿</div>' +
        '<div class="rb-seq">' + (idx + 1) + '</div>' +
        '<div class="rb-info">' +
          '<div class="rb-name">' + esc(ing.name || '—') + '</div>' +
          '<div class="fi-sub">' + (ing.dmPct||100) + '% MS</div>' +
        '</div>' +
        '<input class="rb-kg" id="rb-kg-' + id + '" type="number" inputmode="decimal" step="0.01" ' +
          'value="' + esc(val) + '" placeholder="0" oninput="_rbTotal()">' +
        '<div class="rb-arrows">' +
          '<button class="rb-arrow" onclick="_rbMove(\'' + id + '\',-1)"' + (idx === 0 ? ' disabled' : '') + '>▲</button>' +
          '<button class="rb-arrow" onclick="_rbMove(\'' + id + '\',1)"' + (idx === _rbPicked.length-1 ? ' disabled' : '') + '>▼</button>' +
        '</div>' +
      '</div>' +
      // Small doses sit below the mixer scale's resolution — the readout will
      // not move, so weighing them is not an option.
      '<label class="rb-manual">' +
        '<input type="checkbox" ' + (man ? 'checked' : '') + ' onchange="_rbToggleManual(\'' + id + '\',this.checked)">' +
        '<span>' + esc(T('Add by hand (too small to weigh)')) + '</span>' +
      '</label>' +
      // Nobody writing a ration is thinking about load-cell repeatability, so
      // work it out for them rather than waiting for an operator to get stuck
      // in front of a bar that will not move.
      (!man && sug
        ? '<div class="rb-hint" onclick="_rbToggleManual(\'' + id + '\',true)">' +
            esc(T('About')) + ' ' + Math.round(sug.estKg) + ' kg ' + esc(T('per load')) + ' — ' +
            esc(T('below what this mixer can weigh')) + ' (~' + Math.round(sug.resolutionKg) + ' kg). ' +
            '<b>' + esc(T('Add by hand?')) + '</b>' +
          '</div>'
        : '') +
    '</div>';
  }).join('');
  _rbTotal();
}

function _rbTotal(){
  var t = 0;
  _rbPicked.forEach(function(id){
    var el = document.getElementById('rb-kg-' + id);
    t += parseFloat(el && el.value) || 0;
  });
  var el = document.getElementById('rb-total');
  if(el) el.textContent = t.toFixed(2) + ' ' + T('kg/head');
  _rbRefreshHints();
}

// Update the hints in place. A full re-render would steal focus mid-keystroke.
function _rbRefreshHints(){
  _rbPicked.forEach(function(id){
    var row = document.querySelector('.rb-row[data-id="' + id + '"]');
    if(!row) return;
    var old = row.querySelector('.rb-hint');
    if(old) old.remove();
    if(_rbManual[id]) return;

    var kg  = parseFloat((document.getElementById('rb-kg-' + id) || {}).value) || 0;
    var sug = suggestManualAdd(_rbRationId, kg);
    if(!sug) return;

    var d = document.createElement('div');
    d.className = 'rb-hint';
    d.onclick = function(){ _rbToggleManual(id, true); };
    d.innerHTML = esc(T('About')) + ' ' + Math.round(sug.estKg) + ' kg ' + esc(T('per load')) + ' — ' +
                  esc(T('below what this mixer can weigh')) + ' (~' + Math.round(sug.resolutionKg) + ' kg). ' +
                  '<b>' + esc(T('Add by hand?')) + '</b>';
    row.appendChild(d);
  });
}

function _rbToggleManual(id, on){
  if(on) _rbManual[id] = true; else delete _rbManual[id];
  _renderRbAmounts();
}

function _rbMove(id, delta){
  var i = _rbPicked.indexOf(id);
  var j = i + delta;
  if(i === -1 || j < 0 || j >= _rbPicked.length) return;
  _rbPicked.splice(j, 0, _rbPicked.splice(i, 1)[0]);
  _renderRbAmounts();
}

// ── Drag to reorder ──────────────────────────────────────────────
// Pointer events rather than HTML5 drag-and-drop: DnD does not fire on touch,
// so on the tablet the grip would simply do nothing.
var _rbDragId = null;

function _rbDragStart(ev, id){
  ev.preventDefault();
  _rbDragId = id;
  var row = ev.target.closest('.rb-row');
  if(row) row.classList.add('dragging');
  window.addEventListener('pointermove', _rbDragMove);
  window.addEventListener('pointerup', _rbDragEnd, { once:true });
}

function _rbDragMove(ev){
  if(!_rbDragId) return;
  var el = document.elementFromPoint(ev.clientX, ev.clientY);
  var over = el && el.closest ? el.closest('.rb-row') : null;
  if(!over) return;
  var overId = over.getAttribute('data-id');
  if(!overId || overId === _rbDragId) return;

  var from = _rbPicked.indexOf(_rbDragId);
  var to   = _rbPicked.indexOf(overId);
  if(from === -1 || to === -1) return;
  _rbPicked.splice(to, 0, _rbPicked.splice(from, 1)[0]);
  _renderRbAmounts();
  var moved = document.querySelector('.rb-row[data-id="' + _rbDragId + '"]');
  if(moved) moved.classList.add('dragging');
}

function _rbDragEnd(){
  window.removeEventListener('pointermove', _rbDragMove);
  _rbDragId = null;
  document.querySelectorAll('.rb-row.dragging').forEach(function(r){ r.classList.remove('dragging'); });
}

// ── Save ─────────────────────────────────────────────────────────
function rbSave(){
  var missing = _rbPicked.filter(function(id){
    var el = document.getElementById('rb-kg-' + id);
    return !(parseFloat(el && el.value) > 0);
  });
  if(missing.length){
    showToast(T('Enter kg for every product'), 'warn');
    var first = document.getElementById('rb-kg-' + missing[0]);
    if(first){ first.focus(); first.classList.add('rb-kg-bad'); }
    return;
  }

  var existing = rationItemsFor(_rbRationId);

  // Anything unticked in step 1 is no longer part of the diet.
  existing.forEach(function(it){
    if(_rbPicked.indexOf(it.ingredientId) === -1) deleteRationItem(it.id);
  });

  // seq is the index, so the load order is exactly what is on screen.
  _rbPicked.forEach(function(id, idx){
    var was = existing.find(function(it){ return it.ingredientId === id; });
    var kg  = parseFloat(document.getElementById('rb-kg-' + id).value) || 0;
    saveRationItem(Object.assign({}, was || {}, {
      id: was ? was.id : undefined,
      rationId: _rbRationId,
      ingredientId: id,
      kgPerHead: kg,
      manualAdd: !!_rbManual[id],
      seq: idx
    }));
  });

  closeRbAmounts();
  renderRations();
  if(typeof renderRationPicker === 'function') renderRationPicker();
  showToast(T('Saved'), 'success');
}

function rbBack(){
  closeRbAmounts();
  openRationProductPicker(_rbRationId, true);
}

// ══════════════════════════════════════════════════════════════════
//  RATION EDITOR
//  Everything about a ration in one sheet: the order it goes into the mixer,
//  each amount inline, remove, and add. The old flow was a checkbox picker,
//  then an amounts sheet, then a separate sheet per line to change a number.
// ══════════════════════════════════════════════════════════════════
var _reRationId = null;

function openRationEditor(rationId){
  if(!guardRationEdit()) return;
  var r = rationById(rationId);
  if(!r) return;
  _reRationId = rationId;
  document.getElementById('re-title').textContent = r.name || T('Ration');
  reorderReset('ration');
  reorderRegister('ration', {
    getIds: function(){ return rationItemsFor(_reRationId).map(function(it){ return it.id; }); },
    setIds: function(ids){
      var byId = {};
      getRationItems().forEach(function(it){ byId[it.id] = it; });
      ids.forEach(function(id, k){
        var it = byId[id];
        if(it && it.seq !== k){ it.seq = k; saveRationItem(it); }
      });
    },
    render: _renderRationEditor
  });
  _renderRationEditor();
  document.getElementById('ration-edit-overlay').classList.add('open');
}

function closeRationEditor(){
  document.getElementById('ration-edit-overlay').classList.remove('open');
  reorderReset('ration');
  _reRationId = null;
  if(typeof renderRations === 'function') renderRations();
  if(typeof renderRationPicker === 'function') renderRationPicker();
}

function _renderRationEditor(){
  var host  = document.getElementById('re-body');
  var items = rationItemsFor(_reRationId);
  var mode  = rationMode(_reRationId);
  var unit  = (mode === 'pct') ? '%' : 'kg';

  var totalKg = items.reduce(function(s,it){ return s + (it.kgPerHead||0); }, 0);
  var totalPc = items.reduce(function(s,it){ return s + (it.pctOfMix||0); }, 0);
  var sub = document.getElementById('re-sub');
  if(sub){
    sub.textContent = (mode === 'pct')
      ? Math.round(totalPc) + '% ' + T('of mix')
      : totalKg.toFixed(1) + ' ' + T('kg/head');
  }

  var sorting = reorderActive('ration');

  var html = '<div class="rr-head">' +
      '<div class="gp-sec-lbl">' + esc(T('Load order')) + '</div>' +
      (items.length > 1 ? reorderButtonHtml('ration') : '') +
    '</div>';

  if(!items.length){
    html += '<div class="fdp-empty">' + esc(T('No ingredients in this ration')) + '</div>';
  } else {
    html += items.map(function(it, i){
      var ing = ingredientById(it.ingredientId);
      var val = (mode === 'pct') ? (it.pctOfMix != null ? it.pctOfMix : '')
                                 : (it.kgPerHead != null ? it.kgPerHead : '');
      // Percentage lines have no kg to judge against, so no suggestion there.
      var sug = (mode === 'pct') ? null : suggestManualAdd(_reRationId, it.kgPerHead);
      // While sorting, the editing controls step aside — a stray tap on an
      // amount or a remove ✕ mid-drag is a silent change nobody notices.
      return '<div class="re-row' + (sorting ? ' sorting' : '') + '" data-rid="' + it.id + '">' +
        (sorting ? reorderHandleHtml(it.id) : '') +
        '<div class="gp-seq">' + (i+1) + '</div>' +
        '<div class="re-name">' + esc(ing ? ing.name : T('Unknown')) +
          (it.manualAdd ? ' <span class="loadbar-hand">' + esc(T('by hand')) + '</span>' : '') +
        '</div>' +
        (sorting ? '' :
          // Edited in place. A separate sheet to change one number was the
          // slowest part of setting a ration up.
          '<input class="re-amt" type="number" inputmode="decimal" step="0.01" value="' + val + '"' +
            ' onchange="_reSetAmount(\'' + it.id + '\', this.value)">' +
          '<span class="re-unit">' + unit + '</span>' +
          // Some lines are too small for the mixer scale to see at all — a
          // mineral premix on one meal can weigh less than the scale's own
          // resolution. Those get added by hand and confirmed, not weighed.
          '<div class="re-hand' + (it.manualAdd ? ' on' : '') + (sug && !it.manualAdd ? ' hint' : '') + '"' +
            ' title="' + esc(T('Add by hand')) + '"' +
            ' onclick="_reToggleManual(\'' + it.id + '\')">&#9995;</div>' +
          '<div class="gp-remove" onclick="_reRemove(\'' + it.id + '\')">&#10005;</div>') +
      '</div>' +
      // Only when the app can actually judge it: a real load of this line would
      // fall under what the scale can resolve.
      (sug && !it.manualAdd && !sorting
        ? '<div class="re-sug" onclick="_reToggleManual(\'' + it.id + '\')">' +
            esc(T('About')) + ' ' + Math.round(sug.estKg) + ' kg ' + esc(T('per load')) + ' — ' +
            esc(T('below what the scale can weigh')) + ' (' + Math.round(sug.resolutionKg) + ' kg). ' +
            '<b>' + esc(T('Add by hand?')) + '</b></div>'
        : '');
    }).join('');
  }

  // Anything not already in the mix, one tap to add — no separate picker step.
  var have = items.map(function(it){ return it.ingredientId; });
  var rest = sorting ? [] : getIngredients().filter(function(i){
    return i.active !== false && have.indexOf(i.id) === -1;
  });
  if(rest.length){
    html += '<div class="gp-sec-lbl">' + esc(T('Add a product')) + '</div>';
    html += rest.map(function(i){
      return '<div class="farm-sel-row" onclick="_reAdd(\'' + i.id + '\')">' +
        '<div class="re-plus">+</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="farm-sel-name">' + esc(i.name) + '</div>' +
          '<div class="fi-sub">' + (i.dmPct||100) + '% MS · ' +
            Math.round(i.stockKg||0).toLocaleString('es-PY') + ' kg ' + esc(T('in stock')) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  host.innerHTML = html;
}

// Order is what the mixer follows: forage first, minerals last.
function _reMove(itemId, delta){
  var items = rationItemsFor(_reRationId);
  var i = items.findIndex(function(x){ return x.id === itemId; });
  var j = i + delta;
  if(i === -1 || j < 0 || j >= items.length) return;
  items.splice(j, 0, items.splice(i, 1)[0]);
  items.forEach(function(it, k){ if(it.seq !== k){ it.seq = k; saveRationItem(it); } });
  _renderRationEditor();
}

function _reSetAmount(itemId, raw){
  var it = getRationItems().find(function(x){ return x.id === itemId; });
  if(!it) return;
  var v = parseFloat(raw);
  if(!(v >= 0)){ showToast(T('Enter an amount'), 'warn'); _renderRationEditor(); return; }
  // A ration is written in ONE mode; the database rejects a row carrying both.
  if(rationMode(_reRationId) === 'pct'){ it.pctOfMix = v; it.kgPerHead = null; }
  else                                 { it.kgPerHead = v; it.pctOfMix = null; }
  saveRationItem(it);
  _renderRationEditor();
}

// Hand-added lines are confirmed, not weighed: the scale never sees them, so
// the recorded amount is the target rather than a measured delta.
function _reToggleManual(itemId){
  var it = getRationItems().find(function(x){ return x.id === itemId; });
  if(!it) return;
  it.manualAdd = !it.manualAdd;
  saveRationItem(it);
  _renderRationEditor();
  showToast((ingredientById(it.ingredientId)||{}).name + ' · ' +
            T(it.manualAdd ? 'Added by hand' : 'Weighed on the scale'), 'success');
}

function _reRemove(itemId){
  deleteRationItem(itemId);
  var items = rationItemsFor(_reRationId);
  items.forEach(function(it, k){ if(it.seq !== k){ it.seq = k; saveRationItem(it); } });
  _renderRationEditor();
}

function _reAdd(ingredientId){
  var items = rationItemsFor(_reRationId);
  var row = { rationId: _reRationId, ingredientId: ingredientId, seq: items.length };
  if(rationMode(_reRationId) === 'pct') row.pctOfMix = 0; else row.kgPerHead = 0;
  saveRationItem(row);
  _renderRationEditor();
  // Land the cursor on the amount that was just added — it is the only thing
  // still missing, and hunting for it is the friction this replaces.
  setTimeout(function(){
    var inputs = document.querySelectorAll('#re-body .re-amt');
    var last = inputs[inputs.length-1];
    if(last){ last.focus(); last.select(); }
  }, 40);
}
