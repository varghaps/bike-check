# 🚲 bike-check

Find the closest bikes in Budapest on iPhone or Apple Watch using **Scriptable** and **Shortcuts**.
Two scripts, two providers:

- **Bubi** (Nextbike) — 3 closest **stations** with available bikes
- **Manfred** — 3 closest **free-floating bikes**

Both show walking distance and tap-to-navigate actions via Apple Maps.

> Built with Scriptable + Shortcuts
> Not intended for commercial use

---

## ✅ What it does

- Fetches real-time data from official GBFS feeds (Nextbike for Bubi, Manfred GBFS v3 for Manfred)
- Works **standalone in Scriptable**, or automated via **Shortcuts**
- Returns the **3 closest** picks within a configurable radius
- Sends a **notification** with:
  - Names (station name for Bubi; Bubi station name → street address → distance+direction fallback for Manfred)
  - Bike counts (Bubi) or single-bike picks (Manfred)
  - Tap-to-navigate buttons (Apple Maps walking directions)
- Fully supports iPhone, iPad, and Apple Watch

---

## ⚙️ Setup

### 1. Scriptable (required)

1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188)
2. Create a new script for each provider you want:
   - Bubi: [`scriptable/bubi_nearest.js`](scriptable/bubi_nearest.js)
   - Manfred: [`scriptable/manfred_nearest.js`](scriptable/manfred_nearest.js)
3. Paste and save
4. Run once manually to grant location permissions

### 2. Shortcuts (recommended for automation)

To automate bike checks via:
- Home Screen
- Control Center
- Apple Watch
- Scheduled routines

#### Basic Shortcut

1. **Run Script** (Scriptable → select your script)  
   Input: *(leave empty to use GPS)*

#### Optional: Pass location manually

To avoid GPS lookup (e.g. for faster runs or testing), you can pass a JSON block like:

```json
{"lat": 47.4979, "lon": 19.0402, "radius": 800}
```

For the Manfred script you can also restrict the vehicle type:

```json
{"lat": 47.4979, "lon": 19.0402, "radius": 800, "type": "bike"}
```

`type` accepts `"bike"` (non-electric, default), `"ebike"`, or `"any"`.

To generate this dynamically:

1. **Get Current Location**
2. **Text:**
   ```json
   {"lat": MagicVar(Current Location.Latitude), "lon": MagicVar(Current Location.Longitude), "radius": 800}
   ```
3. **Run Script (Scriptable)** → Input: use the text block from step 2

### 🖥️ Example Output

Bubi:

```
Margit híd Buda · 220m: 5 | Jászai Mari tér · 430m: 3 | Nyugati pályaudvar · 650m: 2
```

Manfred (label per bike: nearest Bubi station name if within ~50m, otherwise reverse-geocoded street, otherwise distance + compass arrow; `⚡` marks an ebike):

```
Margit híd Buda · 120m | Vanília u. 12 · 180m | 260m ↘
```

Tapping opens Maps for walking navigation to the first pick.

#### Voice output (Siri, Apple Watch)

The Manfred script's notification body always shows the visual line above (3 picks). The script's *Shortcut output*, however, is a Hungarian spoken sentence about **only the closest** bike — designed for a Shortcuts **Speak Text** action so Siri reads it aloud. Examples:

```
A legközelebbi bicaj 120 méterre van, Margit híd Buda közelében.
A legközelebbi elektromos bicaj 260 méterre van, délkeletre felé.
```

A typical setup is two shortcuts pointing at the same script:
- *Manfred* — Run Script only (silent, fires the notification)
- *Manfred hangosan* — Run Script + Speak Text (set Language to Hungarian) for Siri / "Hey Siri, Manfred hangosan"

---

## 🔧 Configuration

Both scripts share top-of-file constants you can edit:

```javascript
const DEFAULT_MAX_METERS = 800;      // Search radius if not passed from Shortcuts
const SHOW_DISTANCES = true;         // Append distance to names in the output
```

The Manfred script has a few extra knobs:

```javascript
const DEFAULT_TYPE = 'bike';         // "bike" (non-electric), "ebike", or "any"
const STATION_LABEL_RADIUS = 50;     // Reuse a Bubi station name within this many meters
const GEOCODE_TIMEOUT_MS = 3000;     // Per-call cap for Apple reverse geocode
```

---

## 📍 Location Permissions

Scriptable must have:
- **Location access:** While Using the App
- **Precise Location:** ✅ On

*Settings → Scriptable → Location*

---

## 🔒 Privacy

Your location never leaves your device. The scripts request public GBFS JSON feeds and compute distances locally. The Manfred script additionally calls Apple's on-device `Location.reverseGeocode` for bikes without a nearby Bubi station label.

---

## 🛠️ How it works

### Bubi (`bubi_nearest.js`)

- Uses the official Nextbike GBFS feeds
- **Network ID:** `nextbike_bh` (Bubi in Budapest)
- **Fetches:**
  - `station_information` (name, location)
  - `station_status` (bike counts, availability)
- Computes distances with the Haversine formula
- Filters + ranks stations based on real-time availability

### Manfred (`manfred_nearest.js`)

- Uses Manfred's GBFS v3 feed at `https://audit.manfred.mobi/gbfs` (kindly shared by Manfred; data property of Manfred Mobilitás Platform Kft. — see their [terms](https://manfred.mobi/api/termsandconditions))
- **Fetches:**
  - Manfred `free_bike_status` (per-bike position; the system is free-floating)
  - Bubi `station_information` (used only as a label source for nearby bikes)
- Filters out `is_disabled` and `is_reserved` bikes, plus vehicle type (`bike` / `ebike` / `any`)
- Haversine distance to each bike, sorted ascending, top 3 within the radius
- For each pick, label resolution is tried in this order:
  1. Nearest Bubi station within `STATION_LABEL_RADIUS` (50 m by default)
  2. Apple `Location.reverseGeocode` for a street address (with timeout)
  3. Plain distance + 8-point compass arrow

---

## 📄 License

MIT.

This is a personal automation helper, provided as-is, with no affiliation to Nextbike, BKK, Bubi, or Manfred. Use at your own risk.

---

## 💡 Credits

Vibe‑coded with LLM tools by Simon Vargha.  
Contributions welcome!