// ══════════════════════════════════════════════════════════════════
//  SCALE SIMULATOR — development only
//  Drives the same variables the BLE notify handler drives (rawWeight,
//  weightStable) and repaints through the same path, so what you see is
//  the real display logic, not a mock of it.
//
//  Opt-in via ?sim=1 and refused outside localhost. It must never be
//  possible to fake a weight on a tablet that is recording real feed —
//  that is a data-integrity problem, not just a debug convenience.
// ══════════════════════════════════════════════════════════════════
(function(){
  var params = new URLSearchParams(location.search);
  if(params.get('sim') !== '1') return;

  var host = location.hostname;
  var localOnly = (host === 'localhost' || host === '127.0.0.1' || host === '' || host === '[::1]');
  if(!localOnly){ console.warn('[sim] refused: not localhost'); return; }

  var kg = 0, drift = null;

  function apply(v, stable){
    kg = Math.max(0, v);
    rawWeight = kg;
    // Feed the stability window the same way the BLE notify handler does.
    // _paintScaleDisplay() derives weightStable from _auWindowSamples, so
    // setting weightStable here directly would just be overwritten — the
    // samples are the only thing that actually makes the pill and the
    // load-confirm button behave like they do on a real scale.
    if(typeof _auTickWithStable === 'function') _auTickWithStable(kg, stable);
    else weightStable = (stable !== false);
    // Same repaint the BLE handler uses, so the feed sheet and the big
    // readout both update exactly as they would from a real reading.
    if(typeof _paintScaleDisplay === 'function') _paintScaleDisplay();
    var out = document.getElementById('sim-val');
    if(out) out.textContent = Math.round(kg) + ' kg';
    var sl = document.getElementById('sim-slider');
    if(sl && +sl.value !== Math.round(kg)) sl.value = Math.round(kg);
  }

  // Loading feed is a ramp, not a jump — the bar and the stability pill only
  // behave realistically if the weight climbs the way it does off a loader.
  function pour(targetDelta, seconds){
    if(drift) clearInterval(drift);
    var from = kg, to = kg + targetDelta, t0 = Date.now(), ms = (seconds||4)*1000;
    drift = setInterval(function(){
      var p = Math.min(1, (Date.now()-t0)/ms);
      var jitter = (p < 1) ? (Math.random()-0.5) * Math.abs(targetDelta) * 0.01 : 0;
      apply(from + (to-from)*p + jitter, p >= 1);
      if(p >= 1){ clearInterval(drift); drift = null; idle(); }
    }, 80);
  }

  // A real board keeps streaming while it sits at rest. Without that the
  // 3 s stability window drains and the reading falls back to "not stable"
  // a few seconds after every pour, which no physical scale does.
  var rest = null;
  function idle(){
    if(rest) clearInterval(rest);
    var base = kg;              // jitter around a fixed base, not the last
    rest = setInterval(function(){   // reading, or at-rest noise random-walks
      if(drift){ base = kg; return; }        // a pour owns the reading
      apply(base + (Math.random()-0.5) * 0.4, true);
    }, 400);
  }

  function panel(){
    var d = document.createElement('div');
    d.id = 'sim-panel';
    d.innerHTML =
      '<div class="sim-head">SCALE SIM <span id="sim-val">0 kg</span>' +
        '<button class="sim-x" onclick="document.getElementById(\'sim-panel\').classList.toggle(\'min\')">–</button></div>' +
      '<div class="sim-body">' +
        '<input type="range" id="sim-slider" min="0" max="12000" step="10" value="0">' +
        '<div class="sim-row">' +
          '<button data-add="500">+500</button>' +
          '<button data-add="1000">+1t</button>' +
          '<button data-add="-500">-500</button>' +
          '<button data-zero="1">0</button>' +
        '</div>' +
        '<div class="sim-row">' +
          '<button data-pour="6408">pour 6408</button>' +
          '<button data-pour="1495">pour 1495</button>' +
          '<button data-unstable="1">wobble</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(d);

    d.querySelector('#sim-slider').addEventListener('input', function(){ apply(+this.value, true); });
    d.addEventListener('click', function(e){
      var b = e.target.closest('button'); if(!b) return;
      if(b.dataset.add)      apply(kg + (+b.dataset.add), true);
      if(b.dataset.zero)     apply(0, true);
      if(b.dataset.pour)     pour(+b.dataset.pour, 5);
      if(b.dataset.unstable) wobble();
    });
  }

  // Shake the reading past the stability threshold for a moment, the way a
  // loader bucket dropping in does. Flipping weightStable on its own no
  // longer works — the repaint recomputes it from the samples.
  function wobble(){
    var base = kg, t0 = Date.now();
    if(drift) clearInterval(drift);
    drift = setInterval(function(){
      if(Date.now() - t0 > 1500){ clearInterval(drift); drift = null; apply(base, true); return; }
      apply(base + (Math.random()-0.5) * 120, false);
    }, 80);
  }

  function boot(){
    panel();
    apply(0, true);
    idle();
    console.log('[sim] scale simulator active — localhost only');
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
