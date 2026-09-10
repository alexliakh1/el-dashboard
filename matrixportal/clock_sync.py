"""Set a UTC RTC before TLS. NTP carries no application credentials."""
import os
import time
import rtc

def synchronize(pool):
    address=pool.getaddrinfo('time.cloudflare.com',123)[0][-1]
    packet=bytearray(48)
    packet[0]=0x23
    packet[40:48]=os.urandom(8)
    sock=pool.socket(pool.AF_INET,pool.SOCK_DGRAM)
    try:
        sock.settimeout(3)
        sock.sendto(packet,address)
        response=bytearray(48)
        count,source=sock.recvfrom_into(response)
        if count!=48 or source[0]!=address[0] or source[1]!=123 or response[0]&7!=4 or response[0]>>6==3 or not 1<=response[1]<=15 or response[24:32]!=packet[40:48]:
            raise ValueError('Invalid time response')
        epoch=int.from_bytes(response[40:44],'big')-2208988800
        if epoch<1704067200:raise ValueError('Invalid server time')
        rtc.RTC().datetime=time.localtime(epoch)
    finally:
        sock.close()
