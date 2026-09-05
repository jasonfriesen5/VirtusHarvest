// ══════════════════════════════════════════════════════════════════
//  VIRTUS FEED — DOMAIN MODEL
//  Local-first: every read hits localStorage, every write marks dirty
//  and the sync engine (09-sync.js) pushes it. Same contract as Harvest.
// ══════════════════════════════════════════════════════════════════

var LS_CYCLES      = 'vf_cycles';
var LS_LOTS        = 'vf_lots';
var LS_INGREDIENTS = 'vf_ingredients';
var LS_RATIONS     = 'vf_rations';
var LS_RATION_ITEMS= 'vf_ration_items';
var LS_FEEDINGS    = 'vf_feedings';
var LS_LOADS       = 'vf_feed_loads';
var LS_DELIVERIES  = 'vf_feed_deliveries';
var LS_BUNK        = 'vf_bunk_scores';
var LS_MIXERS      = 'vf_mixers';
var LS_ACTIVE_CYCLE= 'vf_active_cycle';

function _lsGet(k){ try{ return JSON.parse(localStorage.getItem(k)||'[]'); }catch(e){ return []; } }
function _lsSet(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ console.warn('[model] save failed',k,e); } }

function getCycles(){ return _lsGet(LS_CYCLES); }        function saveCycles(v){ _lsSet(LS_CYCLES,v); }
function getLots(){ return _lsGet(LS_LOTS); }            function saveLots(v){ _lsSet(LS_LOTS,v); }
function getIngredients(){ return _lsGet(LS_INGREDIENTS);} function saveIngredients(v){ _lsSet(LS_INGREDIENTS,v); }
function getRations(){ return _lsGet(LS_RATIONS); }      function saveRations(v){ _lsSet(LS_RATIONS,v); }
function getRationItems(){ return _lsGet(LS_RATION_ITEMS);} function saveRationItems(v){ _lsSet(LS_RATION_ITEMS,v); }
function getFeedings(){ return _lsGet(LS_FEEDINGS); }    function saveFeedings(v){ _lsSet(LS_FEEDINGS,v); }
function getLoads(){ return _lsGet(LS_LOADS); }          function saveLoads(v){ _lsSet(LS_LOADS,v); }
function getDeliveries(){ return _lsGet(LS_DELIVERIES); }function saveDeliveries(v){ _lsSet(LS_DELIVERIES,v); }
function getBunkScores(){ return _lsGet(LS_BUNK); }      function saveBunkScores(v){ _lsSet(LS_BUNK,v); }

// ── Active cycle ─────────────────────────────────────────────────
// Harvest shipped season_id as a local-only field and cross-device sync broke
// in a way that took days to find. Here the cycle id is written onto every
// record at creation time and is a real synced column from the first commit.
var activeCycleId = localStorage.getItem(LS_ACTIVE_CYCLE) || null;

function setActiveCycle(id){
  activeCycleId = id || null;
  if(id) localStorage.setItem(LS_ACTIVE_CYCLE, id); else localStorage.removeItem(LS_ACTIVE_CYCLE);
  if(typeof renderFeedTab === 'function') renderFeedTab();
}

function activeCycle(){ return getCycles().find(function(c){ return c.id === activeCycleId; }) || null; }

// Everything the UI reads should come through these, never the raw list.
function cycleLots(){ return getLots().filter(function(l){ return l.active !== false && (!activeCycleId || l.cycleId === activeCycleId); }); }
function cycleFeedings(){ return getFeedings().filter(function(f){ return !activeCycleId || f.cycleId === activeCycleId; }); }

// ── Generic upsert: write local, mark dirty, push ─────────────────
function _upsert(list, save, table, row){
  var i = list.findIndex(function(x){ return x.id === row.id; });
  if(i === -1) list.push(row); else list[i] = Object.assign(list[i], row);
  save(list);
  _markDirty(table, row.id);
  if(typeof autoSync === 'function') autoSync();
  return row;
}

function _remove(list, save, table, id){
  save(list.filter(function(x){ return x.id !== id; }));
  _markDeleted(table, id);
  if(typeof autoSync === 'function') autoSync();
}

// ── Entity writers ───────────────────────────────────────────────
function saveLot(lot){
  if(!lot.id){ lot.id = uid(); lot.cycleId = activeCycleId; }
  return _upsert(getLots(), saveLots, 'vf_lots', lot);
}
function deleteLot(id){ _remove(getLots(), saveLots, 'vf_lots', id); }

function saveIngredient(ing){
  if(!ing.id) ing.id = uid();
  if(ing.dmPct === undefined) ing.dmPct = 100;
  return _upsert(getIngredients(), saveIngredients, 'vf_ingredients', ing);
}
function deleteIngredient(id){ _remove(getIngredients(), saveIngredients, 'vf_ingredients', id); }

// What would break if this product went away. Rations are the blocker: dropping
// an ingredient out from under one silently changes what the mixer loads.
// The ledger is not — stock moves snapshot the name, so past deliveries and
// feedings still read correctly once the product itself is gone.
function ingredientUsage(id){
  var rations = getRations().filter(function(r){
    return r.active !== false &&
           rationItemsFor(r.id).some(function(it){ return it.ingredientId === id; });
  }).map(function(r){ return r.name; });

  var ing = ingredientById(id);
  return {
    rations: rations,
    stockKg: (ing && ing.stockKg) || 0,
    moves:   getStockMoves().filter(function(m){ return m.ingredientId === id; }).length
  };
}

// ── Desktop-owned switches ───────────────────────────────────────
// The web console is the authority on these; the app only reads them. An
// absent or unreadable row means "allowed", so an account that has never
// opened the console keeps behaving exactly as it did before the toggle
// existed -- a failed pull must never lock an operator out mid-shift.
var LS_SETTINGS = 'vf_settings';
function appSettings(){
  try{ return JSON.parse(localStorage.getItem(LS_SETTINGS)) || {}; }
  catch(e){ return {}; }
}
function rationEditsLocked(){ return appSettings().allow_app_ration_edits === false; }


// Every ration edit path funnels through here, so the rule lives in one place
// rather than being re-checked (and eventually missed) at each entry point.
function guardRationEdit(){
  if(!rationEditsLocked()) return true;
  showToast(T('Rations are managed on the desktop console'), 'warn');
  return false;
}

function saveRation(r){
  if(!r.id){ r.id = uid(); r.version = 1; }
  return _upsert(getRations(), saveRations, 'vf_rations', r);
}
function deleteRation(id){
  _remove(getRations(), saveRations, 'vf_rations', id);
  getRationItems().filter(function(it){ return it.rationId === id; })
                  .forEach(function(it){ _remove(getRationItems(), saveRationItems, 'vf_ration_items', it.id); });
}

function saveRationItem(it){
  if(!it.id) it.id = uid();
  return _upsert(getRationItems(), saveRationItems, 'vf_ration_items', it);
}
function deleteRationItem(id){ _remove(getRationItems(), saveRationItems, 'vf_ration_items', id); }

// ── Ration maths ─────────────────────────────────────────────────
function rationItemsFor(rationId){
  return getRationItems().filter(function(it){ return it.rationId === rationId; })
                         .sort(function(a,b){ return (a.seq||0) - (b.seq||0); });
}

function ingredientById(id){ return getIngredients().find(function(i){ return i.id === id; }) || null; }
function lotById(id){ return getLots().find(function(l){ return l.id === id; }) || null; }
function rationById(id){ return getRations().find(function(r){ return r.id === id; }) || null; }

// kg of one ingredient needed for a set of lots on this ration.
// Each pen carries its own bunk-driven multiplier, so the mixer target is the
// sum of per-pen demand rather than one flat number × total head. Two pens on
// the same ration can legitimately want different amounts.
// kgPerHead is per head per DAY, so a group fed twice a day must load HALF of
// it each time. This divisor was missing: every feeding targeted the full daily
// ration, which on a 2x/day group is double-feeding.
// `share` is this feeding's fraction of the daily ration (0-1). kgPerHead is
// per head per DAY, so without it every load would target a full day.
// ══ HOW A RATION IS WRITTEN ══
// 'kg'  — each line is kg per head. The batch size is derived from the lines.
// 'pct' — each line is a share of the mix. The lines say only what the mixture
//         IS; the batch size comes from the group's intake setting. That is
//         what lets ONE recipe feed a finishing pen and a younger pen: same
//         blend, different portion, one place to edit.
function rationMode(rationId){
  var items = rationItemsFor(rationId);
  if(!items.length) return 'kg';
  return items.some(function(it){ return it.pctOfMix != null; }) ? 'pct' : 'kg';
}

// As-fed kg per head per day for this pen. Returns null when it genuinely
// cannot be worked out — a missing pen weight must not quietly become zero and
// size a batch at nothing.
function intakeKgPerHead(lot, rationId, group){
  if(rationMode(rationId) === 'kg') return rationKgPerHead(rationId);

  var g = group || (lot ? groupsForLot(lot.id)[0] : null);
  if(!g || !g.intakeMode) return null;

  if(g.intakeMode === 'bw_pct'){
    var w = (lot && lot.avgWeightKg) || 0;
    if(!(w > 0)) return null;                     // no weight on file for this pen
    var dmPct = rationDmPct(rationId);
    if(!(dmPct > 0)) return null;                 // no dry matter to convert with
    // Intake is quoted as DRY MATTER; the mixer weighs AS FED.
    return (w * (g.intakeBwPct || 0) / 100) / (dmPct / 100);
  }
  return (g.intakeKgPerHead > 0) ? g.intakeKgPerHead : null;
}

// What the whole batch weighs, for either mode.
function batchKgFor(rationId, lots, share, group){
  var f = (share > 0) ? share : 1;
  return lots.reduce(function(s, l){
    var per = intakeKgPerHead(l, rationId, group);
    return s + (per || 0) * (l.headCount || 0) * lotFeedFactor(l);
  }, 0) * f;
}

// Pens the batch cannot be sized for. Surfaced rather than silently dropped:
// a pen contributing zero kilos is under-feeding, not a rounding detail.
function lotsMissingIntake(rationId, lots, group){
  if(rationMode(rationId) === 'kg') return [];
  return (lots || []).filter(function(l){ return intakeKgPerHead(l, rationId, group) == null; });
}

function targetKgForIngredient(item, lots, share, rationId, group){
  var f = (share > 0) ? share : 1;
  // Percentage line: a slice of the whole batch, so the batch has to be sized
  // first. Every line scales together, which is the point of the mode.
  if(item.pctOfMix != null){
    return batchKgFor(rationId || item.rationId, lots, share, group) * (item.pctOfMix / 100);
  }
  return lots.reduce(function(s, l){
    return s + (item.kgPerHead || 0) * (l.headCount || 0) * lotFeedFactor(l);
  }, 0) * f;
}

// The full load sheet for a feeding: every ingredient with its target kg,
// in the order a real mixer wants them (forage first, minerals last).
function buildLoadSheet(rationId, lots, share, carryoverKg){
  var rows = rationItemsFor(rationId).map(function(it, i){
    var ing = ingredientById(it.ingredientId);
    return {
      id: uid(), seq: i,
      ingredientId: it.ingredientId,
      ingredientName: ing ? ing.name : T('Unknown'),
      targetKg: targetKgForIngredient(it, lots, share, rationId),
      // Hand-added lines are confirmed, not weighed — the snapshot travels with
      // the record so a later change to the ration cannot rewrite what happened.
      manual: !!it.manualAdd,
      actualKg: null
    };
  });

  // Feed already in the mixer from refusals. Take it off each ingredient in
  // proportion — the returned mix is roughly the same recipe, so scaling every
  // line by the same factor keeps the ratios right.
  // Only the weighed lines absorb the carryover. A hand-added premix is a fixed
  // dose — shaving it because there is leftover feed in the mixer would change
  // the diet, and for an NPN or mineral that is exactly the wrong thing to do.
  var weighed = rows.filter(function(r){ return !r.manual; });
  var total = weighed.reduce(function(s,r){ return s + r.targetKg; }, 0);
  if(carryoverKg > 0 && total > 0){
    var keep = Math.max(0, (total - carryoverKg) / total);
    weighed.forEach(function(r){ r.targetKg *= keep; });
  }
  return rows;
}

// What one load of this group weighs — the number that answers "does it fit in
// the mixer". Defaults to the next feeding due, since that is the one about to
// be made; pass mealIndex to ask about a specific one.
function groupLoadKg(groupId, mealIndex){
  var g = groupById(groupId);
  if(!g) return 0;
  var share = mealShare(g, mealIndex || nextMealIndex(groupId));
  return batchKgFor(g.rationId, lotsInGroup(groupId), share, g);
}

// The full day laid out, for the group card.
function groupDayLoads(groupId){
  var g = groupById(groupId);
  if(!g) return [];
  return groupSplits(g).map(function(pct, i){
    return { mealIndex: i+1, pct: pct, label: mealLabel(g, i+1), kg: groupLoadKg(groupId, i+1) };
  });
}

// What is physically in the mixer, which is NOT the same as what was weighed
// into it. Returned feed — a bunk scrape or a residual carried forward — is
// already sitting there, and the load sheet deliberately reduced its targets by
// that much so the mixer ends up holding one full ration. Anything that asks
// "how much is in the mixer" has to add it back.
function mixerContentKg(f){
  if(!f) return 0;
  return (f.totalLoadedKg || 0) + (f.carryoverKg || 0);
}

// How the mixer's contents get split between pens: by head count, which is
// what the ration is expressed in. Delivering by pen size is the whole point.
function buildDeliverySheet(lots, mixerKg){
  // Weighted by head AND by each pen's feed factor — the same basis the load
  // sheet used. Splitting on head count alone would send a pen that was cut
  // back its full share anyway, quietly undoing the bunk reading.
  // REMAINDER RULE: targets are shares of what was ACTUALLY loaded, not of the
  // planned figure. Load 8,500 against an 8,454 plan and the extra 46 kg is
  // spread proportionally across the drops — nobody gets a surprise slug of it.
  // The shares therefore always sum back to what the mixer holds.
  //
  // Weigh-off error still accumulates into the LAST drop (each pen is measured
  // off a running mixer weight), which is why route order should end on the
  // biggest pen: the same absolute error is the smallest percentage there.
  // See suggestRouteOrder().
  var demand = lots.reduce(function(s,l){ return s + (l.headCount||0) * lotFeedFactor(l); }, 0) || 1;
  // Order is the CALLER's. It used to re-sort by lot.routeOrder here, which
  // silently threw away the per-group sequence: a pen's position is a property
  // of the route for THAT group, and the same pen can sit in two groups at
  // different points. Callers pass lots already ordered (see orderLotsForGroup).
  return lots.slice()
    .map(function(l, i){
      var share = ((l.headCount||0) * lotFeedFactor(l)) / demand;
      return {
        id: uid(), seq: i,
        lotId: l.id, lotName: l.name, headCount: l.headCount || 0,
        targetKg: mixerKg * share,
        actualKg: null
      };
    });
}

// ── Feeding lifecycle ────────────────────────────────────────────
// A feeding started from the manual picker carries no group, but its pens
// almost always still belong to one. Without this the meal share stayed 1 and
// an ad-hoc feeding delivered a FULL DAY's ration to a pen that eats twice a
// day — double feed, silently, decided only by which screen the operator
// started from. On a finishing ration that is an acidosis risk.
function inferMealContext(lots, rationId){
  var ids = (lots || []).map(function(l){ return l.id; });
  if(!ids.length) return { share: 1, mealIndex: 1, label: null, groupId: null };

  // Groups holding at least one of these pens AND running the ration being fed.
  var cands = cycleGroups().filter(function(g){
    if(rationId && g.rationId !== rationId) return false;
    return lotsInGroup(g.id).some(function(l){ return ids.indexOf(l.id) !== -1; });
  });

  if(cands.length === 1){
    var g   = cands[0];
    var idx = nextMealIndex(g.id);
    // Uses the group's real split, so an uneven day (60/40) is respected rather
    // than flattened to halves.
    return { share: mealShare(g, idx), mealIndex: idx, label: mealLabel(g, idx), groupId: g.id };
  }

  // Nothing can speak for these pens: split evenly on the pens' own meals/day,
  // taking the LARGEST. A smaller share errs toward under-feeding, which is the
  // safe direction here. 2 matches the app's default everywhere else.
  var meals = ids.reduce(function(m, id){
    var l = lotById(id);
    return Math.max(m, lotMealsPerDay(l));
  }, 1);
  return { share: meals > 0 ? 1 / meals : 1, mealIndex: 1, label: null, groupId: null };
}

function startFeeding(opts){
  // A feeding is for a GROUP; the ration is whatever that group is on right now,
  // snapshotted onto the record so a later ration change cannot rewrite history.
  var grp = opts.groupId ? groupById(opts.groupId) : null;
  if(grp && !opts.rationId) opts.rationId = grp.rationId;
  // No group on the record: infer the meal from the pens themselves. groupId is
  // deliberately NOT adopted — this must not fire group-level side effects like
  // consuming the group's carryover or stamping its delivery window.
  var inferred = grp ? null : inferMealContext(opts.lots, opts.rationId);
  var mealIdx  = opts.mealIndex || (grp ? nextMealIndex(grp.id) : inferred.mealIndex);
  var share    = grp ? mealShare(grp, mealIdx) : inferred.share;

  var f = {
    id: uid(),
    cycleId: activeCycleId,
    mixerId: opts.mixerId || _activeMixerId || null,
    mixerName: opts.mixerName || '',
    groupId: grp ? grp.id : null,
    groupName: grp ? grp.name : '',
    rationId: opts.rationId,
    rationName: (rationById(opts.rationId)||{}).name || '',
    lotIds: (opts.lots||[]).map(function(l){ return l.id; }),
    operatorName: (typeof currentWorker === 'object' && currentWorker && currentWorker.name) || '',
    mealIndex: mealIdx,
    mealShare: share,
    meal: opts.meal || (grp ? mealLabel(grp, mealIdx) : (inferred.label || _currentMeal())),
    status: 'loading',
    startedAt: new Date().toISOString(),
    loadStartedAt: new Date().toISOString(),
    finishedAt: null,
    totalLoadedKg: 0,
    totalDeliveredKg: 0
  };
  // Work the carryover out BEFORE the first write. It used to be assigned to the
  // in-memory object after the upsert and never saved, so every later read of
  // the feeding saw no carryover at all — the load targets came down by it, but
  // nothing downstream knew the mixer was holding those kilos.
  var carry = grp ? groupCarryoverKg(grp.id) : 0;
  f.carryoverKg = carry;
  _upsert(getFeedings(), saveFeedings, 'vf_feedings', f);

  buildLoadSheet(opts.rationId, opts.lots||[], share, carry).forEach(function(row){
    row.feedingId = f.id;
    _upsert(getLoads(), saveLoads, 'vf_feed_loads', row);
  });
  return f;
}

function _currentMeal(){ return new Date().getHours() < 12 ? 'AM' : 'PM'; }

function loadsFor(feedingId){
  return getLoads().filter(function(l){ return l.feedingId === feedingId; })
                   .sort(function(a,b){ return (a.seq||0)-(b.seq||0); });
}
function deliveriesFor(feedingId){
  return getDeliveries().filter(function(d){ return d.feedingId === feedingId; })
                        .sort(function(a,b){ return (a.seq||0)-(b.seq||0); });
}

// Operator confirmed an ingredient is in the mixer.
function recordLoad(feedingId, loadId, actualKg){
  var loads = getLoads(), row = loads.find(function(l){ return l.id === loadId; });
  if(!row) return null;
  // A hand-added line takes its target as read: the scale never saw it, so
  // whatever delta it happened to register is noise, not a measurement.
  row.actualKg = row.manual ? row.targetKg : actualKg;
  row.at = new Date().toISOString();

  // Draw down what was RECORDED, not the raw parameter — a hand-added line
  // records its target while the parameter is the scale's ~0 delta, so using
  // the parameter meant minerals and premixes never left inventory at all.
  //
  // Before the save, so the line can carry what those kilos actually cost.
  // Stored, not derived: recomputing later would use whatever the ingredient
  // costs then, quietly rewriting what this mix cost on the day.
  var move = _drawDownStock(row.ingredientId, row.actualKg, feedingId);
  if(move){
    row.unitCost = move.unitCost;
    row.cost = move.cost;
  }

  saveLoads(loads);
  _markDirty('vf_feed_loads', row.id);

  var f = getFeedings().find(function(x){ return x.id === feedingId; });
  if(f){
    f.totalLoadedKg = loadsFor(feedingId).reduce(function(s,l){ return s + (l.actualKg||0); }, 0);
    _upsert(getFeedings(), saveFeedings, 'vf_feedings', f);
  }

  // Every ingredient recorded means loading is done and the mixer runs.
  var all = loadsFor(feedingId);
  if(all.length && all.every(function(l){ return l.actualKg !== null && l.actualKg !== undefined; })){
    startMixing(feedingId);
  }

  if(typeof autoSync === 'function') autoSync();
  return row;
}

// Loading is what actually consumes inventory — deliveries just move it to pens.
// Goes through the stock ledger so the balance, the runway and the audit trail
// are all derived from the same movements.
function _drawDownStock(ingredientId, kg, feedingId){
  if(!ingredientId || !kg) return null;
  return consumeStock(ingredientId, kg, feedingId);
}

function beginDelivery(feedingId, lots){
  var f = getFeedings().find(function(x){ return x.id === feedingId; });
  if(!f) return null;
  if(f.groupId) markCarryoverConsumed(f.groupId);   // it is going back out now
  stampDeliveryTiming(feedingId);
  f = getFeedings().find(function(x){ return x.id === feedingId; });
  f.status = 'delivering';
  _upsert(getFeedings(), saveFeedings, 'vf_feedings', f);
  // mixerContentKg, not totalLoadedKg: with feed returned from a bunk the load
  // sheet asked for a full ration MINUS the carryover, so unloading only the
  // weighed kilos leaves the returned feed in the mixer and short-feeds the
  // pens by exactly that much.
  buildDeliverySheet(lots, mixerContentKg(f)).forEach(function(row){
    row.feedingId = f.id;
    _upsert(getDeliveries(), saveDeliveries, 'vf_feed_deliveries', row);
  });
  return f;
}

// `opts` carries what the operator confirmed at the bunk: how many head are
// actually in the pen right now, and optionally an updated average weight.
// A pen's head count drifts through a cycle — animals get pulled, moved, or
// die — and a feeding recorded against a stale count makes every per-head
// figure downstream wrong.
function recordDelivery(feedingId, deliveryId, actualKg, opts){
  opts = opts || {};
  var ds = getDeliveries(), row = ds.find(function(d){ return d.id === deliveryId; });
  if(!row) return null;

  if(opts.headCount != null && opts.headCount > 0) row.headCount = opts.headCount;

  row.actualKg  = actualKg;
  // Stored, not derived: recomputing later would divide by whatever the head
  // count happens to be then, silently rewriting what this feeding actually was.
  row.kgPerHead = row.headCount ? (actualKg / row.headCount) : null;
  // Same reasoning for dry matter — it depends on the ingredients' DM% at load
  // time, and those get edited. Feed conversion is quoted on a DM basis.
  var dmFrac = mixDryMatterFraction(feedingId);
  row.dmKgPerHead = (row.kgPerHead != null && dmFrac) ? row.kgPerHead * dmFrac : null;
  row.at = new Date().toISOString();
  saveDeliveries(ds);
  _markDirty('vf_feed_deliveries', row.id);

  // Push the confirmation back onto the lot so the next feeding starts from it.
  var lot = lotById(row.lotId);
  if(lot){
    var changed = false;
    if(opts.headCount   != null && opts.headCount   > 0 && lot.headCount   !== opts.headCount){   lot.headCount   = opts.headCount;   changed = true; }
    if(opts.avgWeightKg != null && opts.avgWeightKg > 0 && lot.avgWeightKg !== opts.avgWeightKg){ lot.avgWeightKg = opts.avgWeightKg; changed = true; }
    if(changed) _upsert(getLots(), saveLots, 'vf_lots', lot);
  }

  var f = getFeedings().find(function(x){ return x.id === feedingId; });
  if(f){
    f.totalDeliveredKg = deliveriesFor(feedingId).reduce(function(s,d){ return s + (d.actualKg||0); }, 0);
    _upsert(getFeedings(), saveFeedings, 'vf_feedings', f);
  }
  if(typeof autoSync === 'function') autoSync();
  return row;
}

function finishFeeding(feedingId){
  var f = getFeedings().find(function(x){ return x.id === feedingId; });
  if(!f) return null;
  f.status = 'done';
  f.finishedAt = new Date().toISOString();
  _upsert(getFeedings(), saveFeedings, 'vf_feedings', f);
  return f;
}

// A feeding left mid-load — the operator wandered off, the tablet died, the app
// was closed — stays 'loading' forever, and this would keep offering to resume
// it days later while blocking any new one. Anything older than a shift is
// treated as abandoned rather than current.
var ABANDON_AFTER_HOURS = 12;

function openFeeding(){
  var cutoff = Date.now() - ABANDON_AFTER_HOURS*3600*1000;
  return cycleFeedings().find(function(f){
    if(f.status !== 'loading' && f.status !== 'delivering') return false;   // done/cancelled/abandoned are closed
    return !f.startedAt || new Date(f.startedAt).getTime() >= cutoff;
  }) || null;
}

// Remove a feeding that never held anything, and its unmeasured lines with it.
// _remove() marks each row deleted in the sync registry, so the cloud copy goes
// too — otherwise the empty batch would simply come back on the next pull.
function discardEmptyFeeding(feedingId){
  getLoads().filter(function(l){ return l.feedingId === feedingId; })
    .forEach(function(l){ _remove(getLoads(), saveLoads, 'vf_feed_loads', l.id); });
  getDeliveries().filter(function(d){ return d.feedingId === feedingId; })
    .forEach(function(d){ _remove(getDeliveries(), saveDeliveries, 'vf_feed_deliveries', d.id); });
  _remove(getFeedings(), saveFeedings, 'vf_feedings', feedingId);
}

// Abandon a feeding on purpose, so the operator can start a different group.
//
// The kilos already loaded are NOT returned to stock. They physically left the
// bunker and are sitting in the mixer — reversing the ledger would claim feed
// exists in a shed that does not hold it. The stock drawdown stands; what is in
// the mixer is a residual, which the next load's residual check already handles.
//
// Nothing loaded yet is the clean case: no ledger entry was ever written, so
// there is nothing to undo.
function cancelFeeding(feedingId, note){
  var f = getFeedings().find(function(x){ return x.id === feedingId; });
  if(!f) return null;

  var loadedKg    = mixerContentKg(f);
  var deliveredKg = f.totalDeliveredKg || 0;

  // Nothing was ever loaded, so nothing happened: no kilos, no stock drawdown,
  // no history worth keeping. Marking it 'cancelled' left an empty 0 kg batch
  // in the record that the console then had to display and a person had to
  // interpret. Delete it outright instead — including the target-only load
  // lines, which never became measurements.
  if(loadedKg === 0){
    discardEmptyFeeding(f.id);
    return { loadedKg: 0, deliveredKg: 0, residualKg: 0, discarded: true };
  }

  f.status      = 'cancelled';
  f.finishedAt  = new Date().toISOString();
  f.cancelNote  = note || null;
  // What is left standing in the mixer after anything already dropped.
  f.residualKg  = Math.max(0, loadedKg - deliveredKg);
  _upsert(getFeedings(), saveFeedings, 'vf_feedings', f);

  if(typeof autoSync === 'function') autoSync();
  return { loadedKg: loadedKg, deliveredKg: deliveredKg, residualKg: f.residualKg, discarded: false };
}

// What a cancel would cost right now, so the dialog can state it rather than
// asking the operator to guess.
function cancelImpact(feedingId){
  var f = getFeedings().find(function(x){ return x.id === feedingId; });
  if(!f) return null;
  var loaded    = mixerContentKg(f);
  var delivered = f.totalDeliveredKg || 0;
  return {
    loadedKg: loaded,
    deliveredKg: delivered,
    residualKg: Math.max(0, loaded - delivered),
    clean: loaded === 0,
    groupName: f.groupName || f.rationName || ''
  };
}

// Close out anything stale. Marked 'abandoned' rather than deleted: it may hold
// real loaded kilos and a real stock drawdown, and quietly binning that would
// leave inventory wrong with nothing to explain it.
function closeAbandonedFeedings(){
  var cutoff = Date.now() - ABANDON_AFTER_HOURS*3600*1000;
  var stale = getFeedings().filter(function(f){
    return (f.status === 'loading' || f.status === 'delivering') &&
           f.startedAt && new Date(f.startedAt).getTime() < cutoff;
  });
  if(!stale.length) return false;

  // Nothing was ever loaded: a Load button pressed and walked away from. There
  // is no drawdown and no kilos, so keeping it only puts an empty 0 kg batch in
  // the record. Those get discarded outright.
  var empty = stale.filter(function(f){ return !(f.totalLoadedKg > 0); });
  empty.forEach(function(f){ discardEmptyFeeding(f.id); });

  // Anything that DID hold feed is marked, never deleted — it carries a real
  // stock drawdown, and binning that would leave inventory wrong with nothing
  // to explain it.
  var list = getFeedings(), changed = false;
  list.forEach(function(f){
    if(!(f.status === 'loading' || f.status === 'delivering')) return;
    if(!(f.startedAt && new Date(f.startedAt).getTime() < cutoff)) return;
    f.status = 'abandoned';
    f.finishedAt = f.finishedAt || new Date().toISOString();
    _markDirty('vf_feedings', f.id);
    changed = true;
  });
  if(changed) saveFeedings(list);
  if(changed || empty.length){ if(typeof autoSync === 'function') autoSync(); }
  return changed || empty.length > 0;
}

// ── Metrics — computed, never entered ────────────────────────────

// Cost of one feeding, from what each line cost when it was loaded.
//
// Summed off the load rows rather than the stock ledger: a load recorded twice
// leaves two ledger moves but only one line, and the line is what the mix
// actually was.
function feedingCost(feedingId){
  return loadsFor(feedingId).reduce(function(s,l){
    if(l.cost != null) return s + l.cost;
    // Recorded before costs were frozen onto the line. Falls back to the
    // ingredient's current price, which is what the whole app used to do —
    // approximate for old rows, exact for every row from here on.
    var ing = ingredientById(l.ingredientId);
    return s + (l.actualKg||0) * ((ing && ing.costPerKg) || 0);
  }, 0);
}

// Deliveries to one lot inside a window, plus how many distinct days they
// actually span. Dividing by the window length instead would report a third of
// the real figure on a pen fed for two days out of seven — a "per day" number
// has to mean per day fed, not per day on the calendar.
function _lotWindow(lotId, days){
  var since = Date.now() - (days||7)*86400000;
  var rows = getDeliveries().filter(function(d){
    return d.lotId === lotId && d.at && new Date(d.at).getTime() >= since && d.actualKg;
  });
  var dayKeys = {};
  rows.forEach(function(d){ dayKeys[new Date(d.at).toDateString()] = 1; });
  return { rows: rows, days: Math.max(1, Object.keys(dayKeys).length) };
}

// The number that gets a rancher's attention.
function costPerHeadPerDay(lotId, days){
  var w = _lotWindow(lotId, days);
  if(!w.rows.length) return null;

  var head = 0, cost = 0;
  w.rows.forEach(function(d){
    head = d.headCount || head;
    var f = getFeedings().find(function(x){ return x.id === d.feedingId; });
    var mix = mixerContentKg(f);
    if(!f || !mix) return;
    // This pen's share of that mix's cost, by kilos actually delivered to it.
    // Against the mixer's contents, not the weighed lines — the carryover's own
    // cost was booked to the feeding that first loaded it.
    cost += feedingCost(f.id) * (d.actualKg / mix);
  });
  if(!head) return null;
  return cost / head / w.days;
}

// As-fed and dry-matter kg per head per day.
function intakePerHead(lotId, days){
  var w = _lotWindow(lotId, days);
  var rows = w.rows;
  if(!rows.length) return null;

  var head = 0, asFed = 0, dm = 0;
  // Refusals come straight off intake — otherwise a pen that leaves 10% every
  // day reads as eating 10% more than it does, and conversion looks better
  // than it is.
  var refused = lotReturnedKg(lotId, Date.now() - (days||7)*86400000);
  rows.forEach(function(d){
    head = d.headCount || head;
    asFed += d.actualKg;
    var f = getFeedings().find(function(x){ return x.id === d.feedingId; });
    var mix = mixerContentKg(f);
    if(!f || !mix) return;
    var share = d.actualKg / mix;
    loadsFor(f.id).forEach(function(l){
      var ing = ingredientById(l.ingredientId);
      dm += (l.actualKg||0) * share * (((ing && ing.dmPct) || 100) / 100);
    });
  });
  if(!head) return null;
  // Scale dry matter by the same proportion rather than only zeroing it at the
  // extreme — refused feed carries its dry matter back with it.
  var net = Math.max(0, asFed - refused);
  if(asFed > 0) dm *= (net / asFed);
  return { asFed: net/head/w.days, dm: dm/head/w.days, refusedKg: refused };
}

// Did the operator actually load the diet? This is the report that pays for the app.
// Every line, with `manual` flagged so callers can separate confirmed from
// measured. Averaging a hand-added line's guaranteed 0% into loading accuracy
// would make the operator look more precise than the scale can prove.
function loadVariance(feedingId){
  return loadsFor(feedingId).map(function(l){
    var t = l.targetKg || 0, a = l.actualKg;
    return {
      name: l.ingredientName,
      manual: !!l.manual,
      targetKg: t,
      actualKg: a,
      deltaKg: a === null ? null : a - t,
      pct: (a === null || !t) ? null : ((a - t) / t) * 100
    };
  });
}

// "Silage runs out in 11 days." Falls out of the data for free.
// Same rule as the lot metrics: divide by days actually fed, not by the window.
// Averaging one day's use over seven would claim seven times the runway that
// exists, which is the one direction this number must never be wrong in.
// Reads the stock ledger, not the feed-load rows. Both record the same
// consumption, and having two sources of truth for one fact is how they drift
// apart — the ledger is the one that also explains receipts and shrink.
// What the pens are due to eat tomorrow, per ingredient, across every active
// group. Forward-looking on purpose: trailing usage says nothing until a week
// of history exists, and cattle intake climbs as they grow, so last week's
// average always under-states next week's draw. Ordering has lead time, so the
// question that matters is what tomorrow needs.
//
// Head is weighted by feed factor, the same basis groupLoadKg() uses, and a pen
// in two groups is counted in each — it really does eat from both rations.
function plannedDailyKg(ingredientId){
  var total = 0;
  cycleGroups().forEach(function(g){
    if(!g.rationId) return;
    var items = rationItemsFor(g.rationId).filter(function(it){ return it.ingredientId === ingredientId; });
    if(!items.length) return;
    var lots = lotsInGroup(g.id);
    // Percentage rations have no kg on the line at all, so demand has to come
    // from the sized batch — a full day of it, hence share 1.
    if(rationMode(g.rationId) === 'pct'){
      var batch = batchKgFor(g.rationId, lots, 1, g);
      items.forEach(function(it){ total += batch * ((it.pctOfMix||0) / 100); });
      return;
    }
    var head = lots.reduce(function(s,l){
      return s + (l.headCount||0) * lotFeedFactor(l);
    }, 0);
    if(!head) return;
    items.forEach(function(it){ total += (it.kgPerHead||0) * head; });
  });
  return total;
}

// Days of cover at the planned rate. Null when nothing is planned to eat this
// ingredient at all — "not on any ration" must not render as zero days left.
function plannedRunway(ingredientId){
  var perDay = plannedDailyKg(ingredientId);
  if(!perDay) return null;
  var ing = ingredientById(ingredientId);
  if(!ing) return null;
  return { perDayKg: perDay, stockKg: ing.stockKg||0, daysLeft: (ing.stockKg||0) / perDay };
}

// How far actual loading has drifted from the ration on file. A persistent gap
// is its own finding: the mixer is being over- or under-loaded against the diet
// the nutritionist wrote. Null unless BOTH figures exist, so it can never read
// as 0% when one side is simply unknown.
function rationDriftPct(ingredientId, days){
  var planned = plannedDailyKg(ingredientId);
  var actual  = ingredientRunway(ingredientId, days || 7);
  if(!planned || !actual || !actual.perDayKg) return null;
  return ((actual.perDayKg - planned) / planned) * 100;
}

function ingredientRunway(ingredientId, days){
  var since = Date.now() - (days||7)*86400000;
  var rows = getStockMoves().filter(function(m){
    return m.ingredientId === ingredientId && m.kind === 'feed' &&
           m.at && new Date(m.at).getTime() >= since;
  });
  if(!rows.length) return null;

  var dayKeys = {};
  rows.forEach(function(m){ dayKeys[new Date(m.at).toDateString()] = 1; });
  var usedDays = Math.max(1, Object.keys(dayKeys).length);
  var used = rows.reduce(function(s,m){ return s + Math.abs(m.deltaKg); }, 0);

  var perDay = used / usedDays;
  var ing = ingredientById(ingredientId);
  if(!ing || !perDay) return null;
  return { perDayKg: perDay, stockKg: ing.stockKg||0, daysLeft: (ing.stockKg||0) / perDay };
}

// ══════════════════════════════════════════════════════════════════
//  BUNK READING
//  Read the bunk before the morning feed, score what is left, and let
//  that move tomorrow's delivery. This is the loop that turns the app
//  from a ledger into something that tells the operator what to do.
//
//  The 0-4 scale below is the one feedlots actually use. Scoring is done
//  BEFORE feeding, on what remains from the previous drop.
//
//  SAFETY: increases are what can hurt cattle. Pushing a high-grain
//  finishing ration up too fast causes acidosis, so every rail here
//  constrains the UP direction harder than the down:
//    · one step is capped (MAX_STEP_UP / MAX_STEP_DOWN)
//    · the cumulative factor is capped (FACTOR_MIN / FACTOR_MAX)
//    · no two increases in a row unless the bunk was genuinely slick
//    · at most one adjustment per pen per day
//  The app SUGGESTS; a person confirms. Nothing here changes a diet on
//  its own, and the operator can always override the number.
// ══════════════════════════════════════════════════════════════════
var BUNK_SCALE = [
  { score:0, key:'Empty — slick for hours',        pct:+4 },
  { score:1, key:'Almost empty — a few crumbs',    pct:+2 },
  { score:2, key:'Thin even layer',                pct: 0 },   // target
  { score:3, key:'About a quarter left',           pct:-3 },
  { score:4, key:'Half or more left, untouched',   pct:-8 }
];

var MAX_STEP_UP   = 4;      // % per adjustment
var MAX_STEP_DOWN = 10;
var FACTOR_MIN    = 0.80;
var FACTOR_MAX    = 1.20;

function bunkRule(score){
  return BUNK_SCALE.find(function(b){ return b.score === score; }) || null;
}

function lotFeedFactor(lot){
  var f = lot && lot.feedFactor;
  return (typeof f === 'number' && f > 0) ? f : 1;
}

// What the app proposes for this reading, and why. Returns the capped
// percentage plus a reason string when a rail actually bit — the operator
// should be able to see that the app held back, not just that it did nothing.
function bunkSuggestion(lotId, score){
  var lot  = lotById(lotId);
  var rule = bunkRule(score);
  if(!lot || !rule) return null;

  var pct    = rule.pct;
  var factor = lotFeedFactor(lot);
  var reason = null;

  // Already adjusted today: reading twice in a day must not double the move.
  var today = getBunkScores().filter(function(b){
    return b.lotId === lotId && b.at &&
           new Date(b.at).toDateString() === new Date().toDateString() &&
           b.appliedPct != null && b.appliedPct !== 0;
  });
  if(today.length && pct !== 0){
    return { pct: 0, factor: factor, reason: T('Already adjusted today'), blocked: true };
  }

  // Two increases running is how a pen gets walked into acidosis. Only allow it
  // off a genuinely slick bunk (score 0), which is unambiguous evidence.
  if(pct > 0 && score > 0){
    var prev = getBunkScores().filter(function(b){ return b.lotId === lotId && b.appliedPct != null; })
                              .sort(function(a,b){ return new Date(b.at) - new Date(a.at); })[0];
    if(prev && prev.appliedPct > 0){
      pct = 0;
      reason = T('Held — raised at the last reading');
    }
  }

  if(pct >  MAX_STEP_UP)   { pct =  MAX_STEP_UP;   reason = T('Capped to a safe step'); }
  if(pct < -MAX_STEP_DOWN) { pct = -MAX_STEP_DOWN; reason = T('Capped to a safe step'); }

  var next = factor * (1 + pct/100);
  if(next > FACTOR_MAX){ next = FACTOR_MAX; pct = (next/factor - 1) * 100; reason = T('At the upper limit for this lot'); }
  if(next < FACTOR_MIN){ next = FACTOR_MIN; pct = (next/factor - 1) * 100; reason = T('At the lower limit for this lot'); }

  return { pct: pct, factor: next, reason: reason, blocked: false };
}

// `appliedPct` is what the operator confirmed — which may differ from the
// suggestion, and that difference is worth keeping.
function recordBunkScore(lotId, score, appliedPct){
  var lot = lotById(lotId);
  var sug = bunkSuggestion(lotId, score);
  var pct = (appliedPct == null) ? (sug ? sug.pct : 0) : appliedPct;

  var factor = lotFeedFactor(lot);
  var next   = Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, factor * (1 + pct/100)));

  var row = {
    id: uid(),
    lotId: lotId,
    lotName: lot ? lot.name : '',
    cycleId: activeCycleId,
    score: score,
    suggestedPct: sug ? sug.pct : null,
    appliedPct: pct,
    factorAfter: next,
    operatorName: (typeof currentWorker === 'object' && currentWorker && currentWorker.name) || '',
    at: new Date().toISOString()
  };
  _upsert(getBunkScores(), saveBunkScores, 'vf_bunk_scores', row);

  if(lot && next !== factor){
    lot.feedFactor = next;
    _upsert(getLots(), saveLots, 'vf_lots', lot);
  }
  return row;
}

function latestBunkScore(lotId){
  return getBunkScores().filter(function(b){ return b.lotId === lotId; })
    .sort(function(a,b){ return new Date(b.at) - new Date(a.at); })[0] || null;
}

// ══════════════════════════════════════════════════════════════════
//  LOAD BAR
//  The fill and the percentage deliberately come apart. Target (100%)
//  sits at only 3/4 of the bar, so an overshoot is VISIBLE instead of
//  hiding behind a bar that was already full. The last quarter is the
//  tolerance band; past it the bar pins at full and only the number
//  keeps climbing.
//
//      0 ─────────── 100% ────── tol ──────▶
//      │  yellow  ▓▓▓ │  green ▓▓ │  red (pinned full)
//      0%        75%          100%   fill
//
//  `tolPct` is per ingredient: silage can sit at 120, but a mineral or
//  urea premix has to be tightened — +20% of an NPN source is a real
//  animal-health problem, not a rounding error.
// ══════════════════════════════════════════════════════════════════
var DEFAULT_TOL_PCT = 120;
var BAR_TARGET_FILL = 75;   // where 100%-of-target lands on the bar

function loadBarState(actualKg, targetKg, tolPct){
  tolPct = tolPct || DEFAULT_TOL_PCT;
  // A band that ends at or below 100 would divide by zero below; treat it as a
  // hairline so "on target" is still reachable rather than instantly red.
  var span = Math.max(0.5, tolPct - 100);

  if(!targetKg) return { pct:0, fill:0, zone:'under' };
  var pct = (actualKg / targetKg) * 100;

  var fill, zone;
  // Strictly below target is yellow; hitting target exactly is already green —
  // "on target" should never look like "not there yet".
  if(pct < 100){
    fill = (pct / 100) * BAR_TARGET_FILL;
    zone = 'under';
  } else if(pct <= tolPct){
    fill = BAR_TARGET_FILL + ((pct - 100) / span) * (100 - BAR_TARGET_FILL);
    zone = 'good';
  } else {
    fill = 100;              // pinned — only the number moves from here
    zone = 'over';
  }
  return { pct: pct, fill: Math.max(0, Math.min(100, fill)), zone: zone };
}

// Tolerance for the ingredient behind a load row, falling back to the default.
function tolFor(ingredientId){
  var ing = ingredientById(ingredientId);
  return (ing && ing.tolPct) || DEFAULT_TOL_PCT;
}


// ── Per-head figures for the desktop transaction view ────────────
// Every delivery, flattened with what it cost and what each animal got.
// Dry matter of what was ACTUALLY loaded, not of the ration as it reads today.
// Built from the load lines because those are snapshotted per feeding: editing
// a ration next month must not rewrite what last month's mix contained. Only
// the ingredients' dmPct can still move, and that is a property of the feed.
function feedingDmPct(feedingId){
  var kg = 0, dm = 0;
  loadsFor(feedingId).forEach(function(l){
    var k = l.actualKg || 0;
    if(!k) return;
    var ing = ingredientById(l.ingredientId);
    kg += k;
    dm += k * ((((ing && ing.dmPct) != null) ? ing.dmPct : 100) / 100);
  });
  return kg ? (dm / kg) * 100 : null;
}

function deliveryDetail(deliveryId){
  var d = getDeliveries().find(function(x){ return x.id === deliveryId; });
  if(!d) return null;
  var f = getFeedings().find(function(x){ return x.id === d.feedingId; });
  var mix = mixerContentKg(f);
  if(!f || !mix) return null;

  var share = d.actualKg / mix;                     // this pen's slice of the mix
  var cost  = feedingCost(f.id) * share;
  var dmPct = feedingDmPct(f.id);

  return {
    at: d.at,
    lotName: d.lotName,
    headCount: d.headCount,
    kg: d.actualKg,
    kgPerHead: d.kgPerHead != null ? d.kgPerHead : (d.headCount ? d.actualKg / d.headCount : null),
    dmPct: dmPct,
    // Intake is judged on DRY MATTER — as-fed says more about moisture than
    // about what the animal actually ate.
    dmPerHead: (dmPct != null && d.headCount) ? (d.actualKg * (dmPct/100)) / d.headCount : null,
    cost: cost,
    costPerHead: d.headCount ? cost / d.headCount : null,
    ration: f.rationName,
    operator: f.operatorName,
    meal: f.meal
  };
}

// Average daily gain from the two weigh-ins that bracket the window, and the
// feed conversion ratio that falls out of it. This is the number that tells a
// feedlot whether the diet is working.
function lotGain(lotId){
  var ws = getBunkScores && getWeighIns ? getWeighIns() : [];
  var mine = ws.filter(function(w){ return w.lotId === lotId && w.avgWeightKg; })
               .sort(function(a,b){ return new Date(a.at) - new Date(b.at); });
  if(mine.length < 2) return null;

  var first = mine[0], last = mine[mine.length - 1];
  var days = (new Date(last.at) - new Date(first.at)) / 86400000;
  if(days <= 0) return null;

  var gainPerHead = last.avgWeightKg - first.avgWeightKg;
  var adg = gainPerHead / days;

  // Feed eaten per head across the same window, as fed.
  var since = new Date(first.at).getTime(), until = new Date(last.at).getTime();
  var fed = 0, fedDm = 0, head = last.headCount || first.headCount || 0;
  getDeliveries().forEach(function(d){
    if(d.lotId !== lotId || !d.at || !d.actualKg) return;
    var t = new Date(d.at).getTime();
    if(t < since || t > until) return;
    var perHead = (d.kgPerHead != null ? d.kgPerHead : (d.headCount ? d.actualKg / d.headCount : 0));
    fed   += perHead;
    fedDm += (d.dmKgPerHead != null ? d.dmKgPerHead : perHead);
  });

  return {
    days: days,
    gainPerHead: gainPerHead,
    adg: adg,                                        // kg/head/day
    feedPerHead: fed,                                // as fed
    dmPerHead: fedDm,                                // dry matter
    // Feed conversion, DM basis — the figure the industry quotes. The as-fed
    // ratio is kept alongside it because that is what leaves the silo.
    conversion:      gainPerHead > 0 ? fedDm / gainPerHead : null,
    conversionAsFed: gainPerHead > 0 ? fed   / gainPerHead : null,
    headCount: head
  };
}

var LS_WEIGHINS = 'vf_weigh_ins';
function getWeighIns(){ return _lsGet(LS_WEIGHINS); }
function saveWeighIns(v){ _lsSet(LS_WEIGHINS, v); }

function recordWeighIn(lotId, avgWeightKg, headCount){
  var lot = lotById(lotId);
  var row = {
    id: uid(), lotId: lotId, lotName: lot ? lot.name : '',
    cycleId: activeCycleId,
    avgWeightKg: avgWeightKg,
    headCount: headCount || (lot && lot.headCount) || 0,
    at: new Date().toISOString()
  };
  _upsert(getWeighIns(), saveWeighIns, 'vf_weigh_ins', row);
  // A weigh-in is the best average the pen has; carry it onto the lot.
  if(lot){ lot.avgWeightKg = avgWeightKg; _upsert(getLots(), saveLots, 'vf_lots', lot); }
  return row;
}


// Dry-matter fraction of what is actually in the mixer right now, weighted by
// the kilos of each ingredient loaded. Needed because intake is judged on dry
// matter: 22 kg as-fed of a wet silage ration is nothing like 22 kg of grain.
function mixDryMatterFraction(feedingId){
  var rows = loadsFor(feedingId).filter(function(l){ return l.actualKg; });
  if(!rows.length) return null;
  var total = 0, dm = 0;
  rows.forEach(function(l){
    var ing = ingredientById(l.ingredientId);
    total += l.actualKg;
    dm    += l.actualKg * (((ing && ing.dmPct) != null ? ing.dmPct : 100) / 100);
  });
  return total ? dm / total : null;
}


// ── Adopting an account's real cycle after signing in ────────────
// A fresh device creates an empty placeholder cycle at boot so the app is
// usable offline. Sign in on that device and the pull brings down the account's
// real cycles — but activeCycleId still points at the placeholder, so every
// screen reads empty while the data sits right there in localStorage.
// This is the normal second-device path, not an edge case.
function _adoptCloudCycle(){
  var cycles = getCycles();
  if(!cycles.length) return;

  var active = cycles.find(function(c){ return c.id === activeCycleId; });
  // Only ever discard a placeholder, and only one the user never put data in.
  if(active && !active.auto) return;

  var used = {};
  getFeedings().forEach(function(f){ if(f.cycleId) used[f.cycleId] = true; });
  getLots().forEach(function(l){ if(l.cycleId) used[l.cycleId] = true; });

  if(active && used[active.id]) return;          // placeholder has real work in it

  var real = cycles.filter(function(c){ return c.id !== (active && active.id) && used[c.id]; });
  if(!real.length) real = cycles.filter(function(c){ return c.id !== (active && active.id) && c.active !== false; });
  if(!real.length) return;

  setActiveCycle(real[0].id);

  // Drop the placeholder so it does not linger in the cycle list forever. It
  // was never pushed anywhere that matters — but delete through the engine so
  // any device that did see it removes it too.
  if(active && active.auto) deleteCycle(active.id);
}

function deleteCycle(id){ _remove(getCycles(), saveCycles, 'vf_cycles', id); }

// ══════════════════════════════════════════════════════════════════
//  STOCK LEDGER
//  Stock used to be a single number that only ever went down. That makes
//  the runway estimate untrustworthy the moment a truck arrives, and it
//  hides shrink entirely — spoilage, spillage, the bucket nobody logged.
//  Every movement is now written down, and the ingredient's stock_kg is
//  just the running balance.
// ══════════════════════════════════════════════════════════════════
var LS_STOCK_MOVES = 'vf_stock_moves';
function getStockMoves(){ return _lsGet(LS_STOCK_MOVES); }
function saveStockMoves(v){ _lsSet(LS_STOCK_MOVES, v); }

// ── FIFO cost layers ─────────────────────────────────────────────
//  An ingredient does not have "a price" — it has a stack of loads, each
//  bought at what it cost that day. Feeding draws from the oldest first, so
//  the 500 kg left over from a cheap load stays cheap until it is gone.
//
//  Which layers remain is DERIVED by replaying the ledger, never stored: two
//  tablets replaying the same moves get the same answer, so there is nothing
//  to keep in sync and a corrected entry heals itself. What IS stored is the
//  resolved cost on each consuming move, written once at the time — a closed
//  period must stay closed, and recomputing on read is exactly what used to
//  let a purchase today rewrite what last month cost.

function _movesInOrder(ingredientId){
  return getStockMoves()
    .filter(function(m){ return m.ingredientId === ingredientId; })
    .sort(function(a,b){
      var at = a.at || '', bt = b.at || '';
      // Ties broken by id so a replay is stable between devices; a tablet
      // syncing a backlog can write several moves in the same millisecond.
      if(at !== bt) return at < bt ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;
    });
}

// Takes `kg` off the front of the layer stack, mutating it. Returns what the
// kilos cost and which receipts they came from.
function _drawLayers(layers, kg, fallbackCost){
  var take = [], cost = 0, left = kg, shortfall = 0;

  while(left > 0.0001 && layers.length){
    var top = layers[0];
    var n = Math.min(top.remaining, left);
    top.remaining -= n;
    left -= n;
    cost += n * top.costPerKg;
    take.push({ moveId: top.moveId, kg: n, costPerKg: top.costPerKg });
    if(top.remaining <= 0.0001) layers.shift();
  }

  // More was fed than was ever received. The ledger deliberately allows a
  // negative balance because that discrepancy is the thing worth seeing —
  // so cost the shortfall at the last known price rather than at zero, which
  // would report the feed as free and hide it a second time.
  if(left > 0.0001){
    shortfall = left;
    cost += left * fallbackCost;
    take.push({ moveId: null, kg: left, costPerKg: fallbackCost });
  }

  return { cost: cost, allocation: take, shortfall: shortfall };
}

// Replays the ledger and returns the layers still on hand, oldest first.
// `before` (ISO string, optional) stops the replay — used to cost a move as of
// the moment it happened rather than as of now.
function stockLayers(ingredientId, before){
  var ing = ingredientById(ingredientId);
  // Last resort only: an old receipt written before prices were recorded, or
  // a drawdown with nothing left to draw from.
  var fallback = (ing && ing.costPerKg) || 0;
  var layers = [];

  _movesInOrder(ingredientId).forEach(function(m){
    if(before && m.at && m.at >= before) return;
    var delta = m.deltaKg || 0;

    if(delta > 0){
      // A receipt with no price is not free — it is unpriced. Carry the most
      // recent known cost forward so it does not silently deflate the average.
      var price = (m.costPerKg != null && m.costPerKg > 0) ? m.costPerKg
                : layers.length ? layers[layers.length-1].costPerKg
                : fallback;
      layers.push({
        moveId: m.id, at: m.at, costPerKg: price, kg: delta, remaining: delta,
        // A positive count is somebody finding more than the book said. It is
        // a correction, not a purchase, and is flagged so a value report can
        // say where the money came from.
        correction: m.kind === 'count'
      });
    } else if(delta < 0){
      // Shrink consumes layers exactly like feeding does: the kilos are gone
      // either way, and leaving them in would drift the layers away from the
      // balance they are supposed to explain.
      _drawLayers(layers, -delta, layers.length ? layers[0].costPerKg : fallback);
    }
  });

  return layers;
}

// What `kg` would cost right now, without recording anything.
function costOfDrawdown(ingredientId, kg){
  var ing = ingredientById(ingredientId);
  var layers = stockLayers(ingredientId);
  var fallback = layers.length ? layers[0].costPerKg : ((ing && ing.costPerKg) || 0);
  var drawn = _drawLayers(layers, kg, fallback);
  return {
    unitCost: kg > 0 ? drawn.cost / kg : 0,
    cost: drawn.cost,
    allocation: drawn.allocation,
    shortfallKg: drawn.shortfall
  };
}

// What the stock on hand is actually worth — what was paid for it, not what it
// would cost to replace. Also gives the blended price, which is the weighted
// average the layers make redundant to store.
function stockValue(ingredientId){
  var layers = stockLayers(ingredientId);
  var kg = 0, value = 0;
  layers.forEach(function(l){ kg += l.remaining; value += l.remaining * l.costPerKg; });
  return { kg: kg, value: value, avgCostPerKg: kg > 0 ? value / kg : 0, layers: layers };
}

function stockMovesFor(ingredientId, limit){
  var rows = getStockMoves().filter(function(m){ return m.ingredientId === ingredientId; })
                            .sort(function(a,b){ return new Date(b.at) - new Date(a.at); });
  return limit ? rows.slice(0, limit) : rows;
}

function _logStockMove(ing, kind, deltaKg, extra){
  // Deliberately NOT clamped at zero. A book balance that goes negative means
  // more was fed than was ever received — a delivery nobody wrote down, or a
  // bad count. Clamping to zero hides exactly the discrepancy the ledger exists
  // to surface; the UI flags the negative instead.
  ing.stockKg = (ing.stockKg || 0) + deltaKg;
  var move = Object.assign({
    id: uid(),
    ingredientId: ing.id,
    ingredientName: ing.name,      // snapshot
    kind: kind,
    deltaKg: deltaKg,
    balanceKg: ing.stockKg,
    at: new Date().toISOString()
  }, extra || {});
  _upsert(getStockMoves(), saveStockMoves, 'vf_stock_moves', move);
  _upsert(getIngredients(), saveIngredients, 'vf_ingredients', ing);
  return move;
}

// A delivery arrives. Price is per-delivery, so this is also where the
// ingredient's cost is kept current without anyone editing a settings field.
function receiveStock(ingredientId, kg, opts){
  opts = opts || {};
  var ing = ingredientById(ingredientId);
  if(!ing || !(kg > 0)) return null;

  // Cost arrives one of two ways: a price per kg, or the invoice total. Derive
  // the per-kg from the total when that is what was entered, and keep BOTH —
  // the total is the figure on the paper, and rounding a derived per-kg back up
  // would not reproduce it.
  var total  = (opts.totalCost > 0) ? opts.totalCost : null;
  var perKg  = (opts.costPerKg > 0) ? opts.costPerKg : null;
  if(total && !perKg) perKg = total / kg;
  if(perKg && !total) total = perKg * kg;

  // The ingredient's standing price follows the most recent delivery, so it
  // stays current without anyone editing a settings field.
  if(perKg > 0) ing.costPerKg = perKg;

  return _logStockMove(ing, 'receipt', kg, {
    costPerKg: perKg || null,
    totalCost: total || null,
    supplier:  opts.supplier  || null,
    note:      opts.note      || null,
    // Staged on the device; the sync uploads it and swaps this for photoPath.
    // Lines from one truck share both, so the invoice uploads once.
    photoLocal: opts.photo || null,
    photoPath:  null,
    deliveryId: opts.deliveryId || null
  });
}

// Somebody measured the bunker. The gap between what the book says and what is
// actually there IS the shrink — recording it is the whole point, so the delta
// is kept rather than quietly overwriting the balance.
function countStock(ingredientId, countedKg, note){
  var ing = ingredientById(ingredientId);
  if(!ing || countedKg == null || countedKg < 0) return null;   // a physical count cannot be negative
  var book  = ing.stockKg || 0;
  var delta = countedKg - book;
  var extra = { countedKg: countedKg, note: note || null };

  // Shrink costs money, and that is the number worth seeing: kilos missing
  // says spillage happened, guaraníes says how much it mattered. Found stock
  // is a correction with no purchase behind it, so it carries no cost.
  if(delta < 0) Object.assign(extra, _costFields(ingredientId, -delta));

  return _logStockMove(ing, 'count', delta, extra);
}

// Loading the mixer consumes stock. Routed through the ledger so the runway,
// the balance and the audit trail can never disagree with each other.
function consumeStock(ingredientId, kg, feedingId){
  var ing = ingredientById(ingredientId);
  if(!ing || !(kg > 0)) return null;
  return _logStockMove(ing, 'feed', -kg,
    Object.assign({ note: feedingId || null }, _costFields(ingredientId, kg)));
}

// Resolves a drawdown against the layers and shapes it for the ledger row.
// Called BEFORE the move is written, so the move being costed is not yet in
// the replay and cannot consume itself.
function _costFields(ingredientId, kg){
  var c = costOfDrawdown(ingredientId, kg);
  // A shortfall needs no field of its own: the allocation records it as an
  // entry with no receipt behind it.
  return { unitCost: c.unitCost, cost: c.cost, allocation: c.allocation };
}

// Shrink over a window: how much stock went missing that feeding cannot explain.
// Expressed against everything that passed through, which is how the industry
// quotes it.
function shrinkFor(ingredientId, days){
  days = days || 30;
  var since = Date.now() - days*86400000;
  var moves = getStockMoves().filter(function(m){
    return m.ingredientId === ingredientId && m.at && new Date(m.at).getTime() >= since;
  });
  if(!moves.length) return null;

  var received = 0, fed = 0, lost = 0, counts = 0;
  moves.forEach(function(m){
    if(m.kind === 'receipt') received += m.deltaKg;
    else if(m.kind === 'feed') fed += -m.deltaKg;
    else if(m.kind === 'count'){ counts++; if(m.deltaKg < 0) lost += -m.deltaKg; }
    else if(m.kind === 'adjust' && m.deltaKg < 0) lost += -m.deltaKg;
  });

  // No physical count means no shrink measurement — an unmeasured figure must
  // read as unknown, not as zero.
  if(!counts) return { received: received, fed: fed, lostKg: null, pct: null, counted: false };

  var throughput = received + fed;
  return {
    received: received,
    fed: fed,
    lostKg: lost,
    pct: throughput > 0 ? (lost / throughput) * 100 : null,
    counted: true
  };
}

// ══════════════════════════════════════════════════════════════════
//  PEN ADJUSTMENT
//  The manager's direct handle on a pen's feed rate, alongside the
//  bunk reading's automatic one. Both move the same feed_factor, so
//  there is one answer to "why is this pen getting what it is".
// ══════════════════════════════════════════════════════════════════

// What the ration prescribes per head, before any adjustment.
// Dry matter of the finished mix. Shown as information rather than a warning:
// a silage TMR lands around 45-55%, but a legitimately dry ration can sit near
// 90%, so there is no honest threshold to alarm on — the number itself is what
// a nutritionist reads.
function rationDmPct(rationId){
  var w = 0, dm = 0;
  rationItemsFor(rationId).forEach(function(it){
    var ing = ingredientById(it.ingredientId);
    // Weight each line by whatever the ration is written in. A percentage
    // ration has no kg on the line at all, and weighting by a missing kg gave
    // a total of zero — so DM came back null and the bodyweight intake mode,
    // which divides by it to convert DM to as-fed, could not compute anything.
    var k = (it.pctOfMix != null) ? it.pctOfMix : (it.kgPerHead || 0);
    w  += k;
    dm += k * ((((ing && ing.dmPct) != null) ? ing.dmPct : 100) / 100);
  });
  return w ? (dm / w) * 100 : null;
}

// Ways a ration can be saved and still be wrong — the kind nobody notices until
// cattle are off feed. Only checks that are unambiguous from the data; a
// threshold that guesses would train people to ignore the warning.
function rationIssues(rationId){
  var out   = [];
  var items = rationItemsFor(rationId);
  if(!items.length) return [T('No ingredients in this ration')];

  // A ration nobody feeds is usually a leftover draft, and it is invisible
  // otherwise — nothing else on this screen says whether it is in use.
  if(!cycleGroups().some(function(g){ return g.rationId === rationId; })){
    out.push(T('No feed group uses this ration'));
  }

  items.forEach(function(it){
    var ing  = ingredientById(it.ingredientId);
    var name = ing ? ing.name : T('Unknown');
    // Added to the list but never given an amount: it silently contributes
    // nothing to the mix while looking present.
    if(!(it.kgPerHead > 0)) out.push(name + ' — ' + T('no amount set'));
    // The mix cannot actually be made tomorrow.
    else if(ing && (ing.stockKg || 0) <= 0) out.push(name + ' — ' + T('no stock'));
  });
  return out;
}

function rationKgPerHead(rationId){
  return rationItemsFor(rationId).reduce(function(s,it){ return s + (it.kgPerHead||0); }, 0);
}

// What this pen actually gets, after its factor.
function lotAdjustedKgPerHead(lot){
  if(!lot) return 0;
  return (intakeKgPerHead(lot, lotRationId(lot)) || 0) * lotFeedFactor(lot);
}

// Set the adjustment directly, as a percentage off the formula.
// Clamped to the same range the bunk rule uses — a manual change is deliberate,
// but the reason for the ceiling is the animal, not the mechanism, so it holds
// either way. Recorded in the same ledger as bunk scores (score null marks it
// as a manual entry) so a pen's history reads as one story.
function setLotFeedAdjustment(lotId, pct, note){
  var lot = lotById(lotId);
  if(!lot) return null;

  var wanted = 1 + (pct/100);
  var next   = Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, wanted));
  var prev   = lotFeedFactor(lot);
  if(Math.abs(next - prev) < 0.0001) return null;      // nothing changed

  lot.feedFactor = next;
  _upsert(getLots(), saveLots, 'vf_lots', lot);

  _upsert(getBunkScores(), saveBunkScores, 'vf_bunk_scores', {
    id: uid(),
    lotId: lotId,
    lotName: lot.name,
    cycleId: activeCycleId,
    score: null,                                       // null = set by hand
    suggestedPct: null,
    appliedPct: (next/prev - 1) * 100,
    factorAfter: next,
    operatorName: (typeof currentWorker === 'object' && currentWorker && currentWorker.name) || '',
    at: new Date().toISOString()
  });
  return { factor: next, clamped: Math.abs(next - wanted) > 0.0001 };
}

// Rolling per-head averages, 1 through `days` days back — Libra's "Recent Fed
// Averages". Each row is the mean over that whole window, not that single day,
// which is what smooths out one heavy drop.
function lotFedAverages(lotId, days){
  days = days || 7;
  var rows = getDeliveries().filter(function(d){ return d.lotId === lotId && d.at && d.actualKg; });
  var out = [];
  for(var n = 1; n <= days; n++){
    var since = Date.now() - n*86400000;
    var win = rows.filter(function(d){ return new Date(d.at).getTime() >= since; });
    if(!win.length){ out.push({ days:n, kgPerHead:0, dmPerHead:0 }); continue; }

    var perHead = 0, dm = 0, dayKeys = {};
    win.forEach(function(d){
      perHead += (d.kgPerHead != null ? d.kgPerHead : (d.headCount ? d.actualKg/d.headCount : 0));
      dm      += (d.dmKgPerHead != null ? d.dmKgPerHead : 0);
      dayKeys[new Date(d.at).toDateString()] = 1;
    });
    // Divide by days actually fed, for the same reason every other per-day
    // figure in this app does.
    var fedDays = Math.max(1, Object.keys(dayKeys).length);
    out.push({ days:n, kgPerHead: perHead/fedDays, dmPerHead: dm/fedDays });
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════
//  FEED GROUPS
//  A named ration plus the pens that get it, fed as one mixer load.
//  Membership is many-to-many on purpose: a pen can take a forage load
//  and a concentrate load in the same day, or a different mix morning
//  and afternoon. Its intake is the SUM across its groups, which is
//  why a pen's total can exceed any single ration.
// ══════════════════════════════════════════════════════════════════
var LS_GROUPS     = 'vf_feed_groups';
var LS_LOT_GROUPS = 'vf_lot_groups';

function getFeedGroups(){ return _lsGet(LS_GROUPS); }
function saveFeedGroups(v){ _lsSet(LS_GROUPS, v); }
function getLotGroups(){ return _lsGet(LS_LOT_GROUPS); }
function saveLotGroups(v){ _lsSet(LS_LOT_GROUPS, v); }

function cycleGroups(){
  return getFeedGroups()
    .filter(function(g){ return g.active !== false && (!activeCycleId || !g.cycleId || g.cycleId === activeCycleId); })
    .sort(function(a,b){ return (a.routeOrder||0) - (b.routeOrder||0); });
}

function groupById(id){ return getFeedGroups().find(function(g){ return g.id === id; }) || null; }

function saveFeedGroup(g){
  if(!g.id){ g.id = uid(); g.cycleId = activeCycleId; }
  if(g.active === undefined) g.active = true;
  return _upsert(getFeedGroups(), saveFeedGroups, 'vf_feed_groups', g);
}

function deleteFeedGroup(id){
  _remove(getFeedGroups(), saveFeedGroups, 'vf_feed_groups', id);
  getLotGroups().filter(function(m){ return m.groupId === id; })
                .forEach(function(m){ _remove(getLotGroups(), saveLotGroups, 'vf_lot_groups', m.id); });
}

// ── Membership ───────────────────────────────────────────────────
function lotsInGroup(groupId){
  var members = getLotGroups().filter(function(m){ return m.groupId === groupId; })
                              .sort(function(a,b){ return (a.seq||0) - (b.seq||0); });
  return members.map(function(m){ return lotById(m.lotId); })
                .filter(function(l){ return l && l.active !== false; });
}

function groupsForLot(lotId){
  var ids = getLotGroups().filter(function(m){ return m.lotId === lotId; })
                          .map(function(m){ return m.groupId; });
  return cycleGroups().filter(function(g){ return ids.indexOf(g.id) !== -1; });
}

function setLotInGroup(lotId, groupId, inGroup, seq){
  var all  = getLotGroups();
  var hit  = all.find(function(m){ return m.lotId === lotId && m.groupId === groupId; });
  if(inGroup){
    if(hit){
      if(seq != null && hit.seq !== seq){ hit.seq = seq; _upsert(all, saveLotGroups, 'vf_lot_groups', hit); }
      return hit;
    }
    return _upsert(all, saveLotGroups, 'vf_lot_groups',
      { id: uid(), lotId: lotId, groupId: groupId, seq: seq || 0 });
  }
  if(hit) _remove(all, saveLotGroups, 'vf_lot_groups', hit.id);
  return null;
}

// Order pens the way this group's route runs. seq is per-membership, so a pen
// in two groups can be third in one and first in the other. Falls back to the
// lot's global routeOrder for anything not in the group.
function orderLotsForGroup(lots, groupId){
  var seq = {};
  if(groupId){
    getLotGroups().forEach(function(m){
      if(m.groupId === groupId) seq[m.lotId] = (m.seq || 0);
    });
  }
  return lots.slice().sort(function(a,b){
    var av = seq[a.id], bv = seq[b.id];
    if(av !== undefined && bv !== undefined) return av - bv;
    if(av !== undefined) return -1;          // group members lead
    if(bv !== undefined) return 1;
    return (a.routeOrder||0) - (b.routeOrder||0);
  });
}

// Append to the end of a group's route rather than adopting the pen's global
// order — otherwise every newly ticked pen lands in the middle of the route.
function nextGroupSeq(groupId){
  var max = -1;
  getLotGroups().forEach(function(m){
    if(m.groupId === groupId && (m.seq||0) > max) max = (m.seq||0);
  });
  return max + 1;
}

// ══ MIXER WORKING RANGE ══
// Both bounds matter, and the lower one is the one people miss. Over capacity
// the batch physically will not fit. UNDER about 40% of capacity a vertical
// mixer cannot tumble the load: it sorts, and cattle pick the grain out of it —
// a nutrition failure that looks like nothing on the scale.
//
// Returns null when no mixer is selected or it has no capacity on file: an
// unknown limit must not read as a passed check.
function mixerLoadCheck(groupId, mixerId){
  var m = getMixers().find(function(x){ return x.id === (mixerId || _activeMixerId); });
  if(!m || !(m.capacityKg > 0)) return null;

  var kg  = groupLoadKg(groupId);
  var cap = m.capacityKg;
  var min = (m.minLoadKg > 0) ? m.minLoadKg : cap * 0.40;

  if(kg > cap){
    return { state:'over', kg:kg, capacityKg:cap, minLoadKg:min, mixerName:m.name,
             // Ceil, because a part-batch is still a batch to drive.
             batches: Math.ceil(kg / cap), perBatchKg: kg / Math.ceil(kg / cap) };
  }
  if(kg < min){
    return { state:'under', kg:kg, capacityKg:cap, minLoadKg:min, mixerName:m.name,
             pctOfCapacity: (kg / cap) * 100 };
  }
  return { state:'ok', kg:kg, capacityKg:cap, minLoadKg:min, mixerName:m.name };
}

// Route order that ends on the biggest pen. Accumulated weigh-off error lands
// in the final drop, and the same kilos matter least as a percentage on the
// pen with the most head. Offered, not enforced — the physical route around the
// yard is the operator's call and may not match.
function suggestRouteOrder(groupId){
  return lotsInGroup(groupId).slice().sort(function(a,b){
    var av = (a.headCount||0) * lotFeedFactor(a);
    var bv = (b.headCount||0) * lotFeedFactor(b);
    return av - bv;                       // ascending: largest ends up last
  }).map(function(l){ return l.id; });
}

// Is the group's route already ending on its biggest pen?
function routeEndsOnLargest(groupId){
  var cur = lotsInGroup(groupId);
  if(cur.length < 2) return true;
  var sizes = cur.map(function(l){ return (l.headCount||0) * lotFeedFactor(l); });
  var last  = sizes[sizes.length-1];
  return last >= Math.max.apply(null, sizes);
}

// Persist a group's route order from an array of lot ids, in order.
function reorderGroupLots(groupId, lotIds){
  var all = getLotGroups();
  lotIds.forEach(function(lotId, i){
    var hit = all.find(function(m){ return m.groupId === groupId && m.lotId === lotId; });
    if(hit && hit.seq !== i){ hit.seq = i; _upsert(all, saveLotGroups, 'vf_lot_groups', hit); }
  });
}

// ══ WHICH RECORD WINS ══
// ration_id, meals_per_day and route_order exist on BOTH vf_lots and
// vf_feed_groups. They agree in the demo data and will drift the moment anyone
// edits one side. The rule: THE GROUP WINS WHENEVER THE PEN IS GROUPED. The
// group is what the mixer is loaded for, so it is the only one that can be
// right. The lot-level columns survive only for a pen that belongs to no group.
//
// A pen in several groups has no single ration by definition — it eats from
// each — so this returns null rather than picking one arbitrarily. Callers that
// need the breakdown use lotGroupBreakdown().
function lotRationId(lot){
  if(!lot) return null;
  var gs = groupsForLot(lot.id);
  if(gs.length === 1) return gs[0].rationId || null;
  if(gs.length > 1)   return null;              // ambiguous on purpose
  return lot.rationId || null;                  // ungrouped: the pen's own
}

function lotMealsPerDay(lot){
  if(!lot) return 2;
  var gs = groupsForLot(lot.id);
  if(gs.length) return gs[0].mealsPerDay || 2;
  return lot.mealsPerDay || 2;
}

// True when the pen's own columns disagree with the group that owns it. Used to
// warn rather than to silently rewrite: the stale value may be the intended one.
function lotFieldsDrifted(lot){
  if(!lot) return null;
  var gs = groupsForLot(lot.id);
  if(gs.length !== 1) return null;
  var g = gs[0], out = [];
  if(lot.rationId    && lot.rationId    !== g.rationId)    out.push('ration');
  if(lot.mealsPerDay && lot.mealsPerDay !== g.mealsPerDay) out.push('meals');
  return out.length ? out : null;
}

// ── What a pen actually gets ─────────────────────────────────────
// Per group, and in total. The pen's feed factor applies to every group it is
// in — the adjustment is a property of the animals, not of one mix.
function lotGroupBreakdown(lotId){
  var lot = lotById(lotId);
  if(!lot) return [];
  var f = lotFeedFactor(lot);
  return groupsForLot(lotId).map(function(g){
    var base = rationKgPerHead(g.rationId);
    return {
      groupId: g.id, groupName: g.name,
      rationName: (rationById(g.rationId) || {}).name || '—',
      baseKgPerHead: base,
      kgPerHead: base * f
    };
  });
}

function lotTotalKgPerHead(lotId){
  return lotGroupBreakdown(lotId).reduce(function(s, r){ return s + r.kgPerHead; }, 0);
}

// ── First run / upgrade ──────────────────────────────────────────
// Devices that were using ration-per-lot get a group per ration so nothing
// they already set up stops working. Mirrors the server-side migration.
function ensureFeedGroups(){
  if(getFeedGroups().length) return;
  var lots = getLots().filter(function(l){ return l.active !== false && l.rationId; });
  if(!lots.length) return;

  var byRation = {};
  lots.forEach(function(l){ (byRation[l.rationId] = byRation[l.rationId] || []).push(l); });

  Object.keys(byRation).forEach(function(rid, i){
    var r = rationById(rid);
    var g = saveFeedGroup({ name: (r && r.name) || T('Group') + ' ' + (i+1),
                            rationId: rid, mealsPerDay: 2, routeOrder: i });
    byRation[rid].forEach(function(l){ setLotInGroup(l.id, g.id, true, l.routeOrder || 0); });
  });
}

// ══════════════════════════════════════════════════════════════════
//  MEAL SPLITS
//  How a group's daily ration divides between its feedings. Even is a
//  poor default where it gets hot: cattle eat better in the cool, so
//  40/60 with the bigger evening load is ordinary practice.
// ══════════════════════════════════════════════════════════════════

// Always returns `meals` numbers summing to 100, whatever is stored.
function groupSplits(group){
  var meals = (group && group.mealsPerDay > 0) ? Math.round(group.mealsPerDay) : 1;
  var raw = (group && group.mealSplits) || '';
  var parts = String(raw).split(',').map(function(x){ return parseFloat(x); })
                         .filter(function(x){ return !isNaN(x) && x >= 0; });

  // Stored value no longer matches the meal count (someone changed 2x to 3x),
  // so fall back to even rather than feeding a stale share.
  if(parts.length !== meals) return _evenSplit(meals);

  var sum = parts.reduce(function(a,b){ return a+b; }, 0);
  if(sum <= 0) return _evenSplit(meals);
  // Normalise so the shares are trustworthy even if they were entered as 45/50.
  return parts.map(function(p){ return (p / sum) * 100; });
}

function _evenSplit(meals){
  var each = 100 / meals, out = [];
  for(var i = 0; i < meals; i++) out.push(each);
  return out;
}

// Share of the daily ration for one feeding, as a fraction.
function mealShare(group, mealIndex){
  var splits = groupSplits(group);
  var i = Math.min(Math.max(1, mealIndex || 1), splits.length) - 1;
  return splits[i] / 100;
}

// Which feeding of the day is next for this group: one past however many have
// already been recorded today. Counting what actually happened beats reading
// the clock — an operator running two hours late still gets the right load.
function nextMealIndex(groupId){
  var today = new Date().toDateString();
  var done = cycleFeedings().filter(function(f){
    return f.groupId === groupId && f.startedAt && f.status !== 'abandoned' &&
           new Date(f.startedAt).toDateString() === today;
  }).length;
  var g = groupById(groupId);
  var meals = (g && g.mealsPerDay > 0) ? g.mealsPerDay : 1;
  return Math.min(done + 1, meals);
}

function mealLabel(group, mealIndex){
  var meals = (group && group.mealsPerDay > 0) ? group.mealsPerDay : 1;
  if(meals === 1) return T('Single feeding');
  if(meals === 2) return mealIndex === 1 ? T('Morning') : T('Afternoon');
  if(meals === 3) return [T('Morning'), T('Midday'), T('Evening')][mealIndex-1] || (T('Feeding') + ' ' + mealIndex);
  return T('Feeding') + ' ' + mealIndex;
}

// ══════════════════════════════════════════════════════════════════
//  FEED RETURNS (refusals)
//  What the cattle left, scraped back into the mixer.
// ══════════════════════════════════════════════════════════════════
var LS_RETURNS = 'vf_feed_returns';
function getReturns(){ return _lsGet(LS_RETURNS); }
function saveReturns(v){ _lsSet(LS_RETURNS, v); }

// The feeding a pen's leftovers most likely came from: its last delivery.
function lastDeliveryForLot(lotId){
  return getDeliveries().filter(function(d){ return d.lotId === lotId && d.actualKg; })
    .sort(function(a,b){ return new Date(b.at) - new Date(a.at); })[0] || null;
}

// What is physically in the bunk: everything delivered to this pen since it was
// last scraped. A pen in two groups has BOTH mixes sitting in there, so a single
// scrape has to be shared between them — attributing it all to whichever fed
// last credits the wrong stock and shrinks the wrong group's next load.
function bunkDeliveriesForLot(lotId){
  var lastReturn = getReturns()
    .filter(function(r){ return r.lotId === lotId && r.at; })
    .sort(function(a,b){ return new Date(b.at) - new Date(a.at); })[0];

  // Nothing scraped before: fall back to the last 24h, which is the longest a
  // bunk normally goes without being cleaned.
  var since = lastReturn ? new Date(lastReturn.at).getTime()
                         : Date.now() - 24*3600*1000;

  return getDeliveries()
    .filter(function(d){
      return d.lotId === lotId && d.actualKg > 0 && d.at &&
             new Date(d.at).getTime() > since;
    })
    .sort(function(a,b){ return new Date(a.at) - new Date(b.at); });
}

// Total sitting in the bunk, for the "% refused" readout.
function bunkFedKg(lotId){
  return bunkDeliveriesForLot(lotId).reduce(function(s,d){ return s + d.actualKg; }, 0);
}

// Record a scrape. Produces one row per contributing feeding, apportioned by
// how much each put in the bunk, all sharing a batch id.
// One group, or nothing. A pen fed by two groups gives no basis for choosing
// which load should absorb the feed, and guessing would reduce the wrong ration.
function _soleGroupForLot(lotId){
  var gs = groupsForLot(lotId);
  return gs.length === 1 ? gs[0].id : null;
}

function recordFeedReturn(lotId, kg, opts){
  opts = opts || {};
  var lot = lotById(lotId);
  if(!lot || !(kg > 0)) return null;

  var batchId = uid();
  var op = (typeof currentWorker === 'object' && currentWorker && currentWorker.name) || '';
  var sources = opts.feedingId
    ? getDeliveries().filter(function(d){ return d.lotId === lotId && d.feedingId === opts.feedingId; })
    : bunkDeliveriesForLot(lotId);

  var total = sources.reduce(function(s,d){ return s + d.actualKg; }, 0);

  function write(kgPart, delivery){
    var feeding = delivery ? getFeedings().find(function(f){ return f.id === delivery.feedingId; }) : null;
    var row = {
      id: uid(),
      batchId: batchId,
      cycleId: activeCycleId,
      lotId: lotId,
      lotName: lot.name,
      // The group matters: it is what brings these kilos back as carryover on the
      // next load. Falling through to null — which happened whenever the scrape
      // could not be tied to a feeding — quietly stranded the feed: it sat in
      // the mixer, but no load knew to reduce its targets for it, so the pens
      // were then over-filled by that much. The pen's own group is the honest
      // fallback; only a pen in several groups is genuinely ambiguous.
      groupId: (feeding && feeding.groupId) || opts.groupId || _soleGroupForLot(lotId),
      feedingId: feeding ? feeding.id : null,
      kg: kgPart,
      headCount: lot.headCount || 0,
      operatorName: op,
      consumed: false,
      note: opts.note || null,
      at: new Date().toISOString()
    };
    _upsert(getReturns(), saveReturns, 'vf_feed_returns', row);

    // Credit stock back across THIS feeding's own mix. Each feeding may be a
    // different ration, so a single blended credit would be wrong.
    var mixKg = mixerContentKg(feeding);
    if(feeding && mixKg > 0){
      var frac = kgPart / mixKg;
      loadsFor(feeding.id).forEach(function(l){
        if(l.actualKg > 0 && l.ingredientId){
          var ing = ingredientById(l.ingredientId);
          if(ing) _logStockMove(ing, 'return', l.actualKg * frac, { note: row.id });
        }
      });
    }
    return row;
  }

  // Nothing to attribute it to — record the kilos so intake is still right,
  // but do not invent a stock credit we cannot substantiate.
  if(!sources.length || total <= 0) return write(kg, null);

  var rows = [], allocated = 0;
  sources.forEach(function(d, i){
    // Last one absorbs the rounding so the parts always sum to exactly kg.
    var part = (i === sources.length - 1) ? (kg - allocated)
                                          : Math.round((kg * (d.actualKg / total)) * 100) / 100;
    allocated += part;
    if(part > 0) rows.push(write(part, d));
  });
  return rows[0] || null;
}

// Net of refusals. Every per-head figure has to use this, not raw deliveries.
function lotReturnedKg(lotId, since){
  return getReturns().filter(function(r){
    return r.lotId === lotId && r.at && (!since || new Date(r.at).getTime() >= since);
  }).reduce(function(s,r){ return s + (r.kg||0); }, 0);
}

// Refused feed sitting in the mixer, waiting to go back out with this group.
function groupCarryoverKg(groupId){
  return getReturns().filter(function(r){ return r.groupId === groupId && !r.consumed; })
                     .reduce(function(s,r){ return s + (r.kg||0); }, 0);
}

function markCarryoverConsumed(groupId){
  var rows = getReturns();
  var hit = false;
  rows.forEach(function(r){
    if(r.groupId === groupId && !r.consumed){ r.consumed = true; hit = true; _markDirty('vf_feed_returns', r.id); }
  });
  if(hit) saveReturns(rows);
}

// ══════════════════════════════════════════════════════════════════
//  MIX TIMER
//  How long the mixer has to run after the last ingredient goes in.
//  Under-mixed feed sorts in the bunk — the cattle at the front eat the
//  grain and the ones at the back get the forage — so the ration on
//  paper stops being the ration any animal actually eats.
// ══════════════════════════════════════════════════════════════════

function rationMixSeconds(rationId){
  var r = rationById(rationId);
  var m = r && r.mixMinutes;
  return (m > 0) ? Math.round(m * 60) : 0;
}

// Called when the last ingredient is confirmed.
function startMixing(feedingId){
  var f = getFeedings().find(function(x){ return x.id === feedingId; });
  if(!f || f.mixStartedAt) return f;            // already running
  var now = new Date().toISOString();
  f.loadFinishedAt = f.loadFinishedAt || now;
  f.mixStartedAt   = now;
  f.mixRequiredSec = rationMixSeconds(f.rationId);
  return _upsert(getFeedings(), saveFeedings, 'vf_feedings', f);
}

// Seconds still to run. Derived from the start TIMESTAMP, not a counter, so it
// survives a tab switch, a reload, or the tablet sleeping in the cab.
function mixRemainingSec(feeding){
  if(!feeding || !feeding.mixStartedAt || !feeding.mixRequiredSec) return 0;
  var elapsed = (Date.now() - new Date(feeding.mixStartedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(feeding.mixRequiredSec - elapsed));
}

function mixElapsedSec(feeding){
  if(!feeding || !feeding.mixStartedAt) return 0;
  return Math.floor((Date.now() - new Date(feeding.mixStartedAt).getTime()) / 1000);
}

function fmtMMSS(sec){
  sec = Math.max(0, Math.round(sec));
  var m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// Stamp how long it really mixed, and whether the operator cut it short.
function stampMixOutcome(feedingId, early){
  var f = getFeedings().find(function(x){ return x.id === feedingId; });
  if(!f) return null;
  f.mixActualSec  = mixElapsedSec(f);
  f.unloadedEarly = !!early;
  return _upsert(getFeedings(), saveFeedings, 'vf_feedings', f);
}

// ── Operator roll-up (the desktop view) ──────────────────────────
// How often each operator unloaded before the mix finished. Reported as a rate
// as well as a count — three early unloads out of four is a different story
// from three out of two hundred.
function operatorMixStats(days){
  var since = days ? Date.now() - days*86400000 : 0;
  var by = {};
  cycleFeedings().forEach(function(f){
    if(!f.mixRequiredSec) return;                       // ration had no timer
    if(f.status === 'abandoned') return;                // never finished; not the operator's mixing record
    if(since && f.startedAt && new Date(f.startedAt).getTime() < since) return;
    var name = f.operatorName || T('Unknown');
    var s = by[name] || (by[name] = { operator:name, feedings:0, early:0, totalMixSec:0 });
    s.feedings++;
    if(f.unloadedEarly) s.early++;
    s.totalMixSec += (f.mixActualSec || 0);
  });
  return Object.keys(by).map(function(k){
    var s = by[k];
    s.earlyPct  = s.feedings ? (s.early / s.feedings) * 100 : 0;
    s.avgMixSec = s.feedings ? s.totalMixSec / s.feedings : 0;
    return s;
  }).sort(function(a,b){ return b.earlyPct - a.earlyPct; });
}

// ══════════════════════════════════════════════════════════════════
//  DELIVERY WINDOWS
//  When each feeding of a group should reach the bunk. Cattle settle
//  into a routine and eat worse when feeding time drifts, so this is a
//  husbandry measure before it is anything about the operator.
// ══════════════════════════════════════════════════════════════════

// Always returns one window per meal, or null entries where none is set.
function groupWindows(group){
  var meals = (group && group.mealsPerDay > 0) ? Math.round(group.mealsPerDay) : 1;
  var parts = String((group && group.mealWindows) || '').split(',');
  var out = [];
  for(var i = 0; i < meals; i++){
    var m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(parts[i] || '');
    out.push(m ? { from: (+m[1])*60 + (+m[2]), to: (+m[3])*60 + (+m[4]), text: parts[i].trim() } : null);
  }
  return out;
}

function fmtMinutesOfDay(min){
  var h = Math.floor(min/60), m = min % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

// Classify a delivery against its window. `when` is a Date.
function classifyDelivery(group, mealIndex, when){
  var w = groupWindows(group)[Math.max(0, (mealIndex||1) - 1)];
  if(!w) return null;                                  // untimed group; judge nothing

  var t = when.getHours()*60 + when.getMinutes();

  // A window that wraps midnight (e.g. 22:00-02:00) would otherwise mark every
  // delivery late. Shift into the same frame before comparing.
  var from = w.from, to = w.to, tt = t;
  if(to < from){ to += 1440; if(tt < from) tt += 1440; }

  if(tt < from) return { status:'early',  minutesOff: tt - from, window:w };
  if(tt > to)   return { status:'late',   minutesOff: tt - to,   window:w };
  return          { status:'ontime', minutesOff: 0,        window:w };
}

// Stamped when the feed actually starts reaching the pens — a slow load is a
// different problem from a late delivery, so loading time is not judged here.
function stampDeliveryTiming(feedingId){
  var f = getFeedings().find(function(x){ return x.id === feedingId; });
  if(!f) return null;
  var now = new Date();
  f.deliveryStartedAt = f.deliveryStartedAt || now.toISOString();

  var g = f.groupId ? groupById(f.groupId) : null;
  var c = g ? classifyDelivery(g, f.mealIndex, new Date(f.deliveryStartedAt)) : null;
  if(c){
    f.deliveryStatus     = c.status;
    f.deliveryMinutesOff = c.minutesOff;
  }
  return _upsert(getFeedings(), saveFeedings, 'vf_feedings', f);
}

// ── Punctuality per operator ─────────────────────────────────────
// Late and early are reported SEPARATELY and never combined into one score.
// A single -100…+100 axis reads an operator who is half early and half late as
// dead centre — i.e. perfectly punctual — when he is never on time at all.
// Two independent rates cannot cancel each other out.
function operatorPunctuality(days){
  var since = days ? Date.now() - days*86400000 : 0;
  var by = {};
  cycleFeedings().forEach(function(f){
    if(!f.deliveryStatus) return;                      // group had no window
    if(f.status === 'abandoned') return;               // never reached a bunk
    if(since && f.startedAt && new Date(f.startedAt).getTime() < since) return;

    var name = f.operatorName || T('Unknown');
    var s = by[name] || (by[name] = { operator:name, total:0, early:0, ontime:0, late:0, lateMinutes:0, earlyMinutes:0 });
    s.total++;
    s[f.deliveryStatus]++;
    if(f.deliveryStatus === 'late')  s.lateMinutes  += (f.deliveryMinutesOff || 0);
    if(f.deliveryStatus === 'early') s.earlyMinutes += Math.abs(f.deliveryMinutesOff || 0);
  });

  return Object.keys(by).map(function(k){
    var s = by[k];
    s.latePct    = s.total ? (s.late   / s.total) * 100 : 0;
    s.earlyPct   = s.total ? (s.early  / s.total) * 100 : 0;
    s.onTimePct  = s.total ? (s.ontime / s.total) * 100 : 0;
    s.avgLateMin  = s.late  ? s.lateMinutes  / s.late  : 0;
    s.avgEarlyMin = s.early ? s.earlyMinutes / s.early : 0;
    return s;
  // Worst on-time rate first — that is the one number that cannot be gamed by
  // being wrong in both directions.
  }).sort(function(a,b){ return a.onTimePct - b.onTimePct; });
}


// ══════════════════════════════════════════════════════════════════
//  SCALE RESOLUTION
//  Below a certain amount a mixer scale simply cannot be trusted, and
//  the operator is left staring at a bar that will not move.
// ══════════════════════════════════════════════════════════════════

// Load cells on a mixer read to roughly 0.1% of capacity in a lab; in a yard,
// with the machine running and sitting on uneven ground, repeatability is
// nearer 0.5%. That is the number that matters here — an amount the scale
// cannot REPEAT is one the operator cannot hit. Floored at 25 kg so a small
// wagon does not produce an implausibly precise threshold.
var SCALE_RESOLUTION_PCT   = 0.005;
var SCALE_RESOLUTION_FLOOR = 25;
var DEFAULT_MIXER_CAPACITY = 10000;

function scaleResolutionKg(){
  var m = getMixers().find(function(x){ return x.id === _activeMixerId; }) || getMixers()[0];
  var cap = (m && m.capacityKg > 0) ? m.capacityKg : DEFAULT_MIXER_CAPACITY;
  return Math.max(SCALE_RESOLUTION_FLOOR, cap * SCALE_RESOLUTION_PCT);
}

// What one load of this ingredient would actually weigh, for the groups that
// use this ration. Returns the SMALLEST across those groups — if any real load
// falls under the threshold, the hint is warranted.
function estimatedLoadKg(rationId, kgPerHead){
  if(!(kgPerHead > 0)) return null;
  var groups = cycleGroups().filter(function(g){ return g.rationId === rationId; });
  if(!groups.length) return null;

  var loads = groups.map(function(g){
    var head  = lotsInGroup(g.id).reduce(function(s,l){ return s + (l.headCount||0) * lotFeedFactor(l); }, 0);
    if(!head) return null;
    // Smallest meal of the day is the one most likely to fall below the floor.
    var share = Math.min.apply(null, groupSplits(g)) / 100;
    return kgPerHead * head * share;
  }).filter(function(v){ return v != null; });

  return loads.length ? Math.min.apply(null, loads) : null;
}

// Should this line be hand-added? Null when there is nothing to judge on.
function suggestManualAdd(rationId, kgPerHead){
  var est = estimatedLoadKg(rationId, kgPerHead);
  if(est == null) return null;
  var res = scaleResolutionKg();
  return est < res ? { estKg: est, resolutionKg: res } : null;
}

// ══════════════════════════════════════════════════════════════════
//  WHOLE-LOAD TOTALS
//  The operator thinks in "how full is the mixer", not in per-ingredient
//  deltas. These give the numbers for that view.
// ══════════════════════════════════════════════════════════════════

// Everything this feeding is meant to end up holding.
function feedingTargetKg(feedingId){
  return loadsFor(feedingId).reduce(function(s,l){ return s + (l.targetKg||0); }, 0);
}

// Still to go in, counting the active line's shortfall as well as untouched ones.
function feedingRemainingLoadKg(feedingId, activeStepKg, activeLoadId){
  return loadsFor(feedingId).reduce(function(s,l){
    if(l.actualKg !== null && l.actualKg !== undefined) return s;      // already in
    var done = (l.id === activeLoadId) ? (activeStepKg || 0) : 0;
    return s + Math.max(0, (l.targetKg||0) - done);
  }, 0);
}

// Still to come off, during delivery.
function feedingRemainingUnloadKg(feedingId, activeStepKg, activeDeliveryId){
  return deliveriesFor(feedingId).reduce(function(s,d){
    if(d.actualKg !== null && d.actualKg !== undefined) return s;
    var done = (d.id === activeDeliveryId) ? (activeStepKg || 0) : 0;
    return s + Math.max(0, (d.targetKg||0) - done);
  }, 0);
}

// ── Empty detection ──────────────────────────────────────────────
// "Empty" cannot mean exactly zero: a mixer never returns to its tare after a
// load, and the scale itself is only good to a few kilos. Anything inside the
// scale's own resolution is as empty as it can be known to be.
function isMixerEmpty(kg){
  if(kg === null || kg === undefined) return false;
  return Math.abs(kg) <= scaleResolutionKg();
}

// What is left in the mixer that a new load would sit on top of.
function mixerResidualKg(kg){
  if(kg === null || kg === undefined || kg <= 0) return 0;
  return isMixerEmpty(kg) ? 0 : kg;
}

// The residual is either leftover feed or a drifted zero, and the two need
// opposite handling — carrying feed forward vs re-zeroing. Size is the only
// signal available, so it picks the default and the operator confirms.
function residualLikelyDrift(kg){
  return Math.abs(kg) < scaleResolutionKg() * 2;
}

// ══════════════════════════════════════════════════════════════════
//  HEAD COUNT CONFIRMATION
//  The mix is head count × kg/head, so a stale count means the wrong
//  amount of feed gets made — and unlike a wrong record, that cannot be
//  corrected after the fact.
// ══════════════════════════════════════════════════════════════════

function headCountConfirmedToday(lot){
  if(!lot || !lot.headCountConfirmedAt) return false;
  return new Date(lot.headCountConfirmedAt).toDateString() === new Date().toDateString();
}

// Pens in this group whose count has not been confirmed today.
function lotsNeedingHeadCount(groupId){
  // ONLY pens with no usable number. The mix size is derived from head count,
  // so a pen with none has nothing to weigh against and genuinely blocks.
  //
  // The DAILY re-check used to live here too, asking about every pen every
  // morning regardless of settings. That is a different thing, it is opt-in per
  // pen (lot.confirmHeadCount), and it belongs at the bunk where the cattle can
  // actually be seen — not at the mixer before loading.
  return lotsInGroup(groupId).filter(function(l){ return !(l.headCount > 0); });
}

function confirmHeadCount(lotId, headCount){
  var lot = lotById(lotId);
  if(!lot) return null;
  if(headCount != null && headCount > 0) lot.headCount = Math.round(headCount);
  lot.headCountConfirmedAt = new Date().toISOString();
  return _upsert(getLots(), saveLots, 'vf_lots', lot);
}
