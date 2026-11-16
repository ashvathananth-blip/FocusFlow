import {describe,it,expect,vi} from 'vitest';
import {isAllowedWebsiteCommand,isCurrentStatusRequest,lifecycleMessage,makeShieldMessage,SHIELD_ORIGIN,shouldRetryStatus,validOpenSettingsResponse,validShieldAck,validWebsiteStatusEnvelope,withAckTimeout} from '@/lib/extension/bridge';
describe('FocusFlow Shield page bridge',()=>{
  it('uses only the localhost origin and versioned monotonically numbered messages',()=>{
    expect(SHIELD_ORIGIN).toBe('http://localhost:3000');
    expect(makeShieldMessage('heartbeat','session-1',15)).toEqual({protocol:'FOCUSFLOW_SHIELD_V1',version:1,type:'heartbeat',sessionId:'session-1',sequence:15});
    expect(()=>makeShieldMessage('start','',0)).toThrow();expect(()=>makeShieldMessage('start','x',-1)).toThrow();
  });
  it('maps canonical session lifecycle and manual pause, independent of gaze state',()=>{
    const idle={lifecycle:'idle',manual:false},run={lifecycle:'running',manual:false},paused={lifecycle:'running',manual:true};
    expect(lifecycleMessage(idle,run)).toBe('start');expect(lifecycleMessage(run,paused)).toBe('pause');expect(lifecycleMessage(paused,run)).toBe('resume');
    expect(lifecycleMessage(run,{lifecycle:'completed',manual:false})).toBe('complete');expect(lifecycleMessage(run,{lifecycle:'ended',manual:false})).toBe('end');
    expect(lifecycleMessage(run,{lifecycle:'running',manual:false})).toBeNull();
  });
  it('accepts only versioned acknowledgements with validated blocking state',()=>{
    const ack={protocol:'FOCUSFLOW_SHIELD_V1',version:1,type:'ack',sequence:3,acknowledged:true,state:{sessionActive:true,syncLost:false,blockingActive:true}};
    expect(validShieldAck(ack)).toBe(true);expect(validShieldAck({...ack,version:2})).toBe(false);expect(validShieldAck({...ack,state:{sessionActive:'yes'}})).toBe(false);
  });
  it('accepts a read-only status response with only approved count fields',()=>{
    const response={protocol:'FOCUSFLOW_SHIELD_V1',version:1,type:'status_response',requestId:'r-1',connected:true,masterEnabled:true,sessionActive:true,blockingActive:true,installedRuleCount:2,configuredDomainCount:5,enabledDomainCount:4,permittedDomainCount:3,activelyBlockedDomainCount:2,permissionMissingCount:1};
    expect(validWebsiteStatusEnvelope(response,'r-1')).toBe(true);expect(validWebsiteStatusEnvelope({...response,domains:['secret.example']},'r-1')).toBe(false);expect(validWebsiteStatusEnvelope({...response,installedRuleCount:-1},'r-1')).toBe(false);expect(validWebsiteStatusEnvelope(response,'r-2')).toBe(false);
  });
  it('allows only the parameter-free options command and rejects domain mutations',()=>{
    const open={protocol:'FOCUSFLOW_SHIELD_V1',version:1,type:'open_settings',requestId:'settings-open-1'};expect(isAllowedWebsiteCommand(open)).toBe(true);expect(isAllowedWebsiteCommand({...open,domain:'example.org'})).toBe(false);expect(isAllowedWebsiteCommand({...open,type:'add_domain',domain:'example.org'})).toBe(false);expect(isAllowedWebsiteCommand({...open,version:2})).toBe(false);
  });
  it('validates correlated success and error responses for opening options',()=>{const success={protocol:'FOCUSFLOW_SHIELD_V1',version:1,type:'open_settings_response',requestId:'settings-open-1',ok:true};expect(validOpenSettingsResponse(success,'settings-open-1')).toBe(true);expect(validOpenSettingsResponse({...success,ok:false,error:'Worker unavailable'},'settings-open-1')).toBe(true);expect(validOpenSettingsResponse({...success,requestId:'stale'},'settings-open-1')).toBe(false)});
  it('does not let an older settings status request overwrite a newer request',()=>{expect(isCurrentStatusRequest(9,'1700000000000-9')).toBe(true);expect(isCurrentStatusRequest(9,'1700000000000-8')).toBe(false)});
  it('retries extension status a bounded number of times',()=>{expect(shouldRetryStatus(1)).toBe(true);expect(shouldRetryStatus(2)).toBe(true);expect(shouldRetryStatus(3)).toBe(false);expect(shouldRetryStatus(1,1)).toBe(false);expect(shouldRetryStatus(0)).toBe(false)});
  it('bounds the Settings shortcut acknowledgement wait',async()=>{vi.useFakeTimers();const waiting=withAckTimeout(new Promise(()=>{}),2800,'timed out');vi.advanceTimersByTime(2800);await expect(waiting).resolves.toBe('timed out');vi.useRealTimers()});
});
