#!/usr/bin/env python3
"""
Pull EVERY kindergarten / childcare / preschool mapped in OpenStreetMap across Europe.

Strategy (works on public Overpass mirrors that lack an area index or time out on
whole-country queries): walk a 1-degree grid over Europe, fetch each tile with a
plain bounding-box query (a few seconds each), cache every tile as JSON so the run
is resumable, then assign each facility to a country locally with Natural Earth
polygons (point-in-polygon via shapely) and write one CSV.

    pip install requests shapely
    python3 fetch_osm_kindergartens.py fetch  --tiledir tiles            # resumable, re-run after interruption
    python3 fetch_osm_kindergartens.py build  --tiledir tiles --ne ne_10m_admin_0_countries.geojson --out osm_kindergartens_europe.csv

Natural Earth: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson
Data licence: ODbL (OpenStreetMap contributors); Natural Earth is public domain.
"""
import argparse, csv, glob, json, os, sys, time, threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

ENDPOINTS = ["https://overpass.openstreetmap.fr/api/interpreter",
             "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
             "https://overpass-api.de/api/interpreter"]
# Europe incl. Iceland, Turkey, Ukraine, Caucasus edge; Canaries/Madeira/Azores handled via extra boxes
GRID = {"minlat": 34.0, "maxlat": 71.5, "minlon": -25.0, "maxlon": 45.0}
EXTRA = [(27.5, -18.5, 29.5, -13.0), (32.5, -17.5, 33.5, -16.0), (36.5, -31.5, 40.0, -24.5)]  # Canaries, Madeira, Azores
EUROPE = {"AD","AL","AT","BA","BE","BG","BY","CH","CY","CZ","DE","DK","EE","ES","FI","FR","GB","GR","HR","HU","IE","IS","IT",
          "LI","LT","LU","LV","MC","MD","ME","MK","MT","NL","NO","PL","PT","RO","RS","SE","SI","SK","SM","UA","VA","XK","TR"}
FIELDS = ["osm_id","osm_type","country","name","operator","brand","kind","addr_street","addr_housenumber","addr_postcode",
          "addr_city","website","email","phone","opening_hours","capacity","lat","lon","source_url"]

def query(bb):
    return f'''[out:json][timeout:90];(
  nwr["amenity"="kindergarten"]({bb});
  nwr["amenity"="childcare"]({bb});
  nwr["amenity"="preschool"]({bb});
  nwr["amenity"="school"]["isced:level"~"^0"]({bb});
  nwr["social_facility"="day_care"]["social_facility:for"~"child"]({bb});
);out center tags;'''

_ep_lock = threading.Lock(); _ep_i = [0]
def call(session, q):
    for attempt in range(6):
        with _ep_lock:
            ep = ENDPOINTS[_ep_i[0] % len(ENDPOINTS)]
        try:
            r = session.post(ep, data={"data": q}, timeout=150)
            if r.status_code == 200:
                d = r.json()
                if "remark" in d and "error" in d["remark"].lower():
                    raise RuntimeError(d["remark"])
                return d.get("elements", [])
            if r.status_code == 429: time.sleep(20)
        except Exception:
            pass
        with _ep_lock: _ep_i[0] += 1        # rotate endpoint on failure
        time.sleep(3 * (attempt + 1))
    return None

def all_tiles(step):
    boxes = [(GRID["minlat"], GRID["minlon"], GRID["maxlat"], GRID["maxlon"])] + EXTRA
    for s, w, n, e in boxes:
        lat = s
        while lat < n:
            lon = w
            while lon < e:
                yield (round(lat, 2), round(lon, 2), round(min(lat + step, n), 2), round(min(lon + step, e), 2))
                lon += step
            lat += step

def fetch(tiledir, workers, step):
    os.makedirs(tiledir, exist_ok=True)
    todo = [t for t in all_tiles(step) if not os.path.exists(os.path.join(tiledir, f"{t[0]}_{t[1]}.json"))]
    print(f"{len(todo)} tiles to fetch", flush=True)
    s = requests.Session(); s.headers["User-Agent"] = "kinderlee-leadgen/3.0"
    done = 0; total = 0; failed = 0
    def work(t):
        bb = f"{t[0]},{t[1]},{t[2]},{t[3]}"
        els = call(s, query(bb))
        if els is None: return t, None
        # tiles with >5000 hits are split once to be safe against truncation
        if len(els) >= 5000 and step > 0.25:
            sub = []
            h = step / 2
            for a in (t[0], t[0] + h):
                for b in (t[1], t[1] + h):
                    e2 = call(s, query(f"{a},{b},{a+h},{b+h}")) or []
                    sub += e2
            els = sub
        with open(os.path.join(tiledir, f"{t[0]}_{t[1]}.json"), "w") as f: json.dump(els, f)
        return t, len(els)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for t, n in ex.map(work, todo):
            done += 1
            if n is None: failed += 1
            else: total += n
            if done % 50 == 0 or n and n > 500:
                print(f"{done}/{len(todo)} tiles, {total} facilities so far, {failed} failed (tile {t[0]},{t[1]}: {n})", flush=True)
    print(f"FETCH DONE: {done} tiles, {total} facilities, {failed} failed (re-run to retry failed)", flush=True)

def build(tiledir, ne_path, out):
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree
    ne = json.load(open(ne_path, encoding="utf-8"))
    geoms, isos = [], []
    for f in ne["features"]:
        p = f["properties"]; iso = p.get("ISO_A2_EH") or p.get("ISO_A2") or ""
        if iso == "-99": iso = p.get("ISO_A2_EH", "")
        if p.get("NAME") == "Kosovo": iso = "XK"
        geoms.append(shape(f["geometry"])); isos.append(iso)
    tree = STRtree(geoms)
    seen = {}
    for p in glob.glob(os.path.join(tiledir, "*.json")):
        for el in json.load(open(p)):
            seen[(el["type"], el["id"])] = el
    n = 0; unassigned = 0; per = {}
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader()
        for el in seen.values():
            t = el.get("tags", {})
            lat = el.get("lat") or el.get("center", {}).get("lat"); lon = el.get("lon") or el.get("center", {}).get("lon")
            if lat is None: continue
            pt = Point(lon, lat); iso = ""
            for i in tree.query(pt):
                if geoms[i].contains(pt): iso = isos[i]; break
            if not iso:
                # coastal points just outside polygons: nearest country
                i = tree.nearest(pt); iso = isos[i] if geoms[i].distance(pt) < 0.05 else ""
            if iso not in EUROPE:
                unassigned += 1; continue
            w.writerow({"osm_id": el["id"], "osm_type": el["type"], "country": iso,
                "name": t.get("name") or t.get("name:en") or "", "operator": t.get("operator",""), "brand": t.get("brand",""),
                "kind": t.get("amenity") or t.get("social_facility") or "",
                "addr_street": t.get("addr:street",""), "addr_housenumber": t.get("addr:housenumber",""),
                "addr_postcode": t.get("addr:postcode",""), "addr_city": t.get("addr:city",""),
                "website": t.get("website") or t.get("contact:website") or "", "email": t.get("email") or t.get("contact:email") or "",
                "phone": t.get("phone") or t.get("contact:phone") or "", "opening_hours": t.get("opening_hours",""),
                "capacity": t.get("capacity",""), "lat": lat, "lon": lon,
                "source_url": f"https://www.openstreetmap.org/{el['type']}/{el['id']}"})
            n += 1; per[iso] = per.get(iso, 0) + 1
    print(f"BUILD DONE: {n} facilities in Europe written to {out} ({unassigned} outside Europe dropped)")
    for k, v in sorted(per.items(), key=lambda x: -x[1]): print(f"  {k}: {v}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["fetch", "build"])
    ap.add_argument("--tiledir", default="tiles"); ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--step", type=float, default=1.0); ap.add_argument("--ne", default="ne_10m_admin_0_countries.geojson")
    ap.add_argument("--out", default="osm_kindergartens_europe.csv")
    a = ap.parse_args()
    fetch(a.tiledir, a.workers, a.step) if a.mode == "fetch" else build(a.tiledir, a.ne, a.out)
