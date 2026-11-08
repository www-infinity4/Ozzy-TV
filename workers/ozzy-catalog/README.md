# Ozzy TV Cloudflare reviewed video catalog

Issue #1 / Draft PR #2. This is **source staged**, not proof of a deployed playlist.

The existing static catalog contains exactly **80 distinct YouTube video IDs**. It remains the fallback until the live Cloudflare API is configured, populated and verified. The goal is at least **1,000 reviewed unique video embeds** (1,008 slots/week; exactly 1,000 means only eight repeats per week). The repository does not contain another 920 verified video IDs yet, so never report 1,000 ready.

## Safe source flow

The reviewed repository manifest is `data/approved-videos.json`. Each item must supply valid 11-char YouTube `videoId`, `artist`, `songTitle`, matching `sourceUrl` (youtube.com/watch?v or youtu.be), `embedApproved: true` after **actual playback verification**, `reviewedAt` Unix milliseconds, and `reviewSource` describing the independently checked source. The importer rejects unreviewed, old (>120 days) or non-YouTube records, duplicate IDs, invalid URLs or unauthorized hostnames. Only the known public repo `main` manifest may be polled. No scraping, no fabricated titles, no downloaded music/video files, no claim of rights ownership. YouTube embedding remains subject to publisher restrictions and the platform's terms.

Every six hours a Worker Cron imports the reviewed GitHub manifest into an isolated Cloudflare D1 transaction, preserving de-duplication. The same Cron reads the most recent public YouTube uploads from verified official Ozzy Osbourne, Black Sabbath, Metallica and Iron Maiden channels. It stores their video IDs, titles, provenance and timestamps in **ozzy_candidates** as **pending** only; RSS uploads can be trailers, Shorts or restricted videos and must never auto-enter the live playback catalog. The approved feed remains the separately reviewed GitHub manifest. The read-only public endpoint `/api/ozzy/catalog` publishes only recently approved records and returns a single Central-time, deterministic weekly permutation of 1,008 slot IDs. Each available video is used before repeating; a pool of 1,000 provides 1,000 unique first slots and eight repeats. Weekend reschedule uses a new weekly seed. The client merges newly reviewed records with existing starter IDs when the D1 catalog is still small; otherwise it adopts the larger approved pool. This prevents an empty feed breaking the current station.

Use Cloudflare account-specific deployment config to bind the independently verified D1 database; do not commit tokens or invent a database ID. The GitHub Pages channel may call the Worker endpoint with scoped CORS after deployment, or QuantaPhi's site Worker may provide a reviewed `OZZY_CATALOG` service-binding proxy. Until route integration exists, client gracefully uses its 80-entry fallback.

### Operational acceptance

1. Run `node --test test/*.test.mjs` plus syntax checks at exact PR head.
2. Confirm Cloudflare D1 database schema and reviewed record count directly.
3. Check scheduled Cron, endpoint, freshness, CORS, mobile YouTube embed playback and failures (including regional/age/embed restrictions). Do not interpret a valid video ID as a working video.
4. Review source rights, GitHub PR and merge under normal owner authorization.
5. Verify QuantaPhi site and Android reception separately; only then report deployed and playing. No StarCoin, payout, GIT, or user wallet changes.

Cloudflare D1 contains metadata only; media remains on official YouTube embeds. Raw source IDs and artist/song metadata may still be stale until playback is checked.
