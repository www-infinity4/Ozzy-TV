# Ozzy TV

Ozzy TV is a synchronized rock and heavy-metal music-video channel built on the Infinity live-channel scaffold.

## Broadcast clock

- 10-minute fixed station slots.
- 144 slots per local day (`12 videos per two-hour block × 12 blocks`).
- 1,008 slots in the seven-day guide.
- A music video starts on the slot boundary and is allowed to play to its natural end.
- When the video finishes, the remainder of the ten-minute slot becomes **Ozzy TV Intermission**.
- That intermission is reserved inventory for later music-related advertising: guitars, amps, records, concerts, bands, merchandise, and similar placements.
- At the next ten-minute boundary, the next scheduled video starts for every live viewer.

## Daily and weekly rotation

`engine.js` builds one deterministic **1,008-slot weekly rotation** first, then divides it into seven consecutive 144-slot days. The scheduler exhausts every available playable video before reshuffling, so repeats are pushed as far apart as the available source pool permits.

Every Sunday at local midnight the **week key changes**. That rebuilds all 1,008 positions with a new weekly seed instead of replaying the prior week's sequence.

With at least 144 verified playable videos, a day can run 144 unique entries. With at least 1,008 verified playable videos, the entire seven-day guide can run without repeating a video. The initial committed catalog is a starter broadcast pool, so it currently has to reuse videos after the pool is exhausted; adding verified embeddable music videos automatically increases variety without changing the scheduler.

## Network integration

The page uses the shared Infinity channel remote, weekly guide, share/StarCoin wallet hooks, and PiP helper from the TNT channel scaffold. It exposes the same `HermitEngine`, `HERMIT_CATALOG`, and `HERMIT_COMMERCIALS` interfaces used by the network tools so Ozzy TV can participate in the shared live guide.
