var _wheelSuppressDiscard = false; // set true when Add New pressed to preserve pending entry

function _wheelOpen(opts){
  // opts: { title, items, selected, onConfirm, onAdd, mode:'single'|'dual' }
  _wheelMode      = opts.mode || 'single';
  _wheelOnConfirm = opts.onConfirm || null;
  _wheelOnAdd     = opts.onAdd || null;
  _wheelOnCustom  = opts.onCustom || null;
  _wheelSelected  = opts.selected || null;

  var titleEl   = document.getElementById('wheel-title');
  var addBtn    = document.getElementById('wheel-add-btn');
  if(titleEl) titleEl.textContent = opts.title || 'Select';
  if(addBtn)  { addBtn.style.display = opts.onAdd ? '' : 'none'; }
  var customBtn = document.getElementById('wheel-custom-btn');
  if(customBtn){ customBtn.style.display = opts.onCustom ? '' : 'none'; }

  document.getElementById('wheel-body-single').style.display = _wheelMode==='dual' ? 'none' : 'flex';
  document.getElementById('wheel-body-dual').style.display   = _wheelMode==='dual' ? 'flex' : 'none';

  if(_wheelMode === 'single'){
    _wheelItems = opts.items || [];
    _wheelBuildSingle(_wheelItems, _wheelSelected);
  } else {
    _wheelFarms     = opts.farms  || [];
    _wheelFields    = opts.fields || [];
    _wheelSelFarm   = opts.selFarm  || (_wheelFarms[0]||null);
    _wheelSelField  = opts.selField || null;
    _wheelBuildDual();
  }

  // Guard the initial selection: scroll-snap + the open animation can fire
  // scroll events before layout settles, which would otherwise clear the
  // pre-highlighted (first/selected) item until the user scrolls.
  _wheelOpening = true;
  document.getElementById('wheel-overlay').classList.add('open');

  // Centre the active rows only AFTER the panel is open and laid out.
  //
  // The build functions do their own scrollTo on a 50ms timer, but that fires
  // while the overlay is still animating in — and _wheelScrollTo centres using
  // col.offsetHeight, which is 0 or wrong until layout settles. The active item
  // ended up off-screen, so a wheel opened on an already-selected field looked
  // like nothing was selected. Re-snap once a frame has painted, and again near
  // the end of the animation, both inside the _wheelOpening guard so the
  // resulting scroll events can't clear the highlight.
  _wheelSnapToActive();
  setTimeout(function(){ _wheelOpening = false; }, 620);
}

// Centre whichever row is marked active in each visible column.
function _wheelSnapToActive(){
  var snap = function(){
    var cols = _wheelMode === 'dual'
      ? ['wheel-col-farm','wheel-col-field']
      : ['wheel-col-main'];
    cols.forEach(function(id){
      var col = document.getElementById(id);
      if(!col || !col.offsetHeight) return;   // not laid out yet — a later pass gets it
      var a = col.querySelector('.wheel-item.active');
      if(a) _wheelScrollTo(col, a, true);
    });
  };
  requestAnimationFrame(function(){ requestAnimationFrame(snap); });
  setTimeout(snap, 180);
  setTimeout(snap, 420);
}

function _wheelClose(){
  document.getElementById('wheel-overlay').classList.remove('open');
}

function _wheelConfirm(){
  _wheelClose();
  if(_wheelMode === 'single' && _wheelOnConfirm){
    _wheelOnConfirm(_wheelSelected);
  } else if(_wheelMode === 'dual' && _wheelOnConfirm){
    _wheelOnConfirm(_wheelSelFarm, _wheelSelField);
  }
}

function _wheelCustom(){
  _wheelSuppressDiscard = true;   // keep any pending entry alive across the hop
  _wheelClose();
  if(_wheelOnCustom) _wheelOnCustom();
  setTimeout(function(){ _wheelSuppressDiscard = false; }, 2000);
}

function _wheelAddNew(){
  _wheelSuppressDiscard = true; // preserve pending entry
  _wheelClose();
  if(_wheelOnAdd) _wheelOnAdd();
  setTimeout(function(){ _wheelSuppressDiscard = false; }, 2000);
}

function _wheelBuildSingle(items, selected){
  var col = document.getElementById('wheel-col-main');
  col.innerHTML = '';
  // Default to first item if nothing selected
  if(!selected && items.length) selected = items[0];
  _wheelSelected = selected; // ensure it's set immediately
  col.appendChild(_wheelPad());
  items.forEach(function(item, i){
    var el = document.createElement('div');
    el.className = 'wheel-item' + (item === selected ? ' active' : '');
    el.textContent = item;
    el.dataset.idx = i;
    el.addEventListener('click', function(){
      _wheelSelected = item;
      _wheelUpdateActive(col, el);
      _wheelScrollTo(col, el);
    });
    col.appendChild(el);
  });
  col.appendChild(_wheelPad());
  // Scroll to active item and attach scroll handler
  setTimeout(function(){
    var activeEl = col.querySelector('.wheel-item.active');
    if(!activeEl){
      // Fallback: activate first real item
      activeEl = col.querySelector('.wheel-item:not([style*="88px"])');
      if(activeEl){ activeEl.classList.add('active'); _wheelSelected = items[parseInt(activeEl.dataset.idx||0)]; }
    }
    if(activeEl) _wheelScrollTo(col, activeEl, true);
    _wheelAttachScroll(col, 'single');
  }, 50);
}

function _wheelBuildDual(){
  var farmCol  = document.getElementById('wheel-col-farm');
  var fieldCol = document.getElementById('wheel-col-field');
  // Normalize the selected farm to an actual element of _wheelFarms (match by
  // id — selectedFarm is often a different object instance), default to first.
  // Without this the identity check below never matched and the first farm
  // wasn't highlighted until you scrolled.
  var _sf = _wheelSelFarm;
  _wheelSelFarm = _wheelFarms.find(function(f){
    return _sf && (f===_sf || (f.id && _sf.id && f.id===_sf.id));
  }) || _wheelFarms[0] || null;
  farmCol.innerHTML = '';
  farmCol.appendChild(_wheelPad());
  _wheelFarms.forEach(function(farm, i){
    var el = document.createElement('div');
    el.className = 'wheel-item' + (farm === _wheelSelFarm ? ' active' : '');
    el.textContent = farm.name || farm;
    el.dataset.idx = i;
    el.addEventListener('click', function(){
      _wheelSelFarm = farm;
      _wheelUpdateActive(farmCol, el);
      _wheelScrollTo(farmCol, el);
      _wheelRefreshFields();
    });
    farmCol.appendChild(el);
  });
  farmCol.appendChild(_wheelPad());
  _wheelAttachScroll(farmCol, 'farm');
  _wheelRefreshFields();
  setTimeout(function(){
    var a = farmCol.querySelector('.wheel-item.active');
    if(a) _wheelScrollTo(farmCol, a, true);
  }, 50);
}

function _wheelRefreshFields(){
  var fieldCol = document.getElementById('wheel-col-field');
  fieldCol.innerHTML = '';
  fieldCol.appendChild(_wheelPad());
  var farmId = _wheelSelFarm ? _wheelSelFarm.id : null;
  var filtered = farmId ? _wheelFields.filter(function(f){ return f.farmId===farmId; }) : _wheelFields;
  if(!filtered.length){
    var el2 = document.createElement('div');
    el2.className = 'wheel-item';
    el2.style.color = 'var(--text3)';
    el2.textContent = 'No fields';
    fieldCol.appendChild(el2);
  }
  filtered.forEach(function(field, i){
    var isActive = _wheelSelField && _wheelSelField.id===field.id;
    var el = document.createElement('div');
    el.className = 'wheel-item' + (isActive ? ' active' : '');
    el.textContent = field.name;
    el.dataset.idx = i;
    el.addEventListener('click', function(){
      _wheelSelField = field;
      _wheelUpdateActive(fieldCol, el);
      _wheelScrollTo(fieldCol, el);
    });
    fieldCol.appendChild(el);
  });
  fieldCol.appendChild(_wheelPad());
  // Auto-select first field if none selected
  if(!_wheelSelField || !filtered.find(function(f){ return f.id===(_wheelSelField&&_wheelSelField.id); })){
    _wheelSelField = filtered[0] || null;
    var firstEl = fieldCol.querySelector('.wheel-item:not(:first-child):not(:last-child)');
    if(firstEl) firstEl.classList.add('active');
  }
  setTimeout(function(){
    var a = fieldCol.querySelector('.wheel-item.active');
    if(a) _wheelScrollTo(fieldCol, a, true);
    _wheelAttachScroll(fieldCol, 'field');
  }, 50);
}

function _wheelPad(){
  var pad = document.createElement('div');
  pad.className = 'wheel-item';
  pad.style.height = '88px';
  pad.style.pointerEvents = 'none';
  return pad;
}

function _wheelScrollTo(col, el, instant){
  var top = el.offsetTop - col.offsetHeight / 2 + el.offsetHeight / 2;
  col.scrollTo({ top: Math.max(0, top), behavior: instant ? 'auto' : 'smooth' });
}

function _wheelUpdateActive(col, activeEl){
  col.querySelectorAll('.wheel-item').forEach(function(e){ e.classList.remove('active'); });
  activeEl.classList.add('active');
}

function _wheelAttachScroll(col, type){
  var ticking = false;
  var settleTimer = null;

  col.addEventListener('scroll', function(){
    if(_wheelOpening) return;   // ignore open-time scroll-snap events
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(function(){
      ticking = false;
      // Find which item is closest to centre
      var centre = col.scrollTop + col.offsetHeight / 2;
      var items = Array.from(col.querySelectorAll('.wheel-item')).filter(function(el){ return el.style.height !== '88px'; });
      var closest = null, minDist = Infinity;
      items.forEach(function(el){
        var elCentre = el.offsetTop + el.offsetHeight / 2;
        var dist = Math.abs(elCentre - centre);
        if(dist < minDist){ minDist = dist; closest = el; }
      });
      if(!closest) return;
      col.querySelectorAll('.wheel-item').forEach(function(e){ e.classList.remove('active'); });
      closest.classList.add('active');
      var idx = parseInt(closest.dataset.idx)||0;
      if(type==='single'){ _wheelSelected = _wheelItems[idx]; }
      else if(type==='farm'){
        _wheelSelFarm = _wheelFarms[idx];
        _wheelRefreshFields();
      } else if(type==='field'){
        var farmId2 = _wheelSelFarm ? _wheelSelFarm.id : null;
        var filtered2 = farmId2 ? _wheelFields.filter(function(f){ return f.farmId===farmId2; }) : _wheelFields;
        _wheelSelField = filtered2[idx] || null;
      }

      // Auto-confirm after wheel settles (150ms after last scroll event)
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function(){
        // Snap scroll to nearest item center for clean alignment
        if(closest){
          var snapTop = closest.offsetTop - col.offsetHeight / 2 + closest.offsetHeight / 2;
          col.scrollTo({ top: Math.max(0, snapTop), behavior: 'smooth' });
        }
      }, 150);
    });
  });
}



