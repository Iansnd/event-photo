#!/usr/bin/env python3
"""
Enrich a kindergarten CSV (e.g. the OSM pull) by visiting each website and
extracting: contact e-mails, phone numbers, and the named director / Leitung /
manager / directrice / styrer / rektor from Impressum / About / Contact pages.

Run locally (needs internet). Be polite: default 1 request/second, 2 pages/site.

    pip install requests beautifulsoup4 lxml
    python3 enrich_websites.py --in osm_kindergartens_europe.csv --out enriched.csv --limit 5000
"""
import argparse, csv, re, sys, time
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(\+\d[\d\s().-]{7,}\d|\b0\d[\d\s().-]{7,}\d)")
# Title words that typically precede/follow the leader's name on kindergarten sites
TITLE_WORDS = [
    # DE/AT/CH
    "Leitung","Kitaleitung","Kita-Leitung","Einrichtungsleitung","Leiterin","Leiter","Geschäftsführer","Geschäftsführerin","Geschäftsführung","Vorstand","Inhaber","Inhaberin","Trägervertreter",
    # EN
    "Nursery Manager","Manager","Head of Nursery","Headteacher","Head Teacher","Director","Owner","Principal","Managing Director","CEO","Founder",
    # FR/BE/LU
    "Directrice","Directeur","Direction","Gérante","Gérant","Responsable","Fondatrice","Fondateur",
    # NL/BE
    "Directeur","Directrice","Locatiemanager","Eigenaar","Eigenaresse","Bestuurder","Manager",
    # Nordics
    "Styrer","Daglig leder","Rektor","Förskolechef","Leder","Bestyrer","Johtaja","Päiväkodin johtaja",
    # ES/PT/IT
    "Directora","Director","Diretora","Diretor","Coordinadora","Direttrice","Direttore","Coordinatrice","Responsabile",
    # PL/CZ/SK/HU
    "Dyrektor","Dyrektorka","Ředitelka","Ředitel","Riaditeľka","Riaditeľ","Vezető","Óvodavezető","Intézményvezető",
]
TITLE_RE = re.compile(r"(" + "|".join(re.escape(t) for t in TITLE_WORDS) + r")\s*[:\-–]?\s*([A-ZÀ-ÝŠŽČŘŁ][\w'’\-À-ÿšžčřłąęńó]+(?:\s+[A-ZÀ-ÝŠŽČŘŁ][\w'’\-À-ÿšžčřłąęńó]+){1,3})", re.U)
NAME_THEN_TITLE_RE = re.compile(r"([A-ZÀ-ÝŠŽČŘŁ][\w'’\-À-ÿšžčřłąęńó]+(?:\s+[A-ZÀ-ÝŠŽČŘŁ][\w'’\-À-ÿšžčřłąęńó]+){1,3})\s*[,(\-–]\s*(" + "|".join(re.escape(t) for t in TITLE_WORDS) + r")", re.U)
SUBPAGES = ["impressum","imprint","kontakt","contact","about","ueber-uns","über-uns","team","wir","qui-sommes-nous","equipe","over-ons","om-oss","chi-siamo","quienes-somos","o-nas","onas"]

def fetch(url, s):
    try:
        r = s.get(url, timeout=15, allow_redirects=True)
        if r.ok and "text/html" in r.headers.get("content-type",""):
            return r.text
    except Exception:
        pass
    return ""

def extract(html):
    soup = BeautifulSoup(html, "lxml")
    for t in soup(["script","style","noscript"]): t.decompose()
    text = " ".join(soup.get_text(" ").split())
    emails = sorted({e.lower() for e in EMAIL_RE.findall(text + " " + " ".join(a.get("href","") for a in soup.find_all("a"))) if not e.endswith((".png",".jpg",".svg"))})
    phones = sorted({re.sub(r"\s+"," ",p).strip() for p in PHONE_RE.findall(text)})[:3]
    leaders = []
    for m in TITLE_RE.finditer(text): leaders.append((m.group(2).strip(), m.group(1)))
    for m in NAME_THEN_TITLE_RE.finditer(text): leaders.append((m.group(1).strip(), m.group(2)))
    seen, out = set(), []
    for n, t in leaders:
        if n not in seen and len(n.split()) >= 2 and not any(w in n.lower() for w in ("kita","kindergarten","nursery","gmbh","e.v","ltd","street","straße")):
            seen.add(n); out.append(f"{n} ({t})")
    links = [a.get("href","") for a in soup.find_all("a")]
    return emails, phones, out[:5], links

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=0); ap.add_argument("--delay", type=float, default=1.0)
    a = ap.parse_args()
    s = requests.Session(); s.headers["User-Agent"] = "Mozilla/5.0 (compatible; kinderlee-leadgen/1.0)"
    rows = list(csv.DictReader(open(a.inp, encoding="utf-8")))
    rows = [r for r in rows if r.get("website")]
    if a.limit: rows = rows[:a.limit]
    fields = list(rows[0].keys()) + ["found_emails","found_phones","found_decision_makers"]
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
        for i, r in enumerate(rows, 1):
            url = r["website"]
            if not url.startswith("http"): url = "https://" + url
            emails, phones, leaders = set(), set(), []
            html = fetch(url, s)
            if html:
                e, p, l, links = extract(html); emails |= set(e); phones |= set(p); leaders += l
                cands = [urljoin(url, h) for h in links if any(k in h.lower() for k in SUBPAGES)]
                cands = [c for c in cands if urlparse(c).netloc == urlparse(url).netloc][:2]
                for c in cands:
                    h2 = fetch(c, s)
                    if h2:
                        e, p, l, _ = extract(h2); emails |= set(e); phones |= set(p); leaders += l
                    time.sleep(a.delay)
            r["found_emails"] = "; ".join(sorted(emails)); r["found_phones"] = "; ".join(sorted(phones))
            r["found_decision_makers"] = "; ".join(dict.fromkeys(leaders))
            w.writerow(r); f.flush()
            print(f"[{i}/{len(rows)}] {r.get('name','')[:40]:40} emails={len(emails)} leaders={len(leaders)}", flush=True)
            time.sleep(a.delay)

if __name__ == "__main__":
    main()
