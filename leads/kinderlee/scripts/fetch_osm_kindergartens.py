#!/usr/bin/env python3
"""
Pull EVERY kindergarten / childcare / preschool mapped in OpenStreetMap for all
European countries via the free Overpass API, and write one normalised CSV.

Run locally (needs outbound internet; ~1-3 min per large country, be polite):

    pip install requests
    python3 fetch_osm_kindergartens.py --out osm_kindergartens_europe.csv
    python3 fetch_osm_kindergartens.py --countries DE AT CH --out dach.csv

Output columns: osm_id, osm_type, country, name, operator, brand, kind (osm tag),
addr_street, addr_housenumber, addr_postcode, addr_city, website, email, phone,
opening_hours, capacity, lat, lon, source_url.

Data licence: ODbL (OpenStreetMap contributors). Attribute accordingly.
"""
import argparse, csv, json, sys, time
import requests

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# ISO 3166-1 alpha-2 codes for Europe (incl. microstates, Turkey, Caucasus optional)
EUROPE = [
    "AD","AL","AT","BA","BE","BG","BY","CH","CY","CZ","DE","DK","EE","ES","FI",
    "FR","GB","GR","HR","HU","IE","IS","IT","LI","LT","LU","LV","MC","MD","ME",
    "MK","MT","NL","NO","PL","PT","RO","RS","SE","SI","SK","SM","UA","VA","XK","TR",
]

QUERY = """
[out:json][timeout:900][maxsize:1073741824];
area["ISO3166-1"="{iso}"][admin_level=2]->.a;
(
  nwr["amenity"="kindergarten"](area.a);
  nwr["amenity"="childcare"](area.a);
  nwr["amenity"="preschool"](area.a);
  nwr["amenity"="school"]["isced:level"~"^0"](area.a);
  nwr["social_facility"="day_care"]["social_facility:for"~"child"](area.a);
);
out center tags;
"""

FIELDS = ["osm_id","osm_type","country","name","operator","brand","kind",
          "addr_street","addr_housenumber","addr_postcode","addr_city",
          "website","email","phone","opening_hours","capacity","lat","lon","source_url"]

def run(iso, session):
    q = QUERY.format(iso=iso)
    for ep in OVERPASS_ENDPOINTS:
        for attempt in range(3):
            try:
                r = session.post(ep, data={"data": q}, timeout=960)
                if r.status_code == 200:
                    return r.json().get("elements", [])
                if r.status_code in (429, 504):
                    time.sleep(30 * (attempt + 1)); continue
                print(f"[{iso}] {ep} -> HTTP {r.status_code}", file=sys.stderr)
                break
            except Exception as e:
                print(f"[{iso}] {ep} error: {e}", file=sys.stderr)
                time.sleep(10)
    return []

def row(el, iso):
    t = el.get("tags", {})
    lat = el.get("lat") or el.get("center", {}).get("lat")
    lon = el.get("lon") or el.get("center", {}).get("lon")
    kind = t.get("amenity") or t.get("social_facility") or ""
    return {
        "osm_id": el["id"], "osm_type": el["type"], "country": iso,
        "name": t.get("name") or t.get("name:en") or "",
        "operator": t.get("operator",""), "brand": t.get("brand",""), "kind": kind,
        "addr_street": t.get("addr:street",""), "addr_housenumber": t.get("addr:housenumber",""),
        "addr_postcode": t.get("addr:postcode",""), "addr_city": t.get("addr:city",""),
        "website": t.get("website") or t.get("contact:website") or "",
        "email": t.get("email") or t.get("contact:email") or "",
        "phone": t.get("phone") or t.get("contact:phone") or "",
        "opening_hours": t.get("opening_hours",""), "capacity": t.get("capacity",""),
        "lat": lat, "lon": lon,
        "source_url": f"https://www.openstreetmap.org/{el['type']}/{el['id']}",
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--countries", nargs="*", default=EUROPE)
    ap.add_argument("--out", default="osm_kindergartens_europe.csv")
    ap.add_argument("--sleep", type=float, default=5.0, help="seconds between countries")
    a = ap.parse_args()
    s = requests.Session(); s.headers["User-Agent"] = "kinderlee-leadgen/1.0 (contact: sales@kinderlee)"
    total = 0
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader()
        for iso in a.countries:
            els = run(iso, s)
            for el in els:
                w.writerow(row(el, iso))
            total += len(els)
            print(f"[{iso}] {len(els)} facilities (running total {total})", flush=True)
            time.sleep(a.sleep)
    print(f"Done: {total} rows -> {a.out}")

if __name__ == "__main__":
    main()
