-- Isolated Cloudflare D1 database for Ozzy TV video EMBED METADATA, not music files.
-- Imported rows are visible only after review_status='approved', embed_approved=1
-- and a recently dated reviewed manifest confirms permissible YouTube embeds.
CREATE TABLE IF NOT EXISTS ozzy_videos (
 video_id TEXT PRIMARY KEY NOT NULL CHECK(length(video_id)=11),
 artist TEXT NOT NULL,
 song_title TEXT NOT NULL,
 source_url TEXT NOT NULL,
 reviewed_at INTEGER NOT NULL,
 review_source TEXT NOT NULL,
 embed_approved INTEGER NOT NULL DEFAULT 0 CHECK(embed_approved IN (0,1)),
 review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','disabled')),
 import_source TEXT NOT NULL DEFAULT 'manual-review',
 imported_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ozzy_videos_review ON ozzy_videos(review_status,embed_approved,reviewed_at);
CREATE TABLE IF NOT EXISTS ozzy_catalog_refresh (
 id INTEGER PRIMARY KEY CHECK (id=1),
 refreshed_at INTEGER NOT NULL,
 approved_count INTEGER NOT NULL CHECK(approved_count>=0)
);
-- Public official-channel RSS discoveries are review candidates only; they never
-- enter ozzy_videos until a separate verified, reviewed manifest approves them.
CREATE TABLE IF NOT EXISTS ozzy_candidates (
 video_id TEXT PRIMARY KEY NOT NULL CHECK(length(video_id)=11),
 artist TEXT NOT NULL,
 video_title TEXT NOT NULL,
 channel_id TEXT NOT NULL,
 source_url TEXT NOT NULL,
 published_at INTEGER NOT NULL,
 discovered_at INTEGER NOT NULL,
 review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS ozzy_candidates_review ON ozzy_candidates(review_status,discovered_at);
