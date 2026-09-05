function openProfilePicOptions(){
  var hasPhoto = !!localStorage.getItem(LS_PROFILE_PHOTO);
  document.getElementById('profile-remove-btn').style.display = hasPhoto ? 'flex' : 'none';
  document.getElementById('profile-pic-overlay').classList.add('open');
}

function closeProfilePicSheet(){
  document.getElementById('profile-pic-overlay').classList.remove('open');
}

function handleProfilePhoto(input){
  var file = input.files && input.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    var dataUrl = e.target.result;
    localStorage.setItem(LS_PROFILE_PHOTO, dataUrl);
    applyProfilePhoto(dataUrl);
    showToast('Profile photo updated','success');
  };
  reader.readAsDataURL(file);
  input.value = ''; // reset so same file can be picked again
}

function removeProfilePhoto(){
  localStorage.removeItem(LS_PROFILE_PHOTO);
  applyProfilePhoto(null);
  closeProfilePicSheet();
  showToast('Photo removed','warn');
}

function applyProfilePhoto(dataUrl){
  var av = document.getElementById('settings-avatar');
  if(!av) return;
  if(dataUrl){
    av.innerHTML = '<img src="'+dataUrl+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
    av.style.background = 'transparent';
    av.style.padding = '0';
  } else {
    // Restore initials
    var ini = (currentWorker && currentWorker.email) ? (currentWorker.email[0]||'?').toUpperCase() : '?';
    av.innerHTML = ini;
    av.style.background = '#2A7AE2';
  }
}

function loadProfilePhoto(){
  var saved = localStorage.getItem(LS_PROFILE_PHOTO);
  if(saved) applyProfilePhoto(saved);
}


// ── Update every yield unit label in the DOM to match current settings ──
// Called immediately on unit switch — does not need logs or field data
