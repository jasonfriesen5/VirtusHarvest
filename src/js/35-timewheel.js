// ══════════════════════════════════════════════════════════════════
//  TIME WHEEL
//  The browser's native <input type="time"> hands Android its own full-screen
//  clock dial — a different visual language from the rest of the app, and a
//  slow one: tap the hour ring, tap the minute ring, confirm. A feeding window
//  is set in five-minute steps, so two spinning drums get there in one gesture.
//
//  Deliberately separate from 10-wheel.js: that one carries farm/field state
//  from Harvest and a Confirm/Add/Custom footer. This is two fixed numeric
//  columns and nothing else.
// ══════════════════════════════════════════════════════════════════

var TW_MIN_STEP = 5;                       // feeding windows are not to the minute
var _twOnPick   = null;
var _twH = 6, _twM = 0;
// One timer PER COLUMN. Sharing a single one meant a flick of the minute drum
// cleared the hour drum's pending commit, so the hour read 14 on screen while
// the value stayed at 07.
var _twSettle   = {};
// The programmatic snap fires scroll events of its own. Committing from those
// would be harmless today but would overwrite a value the operator never chose
// if the snap ever lands off-centre.
var _twOpening  = false;

function openTimeWheel(title, value, onPick){
  _twOnPick = onPick || null;

  // An empty field opens somewhere plausible rather than at midnight: nobody
  // sets a delivery window for 00:00, so starting there costs a long spin.
  var parts = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  _twH = parts ? Math.min(23, parseInt(parts[1], 10)) : 6;
  _twM = parts ? Math.round(parseInt(parts[2], 10) / TW_MIN_STEP) * TW_MIN_STEP : 0;
  if(_twM >= 60){ _twM = 0; _twH = (_twH + 1) % 24; }

  document.getElementById('tw-title').textContent = title || T('Time');
  _twBuild('tw-col-h', 24, 1, _twH);
  _twBuild('tw-col-m', 60, TW_MIN_STEP, _twM);
  _twPaintValue();

  // Centre the drums BEFORE the sheet is shown. The overlay is always in the
  // layout — it hides by translating the sheet off-screen, not by display:none —
  // so the columns already have their full height here and scrollTop lands
  // exactly. Doing it after .open (or inside rAF) meant the first painted frame
  // showed 00 at the top and then jumped to the real value: the flicker.
  _twOpening = true;
  _twSnap('tw-col-h');
  _twSnap('tw-col-m');

  document.getElementById('tw-overlay').classList.add('open');

  // Belt and braces for the case where the sheet really was display:none (a
  // theme change, a hidden parent): if the first snap could not measure, retry
  // once a frame has painted. Harmless when the sync snap already worked.
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ _twSnap('tw-col-h'); _twSnap('tw-col-m'); _twOpening = false; });
  });
}

function closeTimeWheel(){
  document.getElementById('tw-overlay').classList.remove('open');
  _twOnPick = null;
}

function _twBuild(colId, count, step, selected){
  var col = document.getElementById(colId);
  var html = '<div class="tw-pad"></div>';
  for(var v = 0; v < count; v += step){
    html += '<div class="tw-item' + (v === selected ? ' active' : '') + '" data-v="' + v + '">' +
            (v < 10 ? '0' + v : v) + '</div>';
  }
  col.innerHTML = html + '<div class="tw-pad"></div>';

  col.onscroll = function(){
    // Read the value continuously so the highlight tracks the finger, but only
    // commit once the momentum stops — a mid-flick value is not a choice.
    _twMark(col);
    if(_twOpening) return;
    clearTimeout(_twSettle[colId]);
    _twSettle[colId] = setTimeout(function(){ _twCommit(col, colId); }, 90);
  };
  // Tapping a row is faster than spinning to it when the target is in view.
  col.querySelectorAll('.tw-item').forEach(function(el){
    el.onclick = function(){
      col.scrollTo({ top: el.offsetTop - (col.clientHeight - el.offsetHeight) / 2, behavior: 'smooth' });
    };
  });
}

// Which row sits on the centre line.
function _twCentred(col){
  var mid  = col.scrollTop + col.clientHeight / 2;
  var best = null, bestD = 1e9;
  col.querySelectorAll('.tw-item').forEach(function(el){
    var d = Math.abs(el.offsetTop + el.offsetHeight / 2 - mid);
    if(d < bestD){ bestD = d; best = el; }
  });
  return best;
}

function _twMark(col){
  var c = _twCentred(col);
  col.querySelectorAll('.tw-item').forEach(function(el){ el.classList.toggle('active', el === c); });
}

function _twCommit(col, colId){
  var c = _twCentred(col);
  if(!c) return;
  var v = parseInt(c.getAttribute('data-v'), 10);
  if(colId === 'tw-col-h') _twH = v; else _twM = v;
  _twPaintValue();
}

function _twSnap(colId){
  var col = document.getElementById(colId);
  if(!col || !col.clientHeight) return;
  var a = col.querySelector('.tw-item.active');
  if(a) col.scrollTop = a.offsetTop - (col.clientHeight - a.offsetHeight) / 2;
}

function _twPaintValue(){
  var el = document.getElementById('tw-value');
  if(el) el.textContent = _twText();
}

function _twText(){
  return (_twH < 10 ? '0' : '') + _twH + ':' + (_twM < 10 ? '0' : '') + _twM;
}

function _twConfirm(){
  var cb = _twOnPick, v = _twText();
  closeTimeWheel();
  if(cb) cb(v);
}
