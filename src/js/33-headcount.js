// ══════════════════════════════════════════════════════════════════
//  DAILY HEAD-COUNT CHECK
//  One sheet, all the group's pens, before the first load of the day.
//  Deliberately NOT per-load: the operator is at the mixer and cannot
//  see the cattle, so a per-load prompt would be tapped through and
//  record a confirmation that never happened.
// ══════════════════════════════════════════════════════════════════

var _hcGroupId = null;

// Returns true when it has taken over and the caller should stop.
function checkHeadCountBeforeLoad(groupId){
  var pending = lotsNeedingHeadCount(groupId);
  if(!pending.length) return false;

  _hcGroupId = groupId;
  var g = groupById(groupId);
  document.getElementById('hc-title').textContent = (g && g.name) || T('Feed group');
  _renderHeadCount();
  document.getElementById('hc-overlay').classList.add('open');
  return true;
}

function _renderHeadCount(){
  var lots = lotsInGroup(_hcGroupId);
  var host = document.getElementById('hc-body');

  host.innerHTML = lots.map(function(l){
    var seen = headCountConfirmedToday(l);
    // Last confirmed date matters: a count from three weeks ago deserves more
    // suspicion than one from yesterday, and the operator should see which.
    var ago = l.headCountConfirmedAt
      ? _hcAgo(l.headCountConfirmedAt)
      : T('never confirmed');

    return '<div class="hc-row' + (seen ? ' seen' : '') + '">' +
      '<div class="hc-info">' +
        '<div class="hc-name">' + esc(l.name) + '</div>' +
        '<div class="fi-sub">' + esc(seen ? T('confirmed today') : ago) + '</div>' +
      '</div>' +
      '<button class="hc-step" onclick="_hcAdjust(\'' + l.id + '\',-1)">−</button>' +
      '<input class="hc-in" type="number" inputmode="numeric" id="hc-' + l.id + '" ' +
        'value="' + (l.headCount||0) + '" oninput="_hcTotal()">' +
      '<button class="hc-step" onclick="_hcAdjust(\'' + l.id + '\',1)">+</button>' +
    '</div>';
  }).join('');
  _hcTotal();
}

function _hcAgo(iso){
  var d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if(d <= 0) return T('confirmed today');
  if(d === 1) return T('confirmed yesterday');
  return T('confirmed') + ' ' + d + ' ' + T('days ago');
}

function _hcAdjust(lotId, delta){
  var el = document.getElementById('hc-' + lotId);
  if(!el) return;
  el.value = Math.max(0, (parseInt(el.value, 10) || 0) + delta);
  _hcTotal();
}

function _hcTotal(){
  var lots = lotsInGroup(_hcGroupId);
  var head = lots.reduce(function(s,l){
    var el = document.getElementById('hc-' + l.id);
    return s + (parseInt(el && el.value, 10) || 0);
  }, 0);

  var g = groupById(_hcGroupId);
  var kg = g ? rationKgPerHead(g.rationId) : 0;
  var share = g ? mealShare(g, nextMealIndex(_hcGroupId)) : 1;

  var el = document.getElementById('hc-total');
  // Show the consequence, not just the count — this is the number the head
  // count is actually deciding.
  if(el) el.innerHTML = head + ' ' + esc(T('head')) +
    ' · <b>' + Math.round(kg * head * share) + ' kg</b> ' + esc(T('this load'));
}

function confirmHeadCounts(){
  var lots = lotsInGroup(_hcGroupId);
  var bad = lots.filter(function(l){
    var v = parseInt((document.getElementById('hc-' + l.id) || {}).value, 10);
    return !(v > 0);
  });
  if(bad.length){ showToast(T('Every lot needs a head count'), 'warn'); return; }

  lots.forEach(function(l){
    confirmHeadCount(l.id, parseInt(document.getElementById('hc-' + l.id).value, 10));
  });

  var gid = _hcGroupId;
  closeHeadCount();
  // Fall back into the same chain rather than jumping straight to loading —
  // the mixer may still have feed in it, and that check has not run yet.
  if(typeof checkResidualBeforeLoad === 'function' && checkResidualBeforeLoad(gid)) return;
  if(typeof beginLoadForPickedGroup === 'function') beginLoadForPickedGroup();
}

function closeHeadCount(){
  document.getElementById('hc-overlay').classList.remove('open');
  _hcGroupId = null;
}
