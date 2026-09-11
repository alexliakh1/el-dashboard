import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'matrixportal'))
from layout import render, text, clock_label, eta_label, duration_label
from unittest.mock import patch
from protocol import validate
from network import decode_response
import json

class Bitmap:
    def __init__(self):self.pixels={}
    def fill(self,value):self.pixels={}
    def __setitem__(self,key,value):
        x,y=key
        assert 0<=x<128 and 0<=y<32
        self.pixels[key]=value

def payload():
    return dict(status='ok',serverEpoch=1788964200,utcOffsetSeconds=-25200,ageSeconds=0,refreshAfterSeconds=60,
        display=dict(brightness=.3,rotateScreens=True,leaveTime='12:59 PM',arriveTime='12:59 PM',changeTime='12:59 PM'),
        recommendation=dict(feasible=True,trend='worsening',leaveBy='2026-09-09T19:59:00Z',currentTravelMinutes=999,predictedTravelMinutes=999,trafficDelayMinutes=4,parkingWalkingMinutes=7,safetyBufferMinutes=5),
        predictions=[dict(departure='2026-09-09T19:00:00Z',minutes=20,time='12:00 PM'),dict(departure='2026-09-09T20:00:00Z',minutes=30,time='1:00 PM')])

class FirmwareTests(unittest.TestCase):
    def test_time_formatting_without_cpython_only_zfill(self):
        class CircuitPythonString(str):
            def zfill(self,*args):
                raise AttributeError("'str' object has no attribute 'zfill'")
        p=payload();p['display'].update(mode='eta',etaEpoch=29100,etaUtcOffsetSeconds=0)
        with patch('layout.str',CircuitPythonString,create=True):
            self.assertEqual(eta_label(p),'8:05 AM')
            self.assertEqual(duration_label(125),'2h 05m')
    def test_all_screens_fit_and_remain_visible(self):
        for state in ['STARTING','CONNECTING TO WI-FI','LOADING COMMUTE','NORMAL','CACHED/OFFLINE','NO ROUTE','MISSING CONFIGURATION','SERVER ERROR']:
            for screen in range(3):
                b=Bitmap();render(b,payload() if state in ('NORMAL','CACHED/OFFLINE') else None,screen,state,99999)
                self.assertTrue(b.pixels)
    def test_full_time_and_meridiem_fit_right_column(self):
        b=Bitmap();clock_label(b,'12:59 PM',2,3)
        time_pixels=[(x,y) for (x,y),color in b.pixels.items() if color==3]
        self.assertGreaterEqual(min(x for x,y in time_pixels),81)
        self.assertEqual(max(x for x,y in time_pixels),109)
        self.assertEqual(max(y for x,y in time_pixels),8)
        self.assertTrue(any(x>=114 for x,y in b.pixels))
        self.assertLessEqual(max(x for x,y in b.pixels),120)
    def test_long_labels_bounded(self):
        b=Bitmap();text(b,'VERY LONG DESTINATION '*20,80,22,max_width=48)
        self.assertLess(max(x for x,y in b.pixels),128)
    def test_malformed_data_does_not_replace_cache(self):
        old=validate(payload())
        for bad in [None,{},dict(status='ok'),dict(payload(),predictions=[None]),dict(payload(),display={})]:
            with self.assertRaises(ValueError):validate(bad)
        self.assertEqual(old['display']['leaveTime'],'12:59 PM')
        b=Bitmap();render(b,old,0,'CACHED/OFFLINE',12);self.assertIn(4,b.pixels.values())
    def test_freshness_warning_boundary_and_current_drive(self):
        p=payload();p['staleAfterSeconds']=420
        p['recommendation']['currentTravelMinutes']=28
        with patch('layout.board_text') as draw:
            render(Bitmap(),p,0,'CACHED/OFFLINE',6)
            labels=[c.args[1] for c in draw.call_args_list]
            self.assertIn('28 min',labels)
            self.assertIn('Delay',labels)
            self.assertFalse(any('Updated' in v for v in labels))
        with patch('layout.board_text') as draw:
            render(Bitmap(),p,0,'NORMAL',7)
            labels=[c.args[1] for c in draw.call_args_list]
            self.assertIn('Updated 7 min ago',labels)
            self.assertNotIn('Delay',labels)
    def test_eta_advances_through_midnight_without_a_fetch(self):
        p=payload();p['display'].update(mode='eta',etaEpoch=86340,etaUtcOffsetSeconds=0)
        self.assertEqual(eta_label(p),'11:59 PM')
        self.assertEqual(eta_label(p,60),'12:00 AM')
        validate(p)
        for age in (0,7,12,99,100,1500,99999):
            b=Bitmap();render(b,p,0,'NORMAL',age,60)
            self.assertLessEqual(max(x for x,y in b.pixels),123)
        p['display']['mode']='unknown'
        with self.assertRaises(ValueError):validate(p)
    def test_http_chunked_and_length(self):
        body=json.dumps(payload()).encode()
        raw=b'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: '+str(len(body)).encode()+b'\r\n\r\n'+body
        self.assertEqual(decode_response(raw)['status'],'ok')
        raw=b'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n'+hex(len(body))[2:].encode()+b'\r\n'+body+b'\r\n0\r\n\r\n'
        self.assertEqual(decode_response(raw)['status'],'ok')
        with self.assertRaises(ValueError):decode_response(b'HTTP/1.1 401 Unauthorized\r\n\r\n')

if __name__=='__main__':unittest.main()
