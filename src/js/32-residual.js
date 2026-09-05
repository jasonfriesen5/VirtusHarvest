// ══════════════════════════════════════════════════════════════════
//  RESIDUAL IN THE MIXER
//  The mixer is supposed to be empty before a new load. When it is not,
//  there are two possible causes and they need OPPOSITE handling:
//
//    · real feed left over  → carry it into this load, reduce the targets.
//      Taring it away would feed those kilos unrecorded and put stock out.
//    · a drifted zero (mud, debris, a knocked load cell) → re-zero.
//      Treating it as feed would short the load by that amount.
//
//  Nothing in the reading distinguishes them, so the operator decides.
//  Size picks the default, and the choice is recorded — a mixer that
//  "drifts" 200 kg every morning is a fault, not a preference.
// ══════════════════════════════════════════════════════════════════

var _residualPending = null;   // { groupId, kg }

// Returns true when it has taken over and the caller should stop.
function checkResidualBeforeLoad(groupId){
  var kg = mixerResidualKg(rawWeight);
  if(!kg) return false;

  _residualPending = { groupId: groupId, kg: kg };
  var drift = residualLikelyDrift(kg);

  document.getElementById('res-kg').textContent = Math.round(kg) + ' kg';
  document.getElementById('res-sub').textContent = drift
    ? T('Small enough to be a drifted zero rather than feed')
    : T('Enough that it is probably feed from the last load');

  // Lead with whichever is more likely, but keep both one tap away.
  document.getElementById('res-carry').classList.toggle('res-primary', !drift);
  document.getElementById('res-zero').classList.toggle('res-primary', drift);

  document.getElementById('res-overlay').classList.add('open');
  return true;
}

function closeResidual(){
  document.getElementById('res-overlay').classList.remove('open');
  _residualPending = null;
}

// It is feed: log it the same way a refusal is logged, so it reduces this
// group's next load and cannot be counted against stock a second time.
function residualIsFeed(){
  var p = _residualPending;
  if(!p) return;
  closeResidual();

  var rows = getReturns();
  _upsert(rows, saveReturns, 'vf_feed_returns', {
    id: uid(),
    batchId: uid(),
    cycleId: activeCycleId,
    lotId: null, lotName: null,          // it came off no particular pen
    groupId: p.groupId,
    feedingId: null,
    kg: p.kg,
    headCount: 0,
    operatorName: (currentWorker && currentWorker.name) || '',
    consumed: false,
    note: 'residual',                    // distinguishes it from a bunk scrape
    at: new Date().toISOString()
  });

  showToast(Math.round(p.kg) + ' kg ' + T('carried into this load'), 'warn');
  _startLoadAfterResidual(p.groupId);
}

// It is not feed: re-zero the display and load a full ration on top.
function residualIsDrift(){
  var p = _residualPending;
  if(!p) return;
  closeResidual();
  if(typeof zeroScale === 'function') { try{ zeroScale(); }catch(e){} }
  showToast(T('Scale re-zeroed'), 'success');
  _startLoadAfterResidual(p.groupId);
}

function _startLoadAfterResidual(groupId){
  if(groupId && typeof pickGroup === 'function') pickGroup(groupId);
  if(typeof beginLoadForPickedGroup === 'function') beginLoadForPickedGroup();
}
