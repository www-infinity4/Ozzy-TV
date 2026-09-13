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

`engine.js` builds a deterministic schedule from the viewer's local calendar date. Every day receives a different seed and ordering. The scheduler exhausts the available catalog before reshuffling, so repeats are spaced as far apart as the available pool permits.

Every Sunday at local midnight the **week key changes**. That automatically rebuilds the coming seven-day rotation with a new weekly seed instead of replaying the prior week's sequence.

The engine supports 144+ unique playable entries per day and 1,008+ unique entries per week as the catalog grows. The initial committed catalog is a starter broadcast pool; adding more verified embeddable music videos automatically increases variety without changing the scheduler.

## Network integration

The page uses the shared Infinity channel remote, weekly guide, share/StarCoin wallet hooks, and PiP helper from the TNT channel scaffold. It exposes the same `HermitEngine`, `HERMIT_CATALOG`, and `HERMIT_COMMERCIALS` interfaces used by the network tools so Ozzy TV can participate in the shared live guide.
