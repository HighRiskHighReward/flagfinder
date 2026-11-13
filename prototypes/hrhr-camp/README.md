# HRHR Summer Camp Tracker (prototype)

A clickable prototype for the High Risk High Reward Sports Performance & Fitness summer camp
(Prosper Rec Center + Plano Oak Point Rec Center, 2 days a week for 4 weeks, ages 8–11).
It is a separate product from FlagFinder and shares no code or data with it.

Open `index.html` in a browser. Three portals:

- **Coach** (`#coach`, opens first). Three tabs:
  - *Rate today*: each session has 3 focus skills tied to its theme. A coach rates only those 3 (1–5, written rubric),
    picks one "work on" (the app suggests the lowest rating), and can tap a shout-out phrase. The other 7 ratings carry over
    from the last session and show as dashed until a coach changes them. "Save · next" goes straight to the next kid.
    *By skill (station)* rates the whole group on one skill, and each tap saves right away. Test results are entered on Sessions 1, 4 and 8.
  - *Send updates*: a personal message for every family (shout-out, strength, work-on + 10-minute home drill, mission,
    test results, overall grade), with a copy button and one "Send to all" button.
  - *Families*: the roster with one parent contact each. Add one athlete, or paste rows from a registration export.
- **Parent** (`#parent`): latest update, a 3-step growth plan with home drills, at-home mission, overall grade ring (A–F, 1–100 or 1–10), Camp Drive
  progress, Athletic / Football Skills / Character pillar grades, trend chart, testing table, trait bars, position read.
- **Athlete** (`#athlete`): level and XP, personal bests, badges, superpowers, level-up target. No letter grades for kids.

## Scoring
- Rating 1–5 → 100-point scale: `44 + 10.8 × rating` (1≈55 F … 5=98 A+). Trait score = average of the last two sessions.
- Tests are scored against age-band benchmarks (floor = 55, elite = 98). The benchmarks are starting estimates and should be recalibrated with real camp data.
- Overall = 35% Athletic + 30% Football Skills + 35% Character.

## Limits
- Demo data only (fictional athletes and families). "Send" does not deliver messages yet: it needs the backend plus a text/email service.
- Demo data only. Everything is saved in the browser on one device. Nothing is shared between devices.
- No body-type rating. "Position read" uses test results and skill ratings only.
- Real use needs: a backend, a separate login for each family, parental consent, and a staff role for coaches.
  Store only first name + last initial and an age band, never birthdates.
