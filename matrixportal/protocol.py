"""Strict bounded response validation. No hardware imports."""
import math

def number(value, low, high):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and low<=value<=high

def validate(data):
    if not isinstance(data,dict) or data.get('status') not in ('ok','cached','loading','no_route','missing_configuration','server_error'):
        raise ValueError('Invalid status')
    for key in ('serverEpoch','ageSeconds','refreshAfterSeconds'):
        if not number(data.get(key),0,10000000000):raise ValueError('Invalid clock')
    if not number(data.get('utcOffsetSeconds'),-50400,50400):raise ValueError('Invalid timezone')
    disp=data.get('display')
    if not isinstance(disp,dict) or not number(disp.get('brightness'),0.05,1) or not isinstance(disp.get('rotateScreens'),bool):raise ValueError('Invalid display')
    for key in ('leaveTime','arriveTime','changeTime'):
        if not isinstance(disp.get(key),str) or len(disp[key])>12:raise ValueError('Invalid time label')
    rec=data.get('recommendation')
    if rec is not None:
        if not isinstance(rec,dict) or not isinstance(rec.get('feasible'),bool) or rec.get('trend') not in ('improving','stable','worsening'):raise ValueError('Invalid recommendation')
        for key in ('currentTravelMinutes','predictedTravelMinutes','trafficDelayMinutes','parkingWalkingMinutes','safetyBufferMinutes'):
            if not number(rec.get(key),0,100000):raise ValueError('Invalid travel time')
        if rec.get('leaveBy') is not None and (not isinstance(rec['leaveBy'],str) or len(rec['leaveBy'])>40):raise ValueError('Invalid departure')
    points=data.get('predictions')
    if not isinstance(points,list) or len(points)>20:raise ValueError('Invalid predictions')
    for p in points:
        if not isinstance(p,dict) or not number(p.get('minutes'),0,100000) or not isinstance(p.get('departure'),str) or len(p['departure'])>40 or not isinstance(p.get('time'),str) or len(p['time'])>12:raise ValueError('Invalid prediction')
    return data
