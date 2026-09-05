function updateNetPill(){
  var pill=document.getElementById('pill-net'),txt=document.getElementById('pill-net-txt');
  pill.className='status-pill '+(isOnline?'pill-online':'pill-offline');
  txt.textContent=isOnline?T('Online'):T('Offline');
  updateSyncStatus();
}

// ══ BLE UART CONSTANTS (Nordic UART Service — ESP32 + HX711) ══
// ══════════════════════════════════════════════════════════════
// BLE LOAD CELL — ESP32 + HX711 (Nordic UART Service / BLE UART)
// ══════════════════════════════════════════════════════════════

// Nordic UART Service UUIDs (standard for ESP32 BLE serial)
var BLE_UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
var BLE_UART_TX      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // ESP32 → iPad (notifications)
var BLE_UART_RX      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // iPad → ESP32 (write, for TARE)

var btRxChar  = null;   // RX char for sending commands back to ESP32
var bleBuffer = '';     // accumulates partial BLE packets between notifications

// ── OTA Firmware Update ──
// Point these to your GitHub repo's raw files:
//   version.json: { "version": "2.1.0" }
//   firmware.bin: compiled .bin from Arduino IDE (Sketch → Export Compiled Binary)
var OTA_VERSION_URL  = 'https://raw.githubusercontent.com/jasonfriesen5/Virtus-Farmware/main/version.json';
var OTA_FIRMWARE_URL = 'https://raw.githubusercontent.com/jasonfriesen5/Virtus-Farmware/main/virtus_scale.bin';
var _otaInProgress   = false;
var _otaJustCompleted = false;   // true from OTA_OK until reconnect succeeds
var _otaVerifyTimeout = null;    // timer waiting for OTA_OK after last chunk
var _otaReconnectDevice = null;  // device reference to reconnect to after restart
var _otaReconnectAttempts = 0;
var _otaDownloadPhase = false;   // true during app-side GitHub fetch (before OTA_BEGIN sent)

// Try to reconnect to the ESP32 after it restarts post-OTA
function _scheduleOtaReconnect(delayMs){
  if(!_otaReconnectDevice && btDevice) _otaReconnectDevice = btDevice;
  _otaReconnectAttempts = 0;
  var sub = document.getElementById('dev-update-sub');
  if(sub){ sub.textContent='Waiting for scale to restart…'; sub.style.color='var(--text3)'; }
  setTimeout(_tryOtaReconnect, delayMs || 6000);
}
async function _tryOtaReconnect(){
  var sub = document.getElementById('dev-update-sub');
  _otaReconnectAttempts++;
  if(_otaReconnectAttempts > 8){
    if(sub){ sub.textContent='Update installed — please reconnect scale'; sub.style.color='var(--text3)'; }
    _otaJustCompleted = false;
    _otaReconnectDevice = null;
    showToast('Firmware installed — please reconnect scale','success');
    return;
  }
  if(sub){ sub.textContent='Reconnecting… ('+_otaReconnectAttempts+'/8)'; }
  try{
    var dev = _otaReconnectDevice;
    if(!dev){ throw new Error('no device ref'); }
    // Re-use connectRealDevice which wires up notifications and handlers
    await connectRealDevice(dev);
    if(btDevice){
      if(sub){ sub.textContent='✓ Update complete — reconnected'; sub.style.color='#2D9D5C'; }
      showToast('Scale reconnected with new firmware','success');
      _otaJustCompleted = false;
      _otaReconnectDevice = null;
      return;
    }
    throw new Error('reconnect returned but no btDevice');
  } catch(e){
    // Wait a bit more, then retry
    setTimeout(_tryOtaReconnect, 2500);
  }
}

// ── Parse weight string from ESP32 ──
// Accepts any of: "23.45", "23.45\n", "WT:23.45", "W=23.45 kg", "WEIGHT:23.45"
function parseWeightLine(line){
  line = line.trim();
  if(!line) return null;
  // Strip leading label characters (letters, spaces, colons, equals signs)
  var cleaned = line.replace(/^[A-Za-z_ =:]+/, '').replace(/[^0-9.\-]/g, '');
  var val = parseFloat(cleaned);
  if(isNaN(val) || val < 0 || val > 999999) return null;
  return parseFloat(val.toFixed(3));
}

// ── Called on every BLE notification from ESP32 ──
// ESP32 sends weight as plain text e.g. "1234.56\n"
function handleBleData(event){
  try{
    var chunk = new TextDecoder('utf-8').decode(event.target.value);
    bleBuffer += chunk;
    // safety: a lost newline must never clog the stream forever
    if(bleBuffer.length > 500) bleBuffer = bleBuffer.slice(-120);
    var lines = bleBuffer.split(/\r?\n/);
    bleBuffer = lines.pop(); // keep incomplete last fragment
    lines.forEach(function(line){
      line = line.trim();
      if(!line) return;

      // ── INFO packet: INFO:firmware=1.0.2,model=VirtusScale,serial=A1B2C3 ──
      if(line.startsWith('INFO:')){
        var parts = {};
        line.substring(5).split(',').forEach(function(pair){
          var kv = pair.split('=');
          if(kv.length===2) parts[kv[0].trim()] = kv[1].trim();
        });
        updateDeviceInfo({
          firmware: parts.firmware || 'N/A',
          model:    parts.model    || 'VirtusScale',
          serial:   parts.serial   || 'N/A'
        });
        // Sync calibration state FROM the firmware (single source of truth)
        if(parts.cal){
          var fwCal = parseFloat(parts.cal);
          if(!isNaN(fwCal) && fwCal > 0){
            _calFactor = fwCal;
            var dc = document.getElementById('dev-calibration');
            if(dc) dc.textContent = _calFactor.toFixed(4);
          }
        }
        if(parts.sens){
          var se = document.getElementById('dev-sensitivity');
          if(se) se.textContent = parts.sens + ' mV/V';
        }
        if(parts.cap){
          var ce = document.getElementById('dev-capacity');
          if(ce) ce.textContent = parts.cap + ' kg';
        }
        return;
      }

      // ── ROLE assignment from the scale (single-primary arbitration) ──
      // The scale decides who logs: first device connected = primary, others
      // = view-only remote. This is authoritative — the app obeys it so two
      // phones can't both save the same unload.
      if(line.startsWith('ROLE:')){
        var _role = line.substring(5).trim().toLowerCase();
        _applyBleRole(_role === 'primary' ? 'primary' : 'remote');
        return;
      }

      // ── Auth challenge response: AUTHR:<nonceHex>:<sigHex> ──
      if(line.startsWith('AUTHR:')){
        var _ar = line.substring(6);
        var _ci = _ar.indexOf(':');
        if(_ci > 0) _handleAuthResponse(_ar.substring(0,_ci), _ar.substring(_ci+1).trim());
        return;
      }

      // ── STATUS packet: STATUS:batt=87,batt_v=3.92,ext_v=12.4,charging=1 ──
      if(line.startsWith('STATUS:')){
        var sp = {};
        line.substring(7).split(',').forEach(function(pair){
          var kv = pair.split('=');
          if(kv.length===2) sp[kv[0].trim()] = kv[1].trim();
        });
        // Battery
        var battPct = sp.batt ? sp.batt+'%' : 'N/A';
        var battV   = sp.batt_v ? ' ('+sp.batt_v+'V)' : '';
        var battEl  = document.getElementById('dev-battery');
        if(battEl) battEl.textContent = battPct + battV;
        // External voltage
        var extV  = sp.ext_v  ? sp.ext_v+'V' : 'N/A';
        var chrg  = sp.charging === '1' ? ' — Charging' : '';
        var extEl = document.getElementById('dev-ext-power');
        if(extEl) extEl.textContent = extV + chrg;
        // Update battery icon color in device list
        _updateBatteryIndicator(parseInt(sp.batt||0));
        return;
      }

      // ── OTA messages ──
      if(line.startsWith('OTA_') || line.startsWith('INFO:')){
        // Let INFO fall through to be parsed below, handle OTA separately
        if(!line.startsWith('INFO:')){ handleOtaResponse(line); return; }
      }

      // ── Combined weight packet: P:1200,L:3400,S:1,U:0 ──
      if(line.startsWith('P:')){
        var parts2 = {};
        line.split(',').forEach(function(pair){
          var kv = pair.split(':');
          if(kv.length===2) parts2[kv[0]] = kv[1];
        });
        if(parts2.P !== undefined){
          var fw = parseFloat(parts2.P);
          // Use firmware stable flag directly — firmware has hardware-level stability detection
          var fwStable = parts2.S === '1';
          setRawWeightWithStable(fw, fwStable);
        }
        return;
      }

      // ── Plain numeric weight (legacy format) ──
      // Only lines that are purely a number (optionally with a unit)
      // count as weight — diagnostic text like "SCAN: device at 0x2a"
      // must never be mistaken for a reading.
      if(/^[-+]?\d+(\.\d+)?\s*(kg|lbs?)?$/i.test(line)){
        var w = parseWeightLine(line);
        if(w !== null) setRawWeight(w);
      }
    });
  } catch(e){ console.warn('BLE data error:', e); }
}

function _updateBatteryIndicator(pct){
  var el = document.getElementById('dev-battery-icon');
  if(!el) return;
  el.style.color = pct > 50 ? '#2D9D5C' : pct > 20 ? '#D4930A' : '#B03020';
  el.style.fontWeight = '700';
  // Below 20% the label becomes an instruction rather than a severity word —
  // "Please Charge" tells the operator what to do; "Critical" only worried them.
  el.textContent = pct > 50 ? T('Good') : pct > 20 ? T('Low') : T('Please Charge');
  el.dataset.batteryPct = pct;
}

function handleOtaResponse(msg){
  var sub = document.getElementById('dev-update-sub');
  var btn = document.getElementById('btn-fw-check');

  if(msg.startsWith('OTA_AVAILABLE:')){
    var newVer = msg.split(':')[1];
    if(sub){ sub.style.display=''; sub.textContent='v'+newVer+' available'; }
    if(btn){ btn.style.display=''; btn.textContent='Update'; }
    showToast('Firmware update available: v'+newVer,'success');
  } else if(msg === 'OTA_UP_TO_DATE'){
    if(sub){ sub.style.display=''; sub.textContent=T('Up to date'); sub.style.color='var(--text3)'; }
    if(btn) btn.style.display='none';
  } else if(msg === 'OTA_STARTING'){
    if(btn){ btn.textContent='Installing…'; btn.disabled=true; }
    showToast('Downloading firmware…','');
  } else if(msg.startsWith('OTA_PROGRESS:')){
    var pct = msg.split(':')[1];
    if(btn) btn.textContent = pct+'%';
    if(sub){ sub.textContent='Installing… '+pct+'%'; sub.style.color='#2D9D5C'; }
  } else if(msg === 'OTA_VERIFY'){
    if(sub){ sub.textContent='Verifying firmware…'; sub.style.color='var(--text3)'; }
    // Reset the OTA_OK/reconnect safety timer — give Update.end() a fresh 20s
    // window from verify start. If firmware is valid, OTA_OK arrives fast; if
    // the BLE stack dies mid-finalize, the timeout triggers reconnect anyway.
    if(_otaVerifyTimeout) clearTimeout(_otaVerifyTimeout);
    _otaVerifyTimeout = setTimeout(function(){
      if(_otaInProgress){
        _otaInProgress = false;
        _otaJustCompleted = true;
        var sub2 = document.getElementById('dev-update-sub');
        if(sub2){ sub2.textContent='✓ Update installed — restarting…'; sub2.style.color='#2D9D5C'; }
        showToast('Firmware installed — reconnecting…','success');
        _scheduleOtaReconnect(2000);
      }
    }, 20000);
  } else if(msg === 'OTA_OK'){
    _otaInProgress = false;
    _otaJustCompleted = true;
    if(_otaVerifyTimeout){ clearTimeout(_otaVerifyTimeout); _otaVerifyTimeout = null; }
    if(sub){ sub.textContent='✓ Update installed — restarting…'; sub.style.color='#2D9D5C'; }
    if(btn) btn.style.display='none';
    showToast('Firmware updated! Scale restarting…','success');
    // Scale will disconnect and restart — try to auto-reconnect after boot (~5s)
    _scheduleOtaReconnect(6000);
  } else if(msg === 'OTA_NO_WIFI'){
    showToast('Scale has no WiFi — add your network to the firmware','warn');
    if(sub){ sub.textContent='No WiFi for update'; sub.style.color='var(--text3)'; }
  } else if(msg.startsWith('OTA_FAIL')){
    // Ignore stale OTA_FAIL messages when no OTA is active (prevents "Download failed" flash)
    if(!_otaInProgress) return;
    // Ignore OTA_FAIL during app-side download phase (ESP32 shouldn't emit OTA messages
    // before we send OTA_BEGIN; any that arrive are stale from a prior session).
    if(_otaDownloadPhase) return;
    _otaInProgress = false;
    if(btn){ btn.textContent='Retry'; btn.disabled=false; btn.onclick=function(){ checkForBLEOTAUpdate(); }; }
    if(sub){ sub.style.color='#B03020'; sub.textContent='Update failed — tap Retry'; }
    showToast('Firmware update failed','error');
  } else if(msg === 'OTA_CHECKING'){
    if(sub){ sub.style.display=''; sub.textContent='Checking for update…'; sub.style.color='var(--text3)'; }
  } else if(msg === 'OTA_NO_UPDATE'){
    showToast('Already on latest firmware','success');
  }
}

// ══ FIRMWARE UPDATE ══
// Checks the published manifest for a newer firmware than the connected scale
// reports, and drives the update. Real flashing happens through a native DFU
// bridge (Capacitor plugin in the iOS app); on the web, browsers can't flash
// over BLE (the DFU service is blocklisted), so we show the file + guidance.
var _FW_MANIFEST_URL = 'https://raw.githubusercontent.com/jasonfriesen5/Virtus-Farmware/main/version.json';
// raw.githubusercontent.com, NOT github.com/.../raw/. The latter answers with a
// 302 whose Access-Control-Allow-Origin is empty, so the WebView blocks it and
// fetch throws a bare "Load failed". Same host version.json already uses.
var _FW_ZIP_BASE     = 'https://raw.githubusercontent.com/jasonfriesen5/Virtus-Farmware/main/';
var _fwLatest = null;

function _cmpVer(a, b){   // >0 if a newer than b
  var pa=(a||'0').split('.').map(Number), pb=(b||'0').split('.').map(Number);
  for(var i=0;i<3;i++){ var d=(pa[i]||0)-(pb[i]||0); if(d) return d; }
  return 0;
}
function _fwCurrentVersion(){
  var t=(document.getElementById('dev-firmware')||{}).textContent||'';
  var m=t.match(/(\d+\.\d+\.\d+)/); return m?m[1]:'';
}
// The firmware button is one control with two roles: it reads Check until a
// newer version is known, then becomes Update. Both the label and the click
// action are set here together so they can't drift apart — the old layout had a
// separate always-present Update button in another row, which invited tapping
// Update before any check had run.
function _setFwButtonMode(mode){
  var b = document.getElementById('btn-fw-check');
  if(!b) return;
  b.style.display = '';
  b.disabled = false;
  if(mode === 'update'){
    b.textContent = T('Update');
    b.dataset.mode = 'update';
    b.removeAttribute('data-en');       // label is state-driven now, not static
  } else {
    b.textContent = T('Check');
    b.dataset.mode = 'check';
    b.setAttribute('data-en','Check');
  }
}
function onFwButtonTap(){
  var b = document.getElementById('btn-fw-check');
  if(b && b.dataset.mode === 'update') startFirmwareUpdate();
  else checkFirmwareUpdate();
}

async function checkFirmwareUpdate(silent){
  var sub=document.getElementById('dev-update-sub');
  var cur=_fwCurrentVersion();
  if(!cur){ if(!silent && sub){ sub.style.display=''; sub.style.color='var(--text3)'; sub.textContent=T('Connect a scale first'); } return; }
  if(sub && !silent){ sub.style.display=''; sub.style.color='var(--text3)'; sub.textContent=T('Checking…'); }
  try{
    var r=await fetch(_FW_MANIFEST_URL+'?t='+Date.now(), {cache:'no-store'});
    _fwLatest=await r.json();
    if(_cmpVer(_fwLatest.version, cur) > 0){
      if(sub){ sub.style.display=''; sub.style.color='#2D9D5C'; sub.textContent=T('Update available:')+' v'+_fwLatest.version; }
      _setFwButtonMode('update');
    } else {
      if(sub){ sub.style.display=''; sub.style.color='var(--text3)'; sub.textContent=T('Up to date')+' (v'+cur+')'; }
      _setFwButtonMode('check');
    }
  }catch(e){
    if(sub && !silent){ sub.style.display=''; sub.style.color='#B03020'; sub.textContent=T('Could not check for updates'); }
    _setFwButtonMode('check');
  }
}
async function startFirmwareUpdate(){
  var zipUrl = _FW_ZIP_BASE + (_fwLatest && _fwLatest.dfu ? _fwLatest.dfu : '');
  var ver    = _fwLatest ? _fwLatest.version : '';

  // Nordic DFU — the *Legacy* protocol, not Secure: the board runs Adafruit's
  // nRF52 bootloader (0.11.0, s140 6.1.1), whose service is 00001530-… and whose
  // packages come from adafruit-nrfutil. NOT the old installBLEOTA path either —
  // that streamed a raw .bin over the UART characteristic, an ESP32-era protocol
  // this firmware rejects outright ("OTA_ERR:use nRF52 DFU, not BLE-UART OTA").
  var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  var dfu = plugins.VirtusDfu || null;
  console.log('[dfu] plugins available:', Object.keys(plugins).join(', '));
  if(dfu && typeof dfu.startDFU !== 'function'){
    console.warn('[dfu] VirtusDfu present but startDFU missing');
    dfu = null;
  }
  if(!plugins.Filesystem){
    showToast('Filesystem plugin missing — cannot stage the update','error');
    logEvent('scale','DFU aborted: Filesystem plugin not registered');
    return;
  }
  if(dfu && btDevice && btDevice.isCapDevice){
    return _runNordicDfu(dfu, zipUrl, ver);
  }
  if(btDevice && !dfu){
    logEvent('scale','DFU unavailable: VirtusDfu not registered (plugins: '+Object.keys(plugins).join(', ')+')');
  }

  showConfirm({
    icon:'⚙️',
    title:T('Firmware v')+ver+' '+T('available'),
    msg: btDevice
      ? T('Firmware updates are not supported on this device yet — use nRF Connect.')
      : T('Connect to your scale first — the update installs straight over Bluetooth.'),
    okLabel:T('Close'), okColor:'#D4930A', singleButton:true
  });
}

// Fetch the signed package into app-private cache. Nordic's library needs a real
// file on disk; nothing lands in the user's Files app.
async function _cacheFirmwareZip(zipUrl, onProgress){
  var res = await fetch(zipUrl + '?t=' + Date.now(), {cache:'no-store'});
  if(!res.ok) throw new Error('Download failed: HTTP ' + res.status);
  var buf = await res.arrayBuffer();

  // Chunked base64 — String.fromCharCode.apply blows the stack on a whole image.
  var bytes = new Uint8Array(buf), bin = '', CH = 0x8000;
  for(var i=0; i<bytes.length; i+=CH){
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i+CH));
  }
  var b64 = btoa(bin);

  var fs = window.Capacitor.Plugins.Filesystem;
  var name = 'virtus-fw-' + Date.now() + '.zip';
  await fs.writeFile({ path: name, data: b64, directory: 'CACHE', recursive: true });
  var uri = await fs.getUri({ path: name, directory: 'CACHE' });
  return { uri: uri.uri, bytes: bytes.length };
}

async function _runNordicDfu(dfu, zipUrl, ver){
  if(_otaInProgress){ showToast(T('Update already in progress'),'warn'); return; }
  var sub = document.getElementById('dev-update-sub');
  var btn = document.getElementById('btn-fw-check');
  var setSub = function(txt, colour){
    if(sub){ sub.style.display=''; sub.textContent = txt; sub.style.color = colour || '#2A7AE2'; }
  };

  var listener = null;

  _otaInProgress = true;
  if(btn){ btn.disabled = true; btn.textContent = '…'; }

  try{
    setSub(T('Downloading firmware…'));
    var file = await _cacheFirmwareZip(zipUrl);
    logEvent('scale', 'DFU package cached ('+file.bytes+' bytes)');

    listener = await dfu.addListener('DFUStateChanged', function(e){
      if(e && typeof e.percent === 'number'){
        setSub(T('Installing…')+' '+e.percent+'%');
        if(btn) btn.textContent = e.percent+'%';
      } else if(e && e.state === 'Scanning for bootloader'){
        setSub(T('Looking for scale…'));
      } else if(e && e.state){
        setSub(T('Installing…')+' '+e.state);
      }
    });

    // Do the jump ourselves rather than letting Nordic use the buttonless service.
    //
    // Adafruit's BLEDfu START_DFU handler saves the phone's connection address in
    // the bootloader's peer-data block, so the bootloader comes back up *directed*-
    // advertising at it. iOS rotates its random address every connection and won't
    // surface directed adverts to an unbonded central, so the bootloader is
    // invisible and Nordic times out (DFUError 201, "Device failed to connect").
    //
    // The firmware's own DFU command sets the same GPREGRET magic and resets, but
    // writes no peer data — so the bootloader advertises normally, as "AdaDFU",
    // exactly like a double-tap reset. The plugin scans for that.
    setSub(T('Preparing scale…'));
    await sendBleCommand('DFU');
    // Stay connected and listening long enough to see the scale's own
    // "Entering DFU mode…" acknowledgement in the log before it resets —
    // that reply is the only direct evidence the command was understood.
    await new Promise(function(r){ setTimeout(r, 1500); });
    try{ disconnectBt(); }catch(e){}
    await new Promise(function(r){ setTimeout(r, 2500); });  // bootloader boot + first adverts

    setSub(T('Looking for scale…'));
    console.log('[dfu] startDFU ->', file.uri);
    // "DfuTarg" is what this bootloader actually advertises — confirmed on
    // hardware. The plugin also accepts the FE59 service UUID, so a build that
    // renames itself still gets found.
    await dfu.startDFU({ filePath: file.uri, bootloaderName: 'DfuTarg' });

    setSub('✓ '+T('Firmware updated')+' (v'+ver+')', '#2D9D5C');
    if(btn){ btn.style.display='none'; btn.disabled=false; }
    showToast(T('Firmware updated')+' — v'+ver, 'success');
    logEvent('scale', 'DFU complete: v'+ver);
  }catch(e){
    var msg = (e && (e.message || e.errorMessage)) || String(e);
    console.error('[dfu] failed:', e);
    setSub(T('Update failed')+': '+msg, '#B03020');
    if(btn){ btn.disabled=false; btn.textContent=T('Retry'); }
    showToast(T('Firmware update failed'), 'error');
    logEvent('scale', 'DFU failed: '+msg);
  }finally{
    _otaInProgress = false;
    if(listener && listener.remove){ try{ await listener.remove(); }catch(e){} }
  }
}

// Legacy alias kept for the button's onclick
function installFirmwareUpdate(){ startFirmwareUpdate(); }

// ── Send a text command to ESP32 via RX characteristic ──
// Commands: "TARE\n", "ZERO\n", "RESET\n"
async function sendBleCommand(cmd){
  // Native path first — btRxChar only exists on the Web Bluetooth path.
  if(!btRxChar && _isCapacitor && _capBLE && btDevice && btDevice.isCapDevice){
    try{
      await _capBLE.write(btDevice.id, BLE_UART_SERVICE, BLE_UART_RX,
        new DataView(new TextEncoder().encode(cmd + '\n').buffer));
    } catch(e){ console.warn('native BLE write failed:', e); }
    return;
  }
  if(!btRxChar){ return; }
  try{
    await btRxChar.writeValue(new TextEncoder().encode(cmd + '\n'));
  } catch(e){ console.warn('BLE write failed:', e); }
}

// ══ SCALE AUTHENTICATION (anti-clone) ══
// The scale proves it is genuine by signing our random challenge with its
// private key; we verify with this embedded PUBLIC key (safe to expose — you
// can't forge signatures with a public key).
//
// ENFORCED: an unverified scale raises the #auth-block overlay, which has no
// dismiss control. Requires firmware >= v1.7.2 (AUTH/AUTHR support) — a board
// flashed older than that cannot answer and WILL be locked out.
//
// Known limits, so nobody assumes more protection than this actually gives:
//   · The gate is applied on a verified answer or when the 9s retry timer
//     expires — until then an unverified scale is connected and streaming.
//   · Device discovery is not restricted (see the broad namePrefix filters in
//     scanBluetooth); this gate is what makes a counterfeit useless, not the
//     scan.
//   · Enforcement is client-side only. It defeats counterfeit HARDWARE, not a
//     modified app, and nothing server-side checks whether synced rows came
//     from a verified scale.
var _AUTH_PUBKEY_HEX = "045e13092498d7f0fc59619d11dbdd06f791c7c3c70b44ed2c3a74b5c9e6ff74f55e78bbaeebd2adf5918d65ab580c2f46a16e5bd01a5eebe14005694ccead861d";
var _authEnforce   = true;    // see the block above before changing this
var _scaleVerified = false;
var _authNonceHex  = null;
var _authTimer     = null;
var _authPubKey    = null;

function _authHexToBytes(h){ var a=new Uint8Array(h.length/2); for(var i=0;i<a.length;i++) a[i]=parseInt(h.substr(i*2,2),16); return a; }
function _authBytesToHex(b){ var s=''; for(var i=0;i<b.length;i++){ var x=b[i].toString(16); s+=(x.length<2?'0':'')+x; } return s; }
async function _getAuthPubKey(){
  if(_authPubKey) return _authPubKey;
  _authPubKey = await crypto.subtle.importKey('raw', _authHexToBytes(_AUTH_PUBKEY_HEX), {name:'ECDSA',namedCurve:'P-256'}, false, ['verify']);
  return _authPubKey;
}
function _startScaleAuth(){
  _scaleVerified = false;
  try{
    var nb = crypto.getRandomValues(new Uint8Array(16));
    _authNonceHex = _authBytesToHex(nb);
    // Retry several times — the scale broadcasts its answer, and a second
    // device's notification pipe or a chunk can be missed on the first try.
    var tries = 0;
    var fire = function(){
      if(_scaleVerified || !_psScaleConnected()) return;
      tries++;
      console.log('[auth] sending challenge (try '+tries+') nonce='+_authNonceHex.substring(0,8)+'…');
      sendBleCommand('AUTH:'+_authNonceHex);
      if(tries < 6) setTimeout(fire, 1300);
    };
    fire();
    if(_authTimer) clearTimeout(_authTimer);
    _authTimer = setTimeout(function(){
      if(!_scaleVerified){ console.warn('[auth] no valid response after retries — scale unverified'); _applyAuthGate(); }
    }, 9000);
  }catch(e){ console.warn('[auth] start error', e); }
}
async function _handleAuthResponse(nonceHex, sigHex){
  console.log('[auth] AUTHR received: nonce='+nonceHex.substring(0,8)+'… mine='+(_authNonceHex?_authNonceHex.substring(0,8):'—')+'… siglen='+sigHex.length);
  if(nonceHex !== _authNonceHex){ console.log('[auth] nonce mismatch — ignoring (meant for another device)'); return; }
  if(sigHex === 'err' || sigHex.length !== 128){ console.warn('[auth] bad/short signature ('+sigHex.length+') — retrying'); return; }  // let retries continue
  try{
    var key = await _getAuthPubKey();
    var ok = await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'}, key, _authHexToBytes(sigHex), _authHexToBytes(nonceHex));
    if(!ok){ console.warn('[auth] signature did not verify — will retry'); return; }  // keep retrying rather than fail hard
    _scaleVerified = true;
    console.log('[auth] scale VERIFIED ✓');
  }catch(e){ console.warn('[auth] verify error', e); return; }
  if(_authTimer){ clearTimeout(_authTimer); _authTimer=null; }
  _applyAuthGate();
}
var _authWasBlocked = false;
function _applyAuthGate(){
  var block = document.getElementById('auth-block');
  var blocked = _authEnforce && !!btDevice && !_scaleVerified;
  if(block) block.classList.toggle('open', blocked);
  if(blocked && !_authWasBlocked) logEvent('auth', 'Blocked unrecognized scale: '+(btDevice&&btDevice.name||'Unknown'));
  _authWasBlocked = blocked;
}

// ══ SCREEN WAKE LOCK ══
//
// While a scale is connected the screen must stay lit: the operator is reading a
// live weight from the tractor seat, and iOS Auto-Lock would blank it mid-load.
// When the power-save timer decides the session has gone idle and sends the
// scale to SLEEP, the lock is released and the device reverts to its own
// Auto-Lock setting — so an iPad left in the cab overnight doesn't sit burning
// its screen.
//
// Tied to the scale connection rather than to the app being open: with no scale
// there is nothing live to watch, and holding a tablet awake for a records
// screen would be rude to the battery.
//
// Wake Lock API rather than a native plugin — no new dependency, and the same
// code covers iOS (16.4+) and Android from the shared bundle. On iOS 15 the API
// is absent and the app simply behaves as it did before.
var _wakeLock = null;

async function _wakeLockApply(){
  var want = _psScaleConnected() && !_psAsleep && document.visibilityState === 'visible';
  try{
    if(want && !_wakeLock && navigator.wakeLock){
      _wakeLock = await navigator.wakeLock.request('screen');
      // The browser releases the lock by itself whenever the page is hidden, so
      // drop our handle on that event — otherwise the next apply() believes the
      // lock is still held and never re-requests it.
      _wakeLock.addEventListener('release', function(){ _wakeLock = null; });
      logEvent('scale', 'Screen kept awake while scale is connected');
    } else if(!want && _wakeLock){
      var l = _wakeLock; _wakeLock = null;
      await l.release();
      logEvent('scale', 'Screen wake lock released — device Auto-Lock now applies');
    }
  }catch(e){
    // request() rejects if the page isn't visible or the OS declines. Neither is
    // fatal; the screen just behaves as it would without the app.
    _wakeLock = null;
    console.warn('[wakelock]', (e && e.message) || e);
  }
}

// Returning to the foreground needs an explicit re-acquire — the spec drops the
// lock whenever the page is hidden.
document.addEventListener('visibilitychange', function(){ _wakeLockApply(); });

// ══ SCALE POWER SAVING ══
// After the chosen idle time with no screen activity, tell the connected
// scale to enter power-saving (SLEEP). Any interaction wakes it (WAKE).
var _psTimeoutMin = 0;          // 0 = off; else 30 / 60 / 120 minutes
var _psTimer = null;
var _psAsleep = false;
var _psLast = 0;
var _psListenersAttached = false;

function _psScaleConnected(){
  return !!btRxChar || (typeof _isCapacitor!=='undefined' && _isCapacitor && _capBLE && btDevice && btDevice.isCapDevice);
}
function _psSendScale(cmd){
  if(btRxChar){ sendBleCommand(cmd); return; }
  if(typeof _isCapacitor!=='undefined' && _isCapacitor && _capBLE && btDevice && btDevice.isCapDevice){
    _capBLE.write(btDevice.id, BLE_UART_SERVICE, BLE_UART_RX,
      new DataView(new TextEncoder().encode(cmd+'\n').buffer)).catch(function(){});
  }
}
function _psArm(){
  if(_psTimer){ clearTimeout(_psTimer); _psTimer=null; }
  if(_psTimeoutMin>0 && _psScaleConnected()){
    _psTimer = setTimeout(function(){
      if(_psScaleConnected() && !_psAsleep){
        _psSendScale('SLEEP');
        _psAsleep=true;
        _psShowSleepOverlay();
        // Scale is asleep, so nothing live is on screen — hand the display back
        // to the device's own Auto-Lock.
        _wakeLockApply();
      }
    }, _psTimeoutMin*60*1000);
  }
}
function _psActivity(){
  // While asleep, ONLY the Wake button resumes — generic touches are ignored
  // so the sleep screen doesn't dismiss itself.
  if(_psAsleep) return;
  var now=Date.now();
  if(now-_psLast < 2000) return;       // throttle timer re-arming while active
  _psLast=now;
  _psArm();
}
function _psShowSleepOverlay(){
  var o=document.getElementById('sleep-overlay'); if(o) o.classList.add('open');
}
function _psHideSleepOverlay(){
  var o=document.getElementById('sleep-overlay'); if(o) o.classList.remove('open');
}
function _psWake(){
  _psAsleep=false;
  _psHideSleepOverlay();
  _wakeLockApply();   // live again — hold the screen open
  if(_psScaleConnected()) _psSendScale('WAKE');
  _psArm();
}
function setPowerSaveTimeout(min, btn){
  _psTimeoutMin = min;
  localStorage.setItem('vf_powersave_min', String(min));
  if(btn){
    var seg=document.getElementById('seg-powersave');
    if(seg) seg.querySelectorAll('.seg-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
  }
  if(min===0 && _psAsleep){            // turned off while asleep → wake it
    _psAsleep=false;
    _psHideSleepOverlay();
    if(_psScaleConnected()) _psSendScale('WAKE');
  }
  _psArm();
}
function loadPowerSaveSetting(){
  var v = parseInt(localStorage.getItem('vf_powersave_min')||'0',10);
  _psTimeoutMin = isNaN(v)?0:v;
  var seg=document.getElementById('seg-powersave');
  if(seg){
    var btns=seg.querySelectorAll('.seg-btn');
    btns.forEach(function(b){ b.classList.remove('active'); });
    var idx={0:0,30:1,60:2,120:3}[_psTimeoutMin]; if(idx===undefined) idx=0;
    if(btns[idx]) btns[idx].classList.add('active');
  }
  if(!_psListenersAttached){
    _psListenersAttached=true;
    ['pointerdown','touchstart','keydown','scroll'].forEach(function(ev){
      document.addEventListener(ev, _psActivity, {passive:true, capture:true});
    });
  }
  _psArm();
}

// ── Main scan function ──
// Shows the OS BLE device picker filtered to likely scale devices
async function scanBluetooth(){
  var spinner = document.getElementById('scan-spinner');
  var label   = document.getElementById('scan-label');
  spinner.style.display = 'block';
  label.textContent = T('Scanning...');
  document.getElementById('btn-scan').disabled = true;

  // ── Native (Capacitor): plugin picker instead of Web Bluetooth ──
  if(_isCapacitor && _capBLE){
    if(!(await _ensureBleReady())){
      spinner.style.display = 'none';
      label.textContent = T('Scan for Devices');
      document.getElementById('btn-scan').disabled = false;
      renderBtDeviceList([]);
      return;
    }
    try{
      var nd = await _capBLE.requestDevice({
        services: [BLE_UART_SERVICE],
        optionalServices: [BLE_UART_SERVICE],
        allowDuplicates: false
      });
      spinner.style.display = 'none';
      label.textContent = T('Scan for Devices');
      document.getElementById('btn-scan').disabled = false;
      renderBtDeviceList([{
        id:         nd.deviceId,
        name:       nd.name || 'BLE Scale',
        addr:       'BLE Device',
        realDevice: { id: nd.deviceId, name: nd.name || 'BLE Scale', isCapDevice: true }
      }]);
    }catch(e){
      spinner.style.display = 'none';
      label.textContent = T('Scan for Devices');
      document.getElementById('btn-scan').disabled = false;
      // The plugin throws when the user dismisses the picker — not an error.
      if(!/cancel|denied|dismiss/i.test(e && e.message || '')) {
        showToast('Scan failed: ' + (e && e.message || e), 'error');
      }
      renderBtDeviceList([]);
    }
    return;
  }

  // No Web Bluetooth support — show demo devices
  if(!navigator.bluetooth){
    await new Promise(function(r){ setTimeout(r, 800); });
    spinner.style.display = 'none';
    label.textContent = T('Scan for Devices');
    document.getElementById('btn-scan').disabled = false;
    renderBtDeviceList([]);
    return;
  }

  try{
    // Request BLE device — show all devices that advertise the UART service,
    // or any device whose name starts with common scale/ESP32 prefixes.
    // acceptAllDevices fallback ensures the user can still pick ANY device.
    var device = await navigator.bluetooth.requestDevice({
      filters:[
        {services: [BLE_UART_SERVICE]},           // ESP32 BLE UART
        {services: ['weight_scale']},              // Standard BLE weight scale
        {namePrefix: 'Virtus'},
        {namePrefix: 'HarvestScale'},
        {namePrefix: 'ESP32'},
        {namePrefix: 'Scale'},
        {namePrefix: 'HX711'},
        {namePrefix: 'Load'},
        {namePrefix: 'Weigh'},
      ],
      optionalServices:[
        BLE_UART_SERVICE,
        'weight_scale',
        'battery_service',
        'device_information',
      ]
    });

    spinner.style.display = 'none';
    label.textContent = T('Scan for Devices');
    document.getElementById('btn-scan').disabled = false;

    renderBtDeviceList([{
      id:         device.id,
      name:       device.name || 'BLE Scale',
      addr:       'BLE Device',
      realDevice: device
    }]);

  } catch(e){
    spinner.style.display = 'none';
    label.textContent = T('Scan for Devices');
    document.getElementById('btn-scan').disabled = false;

    if(e.name === 'NotFoundError'){
      showToast('No device selected','warn');
    } else {
      showToast('Scan failed: ' + e.message, 'error');
    }

    // Always show demo devices as fallback
    renderBtDeviceList([]);
  }
}

// ── Render the device list in the Devices panel ──
function renderBtDeviceList(devices){
  scannedDevices = devices;
  var container = document.getElementById('bt-device-list');
  container.innerHTML = '';

  if(!devices.length){
    container.innerHTML = '<div style="text-align:center;padding:18px;font-size:13px;color:var(--text3);">No devices found</div>';
    return;
  }

  devices.forEach(function(d){
    var isConn = btDevice && (btDevice.id === d.id || (d.demo && btDevice.name === d.name));
    var row = document.createElement('div');
    row.className = 'bt-device' + (isConn ? ' paired' : '');

    row.innerHTML =
      '<div class="btd-left">' +
        '<div class="btd-icon" style="display:flex;align-items:center;justify-content:center;">'+'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+'<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>'+'<path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>'+'</svg></div>' +
        '<div>' +
          '<div class="btd-name">' + esc(d.name) + (isConn ? '<span class="btd-badge">Connected</span>' : '') + '</div>' +
          '<div class="btd-addr">' + esc(d.addr) + '</div>' +
        '</div>' +
      '</div>';

    var btn = document.createElement('button');
    btn.className = 'btn-bt-action' + (isConn ? ' disconnect' : '');
    btn.textContent = isConn ? T('Disconnect') : T('Connect');
    btn.addEventListener('click', function(){
      if(isConn){
        disconnectBt();
      } else if(d.demo){
      } else if(d.realDevice){
        connectRealDevice(d.realDevice);
      }
      setTimeout(function(){ renderBtDeviceList(scannedDevices); }, 400);
    });

    row.appendChild(btn);
    container.appendChild(row);
  });
}

// ── Legacy handler (kept for backwards compat) ──
function handleDeviceBtn(devId){
  var d = scannedDevices.find(function(x){ return x.id === devId; });
  if(!d) return;
  var isConn = btDevice && (btDevice.id === d.id || (d.demo && btDevice.name === d.name));
  if(isConn){ disconnectBt(); }
  else if(d.realDevice){ connectRealDevice(d.realDevice); }
  setTimeout(function(){ renderBtDeviceList(scannedDevices); }, 400);
}

// ── Connect to a real BLE device ──
async function connectRealDevice(device){
  showToast('Connecting…', '');

  // ── Native path ──
  if(device && device.isCapDevice && _isCapacitor && _capBLE){
    try{
      btDevice = device;
      await _capBLE.connect(device.id, function(){
        // Disconnect callback — mirrors the Web Bluetooth gattserverdisconnected handler
        logEvent('scale', 'Scale disconnected: '+(btDevice&&btDevice.name||'Unknown'));
        var wasOta = _otaInProgress || _otaJustCompleted;
        if(wasOta && btDevice) _otaReconnectDevice = btDevice;
        btDevice=null; btChar=null; btRxChar=null; bleBuffer='';
        _scaleVerified=false; _authNonceHex=null;
        if(_authTimer){ clearTimeout(_authTimer); _authTimer=null; }
        _applyAuthGate();
        updateBtPills(false); resetScaleDisplay(); renderBtDeviceList(scannedDevices);
        if(typeof updateWeighDisplay==='function') updateWeighDisplay();
        if(typeof updateTruckLoadBar==='function') updateTruckLoadBar();
        if(wasOta){
          if(_otaInProgress){
            _otaInProgress=false; _otaJustCompleted=true;
            if(_otaVerifyTimeout){ clearTimeout(_otaVerifyTimeout); _otaVerifyTimeout=null; }
            showToast('Firmware updated! Scale restarting…','success');
          }
          _scheduleOtaReconnect(6000);
        } else {
          showToast('Scale disconnected','error');
        }
      });

      await _capBLE.startNotifications(device.id, BLE_UART_SERVICE, BLE_UART_TX, _nativeBleNotify);

      updateBtPills(true, device.name);
      showToast('Connected: ' + device.name, 'success');
      logEvent('scale', 'Connected: '+device.name);
      setTimeout(function(){ _psSendScale('INFO');   }, 500);
      setTimeout(function(){ _psSendScale('STATUS'); }, 1000);
      setTimeout(function(){ _psSendScale('RES:1');  }, 1200);
      setTimeout(function(){ if(typeof _startScaleAuth==='function') _startScaleAuth(); }, 800);
      _psAsleep=false; if(typeof _psArm==='function') _psArm();
      _wakeLockApply();   // scale is live — keep the screen on

      // Report the negotiated MTU once the link has settled. Android asks for 512
      // after service discovery; iOS negotiates on its own and exposes no request
      // API. Neither is knowable at connect time, and it decides OTA chunk size.
      if(_capBLE.getMtu){
        setTimeout(async function(){
          try{
            var m = await _capBLE.getMtu(device.id);
            var mtu = (m && (m.value || m)) | 0;
            logEvent('scale', 'Negotiated MTU: '+mtu+' ('+Math.max(20, mtu-3)+' byte writes)');
            console.log('[ble] negotiated MTU='+mtu);
          }catch(e){ console.warn('[ble] getMtu failed:', e); }
        }, 1500);
      }

      if(!_mixerPairingInProgress){
        document.querySelectorAll('.sub-panel.open').forEach(function(p){ p.classList.remove('open'); });
        showTab('display');
      }
      document.getElementById('btn-log').disabled    = false;
      document.getElementById('btn-unload').disabled = false;
    }catch(e){
      // A startNotifications still in flight when the user disconnects rejects
      // ~10s later with "Set notifications timeout". By then btDevice is already
      // null and the disconnect succeeded — surfacing that as "Connection failed"
      // is a false alarm, so only report if we still believe we're connecting.
      if(btDevice){
        showToast('Connection failed: ' + (e && e.message || e), 'error');
        btDevice=null; btChar=null; btRxChar=null; bleBuffer='';
      } else {
        console.warn('late BLE error after disconnect (ignored):', e && e.message || e);
      }
    }
    return;
  }

  try{
    btDevice = device;

    // Handle unexpected disconnection
    device.addEventListener('gattserverdisconnected', function(){
      logEvent('scale', 'Scale disconnected: '+(btDevice&&btDevice.name||device.name||'Unknown'));
      var wasOtaCompleting = _otaInProgress || _otaJustCompleted;
      // Remember the device before clearing so we can reconnect post-OTA
      if(wasOtaCompleting && btDevice) _otaReconnectDevice = btDevice;
      btDevice  = null;
      btChar    = null;
      btRxChar  = null;
      bleBuffer = '';
      updateBtPills(false);
      resetScaleDisplay();
      renderBtDeviceList(scannedDevices);
      if(typeof updateWeighDisplay==='function') updateWeighDisplay();
      if(typeof updateTruckLoadBar==='function') updateTruckLoadBar();
      if(wasOtaCompleting){
        // Assume OTA succeeded even if we never got OTA_OK — ESP32 restarted
        if(_otaInProgress){
          _otaInProgress = false;
          _otaJustCompleted = true;
          if(_otaVerifyTimeout){ clearTimeout(_otaVerifyTimeout); _otaVerifyTimeout = null; }
          var sub = document.getElementById('dev-update-sub');
          if(sub){ sub.textContent='✓ Update installed — restarting…'; sub.style.color='#2D9D5C'; }
          showToast('Firmware updated! Scale restarting…','success');
        }
        _scheduleOtaReconnect(6000);
      } else {
        showToast('Scale disconnected', 'error');
      }
    });

    var server     = await device.gatt.connect();
    var deviceName = device.name || 'BLE Scale';
    var connected  = false;

    // ── Priority 1: Nordic UART Service (ESP32 + HX711) ──
    try{
      var uartSvc = await server.getPrimaryService(BLE_UART_SERVICE);
      btChar      = await uartSvc.getCharacteristic(BLE_UART_TX);
      btRxChar    = await uartSvc.getCharacteristic(BLE_UART_RX).catch(function(){ return null; });
      await btChar.startNotifications();
      btChar.addEventListener('characteristicvaluechanged', handleBleData);
      connected = true;
      showToast('Connected: ' + deviceName, 'success');
      logEvent('scale', 'Connected: '+deviceName);
      // Request device info and status immediately
      setTimeout(function(){ sendBleCommand('INFO'); }, 500);
      setTimeout(function(){ sendBleCommand('STATUS'); }, 1000);
      setTimeout(function(){ sendBleCommand('RES:1'); }, 1200);  // report full 1 kg precision; app does display rounding
      setTimeout(function(){ if(typeof _startScaleAuth==='function') _startScaleAuth(); }, 800);  // verify genuine scale
      _psAsleep=false; if(typeof _psArm==='function') _psArm();  // start idle-timeout watch
      _wakeLockApply();   // scale is live — keep the screen on
    } catch(uartErr){

      // ── Priority 2: Standard BLE Weight Scale profile ──
      try{
        var wsSvc = await server.getPrimaryService('weight_scale');
        btChar    = await wsSvc.getCharacteristic('weight_measurement');
        await btChar.startNotifications();
        btChar.addEventListener('characteristicvaluechanged', function(e){
          // Standard BLE weight measurement: bytes 1-2 = weight * 0.005 kg
          var flags = e.target.value.getUint8(0);
          var raw   = e.target.value.getUint16(1, true);
          setRawWeight(parseFloat((raw * 0.005).toFixed(3)));
        });
        connected = true;
        showToast('Connected: ' + deviceName + ' (Weight Profile)', 'success');
      } catch(wsErr){

        // ── Priority 3: Unknown device — enable manual input ──
        showToast('Connected — no weight service found. Use manual input.', 'warn');
        enableManualInput();
        connected = true;
      }
    }

    if(connected){
      updateBtPills(true, deviceName);
      // During mixer pairing, stay in the Add-Mixer sheet so the user can name
      // and save — don't close the panel or jump to the Weigh tab.
      if(!_mixerPairingInProgress){
        document.querySelectorAll('.sub-panel.open').forEach(function(p){ p.classList.remove('open'); });
        showTab('display');
      }
      document.getElementById('btn-log').disabled    = false;
      document.getElementById('btn-unload').disabled = false;
    }

  } catch(e){
    showToast('Connection failed: ' + e.message, 'error');
    btDevice  = null;
    btChar    = null;
    btRxChar  = null;
    bleBuffer = '';
  }
}


// ── Disconnect ──
function disconnectBt(){
  if(btDevice && btDevice.isCapDevice && _isCapacitor && _capBLE){
    try{ _capBLE.stopNotifications(btDevice.id, BLE_UART_SERVICE, BLE_UART_TX).catch(function(){}); }catch(e){}
    try{ _capBLE.disconnect(btDevice.id).catch(function(){}); }catch(e){}
  } else if(btDevice && btDevice.gatt && btDevice.gatt.connected){
    try{ btDevice.gatt.disconnect(); } catch(e){}
  }
  btDevice  = null;
  btChar    = null;
  btRxChar  = null;
  bleBuffer = '';
  _psAsleep=false; if(_psTimer){ clearTimeout(_psTimer); _psTimer=null; } _psHideSleepOverlay();  // stop idle-timeout watch
  _bleRole=null;  // forget scale-assigned role; re-applied on next connect
  _scaleVerified=false; _authNonceHex=null; if(_authTimer){ clearTimeout(_authTimer); _authTimer=null; } _applyAuthGate();  // reset auth
  _connectedSerial=null;
  updateBtPills(false);
  resetScaleDisplay();
  _wakeLockApply();   // nothing live to watch — release the screen
  document.getElementById('btn-log').disabled    = true;
  document.getElementById('btn-unload').disabled = true;
  clearDeviceInfo();
  showToast('Disconnected', 'warn');
  updateWeighDisplay();
}


// Name of the currently-selected feed mixer, if any — shown in place of the
// raw BLE device name wherever the app reports "which device is connected",
// since the mixer name (e.g. "Elmer's green mixer") is what the user actually
// identifies with, not the scale's generic model name.
function _activeMixerName(){
  if(!_activeMixerId) return null;
  var c = getMixers().find(function(x){ return x.id===_activeMixerId; });
  return c ? c.name : null;
}
function updateBtPills(connected,name){
  // Topbar pill + the Grain-Mixers-card pill were removed per user preference
  // (redundant with the per-mixer "● Connected" status). Only the Display
  // tab's device row is kept.
  var btEl = document.getElementById('ir-bt-status');
  if(btEl){
    if(connected){ btEl.textContent = _activeMixerName() || name || T('Connected'); btEl.style.color = '#1A6B3C'; }
    else { btEl.textContent = T('No Devices'); btEl.style.color = 'var(--text)'; }
  }
  // Keep the grain-mixer list + add-mixer status in sync with the connection
  if(typeof _updateMixerDeviceStatus==='function') _updateMixerDeviceStatus();
  if(typeof renderMixers==='function') renderMixers();
}

function enableManualInput(){
  var _mWtUnit = wtUnit();
document.getElementById('scale-hint').innerHTML='<input type="number" step="0.01" min="0" style="margin-top:8px;width:180px;padding:9px 13px;background:var(--bg2);border:1.5px solid var(--border);border-radius:10px;font-size:16px;color:var(--text);font-family:Inter,sans-serif;text-align:center;outline:none;" oninput="setRawWeightFromInput(this.value)">';
}

// Cache DOM refs for scale display — looked up once, not on every tick
var _elScaleWeight=null,_elScaleWeightBox=null,_elScaleGross=null,_elScaleTarget=null;
var _elScaleDot=null,_elStableTxt=null,_elStableDot=null;
var _elBtnLog=null,_elBtnUnload=null,_elDryPreview=null;
var _rafPending=false; // requestAnimationFrame gate

function _initScaleEls(){
  _elScaleWeight  = document.getElementById('scale-weight-val');
  _elScaleGross   = document.getElementById('scale-gross');
  _elScaleTarget  = document.getElementById('scale-target');
  _elScaleDot     = document.getElementById('scale-status-dot');
  _elStableTxt    = document.getElementById('stable-txt');
  _elStableDot    = document.getElementById('stable-dot');
  _elBtnLog       = document.getElementById('btn-log');
  _elBtnUnload    = document.getElementById('btn-unload');
  _elDryPreview   = document.getElementById('dry-weight-preview');
  _elScaleWeightBox = document.getElementById('scale-weight');
}

// Single write point for the big readout. Sizing lives here rather than at each
// call site so a new one can't be added that forgets to resize — the failure
// mode is silent (the number just overflows the panel) and only shows up on
// loads big enough to be rare in testing.
// Google Maps link for a logged transaction, as a pin-labelled button.
// One builder for all four render sites (three field-detail lists + the main
// log) — they had drifted into four copies of the same string already.
// The exact coordinates move to the tooltip rather than being dropped, so the
// number is still there when someone needs to read or copy it.
function _gpsBtnHtml(l, cls){
  if(!(l.lat && l.lng)) return '';
  var url  = 'https://www.google.com/maps?q='+l.lat+','+l.lng;
  var acc  = l.gpsAccuracy ? (' ±'+l.gpsAccuracy+'m') : '';
  var tip  = l.lat.toFixed(5)+', '+l.lng.toFixed(5)+acc;
  return '<a class="'+cls+'" href="'+url+'" target="_blank" rel="noopener" title="'+tip+'">'
       + '<span aria-hidden="true">📍</span>'+esc(T('See Location'))+'</a>';
}

var _wtFitCache = {};

// Idle readout: the unlit digits of an old scale head.
var WT_BLANK = '000000';    // what is shown -- a clean run of zeros
var WT_SHAPE = '0000.00';   // what it is SIZED to -- the live reading's format

// `blank` is passed explicitly rather than sniffed from the text -- the
// placeholder is made of digits itself, so there is nothing to detect.
function _setMainWeight(txt, blank){
  if(!_elScaleWeight) _initScaleEls();
  txt = String(txt);

  var box = _elScaleWeightBox;
  if(!box){ _elScaleWeight.textContent = txt; return; }

  // Ghost digits are sized to the LIVE reading's shape, not to their own
  // string. The readout fits its text to the panel width, so a six-glyph
  // "000000" measures bigger than the seven-glyph "6408.00" that replaces it,
  // and the number would visibly shrink on connect instead of lighting up in
  // place. Measure the reference shape, then put the zeros back.
  var measureTxt = blank ? WT_SHAPE : txt;
  _elScaleWeight.textContent = measureTxt;
  _elScaleWeight.classList.toggle('wt-blank', !!blank);

  var boxW = box.clientWidth;
  if(!boxW){ _elScaleWeight.textContent = txt; return; }  // tab hidden

  // Cache on the string's *shape*, not the string: with tabular figures every
  // digit is the same width, so "12345.00" and "98765.00" measure identically.
  // Keeping the width in the key means orientation changes and tablet/phone
  // layouts invalidate themselves without a resize listener.
  var key = measureTxt.replace(/[0-9]/g, '0') + '|' + boxW;
  var px  = _wtFitCache[key];
  if(px === undefined){
    px = _wtMeasureFit(box, _elScaleWeight, boxW);
    _wtFitCache[key] = px;
  }
  box.style.fontSize = px + 'px';
  _elScaleWeight.textContent = txt;
}

// Largest font size at which the current text fits boxW, capped at --wt-base.
// Measured at a 100px reference and scaled, so it costs one layout per distinct
// shape/width rather than one per tick.
function _wtMeasureFit(box, span, boxW){
  var base = parseFloat(getComputedStyle(box).getPropertyValue('--wt-base')) || 60;
  var prev = box.style.fontSize;
  box.style.fontSize = '100px';
  var range = document.createRange();
  range.selectNodeContents(span);
  var w = range.getBoundingClientRect().width;
  box.style.fontSize = prev;
  if(!w) return base;
  return Math.min(base, Math.floor(boxW / w * 100));
}

// Webfont metrics differ from the fallback, so anything measured before Inter
// loads is wrong. Drop the cache once it's ready and let it re-measure.
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(function(){ _wtFitCache = {}; });
}

function setRawWeightWithStable(w, fwStable){
  rawWeight    = w;
  // Use firmware stable flag if provided — overrides app's own stability detection
  if(fwStable !== undefined) weightStable = fwStable;
  _auTickWithStable(w, fwStable);
  if(_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(function(){
    _rafPending = false;
    _paintScaleDisplay();
  });
}

function setRawWeight(w){
  rawWeight = w;
  _auTick(w);
  if(_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(function(){
    _rafPending = false;
    _paintScaleDisplay();
  });
}

// Display-only coarsening. The firmware streams 5 kg steps and that finer
// value is what gets SAVED — this just makes the big number easy to read.
// Steps are chosen to be roughly equivalent across units (~10 kg).
var _displayRoundStep = parseInt(localStorage.getItem('vf_display_round')||'1',10) || 1;
function _roundForDisplay(val, unit){
  var s = _displayRoundStep > 0 ? _displayRoundStep : 1;   // 1 / 2 / 5 / 10 (user setting)
  return Math.round(val/s)*s;
}
function _fmtDisplay(val, unit){
  var r = _roundForDisplay(val, unit);
  if(unit==='lbs'||unit==='lb'||unit==='bu') return r.toFixed(0);
  return r.toFixed(2);
}

function _paintScaleDisplay(){
  if(rawWeight === null) return;
  // Keep the main display's in-progress card counting up with the load.
  if(typeof _tickHomeStatus === 'function') _tickHomeStatus();
  var w   = rawWeight;         // always kg internally
  var net = w - tareOffset; // allow negative for tare drift display
  // Keep full firmware precision (5 kg) here — _roundForDisplay coarsens
  // to ~10 kg purely for readability, per display unit.

  // Convert to display unit
  var cropNow   = document.getElementById('f-crop') ? document.getElementById('f-crop').value : '';
  var netConv   = convertWt(net, cropNow);
  var grossConv = convertWt(w,   cropNow);
  var tareConv  = tareOffset > 0 ? convertWt(tareOffset, cropNow) : null;

  // Lazily init element cache
  if(!_elScaleWeight) _initScaleEls();

  _elScaleDot.classList.add('live');

  // During an unload (manual OR auto) the big number switches to show how much
  // has come OFF so far, counting UP as the mixer empties. Otherwise it shows
  // the live net weight from the firmware.
  var unloadingNow = (_auState === 'unloading' || _auState === 'manual_unloading') && _auWeightBefore !== null;
  if(unloadingNow){
    var unloadedKg   = Math.max(0, _auWeightBefore - net);   // both are calibrated kg
    var unloadedConv = convertWt(unloadedKg, cropNow);
    _setMainWeight(_fmtDisplay(unloadedConv.val, unloadedConv.unit));
    document.querySelectorAll('.scale-unit-lbl').forEach(function(el){ el.textContent = unloadedConv.unit; });
    // Right sub keeps showing the live weight still sitting on the scale.
    document.getElementById('scale-sub-lbl-right').textContent = T('On Scale');
    _elScaleGross.textContent  = _fmtDisplay(netConv.val, netConv.unit);
    _elScaleTarget.textContent = '- -';
    var pfxU = document.getElementById('scale-weight-prefix');
    if(pfxU) pfxU.style.display = 'none';
  } else {
    _setMainWeight(_fmtDisplay(netConv.val, netConv.unit));
    document.querySelectorAll('.scale-unit-lbl').forEach(function(el){ el.textContent = netConv.unit; });
    document.getElementById('scale-sub-lbl-right').textContent = T('Net');
    var pfx2 = document.getElementById('scale-weight-prefix');
    if(pfx2) pfx2.style.display = 'none';
    if(heldWeight === null){
      _elScaleGross.textContent  = _fmtDisplay(grossConv.val, grossConv.unit);
      _elScaleTarget.textContent = tareConv ? '- '+_fmtDisplay(tareConv.val, tareConv.unit) : '- -';
    }
  }

  // zero-raw / zero-net display removed

  // Enable buttons (but NOT in remote mode — remote locks actions separately)
  if(_appMode !== 'remote'){
    if(_elBtnLog)    _elBtnLog.disabled    = false;
    if(_elBtnUnload) _elBtnUnload.disabled = false;
  }
  var bzero = document.getElementById('btn-zero'); if(bzero) bzero.disabled = false;
  // Update zero-note once live
  var zno3 = document.getElementById('zero-note');
  if(zno3 && zno3.textContent === 'Connect a scale to enable tare'){
    zno3.textContent = tareOffset > 0 ? 'Tare: '+fmtWt(tareOffset,'')+' applied' : 'No tare offset applied';
  }

  // Dry weight preview — only if on Display tab
  if(_elDryPreview && _elDryPreview.offsetParent !== null){
    var dryKg = calcDryWeight(net, currentMoisture, cropNow);
    var dryConv = convertWt(dryKg, cropNow);
    _elDryPreview.textContent = _fmtDisplay(dryConv.val, dryConv.unit)+' '+dryConv.unit;
  }

  // Stable indicator: show a "Stable" pill only when the reading has settled
  // (spread < 20 kg over the last 3 s). When it's moving, hide the pill
  // entirely — no spread number, no "Stabilising…".
  var stablePill = document.getElementById('stable-pill');
  if(_elStableTxt && _elStableDot){
    var nowS = Date.now();
    var recentS = _auWindowSamples.filter(function(s){ return s.t >= nowS - 3000; });
    var isStable = false;
    if(recentS.length >= 3){
      var minS = recentS.reduce(function(a,b){ return a.w<b.w?a:b; }).w;
      var maxS = recentS.reduce(function(a,b){ return a.w>b.w?a:b; }).w;
      isStable = (maxS - minS) < 20.0;
    }
    weightStable = isStable;
    if(isStable){
      _elStableTxt.textContent = T('Stable');
      _elStableDot.classList.add('ok');
      if(stablePill) stablePill.style.visibility = 'visible';
    } else {
      _elStableDot.classList.remove('ok');
      if(stablePill) stablePill.style.visibility = 'hidden';
    }
  }
}

function sendZeroToScale(){
  // Devices tab Zero button — sends TARE command to ESP32 only
  // ESP32 resets its raw reading to 0 at hardware level
  if(!btDevice){ showToast('No scale connected','error'); return; }
  sendBleCommand('TARE');
  // Don't let the resulting raw-weight drop (e.g. 2500kg -> 0) be mistaken
  // for a real unload by the auto-unload detector.
  _auZeroSuppressUntil = Date.now() + 3000;
  _auState = 'idle';
  _auPeakWeight = null; _auPeakTrue = null; _auPeakTime = null; _auDropSince = null;
  _auWindowSamples = [];
  if(typeof _hideUnloadBanner==='function') _hideUnloadBanner();
  showToast('Zero sent to scale','success');
}

function zeroScale(){
  // Tare button on display tab — app-side display offset only, no BLE commands
  // This just offsets what the big number shows, the ESP32 raw reading is unchanged
  if(rawWeight===null){showToast('No weight reading','error');return;}
  heldWeight=null;
  var lbl3=document.getElementById('scale-sub-lbl-left'); if(lbl3) lbl3.textContent=T('Gross');
  var rbl3=document.getElementById('scale-sub-lbl-right'); if(rbl3) rbl3.textContent=T('Net');
  // Set offset so big number reads 0 from this point
  tareOffset = rawWeight;
  // fmtWt() returns a formatted STRING; only convertWt() returns {val,unit}.
  // The original called fmtWt(...).val.toFixed(2) and threw — latent in Harvest
  // because nothing reachable there calls zeroScale().
  var _tgt = document.getElementById('scale-target');
  if(_tgt) _tgt.textContent = '- ' + convertWt(tareOffset,'').val.toFixed(2);
  var zn=document.getElementById('zero-net'); if(zn) zn.textContent='0.00 kg';
  _setMainWeight('0.00');
  // Repaint straight away rather than waiting for the next reading — Clear
  // becomes available the instant a tare exists, and on a disconnected scale
  // no tick would ever arrive to do it.
  if(typeof _paintScaleButtons === 'function') _paintScaleButtons();
  if(typeof _paintTareGross === 'function') _paintTareGross();
  showToast('Tare set','success');
}

function clearZero(){
  // Clear app-side tare offset
  tareOffset = 0;
  var zno2=document.getElementById('zero-note'); if(zno2) zno2.textContent='No tare offset applied';
  var zn2=document.getElementById('zero-net'); if(zn2) zn2.textContent=rawWeight!==null?fmtWt(rawWeight,''):'--';
  if(rawWeight!==null) setRawWeight(rawWeight);
  showToast('Tare cleared','warn');
  // When BLE connected, big number now shows raw ESP32 weight (which may already be post-tare on ESP32 side)
  // User sees the actual total weight on scale again
}

function resetScaleDisplay(){
  heldWeight=null;tareOffset=0;
  var bzero2=document.getElementById('btn-zero'); if(bzero2) bzero2.disabled=true;
  var zno4=document.getElementById('zero-note'); if(zno4) zno4.textContent='Connect a scale to enable tare';
  var zraw=document.getElementById('zero-raw'); if(zraw) zraw.textContent='--';
  var znet=document.getElementById('zero-net'); if(znet) znet.textContent='--';
  var lbl4=document.getElementById('scale-sub-lbl-left'); if(lbl4) lbl4.textContent=T('Gross');
  var rbl4=document.getElementById('scale-sub-lbl-right'); if(rbl4) rbl4.textContent=T('Net');
  _setMainWeight(WT_BLANK, true);
  var pfxr = document.getElementById('scale-weight-prefix'); if(pfxr) pfxr.style.display='none';
  document.getElementById('scale-gross').textContent='- -';
  document.getElementById('scale-target').textContent='- -';
  document.getElementById('stable-txt').textContent='Waiting';document.getElementById('stable-dot').classList.remove('ok');
  // Nothing is streaming, so there is no stability to report. Leave the pill
  // hidden rather than parking a permanent "Waiting" chip in the readout.
  var sPill=document.getElementById('stable-pill'); if(sPill) sPill.style.visibility='hidden';
  document.getElementById('scale-status-dot').classList.remove('live');
  var rawEl=document.getElementById('zero-raw'); if(rawEl) rawEl.textContent='--';
  var netEl=document.getElementById('zero-net'); if(netEl) netEl.textContent='--';
  document.getElementById('btn-log').disabled=true;
  document.getElementById('btn-unload').disabled=true;
  weightStable=false;rawWeight=null;
}

