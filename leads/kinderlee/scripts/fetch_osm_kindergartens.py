#!/usr/bin/env python3
"""
Pull EVERY kindergarten / childcare / preschool mapped in OpenStreetMap for all
European countries via the free Overpass API, tiled per country so each request
stays small enough for public mirrors (which time out on whole-country queries).

    pip install requests
    python3 fetch_osm_kindergartens.py --outdir osm_out            # all of Europe, resumable
    python3 fetch_osm_kindergartens.py --countries DE AT --outdir osm_out
    python3 fetch_osm_kindergartens.py --merge osm_out --out osm_kindergartens_europe.csv

Per-country CSVs land in <outdir>/<ISO>.csv; a country already present is skipped
(delete its file to redo it). Data licence: ODbL (OpenStreetMap contributors).
"""
import argparse, csv, glob, json, os, sys, time, math
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

ENDPOINTS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",  # has areas, ~45 s gateway limit
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
EUROPE = ["AD","AL","AT","BA","BE","BG","BY","CH","CY","CZ","DE","DK","EE","ES","FI",
          "FR","GB","GR","HR","HU","IE","IS","IT","LI","LT","LU","LV","MC","MD","ME",
          "MK","MT","NL","NO","PL","PT","RO","RS","SE","SI","SK","SM","UA","VA","XK","TR"]
DENSE = {"DE":0.5,"FR":0.5,"GB":0.5,"IT":0.5,"ES":0.5,"PL":0.5,"NL":0.5,"BE":0.5,"CH":0.5,"AT":0.5,"CZ":0.5,"TR":0.5,"UA":0.5,"NO":1.0,"SE":1.0,"FI":1.0}
FIELDS = ["osm_id","osm_type","country","name","operator","brand","kind","addr_street","addr_housenumber",
          "addr_postcode","addr_city","website","email","phone","opening_hours","capacity","lat","lon","source_url"]
FILTER = """
  nwr["amenity"="kindergarten"](area.a)({bb});
  nwr["amenity"="childcare"](area.a)({bb});
  nwr["amenity"="preschool"](area.a)({bb});
  nwr["amenity"="school"]["isced:level"~"^0"](area.a)({bb});
  nwr["social_facility"="day_care"]["social_facility:for"~"child"](area.a)({bb});
"""
def q_tile(iso, bb):
    return f'[out:json][timeout:40];rel["ISO3166-1"="{iso}"][admin_level=2];map_to_area->.a;({FILTER.format(bb=bb)});out center tags;'
def q_bbox(iso):
    return f'[out:json][timeout:40];rel["ISO3166-1"="{iso}"][admin_level=2];out bb;'

def call(session, q, tries=4):
    for attempt in range(tries):
        for ep in ENDPOINTS:
            try:
                r = session.post(ep, data={"data": q}, timeout=120)
                if r.status_code == 200:
                    d = r.json()
                    if "remark" in d and "error" in d["remark"].lower():
                        continue  # runtime error (timeout) -> next endpoint / retry
                    return d.get("elements", [])
                if r.status_code in (429, 504, 502, 503):
                    time.sleep(5 * (attempt + 1)); continue
            except Exception:
                time.sleep(3)
    return None

def row(el, iso):
    t = el.get("tags", {})
    return {"osm_id": el["id"], "osm_type": el["type"], "country": iso,
            "name": t.get("name") or t.get("name:en") or "", "operator": t.get("operator",""), "brand": t.get("brand",""),
            "kind": t.get("amenity") or t.get("social_facility") or "",
            "addr_street": t.get("addr:street",""), "addr_housenumber": t.get("addr:housenumber",""),
            "addr_postcode": t.get("addr:postcode",""), "addr_city": t.get("addr:city",""),
            "website": t.get("website") or t.get("contact:website") or "", "email": t.get("email") or t.get("contact:email") or "",
            "phone": t.get("phone") or t.get("contact:phone") or "", "opening_hours": t.get("opening_hours",""),
            "capacity": t.get("capacity",""), "lat": el.get("lat") or el.get("center",{}).get("lat"),
            "lon": el.get("lon") or el.get("center",{}).get("lon"),
            "source_url": f"https://www.openstreetmap.org/{el['type']}/{el['id']}"}

def tiles(bounds, step):
    s, w, n, e = bounds["minlat"], bounds["minlon"], bounds["maxlat"], bounds["maxlon"]
    lat = math.floor(s / step) * step
    while lat < n:
        lon = math.floor(w / step) * step
        while lon < e:
            yield f"{max(lat,s):.4f},{max(lon,w):.4f},{min(lat+step,n):.4f},{min(lon+step,e):.4f}"
            lon += step
        lat += step

def pull_country(iso, outdir, workers, step_override=None):
    path = os.path.join(outdir, f"{iso}.csv")
    if os.path.exists(path):
        print(f"[{iso}] exists, skip", flush=True); return
    s = requests.Session(); s.headers["User-Agent"] = "kinderlee-leadgen/2.0"
    rels = call(s, q_bbox(iso))
    if not rels:
        print(f"[{iso}] no boundary relation found", file=sys.stderr, flush=True); return
    bounds = rels[0]["bounds"]
    # overseas territories blow up FR/NL/GB/ES/PT/DK/NO bboxes: clip to mainland Europe + Atlantic islands
    bounds = {"minlat": max(bounds["minlat"], 27.0), "maxlat": min(bounds["maxlat"], 72.0),
              "minlon": max(bounds["minlon"], -32.0), "maxlon": min(bounds["maxlon"], 45.0)}
    step = step_override or DENSE.get(iso, 1.0)
    tl = list(tiles(bounds, step)); seen = {}; failed = []
    def work(bb):
        els = call(s, q_tile(iso, bb))
        return bb, els
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(work, bb) for bb in tl]
        for i, f in enumerate(as_completed(futs), 1):
            bb, els = f.result()
            if els is None: failed.append(bb); continue
            for el in els: seen[(el["type"], el["id"])] = el
            if i % 25 == 0: print(f"[{iso}] {i}/{len(tl)} tiles, {len(seen)} facilities", flush=True)
    # retry failed tiles at quarter size once
    for bb in failed:
        s_, w_, n_, e_ = map(float, bb.split(","))
        for sub in tiles({"minlat": s_, "minlon": w_, "maxlat": n_, "maxlon": e_}, (n_ - s_) / 2):
            els = call(s, q_tile(iso, sub)) or []
            for el in els: seen[(el["type"], el["id"])] = el
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader()
        for el in seen.values(): w.writerow(row(el, iso))
    print(f"[{iso}] DONE {len(seen)} facilities from {len(tl)} tiles ({len(failed)} tiles needed retry)", flush=True)

def merge(outdir, out):
    n = 0
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader()
        for p in sorted(glob.glob(os.path.join(outdir, "*.csv"))):
            for r in csv.DictReader(open(p, encoding="utf-8")): w.writerow(r); n += 1
    print(f"merged {n} rows -> {out}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--countries", nargs="*", default=EUROPE); ap.add_argument("--outdir", default="osm_out")
    ap.add_argument("--workers", type=int, default=3); ap.add_argument("--step", type=float)
    ap.add_argument("--merge", metavar="OUTDIR"); ap.add_argument("--out", default="osm_kindergartens_europe.csv")
    a = ap.parse_args()
    if a.merge: merge(a.merge, a.out); sys.exit()
    os.makedirs(a.outdir, exist_ok=True)
    for iso in a.countries: pull_country(iso, a.outdir, a.workers, a.step)
