function getOperators(){ return JSON.parse(localStorage.getItem(LS_OPERATORS)||'[]'); }
function saveOperators(ops){ localStorage.setItem(LS_OPERATORS, JSON.stringify(ops)); }

function renderOperators(){
  var ops  = getOperators();
  var list = document.getElementById('operators-list');
  if(!list) return;
  list.innerHTML = '';
  if(!ops.length){
    list.innerHTML = '<div style="padding:12px 14px;font-size:13px;color:var(--text3);">'+T('No operators yet — add one below')+'</div>';
    return;
  }
  ops.forEach(function(op){
    var isActive = currentWorker && currentWorker.operatorId === op.id;
    var ini = op.name.split(' ').map(function(w){return w[0]||'';}).join('').toUpperCase().slice(0,2);
    var row = document.createElement('div');
    row.className = 'farm-item' + (isActive?' active':'');
    row.style.cursor = 'pointer';
    row.innerHTML =
      '<div class="fi-left">' +
        '<div class="profile-avatar" style="width:36px;height:36px;font-size:13px;flex-shrink:0;">'+ini+'</div>' +
        '<div>' +
          '<div class="fi-name">'+esc(op.name)+'</div>' +
          (op.role?'<div style="font-size:11px;color:var(--text3);">'+esc(op.role)+'</div>':'') +
        '</div>' +
      '</div>' +
      '<div class="fi-right" style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:18px;color:rgba(180,130,0,0.3);">›</span>' +
      '</div>';

    // Tap to select
    row.addEventListener('click', function(e){
      if(e.target.classList.contains('btn-del-sm')) return;
      selectOperator(op.id);
    });

    // Edit button
    var editBtn = document.createElement('button');
    editBtn.className = 'fdp-tx-edit';
    editBtn.textContent = T('Edit');
    editBtn.style.cssText = 'padding:5px 10px;font-size:12px;';
    editBtn.addEventListener('click', function(e){ e.stopPropagation(); openEditOperatorSheet(op.id); });

    // Delete button
    var delBtn = document.createElement('button');
    delBtn.className = 'btn-del-sm';
    delBtn.textContent = 'x';
    delBtn.addEventListener('click', function(e){
      e.stopPropagation();
      showConfirm({title:T('Remove Operator?'), msg:T('Remove')+' '+op.name+'?', okLabel:T('Remove'), okColor:'#B03020'}).then(function(ok){
        if(!ok) return;
        deleteSyncOperator(op.id);
        saveOperators(getOperators().filter(function(o){ return o.id!==op.id; }));
        if(currentWorker && currentWorker.operatorId===op.id){
          // Clear the operator selection but keep the account signed in.
          currentWorker.name=null; currentWorker.role=null; currentWorker.operatorId=null;
          localStorage.setItem(LS_WORKER, JSON.stringify(currentWorker));
        }
        renderOperators();
        updateOperatorDisplay();
      });
    });

    row.querySelector('.fi-right').appendChild(editBtn);
    row.querySelector('.fi-right').appendChild(delBtn);
    list.appendChild(row);
  });
}

function selectOperator(id){
  var op = getOperators().find(function(o){ return o.id===id; });
  if(!op) return;
  // Operator = the driver stamped on each transaction. It must NOT touch the
  // cloud account identity (currentWorker.id / .email) — selecting an operator
  // does not sign anyone in. Only the account fields (set by real login) make
  // the app "logged in" and own the cloud data.
  currentWorker = currentWorker || {};
  currentWorker.name       = op.name;
  currentWorker.role       = op.role;
  currentWorker.operatorId = op.id;
  localStorage.setItem(LS_WORKER, JSON.stringify(currentWorker));
  updateOperatorDisplay();
  renderOperators();
  showToast('Operator: '+op.name, 'success');
  closeMorePanel('operators');
}

function updateOperatorDisplay(){
  var n   = currentWorker ? currentWorker.name : T('No Operator Selected');
  var rol = currentWorker ? (currentWorker.role||T('Operator')) : T('Tap an operator below to select');
  var ini = (currentWorker && n && n !== 'No Operator Selected') ? (n.split(' ').map(function(w){return w&&w[0]?w[0]:'';}).join('').toUpperCase().slice(0,2)||'?') : '?';

  // The More tab profile card belongs to the ACCOUNT -- do not write the
  // operator into it. This used to blank #settings-avatar and put the driver's
  // name in #settings-name (via a #settings-avatar-op element that does not
  // exist here), so choosing an operator overwrote the signed-in account.
  // Main display: the operator card on the control strip. This function is the
  // one place that reflects "who is driving" across the app, so the card has to
  // be updated here — otherwise picking someone changed the record while the
  // screen kept showing the previous name.
  var hop = document.getElementById('home-op-name');
  if(hop){
    hop.textContent = (currentWorker && currentWorker.name) || T('Tap to choose');
    hop.classList.toggle('unset', !(currentWorker && currentWorker.name));
  }

  // Operators panel
  var oa = document.getElementById('op-avatar'); if(oa) oa.textContent=ini;
  var on = document.getElementById('op-name');   if(on) on.textContent=n;
  var or_ = document.getElementById('op-role');  if(or_) or_.textContent=rol;
  // Topbar worker + display tab
  var awn = document.getElementById('app-worker-name'); if(awn) awn.textContent=n;
  var irw = document.getElementById('ir-worker'); if(irw) irw.textContent=n;
}

function openAddOperatorSheet(){
  document.getElementById('op-sheet-title').textContent = T('Add Operator');
  document.getElementById('op-name-label').textContent = T('Name *');
  document.getElementById('op-edit-id').value = '';
  document.getElementById('op-name-input').value = '';
  document.getElementById('op-role-input').value = '';
  document.getElementById('op-sheet-overlay').classList.add('open');
  setTimeout(function(){ document.getElementById('op-name-input').focus(); }, 200);
}

function openEditOperatorSheet(id){
  var op = getOperators().find(function(o){ return o.id===id; });
  if(!op) return;
  document.getElementById('op-sheet-title').textContent = T('Edit Operator');
  document.getElementById('op-name-label').textContent = T('Name *');
  document.getElementById('op-edit-id').value = id;
  document.getElementById('op-name-input').value = op.name||'';
  document.getElementById('op-role-input').value = op.role||'';
  document.getElementById('op-sheet-overlay').classList.add('open');
}

function closeAddOperatorSheet(){
  document.getElementById('op-sheet-overlay').classList.remove('open');
}

function saveOperatorSheet(){
  var name = document.getElementById('op-name-input').value.trim();
  var role = document.getElementById('op-role-input').value.trim();
  var editId = document.getElementById('op-edit-id').value;
  if(!name){ showToast('Name required','error'); return; }

  var ops = getOperators();
  if(editId){
    var idx = ops.findIndex(function(o){ return o.id===editId; });
    if(idx!==-1){ ops[idx].name=name; ops[idx].role=role; }
    // Update currentWorker if editing active operator
    if(currentWorker && currentWorker.id===editId){
      currentWorker.name=name; currentWorker.role=role;
      localStorage.setItem(LS_WORKER, JSON.stringify(currentWorker));
    }
  } else {
    ops.push({id:uid(), name:name, role:role});
  }
  saveOperators(ops);
  var theOp=ops.find(function(o){return o.id===(editId||ops[ops.length-1].id);});
  if(theOp) syncOperator(theOp);
  closeAddOperatorSheet();
  renderOperators();
  updateOperatorDisplay();
  showToast(editId?'Operator updated':'Operator added','success');
}



// Picking an operator selects ONE, exactly like the feed group — so it uses the
// same row list rather than a scroll wheel. A wheel hides every option but the
// one under the needle, which is the wrong shape for a short, known list.
function openWorkerPicker(){
  var ops = getOperators();
  if(!ops.length){ showToast(T('No operators added yet'), 'warn'); openMorePanel('sp-operators'); return; }
  _renderOperatorPicker();
  document.getElementById('opick-overlay').classList.add('open');
}

function closeOperatorPicker(){
  document.getElementById('opick-overlay').classList.remove('open');
}

function _renderOperatorPicker(){
  var host = document.getElementById('opick-body');
  if(!host) return;
  var currentId = (currentWorker && currentWorker.operatorId) || null;

  host.innerHTML = getOperators().map(function(op){
    var on = op.id === currentId;
    // Feedings this operator has actually run — counted straight from the
    // record rather than from operatorPunctuality(), which takes a day window
    // and returns a map keyed by operator, not per-operator stats.
    var loads = cycleFeedings().filter(function(f){
      return f.operatorName === op.name && f.status === 'done';
    }).length;
    return '<div class="gsel-row' + (on ? ' on' : '') + '" onclick="pickOperator(\'' + op.id + '\')">' +
      '<div class="gsel-main">' +
        '<div class="gsel-name">' + esc(op.name) + '</div>' +
        '<div class="gsel-sub">' + esc(op.role || T('Operator')) + '</div>' +
      '</div>' +
      (loads
        ? '<div class="gsel-kg">' +
            '<div class="gsel-kg-val">' + loads + '</div>' +
            '<div class="gsel-kg-lbl">' + esc(T('loads')) + '</div>' +
          '</div>'
        : '') +
    '</div>';
  }).join('');
}

function pickOperator(id){
  var op = getOperators().find(function(o){ return o.id === id; });
  if(!op) return;
  // Set the operator (driver) only — the account (id/email) is a different
  // identity living on the same object and must not be touched here.
  currentWorker = currentWorker || {};
  currentWorker.name       = op.name;
  currentWorker.role       = op.role;
  currentWorker.operatorId = op.id;
  localStorage.setItem(LS_WORKER, JSON.stringify(currentWorker));
  updateOperatorDisplay();
  closeOperatorPicker();
  showToast(op.name, 'success');
}

function closeWorkerPicker(){
  document.getElementById('worker-picker-overlay').classList.remove('open');
}



