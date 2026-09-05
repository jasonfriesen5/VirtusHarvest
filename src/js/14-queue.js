function refreshQueue(){
  var q=getQueue();document.getElementById('queue-count').textContent=q.length;
  document.getElementById('queue-banner').classList.toggle('hidden',q.length===0);
  // Unsynced indicator beside the sync button — shows the total WEIGHT of
  // transactions saved locally but not yet pushed to the cloud.
  var up=document.getElementById('unsynced-pill');
  if(up){
    var unsyncedKg=q.reduce(function(s,l){ return s+(l.weight||0); }, 0);
    var uc=document.getElementById('unsynced-count'); if(uc) uc.textContent=fmtWt(unsyncedKg,'');
    up.classList.toggle('hidden', q.length===0);
  }
  // Sync button: green glassy glow when everything's synced, white when loads
  // are pending. (Don't touch it mid-upload — the spin state owns it then.)
  var sc=document.getElementById('sync-circle');
  if(sc && !sc.classList.contains('syncing')){
    sc.classList.remove('error');
    sc.classList.toggle('synced', q.length===0);
  }
  updateSyncStatus();
}

function updateSyncStatus(){
  var q=getQueue(),el=document.getElementById('set-sync-status');
  if(el)el.textContent=q.length?q.length+' '+T('pending')+' | '+(isOnline?T('Online'):T('Offline')):T('All synced');
}

async function syncQueue(){
  if(syncInProgress||!isOnline){if(!isOnline)showToast('No connection','error');return;}
  // Recover session if currentWorker.id is missing
  var _sbQ = getSupabase();
  if(_sbQ && (!currentWorker || !currentWorker.id)){
    try{
      var _sqSess = await _sbQ.auth.getSession();
      var _sqUser = _sqSess && _sqSess.data && _sqSess.data.session && _sqSess.data.session.user;
      if(_sqUser){ currentWorker = currentWorker||{}; currentWorker.id = _sqUser.id; currentWorker.email = _sqUser.email; localStorage.setItem(LS_WORKER, JSON.stringify(currentWorker)); }
    } catch(e){}
  }
  var queue=getQueue();

  // Config (farms, trucks, seasons…) must push even when no weighings are
  // pending — it used to sit below the early return, so on a device with an
  // empty queue nothing config-side ever reached the cloud.
  await pushConfig();

  if(!queue.length){
    // Refresh status and show up to date message
    updateCloudPanel();
    refreshQueue();
    showToast('All records synced ✓','success');
    return;
  }

  // Not signed in → keep everything queued locally, don't attempt upload.
  // Records stay safe and will sync once the operator logs in.
  if(_sbQ && (!currentWorker || !currentWorker.id)){
    refreshQueue();
    showToast(queue.length+' saved locally — sign in to upload','warn');
    return;
  }

  syncInProgress=true;
  var btn=document.getElementById('btn-sync');
  if(btn){btn.textContent='Syncing...';btn.disabled=true;}
  var sc=document.getElementById('sync-circle'); if(sc) sc.className='sync-circle syncing';
  var sb2=document.getElementById('sync-badge'); if(sb2) sb2.classList.add('hidden');

  var sb = getSupabase();
  var synced=0, failed=[];

  for(var i=0;i<queue.length;i++){
    var entry = queue[i];
    try{
      if(sb){
        // ── Supabase sync ──
        var row = {
          id:            entry.id,
          user_id:       currentWorker&&currentWorker.id ? currentWorker.id : null,
          worker:        entry.worker,
          farm:          entry.farm,
          buggy:         entry.buggy,
          crop:          entry.crop,
          zone:          entry.zone,
          field_id:      entry.fieldId||null,
          // Without this the record round-trips back seasonless and every
          // season-filtered view on another device drops it. See getSeasonLogs().
          season_id:     entry.seasonId||null,
          unload:        entry.unload||null,
          delivered_to:  entry.deliveredTo||null,
          weight:        entry.weight,
          wet_weight:    entry.wetWeight||entry.weight,
          dry_weight:    entry.dryWeight||entry.weight,
          moisture:      entry.moisture||0,
          unit:          entry.unit||'kg',
          notes:         entry.notes||null,
          timestamp:     entry.timestamp,
          lat:           entry.lat||null,
          lng:           entry.lng||null,
          is_truck_empty: entry.isTruckEmpty||false,
          auto_detected:  entry.autoDetected||false,
          synced:         true
        };
        var result = await sb.from('weighings').upsert(row);
        if(result.error) throw result.error;
        synced++;
        markSynced(entry.id);
      } else {
        // ── Fallback: legacy REST endpoint ──
        var apiUrl = getApiUrl();
        if(!apiUrl||apiUrl.includes('your-backend')){ failed.push(entry); continue; }
        var r=await fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry),signal:AbortSignal.timeout(8000)});
        if(r.ok){synced++;markSynced(entry.id);}else failed.push(entry);
      }
    }catch(e){
      console.warn('Sync error for entry '+entry.id+':', e.message||e);
      failed.push(entry);
    }
  }

  localStorage.setItem(LS_QUEUE,JSON.stringify(failed));
  syncInProgress=false;
  if(btn){btn.textContent='Sync';btn.disabled=false;}
  var sc2=document.getElementById('sync-circle'); if(sc2) sc2.className = failed.length?'sync-circle error':'sync-circle synced';
  refreshQueue();renderLogs();

  if(synced>0){
    var now = new Date().toISOString();
    localStorage.setItem('vf_last_sync', now);
    updateCloudPanel();
    showToast('Synced '+synced+' record'+(synced>1?'s':''),'success');
  } else if(failed.length>0){
    showToast('Sync failed — '+failed.length+' record'+(failed.length>1?'s':'')+' pending','error');
    logEvent('sync', failed.length+' record'+(failed.length>1?'s':'')+' failed to sync');
  }
  updateCloudPanel();
}

function markSynced(id){var logs=getLogs(),i=logs.findIndex(function(l){return l.id===id;});if(i!==-1){logs[i].synced=true;localStorage.setItem(LS_LOGS,JSON.stringify(logs));}}
function autoSync(){if(getQueue().length&&isOnline&&!syncInProgress)setTimeout(syncQueue,800);}

