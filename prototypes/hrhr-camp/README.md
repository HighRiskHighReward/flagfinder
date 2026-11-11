# HRHR Summer Camp Tracker (prototype)

A clickable prototype for the High Risk High Reward Sports Performance & Fitness summer camp
(Prosper Rec Center + Plano Oak Point Rec Center, 2 days a week for 4 weeks, ages 8–11).
It is a separate product from FlagFinder and shares no code or data with it.

Open `index.html` in a browser. Three portals:

- **Coach** (`#coach`): pick the site and session, tap an athlete, rate 10 traits 1–5 against a written rubric,
  enter test results on testing days (Sessions 1, 4, 8), add a shout-out and next focus, then send the day's update to parents.
- **Parent** (`#parent`): latest update, at-home mission, overall grade ring (A–F, 1–100 or 1–10), Camp Drive
  progress, Athletic / Football Skills / Character pillar grades, trend chart, testing table, trait bars, position read.
- **Athlete** (`#athlete`): level and XP, personal bests, badges, superpowers, level-up target. No letter grades for kids.

## Scoring
- Rating 1–5 → 100-point scale: `44 + 10.8 × rating` (1≈55 F … 5=98 A+). Trait score = average of the last two sessions.
- Tests are scored against age-band benchmarks (floor = 55, elite = 98). The benchmarks are starting estimates and should be recalibrated with real camp data.
- Overall = 35% Athletic + 30% Football Skills + 35% Character.

## Limits
- Demo data only (fictional athletes). Everything is saved in the browser on one device. Nothing is shared between devices.
- No body-type rating. "Position read" uses test results and skill ratings only.
- Real use needs: a backend, a separate login for each family, parental consent, and a staff role for coaches.
  Store only first name + last initial and an age band, never birthdates.
