"""Palette brightness for a matrix with a reduced scan bit depth."""

def scaled_colors(colors, value, bit_depth):
    # RGBMatrix drops low channel bits. Keep even the dimmest foreground
    # color above one scan level, with one byte of rounding headroom for
    # CircuitPython's floats. This avoids software PWM, which can flicker.
    peaks=[max((c>>16)&255,(c>>8)&255,c&255) for c in colors if c]
    minimum=min(1.0,((1<<(8-bit_depth))+1)/min(peaks)) if peaks else 0
    value=max(minimum,min(1.0,max(0.0,value)))
    return tuple((int((color>>16)*value)<<16) |
                 (int(((color>>8)&255)*value)<<8) |
                 int((color&255)*value) for color in colors)
