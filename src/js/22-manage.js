// ══════════════════════════════════════════════════════════════════
//  MANAGEMENT SCREENS — lots, ingredients, rations, cycles.
//  Set up once by the manager, then rarely touched. Unlike the feed
//  flow, typing is fine here.
// ══════════════════════════════════════════════════════════════════

// ── Generic add/edit sheet ───────────────────────────────────────
// One sheet, driven by a field spec, instead of four near-identical
// sheets. Every entity here is "a few labelled inputs and a save".
var _sheetOnSave = null;

// A field may declare showWhen:{otherKey:'value'} to appear only for a given
// choice. Generic on purpose — the receive sheet needs it to offer "price per
// kg" OR "invoice total" without showing two money boxes at once, and the next
// either/or field will want the same.
function _esWrap(f, inner){
  var cond = f.showWhen ? Object.keys(f.showWhen)[0] : null;
  return '<div class="es-field" id="esw-' + f.key + '"' +
    (cond ? ' data-when-key="' + esc(cond) + '" data-when-val="' + esc(f.showWhen[cond]) + '"' : '') +
    '>' + inner + '</div>';
}

var _esPhotos = {};   // key -> { name, dataUrl } staged for this sheet

function openEntitySheet(title, fields, onSave){
  _esPhotos = {};
  document.getElementById('entity-sheet-title').textContent = title;
  document.getElementById('entity-sheet-body').innerHTML = fields.map(function(f){
    if(f.type === 'select'){
      return _esWrap(f, '<div class="tx-field-group"><label>' + esc(f.label) + '</label>' +
        '<select id="es-' + f.key + '">' + (f.options||[]).map(function(o){
          return '<option value="' + esc(o.value) + '"' + (String(o.value)===String(f.value)?' selected':'') + '>' + esc(o.label) + '</option>';
        }).join('') + '</select></div>');
    }
    if(f.type === 'photo'){
      // Staged, not uploaded: the file is written to the device now and travels
      // with the record on the next sync.
      return _esWrap(f, '<div class="tx-field-group"><label>' + esc(f.label) + '</label>' +
        '<div class="es-photo" id="esp-' + f.key + '">' +
          '<button type="button" class="es-photo-btn" onclick="_esPhotoTake(\'' + f.key + '\')">' +
            '&#128247; ' + esc(T('Photograph the invoice')) + '</button>' +
        '</div>' +
        (f.hint ? '<div class="fi-sub" style="margin-top:5px;">' + esc(f.hint) + '</div>' : '') +
      '</div>');
    }
    if(f.type === 'toggle'){
      // Row, not a stacked label+input: a switch reads as an on/off setting,
      // and the hint carries the consequence so it is not a mystery flag.
      return _esWrap(f, '<div class="tx-field-group es-toggle-row">' +
        '<div><label style="margin:0;">' + esc(f.label) + '</label>' +
          (f.hint ? '<div class="fi-sub">' + esc(f.hint) + '</div>' : '') + '</div>' +
        '<label class="es-switch"><input id="es-' + f.key + '" type="checkbox"' +
          (f.value ? ' checked' : '') + '><span class="es-slider"></span></label>' +
      '</div>');
    }
    return _esWrap(f, '<div class="tx-field-group"><label>' + esc(f.label) + '</label>' +
      '<input id="es-' + f.key + '" type="' + (f.type||'text') + '"' +
      (f.readOnly ? ' readonly' : '') +
      (f.step ? ' step="' + f.step + '"' : '') +
      (f.type === 'number' ? ' inputmode="decimal"' : '') +
      ' value="' + esc(f.value == null ? '' : f.value) + '"' +
      (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>' +
      // Hint goes AFTER the input closes — inside the tag it just emitted a
      // stray ">" onto the sheet.
      (f.hint ? '<div class="fi-sub" style="margin-top:5px;">' + esc(f.hint) + '</div>' : '') +
      '</div>');
  }).join('');

  // Apply the conditions now, and again whenever a field they depend on moves.
  _esApplyConditions();
  fields.forEach(function(f){
    if(!f.showWhen) return;
    var key = Object.keys(f.showWhen)[0];
    var src = document.getElementById('es-' + key);
    if(src && !src._esBound){ src._esBound = true; src.addEventListener('change', _esApplyConditions); }
  });

  _sheetOnSave = function(){
    var out = {};
    fields.forEach(function(f){
      if(f.type === 'photo'){
        out[f.key] = _esPhotos[f.key] ? _esPhotos[f.key].name : '';
        return;
      }
      var el = document.getElementById('es-' + f.key);
      if(!el) return;
      if(f.readOnly) return;                              // display only
      var wrap = document.getElementById('esw-' + f.key);
      if(wrap && wrap.style.display === 'none') return;   // not on screen, not an answer
      out[f.key] = f.type === 'toggle' ? !!el.checked
                 : f.type === 'number' ? (parseFloat(el.value) || 0)
                 : el.value.trim();
    });
    // A handler returning false vetoes the close. Without this, a failed
    // validation showed a toast AND threw away everything the user typed —
    // which reads as the app losing the entry rather than rejecting it.
    if(onSave(out) === false) return;
    closeEntitySheet();
  };
  document.getElementById('entity-sheet-save').onclick = _sheetOnSave;
  document.getElementById('entity-sheet-overlay').classList.add('open');
}

function _esApplyConditions(){
  document.querySelectorAll('#entity-sheet-body .es-field[data-when-key]').forEach(function(w){
    var src = document.getElementById('es-' + w.getAttribute('data-when-key'));
    var want = w.getAttribute('data-when-val');
    var have = src ? (src.type === 'checkbox' ? String(!!src.checked) : String(src.value)) : null;
    w.style.display = (have === want) ? '' : 'none';
  });
}

function closeEntitySheet(){
  document.getElementById('entity-sheet-overlay').classList.remove('open');
  _sheetOnSave = null;
}

// ── Confirm dialog (promise-based, same contract as Harvest's) ────
var _confirmResolver = null;

function showConfirm(msg, title, icon, opts){
  opts = opts || {};
  document.getElementById('confirm-title').textContent = title || T('Are you sure?');
  document.getElementById('confirm-msg').textContent   = msg || '';
  document.getElementById('confirm-icon').textContent  = icon || '⚠️';

  // Some of these dialogs only report a reason — there is nothing to accept or
  // cancel. Offering "Delete" next to an explanation of why deleting is not
  // possible reads as an offer the app then refuses.
  var ok = document.querySelector('#confirm-overlay .confirm-btn-ok');
  var no = document.querySelector('#confirm-overlay .confirm-btn-cancel');
  if(ok) ok.textContent = opts.okLabel || T('Delete');
  if(no) no.style.display = opts.okOnly ? 'none' : '';
  if(ok && opts.okOnly) ok.textContent = T('OK');

  document.getElementById('confirm-overlay').classList.add('open');
  return new Promise(function(res){ _confirmResolver = res; });
}

function confirmResolve(v){
  document.getElementById('confirm-overlay').classList.remove('open');
  if(_confirmResolver){ _confirmResolver(v); _confirmResolver = null; }
}

// ── LOTS ─────────────────────────────────────────────────────────
function renderLots(){
  var host = document.getElementById('lots-body');
  if(!host) return;
  var lots = cycleLots().sort(function(a,b){ return (a.routeOrder||0)-(b.routeOrder||0); });

  if(!lots.length){ host.innerHTML = '<div class="fdp-empty">' + esc(T('No lots yet')) + '</div>'; return; }

  host.innerHTML = lots.map(function(l){
    var intake = intakePerHead(l.id, 7);
    var bunk = latestBunkScore(l.id);
    return '<div class="field-item" onclick="openLotDetail(\'' + l.id + '\')">' +
      '<div class="fi-left">' +
        '<div class="fi-name">' + esc(l.name) + (l.penCode ? ' <span class="fi-sub">· ' + esc(l.penCode) + '</span>' : '') + '</div>' +
        '<div class="fi-sub">' + (l.headCount||0) + ' ' + esc(T('head')) +
          (intake ? ' · ' + intake.dm.toFixed(1) + ' ' + esc(T('kg DM/head/day')) : '') +
          (bunk ? ' · ' + esc(T('bunk')) + ' ' + bunk.score : '') + '</div>' +
      '</div>' +
      '<div class="fi-right">' + (intake ? intake.asFed.toFixed(1) + ' kg' +
        '<div class="fi-sub">' + esc(T('per head/day')) + '</div>' : '—') + '</div>' +
    '</div>';
  }).join('');
}

function openLotSheet(id){
  var l = id ? lotById(id) : {};
  var rations = getRations().filter(function(r){ return r.active !== false; });
  // The group owns the ration whenever the pen is in one, so offering a pen
  // level ration here would just be a second value waiting to disagree.
  var grouped = id ? groupsForLot(id).length > 0 : false;
  openEntitySheet(id ? T('Edit Lot') : T('New Lot'), [
    { key:'name',        label:T('Name'),        value:l.name },
    { key:'penCode',     label:T('Lot code'),    value:l.penCode },
    { key:'headCount',   label:T('Head count'),  value:l.headCount, type:'number' },
    { key:'category',    label:T('Category'),    value:l.category, placeholder:T('steer, heifer…') },
    { key:'entryWeightKg',label:T('Entry weight (kg/head)'), value:l.entryWeightKg, type:'number', step:'0.1' },
    { key:'routeOrder',  label:T('Route order'), value:l.routeOrder, type:'number' },
    grouped
      ? { key:'rationGroupNote', label:T('Ration'), value: groupsForLot(id).map(function(g){ return g.name; }).join(', '),
          readOnly:true, hint:T('Set by the feed group this lot belongs to') }
      : { key:'rationId',  label:T('Ration'),      type:'select', value:l.rationId,
          options:[{value:'',label:'—'}].concat(rations.map(function(r){ return {value:r.id,label:r.name}; })) },
    // Off by default: a prompt on every pen, every unload, is the kind of thing
    // an operator taps through without looking — which records a confirmation
    // that never happened. Turn it on for the pens where the count actually moves.
    { key:'confirmHeadCount', label:T('Confirm head count at unload'), type:'toggle',
      value: !!l.confirmHeadCount, hint:T('Ask at the lot before recording the unload') }
  ], function(v){
    if(!v.name){ showToast(T('Name required'), 'warn'); return false; }
    v.id = id || null;
    if(id) v.id = id;
    saveLot(Object.assign({}, l, v));
    renderLots();
    showToast(T('Saved'), 'success');
  });
}

// ── INGREDIENTS ──────────────────────────────────────────────────
function renderIngredients(){
  var host = document.getElementById('ingredients-body');
  if(!host) return;
  var list = getIngredients().filter(function(i){ return i.active !== false; });

  if(!list.length){ host.innerHTML = '<div class="fdp-empty">' + esc(T('No ingredients yet')) + '</div>'; return; }

  host.innerHTML = list.map(function(i){
    // Cover is the reason to open this screen — surface it, and shout when short.
    // Headline is PLANNED demand, not trailing usage: trailing reads "no usage
    // yet" until a week of loads exists, which is exactly when you most need to
    // know what to order. Trailing is kept below as a cross-check.
    var pl = plannedRunway(i.id);
    var rw = ingredientRunway(i.id, 7);
    var drift = rationDriftPct(i.id, 7);
    var runway = pl ? (pl.daysLeft < 1000 ? Math.round(pl.daysLeft) + ' ' + T('days left') : '')
                    : T('not in any ration');
    var low = pl && pl.daysLeft < 7;
    var sh  = shrinkFor(i.id, 30);

    // A negative book balance is not a display glitch — it means feed went out
    // that no receipt accounts for. Say so rather than showing a quiet minus.
    var unrecorded = (i.stockKg || 0) < 0;

    return '<div class="ing-card' + (low || unrecorded ? ' low' : '') + '">' +
      '<div class="ing-head" onclick="openIngredientEditor(\'' + i.id + '\')">' +
        '<div class="fi-left">' +
          '<div class="fi-name">' + esc(i.name) + '</div>' +
          '<div class="fi-sub">' + (i.dmPct||100) + '% MS · ±' +
            Math.round(((i.tolPct||DEFAULT_TOL_PCT) - 100)) + '%' +
            (sh && sh.counted && sh.pct != null ? ' · ' + T('shrink') + ' ' + sh.pct.toFixed(1) + '%' : '') +
          '</div>' +
        '</div>' +
        '<div class="ing-stock">' +
          '<div class="ing-kg' + (unrecorded ? ' low' : '') + '">' +
            Math.round(i.stockKg||0).toLocaleString('es-PY') + ' kg</div>' +
          '<div class="ing-runway' + (low || unrecorded ? ' low' : '') + '">' +
            (unrecorded ? esc(T('unrecorded delivery?'))
                        : esc(runway) +
                          (pl ? ' · ' + Math.round(pl.perDayKg) + ' kg/' + esc(T('day')) : '') +
                          // Only worth showing once it is a real gap; small
                          // day-to-day variance is noise, not a finding.
                          (drift != null && Math.abs(drift) >= 10
                            ? ' · <span class="ing-drift">' + (drift > 0 ? '+' : '') +
                              Math.round(drift) + '% ' + esc(T('vs ration')) + '</span>'
                            : '')) +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ing-actions">' +
        '<button class="ing-btn" onclick="openDeliverySheet(\'' + i.id + '\')">+ ' + esc(T('Receive')) + '</button>' +
        '<button class="ing-btn" onclick="openCountSheet(\'' + i.id + '\')">' + esc(T('Count stock')) + '</button>' +
        '<button class="ing-btn" onclick="openIngredientEditor(\'' + i.id + '\')">' + esc(T('Edit')) + '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openIngredientSheet(id, onDone){
  var i = id ? ingredientById(id) : {};
  openEntitySheet(id ? T('Edit Ingredient') : T('New Ingredient'), [
    { key:'name',      label:T('Name'),            value:i.name },
    { key:'category',  label:T('Category'),        value:i.category, placeholder:T('forage, concentrate…') },
    { key:'dmPct',     label:T('Dry matter %'),    value:i.dmPct != null ? i.dmPct : 100, type:'number', step:'0.1' },
    // Stock is deliberately NOT editable here any more — it is the running
    // balance of the ledger. Typing over it would silently erase a shrink the
    // count was there to reveal. Use Receive / Count instead.

    // How far over target still counts as acceptable for THIS feed. Forage can
    // take 120; an NPN or mineral premix must be tightened.
    { key:'tolPct',    label:T('Green up to (% of target)'),
      value:i.tolPct != null ? i.tolPct : DEFAULT_TOL_PCT, type:'number', step:'1' }
  ], function(v){
    if(!v.name){ showToast(T('Name required'), 'warn'); return false; }
    if(id) v.id = id;
    var saved = saveIngredient(Object.assign({}, i, v));
    renderIngredients();
    showToast(T('Saved'), 'success');
    // Return to whoever sent us here, carrying the new ingredient with us.
    if(typeof onDone === 'function') setTimeout(function(){ onDone(saved); }, 60);
  });
}

// ── RATIONS ──────────────────────────────────────────────────────
function renderRations(){
  var newBtn = document.getElementById('btn-new-ration');
  if(newBtn) newBtn.style.display = rationEditsLocked() ? 'none' : '';

  var host = document.getElementById('rations-body');
  if(!host) return;
  var list = getRations().filter(function(r){ return r.active !== false; });

  if(!list.length){ host.innerHTML = '<div class="fdp-empty">' + esc(T('No rations yet')) + '</div>'; return; }

  host.innerHTML = list.map(function(r){
    var items = rationItemsFor(r.id);
    var kgHead = items.reduce(function(s,it){ return s + (it.kgPerHead||0); }, 0);
    var dm     = rationDmPct(r.id);
    var issues = rationIssues(r.id);
    return '<div class="card' + (issues.length ? ' ration-flagged' : '') + '"><div class="card-head">' +
        '<div class="card-title">' + esc(r.name) + '</div>' +
        '<div class="fi-sub">' + kgHead.toFixed(1) + ' ' + esc(T('kg/head')) +
          (dm != null ? ' · ' + Math.round(dm) + '% ' + esc(T('DM')) : '') +
          (r.mixMinutes > 0 ? ' · ' + r.mixMinutes + ' min ' + esc(T('mixing')) : '') + '</div>' +
      '</div><div class="card-body">' +
      // Say what is wrong on the card itself. Buried in an editor these are
      // exactly the problems that stay unnoticed until cattle are off feed.
      (issues.length
        ? '<div class="ration-issues">' + issues.map(function(t){
            return '<div class="ration-issue">' + esc(t) + '</div>'; }).join('') + '</div>'
        : '') +
      (items.length ? items.map(function(it){
        var ing = ingredientById(it.ingredientId);
        return '<div class="feed-steprow" onclick="openRationEditor(\'' + r.id + '\')">' +
          '<div class="feed-steprow-name">' + esc(ing ? ing.name : T('Unknown')) + '</div>' +
          '<div class="feed-steprow-kg">' + (it.kgPerHead||0).toFixed(2) + ' kg</div></div>';
      }).join('') : '<div class="fdp-empty">' + esc(T('No ingredients in this ration')) + '</div>') +
      (rationEditsLocked()
        ? '<div class="fdp-empty">' + esc(T('Managed on the desktop console')) + '</div>'
        // One door into the ration instead of three: order, amounts, add and
        // remove all live in the editor now.
        : '<button class="btn-add-open" onclick="openRationEditor(\'' + r.id + '\')">' + esc(T('Edit ration')) + '</button>' +
          '<button class="btn-del-sm" onclick="deleteRationConfirm(\'' + r.id + '\')">' + esc(T('Delete ration')) + '</button>') +
    '</div></div>';
  }).join('');
}

function openRationSheet(id){
  if(!guardRationEdit()) return;
  var r = id ? rationById(id) : {};
  openEntitySheet(id ? T('Edit Ration') : T('New Ration'), [
    { key:'name',  label:T('Name'),  value:r.name, placeholder:T('e.g. Fattening phase 1') },
    // Mixing time belongs on the ration: it is the nutritionist's call, and it
    // varies by recipe — a dry concentrate needs far less than a wet TMR.
    { key:'mixMinutes', label:T('Mixing time (minutes)'), value:r.mixMinutes, type:'number', step:'0.5' },
    { key:'notes', label:T('Notes'), value:r.notes }
  ], function(v){
    if(!v.name){ showToast(T('Name required'), 'warn'); return false; }
    if(id) v.id = id;
    saveRation(Object.assign({}, r, v));
    renderRations();
    showTab('stock');
    showToast(T('Saved'), 'success');
  });
}

var NEW_INGREDIENT = '__new__';

function openRationItemSheet(rationId, itemId, preselectId){
  if(!guardRationEdit()) return;
  var it = itemId ? getRationItems().find(function(x){ return x.id === itemId; }) : {};
  var ings = getIngredients().filter(function(i){ return i.active !== false; });

  // No products yet? Go straight to creating one and come back here. Bouncing
  // the user to another tab with a toast is how "I tapped Add and nothing
  // happened" happens.
  if(!ings.length){
    openIngredientSheet(null, function(created){
      openRationItemSheet(rationId, itemId, created && created.id);
    });
    return;
  }

  openEntitySheet(T('Ration ingredient'), [
    { key:'ingredientId', label:T('Ingredient'), type:'select',
      value: preselectId || it.ingredientId,
      // The last option creates a product without leaving the flow — otherwise
      // the only way to use a feed you have not entered yet is to abandon the
      // ration, go to Insumos, add it, and come back.
      options: ings.map(function(i){ return {value:i.id, label:i.name}; })
                   .concat([{ value:NEW_INGREDIENT, label:'+ ' + T('New Ingredient') }]) },
    // As-fed kg per head per day — the unit a nutritionist actually prescribes in.
    { key:'kgPerHead', label:T('kg per head/day'), value:it.kgPerHead, type:'number', step:'0.01' },
    { key:'seq',       label:T('Load order'),     value:it.seq, type:'number' }
  ], function(v){
    if(v.ingredientId === NEW_INGREDIENT) return false;   // handled by the change hook
    if(!v.ingredientId){ showToast(T('Choose an ingredient'), 'warn'); return false; }
    if(!(v.kgPerHead > 0)){ showToast(T('Enter kg per head'), 'warn'); return false; }
    v.rationId = rationId;
    if(itemId) v.id = itemId;
    saveRationItem(Object.assign({}, it, v));
    renderRations();
    showToast(T('Saved'), 'success');
  });

  var sel = document.getElementById('es-ingredientId');
  if(sel){
    sel.addEventListener('change', function(){
      if(this.value !== NEW_INGREDIENT) return;
      closeEntitySheet();
      openIngredientSheet(null, function(created){
        openRationItemSheet(rationId, itemId, created && created.id);
      });
    });
  }
}

async function deleteRationConfirm(id){
  if(!guardRationEdit()) return;
  var r = rationById(id);
  if(await showConfirm(T('This removes the ration and its ingredient list.'), (r&&r.name)||T('Delete ration'), '🗑️')){
    deleteRation(id);
    renderRations();
  }
}

// ── CYCLES ───────────────────────────────────────────────────────
function renderCycles(){
  var host = document.getElementById('cycle-body');
  if(!host) return;
  var list = getCycles();

  if(!list.length){ host.innerHTML = '<div class="fdp-empty">' + esc(T('No cycles yet')) + '</div>'; return; }

  // Same selected-row language as the group and operator pickers: the tinted
  // row IS the selection, so no tick is needed. The pill stays because "active"
  // is a fact about the cycle, not just which row your finger last touched.
  host.innerHTML = list.map(function(c){
    var on = c.id === activeCycleId;
    return '<div class="gsel-row' + (on ? ' on' : '') + '" onclick="setActiveCycle(\'' + c.id + '\');renderCycles();">' +
      '<div class="gsel-main">' +
        '<div class="gsel-name">' + esc(c.name) + '</div>' +
        '<div class="gsel-sub">' + esc(c.startDate || '') + '</div>' +
      '</div>' +
      (on ? '<span class="gsel-pill">' + esc(T('Active')) + '</span>' : '') +
    '</div>';
  }).join('');
}

function openAddCycleSheet(){
  openEntitySheet(T('New Cycle'), [
    { key:'name',      label:T('Name'),       placeholder:T('e.g. Fattening 2026') },
    { key:'startDate', label:T('Start date'), type:'date', value:new Date().toISOString().slice(0,10) }
  ], function(v){
    if(!v.name){ showToast(T('Name required'), 'warn'); return false; }
    var c = saveCycle(v);
    setActiveCycle(c.id);
    renderCycles();
    renderFeedTab();
  });
}

function saveCycle(c){
  if(!c.id) c.id = uid();
  if(c.active === undefined) c.active = true;
  return _upsert(getCycles(), saveCycles, 'vf_cycles', c);
}

function openCyclePanel(){
  renderCycles();
  document.getElementById('sp-cycle').classList.add('open');
}


// ── Stock: receive a delivery ────────────────────────────────────
// The single-product receive sheet lived here. Deliveries arrive as one truck
// with one invoice and several products, so it was replaced by
// openDeliverySheet() in 37-delivery.js — a card's Receive button now opens
// that sheet with the product already on the first line.

// ── Stock: physical count ────────────────────────────────────────
function openCountSheet(id){
  var i = ingredientById(id); if(!i) return;
  var book = Math.round(i.stockKg || 0);
  openEntitySheet(T('Count stock') + ' — ' + i.name, [
    { key:'countedKg', label:T('Measured in store (kg)'), type:'number', step:'1', value:book },
    { key:'note',      label:T('Note'), value:'' }
  ], function(v){
    if(v.countedKg == null || v.countedKg < 0){ showToast(T('Enter an amount'), 'warn'); return false; }
    var diff = v.countedKg - book;
    countStock(id, v.countedKg, v.note);
    renderIngredients();
    // Name the gap out loud — a silent correction is exactly how shrink stays
    // invisible, which is the problem this feature exists to solve.
    showToast(Math.abs(diff) < 1 ? T('Stock matches the book')
      : (diff < 0 ? Math.round(-diff) + ' kg ' + T('missing') : '+' + Math.round(diff) + ' kg ' + T('found')),
      diff < 0 ? 'warn' : 'success');
  });
}

// ══════════════════════════════════════════════════════════════════
//  INGREDIENT SHEET
//  What the product IS, and the ledger that explains its balance. Receiving
//  and counting stay on the card: this sheet is for editing, and mixing an
//  action that writes kilos in with the fields you are typing invites the
//  wrong tap.
// ══════════════════════════════════════════════════════════════════
var _ieId = null;

function openIngredientEditor(id){
  var i = ingredientById(id);
  if(!i) return;
  _ieId = id;
  document.getElementById('ie-title').textContent = i.name || T('Ingredient');
  _renderIngredientEditor();
  document.getElementById('ing-edit-overlay').classList.add('open');
}

function closeIngredientEditor(){
  document.getElementById('ing-edit-overlay').classList.remove('open');
  _ieId = null;
  renderIngredients();
}

function _renderIngredientEditor(){
  var i = ingredientById(_ieId);
  if(!i) return;
  var pl = plannedRunway(_ieId);
  var sh = shrinkFor(_ieId, 30);

  var sub = document.getElementById('ie-sub');
  if(sub){
    sub.textContent = Math.round(i.stockKg||0).toLocaleString('es-PY') + ' kg' +
      (pl ? ' · ' + Math.round(pl.daysLeft) + ' ' + T('days left') : '');
  }

  var moves = stockMovesFor(_ieId, 6);
  var kindLbl = { receipt: T('Received'), feed: T('Fed'), count: T('Counted'), adjust: T('Adjusted') };

  document.getElementById('ie-body').innerHTML =
    // ── what it is ──
    '<div class="gp-sec-lbl">' + esc(T('Details')) + '</div>' +
    '<div class="tx-field-group"><label data-en-skip>' + esc(T('Name')) + '</label>' +
      '<input type="text" id="ie-name" value="' + esc(i.name || '') + '"></div>' +
    '<div class="ld-two">' +
      '<div class="tx-field-group"><label data-en-skip>' + esc(T('Dry matter %')) + '</label>' +
        '<input type="number" inputmode="decimal" step="0.1" id="ie-dm" value="' + (i.dmPct != null ? i.dmPct : 100) + '"></div>' +
      '<div class="tx-field-group"><label data-en-skip>' + esc(T('Tolerance ±%')) + '</label>' +
        '<input type="number" inputmode="decimal" step="1" id="ie-tol" value="' +
          Math.round((i.tolPct || DEFAULT_TOL_PCT) - 100) + '"></div>' +
    '</div>' +
    '<div class="tx-field-group"><label data-en-skip>' + esc(T('Category')) + '</label>' +
      '<input type="text" id="ie-cat" value="' + esc(i.category || '') + '" placeholder="' + esc(T('forage, concentrate…')) + '"></div>' +
    (sh && sh.counted && sh.pct != null
      ? '<div class="fi-sub" style="padding:2px 2px 6px;">' + esc(T('shrink')) + ' ' + sh.pct.toFixed(1) + '% ' +
        esc(T('over the last 30 days')) + '</div>' : '') +

    // ── the ledger, so the actions above have visible consequences ──
    '<div class="gp-sec-lbl">' + esc(T('Recent movements')) + '</div>' +
    (moves.length
      ? moves.map(function(m){
          var sign = m.deltaKg > 0 ? '+' : '';
          return '<div class="ie-move">' +
            '<div><div class="ie-move-kind">' + esc(kindLbl[m.kind] || m.kind) +
              // A camera means there is paper behind this number.
              ((m.photoPath || m.photoLocal)
                ? ' <span class="ie-move-cam" onclick="event.stopPropagation();openInvoiceViewer(\'' + m.id + '\')">&#128247;</span>'
                : '') + '</div>' +
            '<div class="fi-sub">' + (m.at ? new Date(m.at).toLocaleString('es-PY',
                {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '') +
              (m.supplier ? ' · ' + esc(m.supplier) : '') +
              (m.photoLocal && !m.photoPath ? ' · ' + esc(T('photo pending upload')) : '') + '</div></div>' +
            '<div class="ie-move-kg' + (m.deltaKg < 0 ? ' out' : '') + '">' +
              sign + Math.round(m.deltaKg).toLocaleString('es-PY') + ' kg</div>' +
          '</div>';
        }).join('')
      : '<div class="fdp-empty">' + esc(T('Nothing recorded yet')) + '</div>');
}

function saveIngredientEditor(){
  var i = ingredientById(_ieId);
  if(!i) return;
  var name = (document.getElementById('ie-name').value || '').trim();
  if(!name){ showToast(T('Name required'), 'warn'); return; }

  i.name = name;
  i.dmPct = parseFloat(document.getElementById('ie-dm').value);
  if(!(i.dmPct > 0 && i.dmPct <= 100)) i.dmPct = 100;
  // Stored as the ration bars use it: 100 + the ± the operator typed.
  var tol = parseFloat(document.getElementById('ie-tol').value);
  i.tolPct = (tol >= 0) ? 100 + tol : DEFAULT_TOL_PCT;
  i.category = (document.getElementById('ie-cat').value || '').trim() || null;
  // Stock is deliberately NOT editable here: it is the running balance of the
  // ledger. Typing over it would erase the shrink a count exists to reveal.
  saveIngredient(i);

  closeIngredientEditor();
  showToast(name + ' · ' + T('Saved'), 'success');
}

// ── Entity sheet: photo field ────────────────────────────────────
async function _esPhotoTake(key){
  var shot = await invoiceCapture();
  if(!shot) return;
  _esPhotos[key] = shot;
  _esPhotoPaint(key);
}

function _esPhotoDrop(key){
  var shot = _esPhotos[key];
  if(shot) invoiceDeleteLocal(shot.name);   // never saved, so nothing references it
  delete _esPhotos[key];
  _esPhotoPaint(key);
}

function _esPhotoPaint(key){
  var host = document.getElementById('esp-' + key);
  if(!host) return;
  var shot = _esPhotos[key];
  host.innerHTML = shot
    ? '<div class="es-photo-has">' +
        '<img src="' + shot.dataUrl + '" alt="">' +
        '<div class="es-photo-side">' +
          '<div class="es-photo-ok">&#10003; ' + esc(T('Attached')) + '</div>' +
          '<button type="button" class="es-photo-x" onclick="_esPhotoDrop(\'' + key + '\')">' +
            esc(T('Remove')) + '</button>' +
        '</div>' +
      '</div>'
    : '<button type="button" class="es-photo-btn" onclick="_esPhotoTake(\'' + key + '\')">' +
        '&#128247; ' + esc(T('Photograph the invoice')) + '</button>';
}

async function deleteIngredientConfirm(){
  var i = ingredientById(_ieId);
  if(!i) return;
  var use = ingredientUsage(_ieId);

  // A ration that lists this product would quietly start mixing without it.
  // Refuse and name the rations rather than deleting and leaving a gap nobody
  // sees until the next load comes out wrong.
  if(use.rations.length){
    await showConfirm(
      T('Remove it from these rations first:') + ' ' + use.rations.join(', '),
      T('In use by a ration'), '⚠️', { okOnly: true });
    return;
  }

  var warn = [];
  if(use.stockKg > 0){
    warn.push(Math.round(use.stockKg).toLocaleString('es-PY') + ' kg ' + T('still on hand'));
  }
  if(use.moves){
    // The moves stay: they snapshot the name, so the history still reads.
    warn.push(use.moves + ' ' + T('past movements stay in the history'));
  }

  if(await showConfirm(warn.join(' · ') || T('This removes the ingredient.'), i.name, '🗑️')){
    deleteIngredient(_ieId);
    closeIngredientEditor();
    showToast(i.name + ' · ' + T('Deleted'), 'success');
  }
}
