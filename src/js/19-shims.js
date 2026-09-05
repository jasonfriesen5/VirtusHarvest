// ══════════════════════════════════════════════════════════════════
//  PORT SHIMS
//  The ported Harvest subsystems still call into Harvest's domain
//  (farms, fields, trucks, crops, seasons). Rather than edit ~6,400
//  lines of working BLE/sync/auth code by hand, we satisfy those call
//  sites here: real behaviour where Feed has an equivalent, harmless
//  no-ops where it does not.
//  Each of these should disappear as its call site is rewritten.
// ══════════════════════════════════════════════════════════════════

// ── Globals the ported subsystems declare OUTSIDE the ranges we extracted ──
// Each of these is read on a hot path (scale repaint, wheel picker, BLE scan).
// In sloppy mode an assignment would create them, but a READ before that throws
// ReferenceError — and inside the BLE notify handler that kills the whole
// Báscula screen with an unhelpful "Cannot read properties of null".
var heldWeight = null;          // gross weight held before a Clear
var _elScaleWeightBox = null, _elScaleGross = null, _elScaleTarget = null;
var _elStableDot = null, _elStableTxt = null, _elBtnUnload = null, _elDryPreview = null;
var _appMode = 'primary';
var selectedTruck = null;       // Harvest concept; Feed never sets it
var auDropKg = 0;
var MOIST_MAX = 40, MOIST_STEP = 0.5;
var BITSTRATA_MFR_ID = 0xFFFF;  // third-party scale advert id, unused in Feed
var LS_PROFILE_PHOTO = 'vf_profile_photo';
var _ESP32_WIFI_URL = '';
var _wifiPollInterval = null;

// Wheel picker state (declared above the range we ported).
var _wheelItems = [], _wheelSelected = null, _wheelMode = 'single', _wheelOpening = false;
var _wheelOnConfirm = null, _wheelOnAdd = null, _wheelOnCustom = null;
var _wheelFarms = [], _wheelFields = [], _wheelSelFarm = null, _wheelSelField = null;

// ── Real redirects: Feed has an equivalent ───────────────────────

// Harvest repainted the weighing screen; Feed repaints the feed step.
function updateWeighDisplay(){ if(typeof renderFeedTab === 'function') renderFeedTab(); }
function renderLogs(){ if(typeof renderFeedTab === 'function') renderFeedTab(); }

// Mixers and operators are real Feed entities — route these to the new engine.
function syncMixer(m){        if(m && m.id) _pushConfig('vf_mixers', _mixerToCloud(m), m.id); }
function deleteSyncMixer(id){ if(id) _deleteConfig('vf_mixers', id); }
function syncOperator(o){     if(o && o.id) _pushConfig('vf_operators', {id:o.id, user_id:(currentWorker||{}).id, name:o.name, role:o.role||null, active:o.active!==false}, o.id); }
function deleteSyncOperator(id){ if(id) _deleteConfig('vf_operators', id); }

function _mixerToCloud(m){
  return { id:m.id, user_id:(currentWorker||{}).id, name:m.name,
           capacity_kg:m.capacityKg||null, serial:m.serial||null };
}

// The season display in the ported chrome maps onto the active cycle.
function updateSeasonDisplay(){ if(typeof _paintMoreTab === 'function') _paintMoreTab(); }
function updateSeasonDisplayLabel(){ updateSeasonDisplay(); }
function loadActiveSeason(){ /* 20-model.js owns activeCycleId */ }
function getSeasonLogs(){ return typeof cycleFeedings === 'function' ? cycleFeedings() : []; }

// ── No-ops: Harvest-only concepts with no Feed equivalent ────────
// Empty collections rather than undefined, so callers that iterate don't throw.
function getFarms(){ return []; }
function getFields(){ return []; }
function getTrucks(){ return []; }
function getDestinations(){ return []; }
function getCrops(){ return []; }
function getBoundaries(){ return {}; }
function getApiUrl(){ return ''; }

function renderFarms(){}
function renderFields(){}
function renderTrucks(){}
function renderDestinations(){}
function renderSeasons(){}
function refreshCropDropdown(){}
function updateFarmSelectorCard(){}
function updateFieldZoneDisplay(){}
function updateSessionTotal(){}
function updateTruckLoadBar(){}
function updateCropDisplay(){}
function forceRefreshYieldUnits(){}
function updateCalCapUnit(){}
function initUnloadDropdown(){}
function seasonGoBack(){}
function fieldsGoBack(){}
function startGeofenceDetector(){}
function openFieldMap(){}
function openFieldDetail(){}
function openTruckDetail(){}
function openAddNameSheet(){}
function openFieldOnlyPickerAll(){}
function calcDryWeight(kg){ return kg; }          // no moisture model in Feed
function _restoreSelection(){}
function _clearSelection(){}
function _saveSelection(){}
function _revalidateSelections(){}
function _hideUnloadBanner(){}
function _showUnloadBanner(){}
function decodeBitstrataAdvert(){ return null; }  // third-party scale format, not ours

// Harvest's auto-unload detector isn't wired in Feed: the operator confirms
// each step explicitly, so there is nothing to auto-detect. The scale display
// still reads its state variables on every repaint, though, so they have to
// exist — an undefined here throws inside the BLE notify handler and takes the
// whole Báscula screen down with it.
var _auState = 'idle';
var _auWindowSamples = [];
var _auWeightBefore = null;
var _auPeakWeight = null;
var _auPeakTrue = null;
var _auPeakTime = 0;
var _auDropSince = null;
var _auZeroSuppressUntil = 0;
var _auDropLoadingSuppressed = false;
var _auPendingEntry = null;
var _auPendingManualEntry = null;

// NOT a no-op. Harvest's auto-unload detector is stubbed, but this same
// function is what feeds _auWindowSamples — and _paintScaleDisplay() derives
// weightStable from that buffer. Stubbing it entirely left the buffer empty,
// so stability never became true and the load sheet's Confirm button was
// permanently disabled: the operator could fill the bar and not move on.
// Keep the sampling; drop only the unload detection.
function _auTickWithStable(w, fwStable){
  if(w === null || w === undefined || isNaN(w)) return;
  var now = Date.now();
  _auWindowSamples.push({ t: now, w: w });
  // 3s is the window _paintScaleDisplay() reads; keep a little more than that.
  var cutoff = now - 5000;
  while(_auWindowSamples.length && _auWindowSamples[0].t < cutoff) _auWindowSamples.shift();
}
function _auTick(w){ _auTickWithStable(w, undefined); }
function _auProcess(){}

// BLE OTA lives in 04/06; the Harvest wrapper that scheduled it does not.
if(typeof checkForBLEOTAUpdate !== 'function'){ window.checkForBLEOTAUpdate = function(){}; }

// Harvest's clearScale() sat outside the ported range. Feed's version just
// releases the tare so the display shows the scale's true reading again.
function clearScale(){
  tareOffset = 0;
  heldWeight = null;
  if(typeof _paintScaleDisplay === 'function') _paintScaleDisplay();
  var t = document.getElementById('scale-target'); if(t) t.textContent = '- -';
  showToast(T('Tare cleared'), 'success');
}
