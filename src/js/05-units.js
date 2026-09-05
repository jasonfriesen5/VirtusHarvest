
// ══ UNIT PREFERENCES ══
const LS_UNITS = 'vf_units';

function getUnits(){
  return JSON.parse(localStorage.getItem(LS_UNITS)||'null') || {weight:'kg', temp:'c', area:'ha'};
}
function saveUnits(u){ localStorage.setItem(LS_UNITS, JSON.stringify(u)); }

function setWeightUnit(unit, btn){
  var prevUnit = wtUnit(); // get old unit BEFORE saving
  var u = getUnits(); u.weight = unit; saveUnits(u);
  document.querySelectorAll('#seg-weight .seg-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  applyWeightUnit(unit);

  // Convert AU drop trigger display value from old unit to new unit
  var auInput = document.getElementById('au-drop-kg-input');
  var auLbl   = document.getElementById('au-drop-unit-lbl');
  var auHint  = document.getElementById('au-drop-unit-hint');
  if(auInput && auDropKg > 0){
    _auDropLoadingSuppressed = true;
    // Convert auDropKg (always in kg) to new display unit
    var displayVal;
    if(unit === 'lbs' || unit === 'lb' || unit === 'bu'){
      displayVal = auDropKg / 0.453592;  // always show lbs for both lbs and bu
    } else {
      displayVal = auDropKg; // kg
    }
    auInput.value = Math.round(displayVal);
    var lbl = (unit === 'lbs' || unit === 'lb' || unit === 'bu') ? 'lbs' : 'kg';
    if(auLbl)  auLbl.textContent  = lbl;
    if(auHint) auHint.textContent = lbl;
    setTimeout(function(){ _auDropLoadingSuppressed = false; }, 200);
  }
  forceRefreshYieldUnits();
  showToast(T('Weight unit: ')+unit,'success');
}

function setAreaUnit(unit, btn){
  var u = getUnits(); u.area = unit; saveUnits(u);
  document.querySelectorAll('#seg-area .seg-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  forceRefreshYieldUnits();
  showToast(T('Area unit: ')+(unit==='ha'?T('Hectares'):T('Acres')),'success');
}

// How much the big weight number is rounded to for display (1/2/5/10 kg-or-
// equivalent). The scale itself now reports full 1 kg precision; this is a
// pure display preference layered on top in _roundForDisplay().
function setDisplayRound(step, btn){
  _displayRoundStep = step;
  localStorage.setItem('vf_display_round', String(step));
  document.querySelectorAll('#seg-round .seg-btn').forEach(function(b){ b.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  if(rawWeight!==null) _paintScaleDisplay();
  showToast(T('Display rounding: ')+step,'success');
}

// ── Weight conversion constants ──
var KG_TO_LB = 2.20462;
var KG_TO_BU_CORN    = 0.0393683; // 1 bu corn = 25.4012 kg
var KG_TO_BU_SOYBEAN = 0.0367437; // 1 bu soy  = 27.2155 kg
var KG_TO_BU_WHEAT   = 0.0367437; // same as soy
var KG_TO_BU_DEFAULT = 0.0393683; // default to corn

function kgToBu(kg, cropName){
  var crop = (cropName||'').toLowerCase();
  if(crop.indexOf('soy') !== -1 || crop.indexOf('wheat') !== -1 || crop.indexOf('rice') !== -1) return kg * KG_TO_BU_SOYBEAN;
  return kg * KG_TO_BU_DEFAULT;
}

// Convert kg value to display unit — returns {val, unit} 
function convertWt(kg, cropName){
  var u = JSON.parse(localStorage.getItem('vf_units')||'{}').weight || 'kg';
  if(u === 'lbs' || u === 'lb') return {val: kg * KG_TO_LB, unit: 'lbs'};
  if(u === 'bu')                 return {val: kgToBu(kg, cropName), unit: 'bu'};
  if(u === 'bu')                return {val: kgToBu(kg, cropName), unit: 'bu'};
  return                               {val: kg,             unit: 'kg'};
}

// Format a kg value into a display string e.g. "1,840 lb"
function fmtWt(kg, cropName){
  var r = convertWt(kg, cropName || '');
  var v = _roundForDisplay(r.val, r.unit);
  var dec = (r.unit==='lbs'||r.unit==='lb'||r.unit==='bu') ? 0 : 1;
  return v.toFixed(dec) + ' ' + r.unit;
}

// Format without the unit label (just the number)
function fmtWtNum(kg, cropName){
  var r = convertWt(kg, cropName || '');
  var v = _roundForDisplay(r.val, r.unit);
  var dec = (r.unit==='lbs'||r.unit==='lb'||r.unit==='bu') ? 0 : 1;
  return v.toFixed(dec);
}

// Current unit label
function wtUnit(){ return JSON.parse(localStorage.getItem('vf_units')||'{}').weight || 'kg'; }
function setRawWeightFromInput(val){
  var v = parseFloat(val) || 0;
  setRawWeight(wtUnit() === 'lbs' ? v * 0.453592 : v);
}

function applyWeightUnit(unit){
  // Update the scale unit labels on the display
  document.querySelectorAll('.scale-unit-lbl').forEach(function(el){ el.textContent=unit; });
  // Re-render everything that shows weight values
  renderLogs();
  updateWeighDisplay();
  updateTruckLoadBar();
  var panel = document.getElementById('field-detail-panel');
  if(panel && panel.classList.contains('open') && panel.dataset.fid){
    openFieldDetail(panel.dataset.fid);
  }
  var tpanel = document.getElementById('truck-detail-panel');
  if(tpanel && tpanel.classList.contains('open') && tpanel.dataset.tid){
    openTruckDetail(tpanel.dataset.tid);
  }
}

var _auDropLoadingSuppressed = false;

function saveAutoDetectSettings(){
  if(_auDropLoadingSuppressed) return;
  var input = document.getElementById('au-drop-kg-input');
  if(!input) return;
  var val = parseFloat(input.value);
  if(isNaN(val)) return;
  if(val !== 0 && val < 10) return;
  // Always read fresh unit from localStorage
  var wt = (JSON.parse(localStorage.getItem('vf_units')||'{}').weight) || 'kg';
  var valKg;
  if(wt === 'lbs' || wt === 'lb'){
    valKg = val * 0.453592;
  } else {
    valKg = val;
  }
  if(valKg !== 0 && valKg < 50){ showToast('Minimum trigger is 250 '+wt,'warn'); return; }
  auDropKg = parseFloat(valKg.toFixed(1));
  localStorage.setItem('vf_au_drop', auDropKg);
  showToast('Drop trigger: '+val+' '+wt,'success');
}

function loadAutoDetectSettings(){
  var saved = parseFloat(localStorage.getItem('vf_au_drop'));
  if(!isNaN(saved) && saved >= 0) auDropKg = saved;
  // Always read fresh unit from localStorage
  var wt = (JSON.parse(localStorage.getItem('vf_units')||'{}').weight) || 'kg';
  var isLbs = (wt === 'lbs');
  var input   = document.getElementById('au-drop-kg-input');
  var unitLbl = document.getElementById('au-drop-unit-lbl');
  var hintLbl = document.getElementById('au-drop-unit-hint');
  if(input){
    _auDropLoadingSuppressed = true;
    var displayVal2;
    if(wt === 'lbs' || wt === 'lb' || wt === 'bu'){
      displayVal2 = auDropKg / 0.453592; // always show lbs for lbs and bu
    } else {
      displayVal2 = auDropKg;
    }
    input.value = auDropKg === 0 ? 0 : Math.round(displayVal2);
    setTimeout(function(){ _auDropLoadingSuppressed = false; }, 100);
  }
  var dispLbl = (wt==='bu'||wt==='lb'||wt==='lbs') ? 'lbs' : 'kg';
  if(unitLbl) unitLbl.textContent = dispLbl;
  if(hintLbl) hintLbl.textContent = dispLbl;
}

function loadUnitSettings(){
  var u = getUnits();
  // Weight
  var wbtns = document.querySelectorAll('#seg-weight .seg-btn');
  wbtns.forEach(function(b){ b.classList.toggle('active', b.textContent===u.weight); });
  // Area
  var abtns = document.querySelectorAll('#seg-area .seg-btn');
  abtns.forEach(function(b){ b.classList.toggle('active', b.textContent===u.area); });
  // Apply weight unit to display
  applyWeightUnit(u.weight);
  // Display rounding
  var rbtns = document.querySelectorAll('#seg-round .seg-btn');
  rbtns.forEach(function(b){ b.classList.toggle('active', parseInt(b.textContent,10)===_displayRoundStep); });
}



// ══ DEVICE ROLE ══
const LS_ROLE = 'vf_role';

function getDeviceRole(){ return localStorage.getItem(LS_ROLE) || 'primary'; }

function setDeviceRole(role, btn){
  localStorage.setItem(LS_ROLE, role);
  document.querySelectorAll('#seg-role .seg-btn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  updateDeviceRoleDisplay(role);
  // Update the scale mode label on display tab
  updateScaleModeLabel(role);
  showToast(role==='primary' ? T('Primary device') : T('Remote device'), 'success');
}

function updateDeviceRoleDisplay(role){
  var sub = document.getElementById('device-role-sub');
  if(sub){
    sub.textContent = role==='primary'
      ? T('Primary device — controls the scale')
      : T('Remote device — receives data from primary');
  }
}

function updateScaleModeLabel(role){
  // Update the "Remote / Net" labels on the scale panel
  var modeLbls = document.querySelectorAll('.scale-mode-lbl');
  modeLbls.forEach(function(el){
    if(el.classList.contains('active-mode')){
      // keep Net label unchanged
    } else {
      el.textContent = role==='remote' ? T('Remote') : T('Local');
    }
  });
}

function loadRoleSetting(){
  var role = getDeviceRole();
  document.querySelectorAll('#seg-role .seg-btn').forEach(function(b){
    var t = b.textContent.trim();
    b.classList.toggle('active',
      ((t==='Primary'||t==='Primario') && role==='primary') ||
      ((t==='Remote'||t==='Remoto') && role==='remote')
    );
  });
  updateDeviceRoleDisplay(role);
  updateScaleModeLabel(role);
}



// ══ MOISTURE & WET/DRY WEIGHT ══
var currentMoisture = 13.0; // percentage 0-40

// ══ MOISTURE WHEEL ══
// 10%-30% in 0.5 steps; anything outside that comes from the Custom button.
var MOIST_MIN = 10, MOIST_MAX = 30, MOIST_STEP = 0.5;

