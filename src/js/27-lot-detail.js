// ══════════════════════════════════════════════════════════════════
//  PEN DETAIL
//  Everything about one pen on one screen: identity, head count, the
//  feed adjustment, what that works out to per head, and what the pen
//  has actually been eating. Modelled on Libra's pen editor, which
//  gets the ordering right — you change the number at the top and
//  watch the consequence update underneath it.
// ══════════════════════════════════════════════════════════════════

var _lotDetailId = null;
var _lotPendingPct = 0;

function openLotDetail(id){
  var lot = lotById(id);
  if(!lot) return;
  _lotDetailId = id;
  _lotPendingPct = Math.round((lotFeedFactor(lot) - 1) * 100);
  _renderLotDetail();
  document.getElementById('lot-detail-overlay').classList.add('open');
}

function closeLotDetail(){
  document.getElementById('lot-detail-overlay').classList.remove('open');
  _lotDetailId = null;
  renderLots();
}

function _renderLotDetail(){
  var lot = lotById(_lotDetailId);
  if(!lot) return;

  document.getElementById('lot-detail-title').textContent = lot.name;
  document.getElementById('lot-detail-sub').textContent =
    (lot.headCount||0) + ' ' + T('head') + (lot.category ? ' · ' + lot.category : '');

  document.getElementById('ld-name').value   = lot.name || '';
  document.getElementById('ld-head').value   = lot.headCount || 0;
  document.getElementById('ld-weight').value = lot.avgWeightKg || '';
  var cbH = document.getElementById('ld-confirm-head');
  if(cbH) cbH.checked = !!lot.confirmHeadCount;

  // Which groups this pen is in — membership is edited on the group, since the
  // group is the thing the operator loads for.
  var mine = groupsForLot(_lotDetailId);
  document.getElementById('ld-groups-in').innerHTML = mine.length
    ? mine.map(function(g){ return '<span class="grp-pen">' + esc(g.name) + '</span>'; }).join('')
    : '<span class="grp-none">' + esc(T('Not in any group')) + '</span>';

  _paintLotAdjust();
  _paintLotAverages();
}

// ── Feed adjustment ──────────────────────────────────────────────
function _paintLotAdjust(){
  var lot = lotById(_lotDetailId);
  if(!lot) return;

  var pct = _lotPendingPct;
  document.getElementById('ld-pct').textContent = (pct > 0 ? '+' : '') + pct + '%';
  document.getElementById('ld-slider').value = pct;

  var el = document.getElementById('ld-pct');
  el.className = 'ld-pct' + (pct > 0 ? ' up' : pct < 0 ? ' down' : '');

  // The consequence, right under the control that causes it. Totals are summed
  // ACROSS the pen's groups — a pen on a forage load and a concentrate load
  // eats both, so any single ration would understate what it gets.
  var groups = groupsForLot(_lotDetailId);
  var base = groups.reduce(function(t,g){ return t + rationKgPerHead(g.rationId); }, 0);
  var adj  = base * (1 + pct/100);
  document.getElementById('ld-base').textContent = base.toFixed(1) + ' kg';
  document.getElementById('ld-adjusted').textContent = adj.toFixed(1) + ' kg';

  var head = parseInt(document.getElementById('ld-head').value, 10) || lot.headCount || 0;
  document.getElementById('ld-penTotal').textContent = Math.round(adj * head) + ' kg';

  // Per-group breakdown — Libra's "Adjusted Rate in Feedgroups". Only worth
  // showing when the pen is actually in more than one, otherwise it just
  // repeats the line above.
  var bd = document.getElementById('ld-groups');
  var lbl = document.getElementById('ld-groups-lbl');
  if(bd && lbl){
    var show = groups.length > 1;
    lbl.style.display = bd.style.display = show ? '' : 'none';
    if(show){
      bd.innerHTML = groups.map(function(g){
        var k = rationKgPerHead(g.rationId) * (1 + pct/100);
        return '<div class="ld-row"><span>' + esc(g.name) + '</span><b>' + k.toFixed(1) + ' kg</b></div>';
      }).join('');
    }
  }

  // A big move on a high-grain ration is the one that hurts, so say so before
  // it is saved rather than after.
  var warn = document.getElementById('ld-warn');
  var jump = pct - Math.round((lotFeedFactor(lot) - 1) * 100);
  warn.textContent = (jump >= 5) ? T('Large increase — step up over several days instead') : '';
  warn.style.display = warn.textContent ? '' : 'none';
}

function ldStep(delta){
  _lotPendingPct = Math.max(-20, Math.min(20, _lotPendingPct + delta));
  _paintLotAdjust();
}
function ldSlide(v){
  _lotPendingPct = parseInt(v, 10) || 0;
  _paintLotAdjust();
}

// ── Recent fed averages ──────────────────────────────────────────
function _paintLotAverages(){
  var rows = lotFedAverages(_lotDetailId, 7);
  var host = document.getElementById('ld-averages');
  var any  = rows.some(function(r){ return r.kgPerHead > 0; });

  if(!any){ host.innerHTML = '<div class="fdp-empty">' + esc(T('Nothing fed yet')) + '</div>'; return; }

  host.innerHTML = rows.map(function(r){
    return '<div class="ld-avg-row">' +
      '<span class="ld-avg-d">' + r.days + ' ' + esc(r.days === 1 ? T('day') : T('days')) + '</span>' +
      '<span class="ld-avg-v">' + (r.kgPerHead ? r.kgPerHead.toFixed(1) : '0') + ' kg/' + esc(T('head-word')) + '</span>' +
    '</div>';
  }).join('');
}

// ── Save ─────────────────────────────────────────────────────────
// Split out from saveLotDetail so opening the record editor can persist what is
// on screen first. Returns the saved name, or null when validation stopped it.
function _ldPersist(){
  var lot = lotById(_lotDetailId);
  if(!lot) return null;

  var name = (document.getElementById('ld-name').value || '').trim();
  if(!name){ showToast(T('Name required'), 'warn'); return null; }

  var head = parseInt(document.getElementById('ld-head').value, 10);
  if(!(head > 0)){ showToast(T('Enter how many head are in this lot'), 'warn'); return null; }

  lot.name        = name;
  lot.headCount   = head;
  lot.avgWeightKg = parseFloat(document.getElementById('ld-weight').value) || null;
  var cbS = document.getElementById('ld-confirm-head');
  if(cbS) lot.confirmHeadCount = !!cbS.checked;
  saveLot(lot);

  // Adjustment goes through the model so it lands in the same ledger the bunk
  // readings write to, and gets the same clamp.
  var res = setLotFeedAdjustment(_lotDetailId, _lotPendingPct);
  if(res && res.clamped) showToast(T('Adjustment limited to the safe range'), 'warn');
  return name;
}

function saveLotDetail(){
  var name = _ldPersist();
  if(!name) return;
  closeLotDetail();
  showToast(name + ' · ' + T('Saved'), 'success');
}

// The rest of the pen's record — pen code, category, entry weight, ration.
// Persists what is on screen first so switching views never eats an edit.
function editLotRecord(){
  var id = _lotDetailId;
  if(!id) return;
  if(!_ldPersist()) return;
  closeLotDetail();
  openLotSheet(id);
}
