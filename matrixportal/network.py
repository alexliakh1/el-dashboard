"""Bounded HTTP client; yields between socket operations to keep UI responsive.

DNS, Wi-Fi association and TLS connect are CircuitPython synchronous primitives.
Panel scanout continues in hardware during their bounded connect timeouts.
Response waiting/reading uses nonblocking sockets and never freezes the UI loop.
"""
import json
import time
import ssl
import os

MAX_BODY=12000
def decode_response(raw):
    header,body=raw.split(b'\r\n\r\n',1)
    lines=header.decode().split('\r\n')
    if lines[0].split(' ')[1]!='200':raise ValueError('Server rejected request')
    headers={}
    for line in lines[1:]:
        key,value=line.split(':',1);headers[key.lower()]=value.strip().lower()
    if 'application/json' not in headers.get('content-type',''):raise ValueError('Expected JSON')
    if headers.get('transfer-encoding')=='chunked':
        decoded=bytearray()
        while True:
            line,body=body.split(b'\r\n',1);count=int(line.split(b';')[0],16)
            if count==0:break
            if len(body)<count+2 or body[count:count+2]!=b'\r\n':raise ValueError('Truncated chunk')
            decoded.extend(body[:count]);body=body[count+2:]
            if len(decoded)>MAX_BODY:raise ValueError('Response too large')
        body=decoded
    elif 'content-length' in headers and len(body)!=int(headers['content-length']):raise ValueError('Truncated response')
    if len(body)>MAX_BODY:raise ValueError('Response too large')
    return json.loads(bytes(body).decode('utf-8'))

def request(pool,url,token='',bypass=''):
    scheme,rest=url.split('://',1)
    host,sep,path=rest.partition('/')
    if scheme not in ('https','http') or not host or '@' in host or any(c in url for c in '\r\n'):
        raise ValueError('Invalid server URL')
    hostname=host.split(':')[0]
    port=int(host.split(':')[1]) if ':' in host else (443 if scheme=='https' else 80)
    sock=None
    try:
        yield None
        address=pool.getaddrinfo(hostname,port)[0][-1]
        sock=pool.socket(pool.AF_INET,pool.SOCK_STREAM)
        if scheme=='https':
            context=ssl.create_default_context()
            # Explicit official root supplements firmware builds with a reduced CA bundle.
            with open(os.getenv('COMMUTE_CA_FILE','/certs/gts-root-r4.pem')) as cert:
                context.load_verify_locations(cadata=cert.read())
            sock=context.wrap_socket(sock,server_hostname=hostname)
        sock.settimeout(3)
        sock.connect(address)
        yield None
        sock.settimeout(0)
        headers='GET /'+path+' HTTP/1.1\r\nHost: '+host+'\r\nAccept: application/json\r\nAccept-Encoding: identity\r\nConnection: close\r\n'
        if token:headers+='Authorization: Bearer '+token+'\r\n'
        if bypass:headers+='OAI-Sites-Authorization: Bearer '+bypass+'\r\n'
        output=(headers+'\r\n').encode();sent=0;deadline=time.monotonic()+90
        while sent<len(output):
            if time.monotonic()>deadline:raise OSError('Send timed out')
            try:sent+=sock.send(output[sent:])
            except OSError as e:
                if e.errno not in (11,35,110,116):raise
            yield None
        raw=bytearray();chunk=bytearray(512)
        while time.monotonic()<deadline:
            try:
                count=sock.recv_into(chunk)
                if count==0:
                    yield decode_response(raw)
                    return
                raw.extend(memoryview(chunk)[:count])
                if len(raw)>MAX_BODY+4096:raise ValueError('Response too large')
            except OSError as e:
                if e.errno not in (11,35,110,116):raise
            yield None
        raise OSError('Read timed out')
    finally:
        if sock:sock.close()
