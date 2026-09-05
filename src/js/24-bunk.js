// ══════════════════════════════════════════════════════════════════
//  BUNK READING SCREEN
//  Walked before the morning feed: one card per pen, five big targets.
//  The operator scores what is left in the bunk; the app shows what that
//  does to today's delivery and asks them to confirm it.
// ══════════════════════════════════════════════════════════════════

var _bunkLotId = null;

function openBunkPanel(){
  openMorePanel('sp-bunk');
  renderBunk();
}

function renderBunk(){
  var host = document.getElementById('bunk-body');
  if(!host) return;

  var lots = cycleLots().sort(function(a,b){ return (a.routeOrder||0)-(b.routeOrder||0); });
  if(!lots.length){ host.innerHTML = '<div class="fdp-empty">' + esc(T('No lots yet')) + '</div>'; return; }

  host.innerHTML = lots.map(function(l){
    var last   = latestBunkScore(l.id);
    var factor = lotFeedFactor(l);
    var done   = last && new Date(last.at).toDateString() === new Date().toDateString();
    var off    = Math.round((factor - 1) * 100);

    return '<div class="bunk-card' + (done ? ' done' : '') + '" onclick="openBunkSheet(\'' + l.id + '\')">' +
      '<div class="bunk-card-top">' +
        '<div class="bunk-lot">' + (done ? '✓ ' : '') + esc(l.name) + '</div>' +
        // The factor is the whole point of the screen — how far this pen has
        // drifted from what the nutritionist wrote.
        '<div class="bunk-factor' + (off > 0 ? ' up' : off < 0 ? ' down' : '') + '">' +
          (off > 0 ? '+' : '') + off + '%' +
        '</div>' +
      '</div>' +
      '<div class="bunk-sub">' + (l.headCount||0) + ' ' + esc(T('head')) +
        (last ? ' · ' + esc(T('last')) + ' ' + _bunkAgo(last.at) + ' · ' + esc(T('score')) + ' ' + last.score : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function _bunkAgo(at){
  var h = (Date.now() - new Date(at).getTime()) / 3600000;
  if(h < 1)  return T('just now');
  if(h < 24) return Math.round(h) + ' h';
  return Math.round(h/24) + ' ' + T('days');
}

// ── Scoring one pen ──────────────────────────────────────────────
function openBunkSheet(lotId){
  _bunkLotId = lotId;
  var lot = lotById(lotId);
  if(!lot) return;

  document.getElementById('bunk-sheet-lot').textContent = lot.name;
  document.getElementById('bunk-sheet-sub').textContent =
    (lot.headCount||0) + ' ' + T('head') + ' · ' + T('now feeding') + ' ' +
    (Math.round((lotFeedFactor(lot)-1)*100) >= 0 ? '+' : '') + Math.round((lotFeedFactor(lot)-1)*100) + '%';

  document.getElementById('bunk-options').innerHTML = BUNK_SCALE.map(function(b){
    return '<div class="bunk-opt" onclick="_pickBunkScore(' + b.score + ',this)">' +
      '<div class="bunk-opt-score">' + b.score + '</div>' +
      '<div class="bunk-opt-txt">' + esc(T(b.key)) + '</div>' +
      '<div class="bunk-opt-pct">' + (b.pct > 0 ? '+' : '') + b.pct + '%</div>' +
    '</div>';
  }).join('');

  document.getElementById('bunk-result').innerHTML = '';
  document.getElementById('bunk-confirm').disabled = true;
  document.getElementById('bunk-sheet-overlay').classList.add('open');
}

function closeBunkSheet(){
  document.getElementById('bunk-sheet-overlay').classList.remove('open');
  _bunkLotId = null;
}

var _bunkPicked = null;

function _pickBunkScore(score, el){
  _bunkPicked = score;
  document.querySelectorAll('.bunk-opt').forEach(function(o){ o.classList.remove('on'); });
  el.classList.add('on');

  var sug = bunkSuggestion(_bunkLotId, score);
  var box = document.getElementById('bunk-result');
  if(!sug){ box.innerHTML = ''; return; }

  var pct = Math.round(sug.pct * 10) / 10;
  box.innerHTML =
    '<div class="bunk-res-pct' + (pct > 0 ? ' up' : pct < 0 ? ' down' : '') + '">' +
      (pct > 0 ? '+' : '') + pct + '%' +
    '</div>' +
    '<div class="bunk-res-txt">' +
      (pct === 0 ? esc(T('No change to today\'s feed'))
                 : esc(T('Today this lot gets')) + ' ' + (pct > 0 ? '+' : '') + pct + '%') +
    '</div>' +
    // When a rail bit, say so. A silent "no change" looks like the app ignored
    // the reading, and the operator stops trusting it.
    (sug.reason ? '<div class="bunk-res-note">' + esc(sug.reason) + '</div>' : '');

  document.getElementById('bunk-confirm').disabled = false;
}

function confirmBunkScore(){
  if(_bunkLotId == null || _bunkPicked == null) return;
  var lot = lotById(_bunkLotId);
  var row = recordBunkScore(_bunkLotId, _bunkPicked);
  closeBunkSheet();
  renderBunk();
  showToast((lot ? lot.name + ' · ' : '') + T('score') + ' ' + row.score +
            (row.appliedPct ? ' · ' + (row.appliedPct > 0 ? '+' : '') + Math.round(row.appliedPct) + '%' : ''),
            'success');
}
