"""Regression: saved 5% brightness blanked the 3-bit physical display."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'matrixportal'))
from brightness import scaled_colors

COLORS=(0x000000,0xFFFFFF,0x7C9BA9,0x75EF55,0xFFE353,0xFF702F)

class BrightnessTests(unittest.TestCase):
    def test_low_settings_leave_every_foreground_color_visible(self):
        for depth in (2,3,4):
            for value in (.05,.1,.15,.2,.3,1):
                with self.subTest(depth=depth,value=value):
                    palette=scaled_colors(COLORS,value,depth)
                    self.assertEqual(palette[0],0)
                    for color in palette[1:]:
                        channels=((color>>16)&255,(color>>8)&255,color&255)
                        self.assertTrue(any(c>>(8-depth) for c in channels),
                                        'All channels quantized to black')

    def test_normal_brightness_and_full_palette_stay_unchanged(self):
        self.assertEqual(scaled_colors(COLORS,1,3),COLORS)
        self.assertEqual(scaled_colors(COLORS,.3,3)[1],0x4c4c4c)

if __name__=='__main__':unittest.main()
