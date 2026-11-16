const F=globalThis.FocusFlowShield;
const error=document.getElementById('error');
const returnButton=document.getElementById('return-focusflow'),returnStatus=document.getElementById('return-status');

returnButton.addEventListener('click',async()=>{
 returnButton.disabled=true;error.textContent='';returnStatus.textContent='Looking for your existing FocusFlow tab…';
 let result;
 try{result=await F.sendRuntimeMessage(chrome.runtime,{namespace:'FF_SHIELD_BLOCKED_V1',kind:'return_focus'},3000);}
 catch(cause){result={ok:false,error:typeof cause?.message==='string'?cause.message:'Return to FocusFlow failed unexpectedly.'};}
 if(!result.ok){returnButton.disabled=false;returnStatus.textContent='';error.textContent=result.error?.includes('Unsupported extension message')?'The Distraction Shield service worker is out of date. Open chrome://extensions and reload the extension, then try again.':result.error||'Could not return to FocusFlow.';return;}
 returnStatus.textContent=result.opened
  ?'A new Study tab was opened. A saved checkpoint, if available, remains in local session history; camera and calibration must be set up again. No new session was started.'
  :result.matchedStudy?'Your existing Study tab was activated without reloading it.':'Your existing FocusFlow tab was activated without navigating it.';
 returnButton.disabled=false;
});

let domain='';
try{domain=F.normalizeDomain(new URLSearchParams(location.search).get('domain'));}catch{document.getElementById('domain').textContent='Blocked domain could not be validated.';}
chrome.storage.local.get(['blockedDomains'],state=>{
 const configured=F.domainList(state).find(item=>item.domain===domain&&item.enabled);
 if(!domain||!configured){document.getElementById('domain').textContent='Blocked domain could not be validated.';return;}
 document.getElementById('domain').textContent=domain;
});
