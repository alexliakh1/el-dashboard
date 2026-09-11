"""Pure pixel renderer, shared by hardware and desktop layout tests."""
from fonts.tiny import GLYPHS
from fonts.board import GLYPHS as BOARD_GLYPHS
WIDTH = 128
HEIGHT = 32
BLACK, WHITE, DIM, GREEN, YELLOW, ORANGE = range(6)

def board_text(b, value, x, y, color=WHITE, max_width=128):
    """Native 5x7 strokes; never enlarge the tiny font for primary labels."""
    count=max(0,(min(max_width,WIDTH-x)+1)//6)
    value=str(value)
    if len(value)>count:value=value[:max(0,count-1)]+'.' if count else ''
    for char in value:
        for row,bits in enumerate(BOARD_GLYPHS.get(char,BOARD_GLYPHS['?'])):
            for col in range(5):
                if bits & (16>>col) and 0<=x+col<WIDTH and 0<=y+row<HEIGHT:
                    b[x+col,y+row]=color
        x+=6

def badge(b,y,color,arrival=False):
    # Sparse outlined icons keep power draw low, with no flashing indicators.
    if arrival:
        line(b,3,y,3,y+10,color)
        line(b,4,y,10,y,color);line(b,10,y,10,y+5,color)
        line(b,4,y+5,10,y+5,color)
        b[5,y+2]=color;b[8,y+3]=color
    else:
        line(b,3,y,9,y,color);line(b,3,y,1,y+4,color)
        line(b,9,y,11,y+4,color);line(b,1,y+4,11,y+4,color)
        line(b,1,y+4,1,y+8,color);line(b,11,y+4,11,y+8,color)
        line(b,1,y+8,11,y+8,color)
        b[3,y+6]=WHITE;b[9,y+6]=WHITE
        b[2,y+9]=color;b[10,y+9]=color

def clock_label(b,value,y,color):
    parts=str(value).split(' ')
    clock=parts[0]
    board_text(b,clock,110-min(29,len(clock)*6-1),y,color,max_width=29)
    text(b,parts[1] if len(parts)>1 else '',114,y+2,DIM,max_width=8)

def text(bitmap, value, x, y, color=WHITE, scale=1, max_width=128):
    value = str(value).upper()
    count = max(0, (min(max_width, WIDTH-x)+scale)//(4*scale))
    if len(value) > count:
        value = value[:max(0,count-1)] + '.' if count else ''
    for char in value:
        glyph = GLYPHS.get(char, GLYPHS['?'])
        for row, bits in enumerate(glyph):
            for col in range(3):
                if bits & (4 >> col):
                    for dy in range(scale):
                        for dx in range(scale):
                            px, py = x+col*scale+dx, y+row*scale+dy
                            if 0 <= px < WIDTH and 0 <= py < HEIGHT:
                                bitmap[px,py] = color
        x += 4*scale

def line(b, x0,y0,x1,y1,color):
    dx,dy=abs(x1-x0),-abs(y1-y0)
    sx,sy=1 if x0<x1 else -1,1 if y0<y1 else -1
    err=dx+dy
    while True:
        if 0<=x0<WIDTH and 0<=y0<HEIGHT: b[x0,y0]=color
        if x0==x1 and y0==y1: break
        e=2*err
        if e>=dy: err+=dy; x0+=sx
        if e<=dx: err+=dx; y0+=sy

def two_digits(value):
    # CircuitPython does not implement str.zfill.
    return ('0' if value<10 else '')+str(value)

def duration_label(minutes):
    minutes=max(0,int(minutes))
    if minutes<100:return str(minutes)+' min'
    if minutes<6000:return str(minutes//60)+'h '+two_digits(minutes%60)+'m'
    return str(minutes//60)+'h'

def updated_label(age_minutes):
    age=max(0,int(age_minutes))
    if age<100:return 'Updated '+str(age)+' min ago'
    if age<1440:return 'Updated '+str(age//60)+' hr ago'
    return 'Updated '+str(min(999,age//1440))+'d ago'

def eta_label(data,elapsed_seconds=0):
    disp=data.get('display',{})
    local=int(disp.get('etaEpoch',data['serverEpoch'])+elapsed_seconds+disp.get('etaUtcOffsetSeconds',data['utcOffsetSeconds']))
    minute=(local//60)%60;hour=(local//3600)%24
    return str(hour%12 or 12)+':'+two_digits(minute)+(' AM' if hour<12 else ' PM')

def warning(b,y):
    line(b,7,y,1,y+10,YELLOW);line(b,1,y+10,13,y+10,YELLOW);line(b,13,y+10,7,y,YELLOW)
    line(b,7,y+3,7,y+6,YELLOW);b[7,y+8]=YELLOW

def render(b, data, screen, state, age_minutes=0, elapsed_seconds=0):
    b.fill(BLACK)
    rec=data.get('recommendation') if data else None
    disp=data.get('display',{}) if data else {}
    if not rec:
        titles={'STARTING':'Starting','CONNECTING TO WI-FI':'Connecting Wi-Fi',
            'LOADING COMMUTE':'Loading commute','NO ROUTE':'No route',
            'MISSING CONFIGURATION':'Setup needed','SERVER ERROR':'Server error'}
        board_text(b,titles.get(state,state),2,3,max_width=124)
        text(b,'CHECK DASHBOARD' if state not in ('STARTING','CONNECTING TO WI-FI','LOADING COMMUTE') else 'PLEASE WAIT',2,18,DIM)
        return
    color={'improving':GREEN,'stable':YELLOW,'worsening':ORANGE}.get(rec.get('trend'),YELLOW)
    if screen==1:
        board_text(b,'Traffic '+rec.get('trend','stable'),2,2,color,max_width=124)
        change=disp.get('changeTime','')
        text(b,('CHANGE '+change) if change else 'STEADY ROAD AHEAD',2,12)
        text(b,'CHECK LEAVE-BY TIME',2,20,DIM)
    elif screen==2:
        points=data.get('predictions',[])[:10]
        if len(points)>1:
            values=[p['minutes'] for p in points]
            low,high=max(0,int(min(values))-2),int(max(values))+2
            text(b,str(high)+'M',0,1,DIM,max_width=20)
            text(b,str(low)+'M',0,16,DIM,max_width=20)
            coords=[(22+int(i*103/(len(points)-1)),20-int((v-low)*17/max(1,high-low))) for i,v in enumerate(values)]
            line(b,21,1,21,21,DIM);line(b,21,21,127,21,DIM)
            for i in range(len(coords)-1): line(b,*coords[i],*coords[i+1],color)
            # ISO UTC strings sort chronologically; highlight nearest leave sample.
            leave=rec.get('leaveBy')
            if leave and points[0]['departure'] <= leave <= points[-1]['departure']:
                index=0
                for i,p in enumerate(points):
                    if p['departure']<=leave:index=i
                x,y=coords[index]
                for dx in (-1,0,1):
                    for dy in (-1,0,1):
                        if 0<=x+dx<128 and 0<=y+dy<24:b[x+dx,y+dy]=WHITE
            text(b,points[0].get('time','').replace(' AM','').replace(' PM',''),23,23,DIM,max_width=40)
            text(b,points[-1].get('time','').replace(' AM','').replace(' PM',''),98,23,DIM,max_width=30)
        else: text(b,'WAITING FOR FORECAST',2,10,DIM)
    else:
        stale=age_minutes*60>=data.get('staleAfterSeconds',420)
        is_eta=disp.get('mode','drive')=='eta'
        badge(b,4,DIM)
        board_text(b,'Arrive' if is_eta else 'Drive',20,5,max_width=47)
        value=eta_label(data,elapsed_seconds) if is_eta else duration_label(rec.get('currentTravelMinutes',0))
        board_text(b,value,124-(len(value)*6-1),5,YELLOW if stale else GREEN,max_width=53)
        if stale:
            board_text(b,updated_label(age_minutes),8,22,YELLOW,max_width=116)
        elif rec.get('trafficDelayMinutes',0)>=1:
            warning(b,19)
            board_text(b,'Delay',20,22,max_width=47)
            value='+'+duration_label(rec['trafficDelayMinutes'])
            board_text(b,value,124-(len(value)*6-1),22,YELLOW,max_width=53)
        else:
            line(b,2,24,5,27,GREEN);line(b,5,27,12,20,GREEN)
            board_text(b,'No added delay',20,22,max_width=104)
        return
    # Bottom 5-pixel strip never overlaps main time (y9..23).
    age=str(min(9999,max(0,age_minutes)))+'M OLD'
    label=('OFFLINE '+age) if state=='CACHED/OFFLINE' else age
    if screen!=2:text(b,label,2,27,ORANGE if state=='CACHED/OFFLINE' else DIM,max_width=124)
    elif state=='CACHED/OFFLINE': b[0,29]=ORANGE;b[1,29]=ORANGE

