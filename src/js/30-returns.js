// ══════════════════════════════════════════════════════════════════
//  FEED RETURN
//  Scrape the bunk, weigh what came back, tell the app which pen it
//  came from. The kilos come off that pen's intake, go back on the
//  stock ledger, and come off the next load for its group.
// ══════════════════════════════════════════════════════════════════

var _retLotId = null;
var _retAnchor = 0;

function openReturnPicker(){
  var lots = cycleLots().sort(function(a,b){ return (a.routeOrder||0)-(b.routeOrder||0); });
  if(!lots.length){ showToast(T('No lots yet'), 'warn'); return; }

  document.getElementById('ret-body').innerHTML = lots.map(function(l){
    var last = lastDeliveryForLot(l.id);
    return '<div class="farm-sel-row" onclick="startReturn(\'' + l.id + '\')">' +
      '<div style="flex:1;min-width:0;">' +
        '<div class="farm-sel-name">' + esc(l.name) + '</div>' +
        '<div class="fi-sub">' + (l.headCount||0) + ' ' + esc(T('head')) +
          (last ? ' · ' + esc(T('last')) + ' ' + Math.round(last.actualKg) + ' kg' : '') + '</div>' +
      '</div>' +
      '<div class="fsc-arrow">›</div>' +
    '</div>';
  }).join('');
  document.getElementById('ret-pick-overlay').classList.add('open');
}

function closeReturnPicker(){ document.getElementById('ret-pick-overlay').classList.remove('open'); }

// Weighing a return is the same gesture as loading: anchor, tip it in, read the
// delta. Reusing that keeps it familiar and works with a dirty mixer.
function startReturn(lotId){
  closeReturnPicker();
  _retLotId  = lotId;
  _retAnchor = (rawWeight === null || rawWeight === undefined) ? 0 : rawWeight;

  var lot = lotById(lotId);
  document.getElementById('ret-lot').textContent = lot ? lot.name : '—';

  var src = bunkDeliveriesForLot(lotId);
  var srcEl = document.getElementById('ret-sources');
  if(srcEl){
    srcEl.innerHTML = src.length > 1
      ? esc(T('Split across')) + ' ' + src.map(function(d){
          var f = getFeedings().find(function(x){ return x.id === d.feedingId; });
          return '<b>' + esc((f && f.groupName) || T('Feeding')) + '</b> ' + Math.round(d.actualKg) + ' kg';
        }).join(' · ')
      : '';
  }
  _paintReturn();
  document.getElementById('ret-weigh-overlay').classList.add('open');
}

function closeReturnWeigh(){
  document.getElementById('ret-weigh-overlay').classList.remove('open');
  _retLotId = null;
}

function _returnKg(){
  if(rawWeight === null || rawWeight === undefined) return 0;
  return Math.max(0, rawWeight - _retAnchor);
}

function _paintReturn(){
  if(_retLotId == null) return;
  var kg  = _returnKg();
  var lot = lotById(_retLotId);
  var head = (lot && lot.headCount) || 0;

  var big = document.getElementById('ret-kg');
  if(big) big.textContent = Math.round(kg);

  var per = document.getElementById('ret-perhead');
  if(per) per.textContent = head ? (kg/head).toFixed(2) + ' kg/' + T('head-word') : '';

  // Share of everything that has gone into the bunk since it was last scraped —
  // not just the last load, since a pen in two groups has both mixes in there.
  var fed = bunkFedKg(_retLotId);
  var pctEl = document.getElementById('ret-pct');
  if(pctEl){
    if(fed > 0){
      var pct = (kg / fed) * 100;
      pctEl.textContent = pct.toFixed(1) + '% ' + T('of what was fed');
      pctEl.className = 'ret-pct' + (pct > 10 ? ' bad' : '');
    } else pctEl.textContent = '';
  }
}

function confirmReturn(){
  if(_retLotId == null) return;
  var kg = _returnKg();
  if(!(kg > 0)){ showToast(T('Nothing weighed yet'), 'warn'); return; }

  var lot = lotById(_retLotId);
  // Pass the pen's group explicitly: recordFeedReturn can only infer one from a
  // contributing feeding, and a bunk with no recent delivery behind it has none.
  var gs = (typeof groupsForLot === 'function') ? groupsForLot(_retLotId) : [];
  var row = recordFeedReturn(_retLotId, kg, gs.length === 1 ? { groupId: gs[0].id } : {});
  closeReturnWeigh();
  if(typeof renderTransactions === 'function') renderTransactions();
  if(typeof _paintHomeStatus === 'function') _paintHomeStatus();
  showToast((lot ? lot.name + ' · ' : '') + '−' + Math.round(kg) + ' kg ' + T('returned'),
            row ? 'success' : 'warn');
}
