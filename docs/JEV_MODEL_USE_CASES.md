# Type-Safe Event Model (JEV): Profit-Making Use Cases

**Scope.** "JEV model" here means the typed, event-driven session engine in
`lib/watcher`: the `SessionEvent` discriminated union, the `WatcherState`
shape, and the pure `reduce()` function that turns a stream of camera files
into guest-bound sessions and auto-dispatches a branded deliverable. It is
covered by 33 vitest cases and drives the `/booth-live` tethered booth.

**Method.** Deep web research (October 2026) on every market this engine could
serve, then first-principles reasoning about who pays, why, and how much.
Sources are listed at the end. Numbers quoted from sources are marked;
everything else is an explicit assumption.

---

## 1. What the engine actually is (first principles)

Strip away the Calvin Klein branding and the engine does one thing:

> It deterministically binds a continuous stream of files from a camera to a
> known identity, using a QR code that physically appears in the frame, and
> emits a typed state transition the moment the identity changes.

Everything else (compositing, email, viewer) is downstream plumbing. The
reducer has nine explicit rules. The ones that matter commercially:

| Rule | Behaviour | Commercial consequence |
|---|---|---|
| `FILES_DETECTED` | New files join the active session, or a holding area if none | Photographer never touches a laptop |
| `QR_DECODED` (new code) | Closes the previous session, queues `pendingAutoSend`, opens a new one | One shot of a QR is the entire operator workflow |
| `QR_DECODED` (same code) | Re-binds, no restart | Tolerates re-shoots and duplicate QR frames |
| `EXCLUDE_PHOTO` / `SET_HERO` | Operator curation without breaking auto-send | Quality control costs one click, not a workflow |
| `MANUAL_ASSIGN_UNCLAIMED` | Orphan recovery | No photo is ever lost to a missed QR |
| `TICK` | Camera-silence detection only; sessions never time out | Safe for slow, high-touch shoots |

Five properties fall out of this design, and they are the entire basis for
the use cases below.

1. **Identity without biometrics.** Binding is by QR, not by face. In the EU
   this is not a detail. Facial images used for identification are Article 9
   special-category data under GDPR, and the Dutch regulator (Autoriteit
   Persoonsgegevens) applies a "no, unless" rule to facial recognition at
   events, with explicit consent as the only realistic exception. Every major
   instant-delivery competitor (SpotMyPhotos, Waldo, Honcho, Fotoowl) is built
   on face recognition. This engine sidesteps the entire problem.
2. **Zero-operator throughput.** The CK handoff flow needed a photographer plus
   a laptop operator. Auto mode removes the second person. Labour is the
   dominant variable cost in event photography, so this roughly halves it.
3. **Camera-agnostic, install-free.** Anything that writes JPEGs to a folder
   works: Canon EOS Utility, Capture One, Lightroom tether, a card reader, an
   FTP drop. The operator opens a Chrome tab.
4. **Pure and testable.** New business rules (print queues, concurrent
   photographers, paid tiers, consent gates) are additional cases in a
   reducer with a test file, not a rewrite.
5. **Branded deliverable with first-party data attached.** Each session ends
   with a composited, on-brand image delivered to a named, emailed guest, with
   a timestamp and a viewer page that carries share links.

**What the engine is not.** The reducer itself is not a moat. A competent
engineer can rebuild it in days. The defensible assets are the regulatory
positioning (no biometrics, EU hosting), the end-to-end branded pipeline that
has already survived a three-day luxury launch, the operator playbook, and
the reference client. Pricing and go-to-market below are built around those,
not around the code.

### Known gaps that gate specific use cases

| Gap | Blocks |
|---|---|
| Single `currentSession`: one photographer at a time | Multi-photographer floors, attractions |
| Chrome-only (File System Access API) | Any iPad- or Safari-based operator |
| Gmail SMTP, 500 sends/day | Anything above ~400 guests/day; deliverability at scale |
| Email-only delivery | Markets where WhatsApp/SMS is the default (most of EU consumers) |
| One consent, one template, one tenant | Brand data compliance, agency resale, SaaS |
| No payments, no print | Guest-pays verticals |

---

## 2. Who pays for an event photo, and why

From first principles there are only four payers. Every business model in
this market is one of them or a blend.

| Payer | What they are buying | Research anchors |
|---|---|---|
| **A. The brand** (activation) | Consented first-party contacts, branded UGC, impressions | Photo experience stations at activations cost $3k–$10k; photo booths deliver ~74% engagement and ~48% of photos shared; event email capture runs 30–50%, rising to 80%+ when the photo is delivered by email; experiential CPL $3–$25 vs. trade show CPL $112–$395 |
| **B. The guest** (photo sales) | A memory they cannot get elsewhere | GradImages $20–$50 revenue per graduate; Sportograf ~$35 post-race, £25 pre-order; Santa packages from $44.99; school portraits $30–$38 per student |
| **C. The venue or operator** (photo as marketing) | Referrals and repeat visits | Fotaflo $199–$795/month per location; Kohala Zipline referrals 7.7% → 17.5%; Treeosix 41% of web traffic from shared photos |
| **D. The photographer or booth operator** (software) | Time saved, a feature to resell | SpotMyPhotos $142–$295/month; Honcho $39–$59/month; Fotoflo €6–€8 per project; Snappic $69–$399/month; Simple Booth $49–$249/month; Snapbar quoted at ~$1,995–$2,995 per corporate activation |

Payer D is the most crowded and the cheapest. Payer A has the highest
willingness to pay per guest and is exactly where the engine has already
proven itself. Payer B has the biggest absolute markets but is locked up by
exclusive contracts and requires payments and print the engine does not have.
Payer C is recurring revenue but needs concurrency and booking integrations.

The value equation for a brand-paid photo moment, which drives the pricing
in Section 3:

```
value to brand ≈ (consented contacts × value per contact)
              + (shared images × earned reach × CPM equivalent)
              + (guest dwell time and sentiment, unpriced)
```

With 400 guests and an 80% email delivery-driven opt-in you get ~320
consented contacts. At even the low end of trade show CPL ($112) that is
~$36k of equivalent lead value, before any UGC. A €10k–€15k activation fee is
cheap against that, which is why the premium end of this market
(Snapbar, headshot booths) can charge what it does.

---

## 3. Ranked use cases

Ranking criteria, in order: profit per unit of effort over the next 12
months, fit with what the engine already does, defensibility, and what has to
be built first.

### #1. Premium brand-activation photo experience (service, not software)

**What it is.** Sell the outcome to beauty, fragrance, fashion and luxury
retail brands and the agencies that produce their launches: a one-photographer
station that delivers an on-brand composite to each guest's inbox within a
minute, with consented data exported to the brand's CRM afterwards. Exactly
what ran for Calvin Klein × Euphoria, packaged and priced.

**Why it ranks first.** It uses 100% of the existing asset, has a live luxury
reference client, needs no new engineering to sell the first five, and sits at
the top of the price ladder. Comparable US pricing for photo experience
stations is $3k–$10k per activation; conference headshot booths run
$2.5k–$11.5k per day; Snapbar's software-only activations are quoted at
~$2k–$3k. The no-biometrics position is a direct answer to the first question
every EU brand legal team asks.

**Pricing (assumption, NL/EU market).**

| Package | Price | Includes |
|---|---|---|
| Launch day | €4,500 / day | Photographer, station, brand template, email, viewer, CSV export |
| Multi-day launch (3 days) | €11,500 | As above; day 2–3 discounted |
| Template and brand setup | €750 one-off | Composite template, email design, viewer theme |
| Data and consent pack | €950 per event | Granular marketing opt-in, CRM-ready export, deletion workflow |

**Unit economics, 3-day launch, 400 guests (assumptions).**

| Line | Amount |
|---|---|
| Revenue (3 days + setup + data pack) | €13,200 |
| Photographer, 3 days at €800 | €2,400 |
| Hardware amortisation and infra | €500 |
| Template and email design, 6 hours | €450 |
| Travel and contingency | €600 |
| **Gross profit** | **€9,250 (≈70%)** |
| Cost to brand per consented contact (at 80% opt-in) | ≈ €41, inclusive of the guest experience |

**What to build before scaling it.** Granular consent at check-in (delivery
versus marketing, separately, per GDPR guidance), a brand-facing results
page (sent, opened, shared, opted in), and a transactional mail provider
replacing Gmail so a 1,500-guest day does not hit the 500/day cap.

**Go-to-market.** The same client (Coty for Calvin Klein) runs launches across
markets. Offer a per-market roadshow licence. Then the Dutch selective beauty
retailers (ICI PARIS XL, Douglas, De Bijenkorf, Sephora Benelux) and the
Amsterdam experiential agencies that produce their events.

### #2. White-label licence for agencies and photo-booth operators

**What it is.** The same pipeline, sold per event to the people who already
have the clients: experiential agencies, event photographers, and the ~250
Dutch photo-booth rental firms whose base product is a €180–€545/day booth.
They operate it; you provide the software, the template compositor, the
delivery and the data export.

**Why it ranks second.** Near-zero marginal cost (Vercel, Supabase and email
run well under €0.10 per guest), it scales without your time, and it is the
upsell that lets a commodity booth operator charge activation prices. The
market gap is real: Snappic sells 48-hour licences for $29 and Snapbar sells
activations for ~$2k. Nothing in between offers brand-template compositing,
QR-bound DSLR capture and GDPR-clean data without face recognition.

**Pricing (assumption).**

| Model | Price |
|---|---|
| Per event day licence | €490 |
| Per guest alternative | €1.50 per delivered guest, €300 minimum |
| Brand template setup | €350 per template (or operator self-serve later) |
| Agency annual plan | €9,900 for 30 event days, white-labelled |

**Scenario.** Ten operators averaging four event days a month at €490 is
~€235k a year of software revenue at roughly 90% gross margin. Twenty-five
operators is ~€590k. These are illustrative, not forecasts; the binding
constraint is sales effort, not cost.

**What to build.** Multi-tenancy (events, templates and senders per
operator), a self-serve template uploader with the composite window
coordinates, operator billing, and an SMTP or API sender per tenant.
Roughly four to six weeks.

### #3. Conference and corporate headshot station

**What it is.** A photographer and a light at a conference. Attendees' badges
already carry a QR code. They hold the badge up for one frame, then pose. The
engine binds the session, the pipeline retouches (an AI retouch step such as
Evoto or a Sharp pipeline), and the LinkedIn-ready headshot is in their inbox
before they reach the coffee stand. Sponsors can pay for a branded frame.

**Why it ranks third.** US pricing is established and high: $2,450 for a half
day up to $11,500 for a full day at the premium end, with throughput as the
limiter. The engine's auto-binding raises throughput to one guest every 45–60
seconds with one staff member, which is the lever that makes a €3k–€6k day
profitable. Badge QRs mean no check-in iPad is needed at all. The deliverable
has high perceived value, so organisers accept it as sponsored content.

**Pricing (assumption).** €2,900 half day, €4,900 full day, plus €1,500 for a
sponsor-branded frame. Cost: photographer and lighting €900, retouch
automation at €0.20 per image, infra. Gross margin ~65–70%.

**What to build.** A retouch step in `deliver`, a badge-QR format adapter
(conference QRs encode URLs or IDs, not the current 6-character code), and
`guestName` lookup against an attendee list import instead of the check-in
table. Two to three weeks.

### #4. "Photo as marketing" for attractions and experience operators

**What it is.** The Fotaflo model: ziplines, boat tours, escape rooms,
museums, indoor karting. The ticket or wristband carries the QR. Guides shoot
during the experience; guests get free, venue-branded photos with share links
and a booking CTA; the venue gets referrals, reviews and an email list.

**Why it ranks fourth.** Recurring revenue (Fotaflo charges $199–$795 per
location per month) and strong evidence that free branded photos drive
referral traffic. But it needs concurrent sessions (several guides and groups
at once), booking-system integration, and a longer, lower-value sales cycle
than #1–#3. Fotaflo and PicThrive are entrenched in North America; the EU
privacy angle and lower price could win locally.

**Pricing (assumption).** €249–€599 per location per month. Twenty locations
is €60k–€140k ARR.

**What to build.** Multi-session concurrency in the reducer (a map of open
sessions keyed by code rather than a single `currentSession`), group bindings
(one QR, several guests), reminder emails, and a booking webhook. Six to
eight weeks.

### #5. Guest-pays verticals (graduation, endurance sport, seasonal portraits)

**What it is.** Large markets where the guest buys the photo: GradImages
photographs 1.8 million graduates a year at $20–$50 each; Sportograf and
MarathonFoto sell race photos at $25–$35; Cherry Hill runs Santa photos at
500+ locations from $44.99 a package; US school photography is a $1.2bn
market.

**Why it ranks lower.** Incumbents hold exclusive venue contracts, and the
revenue depends on payments, print fulfilment and sales funnels the engine
does not have. Bib-number tagging already solves identity in running without
faces. The engine is a component here, not a product. Worth pursuing only
through a partner who already owns the venue relationship, and only after #2
exists so the component can be licensed.

### #6. Weddings and private events

Fragmented, price-sensitive ($49–$499 for guest photo sharing), high support
load, and the buyer is a one-time consumer. Serve only indirectly through #2
when an operator wants it.

### Why not plain SaaS for photographers?

It is the obvious move and the weakest one. Honcho is $39–$59 a month,
Fotoflo is €6 a project, SpotMyPhotos is $142–$295. ARPU is low, churn is
high, and the incumbents already own the face-recognition workflow that most
photographers outside the EU want. The defensible version of this is #2:
sell to businesses that resell to brands, where the pricing anchor is the
activation, not the photographer's monthly software budget.

---

## 4. Recommendation

Run #1 and #2 together as one business: a service-led launch that funds and
proves the software, with #3 as the second product line because it reuses the
same station and needs the least new code.

**Sequence.**

1. **Now.** Package #1 with the pricing above. Pitch the existing client for a
   roadshow licence and the three Dutch selective beauty retailers. Keep the
   Gmail sender only until the first paid event; move to a transactional
   provider before any event over 400 guests.
2. **Weeks 1–3.** Build the consent split, the brand results page and the
   CRM export. These are what make the data pack sellable and what every
   agency will ask for.
3. **Weeks 3–8.** Multi-tenancy and self-serve templates for #2. Sign two
   photo-booth operators and one agency as design partners at a discount.
4. **Weeks 8–12.** Badge-QR adapter and retouch step for #3. Pilot at one
   Amsterdam conference with a sponsor-funded frame.
5. **Revisit #4** only once #2 has ten paying operators and the reducer has
   concurrency.

**Twelve-month illustrative outcome (assumptions, not a forecast).**

| Line | Low | High |
|---|---|---|
| #1 activations (8–20 event days) | €40k | €95k |
| #2 licences (5–15 operators) | €60k | €180k |
| #3 headshot days (6–15) | €25k | €65k |
| **Revenue** | **€125k** | **€340k** |
| Blended gross margin | ~75% | ~80% |

**The one risk that matters.** The engine's edge is the no-biometrics,
one-operator workflow. If a face-recognition incumbent ships an EU-compliant
QR mode, the edge narrows to brand compositing and client relationships. Move
on #1 and #2 before that happens, and make the GDPR posture explicit in every
sales conversation.

---

## 5. Sources

**Market size and spend**
- Photo booth market: https://straitsresearch.com/report/Photo-Booth-Market ; https://www.capturedcelebrations.com/photo-booth-statistics-2025 ; https://www.datainsightsmarket.com/reports/photo-booth-rental-service-1929846
- Experiential and brand activation spend: https://seeker.io/blog/experiential-marketing-statistics/ ; https://dataintelo.com/report/brand-activation-service-market ; https://expofabrication.com/brand-activations/brand-activation-boom-experiential-marketing-4-billion-industry.html

**Brand-paid pricing and ROI**
- Activation photo stations and photography: https://eventphotojournalism.com/brand-activation-photography-guide/ ; https://extraordinaryphotobooths.com/behind-the-booth/corporate_event_photo_booth_cost/
- Photo booth engagement, share rate and ROI: https://www.capturedcelebrations.com/post/photo-booth-roi-corporate-events-complete-guide ; https://www.capturedcelebrations.com/photo-booth-statistics-2026
- Email opt-in benchmarks at activations: https://www.mdrnphotoboothcompany.com/blog/how-experiential-marketing-agencies-use-photo-booths-to-prove-roi ; https://photoboothvancity.ca/how-to-measure-photo-booth-roi-metrics-that-actually-matter/
- Experiential and trade show CPL: https://snapbar.com/blog/how-to-measure-experiential-marketing-roi ; https://streetteamsco.com/blog/experiential-marketing-roi-statistics.html ; https://sopro.io/resources/blog/b2b-cost-per-lead-benchmarks/ ; https://chococraft.com/blogs/corporate-gifts/how-many-leads-should-you-expect-from-a-trade-show
- UGC conversion impact: https://blog.storecensus.com/ugc-conversion-rates-data-2026/ ; https://loop.fans/blog/ugc-statistics
- Luxury CRM and clienteling value: https://www.itshco.com/blog/clienteling-luxury-retailers ; https://www.hummingbird.agency/personalised-email-marketing-maximising-customer-lifetime-value-for-luxury-brands/

**Conference headshots**
- https://headshotprosaz.com/how-much-do-conference-headshots-cost/ ; https://www.eventheadshots.com/ ; https://www.wasiofaces.com/expo-tradeshow-headshot-booth ; https://twodudesphoto.com/services/headshot-booth

**Competitor pricing (software)**
- SpotMyPhotos: https://www.spotmyphotos.com/products/
- Waldo Photos: https://waldophotos.com/pricing/
- Honcho: https://thehoncho.app/pricing/ ; https://oureventalbum.com/reviews/honcho
- Fotoflo: https://www.fotoflo.co/
- Snappic, Darkroom, Simple Booth: https://www.simplebooth.com/blog/lumabooth-vs-snappic/ ; https://www.snappic.com/pricing
- Snapbar and provider comparison: https://snapbar.com/blog/comparison-of-photo-booth-software-providers ; https://snapbar.com/pricing
- Photobooth Supply Co: https://photoboothsupplyco.com/pages/fiesta-pricing

**Attractions and photo-as-marketing**
- Fotaflo pricing and case studies: https://www.fotaflo.com/pricing ; https://www.fotaflo.com/case-study/the-ranch ; https://adventureparkinsider.com/article/capturing-customers/
- Theme park photo and ancillary revenue: https://blooloop.com/news/magic-memories-new-ride-photo-system-for-oakwood-theme-park/ ; https://www.pictureworks.com/en-news/beyond-ticket-sales-5-ways-theme-parks-attractions

**Guest-pays verticals**
- Graduation: https://slate.com/business/2025/05/graduation-photos-monopoly-expensive-university-ceremony.html ; https://turtlepic.com/blog/why-is-gradimages-so-expensive/ ; https://www2.gradimages.com/home/aboutus
- Endurance sport: https://hyroxapac.zendesk.com/hc/en-us/articles/8221166271887-Race-photos-Sportograf ; https://www.racedirectorshq.com/read/race-photo-sharing-pic2go-55/ ; https://www.endurancesportswire.com/pic2go-releases-new-race-photo-sales-solution/ ; https://info.runsignup.com/2026/10/01/photo-based-timing-faq/
- Seasonal and school: https://cherryhillprograms.com/ ; https://capturely.com/best-school-photography-companies/ ; https://capturely.com/school-photography-pricing/

**Regulation (biometrics, consent)**
- Dutch regulator framework: https://www.autoriteitpersoonsgegevens.nl/documenten/juridisch-kader-gezichtsherkenning ; https://lawandmore.nl/it-recht/gezichtsherkenning-op-evenementen-juridische-grenzen/
- GDPR Article 9 and the EU AI Act: https://iapp.org/news/a/biometrics-in-the-eu-navigating-the-gdpr-ai-act ; https://gdprlocal.com/biometric-data-gdpr-compliance-made-simple/
- Event data capture consent practice: https://aiphotobooth.eu/blog/en/gdpr-compliant-event-data-capture/ ; https://pixora.ch/en/blog/lead-capture-expo-gdpr-photo-booth/

**Dutch market**
- Photo booth rental pricing NL: https://photobooths-huren.nl/zakelijk/ ; https://www.huren.nl/p10809/photobooth ; https://fotosnap.nl/
