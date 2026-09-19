# Bushel — demo video

**3:36, 1920×1080, captions burned in.** Recorded from the deployed site by `web/scripts/demo-video.mjs`
(headed Chrome, Chrome's own frames at 30 fps, H.264 MP4 plus an SRT). Every figure in a caption is read off
the screen as it is shown; every figure on a slide carries its source. Rerun:

```
cd web && node scripts/demo-video.mjs        # needs: pip install imageio-ffmpeg
```

## The shape

One county, one fire, one order — a person who has to replant, not a tour of features. The app is on screen
from the first second (Devpost's own advice: say what it does immediately), the problem arrives through that
person's ground rather than through statistics, and the sources sit in small type instead of being read out.

| | Beat | On screen |
|---|---|---|
| 0:00 | Where you work | The first-run question; Plumas County chosen |
| 0:12 | What is at stake there | 8,104 acres that won't grow back; more than half from one fire |
| 0:19 | What waiting costs | Forest to shrubland, ash in the creek, water downstream; $4.39bn fighting vs $123m replanting; the 4M-acre backlog; the 31 October seed deadline |
| 0:50 | The Dixie fire | Retained land, burn severity, the interior lighting up, the 90 m choice, seed zone × elevation |
| 1:33 | The order | 272 bushels, 257 lb, $71,594; export, and the file a nursery receives; the factor trail |
| 2:01 | The three unknowns | Amber factors, moved and reset |
| 2:16 | Does it hold up | 22.4% against the published 21.9% |
| 2:27 | Reach | All of California; Beachie Creek built live from national data; Oregon's own map |
| 3:19 | Close | It opens on your county next time |

## Rules this script follows

- **One place, one fire.** A named county beats aggregate numbers (NN/g on persuasive storytelling; the
  Heaths' "Rokia effect": one named person drew more than statistics).
- **No claim the data doesn't carry.** Nothing says replanting cleans a river. The stakes shown are the
  sourced ones: habitat loss, post-fire ash in streams, forests as water supply.
- **Sources on screen, not spoken.** Confidence, not defensiveness.
- **Spoken cadence.** Short sentences, contractions, one idea each, concrete nouns
  (plainlanguage.gov; Google and Mailchimp style guides).

`voiceover-script.md` beside the video carries the same script timed for a human read.
