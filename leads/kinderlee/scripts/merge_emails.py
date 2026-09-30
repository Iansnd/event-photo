#!/usr/bin/env python3
"""Merge emails_*.json (from search-based email hunt) into the leads CSV/XLSX. Usage: merge_emails.py <scratch_dir> <leads_dir>"""
import csv, glob, json, os, re, sys
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
scratch, out = sys.argv[1], sys.argv[2]
found = {}
def norm(s): return re.sub(r"[^a-z0-9]", "", (s or "").lower())
for fp in sorted(glob.glob(os.path.join(scratch, "emails_*.json"))):
    try: data = json.load(open(fp, encoding="utf-8"))
    except Exception as e: print("SKIP", fp, e); continue
    for d in data:
        if not isinstance(d, dict): continue
        found[norm(d.get("org_name"))] = d
def emails_of(d):
    gen = d.get("general_emails") or []
    if isinstance(gen, str): gen = [gen]
    pers = d.get("personal_emails") or []
    pl = []
    for p in pers:
        if isinstance(p, dict): pl.append(f"{p.get('email','')} ({p.get('person','')}, {p.get('role','')})".replace(" (, )", ""))
        elif isinstance(p, str): pl.append(p)
    return "; ".join(x for x in gen if x), "; ".join(x for x in pl if x), d.get("email_pattern") or "", "; ".join(d.get("source_urls") or [])
path = os.path.join(out, "kinderlee_leads_europe.csv")
rows = list(csv.DictReader(open(path, encoding="utf-8")))
cols = list(rows[0].keys())
for c in ["personal_emails_found", "email_pattern_observed", "email_sources"]:
    if c not in cols: cols.append(c)
hit = 0; hit_p = 0
for r in rows:
    d = found.get(norm(r["org_name"]))
    if not d: continue
    gen, pers, pat, src = emails_of(d)
    if gen:
        existing = [e.strip() for e in r["general_email"].split(";") if e.strip()]
        for e in gen.split("; "):
            if e and e not in existing: existing.append(e)
        r["general_email"] = "; ".join(existing)
    r["personal_emails_found"] = pers; r["email_pattern_observed"] = pat; r["email_sources"] = src
    if gen or pers: hit += 1
    if pers: hit_p += 1
    if d.get("phone") and not r.get("phone"): r["phone"] = str(d["phone"])
with open(path, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(rows)
# decision makers csv: add found personal email
dmp = os.path.join(out, "decision_makers.csv")
dms = list(csv.DictReader(open(dmp, encoding="utf-8"))); dcols = list(dms[0].keys())
for c in ["personal_email_found", "email_pattern_observed"]:
    if c not in dcols: dcols.append(c)
byorg = {norm(r["org_name"]): r for r in rows}
for d in dms:
    r = byorg.get(norm(d["org_name"]))
    if r:
        d["known_email"] = r["general_email"]; d["personal_email_found"] = r.get("personal_emails_found", ""); d["email_pattern_observed"] = r.get("email_pattern_observed", "")
with open(dmp, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=dcols); w.writeheader(); w.writerows(dms)
# xlsx
wb = load_workbook(os.path.join(out, "kinderlee_leads_europe.xlsx"))
def rewrite(ws, rows, cols):
    ws.delete_rows(1, ws.max_row); ws.append(cols)
    for c in ws[1]: c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="1F4E79")
    for r in rows: ws.append([r.get(c, "") for c in cols])
    for row in ws.iter_rows(min_row=2):
        for c in row: c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions
rewrite(wb["Leads"], rows, cols); rewrite(wb["Decision makers"], dms, dcols)
wb.save(os.path.join(out, "kinderlee_leads_europe.xlsx"))
total_any = sum(1 for r in rows if re.search(r"[\w.+-]+@", r["general_email"] + r.get("personal_emails_found", "")))
print(f"matched={len(found)} rows_with_new_email={hit} rows_with_personal={hit_p} total_rows_with_any_email={total_any}/{len(rows)}")
