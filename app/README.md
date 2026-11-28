# PlungeTX

Phone-first coach for breathing, cold plunges, sauna, and hot/cold contrast. The line is **Breathe. Plunge. Recover.** Sessions keep a day streak, a calendar, 23 awards, and a share card. History stays on the phone.

This repository is the app only. The marketing site remains in [prodecapublishing/PlungeTX](https://github.com/prodecapublishing/PlungeTX).

## Run it locally

The app is a static site. Modules and the service worker need a local web server (opening the file directly will not work).

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173/ . Use a narrow window, about 390×844, to see the phone layout.

## Voices

Guidance is recorded audio, not the browser's speech synthesizer. Three voices ship in the repo:

| Folder | Name |
| --- | --- |
| `audio/harper_32/` | Harper |
| `audio/george/` | George |
| `audio/john-rhys-davies/` | John Rhys-Davies |

Each folder has the same clips: the core cues, the finish cheer, and 48 savage lines (`savage_cold_00`–`23` and `savage_heat_00`–`23`). `audio/manifest.json` maps every clip id to the spoken line.

Lines that change with the setup are already split into clips, and the player queues them in order:

- `breath_intro` + `well_do_r{rounds}_b{breaths}` + `breath_begin`
- `round_{n}_of_{r}` before a contrast enter line
- `minutes_in_{k}` or `one_minute_in`, sometimes followed by a halfway line
- `minutes_{n}` and `minutes_{n}_thirty` during a long breath hold
- `new_award` plus one `award_{id}` clip per new award

Harper is the voice for a new phone. A saved choice of George, Harper, or John Rhys-Davies is left as it is. Preview plays a short line in the selected voice.

Coaching style is Calm, Hard, or Savage. Savage is a drill-sergeant layer on top of the hard lines. During an active plunge, sauna, or contrast hold it plays one savage clip about every 30 seconds (give or take 5). Cold holds use the cold lines, heat holds use the heat lines, and contrast switches with the phase. The pool is shuffled and not repeated until every line in that pool has played. A line waits if another cue is already speaking. Breathing sessions stay quiet of savage lines. The selector says: Brutal language. Not for kids.

## Sauna music

Breathing and cold still use the small synthesized beds. Sauna, and the hot half of contrast, use one of three recordings. The Background music switch is Off. Each file is 128 kbps MP3, loudness-matched near −17 LUFS, and the end is crossfaded into the opening so the loop does not click. They play through the same volume control that ducks under the voice.

| Name | File | What you hear | Source | License |
| --- | --- | --- | --- | --- |
| First Light | `audio/music/first-light.mp3` | Soft piano and slow ambient pads, no percussion. About 2:04. | [First Light Particles by Yoiyami](https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Soft Rain | `audio/music/soft-rain.mp3` | Rain over a slow ambient bed. About 3:14. | [It’s Pouring by SpringySpringo](https://opengameart.org/content/its-pouring) | CC0 1.0 |
| Stillness | `audio/music/stillness.mp3` | Ethereal, tape-soft meditation. About 5:38. | [November Snow by The Cynic Project](https://opengameart.org/content/november-snow) | CC0 1.0 |

A finished session, not one you end early, closes with “Ohhhh yeahhhh! You did it!” in the selected voice, after the completion line.

Hold-time announcements are recorded through 12:00. A hold longer than that stays on the timer and simply stops adding spoken minute marks.

## What is saved on the phone

The same `localStorage` keys as the app at plungetx.com/app/, so a later swap does not wipe anyone's log:

| Key | Contents |
| --- | --- |
| `ptx_history` | Session log |
| `ptx_badges` | Award unlock times |
| `ptx_settings` | Durations, coach, voice, music |
| `ptx_safetyOk` | Safety screen accepted |
| `ptx_chart` | Which exercise the results chart shows |

Results → **Export backup** downloads those three records as JSON. **Import backup** replaces them and offers Undo. **Clear history and awards** removes the log and the awards together. Deleting a single row removes that session and leaves awards as they are.

## Offline

After the first online load, the service worker keeps the app shell, the fonts, the sauna music, and the voice you have selected (about 8 MB). The other two voices are cached the next time you pick them, while you are online. A later visit with no signal still opens and still speaks in the voice you already used. The cache name is `plungetx-app-v5`.

## Deploy

Relative URLs are used throughout (`css/app.css`, `js/app.js`, `audio/...`, manifest `start_url` and `scope` of `./`). The service worker is registered for the directory that contains the page, so the same files work at either address below.

Two publishes are intended:

- **https://plungetx.com/app/** — the files in this repo, copied into the `app/` folder of [PlungeTX](https://github.com/prodecapublishing/PlungeTX). The marketing site and its `CNAME` stay put. History stays on `plungetx.com` under the existing `ptx_*` keys.
- **https://prodecapublishing.github.io/plungetx-app/** — GitHub Pages for this repo. `.github/workflows/pages.yml` publishes the repository root when `main` changes. In the repo settings, Pages must use **GitHub Actions** as the source. Do not add a `CNAME` here. `plungetx.com` belongs to the PlungeTX repository.

### Pointing plungetx.com/app at this app

Checked against the live site and the PlungeTX repo:

- https://plungetx.com is GitHub Pages. The `CNAME` file (`plungetx.com`) lives in the **PlungeTX project repo**, not in a `prodecapublishing.github.io` user site (that repository does not exist).
- https://plungetx.com/app/ is the current coach, served from `PlungeTX/app/`.
- https://plungetx.com/plungetx-app/ is a 404.
- https://prodecapublishing.github.io/ is a 404, which matches “no user site.”

So turning on Pages for this repo publishes `https://prodecapublishing.github.io/plungetx-app/`. It does **not** publish `https://plungetx.com/plungetx-app/`. That subpath behavior only happens when the custom domain is on the account's user (or organization) site. Here the domain belongs to a different project.

Ways to serve this app at `plungetx.com/app` without a DNS change:

1. **Sync into the existing site (smallest move).** Keep the marketing pages in PlungeTX. Replace `PlungeTX/app/` with the files from this repo (a copy, or an Action that pulls this repo's `main` into that folder). The URL stays `plungetx.com/app/`. `localStorage` keys match, so phones keep their history. This does require a commit in the PlungeTX repo.
2. **Make a user site and mount both.** Create `prodecapublishing.github.io`, move the `CNAME` onto it, publish the marketing site at `/` and this app at `/app/`, and remove the `CNAME` from PlungeTX so only one repo claims the domain. GitHub's A/AAAA records for Pages can stay. This is the layout GitHub expects when several projects share one domain.
3. **Leave this repo on github.io** and link to it from the marketing site. No DNS change, and `plungetx.com/app` keeps serving the old app until option 1 or 2 happens.

This repo does not change PlungeTX or DNS.
