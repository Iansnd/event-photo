#!/usr/bin/env python3
"""
Threaded, resumable website harvester for large kindergarten lists (tens of thousands of sites).
Reuses the extraction logic of enrich_websites.py. Progress is appended to a JSONL file so a
killed run resumes where it stopped.

    pip install requests beautifulsoup4 lxml
    python3 harvest_parallel.py --in osm/osm_kindergartens_with_contact.csv --progress harvest.jsonl --workers 32
    python3 harvest_parallel.py --merge harvest.jsonl --in osm/osm_kindergartens_with_contact.csv --out osm/osm_kindergartens_harvested.csv
"""
import argparse, csv, json, os, sys, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlparse
import requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from enrich_websites import extract, SUBPAGES

KEY = "source_url"   # unique id column in the OSM CSV; falls back to website

def rid(r): return r.get(KEY) or r.get("website")

def harvest_one(r, timeout):
    url = r["website"].strip().split(";")[0].strip()
    if not url.startswith("http"): url = "https://" + url
    s = requests.Session(); s.headers["User-Agent"] = "Mozilla/5.0 (compatible; kinderlee-leadgen/2.0)"
    emails, phones, leaders = set(), set(), []
    def get(u):
        try:
            x = s.get(u, timeout=timeout, allow_redirects=True)
            if x.ok and "text/html" in x.headers.get("content-type", ""): return x.text[:600000]
        except Exception: pass
        return ""
    html = get(url); status = "ok" if html else "unreachable"
    if html:
        e, p, l, links = extract(html); emails |= set(e); phones |= set(p); leaders += l
        cands = [urljoin(url, h) for h in links if any(k in h.lower() for k in SUBPAGES)]
        seen = set(); picked = []
        for c in cands:
            if urlparse(c).netloc == urlparse(url).netloc and c not in seen:
                seen.add(c); picked.append(c)
            if len(picked) >= 2: break
        for c in picked:
            h2 = get(c)
            if h2:
                e, p, l, _ = extract(h2); emails |= set(e); phones |= set(p); leaders += l
    return {"id": rid(r), "status": status, "emails": sorted(emails), "phones": sorted(phones),
            "leaders": list(dict.fromkeys(leaders))}

def run(inp, progress, workers, timeout, limit):
    rows = [r for r in csv.DictReader(open(inp, encoding="utf-8")) if r.get("website")]
    done = set()
    if os.path.exists(progress):
        for line in open(progress, encoding="utf-8"):
            try: done.add(json.loads(line)["id"])
            except Exception: pass
    todo = [r for r in rows if rid(r) not in done]
    if limit: todo = todo[:limit]
    print(f"{len(rows)} sites total, {len(done)} already done, {len(todo)} to do, {workers} workers", flush=True)
    lock = threading.Lock(); out = open(progress, "a", encoding="utf-8")
    n = 0; hits = 0; t0 = time.time()
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(harvest_one, r, timeout): r for r in todo}
        for f in as_completed(futs):
            try: res = f.result()
            except Exception as e: res = {"id": rid(futs[f]), "status": f"error: {e}", "emails": [], "phones": [], "leaders": []}
            with lock:
                out.write(json.dumps(res, ensure_ascii=False) + "\n"); out.flush()
            n += 1; hits += bool(res["emails"] or res["leaders"])
            if n % 500 == 0:
                rate = n / (time.time() - t0)
                print(f"{n}/{len(todo)} done, {hits} with email/leader, {rate:.1f} sites/s, ETA {(len(todo)-n)/rate/60:.0f} min", flush=True)
    print(f"HARVEST DONE: {n} sites, {hits} with email or leader", flush=True)

def merge(inp, progress, out):
    res = {}
    for line in open(progress, encoding="utf-8"):
        try: d = json.loads(line); res[d["id"]] = d
        except Exception: pass
    rows = list(csv.DictReader(open(inp, encoding="utf-8")))
    cols = list(rows[0].keys()) + ["harvest_status", "found_emails", "found_phones", "found_decision_makers"]
    n = 0; ne = 0; nl = 0
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
        for r in rows:
            d = res.get(rid(r))
            if d:
                r["harvest_status"] = d["status"]; r["found_emails"] = "; ".join(d["emails"])
                r["found_phones"] = "; ".join(d["phones"]); r["found_decision_makers"] = "; ".join(d["leaders"])
                n += 1; ne += bool(d["emails"]); nl += bool(d["leaders"])
            w.writerow(r)
    print(f"merged {n} harvested rows: {ne} with emails, {nl} with director names -> {out}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True); ap.add_argument("--progress", default="harvest.jsonl")
    ap.add_argument("--workers", type=int, default=32); ap.add_argument("--timeout", type=int, default=12)
    ap.add_argument("--limit", type=int, default=0); ap.add_argument("--merge", metavar="PROGRESS_JSONL")
    ap.add_argument("--out", default="harvested.csv")
    a = ap.parse_args()
    merge(a.inp, a.merge, a.out) if a.merge else run(a.inp, a.progress, a.workers, a.timeout, a.limit)
