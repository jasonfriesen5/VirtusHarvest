function startGPSWatch(){
  if(!navigator.geolocation){ updateGPSPill('off'); return; }
  updateGPSPill('searching');
  gpsWatchId = navigator.geolocation.watchPosition(
    function(pos){
      lastGPSLat = parseFloat(pos.coords.latitude.toFixed(6));
      lastGPSLng = parseFloat(pos.coords.longitude.toFixed(6));
      lastGPSAccuracy = Math.round(pos.coords.accuracy||0);
      updateGPSPill('on');
      _gpsWasActive = true;
    },
    function(err){
      updateGPSPill('off');
      if(_gpsWasActive) logEvent('gps', 'GPS lost: '+(err.message||'no fix'));   // only log the ON→OFF transition, not every retry
      _gpsWasActive = false;
    },
    {enableHighAccuracy:true, maximumAge:15000, timeout:10000}
  );
}

function requestGPS(){
  if(!navigator.geolocation){ showToast('GPS not available on this device','error'); return; }
  if(lastGPSLat){ showToast('GPS active: '+lastGPSLat+', '+lastGPSLng,'success'); return; }
  showToast('Requesting GPS…','');
  updateGPSPill('searching');
  navigator.geolocation.getCurrentPosition(
    function(pos){
      lastGPSLat = parseFloat(pos.coords.latitude.toFixed(6));
      lastGPSLng = parseFloat(pos.coords.longitude.toFixed(6));
      lastGPSAccuracy = Math.round(pos.coords.accuracy||0);
      updateGPSPill('on');
      showToast('GPS acquired ±'+lastGPSAccuracy+'m','success');
      if(!gpsWatchId) startGPSWatch();
    },
    function(err){
      updateGPSPill('off');
      showToast('GPS unavailable: '+err.message,'error');
    },
    {enableHighAccuracy:true, timeout:12000, maximumAge:0}
  );
}

function updateGPSPill(state){
  var pill=document.getElementById('pill-gps');
  var txt=document.getElementById('pill-gps-txt');
  if(!pill) return;
  pill.className='gps-pill';
  if(state==='on'){
    pill.classList.add('gps-on');
    txt.textContent='GPS ✓';
  } else if(state==='searching'){
    pill.classList.add('gps-searching');
    txt.textContent='GPS…';
  } else {
    pill.classList.add('gps-off');
    txt.textContent='GPS';
  }
}

