# MatrixPortal S3 — 128×32 Leave by display

## Hardware and wiring

Use two ordinary 64×32, 1:16-scan HUB75 full-color panels. Specialty scan patterns or
nonstandard driver ICs may need a different driver and require bench verification.

```text
MatrixPortal S3 HUB75 → Panel 1 IN
                      Panel 1 OUT → Panel 2 IN

[ Panel 1: 64 × 32 ][ Panel 2: 64 × 32 ]  = 128 × 32

Regulated 5V supply → both panels' 5V / GND power connectors
                     shared ground with MatrixPortal
```

- Disconnect power before changing panel ribbon or power wiring.
- Both panels require regulated **5V**. Allow approximately **5V / 8A** for two
  panels at high brightness; follow the actual panel specifications if higher.
- Connect +5V and GND to the correctly labeled terminals on **both** panels.
  Use adequately rated leads/distribution and a common ground. Verify polarity.
- The MatrixPortal plugs into Panel 1 **IN**. Panel 1 **OUT** connects by ribbon to
  Panel 2 **IN**. Align connector keys and pin-1 markings.
- Do not expect a computer USB port to power both panels at high brightness.
  Follow Adafruit's power arrangement for the S3 and avoid unintended back-feeding
  between supplies. Check your board revision's power connections before energizing.
- Default brightness is 30%. Insufficient power can cause flicker, incorrect colors,
  resets, or scrambled output. Software dimming cannot repair wiring or an
  undersized power supply.

## Install

1. Install the current stable **CircuitPython build for Adafruit MatrixPortal S3**
   from [CircuitPython.org](https://circuitpython.org/board/adafruit_matrixportal_s3/).
   Use the S3 build, not the MatrixPortal M4 build. Connect using a USB data cable.
2. Copy these files to the root of **CIRCUITPY**:
   `code.py`, `layout.py`, `network.py`, `protocol.py`, `clock_sync.py`, `certs/`, and the complete `fonts/`
   folder (including `__init__.py`, `board.py`, and `tiny.py`). Keep `lib/` available.
3. Copy `settings.toml.example` as **settings.toml** on the device, then set your
   Wi-Fi credentials, HTTPS `/api/display` URL, and separate read-only display token.
   Never copy the TomTom key. Never commit settings.toml.
4. For a private Sites server, also set its existing access token in OAI_SITES_TOKEN.
   This is separate from both the application display token and TomTom key. Leave
   it blank on a standalone server. No token is printed to the serial console.
5. Save the dashboard's route/arrival settings and power-cycle the panel. It should
   show Starting → Connecting to Wi-Fi → Loading commute → the departure time.

No downloaded font or third-party CircuitPython bundle is required: the firmware
uses built-in `displayio`, `rgbmatrix`, `framebufferio`, `wifi`, `socketpool`, `ssl`,
`rtc`, `digitalio`, `board`, `json`, `time`, `os`, `gc`, and `math`.
`fonts/board.py` is an original bundled CC0 mixed-case 5×7 alphabet for crisp
primary labels and times. `fonts/tiny.py` supplies 3×5 secondary labels. The longest
time, `12:59`, occupies 29×7 pixels, with AM/PM alongside. No desktop font is needed.

## Panel configuration

`code.py` declares PANEL_WIDTH=64, PANEL_HEIGHT=32, CHAIN_ACROSS=2, TILE_DOWN=1,
DISPLAY_WIDTH=128, DISPLAY_HEIGHT=32, and BIT_DEPTH=4. The RGBMatrix constructor uses
width=128, height=32, tile=1, serpentine=False, and doublebuffer=True.

Set PANEL_ROTATION to `0` or `180` if the entire assembly is upside down. Avoid
90/270 because those make the logical surface 32×128. PANEL_SERPENTINE=`1` is exposed
for alternate arrangements, but a single horizontal row normally requires `0`;
serpentine changes alternate **rows**, not individual panels in one row. If just one
panel is upside down, correct its mounting/cabling. Verify left-to-right panel order
with the `LEAVE BY` label and the right-hand drive-time field.

## Screens and controls

- Main screen: 30 seconds. Two departure-board rows: Leave by and Arrive, with
  white mixed-case labels, outlined car/flag icons, and green right-aligned times.
  Drive duration sits below the first row; schedule status below the second.
  Cached/offline data replaces schedule status with an orange age warning.
- Traffic message: 10 seconds. Green improving, yellow steady, orange worsening,
  with approximate change time.
- Trend: 10 seconds. Sparse graph with a white mark at the departure sample.
- With rotation off, the main recommendation stays visible.
- **Up:** previous screen. **Down:** next screen. **Up + Down:** request newest cache.
  Buttons use internal pull-ups and debounce. The third button along the side is
  **Reset**, not a third software input; it restarts normally. Refresh never bypasses
  the server's TomTom rate limits.

The renderer uses two 128×32 bitmaps and a six-color palette. It draws to the hidden
bitmap and swaps once, without clearing the visible screen. Unchanged data, screen,
state, and age skip the redraw. HUB75 scanout uses the
RGB matrix driver's double buffer. Brightness scales RGB palette values because
RGBMatrix's brightness property currently acts as on/off. At four-bit color depth,
very low brightness loses some color precision; verify 25–35% visually.

## Networking, time, and recovery

- `certs/gts-root-r4.pem` is Google's public GTS Root R4 certificate, downloaded
  from https://pki.goog/repo/certs/gtsr4.pem. It enables verified HTTPS to this
  Sites deployment on CircuitPython. Keep this folder on the device. For a different
  server certificate issuer, supply its appropriate CA with `COMMUTE_CA_FILE`.
- Cold starts synchronize UTC using `time.cloudflare.com` (UDP port 123) before
  HTTPS. The RTC stays in UTC; the server supplies localized display labels.

- The network reader yields between nonblocking send/read operations, allowing age
  updates and button handling while a response is pending. It bounds response data
  to 12KB and handles Content-Length and chunked JSON. Redirects/HTML/login pages
  are rejected instead of parsed as commute data.
- CircuitPython's DNS, Wi-Fi association, and TLS connect primitives are synchronous.
  Association and connect use three-second timeouts; hardware scanout continues,
  but button handling/screen changes may briefly pause during connection setup.
  DNS timing and TLS behavior must be checked on the actual firmware/network.
- Failed requests back off from 10 seconds to at most 5 minutes. Existing successful
  data remains visible with **OFFLINE 12M OLD** (age changes continuously). Malformed
  responses cannot replace the last successful recommendation. If the server itself
  supplies cached data, its original age remains intact.
- The server supplies UTC epoch, UTC offset, and formatted local time labels. The
  RTC is set to UTC from this response. Age uses monotonic time, so RTC changes
  do not reset it. DISPLAY_TIMEZONE
  is an informational device setting; set the authoritative zone in the dashboard.
  After prolonged disconnection across a DST transition, cached local labels
  remain visibly stale until reconnect.
- States: Starting, Connecting to Wi-Fi, Loading commute, Normal, Cached/offline,
  No route, Missing configuration, and Server error. Recoverable failures retain a
  visible screen. After power loss the device starts again and reloads the server's
  persisted cache. Device RAM cache does not survive power loss; no frequent flash
  writes or CIRCUITPY filesystem remounts are needed.
- If the deadline passes, the server asks for a new date and the firmware shows
  No route. If leaving now misses a future deadline, the main screen says LEAVE NOW.

## Bench verification still required

With the actual hardware, confirm panel scan pattern, order and orientation; no
clipping at `12:59 PM`; correct colors at 30%; safe supply voltage under load; both
buttons and simultaneous refresh; Wi-Fi loss/reconnection; TLS certificates; server
outage with age increasing; malformed response recovery; and cold boot/power-cycle.
Run for several hours through an active/inactive window before relying on it daily.
Software tests cannot establish the power budget or electrical reliability.

[Adafruit wiring/pinouts](https://learn.adafruit.com/adafruit-matrixportal-s3/pinouts)
· [RGBMatrix reference](https://docs.circuitpython.org/en/stable/shared-bindings/rgbmatrix/index.html)
