var _toastTimer = null;

// Harvest suppressed everything but warnings. Feed needs the success case too:
// confirming a load step is the operator's only feedback that the kilos landed.
function showToast(msg, type){
  var el = document.getElementById('toast');
  if(!el) return;
  el.textContent = (typeof T === 'function') ? T(msg) : String(msg);
  el.className = 'toast show ' + (type || '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ el.classList.remove('show'); }, type === 'error' ? 3200 : 1800);
}
