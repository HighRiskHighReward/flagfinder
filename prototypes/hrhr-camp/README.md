# HR² Summer Camp Tracker (prototype)

A clickable prototype for High Risk High Reward (HR²) Sports Performance & Fitness summer camp
(Prosper Rec Center + Plano Oak Point Rec Center, 2 days a week for 4 weeks, ages 8–11, boys and girls).
It is a separate product from FlagFinder and shares no code or data with it.

Open `index.html` in a browser.

## Brand
Taken from hrx2performance.com: black sections, gold accents (#D4C618, #C7B426, #E6DB49), bronze #B47D2C,
Audiowide headlines and Poppins text. The logo can be uploaded in Coach → Brand (the site's logo is on a CDN this build sandbox cannot reach).

## Portals
- **Head** (`#head`): private to the artifact owner (the head instructor). Trainers do not see the tab, and `#head` shows "This portal is private" to anyone else. Four tabs:
  - *Today*: shared camp timer, live feed of trainer entries, trainer status, messages to trainers with read receipts, athlete board.
  - *Players*: search by number, name, position, pod or parent. Each player opens a profile: edit player info (number, name, positions, pod, division, age, site), private parent contact, your inputs (camp goal, note for parents, private diagnosis), on-field flags and focus messages, rate them yourself, diagnosis, and previews of their pre- and post-session emails. Add or import athletes.
  - *Parent emails*: pre-session (theme, the kid's focus today, how to help, arrival and what to bring) and post-session (shout-out, strength, work-on with home drill, tests, your note, goal, mission, Fall 2027 outlook) emails, personal to each family. Add a message for every family, select families, open in the email app, copy, copy all addresses, download a mail-merge CSV, mark as sent (post-session also unlocks the update in the parent portal). Email history.
  - *Settings*: pods and trainers, who sees what, parent portal status, brand and logo, clear live data.
- **Coach** (`#coach`, opens first). Boys | Girls tabs, then site and session.
  - *Home*: synced timer (also pinned to the bottom of the screen), messages from the head instructor (phone buzzes, "Got it" sends a read receipt), My pod with flags, latest updates from all trainers.
  - *Rate today*: 3 focus categories per session; the other 12 carry over. Each card reads "#7 Mason T. QB".
    "Save · next" moves through the roster. *By station* rates the whole group on one category.
  - *Roster*: read-only roster (number, name, positions, pod, age). No parent contacts.
- **Parent** (`#parent`): grade ring, latest update, growth plan, **Fall 2027 season outlook** (readiness level, readiness by area,
  position fit, August targets, 6-week summer plan for Jul 5–Aug 15), 4 pillar grades, full 15-category breakdown (Now → Next), tests, trend.
- **Athlete** (`#athlete`): number, level/XP, kid-friendly plan, personal bests, badges, road to fall.

## The 15 categories (rated 1–5 with a written description per level)
- Mindset: Compete Level, Mental Toughness, Focus & Discipline, Confidence, Drive & Love of the Game
- Character: Coachability, Teammate, Leadership, Work Ethic, Respect & Sportsmanship
- Football Skills: Stance & Start, Footwork & Change of Direction, Ball Skills, Football IQ, Position Technique

Plus 4 measured tests: 20-yard dash, 5-10-5 shuttle, broad jump, push-ups in 30 s (age-band benchmarks, same for boys and girls at 8–11).

## Scoring
- Rating → 100-point scale: `44 + 10.8 × rating`. Category score = average of the last two sessions.
- Tests: age-band floor = 55, elite = 98. Benchmarks are starting estimates to recalibrate with real camp data.
- Overall = equal parts Athletic, Mindset, Character, Football Skills.
- Fall 2027 readiness: Fall-ready 88+, On track 78+, Developing 68+, Foundation below that.

## Live sync
The page uses the artifact's shared database: timer, messages, read receipts, flags, head notes, ratings, sent status, feed and added athletes sync to every device that has the page open. Storage rules: `hq/` (parent contacts, head notes and goals, email log) is readable and writable by the owner only; Editors and trainers get nothing. Timer, flags, messages, player info and sent status are writable by the owner only. Contributors (trainers) write ratings, feed and read receipts. Without the database (local file, preview) everything runs on one device, and tabs on that device stay in sync.

## Identifying kids
Every athlete has a pod (pinnie color: Red, Blue, Green, White) run by one trainer, plus jersey number, name and preferred position.

## Limits
- Demo data only (fictional athletes and families). Base demo ratings live in each browser; new ratings sync live. "Send" does not deliver messages yet.
- No body-type rating. Position fit uses tests and ratings only.
- Real use needs a backend, family and coach logins, parental consent, and a text/email service.
  Store jersey number, first name + last initial, division, age group, position and one parent contact. Never birthdates.
