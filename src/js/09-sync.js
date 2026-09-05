function _getDirty(){ try{ return JSON.parse(localStorage.getItem(LS_DIRTY)||'{}'); }catch(e){ return {}; } }
function _saveDirty(d){ try{ localStorage.setItem(LS_DIRTY, JSON.stringify(d)); }catch(e){} }
function _dirtyBucket(d, table){ return (d[table] = d[table] || {ids:[], deleted:[]}); }

function _markDirty(table, key){
  if(!table || key===undefined || key===null) return;
  var d = _getDirty(), t = _dirtyBucket(d, table), k = String(key);
  if(t.ids.indexOf(k)===-1) t.ids.push(k);
  // Re-creating an id retracts its pending deletion.
  t.deleted = (t.deleted||[]).filter(function(x){ return x!==k; });
  _saveDirty(d);
}

function _markDeleted(table, key){
  if(!table || key===undefined || key===null) return;
  var d = _getDirty(), t = _dirtyBucket(d, table), k = String(key);
  t.ids = (t.ids||[]).filter(function(x){ return x!==k; });
  if(t.deleted.indexOf(k)===-1) t.deleted.push(k);
  _saveDirty(d);
}

function _clearDirty(table, keys){
  var d = _getDirty(), t = d[table];
  if(!t) return;
  var s = {}; (keys||[]).forEach(function(k){ s[String(k)] = 1; });
  t.ids = (t.ids||[]).filter(function(x){ return !s[x]; });
  _saveDirty(d);
}

function _clearDeleted(table, keys){
  var d = _getDirty(), t = d[table];
  if(!t) return;
  var s = {}; (keys||[]).forEach(function(k){ s[String(k)] = 1; });
  t.deleted = (t.deleted||[]).filter(function(x){ return !s[x]; });
  _saveDirty(d);
}

function _isDirty(table, key){
  var t = _getDirty()[table];
  return !!(t && t.ids && t.ids.indexOf(String(key))!==-1);
}
function _dirtyIds(table){ var t=_getDirty()[table]; return (t && t.ids) || []; }
function _deletedIds(table){ var t=_getDirty()[table]; return (t && t.deleted) || []; }

// Cloud wins, except for items this device changed and hasn't uploaded yet.
function _reconcileConfig(table, cloudItems, localItems, keyOf){
  var seen = {};
  cloudItems.forEach(function(c){ seen[String(keyOf(c))] = true; });
  var out = cloudItems.slice();
  localItems.forEach(function(l){
    var k = String(keyOf(l));
    if(!seen[k] && _isDirty(table, k)) out.push(l);
  });
  return out;
}

async function _pushConfig(table, row, key){
  var k = (key!==undefined && key!==null) ? key : row.id;
  // Record the change before attempting it — if this push fails or we're
  // offline, the batch pushConfig() retries it and the pull won't drop it.
  _markDirty(table, k);
  var sb = getSupabase();
  if(!sb || !currentWorker || !currentWorker.id) return;
  try{
    var result = await sb.from(table).upsert(row);
    if(result.error){ console.warn('Push config error ('+table+'):', result.error.message); return; }
    _clearDirty(table, [k]);
  } catch(e){ console.warn('Push config exception:', e); }
}

// ── Delete a config item from Supabase ──
async function _deleteConfig(table, id){
  _markDeleted(table, id);
  var sb = getSupabase();
  if(!sb || !currentWorker || !currentWorker.id) return;
  try{
    var result = await sb.from(table).delete().eq('id', id).eq('user_id', currentWorker.id);
    if(result.error){ console.warn('Delete config error ('+table+'):', result.error.message); return; }
    _clearDeleted(table, [id]);
  } catch(e){ console.warn('Delete config exception:', e); }
}

// ── Desktop-owned switches ───────────────────────────────────────
// Pull-only, and deliberately outside SYNC_ENTITIES: one row per account
// rather than an id-keyed collection. A missing row, a missing table or a
// failed request leaves the last known value alone and never falls back to
// locked -- stranding an operator mid-shift is worse than a late unlock.
async function refreshAppSettings(){
  var sb = getSupabase();
  // Must go through _requireSession, not a bare currentWorker.id test: a device
  // can hold a valid Supabase session while currentWorker has not been rehydrated
  // with the account id yet, and testing the id directly silently no-ops forever.
  if(!sb || !await _requireSession(sb)) return false;
  try{
    var res = await sb.from('vf_settings').select('*')
                      .eq('user_id', currentWorker.id).maybeSingle();
    if(!res || !res.data) return false;
    var before = localStorage.getItem(LS_SETTINGS);
    var after  = JSON.stringify(res.data);
    if(before === after) return false;
    localStorage.setItem(LS_SETTINGS, after);
    // The rations screen renders its buttons from this, so it has to repaint
    // or the switch appears to do nothing until the next navigation.
    if(typeof renderRations === 'function') renderRations();
    return true;
  }catch(e){ console.warn('[settings] refresh skipped:', e); return false; }
}

// Coming back to the app is the moment the value is most likely stale.
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible') refreshAppSettings();
});

// ── Pull ALL config from Supabase and merge into localStorage ──
var _syncing = false;

// Both the header circle and Settings ▸ Sync call this. They were already wired,
// but gave no feedback at all — no press state, no spinner, no result — so a
// working sync was indistinguishable from a dead button.
async function fullSync(){
  if(_syncing) return;                     // double-tap would run two syncs at once
  _syncing = true;
  var circle = document.getElementById('sync-circle');
  if(circle) circle.classList.add('syncing');
  try{
    await syncQueue();                     // push local -> cloud
    await pullConfig();                    // pull cloud -> local (incl. weighings)
    showToast(T('Sync complete'), 'success');
  }catch(e){
    console.warn('[sync] failed:', e);
    showToast(T('Sync failed')+' — '+((e && e.message) || e), 'error');
  }finally{
    _syncing = false;
    if(circle) circle.classList.remove('syncing');
  }
}

// ══════════════════════════════════════════════════════════════════
//  ENTITY REGISTRY
//  Harvest hand-wrote a pull branch, a push branch, a syncX() and a
//  deleteSyncX() for every table. Each new entity meant four edits in
//  four places, and the bugs came from the places that got missed.
//  Here every entity is one row and the engine loops.
// ══════════════════════════════════════════════════════════════════
// The FIFO allocation travels as snake_case like every other column, so the
// console and the app read each other's rows without a shape check.
function _allocToCloud(list){
  if(!list || !list.length) return null;
  return list.map(function(a){
    return { move_id: a.moveId || null, kg: a.kg, cost_per_kg: a.costPerKg };
  });
}
function _allocFromCloud(list){
  if(!list || !list.length) return null;
  return list.map(function(a){
    return { moveId: a.move_id || null, kg: a.kg, costPerKg: a.cost_per_kg };
  });
}

var SYNC_ENTITIES = [
  { table:'vf_cycles', ls:LS_CYCLES,
    toCloud:   function(r){ return {id:r.id, name:r.name, start_date:r.startDate||null, end_date:r.endDate||null, active:r.active!==false}; },
    fromCloud: function(r){ return {id:r.id, name:r.name, startDate:r.start_date, endDate:r.end_date, active:r.active!==false}; } },

  { table:'vf_ingredients', ls:LS_INGREDIENTS,
    toCloud:   function(r){ return {id:r.id, name:r.name, category:r.category||null, dm_pct:r.dmPct!=null?r.dmPct:100, cost_per_kg:r.costPerKg||0, currency:r.currency||'PYG', stock_kg:r.stockKg||0, tol_pct:r.tolPct||null, active:r.active!==false}; },
    fromCloud: function(r){ return {id:r.id, name:r.name, category:r.category, dmPct:r.dm_pct, costPerKg:r.cost_per_kg, currency:r.currency, stockKg:r.stock_kg, tolPct:r.tol_pct, active:r.active!==false}; } },

  { table:'vf_rations', ls:LS_RATIONS,
    toCloud:   function(r){ return {id:r.id, name:r.name, version:r.version||1, notes:r.notes||null, mix_minutes:r.mixMinutes||null, active:r.active!==false}; },
    fromCloud: function(r){ return {id:r.id, name:r.name, version:r.version, notes:r.notes, mixMinutes:r.mix_minutes, active:r.active!==false}; } },

  { table:'vf_ration_items', ls:LS_RATION_ITEMS,
    toCloud:   function(r){ return {id:r.id, ration_id:r.rationId, ingredient_id:r.ingredientId, kg_per_head:(r.pctOfMix!=null?null:(r.kgPerHead||0)), pct_of_mix:(r.pctOfMix!=null?r.pctOfMix:null), manual_add:!!r.manualAdd, seq:r.seq||0}; },
    fromCloud: function(r){ return {id:r.id, rationId:r.ration_id, ingredientId:r.ingredient_id, kgPerHead:r.kg_per_head, dmKgPerHead:r.dm_kg_per_head, pctOfMix:r.pct_of_mix, seq:r.seq}; } },

  { table:'vf_lots', ls:LS_LOTS,
    toCloud:   function(r){ return {id:r.id, cycle_id:r.cycleId||null, name:r.name, pen_code:r.penCode||null, head_count:r.headCount||0, category:r.category||null, entry_date:r.entryDate||null, entry_weight_kg:r.entryWeightKg||null, target_weight_kg:r.targetWeightKg||null, ration_id:r.rationId||null, meals_per_day:r.mealsPerDay||2, route_order:r.routeOrder||0, feed_factor:r.feedFactor||1, confirm_head_count:!!r.confirmHeadCount, head_count_confirmed_at:r.headCountConfirmedAt||null, avg_weight_kg:r.avgWeightKg||null, avg_age_months:r.avgAgeMonths||null, active:r.active!==false, notes:r.notes||null}; },
    fromCloud: function(r){ return {id:r.id, cycleId:r.cycle_id, name:r.name, penCode:r.pen_code, headCount:r.head_count, category:r.category, entryDate:r.entry_date, entryWeightKg:r.entry_weight_kg, targetWeightKg:r.target_weight_kg, rationId:r.ration_id, mealsPerDay:r.meals_per_day, routeOrder:r.route_order, feedFactor:r.feed_factor, confirmHeadCount:!!r.confirm_head_count, headCountConfirmedAt:r.head_count_confirmed_at, avgWeightKg:r.avg_weight_kg, avgAgeMonths:r.avg_age_months, active:r.active!==false, notes:r.notes}; } },

  { table:'vf_operators', ls:LS_OPERATORS,
    toCloud:   function(r){ return {id:r.id, name:r.name, role:r.role||null, active:r.active!==false}; },
    fromCloud: function(r){ return {id:r.id, name:r.name, role:r.role, active:r.active!==false}; } },

  // Cloud owns the mixer's identity; the BLE binding stays on this device,
  // because "which scale is paired to this tablet" is not a fact about the mixer.
  { table:'vf_mixers', ls:LS_MIXERS,
    toCloud:   function(r){ return {id:r.id, name:r.name, capacity_kg:r.capacityKg||null, min_load_kg:r.minLoadKg||null, serial:r.serial||null}; },
    fromCloud: function(r){ return {id:r.id, name:r.name, capacityKg:r.capacity_kg, minLoadKg:r.min_load_kg, serial:r.serial}; },
    merge:     function(cloudRow, localRow){
                 cloudRow.deviceId   = (localRow && localRow.deviceId)   || null;
                 cloudRow.deviceName = (localRow && localRow.deviceName) || (cloudRow.serial ? 'serial '+cloudRow.serial : null);
                 return cloudRow;
               } },

  // ── Records ──
  { table:'vf_feedings', ls:LS_FEEDINGS, record:true,
    toCloud:   function(r){ return {id:r.id, cycle_id:r.cycleId||null, mixer_id:r.mixerId||null, mixer_name:r.mixerName||null, group_id:r.groupId||null, group_name:r.groupName||null, ration_id:r.rationId||null, ration_name:r.rationName||null, operator_name:r.operatorName||null, meal:r.meal||null, meal_index:r.mealIndex||null, status:r.status||'done', started_at:r.startedAt||null, finished_at:r.finishedAt||null, load_started_at:r.loadStartedAt||null, load_finished_at:r.loadFinishedAt||null, mix_started_at:r.mixStartedAt||null, mix_required_sec:r.mixRequiredSec||null, mix_actual_sec:r.mixActualSec||null, unloaded_early:!!r.unloadedEarly, delivery_started_at:r.deliveryStartedAt||null, delivery_status:r.deliveryStatus||null, delivery_minutes_off:r.deliveryMinutesOff!=null?r.deliveryMinutesOff:null, total_loaded_kg:r.totalLoadedKg||0, total_delivered_kg:r.totalDeliveredKg||0, carryover_kg:r.carryoverKg||0, lat:r.lat||null, lng:r.lng||null}; },
    fromCloud: function(r){ return {id:r.id, cycleId:r.cycle_id, mixerId:r.mixer_id, mixerName:r.mixer_name, groupId:r.group_id, groupName:r.group_name, rationId:r.ration_id, rationName:r.ration_name, operatorName:r.operator_name, meal:r.meal, mealIndex:r.meal_index, status:r.status, startedAt:r.started_at, finishedAt:r.finished_at, loadStartedAt:r.load_started_at, loadFinishedAt:r.load_finished_at, mixStartedAt:r.mix_started_at, mixRequiredSec:r.mix_required_sec, mixActualSec:r.mix_actual_sec, unloadedEarly:r.unloaded_early, deliveryStartedAt:r.delivery_started_at, deliveryStatus:r.delivery_status, deliveryMinutesOff:r.delivery_minutes_off, totalLoadedKg:r.total_loaded_kg, totalDeliveredKg:r.total_delivered_kg, carryoverKg:r.carryover_kg, lat:r.lat, lng:r.lng}; } },

  { table:'vf_feed_loads', ls:LS_LOADS, record:true,
    toCloud:   function(r){ return {id:r.id, feeding_id:r.feedingId, ingredient_id:r.ingredientId||null, ingredient_name:r.ingredientName||null, target_kg:r.targetKg||0, actual_kg:r.actualKg, manual:!!r.manual, seq:r.seq||0, at:r.at||null, unit_cost:r.unitCost!=null?r.unitCost:null, cost:r.cost!=null?r.cost:null}; },
    fromCloud: function(r){ return {id:r.id, feedingId:r.feeding_id, ingredientId:r.ingredient_id, ingredientName:r.ingredient_name, targetKg:r.target_kg, actualKg:r.actual_kg, manual:r.manual, seq:r.seq, at:r.at, unitCost:r.unit_cost, cost:r.cost}; } },

  { table:'vf_feed_deliveries', ls:LS_DELIVERIES, record:true,
    toCloud:   function(r){ return {id:r.id, feeding_id:r.feedingId, lot_id:r.lotId||null, lot_name:r.lotName||null, head_count:r.headCount||0, kg_per_head:r.kgPerHead||null, dm_kg_per_head:r.dmKgPerHead||null, target_kg:r.targetKg||0, actual_kg:r.actualKg, seq:r.seq||0, at:r.at||null}; },
    fromCloud: function(r){ return {id:r.id, feedingId:r.feeding_id, lotId:r.lot_id, lotName:r.lot_name, headCount:r.head_count, kgPerHead:r.kg_per_head, targetKg:r.target_kg, actualKg:r.actual_kg, seq:r.seq, at:r.at}; } },

  { table:'vf_feed_groups', ls:LS_GROUPS,
    toCloud:   function(r){ return {id:r.id, cycle_id:r.cycleId||null, name:r.name, ration_id:r.rationId||null, meals_per_day:r.mealsPerDay||2, meal_splits:r.mealSplits||null, meal_windows:r.mealWindows||null, route_order:r.routeOrder||0, intake_mode:r.intakeMode||null, intake_kg_per_head:r.intakeKgPerHead||null, intake_bw_pct:r.intakeBwPct||null, active:r.active!==false, notes:r.notes||null}; },
    fromCloud: function(r){ return {id:r.id, cycleId:r.cycle_id, name:r.name, rationId:r.ration_id, mealsPerDay:r.meals_per_day, mealSplits:r.meal_splits, mealWindows:r.meal_windows, routeOrder:r.route_order, intakeMode:r.intake_mode, intakeKgPerHead:r.intake_kg_per_head, intakeBwPct:r.intake_bw_pct, active:r.active!==false, notes:r.notes}; } },

  { table:'vf_lot_groups', ls:LS_LOT_GROUPS,
    toCloud:   function(r){ return {id:r.id, lot_id:r.lotId, group_id:r.groupId, seq:r.seq||0}; },
    fromCloud: function(r){ return {id:r.id, lotId:r.lot_id, groupId:r.group_id, seq:r.seq}; } },

  { table:'vf_feed_returns', ls:LS_RETURNS, record:true,
    toCloud:   function(r){ return {id:r.id, batch_id:r.batchId||null, cycle_id:r.cycleId||null, lot_id:r.lotId||null, lot_name:r.lotName||null, group_id:r.groupId||null, feeding_id:r.feedingId||null, kg:r.kg, head_count:r.headCount||0, operator_name:r.operatorName||null, consumed:!!r.consumed, note:r.note||null, at:r.at||null}; },
    fromCloud: function(r){ return {id:r.id, batchId:r.batch_id, cycleId:r.cycle_id, lotId:r.lot_id, lotName:r.lot_name, groupId:r.group_id, feedingId:r.feeding_id, kg:r.kg, headCount:r.head_count, operatorName:r.operator_name, consumed:r.consumed, note:r.note, at:r.at}; } },

  { table:'vf_stock_moves', ls:LS_STOCK_MOVES, record:true,
    toCloud:   function(r){ return {id:r.id, ingredient_id:r.ingredientId, ingredient_name:r.ingredientName||null, kind:r.kind, delta_kg:r.deltaKg, balance_kg:r.balanceKg||null, counted_kg:r.countedKg||null, cost_per_kg:r.costPerKg||null, total_cost:r.totalCost||null, unit_cost:r.unitCost!=null?r.unitCost:null, cost:r.cost!=null?r.cost:null, allocation:_allocToCloud(r.allocation), supplier:r.supplier||null, note:r.note||null, photo_path:r.photoPath||null, delivery_id:r.deliveryId||null, at:r.at||null}; },
    fromCloud: function(r){ return {id:r.id, ingredientId:r.ingredient_id, ingredientName:r.ingredient_name, kind:r.kind, deltaKg:r.delta_kg, balanceKg:r.balance_kg, countedKg:r.counted_kg, costPerKg:r.cost_per_kg, totalCost:r.total_cost, unitCost:r.unit_cost, cost:r.cost, allocation:_allocFromCloud(r.allocation), supplier:r.supplier, note:r.note, photoPath:r.photo_path, deliveryId:r.delivery_id, at:r.at}; } },

  { table:'vf_weigh_ins', ls:LS_WEIGHINS, record:true,
    toCloud:   function(r){ return {id:r.id, lot_id:r.lotId||null, lot_name:r.lotName||null, cycle_id:r.cycleId||null, avg_weight_kg:r.avgWeightKg, avg_age_months:r.avgAgeMonths||null, head_count:r.headCount||0, at:r.at||null}; },
    fromCloud: function(r){ return {id:r.id, lotId:r.lot_id, lotName:r.lot_name, cycleId:r.cycle_id, avgWeightKg:r.avg_weight_kg, avgAgeMonths:r.avg_age_months, headCount:r.head_count, at:r.at}; } },

  { table:'vf_bunk_scores', ls:LS_BUNK, record:true,
    toCloud:   function(r){ return {id:r.id, lot_id:r.lotId||null, lot_name:r.lotName||null, cycle_id:r.cycleId||null, score:r.score, suggested_pct:r.suggestedPct, applied_pct:r.appliedPct, factor_after:r.factorAfter, operator_name:r.operatorName||null, at:r.at||null}; },
    fromCloud: function(r){ return {id:r.id, lotId:r.lot_id, lotName:r.lot_name, cycleId:r.cycle_id, score:r.score, suggestedPct:r.suggested_pct, appliedPct:r.applied_pct, factorAfter:r.factor_after, operatorName:r.operator_name, at:r.at}; } }
];

function _byId(r){ return r.id; }

// Recover currentWorker.id from the live session if it was lost.
async function _requireSession(sb){
  if(!sb) return false;
  try{
    var res  = await sb.auth.getSession();
    var sess = res && res.data && res.data.session;

    // A WebView that was killed and relaunched comes back with a STORED BUT
    // EXPIRED token: getSession() still reports a session, so anything that
    // only asks "are we signed in?" says yes, and then every PostgREST call
    // fails with PGRST303 "JWT expired" -- the app shows stale cached data and
    // never says why.
    //
    // expires_at cannot be used to predict this: it is compared against the
    // DEVICE clock, and a tablet (or emulator) with a wrong date will happily
    // believe a dead token is still good. Ask the server instead -- getUser()
    // validates the token server-side -- and refresh when it says no.
    if(sess){
      var chk = await sb.auth.getUser();
      if(chk && chk.error){
        var rr = await sb.auth.refreshSession();
        if(rr && rr.error){
          console.warn('Session refresh failed:', rr.error.message);
          sess = null;                      // genuinely signed out
        } else {
          sess = (rr && rr.data && rr.data.session) || null;
        }
      }
    }

    var user = sess && sess.user;
    if(user){
      currentWorker = currentWorker || {};
      currentWorker.id    = user.id;
      currentWorker.email = user.email;
      localStorage.setItem(LS_WORKER, JSON.stringify(currentWorker));
    } else if(!sess){
      return false;               // no usable token: do not claim we are signed in
    }
  } catch(e){ console.warn('Session recovery failed:', e); }
  return !!(currentWorker && currentWorker.id);
}

// ══ PULL: cloud → local ══
async function pullConfig(){
  var sb = getSupabase();
  // A recovery session must not be promoted to logged-in until the password is set.
  if(window._isRecoveryFlow || window._showPasswordReset) return false;
  if(!await _requireSession(sb)){ showToast(T('Sign in required to sync'),'warn'); return false; }
  var uidv = currentWorker.id;

  try{
    showToast(T('Pulling…'), '');

    var results = await Promise.all(SYNC_ENTITIES.map(function(e){
      return Promise.resolve(sb.from(e.table).select('*').eq('user_id', uidv))
        .then(function(r){ return r; }, function(){ return {data:null}; });
    }));

    SYNC_ENTITIES.forEach(function(e, i){
      var res = results[i];
      if(!res || !res.data) return;                       // table missing / offline: leave local alone

      var local = _lsGet(e.ls);
      var cloud = res.data.map(function(r){
        var row = e.fromCloud(r);
        if(e.merge) row = e.merge(row, local.find(function(l){ return l.id === row.id; }));
        return row;
      });

      // Cloud wins, except rows this device changed and hasn't uploaded.
      // Keeping every local-only row is what used to resurrect deleted ones.
      _lsSet(e.ls, _reconcileConfig(e.table, cloud, local, _byId));
    });

    await refreshAppSettings();

    localStorage.setItem('vf_last_sync', String(Date.now()));
    // Runs before the repaint: the account's real cycle has to be selected
    // before any screen reads from it, or the first frame renders empty.
    if(typeof _adoptCloudCycle === 'function') _adoptCloudCycle();
    if(typeof _healActiveMixer === 'function') _healActiveMixer();
    if(typeof renderAll === 'function') renderAll();
    return true;
  } catch(e){
    console.warn('pullConfig error:', e);
    return false;
  }
}

// ══ PUSH: local → cloud ══
async function pushConfig(){
  var sb = getSupabase();
  if(!await _requireSession(sb)) return false;
  var uidv = currentWorker.id;

  try{
    // Photos first: the upload sets photo_path on the local row, so the upsert
    // below carries it in the same round trip. A failure here leaves the move
    // dirty and the file staged, and the next sync retries.
    if(typeof invoiceUploadPending === 'function'){
      try{ await invoiceUploadPending(sb, uidv); }catch(e){ console.warn('invoice push:', e); }
    }

    var jobs = [];

    SYNC_ENTITIES.forEach(function(e){
      // Push only what this device changed — for records and config alike.
      // The dirty registry is the single source of truth for "needs uploading".
      var rows = _lsGet(e.ls);
      var ids  = _dirtyIds(e.table);
      var mine = rows.filter(function(r){ return ids.indexOf(String(r.id)) !== -1; });
      if(!mine.length) return;

      var payload = mine.map(function(r){
        var out = e.toCloud(r);
        out.user_id = uidv;
        return out;
      });
      var pushedIds = mine.map(_byId);

      jobs.push(Promise.resolve(sb.from(e.table).upsert(payload)).then(function(r){
        // Only forget the change once the server actually has it.
        if(!(r && r.error)) _clearDirty(e.table, pushedIds);
        else console.warn('push '+e.table+':', r.error.message);
        return r;
      }, function(){ return null; }));
    });

    // Replay deletions that never reached the server — otherwise the next pull
    // undoes an offline delete.
    SYNC_ENTITIES.forEach(function(e){
      var ids = _deletedIds(e.table);
      if(!ids.length) return;
      jobs.push(Promise.resolve(sb.from(e.table).delete().in('id', ids).eq('user_id', uidv)).then(function(r){
        if(!(r && r.error)) _clearDeleted(e.table, ids);
        return r;
      }, function(){ return null; }));
    });

    await Promise.all(jobs);
    if(typeof invoiceSweepOrphans === 'function') invoiceSweepOrphans();
    return true;
  } catch(e){
    console.warn('pushConfig error:', e);
    return false;
  }
}
