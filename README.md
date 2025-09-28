# 🚲 bike-check

Get the **3 closest Bubi (Nextbike) stations** with available bikes on iPhone or Apple Watch using **Scriptable** and **Shortcuts**.  
Shows live bike counts, walking distance, and tap-to-navigate actions via Apple Maps.

> Built with Scriptable + Shortcuts  
> Not intended for commercial use

---

## ✅ What it does

- Fetches real-time Bubi bike data from official GBFS feeds
- Works **standalone in Scriptable**, or automated via **Shortcuts**
- Filters for stations with bikes
- Returns the **3 closest** within a configurable radius
- Sends a **notification** with:
  - Station names
  - Bike counts
  - Tap-to-navigate buttons (Apple Maps walking directions)
- Fully supports iPhone, iPad, and Apple Watch

---

## ⚙️ Setup

### 1. Scriptable (required)

1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188)
2. Create a new script
3. Copy the contents of [`scriptable/bubi_nearest.js`](scriptable/bubi_nearest.js)
4. Paste and save
5. Run once manually to grant location permissions

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

To generate this dynamically:

1. **Get Current Location**
2. **Text:**
   ```json
   {"lat": MagicVar(Current Location.Latitude), "lon": MagicVar(Current Location.Longitude), "radius": 800}
   ```
3. **Run Script (Scriptable)** → Input: use the text block from step 2

### 🖥️ Example Output

```
Margit híd Buda · 220m: 5 | Jászai Mari tér · 430m: 3 | Nyugati pályaudvar · 650m: 2
```

Tapping opens Maps for walking navigation to the first station.

---

## 🔧 Configuration

In the script (`bubi_nearest.js`):

```javascript
const DEFAULT_MAX_METERS = 800;      // Radius if not passed from Shortcuts
const SHOW_DISTANCES = true;         // Append distance in meters to station names
```

You can change:
- The default search radius
- Whether distances like `· 320m` appear next to station names

---

## 📍 Location Permissions

Scriptable must have:
- **Location access:** While Using the App
- **Precise Location:** ✅ On

*Settings → Scriptable → Location*

---

## 🔒 Privacy

Your location never leaves your device. The script only requests the public GBFS JSON feeds and computes distances locally.

---

## 🛠️ How it works

- Uses the official Nextbike GBFS feeds
- **Network ID:** `nextbike_bh` (Bubi in Budapest)
- **Fetches:**
  - `station_information` (name, location)
  - `station_status` (bike counts, availability)
- Computes distances with Haversine formula
- Filters + ranks stations based on real-time availability

---

## 📄 License

MIT.

This is a personal automation helper, provided as-is, with no affiliation to Nextbike, BKK, or Bubi. Use at your own risk.

---

## 💡 Credits

Vibe‑coded with LLM tools by Simon Vargha.  
Contributions welcome!