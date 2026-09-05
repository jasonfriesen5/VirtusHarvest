const LS_WORKER='vf_worker', LS_LOGIN_EMAIL='vf_login_email',LS_QUEUE='vf_queue',LS_LOGS='vf_logs',LS_FARMS='vf_farms',LS_FIELDS='vf_fields',LS_API='vf_api_url';
let currentWorker=null,btDevice=null,btChar=null,rawWeight=null,tareOffset=0,weightStable=false,stableTimer=null;
let isOnline=navigator.onLine,syncInProgress=false,selectedFarm=null,selectedField=null,scannedDevices=[];
// Native-BLE bridge slots. Referenced in several places (some without a typeof
// guard, which threw ReferenceError on those paths); declared here so they're
// always defined. Stay falsy until a Capacitor BLE bridge is actually wired up,
// so every `_isCapacitor && _capBLE` check simply falls through to Web Bluetooth.
var _isCapacitor = false, _capBLE = null;

// ══ NATIVE BLE BRIDGE (Capacitor) ══
// Web Bluetooth does not exist in Capacitor's WebView on either platform, so the
// native build talks to the scale through @capacitor-community/bluetooth-le.
// The plugin's IIFE build is loaded only when running natively — the plain web
// build never requests it and keeps using Web Bluetooth unchanged.
function _bleIsNative(){
  try{ return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
                 && window.Capacitor.isNativePlatform()); }catch(e){ return false; }
}

// Hex is how the native bridge passes bytes both ways (see the plugin's
// conversion.js) — the JS wrapper is not usable here, so we do it ourselves.
function _dvToHex(dv){
  var out = '';
  for(var i=0;i<dv.byteLength;i++){
    var h = dv.getUint8(i).toString(16);
    out += (h.length===1 ? '0'+h : h);
  }
  return out;
}
function _hexToDv(hex){
  if(typeof hex !== 'string') return (hex instanceof DataView) ? hex : new DataView(new ArrayBuffer(0));
  var bytes = [];
  for(var i=0;i+1<hex.length;i+=2) bytes.push(parseInt(hex.substr(i,2),16));
  return new DataView(new Uint8Array(bytes).buffer);
}

// Minimal stand-in for the plugin's BleClient, built straight on the registered
// native plugin. The shipped IIFE build cannot be used: it closes over a global
// named capacitorExports that the Android bridge does not define, so it threw
// "capacitorExports is not defined" and left BleClient undefined.
function _makeBleClient(plugin){
  // Listener handles, keyed exactly like the real BleClient does. Without this,
  // reconnecting registers a SECOND listener for the same characteristic and every
  // notification chunk arrives twice — the reassembled lines come out doubled, which
  // corrupted the auth nonce and inflated signatures past their fixed 128 chars.
  var listeners = new Map();
  async function addListener(key, cb){
    var prev = listeners.get(key);
    if(prev){ try{ await prev.remove(); }catch(e){} listeners.delete(key); }
    var h = await plugin.addListener(key, cb);
    listeners.set(key, h);
  }
  async function dropListener(key){
    var prev = listeners.get(key);
    if(prev){ try{ await prev.remove(); }catch(e){} listeners.delete(key); }
  }
  return {
    initialize: function(o){ return plugin.initialize(o||{}); },
    requestDevice: function(o){ return plugin.requestDevice(o||{}); },
    connect: async function(deviceId, onDisconnect){
      if(onDisconnect) await addListener('disconnected|'+deviceId, function(){ onDisconnect(deviceId); });
      return plugin.connect({ deviceId: deviceId });
    },
    disconnect: async function(deviceId){
      await dropListener('disconnected|'+deviceId);
      return plugin.disconnect({ deviceId: deviceId });
    },
    startNotifications: async function(deviceId, service, characteristic, cb){
      service = String(service).toLowerCase(); characteristic = String(characteristic).toLowerCase();
      await addListener('notification|'+deviceId+'|'+service+'|'+characteristic, function(ev){
        cb(_hexToDv(ev && ev.value));
      });
      return plugin.startNotifications({ deviceId: deviceId, service: service, characteristic: characteristic });
    },
    stopNotifications: async function(deviceId, service, characteristic){
      service = String(service).toLowerCase(); characteristic = String(characteristic).toLowerCase();
      await dropListener('notification|'+deviceId+'|'+service+'|'+characteristic);
      return plugin.stopNotifications({ deviceId: deviceId, service: service, characteristic: characteristic });
    },
    getMtu: function(deviceId){ return plugin.getMtu({ deviceId: deviceId }); },
    getDevices: async function(deviceIds){
      var r = await plugin.getDevices({ deviceIds: deviceIds });
      return (r && r.devices) || [];
    },
    write: function(deviceId, service, characteristic, dataView){
      return plugin.write({ deviceId: deviceId,
        service: String(service).toLowerCase(), characteristic: String(characteristic).toLowerCase(),
        value: _dvToHex(dataView) });
    }
  };
}

// Resolve the plugin at startup, but do NOT initialize here. initialize() is what
// raises the Android 12+ permission prompt, and a prompt cannot be shown while the
// page is still loading — it was rejecting with "Permission denied." 13ms later,
// before any dialog could appear. It now runs on the first Scan tap instead, which
// is both a real user gesture and the moment the permission actually makes sense.
var _bleReady = false;
function _initNativeBle(){
  if(!_bleIsNative()) return;
  try{
    var C = window.Capacitor;
    var plugin = (C.Plugins && C.Plugins.BluetoothLe)
              || (typeof C.registerPlugin === 'function' ? C.registerPlugin('BluetoothLe') : null);
    if(!plugin){ console.warn('BluetoothLe plugin not registered'); logEvent('scale','Native BLE plugin missing'); return; }
    _capBLE = _makeBleClient(plugin);
    _isCapacitor = true;
    logEvent('scale', 'Native BLE plugin bound');
  }catch(e){
    console.warn('BLE bind failed:', e);
  }
}

// Initialize (and prompt for permission) on demand. Safe to call repeatedly.
async function _ensureBleReady(){
  if(!_isCapacitor || !_capBLE) return false;
  if(_bleReady) return true;
  try{
    await _capBLE.initialize({ androidNeverForLocation: true });
    _bleReady = true;
    logEvent('scale', 'Native BLE ready');
    return true;
  }catch(e){
    var msg = (e && e.message) || String(e);
    logEvent('scale', 'BLE init failed: '+msg);
    if(/permission/i.test(msg)){
      showToast('Bluetooth permission is required to find your scale','warn');
    } else {
      showToast('Bluetooth unavailable: '+msg,'warn');
    }
    return false;
  }
}
// ── Show/hide password ──────────────────────────────────────────────────
// Applied to every input[type=password] rather than one form, so sign-in,
// sign-up and both reset flows behave the same. Wrapping the input gives the
// button something correctly sized to position against; positioning against the
// field container would centre the icon on the label as well as the box.
function _initPasswordToggles(){
  document.querySelectorAll('input[type="password"]').forEach(function(inp){
    // Guard on the DOM as well as the flag: the dataset marker is lost if a form
    // is ever re-rendered, and a second pass would then nest a wrapper inside a
    // wrapper and leave two eye buttons on one field.
    if(inp.dataset.pwEye) return;
    if(inp.parentElement && inp.parentElement.classList.contains('pw-wrap')) return;
    inp.dataset.pwEye = '1';

    var wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.textContent = '👁';
    btn.setAttribute('aria-label', 'Show password');
    btn.addEventListener('click', function(e){
      e.preventDefault();
      var hidden = inp.type === 'password';
      inp.type = hidden ? 'text' : 'password';
      btn.classList.toggle('on', hidden);
      btn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
      // Keep the caret where it was rather than jumping to the start.
      try{ var v = inp.value; inp.focus(); inp.setSelectionRange(v.length, v.length); }catch(err){}
    });
    wrap.appendChild(btn);
  });
}
document.addEventListener('DOMContentLoaded', _initPasswordToggles);

document.addEventListener('DOMContentLoaded', _initNativeBle);

// Feed a native notification DataView through the exact same parser the Web
// Bluetooth path uses, so there is only one place that understands the protocol.
function _nativeBleNotify(dataView){
  try{ handleBleData({ target: { value: dataView } }); }
  catch(e){ console.warn('native BLE parse error:', e); }
}

var APP_VERSION = '1.0.1';

// Detects the actual runtime shell: native Android/iOS via Capacitor's
// injected bridge (window.Capacitor.getPlatform()), else falls back to
// user-agent sniffing for the plain browser/PWA build.
function getRuntimePlatform(){
  try{
    if(window.Capacitor && typeof window.Capacitor.getPlatform === 'function'){
      var p = window.Capacitor.getPlatform();
      if(p === 'android') return 'android';
      if(p === 'ios') return 'ios';
    }
  }catch(e){}
  var ua = navigator.userAgent || '';
  if(/Android/i.test(ua)) return 'web-android';
  if(/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'web-ipad';
  if(/iPhone/i.test(ua)) return 'web-iphone';
  return 'web';
}

function getRuntimePlatformLabel(){
  switch(getRuntimePlatform()){
    case 'android': return T('Android App');
    case 'ios': return T('iOS App');
    case 'web-android': return T('Web App (Android)');
    case 'web-ipad': return T('Web App (iPad)');
    case 'web-iphone': return T('Web App (iPhone)');
    default: return T('Web App');
  }
}


// ══ THEME (dark mode) ══
// Auto-follows the OS/device setting by default (and keeps following live if
// the OS theme changes while the app is open), unless the user has picked
// Light or Dark manually in Settings — that choice always wins.
const LS_THEME = 'vf_theme';                    // 'light' | 'dark' — only meaningful when explicit
const LS_THEME_EXPLICIT = 'vf_theme_explicit';  // '1' once the user manually overrides
var _darkMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function _resolveTheme(){
  if (localStorage.getItem(LS_THEME_EXPLICIT) === '1') return localStorage.getItem(LS_THEME) || 'light';
  return (_darkMedia && _darkMedia.matches) ? 'dark' : 'light';
}
function _applyTheme(){
  document.documentElement.setAttribute('data-theme', _resolveTheme());
}
_applyTheme();
if (_darkMedia && _darkMedia.addEventListener) {
  _darkMedia.addEventListener('change', function(){
    if (localStorage.getItem(LS_THEME_EXPLICIT) !== '1') _applyTheme();   // only auto-follow when not overridden
  });
}
// mode: 'auto' | 'light' | 'dark'. Called from the Settings toggle.
function setTheme(mode, btn){
  if (mode === 'auto') {
    localStorage.removeItem(LS_THEME_EXPLICIT);
    localStorage.removeItem(LS_THEME);
  } else {
    localStorage.setItem(LS_THEME_EXPLICIT, '1');
    localStorage.setItem(LS_THEME, mode);
  }
  _applyTheme();
  updateThemeToggleUI();
  showToast(T('Theme: ')+T(mode==='auto'?'Auto':(mode==='dark'?'Dark':'Light')),'success');
}
function updateThemeToggleUI(){
  var seg = document.getElementById('seg-theme'); if (!seg) return;
  var mode = localStorage.getItem(LS_THEME_EXPLICIT) === '1' ? (localStorage.getItem(LS_THEME)||'light') : 'auto';
  seg.querySelectorAll('.seg-btn').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-mode') === mode); });
}

// ══ INTERNATIONALIZATION (i18n) ══
const LS_LANG = 'vf_lang';
const LS_LANG_EXPLICIT = 'vf_lang_explicit';   // set once the user manually picks a language
