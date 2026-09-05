function doLogin(){
  const name=document.getElementById('l-name').value.trim();
  const pin=document.getElementById('l-pin').value.trim();
  if(!name){showToast('Enter your name','error');return;}
  if(pin!=='1234'&&pin.length<4){showToast('PIN must be 4+ digits','error');return;}
  currentWorker={name,loginTime:new Date().toISOString()};
  localStorage.setItem(LS_WORKER,JSON.stringify(currentWorker));
  selectedFarm=getFarms()[0]||null;
  selectedField=null;
  launchApp();
}

async function doResetPassword(){
  var password = document.getElementById('reset-password').value||'';
  var confirm  = document.getElementById('reset-confirm').value||'';
  if(password.length < 8){ _setAuthError('Password must be at least 8 characters.'); return; }
  if(password !== confirm){ _setAuthError('Passwords do not match.'); return; }

  _setAuthBtnLoading('reset-btn', true, 'Set New Password');
  _clearAuthMessages();

  var sb = getSupabase();
  if(!sb){ _setAuthError('Connection required.'); _setAuthBtnLoading('reset-btn', false, 'Set New Password'); return; }

  try{
    var result = await sb.auth.updateUser({ password: password });
    if(result.error) throw result.error;
    _setAuthBtnLoading('reset-btn', false, 'Set New Password');
    _setAuthSuccess('Password updated! Please sign in with your new password.');
    document.getElementById('reset-form').style.display = 'none';
    document.getElementById('signin-form').style.display = '';
    document.getElementById('stab-signin').classList.add('active');
    document.getElementById('stab-signup').classList.remove('active');
    await sb.auth.signOut();
  } catch(e){
    _setAuthBtnLoading('reset-btn', false, 'Set New Password');
    _setAuthError(e.message||'Could not update password.');
  }
}

function updateProfileStrip(){
  var btn   = document.getElementById('profile-auth-btn');
  var label = document.getElementById('settings-signin-label');
  var email = document.getElementById('settings-email');
  if(currentWorker && currentWorker.id){
    if(btn){
      btn.textContent = T('Sign Out');
      btn.style.background = 'rgba(176,48,32,0.08)';
      btn.style.borderColor = 'rgba(176,48,32,0.2)';
      btn.style.color = '#B03020';
    }
    if(label) label.textContent = T('Signed in as');
    if(email) email.textContent = currentWorker.email || currentWorker.name || '—';
  } else {
    if(btn){
      btn.textContent = T('Sign In');
      btn.style.background = 'rgba(45,122,58,0.08)';
      btn.style.borderColor = 'rgba(45,122,58,0.2)';
      btn.style.color = '#2D7A3A';
    }
    if(label) label.textContent = T('Not signed in');
    if(email) email.textContent = T('Tap to sign in or create account');
  }
}

function handleProfileAuthBtn(){
  if(currentWorker && currentWorker.id){
    doLogout();
  } else {
    openSignInSheet();
  }
}

async function doInAppSignIn(){
  var email = (document.getElementById('ias-email').value||'').trim();
  var pw    = (document.getElementById('ias-password').value||'').trim();
  var errEl = document.getElementById('ias-error');
  var btn   = document.getElementById('ias-btn');
  if(!email||!pw){ if(errEl){errEl.style.display='';errEl.textContent=T('Enter email and password.');} return; }
  if(errEl) errEl.style.display='none';
  if(btn){ btn.textContent=T('Signing in…'); btn.disabled=true; }
  try{
    var sb = getSupabase();
    if(!sb) throw new Error('Not connected');
    var res = await sb.auth.signInWithPassword({email:email, password:pw});
    if(res.error) throw res.error;
    var user = res.data.user;
    currentWorker = {id:user.id, email:email, loginTime:new Date().toISOString()};
    localStorage.setItem(LS_WORKER, JSON.stringify(currentWorker));
    localStorage.setItem(LS_LOGIN_EMAIL, email);
    closeSignInSheet();
    updateProfileStrip();
    updateOperatorDisplay();
    if(isOnline) setTimeout(pullConfig, 500);
    showToast('Signed in as '+email,'success');
  } catch(e){
    if(errEl){ errEl.style.display=''; errEl.textContent=e.message||T('Sign in failed.'); }
  } finally {
    if(btn){ btn.textContent='Sign In'; btn.disabled=false; }
  }
}

function openCreateAccountSheet(){
  // Close the sign-in sheet and show the full signup form
  closeSignInSheet();
  // Show the main login screen in signup mode
  document.getElementById('s-login').classList.add('active');
  setTimeout(function(){ switchAuthTab('signup'); }, 100);
}

function openSignInSheet(){
  // Show the login sheet inside the app
  document.getElementById('in-app-signin-overlay').classList.add('open');
  setTimeout(function(){
    var e = document.getElementById('ias-email');
    if(e) e.focus();
  }, 200);
}

function closeSignInSheet(){
  document.getElementById('in-app-signin-overlay').classList.remove('open');
}

// NOTE: an earlier duplicate doLogout() lived here. It was shadowed by the
// definition further down (a later declaration of the same name wins), so it
// never ran — it still drove the old s-app / s-login screen swap that the app
// no longer uses. Removed so there is one sign-out path, not two.

function launchApp(){
  document.getElementById('s-login').classList.remove('active');
  document.getElementById('s-app').classList.add('active');
  document.getElementById('s-login').classList.remove('active');
  // Set the signed-in email — always from the dedicated login email key
  var emailDisplay = document.getElementById('settings-email');
  if(emailDisplay){
    var _loginEmail = localStorage.getItem(LS_LOGIN_EMAIL) || (currentWorker && currentWorker.email) || '—';
    emailDisplay.textContent = _loginEmail;
  }
  loadActiveSeason();
  // Bring back what was selected before the app was quit. Must run before the
  // render burst below, which draws from these.
  _restoreSelection();
  updateOperatorDisplay();
  updateProfileStrip();
  renderOperators();
  if(selectedFarm){ var af=document.getElementById('app-farm-name'); if(af) af.textContent=selectedFarm.name; var sf=document.getElementById('settings-farm'); if(sf) sf.textContent=selectedFarm.name; }
  document.getElementById('api-url-input').value=getApiUrl();
  _initScaleEls();loadAutoDetectSettings();calLoadSaved();loadCalibrationSettings();updateNetPill();refreshQueue();renderLogs();startGeofenceDetector();updateSessionTotal();renderFarms();renderFields();updateSyncStatus();refreshCropDropdown();initUnloadDropdown();updateWeighDisplay();updateFieldZoneDisplay();updateFarmSelectorCard();loadUnitSettings();loadRoleSetting();showTab('display');startGPSWatch();updateSeasonDisplayLabel();loadProfilePhoto();applyLanguage();initLangToggle();loadPowerSaveSetting();updateThemeToggleUI();
  // Pull config from server in background
  if(isOnline) setTimeout(pullConfig, 1500);
}


function openMorePanel(name){
  // Close any other sub-panel that's already open, otherwise it stays stacked
  // on top (e.g. tapping Device while Settings is open left Settings covering
  // the Device panel).
  document.querySelectorAll('.sub-panel.open').forEach(function(p){
    if(p.id !== 'sp-'+name) p.classList.remove('open');
  });
  // Don't let a bad panel name take down whatever else the caller was doing —
  // this threw for months on a name with no matching panel.
  var _panel = document.getElementById('sp-'+name);
  if(!_panel){ console.warn('openMorePanel: no panel #sp-'+name); return; }
  _panel.classList.add('open');
  if(name==='devices' && typeof renderMixers==='function') renderMixers();
  if(name==='cloud') updateCloudPanel();
  if(name==='settings'){ loadUnitSettings(); loadRoleSetting(); loadAutoDetectSettings(); updateThemeToggleUI(); }
  if(name==='fieldmap') openFieldMap();
  if(name==='operators'){ renderOperators(); updateOperatorDisplay(); }
  if(name==='season'){ seasonGoBack(); renderSeasons(); updateSeasonDisplay(); }
  if(name==='about'){
    var abVer=document.getElementById('about-version'); if(abVer) abVer.textContent=APP_VERSION;
    var abPlat=document.getElementById('about-platform'); if(abPlat) abPlat.textContent=getRuntimePlatformLabel();
  }
  if(name==='operators'){
    var n2=currentWorker&&currentWorker.name?currentWorker.name:'';
    var ini2=n2 ? n2.split(' ').map(function(w){return w&&w[0]?w[0]:'';}).join('').toUpperCase().slice(0,2)||'?' : '?';
    var opAv=document.getElementById('op-avatar'); if(opAv) opAv.textContent=ini2;
    var opNm=document.getElementById('op-name');   if(opNm) opNm.textContent=n2||T('No operator');
  }
}

function closeMorePanel(name){
  var _p = document.getElementById('sp-'+name);
  if(_p) _p.classList.remove('open');
  if(name==='devices') syncTabBarActive();
}

// Device is a bottom-bar shortcut that opens an overlay rather than a tab
// page, so its highlight has to be driven manually.
function openDeviceTab(){
  // Same cleanup showTab() does — without this, an open transaction sheet or
  // field/truck/destination/farm detail panel (all higher z-index than the
  // Devices sub-panel) stayed on top, making it look like tapping Device did
  // nothing since the old view never got out of the way.
  var fdp = document.getElementById('field-detail-panel'); if(fdp) fdp.classList.remove('open');
  var tdp = document.getElementById('truck-detail-panel'); if(tdp) tdp.classList.remove('open');
  var ddp = document.getElementById('dest-detail-panel'); if(ddp) ddp.classList.remove('open');
  var famp = document.getElementById('farm-detail-panel'); if(famp) famp.classList.remove('open');
  var txs = document.getElementById('tx-sheet-overlay'); if(txs) txs.classList.remove('open');
  var fes = document.getElementById('field-edit-overlay'); if(fes) fes.classList.remove('open');
  var tas = document.getElementById('add-truck-sheet-overlay'); if(tas) tas.classList.remove('open');

  document.querySelectorAll('.tabbar .tab-btn').forEach(function(b){ b.classList.remove('active'); });
  var d = document.getElementById('tab-device'); if(d) d.classList.add('active');
  openMorePanel('devices');
}

// put the highlight back on whichever tab page is actually showing
function syncTabBarActive(){
  var dev = document.getElementById('tab-device'); if(dev) dev.classList.remove('active');
  ['weigh','fields','trucks','destinations','more'].forEach(function(t){
    var pg = document.getElementById('tp-'+t), bt = document.getElementById('tab-'+t);
    if(pg && bt) bt.classList.toggle('active', pg.classList.contains('active'));
  });
}

function updateCloudPanel(){
  var q  = getQueue();
  var el = document.getElementById('cloud-pending');
  if(el) el.textContent = q.length ? q.length+' '+T(q.length!==1?'records':'record')+' '+T('pending') : T('All synced ✓');

  var ce = document.getElementById('cloud-conn');
  if(ce) ce.textContent = isOnline ? T('Online') : T('Offline');

  var ls = document.getElementById('cloud-last-sync');
  if(ls){
    var raw = localStorage.getItem('vf_last_sync');
    if(raw){
      var d = new Date(raw);
      // Format: "Today at 14:32" or "Mar 16 at 09:15"
      var now  = new Date();
      var isToday = d.toDateString() === now.toDateString();
      var yesterday = new Date(now); yesterday.setDate(yesterday.getDate()-1);
      var isYesterday = d.toDateString() === yesterday.toDateString();
      var timeStr = d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      var dateStr = isToday ? T('Today') : isYesterday ? T('Yesterday') : d.toLocaleDateString([],{month:'short',day:'numeric'});
      ls.textContent = dateStr + ' at ' + timeStr;
    } else {
      ls.textContent = T('Never');
    }
  }
}

// ── TRUCKS ──
const LS_TRUCKS='vf_trucks';
