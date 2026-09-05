// ══════════════════════════════════════════════════════════════════
//  BOOT — tab routing and startup. Loads last so its definitions win.
// ══════════════════════════════════════════════════════════════════

var FEED_TABS = ['display','tx','stock','lots','feed','more'];

// Pages reachable only from More have no button of their own; while they're
// open, More stays lit rather than nothing being lit.
// Pages reachable only from More, or from a button rather than the bar.
var TAB_PARENT = { lots: 'more', feed: 'display' };

// Remembered so returning from a sub-panel restores the right highlight
// instead of leaving the bar with nothing selected.
var _activeTab = 'feed';

function showTab(id){
  document.querySelectorAll('.sub-panel.open').forEach(function(p){ p.classList.remove('open'); });
  _activeTab = id;
  _paintTabBar(id);

  FEED_TABS.forEach(function(t){
    var page = document.getElementById('tp-' + t);
    if(page) page.classList.toggle('active', t === id);
  });

  if(id === 'feed')    renderFeedTab();
  if(id === 'lots')    renderLots();
  if(id === 'tx')      renderTransactions();
  if(id === 'stock')   { renderRations(); renderIngredients(); _paintStockSeg();
                         if(typeof refreshAppSettings === 'function') refreshAppSettings(); }
  if(id === 'display'){ _paintDisplayTab(); if(typeof renderMainStage === 'function') renderMainStage();
                        if(typeof _paintScaleButtons === 'function') _paintScaleButtons(); }
  if(id === 'more')    _paintMoreTab();
}

// Ingredients lead: receiving a delivery and counting the pile are the only
// things an operator actually DOES here. Rations are a reference view for them
// (and desktop-owned when the console says so). Remembered for the session so
// switching tabs mid-task does not throw the choice away.
var _stockSeg = 'ing';
function setStockSeg(seg){
  _stockSeg = (seg === 'rat') ? 'rat' : 'ing';
  _paintStockSeg();
}
function _paintStockSeg(){
  var rat = _stockSeg === 'rat';
  var pi = document.getElementById('stock-pane-ing');
  var pr = document.getElementById('stock-pane-rat');
  if(pi) pi.style.display = rat ? 'none' : '';
  if(pr) pr.style.display = rat ? '' : 'none';
  var bi = document.getElementById('seg-ing');
  var br = document.getElementById('seg-rat');
  if(bi) bi.classList.toggle('active', !rat);
  if(br) br.classList.toggle('active',  rat);
}

function _paintTabBar(id){
  var lit = TAB_PARENT[id] || id;
  document.querySelectorAll('.tabbar .tab-btn').forEach(function(b){
    b.classList.toggle('active', b.id === 'tab-' + lit);
  });
}

function _signedIn(){ return !!(currentWorker && currentWorker.id); }

function _paintMoreTab(){
  _paintTopbarAuth();
  // This card is the ACCOUNT, not the operator. currentWorker deliberately
  // carries both -- the cloud account (id/email) and the driver (name/role/
  // operatorId) -- so reading .name here put whoever was driving the mixer
  // where the logged-in account belongs, every time someone picked an operator.
  // The operator has its own home: the Operators panel and the main display.
  var email = (currentWorker && currentWorker.email) || '';
  var ini   = email ? email.replace(/@.*$/, '').slice(0, 2).toUpperCase() : '?';
  var sa = document.getElementById('settings-avatar'); if(sa) sa.textContent = _signedIn() ? ini : '?';
  var sn = document.getElementById('settings-name');   if(sn) sn.textContent = email || T('Not signed in');
  var c  = activeCycle();
  var sf = document.getElementById('settings-farm');   if(sf) sf.textContent = c ? c.name : T('No cycle selected');
}

// Signed out the topbar button is the way in; signed in it becomes the account,
// showing who is logged in and opening the panel where sign-out lives. Putting
// it in the chrome means it is reachable from any screen, which matters when the
// operator is three tabs deep and the sync circle starts complaining.
function handleTopbarAuth(){
  if(_signedIn()){ doLogout(); return; }
  var lg = document.getElementById('s-login');
  if(lg) lg.classList.add('active');
  if(typeof switchAuthTab === 'function') switchAuthTab('signin');
}

function _paintTopbarAuth(){
  var btn = document.getElementById('profile-auth-btn');
  if(btn){
    btn.textContent = _signedIn() ? T('Sign Out') : T('Sign In');
    btn.className = 'profile-auth-btn' + (_signedIn() ? ' is-out' : '');
  }
  var cb = document.getElementById('cloud-auth-btn');
  if(cb) cb.textContent = _signedIn() ? T('Sign out') : T('Sign in');
}

// Scale hardware lives under More now, not in the tab bar.
function openDeviceTab(){
  openMorePanel('sp-devices');
  if(typeof renderMixers === 'function') renderMixers();
  if(typeof updateDeviceInfo === 'function') { try{ updateDeviceInfo(); }catch(e){} }
}

// The weight tab is the operator's home: live number, tare, load, and the
// ration that button will use — in that order, because that is the order the
// work happens in.
function _paintDisplayTab(){
  // A mix may already be running from before this screen was opened.
  if(typeof _paintMixTimer === 'function'){ _paintMixTimer(); }
  if(typeof startMixTicker === 'function'){
    var _of = openFeeding();
    if(_of && _of.mixStartedAt && mixRemainingSec(_of) > 0) startMixTicker();
  }
  var opEl = document.getElementById('home-op-name');
  if(opEl){
    // The operator is stamped on every feeding, so it belongs on the screen
    // that starts them — not buried three taps deep under More.
    opEl.textContent = (currentWorker && currentWorker.name) || T('Tap to choose');
    opEl.classList.toggle('unset', !(currentWorker && currentWorker.name));
  }
  renderRationPicker();
  _paintHomeStatus();
  if(typeof _paintScaleDisplay === 'function') { try{ _paintScaleDisplay(); }catch(e){} }
}

function _paintHomeStatus(){
  var el = document.getElementById('home-status');
  if(!el) return;
  var open = openFeeding();

  // Connection state lives under Más ▸ Báscula. On the main display it was a
  // permanent "Sin conectar" taking up room and telling the operator nothing
  // they could act on — the weight readout already shows dashes when there is
  // no scale. Only surface a feeding that is genuinely mid-flight.
  if(!open){ el.innerHTML = ''; return; }

  // Nothing to draw. The stage header under the weight already reports the
  // phase, the step, and the running batch total — this card repeated all
  // three while taking room the control strip does not have to spare.
  el.innerHTML = '';
}

// totalLoadedKg only counts CONFIRMED lines, so mid-ingredient this number sat
// still and the card looked frozen. Add the kilos going in right now.
function _inProgressKg(f){
  var kg = f.totalLoadedKg || 0;
  if(f.status === 'loading' && typeof _feed === 'object' && _feed &&
     _feed.id === f.id && _feed.phase === 'load' && typeof _stepKg === 'function'){
    kg += _stepKg();
  }
  return kg;
}

// Called from the weight tick. Touches one text node rather than rebuilding the
// card, because the tick runs ~10x a second.
function _tickHomeStatus(){
  if(_activeTab !== 'display') return;
  if(typeof _paintTareGross === 'function') _paintTareGross();
  if(typeof _paintMainStage === 'function') _paintMainStage();
  var kgEl = document.getElementById('md-inprog-kg');
  if(!kgEl) return;
  var f = openFeeding();
  if(!f) return;
  kgEl.textContent = Math.round(_inProgressKg(f)) + ' kg';
}

// The Load button either resumes what is already running or starts a feeding
// with the ration showing in the picker.
function homeLoadFeed(){
  var open = openFeeding();
  if(open){
    // Resuming is usually right — but NOT silently when the open feeding is for
    // a different group than the one in the picker. Choosing "9 meses", pressing
    // Cargar and landing in another group's load reads as the app ignoring the
    // selection, because that is exactly what it was doing.
    if(_pick.groupId && open.groupId && open.groupId !== _pick.groupId){
      showConfirm(
        T('There is an unfinished load for') + ' ' + (open.groupName || T('another group')) + '. ' +
        T('Finish or cancel it before starting a new one.'),
        T('A load is already in progress'), '🚜'
      ).then(function(ok){
        if(!ok) return;
        showTab('display');
        if(typeof renderMainStage === 'function') renderMainStage();
      });
      return;
    }
    if(typeof renderMainStage === 'function'){ showTab('display'); renderMainStage(); return; }
    showTab('feed'); return;
  }

  // feedFinish() clears the selection, so a tap before the picker repaints would
  // otherwise do nothing at all. Re-derive it the same way the picker does.
  if(!_pick.groupId && typeof renderRationPicker === 'function') renderRationPicker();
  if(!_pick.groupId){
    var gs = cycleGroups();
    if(gs.length) pickGroup(gs[0].id);
  }
  if(!_pick.groupId){ showToast(T('Choose a feed group first'), 'warn'); openGroupsPanel(); return; }
  var grp = groupById(_pick.groupId);
  if(!grp || !grp.rationId){ showToast(T('This group has no ration'), 'warn'); openGroupsPanel(); return; }

  // The group's own pens, in the group's own route order.
  var lots = lotsInGroup(_pick.groupId);
  if(!lots.length){ showToast(T('This group has no lots'), 'warn'); openGroupsPanel(); return; }

  // Head counts first — they decide how much gets made, and unlike a wrong
  // record that cannot be corrected once the feed is mixed.
  if(typeof checkHeadCountBeforeLoad === 'function' && checkHeadCountBeforeLoad(_pick.groupId)) return;

  // Then the mixer's own state, before loading on top of whatever is in it.
  if(typeof checkResidualBeforeLoad === 'function' && checkResidualBeforeLoad(_pick.groupId)) return;

  // Does this batch even fit the machine — and is it big enough to mix?
  var chk = (typeof mixerLoadCheck === 'function') ? mixerLoadCheck(_pick.groupId) : null;
  if(chk && chk.state !== 'ok'){
    var msg = chk.state === 'over'
      ? T('This load is') + ' ' + Math.round(chk.kg) + ' kg, ' + T('over the') + ' ' +
        Math.round(chk.capacityKg) + ' kg ' + T('capacity of') + ' ' + chk.mixerName + '. ' +
        T('Split it into') + ' ' + chk.batches + ' ' + T('batches of about') + ' ' +
        Math.round(chk.perBatchKg) + ' kg.'
      : T('This load is') + ' ' + Math.round(chk.kg) + ' kg — ' +
        Math.round(chk.pctOfCapacity) + '% ' + T('of capacity') + '. ' +
        T('Below about 40% a vertical mixer will not mix properly and the ration sorts.');
    showConfirm(msg, T('Check the mixer load'), chk.state === 'over' ? '⚖️' : '🌀')
      .then(function(ok){ if(ok) beginLoadForPickedGroup(); });
    return;
  }

  beginLoadForPickedGroup();
}

// The part that actually starts the load, split out so the residual dialog can
// call back into it once the operator has decided.
function beginLoadForPickedGroup(){
  var grp = groupById(_pick.groupId);
  if(!grp) return;
  var lots = lotsInGroup(_pick.groupId);
  if(!lots.length){ showToast(T('This group has no lots'), 'warn'); openGroupsPanel(); return; }

  _pick.rationId = grp.rationId;
  _pick.lotIds   = lots.map(function(l){ return l.id; });
  startFeedingFromPicker();
  // Stay on the main display: the walkthrough runs under the weight now.
  showTab('display');
  if(typeof renderMainStage === 'function') renderMainStage();
}

function openOperatorsPanel(){
  openMorePanel('sp-operators');
  // Punctuality and mixing discipline are DESKTOP figures — the console shows
  // them. The tablet keeps stamping the timings that feed them
  // (stampDeliveryTiming, stampMixOutcome); it just does not rank anybody here.
  if(typeof renderOperators === 'function') renderOperators();
}
function openMorePanel(id){
  var p = document.getElementById(id);
  if(!p) return;
  p.classList.add('open');
  _paintTabBar('more');
  if(id === 'sp-settings') _paintSettings();
  if(id === 'sp-cloud')    _paintCloud();
  if(id === 'sp-about')    _paintAbout();
}

// Reflect saved preferences on the segmented controls — without this the
// buttons all look unselected no matter what the app is actually using.
function _paintSettings(){
  if(typeof loadUnitSettings      === 'function') { try{ loadUnitSettings(); }catch(e){} }
  if(typeof loadPowerSaveSetting  === 'function') { try{ loadPowerSaveSetting(); }catch(e){} }
  if(typeof updateThemeToggleUI   === 'function') { try{ updateThemeToggleUI(); }catch(e){} }
  if(typeof initLangToggle        === 'function') { try{ initLangToggle(); }catch(e){} }
}

function _paintCloud(){
  _paintTopbarAuth();
  var em = document.getElementById('settings-email');
  if(em) em.textContent = (currentWorker && currentWorker.email) || '—';
  var rows = document.getElementById('cloud-info-rows');
  if(rows){
    var last = localStorage.getItem('vf_last_sync');
    rows.innerHTML =
      _infoRow(T('Signed in'), _signedIn() ? T('Yes') : T('No')) +
      _infoRow(T('Connection'), isOnline ? T('Online') : T('Offline')) +
      _infoRow(T('Last sync'), last ? new Date(+last).toLocaleString('es-PY') : '—');
  }
  if(typeof updateSyncStatus === 'function') updateSyncStatus();
}

function _paintAbout(){
  var v = document.getElementById('about-version');
  if(v) v.textContent = (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '—';
  var pl = document.getElementById('about-platform');
  if(pl && typeof getRuntimePlatformLabel === 'function') pl.textContent = getRuntimePlatformLabel();
}

function _infoRow(label, val){
  return '<div class="info-row"><div class="info-row-main"><div class="info-row-title">' + esc(label) +
         '</div></div><div class="info-row-val">' + esc(val) + '</div></div>';
}
function closeMorePanel(){
  document.querySelectorAll('.sub-panel.open').forEach(function(p){ p.classList.remove('open'); });
  _paintTabBar(_activeTab);   // restore the highlight the panel was covering
}

// Repaint everything a sync could have changed. pullConfig() calls this.
function renderAll(){
  _paintTopbarAuth();
  if(typeof renderFeedTab    === 'function') renderFeedTab();
  if(typeof renderLots       === 'function') renderLots();
  if(typeof renderIngredients=== 'function') renderIngredients();
  if(typeof renderRations    === 'function') renderRations();
  if(typeof renderCycles     === 'function') renderCycles();
  if(typeof refreshQueue     === 'function') refreshQueue();
  _paintMoreTab();
}

// ── Startup ──────────────────────────────────────────────────────
function bootFeed(){
  if(typeof _applyTheme === 'function') _applyTheme();

  // Native shell drops the desktop reading-width cap — on a tablet the app IS
  // the screen, and the cap would only produce dead margins.
  if(typeof getRuntimePlatform === 'function'){
    var p = getRuntimePlatform();
    if(p === 'ios' || p === 'android') document.body.classList.add('native-shell');
  }

  if(typeof _initNativeBle === 'function') _initNativeBle();
  if(typeof _initScaleEls  === 'function') _initScaleEls();
  if(typeof loadUnitSettings === 'function') loadUnitSettings();
  if(typeof initLangToggle === 'function') initLangToggle();
  // The markup ships in Spanish and applyLanguage() rewrites it from the
  // data-en attributes. Without this, an English user sees Spanish chrome until
  // they touch the language control.
  if(typeof applyLanguage === 'function') applyLanguage();

  // First run: give the operator a cycle rather than an empty app that
  // refuses to do anything until they find the right screen.
  if(typeof ensureFeedGroups === 'function') { try{ ensureFeedGroups(); }catch(e){} }
  if(typeof closeAbandonedFeedings === 'function') { try{ closeAbandonedFeedings(); }catch(e){} }

  if(!getCycles().length){
    // Name it with the year alone: a cycle name is DATA and never re-translates,
    // so anything wordier would be frozen in whichever language happened to be
    // active on first launch.
    // `auto` marks this as a placeholder the app invented, not something the
    // user created. Signing into an existing account has to be able to tell the
    // difference — see _adoptCloudCycle() in 20-model.js.
    var c = saveCycle({ name: String(new Date().getFullYear()),
                        startDate: new Date().toISOString().slice(0,10),
                        auto: true });
    setActiveCycle(c.id);
  } else if(!activeCycleId){
    setActiveCycle(getCycles()[0].id);
  }

  // The weight screen is home. Boot was still routing to the feed flow, which
  // left the Peso tab lit over the feed tab's content.
  showTab('display');
  _paintTopbarAuth();
  if(typeof updateNetPill === 'function') updateNetPill();
  if(typeof refreshQueue  === 'function') refreshQueue();

  // The app is usable signed out, same as Harvest: feedings queue locally and
  // upload once someone signs in. Blocking the whole app behind a login screen
  // would strand an operator whose tablet has no signal at the corrales.
  // Recover the session before deciding: currentWorker.id can be empty on a
  // device that is genuinely signed in (it is rehydrated from the Supabase
  // session, not from storage), and gating on it here skipped the boot pull
  // entirely -- leaving the app showing stale cached data with no clue why.
  if(isOnline && typeof pullConfig === 'function' && typeof _requireSession === 'function'){
    Promise.resolve(_requireSession(getSupabase())).then(function(ok){
      if(ok) return pullConfig();
    }).catch(function(e){ console.warn('[boot] initial pull failed', e); });
  }
}

// The live weight drives the feed screen — repaint the step on every reading.
// 04-scale-ble.js calls _paintScaleDisplay() from its notify handler; this hook
// piggybacks on it rather than adding a second BLE listener.
(function(){
  var orig = window._paintScaleDisplay;
  if(typeof orig === 'function'){
    window._paintScaleDisplay = function(){
      var r = orig.apply(this, arguments);
      try{ if(typeof _paintFeedStep === 'function') _paintFeedStep(); }catch(e){}
      return r;
    };
  }
})();

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootFeed);
else bootFeed();

// ── Post-sign-in entry ───────────────────────────────────────────
// Overrides Harvest's launchApp(), which ended with showTab('weigh') plus a
// burst of renders for screens Feed does not have. 'weigh' is not a Feed tab,
// so nothing activated and the app came back from sign-in completely blank.
function launchApp(){
  var login = document.getElementById('s-login');
  if(login) login.classList.remove('active');
  var app = document.getElementById('s-app');
  if(app) app.classList.add('active');

  if(typeof _initScaleEls          === 'function') { try{ _initScaleEls(); }catch(e){} }
  if(typeof loadUnitSettings       === 'function') { try{ loadUnitSettings(); }catch(e){} }
  if(typeof loadCalibrationSettings=== 'function') { try{ loadCalibrationSettings(); }catch(e){} }
  if(typeof loadPowerSaveSetting   === 'function') { try{ loadPowerSaveSetting(); }catch(e){} }
  if(typeof applyLanguage          === 'function') { try{ applyLanguage(); }catch(e){} }
  if(typeof initLangToggle         === 'function') { try{ initLangToggle(); }catch(e){} }
  if(typeof updateThemeToggleUI    === 'function') { try{ updateThemeToggleUI(); }catch(e){} }

  renderAll();
  // Go back to whatever the operator was on, not always home — signing in from
  // the Insumos tab should return to Insumos.
  showTab(_activeTab && FEED_TABS.indexOf(_activeTab) !== -1 ? _activeTab : 'display');

  if(isOnline && typeof pullConfig === 'function'){
    setTimeout(function(){ pullConfig().catch(function(e){ console.warn('[launch] pull failed', e); }); }, 400);
  }
}

// Same hazard: dismissing the auth overlay without picking a tab.
(function(){
  var orig = window.closeAuthScreen;
  window.closeAuthScreen = function(){
    if(typeof orig === 'function') { try{ orig.apply(this, arguments); }catch(e){} }
    var active = document.querySelector('.tab-page.active');
    if(!active) showTab(_activeTab && FEED_TABS.indexOf(_activeTab) !== -1 ? _activeTab : 'display');
    _paintTopbarAuth();
  };
})();
