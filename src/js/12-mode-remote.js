function setAppMode(mode){
  // Connected to the BLE scale: the scale arbitrates roles. Tapping Remote
  // while we're the primary hands off to another connected device; the scale
  // then re-broadcasts roles (which drives _applyBleRole).
  if(_psScaleConnected() && mode === 'remote' && _bleRole === 'primary'){
    sendBleCommand('HANDOFF');
    showToast('Handing off primary…','');
    return;
  }
  if(_psScaleConnected() && mode === 'primary'){
    // Role is decided by the scale (first-connected wins); can't self-promote.
    showToast('The scale assigns primary automatically','warn');
    return;
  }
  _applyMode(mode);
}

function _applyMode(mode){
  // BLE-only now (no legacy WiFi). Roles are assigned by the scale; this just
  // reflects the mode locally when not driven by a ROLE message.
  _appMode = mode;
  var pill = document.getElementById('pill-remote');
  if(mode === 'remote'){
    if(pill) pill.style.display = 'flex';
    _lockActionsForRemote();
  } else {
    if(pill) pill.style.display = 'none';
    _unlockActionsForPrimary();
  }
  updateModeBtns();
}

// BLE-driven role (from the scale's ROLE: message). Same primary/remote effect
// as _applyMode but purely over BLE — no legacy WiFi polling. This is the path
// used when connected to the nRF52 scale.
var _bleRole = null;
function _applyBleRole(mode){
  if(_bleRole === mode) return;   // no-op on the 7s re-broadcasts
  _bleRole = mode;
  _appMode = mode;
  var pill = document.getElementById('pill-remote');
  if(mode === 'remote'){
    if(pill) pill.style.display = 'flex';
    _lockActionsForRemote();
    showToast('Remote — another device is the primary logger','');
  } else {
    if(pill) pill.style.display = 'none';
    _unlockActionsForPrimary();
    showToast('Primary — this device logs transactions','success');
  }
  updateModeBtns();
}

// Fetch device info over WiFi and populate the Devices panel + Device Info card.
// Shows "Connecting…" until the fetch resolves — only marks CONNECTED on success.
function _populateWifiDeviceInfo(){
  var wifiIcon =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M5 12.55a11 11 0 0 1 14.08 0"/>' +
      '<path d="M1.42 9a16 16 0 0 1 21.16 0"/>' +
      '<path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>' +
      '<circle cx="12" cy="20" r="1" fill="currentColor"/>' +
    '</svg>';

  // Show a pending entry — status updates to CONNECTED or NOT REACHABLE below
  var container = document.getElementById('bt-device-list');
  if(container){
    container.innerHTML =
      '<div class="bt-device" id="wifi-device-row" style="pointer-events:none;">' +
        '<div class="btd-left">' +
          '<div class="btd-icon" style="display:flex;align-items:center;justify-content:center;">' + wifiIcon + '</div>' +
          '<div>' +
            '<div class="btd-name">Virtus Scale (WiFi)</div>' +
            '<div class="btd-addr" id="wifi-device-sub" style="font-size:11px;color:var(--text3);">Connecting to 192.168.4.1…</div>' +
          '</div>' +
        '</div>' +
        '<div class="btd-right" id="wifi-device-status" style="font-size:11px;font-weight:700;color:var(--text3);">—</div>' +
      '</div>';
  }

  // If the app is loaded over HTTPS, the browser will block any HTTP fetch
  // to 192.168.4.1 as "mixed content" — regardless of which WiFi you're on.
  // Detect this up-front and show an actionable message instead of a misleading error.
  if(window.location.protocol === 'https:'){
    var statusEl2 = document.getElementById('wifi-device-status');
    if(statusEl2){ statusEl2.textContent = 'BLOCKED'; statusEl2.style.color = '#D4930A'; }
    var subEl2 = document.getElementById('wifi-device-sub');
    if(subEl2){
      subEl2.innerHTML = 'Browser blocks HTTP on HTTPS pages. ' +
        '<a href="http://192.168.4.1" target="_blank" rel="noopener" style="color:#2A7AE2;text-decoration:underline;">Open scale display</a>';
      subEl2.style.color = 'var(--text3)';
    }
    var row2 = document.getElementById('wifi-device-row');
    if(row2) row2.classList.remove('paired');
    showToast('Open the app via http:// or use the scale display link in Devices', 'warn');
    return;
  }

  // Use manual AbortController for broader browser compatibility
  var statusCtrl = new AbortController();
  var statusTimer = setTimeout(function(){ statusCtrl.abort(); }, 4000);

  // Fetch device info — only mark connected once we get a real response
  fetch('http://192.168.4.1/status', {signal: statusCtrl.signal})
    .then(function(r){ clearTimeout(statusTimer); return r.json(); })
    .then(function(d){
      // Mark as connected
      var row = document.getElementById('wifi-device-row');
      if(row) row.classList.add('paired');
      var statusEl = document.getElementById('wifi-device-status');
      if(statusEl){ statusEl.textContent = 'CONNECTED'; statusEl.style.color = '#2A7AE2'; }
      var subEl = document.getElementById('wifi-device-sub');
      if(subEl){ subEl.textContent = '192.168.4.1 — Remote'; subEl.style.color = 'var(--text3)'; }

      var setVal = function(id, val){ var el=document.getElementById(id); if(el) el.textContent=val||'N/A'; };
      setVal('dev-model',   d.model    || 'Virtus Scale');
      setVal('dev-serial',  d.serial   || '—');
      setVal('dev-firmware', d.firmware || '—');
      if(d.batt !== undefined){
        var battTxt = d.batt + '%';
        if(d.batt_v) battTxt += ' (' + d.batt_v.toFixed(2) + 'V)';
        setVal('dev-battery', battTxt);
        _updateBatteryIndicator(d.batt);
      }
      if(d.ext_v !== undefined) setVal('dev-ext-power', d.ext_v.toFixed(1) + 'V');
      updateBtPills(true, d.model || 'WiFi');
    })
    .catch(function(){
      clearTimeout(statusTimer);
      var statusEl = document.getElementById('wifi-device-status');
      if(statusEl){ statusEl.textContent = 'NOT REACHABLE'; statusEl.style.color = '#B03020'; }
      var subEl = document.getElementById('wifi-device-sub');
      if(subEl){ subEl.textContent = 'Could not reach 192.168.4.1 — are you on VM#1 WiFi?'; subEl.style.color = '#B03020'; }
      showToast('Scale not reachable — connect to VM#1 WiFi first', 'error');
    });
}

// Revert the Devices panel when leaving remote mode
function _clearWifiDeviceInfo(){
  var container = document.getElementById('bt-device-list');
  if(container){
    container.innerHTML = '<div style="text-align:center;padding:18px;font-size:13px;color:var(--text3);">' + T('Tap Scan to find nearby Bluetooth scales') + '</div>';
  }
  // Only clear device info if no BLE device is connected
  if(!btDevice){
    var ids = ['dev-model','dev-serial','dev-firmware','dev-battery','dev-ext-power'];
    ids.forEach(function(id){ var el=document.getElementById(id); if(el) el.textContent='N/A'; });
    updateBtPills(false);
  }
}

// Anything that WRITES a record is locked on a remote device. The ids here are
// Feed's own -- this list was inherited from Harvest (btn-log, btn-unload,
// tlb-empty-btn) and none of those exist on this main display, so remote mode
// used to lock nothing at all and a second tablet could still record a load.
var _REMOTE_LOCKED_IDS = ['home-load-btn', 'md-return-btn', 'btn-log', 'btn-unload'];

function _lockActionsForRemote(){
  _REMOTE_LOCKED_IDS.forEach(function(id){
    var el = document.getElementById(id);
    if(!el) return;
    el.disabled = true;
    el.style.opacity = '0.32';
    el.style.pointerEvents = 'none';
    el.style.filter = 'grayscale(1)';
  });
  // Tare and Clear stay live on purpose: in this app both are app-side display
  // offsets (zeroScale/clearScale send no BLE command), so a remote viewer can
  // zero their own view without touching the scale or the primary's reading.
}

function _unlockActionsForPrimary(){
  var ids = _REMOTE_LOCKED_IDS.concat(['btn-zero','btn-scan']);
  ids.forEach(function(id){
    var el = document.getElementById(id);
    if(!el) return;
    el.style.opacity = '';
    el.style.pointerEvents = '';
    el.style.filter = '';
    el.disabled = false;
  });
  // Restore action button row
  var abtns = document.querySelector('.action-btns');
  if(abtns){ abtns.style.pointerEvents = ''; abtns.style.opacity = ''; }
  // Re-apply normal BLE state — disable unload/log if no BLE connected
  var hasDevice = !!(btDevice);
  var unloadBtn = document.getElementById('btn-unload');
  var logBtn    = document.getElementById('btn-log');
  if(unloadBtn) unloadBtn.disabled = !hasDevice;
  if(logBtn)    logBtn.disabled    = !hasDevice;
  var hint = document.getElementById('scale-hint');
  if(hint) hint.textContent = '';
}

function _startWifiPoll(){
  _stopWifiPoll();
  // If on HTTPS the browser will block all HTTP fetches — no point polling
  if(window.location.protocol === 'https:') return;
  // Sequential polling — wait for each response before scheduling the next,
  // so we never flood the ESP32's single-threaded HTTP server.
  var _pollActive = true;
  var _pollFails  = 0;
  _wifiPollInterval = { stop: function(){ _pollActive = false; } };
  (function poll(){
    if(!_pollActive) return;
    var ctrl = new AbortController();
    var t = setTimeout(function(){ ctrl.abort(); }, 3000);
    fetch(_ESP32_WIFI_URL, {signal: ctrl.signal})
      .then(function(r){ clearTimeout(t); return r.json(); })
      .then(function(d){
        _pollFails = 0;
        // If device row was previously showing not reachable, update it
        var statusEl = document.getElementById('wifi-device-status');
        if(statusEl && statusEl.textContent === 'NOT REACHABLE'){
          statusEl.textContent = 'CONNECTED'; statusEl.style.color = '#2A7AE2';
          var subEl = document.getElementById('wifi-device-sub');
          if(subEl){ subEl.textContent = '192.168.4.1 — Remote'; subEl.style.color = 'var(--text3)'; }
          var row = document.getElementById('wifi-device-row');
          if(row) row.classList.add('paired');
        }
        if(d.weight !== undefined){
          setRawWeightWithStable(parseFloat(d.weight), d.stable === true || d.stable === 'true');
        }
      })
      .catch(function(){
        clearTimeout(t);
        _pollFails++;
        if(_pollFails >= 3){
          var statusEl = document.getElementById('wifi-device-status');
          if(statusEl){ statusEl.textContent = 'NOT REACHABLE'; statusEl.style.color = '#B03020'; }
          var subEl = document.getElementById('wifi-device-sub');
          if(subEl){ subEl.textContent = 'Could not reach 192.168.4.1 — are you on VM#1 WiFi?'; subEl.style.color = '#B03020'; }
          var row = document.getElementById('wifi-device-row');
          if(row) row.classList.remove('paired');
        }
      })
      .finally(function(){
        if(_pollActive) setTimeout(poll, 500);
      });
  })();
}

function _stopWifiPoll(){
  if(_wifiPollInterval){ _wifiPollInterval.stop(); _wifiPollInterval = null; }
}

// Check if connected to ESP32 WiFi (192.168.4.x) on load
function _detectWifiMode(){
  fetch(_ESP32_WIFI_URL, {signal: AbortSignal.timeout(1500)})
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.weight !== undefined){
        // We're on the ESP32's WiFi — offer remote mode
        showConfirm({
          title: T('Scale WiFi Detected'),
          msg: T('Connected to VirtusScale WiFi. Open in Remote Mode (view only) or use BLE for full access?'),
          okLabel: T('Remote Mode'),
          okColor: '#2A7AE2'
        }).then(function(ok){
          if(ok){
            setAppMode('remote');
            showTab('display');  // switch to Weigh tab so user sees live weight immediately
          }
        });
      }
    })
    .catch(function(){});  // not on ESP32 WiFi — no action
}

// ── LOGIN PROMPT ──
var _loginPromptTimer = null;
var _loginPromptDuration = 3000; // 3 seconds

function showLoginPrompt(){
  if(currentWorker && (currentWorker.id || currentWorker.name)) return; // already logged in
  var overlay = document.getElementById('login-prompt-overlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  var bar = document.getElementById('login-prompt-bar');
  var start = Date.now();
  _loginPromptTimer = setInterval(function(){
    var elapsed = Date.now() - start;
    var pct = Math.max(0, 100 - (elapsed / _loginPromptDuration) * 100);
    if(bar) bar.style.width = pct + '%';
    if(elapsed >= _loginPromptDuration) dismissLoginPrompt();
  }, 100);
}

function dismissLoginPrompt(){
  clearInterval(_loginPromptTimer);
  var overlay = document.getElementById('login-prompt-overlay');
  if(overlay) overlay.style.display = 'none';
}

function updateModeBtns(){
  var pb = document.getElementById('mode-btn-primary');
  var rb = document.getElementById('mode-btn-remote');
  var sl = document.getElementById('mode-sub-label');
  // Only the selected mode is gold; the other one is a plain neutral button, so
  // the current mode is readable at a glance. Styling is a single class toggle —
  // the previous version painted both gold via inline styles, which no
  // stylesheet rule (including the dark-mode ones) could then reach.
  // Harvest hid this; here it earns its place -- tapping Primary is refused
  // (the scale assigns it), and without the line that reads as a dead button.
  if(sl) sl.style.display = '';
  var remote = (_appMode === 'remote');
  if(pb) pb.classList.toggle('active', !remote);
  if(rb) rb.classList.toggle('active',  remote);
}

function goToSignIn(){
  dismissLoginPrompt();
  showTab('more');
  // Open the sign-in sheet in More tab
  setTimeout(function(){
    var signInSection = document.getElementById('more-signin-section');
    if(signInSection) signInSection.scrollIntoView({behavior:'smooth'});
    // Open the sign-in sheet. This used to call openMorePanel('profile'), but
    // there is no #sp-profile panel — sign-in lives in its own overlay — so it
    // threw a TypeError and aborted the rest of this handler.
    openSignInSheet();
  }, 200);
}


// ── Dismiss password reset overlay without changing password ──
// Signs out of the temporary recovery session and returns the user
// to the app in a not-logged-in state (no currentWorker).
function dismissPasswordReset(){
  // Clear recovery flags
  window._showPasswordReset = false;
  window._isRecoveryFlow    = false;
  // Close the overlay
  var overlay = document.getElementById('pwd-reset-overlay');
  if(overlay) overlay.style.display = 'none';
  // Sign out the recovery session so they're not silently logged in
  var sb = getSupabase();
  if(sb) sb.auth.signOut().catch(function(){});
  // Clear any local session state
  currentWorker = null;
  // Don't show the login prompt immediately — let them use the app freely
  // They can sign in manually whenever they want via the More tab.
  showToast('Password reset cancelled', 'warn');
}

// ── In-app password reset ──
function showAppPasswordReset(){
  var overlay = document.getElementById('pwd-reset-overlay');
  if(overlay){ overlay.style.display = 'flex'; }
  setTimeout(function(){
    var inp = document.getElementById('app-reset-password');
    if(inp) inp.focus();
  }, 200);
}

async function doAppResetPassword(){
  var pw1 = document.getElementById('app-reset-password').value || '';
  var pw2 = document.getElementById('app-reset-confirm').value || '';
  var msg = document.getElementById('app-reset-msg');
  var btn = document.getElementById('app-reset-btn');
  if(pw1.length < 8){ if(msg){msg.style.display='';msg.textContent='Password must be at least 8 characters.';} return; }
  if(pw1 !== pw2){ if(msg){msg.style.display='';msg.textContent='Passwords do not match.';} return; }
  if(msg) msg.style.display = 'none';
  if(btn){ btn.textContent = 'Saving...'; btn.disabled = true; }
  try{
    var sb = getSupabase();
    if(!sb) throw new Error('Not connected');
    var res = await sb.auth.updateUser({ password: pw1 });
    if(res.error) throw res.error;

    // Clear recovery flags so future navigation doesn't re-trigger the overlay
    window._showPasswordReset = false;
    window._isRecoveryFlow    = false;

    // The recovery OTP created a valid session — promote it to a real login so
    // the user lands inside the app, not on the sign-in screen.
    try{
      var u = await sb.auth.getUser();
      var user = u && u.data && u.data.user ? u.data.user : null;
      if(user){
        var uEmail = user.email || localStorage.getItem(LS_LOGIN_EMAIL) || '';
        currentWorker = {
          id:        user.id,
          name:      (currentWorker && currentWorker.name) || null,
          email:     uEmail,
          loginTime: new Date().toISOString()
        };
        if(uEmail) localStorage.setItem(LS_LOGIN_EMAIL, uEmail);
        localStorage.setItem(LS_WORKER, JSON.stringify(currentWorker));
      }
    } catch(ue){ console.warn('post-reset getUser failed:', ue); }

    // Close overlays / prompts and refresh UI
    document.getElementById('pwd-reset-overlay').style.display = 'none';
    try{ dismissLoginPrompt && dismissLoginPrompt(); } catch(_){}
    try{ updateProfileStrip && updateProfileStrip(); } catch(_){}
    var emailDisplay = document.getElementById('settings-email');
    if(emailDisplay && currentWorker && currentWorker.email){
      emailDisplay.textContent = currentWorker.email;
    }
    // Reset button text in case user sees overlay again later
    if(btn){ btn.textContent = 'Set New Password'; btn.disabled = false; }

    showToast('Password updated — you are signed in', 'success');
  } catch(e){
    if(msg){ msg.style.display=''; msg.textContent = e.message || 'Failed to update password. Try again.'; }
    if(btn){ btn.textContent = 'Set New Password'; btn.disabled = false; }
  }
}


// ══════════════════════════════════════════════════════════════
// ── BLE OTA UPDATE SYSTEM ──
// Fetches firmware from GitHub, sends to ESP32 over BLE in chunks
// ══════════════════════════════════════════════════════════════

async function checkForBLEOTAUpdate(){
  if(!btDevice){ showToast('Connect to scale first','error'); return; }
  var sub = document.getElementById('dev-update-sub');
  var btn = document.getElementById('btn-fw-check');
  if(sub){ sub.style.display=''; sub.textContent='Checking GitHub…'; sub.style.color='var(--text3)'; }
  try{
    var res = await fetch(OTA_VERSION_URL + '?t=' + Date.now());
    if(!res.ok) throw new Error(res.status === 404 ? 'version.json not found on GitHub' : 'GitHub returned ' + res.status);
    var data = await res.json();
    var latest  = data.version;
    var current = document.getElementById('dev-firmware').textContent || '0.0.0';
    if(latest && latest !== current && latest !== 'N/A'){
      if(sub){ sub.style.display=''; sub.textContent='v'+latest+' available'; sub.style.color='#2D9D5C'; }
      if(btn){ btn.style.display=''; btn.textContent=T('Update'); btn.onclick = function(){ startFirmwareUpdate(); }; }
      showToast('Firmware v'+latest+' available','success');
    } else {
      if(sub){ sub.style.display=''; sub.textContent=T('Up to date'); sub.style.color='var(--text3)'; }
      if(btn) btn.style.display='none';
      showToast('Firmware is up to date','success');
    }
  } catch(e){
    var reason = e.message || 'Unknown error';
    if(reason.indexOf('Failed to fetch')!==-1 || reason.indexOf('NetworkError')!==-1) reason = 'No internet or blocked by browser (file:// mode)';
    if(sub){ sub.style.display=''; sub.textContent='Check failed — '+reason; sub.style.color='#B03020'; }
    showToast('Could not check: '+reason,'error');
  }
}

// installBLEOTA() lived here: a raw-.bin-over-UART updater written for an ESP32
// design. This board is an nRF52840 with a SoftDevice + secure bootloader, whose
// firmware answers OTA_BEGIN with "OTA_ERR:use nRF52 DFU, not BLE-UART OTA", and
// the .bin it fetched 404s. Replaced by _runNordicDfu(). Kept only as this note so
// nobody re-wires a button to it.

// ══ GPS TRACKING ══
var lastGPSLat = null;
var lastGPSLng = null;
var lastGPSAccuracy = null;
var gpsWatchId = null;

var _gpsWasActive = false;
