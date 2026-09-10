"""Pure pixel renderer, shared by hardware and desktop layout tests."""
from fonts.tiny import GLYPHS
WIDTH = 128
HEIGHT = 32
BLACK, WHITE, DIM, GREEN, YELLOW, ORANGE = range(6)

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

def render(b, data, screen, state, age_minutes=0):
    b.fill(BLACK)
    rec=data.get('recommendation') if data else None
    disp=data.get('display',{}) if data else {}
    if not rec:
        text(b,state,2,3,max_width=124)
        text(b,'CHECK DASHBOARD' if state not in ('STARTING','CONNECTING TO WI-FI','LOADING COMMUTE') else 'PLEASE WAIT',2,14,DIM)
        text(b,'LEAVE BY',2,26,DIM)
        return
    color={'improving':GREEN,'stable':YELLOW,'worsening':ORANGE}.get(rec.get('trend'),YELLOW)
    if screen==1:
        text(b,'TRAFFIC '+rec.get('trend','stable'),2,2,color)
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
            if leave:
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
        text(b,'LEAVE BY' if rec.get('feasible') else 'LEAVE NOW',2,1,DIM)
        travel=str(rec.get('predictedTravelMinutes',0))+' MIN'
        text(b,travel,max(82,127-len(travel)*4),1,color,max_width=45)
        leave=disp.get('leaveTime','NOW').split(' ')
        text(b,leave[0],2,9,WHITE,3,76)  # 12:59 = 57 x 15 pixels.
        text(b,leave[1] if len(leave)>1 else '',80,9)
        text(b,'ARRIVE',80,16,DIM)
        text(b,disp.get('arriveTime','--:--'),80,22,WHITE,max_width=48)
    # Bottom 5-pixel strip never overlaps main time (y9..23).
    age=str(min(9999,max(0,age_minutes)))+'M OLD'
    label=('OFFLINE '+age) if state=='CACHED/OFFLINE' else age
    if screen!=2:text(b,label,2,27,ORANGE if state=='CACHED/OFFLINE' else DIM,max_width=124)
    elif state=='CACHED/OFFLINE': b[0,29]=ORANGE;b[1,29]=ORANGE
