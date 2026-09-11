"""MatrixPortal S3: two horizontally chained 64x32 HUB75 panels."""
import os
import time
import gc
import board
import digitalio
import displayio
import framebufferio
import rgbmatrix
import wifi
import socketpool
import rtc
from layout import render
from protocol import validate
from network import request
from clock_sync import synchronize

PANEL_WIDTH=64
PANEL_HEIGHT=32
CHAIN_ACROSS=2
TILE_DOWN=1
DISPLAY_WIDTH=128
DISPLAY_HEIGHT=32
# Three-bit PWM leaves more scan-time headroom for a chained pair while preserving
# the solid white/green/orange signage palette. Override with PANEL_BIT_DEPTH=4
# when testing a particularly stable supply.
BIT_DEPTH=int(os.getenv('PANEL_BIT_DEPTH','3'))
if BIT_DEPTH not in (2,3,4):BIT_DEPTH=3
# Only 0/180 retain the horizontal layout. Serpentine affects multi-row tiling.
ROTATION=int(os.getenv('PANEL_ROTATION','0'))
if ROTATION not in (0,180):ROTATION=0
SERPENTINE=os.getenv('PANEL_SERPENTINE','0')=='1'
displayio.release_displays()
matrix=rgbmatrix.RGBMatrix(width=DISPLAY_WIDTH,height=DISPLAY_HEIGHT,bit_depth=BIT_DEPTH,
    rgb_pins=(board.MTX_R1,board.MTX_G1,board.MTX_B1,board.MTX_R2,board.MTX_G2,board.MTX_B2),
    addr_pins=(board.MTX_ADDRA,board.MTX_ADDRB,board.MTX_ADDRC,board.MTX_ADDRD),
    clock_pin=board.MTX_CLK,latch_pin=board.MTX_LAT,output_enable_pin=board.MTX_OE,
    tile=TILE_DOWN,serpentine=SERPENTINE,doublebuffer=True)
display=framebufferio.FramebufferDisplay(matrix,rotation=ROTATION,auto_refresh=False)
palette=displayio.Palette(6)
colors=(0x000000,0xFFFFFF,0x7C9BA9,0x75EF55,0xFFE353,0xFF702F)
def brightness(value):
    # RGBMatrix.brightness is on/off, so scale RGB channels instead.
    for i,color in enumerate(colors):
        palette[i]=(int((color>>16)*value)<<16)|(int(((color>>8)&255)*value)<<8)|int((color&255)*value)
brightness(0.3)
bitmaps=[displayio.Bitmap(128,32,6),displayio.Bitmap(128,32,6)]
tiles=[displayio.TileGrid(b,pixel_shader=palette) for b in bitmaps]
group=displayio.Group();group.append(tiles[0]);display.root_group=group
buffer_index=0
data=None;state='STARTING';screen=0;received=0;next_fetch=0;failures=0
last_draw=-1;last_frame=None;transfer=None;pool=None
up=digitalio.DigitalInOut(board.BUTTON_UP);up.switch_to_input(pull=digitalio.Pull.UP)
down=digitalio.DigitalInOut(board.BUTTON_DOWN);down.switch_to_input(pull=digitalio.Pull.UP)
last_buttons=(False,False);button_changed=0

def radio_idle():
    global pool
    # Requests close their sockets before this is called. Recreate the pool after
    # reconnecting; sockets from a previous radio session must not be reused.
    pool=None
    wifi.radio.enabled=False

radio_idle()
def draw(now):
    global buffer_index,last_draw,last_frame
    age=int((data.get('ageSeconds',0)+now-received)/60) if data else 0
    elapsed=max(0,now-received) if data else 0
    effective=state
    eta_minute=int((data.get('display',{}).get('etaEpoch',0)+elapsed)/60) if data else 0
    frame=(id(data),screen,effective,age,eta_minute)
    last_draw=now
    if frame==last_frame:return
    buffer_index=1-buffer_index
    render(bitmaps[buffer_index],data,screen,effective,age,elapsed)
    group[0]=tiles[buffer_index]
    display.refresh(minimum_frames_per_second=0)
    last_frame=frame
draw(time.monotonic())
ssid=os.getenv('CIRCUITPY_WIFI_SSID');password=os.getenv('CIRCUITPY_WIFI_PASSWORD')
url=os.getenv('COMMUTE_API_URL','');token=os.getenv('COMMUTE_DISPLAY_TOKEN','')
bypass=os.getenv('OAI_SITES_TOKEN','')
configured=bool(ssid and password and url)
if not configured:state='MISSING CONFIGURATION'
elif not url.startswith('https://') and os.getenv('ALLOW_INSECURE_HTTP','0')!='1':
    configured=False;state='MISSING CONFIGURATION'
while True:
    now=time.monotonic()
    buttons=(not up.value,not down.value)
    if buttons!=last_buttons and now-button_changed>.15:
        if buttons==(True,True):next_fetch=0
        last_buttons=buttons;button_changed=now;last_draw=-1
    # The saved drive/ETA setting selects one steady screen; no automatic rotation.
    screen=0
    if now-last_draw>=1:draw(now)
    if configured and now>=next_fetch:
        try:
            if transfer is None:
                wifi.radio.enabled=True
                if not wifi.radio.connected:
                    if not data:state='CONNECTING TO WI-FI'
                    draw(now)
                    wifi.radio.connect(ssid,password,timeout=3)
                    pool=socketpool.SocketPool(wifi.radio)
                if pool is None:pool=socketpool.SocketPool(wifi.radio)
                if time.localtime().tm_year<2024:synchronize(pool)
                state='CACHED/OFFLINE' if data and failures else ('NORMAL' if data else 'LOADING COMMUTE')
                draw(now);transfer=request(pool,url,token,bypass)
            result=next(transfer)
            if result is not None:
                candidate=validate(result)
                # Complete and close the generator/socket before installing data.
                transfer.close();transfer=None
                radio_idle()
                if candidate['status']=='no_route':
                    data=None;state='NO ROUTE'
                elif candidate.get('recommendation'):
                    data=candidate;received=time.monotonic()
                    state='CACHED/OFFLINE' if candidate['status']=='cached' else 'NORMAL'
                    brightness(candidate['display']['brightness'])
                elif candidate['status'] in ('missing_configuration','no_route'):
                    data=None;state='MISSING CONFIGURATION' if candidate['status']=='missing_configuration' else 'NO ROUTE'
                elif candidate['status'] in ('server_error','loading'):
                    state='CACHED/OFFLINE' if data else ('SERVER ERROR' if candidate['status']=='server_error' else 'LOADING COMMUTE')
                print('Commute loaded:',candidate['status'])
                # Keep RTC in UTC for TLS; display labels are localized by the server.
                rtc.RTC().datetime=time.localtime(candidate['serverEpoch'])
                next_fetch=time.monotonic()+max(30,min(3600,candidate['refreshAfterSeconds']))
                failures=0;last_draw=-1;gc.collect()
        except (OSError,ValueError,RuntimeError,KeyError,TypeError,StopIteration) as error:
            print('Commute connection failed:',type(error).__name__)
            try:
                if transfer:transfer.close()
            finally:
                radio_idle()
            transfer=None;failures+=1
            state='CACHED/OFFLINE' if data else 'SERVER ERROR'
            next_fetch=time.monotonic()+min(300,5*(2**min(failures,6)))
            last_draw=-1;gc.collect()
    time.sleep(.02)
