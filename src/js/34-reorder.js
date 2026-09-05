// ══════════════════════════════════════════════════════════════════
//  DRAG TO REORDER
//  One implementation for every ordered list in the app. A list registers
//  how to read its order, how to save a new one, and how to redraw itself;
//  everything else — the mode toggle, the handle, the drag maths — is here.
//
//  Reordering is deliberately behind a mode rather than always-on: these rows
//  carry amount fields and remove buttons, and a stray drag while reaching for
//  a number is exactly the kind of silent change nobody notices until the
//  mixer loads in the wrong order.
// ══════════════════════════════════════════════════════════════════

var _reorderLists = {};   // key -> { getIds, setIds, render }
var _reorderOn    = null; // key of the list currently in reorder mode
var _rrDragId     = null;

function reorderRegister(key, cfg){ _reorderLists[key] = cfg; }

function reorderActive(key){ return _reorderOn === key; }

function reorderToggle(key){
  _reorderOn = (_reorderOn === key) ? null : key;
  var cfg = _reorderLists[key];
  if(cfg && cfg.render) cfg.render();
}

// Leaving a list (closing its sheet) must not strand the mode on it.
function reorderReset(key){
  if(!key || _reorderOn === key) _reorderOn = null;
}

// The button that turns the mode on and off.
function reorderButtonHtml(key, label){
  var on = reorderActive(key);
  return '<button class="rr-btn' + (on ? ' on' : '') + '" onclick="reorderToggle(\'' + key + '\')">' +
    (on ? esc(T('Done reordering')) : '<span class="rr-bars">&#9776;</span> ' + esc(label || T('Reorder'))) +
  '</button>';
}

// The grab handle. touch-action:none is what stops the drag scrolling the
// sheet out from under the finger on a tablet.
function reorderHandleHtml(id){
  return '<div class="rr-handle" data-rr-handle="' + esc(id) + '" ' +
         'onpointerdown="reorderDragStart(event,\'' + id + '\')">&#9776;</div>';
}

function reorderDragStart(ev, id){
  var cfg = _reorderLists[_reorderOn];
  if(!cfg) return;
  ev.preventDefault();
  _rrDragId = id;
  var row = ev.target.closest('[data-rid]');
  if(row) row.classList.add('rr-dragging');
  window.addEventListener('pointermove', _rrDragMove);
  window.addEventListener('pointerup', _rrDragEnd, { once:true });
  window.addEventListener('pointercancel', _rrDragEnd, { once:true });
}

function _rrDragMove(ev){
  if(!_rrDragId) return;
  var cfg = _reorderLists[_reorderOn];
  if(!cfg) return;

  var el   = document.elementFromPoint(ev.clientX, ev.clientY);
  var over = el && el.closest ? el.closest('[data-rid]') : null;
  if(!over) return;
  var overId = over.getAttribute('data-rid');
  if(!overId || overId === _rrDragId) return;

  var ids  = cfg.getIds();
  var from = ids.indexOf(_rrDragId);
  var to   = ids.indexOf(overId);
  if(from === -1 || to === -1) return;

  ids.splice(to, 0, ids.splice(from, 1)[0]);
  // Persist as it moves rather than on drop: a drag interrupted by a call or a
  // dropped finger should leave the order it looked like, not snap back.
  cfg.setIds(ids);
  cfg.render();

  var moved = document.querySelector('[data-rid="' + _rrDragId + '"]');
  if(moved) moved.classList.add('rr-dragging');
}

function _rrDragEnd(){
  window.removeEventListener('pointermove', _rrDragMove);
  _rrDragId = null;
  document.querySelectorAll('.rr-dragging').forEach(function(r){ r.classList.remove('rr-dragging'); });
}
