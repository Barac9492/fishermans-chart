# The Fisherman's Chart — Simon Peter's Galilee & Jerusalem

A walkable 3D story built on the *Melville's Manhattan* framework
(https://melville-nyc.vercel.app/): vanilla Three.js, first-person exploration
of a stylized not-to-scale world, red markers that open narrative site cards,
progress HUD + compass + bird's-eye chart view, and an epilogue unlocked when
every site is found.

## Why the framework fits

The Melville app works because of three things, and Peter's story has all three
natively:

1. **The water is the protagonist's element.** Melville's Manhattan is "belted
   round by wharves"; Peter's world is belted round by the Sea of Galilee. The
   nautical UI language the framework already uses ("Go ashore", the compass,
   the anchor icon, charted/uncharted) doesn't need translating — Peter is
   literally a fisherman.
2. **A geography of memory, not accuracy.** Melville's map is a parchment
   cartoon of Manhattan. Peter's map should be a **pilgrim's chart** in the
   tradition of the 6th-century Madaba mosaic map: Galilee in the north,
   Jerusalem in the south, the Jordan river as the connecting spine —
   compressed into one continuous walkable world, maybe 5 minutes on foot end
   to end.
3. **A posthumous-vindication epilogue.** Melville dies forgotten, then
   *Billy Budd* ignites the revival. Peter's arc is the same shape amplified:
   the man who denied three times becomes the rock; the fisherman ends in Rome
   with a basilica over his bones. The epilogue structure carries this for free.

## The world

One continuous stylized landmass, mosaic-and-gold instead of parchment-and-ink:

- **North — the Sea of Galilee.** A walkable shoreline ring, Capernaum village
  (a handful of black-basalt houses, the synagogue), fishing boats drawn up on
  the shingle, nets on racks. One or two boats are *walkable/boardable* (the
  framework already supports extra walkable rects — the Melville piers).
- **Far north edge — Caesarea Philippi.** A red rock cliff with the dark grotto
  of Pan at its base (the "gates of hades" backdrop for the confession).
- **The spine — the Jordan road.** Replaces Broadway/the El: a dusty road
  following the river south, with a caravan or shepherd as ambient life.
- **South — Jerusalem on its hill.** Walls, gates, the high priest's courtyard,
  the Mount of Olives with an olive grove (Gethsemane) to the east, Golgotha
  outside the wall, a garden tomb nearby.

**Time-of-day zoning** (new mechanic, cheap to build — it's just lighting +
sky color by region): Galilee sits in warm morning light; as you walk the
Jordan road the sky dims; Jerusalem is night — torchlight, cold moon; the
final stretch of Galilee shore (site 10) alone is dawn-gray turning gold.
You physically walk from morning into the night of the Passion and back out
into dawn.

## The ten sites

Chronological numbering; free-roam discovery like the original. (*) = fill-in
events beyond the eight requested.

| # | Site | Event | Where | Artifact |
|---|------|-------|-------|----------|
| 1 | The Nets | Meeting Jesus — the miraculous catch, "Follow me" (Luke 5) | Galilee shore by Capernaum | A net abandoned mid-mending |
| 2 | The House at Capernaum (*) | Peter's mother-in-law healed; "the whole city at the door" (Mark 1) | Capernaum village | A doorpost worn smooth by the crowd |
| 3 | The Fourth Watch | Walking on the water (Matt 14) | **Out on the lake** — see special mechanic | A sandal, soaked through |
| 4 | The Rock at Caesarea Philippi | "You are the Christ, the Son of the living God" (Matt 16) | Cliff + grotto, far north | Two iron keys on a ring |
| 5 | The Olive Press (*) | Gethsemane — sleeping, the sword, Malchus's ear (John 18) | Olive grove east of the city | A sword, ordered back into its sheath |
| 6 | The First Fire | The courtyard — three denials, the rooster (Luke 22) | High priest's courtyard, Jerusalem | A charcoal ember, gone cold |
| 7 | At a Distance | Seeing Jesus die — "all his acquaintances stood at a distance" (Luke 23:49) | A rooftop/wall **far from** Golgotha | The hem of a cloak, gripped in a fist |
| 8 | The Footrace | Running to the empty tomb — outrun, but first inside (John 20) | Garden tomb outside the wall | Linen cloths, folded where they lay |
| 9 | The Long Night | "I am going fishing" — and catching nothing (John 21:3) | A boat, out on dark water | An empty net, dripping |
| 10 | The Second Fire | A figure on the shore at dawn; a charcoal fire; "It is the Lord!" (John 21) | Galilee beach at dawn — charted **from the water** | A charcoal fire, lit and warm |

Per the brief, the story stops at *seeing* Jesus on the shore: site 10's card
ends with Peter throwing himself into the sea, and the screen cuts to the
epilogue before he reaches the beach.

### Site-specific mechanics

- **Site 3 (walking on water):** the only marker off-shore. Approach it in the
  boat and, within ~15 units, the water itself becomes walkable — you step out
  and it bears you. A toast fires halfway: *"The wind is against you."* If you
  stop moving toward the marker for more than a beat, you sink a half-meter
  and the toast reads *"You began to sink — keep walking."* Reaching it charts
  the site. (Implementation: a temporary walkable circle + a y-offset easing,
  ~40 lines on top of the existing movement code.)
- **Site 7 (the cross):** inverted proximity. Every other site pulls you close;
  this one has a huge visit radius and the card opens only *at a distance* —
  if you walk toward Golgotha the marker stays gray and a toast says
  *"He watched from far off."* You chart it by standing on the far wall. The
  mechanic *is* the meaning.
- **Site 8 (the footrace):** entering the garden triggers a brief sprint —
  movement speed doubles, breathing audio, and a ghost-runner (the beloved
  disciple) pulls ahead of you and then stops at the tomb mouth, waiting. You
  pass him and go in first, exactly as in John 20.
- **Sites 6 & 10 (the two fires):** the narrative spine. Same charcoal-fire
  model, same crackle audio, placed at the denial and at the dawn shore. The
  chart key visually pairs them (⚯). Site 6's artifact is a cold ember; site
  10's is the same fire lit. The rooster crow plays as ambient audio anywhere
  near the courtyard — *before* you ever chart it.
- **Boats:** the lake sites (3, 9, 10) are reached by boarding a boat that
  glides along a fixed rail between shore posts (simplest faithful version of
  the pier-walkway trick; no free sailing needed).

## Framework element mapping

| Melville | Peter |
|---|---|
| Title screen: "Melville's Manhattan", Moby-Dick Ch. I quote, "Go ashore" | "The Fisherman's Chart — Simon, called Peter", quote: *"Master, we toiled all night and took nothing. But at your word I will let down the nets."* (Luke 5:5), button: **"Push out from shore"** |
| "0 of 6 sites charted" | "0 of 10 places remembered" |
| Compass → nearest uncharted site | Same, but the needle is a fish (ichthys) |
| Chart View (M): parchment bird's-eye | Madaba-style mosaic bird's-eye, gold tesserae |
| Site card: seal number, title, dates, prose, artifact | Same, dates become scripture refs (e.g. "John 21:1–14"); artifact line becomes a **relic** line |
| Ambient audio: harbor, gulls | Lake water, gulls, night insects in Jerusalem, rooster near the courtyard, fire crackle |
| Epilogue: "The Tide Turns" — the Melville revival | **"Feed My Sheep"** — see below |
| Closing quote: "It is not down in any map; true places never are." | *"When you were young, you dressed yourself and walked wherever you wanted; but when you are old… another will carry you where you do not want to go."* (John 21:18) |

## The epilogue — "Feed My Sheep"

Unlocked at 10/10. Because the brief excludes the actual reunion from the
sites, the epilogue is where it lives — which mirrors the original exactly
(Melville's vindication also happens only in the epilogue, after his death):

1. Breakfast on the shore. Then three questions by the second fire — *"Do you
   love me?"* — one for each denial by the first.
2. Pentecost: the man who was afraid of a servant girl stands up in Jerusalem
   and three thousand believe.
3. The long arc: the fisherman travels to Rome; tradition says he was
   crucified head-down, counting himself unworthy to die as his Lord did; a
   basilica now stands over his grave, and the confession at the rock is
   carved around its dome in letters six feet tall. You have remembered all
   ten true places of his life.

Closing quote (John 21:18) lands the walking motif: a game about walking
wherever you want, ending on the promise that one day he'll be carried.

## Build notes

- Same stack as the original: static site, vanilla Three.js via import-map
  CDN, no build step, deployable to Vercel as-is.
- File structure mirrors the original: `index.html`, `styles.css`,
  `js/main.js` (world + movement + interaction), `js/sites.js` (all narrative
  content, same schema: `{id, num, title, dates, pos, body[], artifact,
  image?}` + `EPILOGUE`), `js/audio.js` (procedural WebAudio ambience).
- New code on top of the framework: time-of-day zones (lighting lerp by z),
  boat rails, the water-walk circle, the distance-gated site, the sprint
  trigger. Everything else is a re-skin.
- Typeface swap: EB Garamond stays (it reads as scriptural); the display face
  IM Fell English SC → something with a Byzantine/uncial flavor.
- Palette: basalt black (Capernaum stone), lake blue-green, mosaic gold,
  Jerusalem limestone under moonlight, the marker red kept from the original.

### Example `sites.js` entry

```js
{
  id: 'second-fire',
  num: 10,
  title: 'The Second Fire — Dawn on the Shore',
  dates: 'John 21:1–14',
  pos: { x: -8, z: 88 },          // on the beach; charted from the water
  body: [
    `They fished all night and caught nothing. At first light a figure stood
     on the beach, a hundred yards off, beside a small charcoal fire — the
     first charcoal fire since the courtyard. "Cast the net on the right
     side," he called, and the net came up so full they could not haul it.`,
    `John said it first: "It is the Lord." But it was Peter who could not
     wait for the boat — he tied his cloak around him and threw himself
     into the sea.`,
  ],
  artifact: 'A charcoal fire, lit and warm',
},
```
