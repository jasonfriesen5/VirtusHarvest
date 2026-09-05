async function connectAdvertDevice(device){
  if(!device.watchAdvertisements){
    showToast('Advertisement watching not supported — try a different browser','error');
    return;
  }
  try{
    showToast('Listening to '+device.name+'…','success');
    await device.watchAdvertisements();
    device.addEventListener('advertisementreceived', function(event){
      if(event.manufacturerData && event.manufacturerData.has(BITSTRATA_MFR_ID)){
        var data = event.manufacturerData.get(BITSTRATA_MFR_ID);
        var kg   = decodeBitstrataAdvert(data);
        if(kg !== null) setRawWeight(kg);
      }
      // Also try service data
      if(event.serviceData){
        event.serviceData.forEach(function(data){
          var kg = decodeBitstrataAdvert(data);
          if(kg !== null) setRawWeight(kg);
        });
      }
    });
    btDevice = device;
    updateBtPills(true, device.name||'Scale');
    document.querySelectorAll('.sub-panel.open').forEach(function(p){p.classList.remove('open');});
    showTab('display');
    document.getElementById('btn-log').disabled=false;
    document.getElementById('btn-unload').disabled=false;
    renderBtDeviceList(scannedDevices);
  } catch(e){
    showToast('Failed: '+e.message,'error');
  }
}



// ══ DEVICE INFO ══
function updateDeviceInfo(info){
  // info: {model, serial, firmware, battery, extPower, sensitivity, capacity, calibration}
  var fields = {
    'dev-model':       info.model       || 'N/A',
    'dev-serial':      info.serial      || 'N/A',
    'dev-firmware':    info.firmware    || 'N/A',
    'dev-battery':     info.battery     || 'N/A',
    'dev-ext-power':   info.extPower    || 'N/A',
    'dev-sensitivity': info.sensitivity || 'N/A',
    'dev-capacity':    info.capacity    || 'N/A',
    'dev-calibration': info.calibration || 'N/A',
  };
  Object.keys(fields).forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.textContent = fields[id];
  });
  syncCalDeviceInfo();
  // Capture the module's hardware serial — the stable, portable identity we
  // bind grain mixers to (survives browser/device/reinstall changes).
  _connectedSerial = (info.serial && info.serial !== 'N/A') ? info.serial : null;
  _adoptMixerDevice();
  _healActiveMixer();
  _updateMixerDeviceStatus();
  _checkMixerSerialMatch();
  // Now that we know the scale's firmware version, quietly check for a newer one
  if(info.firmware && info.firmware !== 'N/A'){ setTimeout(function(){ checkFirmwareUpdate(true); }, 400); }
}

var _connectedSerial = null;
// If the connected module's serial doesn't match the selected mixer's serial,
// warn (the wrong scale is nearby / paired). Doesn't block.
function _checkMixerSerialMatch(){
  if(!_activeMixerId || !_connectedSerial) return;
  var c = getMixers().find(function(x){ return x.id===_activeMixerId; });
  if(c && c.serial && c.serial !== _connectedSerial){
    // Logged, not toasted — it fires on a normal connect and reads as an alarm
    // when nothing is actually wrong. Still traceable under Diagnostics.
    logEvent('scale', 'Connected module '+_connectedSerial+' is not '+c.name+'\u2019s paired scale');
  }
}

// Does this mixer belong to the scale currently connected?
//
// Two identities, checked in order of cost. deviceId is the local BLE handle:
// exact, but per-device and deliberately never synced (it is a MAC on Android
// and a per-app UUID on iOS, so it would be meaningless on the other platform).
// serial is the module's hardware serial — the portable identity the cloud
// actually carries, and the one this app already calls "the stable identity we
// bind grain mixers to".
//
// Checking serial too is what fixes a mixer that arrived by sync: those always
// have deviceId null, so the deviceId test alone could never match and the
// scale showed as "Connected — not linked to a mixer" forever, no matter how
// many times you reconnected.
function _mixerMatchesDevice(c){
  if(!c) return false;
  if(btDevice && c.deviceId && c.deviceId === btDevice.id) return true;
  return !!(_connectedSerial && c.serial && c.serial === _connectedSerial);
}

// Bind the local BLE handle onto whichever mixer matched by serial, so the link
// is direct from here on rather than re-derived on every render. Runs after the
// INFO packet, which is the first moment the serial is known.
function _adoptMixerDevice(){
  if(!btDevice || !_connectedSerial) return;
  var mixers = getMixers(), changed = false;
  mixers.forEach(function(c){
    if(c.serial && c.serial === _connectedSerial && c.deviceId !== btDevice.id){
      c.deviceId   = btDevice.id;
      c.deviceName = btDevice.name || c.deviceName || c.name;
      changed = true;
    }
  });
  // deviceId/deviceName are local-only, so this never needs a cloud push.
  if(changed) saveMixers(mixers);
}

// vf_active_mixer can outlive the mixer it names — mixers created before sign-in
// used to be dropped by the merge, leaving the pointer aimed at nothing and no
// mixer selected. Prefer the mixer matching the connected scale, else the first.
function _healActiveMixer(){
  var mixers = getMixers();
  if(!mixers.length){ _activeMixerId = null; localStorage.removeItem('vf_active_mixer'); return; }
  if(mixers.some(function(c){ return c.id === _activeMixerId; })) return;
  var pick = mixers.find(_mixerMatchesDevice) || mixers[0];
  _activeMixerId = pick.id;
  localStorage.setItem('vf_active_mixer', pick.id);
}

// ══ FEED MIXERS ══
// Each feed mixer is a named mixer bound to a specific BLE scale. Selecting a
// mixer reconnects to that mixer's saved device — so one iPad can move between
// mixers and connect to the right scale each time. Separate from Trucks.
// LS_MIXERS is declared in 20-model.js with the other storage keys.
var _activeMixerId = localStorage.getItem('vf_active_mixer') || null;
var _mixerPairingInProgress = false;   // true while the Add/Edit-Mixer sheet is open
function getMixers(){ try{ return JSON.parse(localStorage.getItem(LS_MIXERS)||'[]'); }catch(e){ return []; } }
function saveMixers(c){ localStorage.setItem(LS_MIXERS, JSON.stringify(c)); }

function openAddMixerSheet(){
  document.getElementById('ac-edit-id').value = '';
  document.getElementById('add-mixer-title').textContent = T('Add Grain Mixer');
  document.getElementById('ac-name').value = '';
  _mixerPairingInProgress = true;
  _updateMixerDeviceStatus();
  document.getElementById('add-mixer-sheet-overlay').classList.add('open');
  // No scale connected yet → immediately search for a Virtus module (the
  // picker runs inside this button's user-gesture, so it's allowed).
  if(!btDevice){ scanBluetooth(); }
  else { setTimeout(function(){ document.getElementById('ac-name').focus(); }, 150); }
}
function openEditMixerSheet(id){
  var c = getMixers().find(function(x){ return x.id===id; }); if(!c) return;
  document.getElementById('ac-edit-id').value = id;
  document.getElementById('add-mixer-title').textContent = T('Edit Grain Mixer');
  document.getElementById('ac-name').value = c.name;
  _mixerPairingInProgress = true;
  _updateMixerDeviceStatus();
  document.getElementById('add-mixer-sheet-overlay').classList.add('open');
}
function closeAddMixerSheet(){
  _mixerPairingInProgress = false;
  document.getElementById('add-mixer-sheet-overlay').classList.remove('open');
}

function _updateMixerDeviceStatus(){
  var el = document.getElementById('ac-device-status'); if(!el) return;
  if(btDevice){
    el.textContent = '✓ Connected: '+(btDevice.name||'scale')+(_connectedSerial?' · serial '+_connectedSerial:'');
    el.style.color='#1A6B3C'; return;
  }
  // Editing an existing mixer with no live connection — show what it's paired to
  var editId = (document.getElementById('ac-edit-id')||{}).value;
  var c = editId ? getMixers().find(function(x){ return x.id===editId; }) : null;
  if(c && c.serial){
    el.textContent = T('Paired to')+' '+(c.deviceName||'scale')+' · serial '+c.serial+' — '+T('tap Scan to change');
    el.style.color='var(--text2)'; return;
  }
  el.textContent = T('Searching for a Virtus module…'); el.style.color='var(--text3)';
}

function saveMixer(){
  var name = (document.getElementById('ac-name').value||'').trim();
  if(!name){ showToast('Enter a mixer name','error'); return; }
  if(!btDevice || !btDevice.id){ showToast(T('Connect a scale first (tap Scan)'),'warn'); return; }
  var mixers = getMixers();
  var editId = document.getElementById('ac-edit-id').value;
  var serial = _connectedSerial || null;
  if(editId){
    var c = mixers.find(function(x){ return x.id===editId; });
    if(c){ c.name=name; c.deviceId=btDevice.id; c.deviceName=btDevice.name||name; if(serial) c.serial=serial; }
  } else {
    var nc = { id: uid(), name: name, serial: serial, deviceId: btDevice.id, deviceName: btDevice.name||name };
    mixers.push(nc);
    _activeMixerId = nc.id; localStorage.setItem('vf_active_mixer', nc.id);
  }
  saveMixers(mixers);
  var savedMixer = editId ? mixers.find(function(x){ return x.id===editId; }) : mixers[mixers.length-1];
  if(savedMixer && typeof syncMixer==='function') syncMixer(savedMixer);   // push to cloud
  closeAddMixerSheet();
  renderMixers();
  showToast(name+' saved','success');
}

function deleteMixerById(id){
  var c = getMixers().find(function(x){ return x.id===id; });
  showConfirm({ title:T('Remove Mixer?'), msg:T('Remove')+' "'+(c?c.name:'')+'"?', okLabel:T('Remove'), okColor:'#B03020' }).then(function(ok){
    if(!ok) return;
    if(typeof deleteSyncMixer==='function') deleteSyncMixer(id);   // remove from cloud
    // Drop the radio link too. Removing the mixer removed the only way back to
    // this scale in the UI, so leaving it connected stranded the link with no
    // way to disconnect it short of restarting the app.
    if(btDevice && c && c.deviceId && btDevice.id === c.deviceId){
      try{ disconnectBt(); }catch(e){ console.warn('disconnect on mixer delete failed:', e); }
    }
    saveMixers(getMixers().filter(function(x){ return x.id!==id; }));
    if(_activeMixerId===id){ _activeMixerId=null; localStorage.removeItem('vf_active_mixer'); }
    renderMixers();
  });
}

async function selectMixer(id){
  var c = getMixers().find(function(x){ return x.id===id; }); if(!c) return;
  _activeMixerId = id; localStorage.setItem('vf_active_mixer', id);
  renderMixers();
  if(btDevice && btDevice.id===c.deviceId){ showToast(c.name+' — already connected','success'); return; }
  if(btDevice){ try{ disconnectBt(); }catch(e){} }
  await _reconnectMixerDevice(c);
}

async function _reconnectMixerDevice(c){
  if(!c || !c.deviceId) return;

  // Never contend for the radio during a firmware flash. Mid-DFU the scale is
  // in its bootloader under a different identity, so this can only ever time
  // out — but it does so while Nordic is streaming the image, which is the one
  // operation on this device that must not be disturbed.
  if(_otaInProgress){
    showToast(T('Firmware update in progress — please wait'),'warn');
    return;
  }

  // Native: reconnect using the stored device id. Android will connect straight to
  // a MAC, but iOS refuses an identifier it has not seen this session —
  // "Device not found. Call 'requestDevice', 'requestLEScan' or 'getDevices' first."
  // getDevices() re-materialises the peripheral from its saved UUID, which is the
  // supported way to reconnect without making the user scan again.
  if(_isCapacitor && _capBLE){
    if(!(await _ensureBleReady())) return;
    showToast(T('Connecting to')+' '+c.name+'…','');
    if(_capBLE.getDevices){
      try{
        var known = await _capBLE.getDevices([c.deviceId]);
        if(!known.length){
          showToast(T('Scale not nearby — tap Scan to find it'),'warn');
          return;
        }
      }catch(e){ console.warn('getDevices failed:', e); }
    }
    await connectRealDevice({ id: c.deviceId, name: c.deviceName || c.name, isCapDevice: true });
    renderMixers();
    return;
  }

  if(!navigator.bluetooth || !navigator.bluetooth.getDevices){
    showToast('Open '+c.name+' and Scan to connect its scale','warn'); return;
  }
  showToast('Connecting to '+c.name+'…','');
  try{
    var devs = await navigator.bluetooth.getDevices();
    var dev = devs.find(function(d){ return d.id===c.deviceId; });
    if(dev){ await connectRealDevice(dev); renderMixers(); }
    else { showToast('Scale not found — Edit '+c.name+' and re-scan','warn'); }
  }catch(e){ showToast('Reconnect failed: '+e.message,'error'); }
}

function renderMixers(){
  var list = document.getElementById('mixers-list'); if(!list) return;
  var mixers = getMixers();
  list.innerHTML='';

  // A scale can be connected without belonging to any mixer — connect straight from
  // a scan, or delete the mixer afterwards. Surface it so it can always be released.
  if(btDevice && !mixers.some(_mixerMatchesDevice)){
    var orphan=document.createElement('div');
    orphan.className='info-row';
    orphan.innerHTML =
      '<div class="info-row-main"><div class="info-row-title" style="color:var(--text);">'+
        esc(btDevice.name||T('Connected'))+'</div>'+
      '<div class="info-row-sub">'+T('Connected — not linked to a mixer')+'</div></div>'+
      '<div class="info-row-right"></div>';
    var ob=document.createElement('button');
    ob.className='btn-conn';
    ob.textContent=T('Disconnect');
    ob.style.cssText='border-radius:8px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer;';
    ob.addEventListener('click', function(){ try{ disconnectBt(); }catch(e){} renderMixers(); });
    orphan.querySelector('.info-row-right').appendChild(ob);
    list.appendChild(orphan);
  }
  if(!mixers.length){
    list.innerHTML = '<div style="text-align:center;padding:16px;font-size:13px;color:var(--text3);">'+T('No mixers yet — tap Add Mixer to name one and pair its scale')+'</div>';
    return;
  }
  mixers.forEach(function(c){
    var active = _activeMixerId===c.id;
    var isConn = active && btDevice && btDevice.id===c.deviceId;
    var row=document.createElement('div');
    row.className='info-row'; row.style.cursor='pointer';
    if(active) row.style.background='rgba(245,200,66,0.14)';
    row.innerHTML =
      '<div class="info-row-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h16l-2.3 8.5H6.3z"/><path d="M14.5 7V3.8a1 1 0 0 1 1-1H17"/><path d="M15.7 2.8h3"/><line x1="3.6" y1="15.5" x2="18.4" y2="15.5"/><circle cx="8" cy="19.2" r="1.7"/><circle cx="15" cy="19.2" r="1.7"/></svg></div>'+
      '<div class="info-row-main"><div class="info-row-title" style="color:var(--text);">'+esc(c.name)+'</div>'+
      '<div class="info-row-sub">'+(isConn?'● Connected':(active?T('Selected')+' · '+esc(c.deviceName||'scale'):esc(c.deviceName||'scale')))+'</div></div>'+
      '<div class="info-row-right" style="display:flex;align-items:center;gap:6px;"></div>';
    row.addEventListener('click', function(e){
      if(e.target.classList.contains('btn-del-sm')||e.target.classList.contains('btn-edit-sm')) return;
      selectMixer(c.id);
    });
    var right=row.querySelector('.info-row-right');
    // Connected → offer the way out. Previously the only affordance was Connect,
    // so once linked there was no way to drop it from this screen.
    if(isConn){
      var disc=document.createElement('button');
      disc.className='btn-conn';
      disc.textContent=T('Disconnect');
      disc.style.cssText='border-radius:8px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer;';
      disc.addEventListener('click', function(e){
        e.stopPropagation();
        try{ disconnectBt(); }catch(err){}
        renderMixers();
      });
      right.appendChild(disc);
    }
    // Reconnect without going through Edit → Scan → Save.
    if(!isConn && c.deviceId){
      var conn=document.createElement('button');
      conn.className='btn-conn';
      conn.textContent=T('Connect');
      conn.style.cssText='border-radius:8px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer;';
      conn.addEventListener('click', function(e){
        e.stopPropagation();
        _activeMixerId=c.id; localStorage.setItem('vf_active_mixer', c.id);
        if(btDevice){ try{ disconnectBt(); }catch(err){} }
        _reconnectMixerDevice(c);
      });
      right.appendChild(conn);
    }
    var edit=document.createElement('button'); edit.className='btn-edit-sm'; edit.textContent=T('Edit');
    edit.style.cssText='border-radius:8px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer;';
    edit.addEventListener('click', function(e){ e.stopPropagation(); openEditMixerSheet(c.id); });
    var del=document.createElement('button'); del.className='btn-del-sm'; del.textContent='x';
    del.addEventListener('click', function(e){ e.stopPropagation(); deleteMixerById(c.id); });
    right.appendChild(edit); right.appendChild(del);
    list.appendChild(row);
  });
}

function clearDeviceInfo(){
  ['dev-model','dev-serial','dev-firmware','dev-battery','dev-ext-power','dev-sensitivity','dev-capacity','dev-calibration'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.textContent = 'N/A';
  });
}

var _lastDiagReport = '';

// ══ EVENT LOG ══
// A rolling history of notable/bad events (scale disconnects, sync failures,
// GPS loss, unrecognized-scale blocks, uncaught JS errors) — separate from
// runDiagnostics()'s point-in-time snapshot. This is what lets the report
// show what actually went wrong earlier, not just the state right now.
var LS_EVENT_LOG = 'vf_event_log';
var EVENT_LOG_MAX = 200;
function getEventLog(){ try{ return JSON.parse(localStorage.getItem(LS_EVENT_LOG)||'[]'); }catch(e){ return []; } }
function logEvent(category, msg){
  try{
    var log = getEventLog();
    log.push({ ts: Date.now(), category: category, msg: String(msg) });
    if(log.length > EVENT_LOG_MAX) log = log.slice(log.length - EVENT_LOG_MAX);
    localStorage.setItem(LS_EVENT_LOG, JSON.stringify(log));
  }catch(e){}
}
function clearEventLog(){
  localStorage.removeItem(LS_EVENT_LOG);
  showToast('Event log cleared','success');
  var el = document.getElementById('diag-status');
  if(el) el.textContent = 'Event log cleared';
}
// Catch uncaught JS errors / rejected promises app-wide — this is what makes
// the log actually reflect "something went wrong with the app", not just
// the things we remembered to log by hand.
window.addEventListener('error', function(e){
  logEvent('error', (e.message||'Uncaught error') + (e.filename ? ' ('+e.filename.split('/').pop()+':'+e.lineno+')' : ''));
});
window.addEventListener('unhandledrejection', function(e){
  var reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
  logEvent('error', 'Unhandled promise rejection: ' + reason);
});

function termLog(msg, color){
  var t = document.getElementById('diag-terminal');
  if(!t) return;
  var line = document.createElement('div');
  line.style.color = color || '#7EE787';
  line.innerHTML = '<span style="color:#6E7681;">['+new Date().toLocaleTimeString()+']</span> '+msg;
  t.appendChild(line);
  t.scrollTop = t.scrollHeight;
}

function runDiagnostics(){
  var t = document.getElementById('diag-terminal');
  if(t) t.innerHTML = '';

  termLog('<span style="color:#58A6FF;">═══ Virtus Diagnostics ═══</span>');
  termLog('App Version: '+APP_VERSION);
  termLog('Platform: '+navigator.userAgent.split('(')[0].trim(), '#E6EDF3');

  // Device
  termLog('────── Scale Device ──────', '#6E7681');
  termLog('Status: '+(btDevice?'<span style="color:#7EE787;">CONNECTED</span>':'<span style="color:#F85149;">NOT CONNECTED</span>'));
  if(btDevice) termLog('Device: '+esc(btDevice.name||'Unknown'), '#E6EDF3');
  termLog('BLE UART: '+(btChar?'<span style="color:#7EE787;">Active</span>':'None'));

  // Session
  termLog('────── Session ──────', '#6E7681');
  termLog('Worker: '+esc(currentWorker?currentWorker.name:'Not logged in'), '#E6EDF3');
  termLog('Farm: '+esc(selectedFarm?selectedFarm.name:'None selected'), '#E6EDF3');
  termLog('Field: '+esc(selectedField?selectedField.name:'None selected'), '#E6EDF3');
  termLog('Truck: '+esc(selectedTruck?selectedTruck.name:'None selected'), '#E6EDF3');

  // GPS
  termLog('────── GPS ──────', '#6E7681');
  if(lastGPSLat){
    termLog('Status: <span style="color:#7EE787;">ACTIVE</span>');
    termLog('Position: '+lastGPSLat.toFixed(6)+', '+lastGPSLng.toFixed(6), '#E6EDF3');
    termLog('Accuracy: ±'+(lastGPSAccuracy||'?')+'m', '#E6EDF3');
  } else {
    termLog('Status: <span style="color:#F85149;">NO FIX</span>');
  }

  // Data
  termLog('────── Data ──────', '#6E7681');
  var logs  = getLogs();
  var queue = getQueue();
  termLog('Total logs: '+logs.length, '#E6EDF3');
  termLog('Pending sync: '+(queue.length>0?'<span style="color:#F0B429;">'+queue.length+' records</span>':'<span style="color:#7EE787;">All synced</span>'));
  termLog('Farms: '+getFarms().length+' | Fields: '+getFields().length+' | Trucks: '+getTrucks().length, '#E6EDF3');

  // Settings
  termLog('────── Settings ──────', '#6E7681');
  var units = getUnits();
  termLog('Units: weight='+units.weight+' area='+units.area, '#E6EDF3');
  termLog('Device Role: '+getDeviceRole(), '#E6EDF3');
  termLog('Auto-detect trigger: '+auDropKg+' kg', '#E6EDF3');

  // Weight Device Info — read from the DOM elements populated by updateDeviceInfo()
  var devModel       = (document.getElementById('dev-model')      ||{}).textContent||'N/A';
  var devSerial      = (document.getElementById('dev-serial')     ||{}).textContent||'N/A';
  var devFirmware    = (document.getElementById('dev-firmware')   ||{}).textContent||'N/A';
  var devBattery     = (document.getElementById('dev-battery')    ||{}).textContent||'N/A';
  var devExtPower    = (document.getElementById('dev-ext-power')  ||{}).textContent||'N/A';
  var devSensitivity = (document.getElementById('dev-sensitivity')||{}).textContent||'N/A';
  var devCapacity    = (document.getElementById('dev-capacity')   ||{}).textContent||'N/A';
  var devCalibration = (document.getElementById('dev-calibration')||{}).textContent||'N/A';

  termLog('────── Weight Device ──────', '#6E7681');
  if(btDevice){
    termLog('Model: '+devModel, '#E6EDF3');
    termLog('Serial Number: '+devSerial, '#E6EDF3');
    termLog('Firmware: '+devFirmware, '#E6EDF3');
    termLog('Internal Battery: '+devBattery, '#E6EDF3');
    termLog('External Power: '+devExtPower, '#E6EDF3');
    termLog('Sensitivity: '+devSensitivity, '#E6EDF3');
    termLog('Rated Capacity: '+devCapacity, '#E6EDF3');
    termLog('Calibration: '+devCalibration, '#E6EDF3');
  } else {
    termLog('No device connected — device info unavailable', '#F85149');
  }

  termLog('────── Scale Readings ──────', '#6E7681');
  termLog('Raw weight: '+(rawWeight!==null?rawWeight.toFixed(3)+' kg':'No reading'), '#E6EDF3');
  termLog('Tare offset: '+tareOffset.toFixed(3)+' kg', '#E6EDF3');
  termLog('Net weight: '+(rawWeight!==null?Math.max(0,rawWeight-tareOffset).toFixed(3)+' kg':'No reading'), '#E6EDF3');

  // Recent Events — a rolling history (disconnects, sync failures, GPS loss,
  // unrecognized-scale blocks, uncaught JS errors), separate from the state
  // snapshot above. This is what shows something went wrong earlier, not
  // just what's true right now.
  termLog('────── Recent Events ──────', '#6E7681');
  var _evLog = getEventLog();
  var _evRecent = _evLog.slice(-20).reverse();
  var _evColors = {error:'#F85149', scale:'#F0B429', sync:'#F0B429', gps:'#F0B429', auth:'#F85149'};
  if(!_evRecent.length){
    termLog('No events recorded', '#6E7681');
  } else {
    _evRecent.forEach(function(ev){
      termLog('['+ev.category.toUpperCase()+'] '+esc(ev.msg)+' <span style="color:#6E7681;">— '+new Date(ev.ts).toLocaleString()+'</span>', _evColors[ev.category]||'#E6EDF3');
    });
  }

  termLog('────── End of Report ──────', '#6E7681');
  termLog('<span style="color:#58A6FF;">Diagnostics complete ✓</span>');

  // Build plain-text version for email — includes all device info
  _lastDiagReport = [
    '═══════════════════════════════════',
    '   Virtus Diagnostics Report',
    '═══════════════════════════════════',
    'Generated: '+new Date().toLocaleString(),
    'App Version: '+APP_VERSION,
    '',
    '── CONNECTED DEVICE ──',
    'Status: '+(btDevice?'Connected — '+btDevice.name:'Not connected'),
    'Model: '+devModel,
    'Serial Number: '+devSerial,
    'Firmware Version: '+devFirmware,
    'Internal Battery: '+devBattery,
    'External Power: '+devExtPower,
    'Sensitivity: '+devSensitivity,
    'Rated Capacity: '+devCapacity,
    'Calibration: '+devCalibration,
    '',
    '── SCALE READINGS ──',
    'Raw Weight: '+(rawWeight!==null?rawWeight.toFixed(3)+' kg':'No reading'),
    'Tare Offset: '+tareOffset.toFixed(3)+' kg',
    'Net Weight: '+(rawWeight!==null?Math.max(0,rawWeight-tareOffset).toFixed(3)+' kg':'No reading'),
    '',
    '── SESSION ──',
    'Worker: '+(currentWorker?currentWorker.name:'Not logged in'),
    'Farm: '+(selectedFarm?selectedFarm.name:'None'),
    'Field: '+(selectedField?selectedField.name:'None'),
    'Truck: '+(selectedTruck?selectedTruck.name:'None'),
    '',
    '── GPS ──',
    'Status: '+(lastGPSLat?'Active':'No fix'),
    'Position: '+(lastGPSLat?lastGPSLat.toFixed(6)+', '+lastGPSLng.toFixed(6):'—'),
    'Accuracy: '+(lastGPSAccuracy?'±'+lastGPSAccuracy+'m':'—'),
    '',
    '── DATA ──',
    'Total Logs: '+getLogs().length,
    'Pending Sync: '+getQueue().length,
    'Farms: '+getFarms().length,
    'Fields: '+getFields().length,
    'Trucks: '+getTrucks().length,
    '',
    '── SETTINGS ──',
    'Weight Unit: '+getUnits().weight,
    'Area Unit: '+getUnits().area,
    'Device Role: '+getDeviceRole(),
    'Auto-Detect Trigger: '+auDropKg+' kg',
    '',
    '── RECENT EVENTS ──',
  ].concat(
    (function(){
      var ev = getEventLog().slice(-20).reverse();
      if(!ev.length) return ['No events recorded'];
      return ev.map(function(e){ return '['+e.category.toUpperCase()+'] '+e.msg+' — '+new Date(e.ts).toLocaleString(); });
    })()
  ).concat([
    '═══════════════════════════════════',
  ]).join('\n');

  var el = document.getElementById('diag-status');
  if(el) el.textContent = T('Report ready — tap Send Email to dispatch');
  showToast('Diagnostics complete','success');
}

function sendDiagnosticsEmail(){
  if(!_lastDiagReport){
    runDiagnostics();
  }
  var email = (document.getElementById('diag-email')||{}).value || '';
  if(!email){ showToast('Enter an email address first','warn'); return; }

  var subject = encodeURIComponent('Virtus Diagnostics — '+new Date().toLocaleDateString());
  var body    = encodeURIComponent(_lastDiagReport);
  var mailto  = 'mailto:'+email+'?subject='+subject+'&body='+body;

  // Open mail app with pre-filled report
  window.location.href = mailto;

  var el = document.getElementById('diag-status');
  if(el) el.textContent = 'Mail app opened — sent at '+new Date().toLocaleTimeString();
  termLog('Email dispatched to '+esc(email), '#58A6FF');
}

// Legacy alias
function sendDiagnostics(){ runDiagnostics(); }




// ══ CALIBRATION ══
var _calFactor = 1.0; // active calibration factor

function calCopyFromScale(){
  if(rawWeight === null){ showToast('No live weight reading','warn'); return; }
  var net = Math.max(0, rawWeight - tareOffset);
  document.getElementById('cal-scale-reading').value = net.toFixed(3);
  showToast('Live weight copied','success');
}

// ── Help texts for the ⓘ icons ──
var _INFO_TEXTS = {
  sens: {title:'Sensitivity (mV/V)',
    msg:'How much signal the load cells produce at full rated load, per volt of excitation. It is printed on the load cell datasheet — 2.0 mV/V is the most common. All cells in one scale should match. Changing this rescales the raw reading, so recalibrate with a known weight afterwards.'},
  cap: {title:'Rated Capacity',
    msg:'The combined rated capacity of ALL load cells, in kg. Example: 4 cells of 5000 kg each = 20000. This sets the scale\'s expected full range. Changing it rescales the raw reading, so recalibrate with a known weight afterwards.'},
  certified: {title:'Certified Weight',
    msg:'The true weight of your test load — from a certified scale ticket or known test weights. Used together with the Scale Reading to calculate the calibration factor.'},
  reading: {title:'Scale Reading',
    msg:'What this scale shows for that same test load, before correction. Use the copy button to fill it from the live reading while the load is on the scale.'},
  zero: {title:'Zero Scale',
    msg:'Sets the scale\'s permanent zero point, stored on the device and kept after power-off. Use it when the scale is empty and reads something other than zero.\n\nFor a temporary zero — such as subtracting a container or an already-loaded truck — use Tare on the Weight Display instead.'},
  factor: {title:'Calibration Factor',
    msg:'The correction multiplier stored inside the scale: displayed weight = raw reading × factor. It is calculated from Certified Weight ÷ Scale Reading, or you can type one directly. It is saved in the scale\'s own memory and survives power-off.'},
  weight: {title:'Weight Unit',
    msg:'The unit used to display and record weights throughout the app — kilograms, pounds, or bushels. Changing it reformats every reading and log entry.'},
  area: {title:'Area Unit',
    msg:'The unit used for field sizes and yield calculations — hectares or acres. Affects the per-area figures shown on fields and farms.'},
  language: {title:'Language',
    msg:'The display language for the app interface. Your data is unaffected.'},
  fieldcrop: {title:'Field Crop',
    msg:'Each field can have a crop assigned to it, which is what the app expects loads from that field to be.\n\nTo change it: go to the Fields tab, tap the field, tap Edit, and set Primary Crop. Saving there updates the field itself, so future loads stop asking.\n\nChanging the crop on a load only affects that load — it does not change what the field is assigned to.'},
  droptrigger: {title:'Drop Trigger',
    msg:'How much weight must come off the mixer before an unload is auto-detected. Lower catches smaller dumps but is more sensitive to bounce; higher is steadier. Set to 0 to turn auto-unload off.'},
  idletimeout: {title:'Scale Power Saving',
    msg:'After the screen sits idle this long, the app tells the connected scale to enter a low-power mode to save the module battery. Any tap wakes it again. Set to Off to keep the scale fully active.'},
  cleardata: {title:'Clear Local Transactions',
    msg:'Wipes the load records stored on this device. Your farms, fields, trucks, destinations, operators and seasons are NOT removed, and records already synced to the cloud are not affected.\n\nTo remove data from the cloud as well, use Clear Cloud Data.'},
  clearcloud: {title:'Clear Cloud Data',
    msg:'Deletes your account\'s data from the cloud database, affecting every device signed into this account. You can choose to remove just transaction records, or everything — farms, fields, trucks, destinations, operators, crops, boundaries, and grain mixers. This cannot be undone.'},
  rounding: {title:'Display Rounding',
    msg:'How closely the big weight number tracks the scale. The scale itself reports full 1 kg precision — this only smooths what\'s shown, so the display doesn\'t flicker on a bouncy load. Saved transaction weights are unaffected.'}
};
function showInfoDialog(key){
  var t = _INFO_TEXTS[key]; if(!t) return;
  showConfirm({icon:'ℹ️', title:T(t.title), msg:T(t.msg), okLabel:T('Close'), okColor:'#D4930A', singleButton:true});
}

// ── Edit sensitivity / capacity from Device Info (firmware-backed) ──
function editSensitivity(){
  if(!_psScaleConnected()){ showToast('Connect to the scale first','warn'); return; }
  var cur = ((document.getElementById('dev-sensitivity')||{}).textContent||'').replace(' mV/V','');
  var v = prompt('Load cell sensitivity (mV/V):', (cur && cur !== 'N/A') ? cur : '2.0');
  if(v === null) return;
  var f = parseFloat(v);
  if(isNaN(f) || f < 0.1 || f > 10){ showToast('Enter a value between 0.1 and 10 mV/V','error'); return; }
  sendBleCommand('SENS:'+f);
  var el = document.getElementById('dev-sensitivity');
  if(el) el.textContent = f.toFixed(2) + ' mV/V';
  showToast('Sensitivity set — recalibrate with a known weight','success');
}
function editCapacity(){
  if(!_psScaleConnected()){ showToast('Connect to the scale first','warn'); return; }
  var cur = ((document.getElementById('dev-capacity')||{}).textContent||'').replace(' kg','');
  var v = prompt('Total rated capacity of all load cells (kg):', (cur && cur !== 'N/A') ? cur : '1000');
  if(v === null) return;
  var f = parseFloat(v);
  if(isNaN(f) || f < 1 || f > 200000){ showToast('Enter a capacity between 1 and 200000 kg','error'); return; }
  sendBleCommand('CAP:'+f);
  var el = document.getElementById('dev-capacity');
  if(el) el.textContent = Math.round(f) + ' kg';
  showToast('Capacity set — recalibrate with a known weight','success');
}

function calculateCalibration(){
  var certified = parseFloat(document.getElementById('cal-certified').value);
  var scaleRead  = parseFloat(document.getElementById('cal-scale-reading').value);

  if(!certified || certified <= 0){ showToast('Enter the certified (true) weight','warn'); return; }
  if(!scaleRead  || scaleRead  <= 0){ showToast('Enter what the scale is reading','warn'); return; }

  // ratio = how far off the CURRENT (already-calibrated) reading is.
  // The firmware's factor must be COMPOUNDED, not replaced — otherwise
  // every recalibration would wipe out the previous one.
  var ratio = certified / scaleRead;
  _calFactor = parseFloat((_calFactor * ratio).toFixed(4));
  sendBleCommand('CAL:'+_calFactor.toFixed(4));
  if(rawWeight !== null) _paintScaleDisplay();

  var devCal = document.getElementById('dev-calibration');
  if(devCal) devCal.textContent = _calFactor.toFixed(4);
  // Also the row in the Báscula panel, which is where this is read day to day.
  var disp = document.getElementById('cal-factor-display');
  if(disp) disp.textContent = _calFactor.toFixed(4);
  // And the editable box. Calculate already pushed CAL: to the firmware, so the
  // factor IS live — but the input showed the old value, which made it look as
  // though nothing happened. Sync it, then let onCalFactorInput settle the
  // Apply button (it correctly stays disabled: input now equals _calFactor).
  var direct = document.getElementById('cal-factor-direct-input');
  if(direct){ direct.value = _calFactor.toFixed(4); onCalFactorInput(direct); }

  var note = document.getElementById('cal-result-note');
  if(note){
    if(Math.abs(ratio - 1.0) < 0.001){
      note.textContent = T('Scale is perfectly calibrated ✓');
    } else if(ratio > 1.0){
      note.textContent = T('Scale reads LOW by')+' '+(((ratio-1)*100).toFixed(2))+'%';
    } else {
      note.textContent = T('Scale reads HIGH by')+' '+((((1-ratio))*100).toFixed(2))+'%';
    }
  }
  showToast('Factor: '+_calFactor,'success');
}

function saveCalibrationSettings(){
  closeCalibrationSheet();
  // Sync factor to the compact display
  var sheetFactor = (document.getElementById('cal-factor-display-sheet')||{}).textContent;
  var compactFactor = document.getElementById('dev-calibration');
  if(compactFactor && sheetFactor && sheetFactor !== '—') compactFactor.textContent = sheetFactor;
  // Sensitivity / capacity now live in Device Info, reported by the
  // firmware (INFO packet) — the sheet only handles the weight factor.
  localStorage.setItem('vf_cal_factor', _calFactor);

  if(rawWeight !== null) _paintScaleDisplay();
  showToast('Calibration settings saved','success');
}

function loadCalibrationSettings(){
  var factor = localStorage.getItem('vf_cal_factor');
  var sens   = localStorage.getItem('vf_cal_sensitivity');
  var cap    = localStorage.getItem('vf_cal_rated_cap');
  if(factor){
    _calFactor = parseFloat(factor);
    var el = document.getElementById('dev-calibration');
    if(el) el.textContent = _calFactor.toFixed(4);
    var di = document.getElementById('cal-factor-direct-input');
    if(di) di.value = _calFactor.toFixed(4);
  }
  // sens/cap now come from the firmware INFO packet, not localStorage
}



// ══ CALIBRATION ══
var LS_CAL = 'vf_calibration';

function onCalFactorInput(input){
  var val = parseFloat(input.value);
  var btn = document.getElementById('cal-apply-btn');
  if(!btn) return;
  // Round both to 4dp before comparing to avoid float precision issues
  var isDifferent = !isNaN(val) && val > 0 && parseFloat(val.toFixed(4)) !== parseFloat(_calFactor.toFixed(4));
  btn.disabled = !isDifferent;
  btn.style.background    = isDifferent ? '#2D9D5C' : 'var(--surface2)';
  btn.style.color         = isDifferent ? '#fff'    : 'var(--text3)';
  btn.style.borderColor   = isDifferent ? '#2D9D5C' : 'var(--border)';
  btn.style.cursor        = isDifferent ? 'pointer' : 'not-allowed';
}

function applyCalFactorDirect(){
  var input = document.getElementById('cal-factor-direct-input');
  if(!input) return;
  var val = parseFloat(input.value);
  if(isNaN(val) || val <= 0){ showToast('Enter a valid factor (e.g. 1.025)','error'); return; }
  _calFactor = parseFloat(val.toFixed(4));
  localStorage.setItem('vf_cal_factor', _calFactor);
  // Firmware owns calibration — push the new factor to the scale now
  sendBleCommand('CAL:'+_calFactor.toFixed(4));
  var devCal = document.getElementById('dev-calibration');
  if(devCal) devCal.textContent = _calFactor.toFixed(4);
  if(rawWeight !== null) setRawWeight(rawWeight);
  // Reset apply button to inactive
  var btn = document.getElementById('cal-apply-btn');
  if(btn){ btn.disabled=true; btn.style.background='var(--surface2)'; btn.style.color='var(--text3)'; btn.style.borderColor='var(--border)'; btn.style.cursor='not-allowed'; }
  showToast('Calibration factor set to '+_calFactor.toFixed(4),'success');
}

function calLoadSaved(){
  var saved = JSON.parse(localStorage.getItem(LS_CAL)||'{}');
  if(saved.sensitivity)   (document.getElementById('cal-sensitivity')||{}).value   = saved.sensitivity;
  if(saved.ratedCapacity) (document.getElementById('cal-rated-capacity')||{}).value = saved.ratedCapacity;
  if(saved.factor){
    (document.getElementById('cal-factor-display')||{}).textContent = saved.factor.toFixed(4);
    (document.getElementById('cal-factor-note')||{}).textContent    = 'Saved calibration factor';
  }
}

function calCalculate(){
  var certified = parseFloat((document.getElementById('cal-certified')||{}).value)||0;
  var reading   = parseFloat((document.getElementById('cal-scale-reading')||{}).value)||0;

  if(!certified || !reading){
    showToast('Enter both Certified Reading and Scale Reading','warn');
    return;
  }
  if(reading === 0){ showToast('Scale reading cannot be zero','error'); return; }

  // Calibration factor = certified (known weight) / what scale shows
  var factor = certified / reading;

  var dispEl = document.getElementById('cal-factor-display');
  var noteEl = document.getElementById('cal-factor-note');
  if(dispEl) dispEl.textContent = factor.toFixed(4);
  // Also update the visible box in the sheet
  var sfEl = document.getElementById('cal-factor-display-sheet'); if(sfEl) sfEl.textContent = factor.toFixed(4);
  var noteMsg = Math.abs(factor-1)<0.001 ? T('Scale is perfectly calibrated ✓') : (factor>1 ? T('Scale reads LOW by')+' '+(((factor-1)*100).toFixed(2))+'%' : T('Scale reads HIGH by')+' '+((((1/factor)-1)*100).toFixed(2))+'%');
  if(noteEl) noteEl.textContent = noteMsg;
  var rn = document.getElementById('cal-result-note'); if(rn) rn.textContent = noteMsg;

  // Store factor hidden field for diagnostics
  var hidEl = document.getElementById('dev-calibration');
  if(hidEl) hidEl.value = factor.toFixed(4);

  showToast('Calibration factor: '+factor.toFixed(4),'success');
}

function calCopyFromTruck(){
  // Pre-fill Scale Reading with current raw weight
  if(rawWeight === null || rawWeight <= 0){
    showToast('No weight on scale to copy','warn');
    return;
  }
  var el = document.getElementById('cal-scale-reading');
  if(el){
    el.value = rawWeight.toFixed(2);
    showToast('Scale reading copied: '+rawWeight.toFixed(2)+' kg','success');
  }
}

function calSaveSettings(){
  var sensitivity   = parseFloat((document.getElementById('cal-sensitivity')||{}).value)||0;
  var ratedCapacity = parseFloat((document.getElementById('cal-rated-capacity')||{}).value)||0;
  var factorTxt     = ((document.getElementById('cal-factor-display')||{}).textContent||'').replace('—','');
  var factor        = parseFloat(factorTxt)||1;

  var saved = {sensitivity:sensitivity, ratedCapacity:ratedCapacity, factor:factor};
  localStorage.setItem(LS_CAL, JSON.stringify(saved));

  // Push to device info display
  updateDeviceInfo({
    model:       (document.getElementById('dev-model')||{}).textContent||'N/A',
    serial:      (document.getElementById('dev-serial')||{}).textContent||'N/A',
    firmware:    (document.getElementById('dev-firmware')||{}).textContent||'N/A',
    battery:     (document.getElementById('dev-battery')||{}).textContent||'N/A',
    extPower:    (document.getElementById('dev-ext-power')||{}).textContent||'N/A',
    sensitivity: sensitivity ? sensitivity+' mV/V' : 'N/A',
    capacity:    ratedCapacity ? ratedCapacity+' '+wtUnit() : 'N/A',
    calibration: factor ? factor.toFixed(4) : 'N/A',
  });

  // Send to ESP32 via BLE if connected
  if(_psScaleConnected()){
    sendBleCommand('CAL:'+factor.toFixed(4));
    sendBleCommand('SENS:'+sensitivity);
    sendBleCommand('CAP:'+ratedCapacity);
  }

  showToast('Calibration settings saved','success');
}

function calRestoreDevice(){
  showConfirm({
    title:T('Restore Device?'),
    msg:T('Reset all calibration settings to factory defaults. This cannot be undone.'),
    okLabel:T('Restore'),
    okColor:'#B03020'
  }).then(function(ok){
    if(!ok) return;
    localStorage.removeItem(LS_CAL);
    ['cal-sensitivity','cal-rated-capacity','cal-certified','cal-scale-reading'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.value = '';
    });
    var df = document.getElementById('cal-factor-display'); if(df) df.textContent='—';
    var dn = document.getElementById('cal-factor-note'); if(dn) dn.textContent='Enter readings and tap Calculate';
    if(_psScaleConnected()) sendBleCommand('RESTORE');
    showToast('Device restored to defaults','warn');
  });
}

function calUpdateFirmware(){
  showToast('Connect to your firmware update tool to update firmware','warn');
  if(_psScaleConnected()) sendBleCommand('FIRMWARE');
}

// Sync firmware/battery from dev-firmware and dev-battery to cal panel mirrors
function syncCalDeviceInfo(){
  var fw  = (document.getElementById('dev-firmware')||{}).textContent;
  var bat = (document.getElementById('dev-battery') ||{}).textContent;
  var fw2  = document.getElementById('dev-firmware-2'); if(fw2)  fw2.textContent  = fw  || 'N/A';
  var bat2 = document.getElementById('dev-battery-2');  if(bat2) bat2.textContent = bat || 'N/A';
}




// Set a label's text via T() while preserving its trailing ⓘ info-icon —
// rebuilding the label from innerHTML would drop the icon's onclick handler.
function _setLabelKeepIcon(id, key){
  var lbl = document.getElementById(id); if(!lbl) return;
  var icon = lbl.querySelector('.info-ico');
  lbl.textContent = T(key);
  if(icon){ lbl.appendChild(document.createTextNode(' ')); lbl.appendChild(icon); }
}

function openCalibrationSheet(){
  // This whole sheet's static labels were never wired into any translation
  // pass, so they stayed in English regardless of language — set them here,
  // same as the sheet title already did.
  document.getElementById('cal-sheet-title').textContent = T('Calibration Tool');
  _setLabelKeepIcon('cal-lbl-certified', 'Certified Weight');
  _setLabelKeepIcon('cal-lbl-reading', 'Scale Reading');
  _setLabelKeepIcon('cal-lbl-factor', 'Calibration Factor');
  document.getElementById('cal-calc-btn').textContent = T('Calculate Calibration Factor');
  var applyBtn = document.getElementById('cal-apply-btn');
  if(applyBtn) applyBtn.textContent = T('Apply');
  var note = document.getElementById('cal-result-note');
  if(note) note.textContent = T('Edit below to override');
  updateCalCapUnit(); // sync rated capacity unit label
  // Pre-fill direct input with current factor and force button to gray
  var di = document.getElementById('cal-factor-direct-input');
  if(di){ di.value = _calFactor.toFixed(4); }
  // Always reset button to gray when sheet opens
  var btn = document.getElementById('cal-apply-btn');
  if(btn){
    btn.disabled = true;
    btn.style.background  = 'var(--surface2)';
    btn.style.color       = 'var(--text3)';
    btn.style.borderColor = 'var(--border)';
    btn.style.cursor      = 'not-allowed';
  }
  // Load saved values into sheet inputs
  var s = localStorage.getItem('vf_cal');
  if(s){ try{ var c=JSON.parse(s);
    var si=document.getElementById('cal-sensitivity'); if(si&&c.sensitivity) si.value=c.sensitivity;
    var rc=document.getElementById('cal-rated-capacity'); if(rc&&c.ratedCapacity) rc.value=c.ratedCapacity;
  }catch(e){} }
  // Show current factor
  var curFactor = (document.getElementById('dev-calibration')||{}).textContent||'—';
  var sf = document.getElementById('cal-factor-display-sheet');
  if(sf) sf.textContent = curFactor;
  document.getElementById('cal-sheet-overlay').classList.add('open');
}

function closeCalibrationSheet(){
  document.getElementById('cal-sheet-overlay').classList.remove('open');
}


// ══ OPERATORS ══
