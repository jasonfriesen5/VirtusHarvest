// ── Supabase: Virtus Feed has its OWN project, separate from Harvest. ──
// Fill these in from the Feed project's API settings, or override at runtime
// via localStorage (vf_sb_url / vf_sb_anon) without a rebuild.
// Where Supabase sends people after confirming an email or resetting a
// password. Harvest hardcoded its own domain here; Feed has no site yet, so
// this points at the Supabase-hosted callback until virtusfeed.com exists.
// Whatever it becomes must also be listed under Auth > URL Configuration.
var AUTH_REDIRECT = localStorage.getItem('vf_auth_redirect')
  || 'https://tzafqxhaemgieehuolbp.supabase.co';

var SUPABASE_URL  = localStorage.getItem('vf_sb_url')  || 'https://tzafqxhaemgieehuolbp.supabase.co';
var SUPABASE_ANON = localStorage.getItem('vf_sb_anon') || 'sb_publishable_7-Jgtof9zyRZiohzIgsksw_a7aA1bzg';

var _supabase = null;
function getSupabase(){
  if(_supabase) return _supabase;
  // Reuse the client created early by the auth redirect handler (same URL/key).
  // This ensures onAuthStateChange listeners and session state are shared.
  if(window._earlySupabase){
    _supabase = window._earlySupabase;
    return _supabase;
  }
  if(!SUPABASE_URL || !SUPABASE_ANON) return null;
  try{ _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON); }
  catch(e){ console.warn('Supabase init failed:', e); }
  return _supabase;
}

function togglePw(inputId, btn){
  var inp = document.getElementById(inputId);
  if(!inp) return;
  var isHidden = inp.type === 'password';
  inp.type = isHidden ? 'text' : 'password';
  // Swap icon: open eye vs eye-off
  btn.innerHTML = isHidden
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function switchAuthTab(tab){
  document.getElementById('stab-signin').classList.toggle('active', tab==='signin');
  document.getElementById('stab-signup').classList.toggle('active', tab==='signup');
  document.getElementById('signin-form').style.display = tab==='signin'?'':'none';
  document.getElementById('signup-form').style.display = tab==='signup'?'':'none';
  document.getElementById('forgot-form').style.display = 'none';
  _clearAuthMessages();
}

function showForgotPassword(){
  document.getElementById('signin-form').style.display = 'none';
  document.getElementById('forgot-form').style.display = '';
  document.getElementById('forgot-form').style.display = '';
  document.getElementById('stab-signin').classList.remove('active');
  _clearAuthMessages();
  setTimeout(function(){ document.getElementById('forgot-email').focus(); }, 100);
}

function showSignInForm(){
  document.getElementById('forgot-form').style.display = 'none';
  document.getElementById('signin-form').style.display = '';
  document.getElementById('stab-signin').classList.add('active');
  document.getElementById('stab-signup').classList.remove('active');
  _clearAuthMessages();
}

function _setAuthError(msg){ 
  var el = document.getElementById('signin-error');
  el.textContent = msg; el.style.display = 'block';
  document.getElementById('signin-success').style.display = 'none';
}

function _setAuthSuccess(msg){
  var el = document.getElementById('signin-success');
  el.textContent = msg; el.style.display = 'block';
  document.getElementById('signin-error').style.display = 'none';
}

function _clearAuthMessages(){
  document.getElementById('signin-error').style.display = 'none';
  document.getElementById('signin-success').style.display = 'none';
}

function _setAuthBtnLoading(btnId, loading, defaultText){
  var btn = document.getElementById(btnId);
  if(!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : defaultText;
}

async function doSignIn(){
  var email    = (document.getElementById('signin-email').value||'').trim();
  var password = document.getElementById('signin-password').value||'';
  if(!email || !password){ _setAuthError('Please enter your email and password.'); return; }

  _setAuthBtnLoading('signin-btn', true, 'Sign In');
  _clearAuthMessages();

  var sb = getSupabase();
  if(!sb){
    // ── Offline / no Supabase configured — allow local access ──
    var ops = getOperators();
    if(ops.length){
      currentWorker={id:ops[0].id,name:ops[0].name,loginTime:new Date().toISOString()};
    } else {
      currentWorker={name:email.split('@')[0],loginTime:new Date().toISOString()};
    }
    localStorage.setItem(LS_WORKER, JSON.stringify(currentWorker));
    _setAuthBtnLoading('signin-btn', false, 'Sign In');
    selectedFarm=getFarms()[0]||null;
    launchApp();
    return;
  }

  try{
    var result = await sb.auth.signInWithPassword({email:email, password:password});
    if(result.error) throw result.error;
    var user = result.data.user;
    currentWorker = {
      id:    user.id,
      name:  null, // operator selected separately in app
      email: email,
      loginTime: new Date().toISOString()
    };
    localStorage.setItem(LS_LOGIN_EMAIL, email); // save email independently
    localStorage.setItem(LS_WORKER, JSON.stringify(currentWorker));
    selectedFarm=getFarms()[0]||null;
    _setAuthBtnLoading('signin-btn', false, 'Sign In');
    launchApp();
  } catch(e){
    _setAuthBtnLoading('signin-btn', false, 'Sign In');
    _setAuthError(e.message||'Sign in failed. Please check your credentials.');
  }
}

async function doSignUp(){
  var name     = (document.getElementById('signup-name').value||'').trim();
  var email    = (document.getElementById('signup-email').value||'').trim();
  var password = document.getElementById('signup-password').value||'';
  if(!name){ _setAuthError('Please enter your full name.'); return; }
  if(!email){ _setAuthError('Please enter your email address.'); return; }
  if(password.length < 8){ _setAuthError('Password must be at least 8 characters.'); return; }

  _setAuthBtnLoading('signup-btn', true, 'Create Account');
  _clearAuthMessages();

  var sb = getSupabase();
  if(!sb){
    _setAuthError('Account creation requires a server connection. Please contact your administrator.');
    _setAuthBtnLoading('signup-btn', false, 'Create Account');
    return;
  }

  try{
    var result = await sb.auth.signUp({
      email: email,
      password: password,
      options: { data: { full_name: name }, emailRedirectTo: AUTH_REDIRECT }
    });
    if(result.error) throw result.error;
    _setAuthBtnLoading('signup-btn', false, 'Create Account');
    _setAuthSuccess('Account created! Please check your email to confirm your account, then sign in.');
    switchAuthTab('signin');
    document.getElementById('signin-email').value = email;
  } catch(e){
    _setAuthBtnLoading('signup-btn', false, 'Create Account');
    _setAuthError(e.message||'Could not create account. Please try again.');
  }
}

async function doForgotPassword(){
  var email = (document.getElementById('forgot-email').value||'').trim();
  if(!email){ _setAuthError('Please enter your email address.'); return; }

  _setAuthBtnLoading('forgot-btn', true, 'Send Reset Link');
  _clearAuthMessages();

  var sb = getSupabase();
  if(!sb){
    _setAuthError('Password reset requires a server connection. Please contact your administrator.');
    _setAuthBtnLoading('forgot-btn', false, 'Send Reset Link');
    return;
  }

  try{
    var result = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: AUTH_REDIRECT
    });
    if(result.error) throw result.error;
    _setAuthBtnLoading('forgot-btn', false, 'Send Reset Link');
    _setAuthSuccess('Reset link sent! Check your inbox (and spam folder) for a password reset email.');
  } catch(e){
    _setAuthBtnLoading('forgot-btn', false, 'Send Reset Link');
    _setAuthError(e.message||'Could not send reset email. Please try again.');
  }
}

// Leave the auth screen without signing in, returning to the app as it was.
// Also resets the sub-views, so the next open starts on Sign In rather than
// wherever the user happened to abandon it.
function closeAuthScreen(){
  var login = document.getElementById('s-login');
  if(login) login.classList.remove('active');
  var app = document.getElementById('s-app');
  if(app) app.classList.add('active');
  try{ if(typeof showSignInForm==='function') showSignInForm(); }catch(e){}
  try{ if(typeof switchAuthTab==='function') switchAuthTab('signin'); }catch(e){}
}

// Permanent account deletion (App Store Guideline 5.1.1(v)).
//
// An auth user can't be deleted with the anon key, so this calls a
// SECURITY DEFINER function `delete_own_account()` in Postgres which removes
// the caller's own row from auth.users and cascades to their data. The client
// never passes a user id — the function reads auth.uid() itself — so a
// tampered client can only ever delete its own account.
async function deleteAccount(){
  var sb = getSupabase();
  if(!sb || !currentWorker || !currentWorker.id){
    showToast(T('Sign in required to delete your account'),'warn');
    return;
  }

  var ok = await showConfirm({
    icon:'⚠️',
    title:T('Delete Account?'),
    msg:T('This permanently deletes your account and every record in it — loads, fields, trucks and seasons. It cannot be undone.'),
    okLabel:T('Delete Account'),
    okColor:'#B03020'
  });
  if(!ok) return;

  var btn = document.getElementById('btn-delete-account');
  if(btn){ btn.disabled = true; btn.textContent = '…'; }
  try{
    var res = await sb.rpc('delete_own_account');
    if(res && res.error) throw res.error;

    // Local teardown mirrors doLogout(), plus the local records — leaving a
    // deleted account's data on the device would defeat the purpose.
    try{ await sb.auth.signOut(); }catch(e){}
    currentWorker = null;
    [LS_WORKER, LS_LOGIN_EMAIL, LS_LOGS, LS_QUEUE].forEach(function(k){
      try{ localStorage.removeItem(k); }catch(e){}
    });
    _clearSelection();
    btDevice = null; btChar = null; rawWeight = null; tareOffset = 0;

    document.querySelectorAll('.sub-panel.open').forEach(function(x){ x.classList.remove('open'); });
    resetScaleDisplay();
    renderLogs(); refreshQueue(); updateSessionTotal(); updateWeighDisplay(); updateTruckLoadBar();
    updateProfileStrip();
    showToast(T('Account deleted'),'warn');
  }catch(e){
    console.error('[account] delete failed:', e);
    showToast(T('Could not delete account')+' — '+((e && e.message) || e),'error');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = T('Delete'); }
  }
}

function doLogout(){
  showConfirm({title:T('Sign Out?'),msg:T('Sign out of your account?'),okLabel:T('Sign Out'),okColor:'#A87000'}).then(function(ok){
    if(!ok) return;
    var sb = getSupabase();
    if(sb) sb.auth.signOut().catch(function(){});
    currentWorker = null;
    localStorage.removeItem(LS_WORKER);
    localStorage.removeItem(LS_LOGIN_EMAIL);
    // Forget what was selected — a shared cab tablet must not hand the next
    // operator the previous one's field, truck and destination.
    _clearSelection();
    btDevice = null; btChar = null; rawWeight = null; tareOffset = 0;
    document.getElementById('btn-log').disabled = true;
    resetScaleDisplay();
    updateProfileStrip(); // update button to show "Sign In"
    updateWeighDisplay(); updateFieldZoneDisplay(); updateFarmSelectorCard();
    updateSeasonDisplayLabel(); updateTruckLoadBar();
    showToast('Signed out','warn');
    // Stay in the app — do NOT redirect to login screen
  });
}



// ══════════════════════════════════════════════════════
// CONFIGURATION SYNC — farms, fields, trucks, etc.
// ══════════════════════════════════════════════════════

// ── Push a single config item to Supabase ──
// ══ CONFIG CHANGE TRACKING ══
//
// Config used to push wholesale: every device uploaded its entire local copy on
// every sync. A device that hadn't yet learned about a delete would upsert the
// deleted row straight back into the cloud, and the next pull handed it to
// everyone — delete a boundary or a truck on one phone and another device
// resurrects it. The device can't tell "new here" from "deleted there".
//
// So track what this device actually changed. Only those items are pushed, and
// the pull is authoritative for everything else. Items still pending upload
// survive the pull, so config created offline isn't wiped before it ships.
var LS_DIRTY = 'vf_dirty';

// Cap on the weighings pull. It also decides whether the pull may treat the
// cloud as the complete picture — see the deletion reconcile in pullConfig().
var WEIGH_PULL_LIMIT = 2000;

