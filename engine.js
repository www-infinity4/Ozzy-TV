(function (root) {
  "use strict";

  const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  const BLOCK_SECONDS = 600;
  const SLOTS_PER_DAY = 144;
  const DAYS_PER_WEEK = 7;
  const SLOTS_PER_WEEK = SLOTS_PER_DAY * DAYS_PER_WEEK;

  function stationParts(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone:TIME_ZONE, year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"
    }).formatToParts(date);
    return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  }

  function zonedToUtc(year, month, day, hour, minute, second) {
    hour = hour || 0; minute = minute || 0; second = second || 0;
    const target = Date.UTC(year, month - 1, day, hour, minute, second);
    let guess = target;
    for (let i = 0; i < 4; i++) {
      const p = stationParts(new Date(guess));
      const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      guess += target - represented;
    }
    return guess;
  }

  function dateKey(nowMs) {
    const p = stationParts(new Date(nowMs));
    return `${p.year}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`;
  }

  function localMidnightMs(nowMs) {
    const p = stationParts(new Date(nowMs));
    return zonedToUtc(p.year, p.month, p.day, 0, 0, 0);
  }

  function localDayMs(nowMs, offset, hour) {
    const p = stationParts(new Date(nowMs));
    const utcDate = new Date(Date.UTC(p.year, p.month - 1, p.day + offset, hour == null ? 12 : hour, 0, 0));
    return zonedToUtc(utcDate.getUTCFullYear(), utcDate.getUTCMonth() + 1, utcDate.getUTCDate(), utcDate.getUTCHours(), 0, 0);
  }

  function weekInfo(nowMs) {
    const p = stationParts(new Date(nowMs));
    const localDate = new Date(Date.UTC(p.year, p.month - 1, p.day));
    const sundayOffset = -localDate.getUTCDay();
    const sunday = new Date(Date.UTC(p.year, p.month - 1, p.day + sundayOffset));
    const startMs = zonedToUtc(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), 0, 0, 0);
    const key = `${sunday.getUTCFullYear()}-${String(sunday.getUTCMonth()+1).padStart(2,"0")}-${String(sunday.getUTCDate()).padStart(2,"0")}`;
    return {key,startMs};
  }

  function weekKey(nowMs) { return weekInfo(nowMs).key; }

  function hash(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return value >>> 0;
  }

  function seededShuffle(items, seedText) {
    const copy = items.slice();
    let seed = hash(seedText);
    const random = function () {
      seed += 0x6D2B79F5;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function eligible(program) {
    return !!(program && program.cleared && program.videoId && (program.title || program.songTitle));
  }

  function makeDailyRotation(nowMs, catalog) {
    const pool = (Array.isArray(catalog) ? catalog : []).filter(eligible);
    if (!pool.length) throw new Error("Ozzy TV has no playable music videos in its catalog.");

    const channelSalt = (root.INFINITY_CHANNEL && root.INFINITY_CHANNEL.id) || "OZZY-TV";
    const baseSeed = `${channelSalt}:week:${weekKey(nowMs)}:day:${dateKey(nowMs)}:rotation-v1`;
    const result = [];
    let pass = 0;
    let priorId = "";

    while (result.length < SLOTS_PER_DAY) {
      const batch = seededShuffle(pool, `${baseSeed}:pass:${pass++}`);
      if (batch.length > 1 && priorId && batch[0].videoId === priorId) {
        const swapIndex = batch.findIndex(item => item.videoId !== priorId);
        if (swapIndex > 0) [batch[0], batch[swapIndex]] = [batch[swapIndex], batch[0]];
      }
      for (const program of batch) {
        if (result.length >= SLOTS_PER_DAY) break;
        result.push(program);
        priorId = program.videoId;
      }
    }
    return result;
  }

  function createDaySchedule(nowMs, catalog) {
    const midnightMs = localMidnightMs(nowMs);
    const todayKey = dateKey(nowMs);
    const rotation = makeDailyRotation(nowMs, catalog);
    return rotation.map(function (program, index) {
      const startsAtMs = midnightMs + index * BLOCK_SECONDS * 1000;
      return {
        id:`${todayKey}-${String(index).padStart(3,"0")}`,
        movie:program,
        program:program,
        startsAtMs,
        endsAtMs:startsAtMs + BLOCK_SECONDS * 1000,
        blockSeconds:BLOCK_SECONDS,
        fullStationSeconds:BLOCK_SECONDS,
        slotIndex:index,
        weekKey:weekKey(nowMs)
      };
    });
  }

  function createWeekSchedule(nowMs, catalog) {
    const info = weekInfo(nowMs);
    const days = [];
    for (let day = 0; day < DAYS_PER_WEEK; day++) {
      const anchor = localDayMs(info.startMs, day, 12);
      days.push.apply(days, createDaySchedule(anchor, catalog));
    }
    return days;
  }

  function createSegments(block) {
    const program = block.movie || block.program;
    return [{
      kind:"music",
      title:program.title,
      videoId:program.videoId,
      cleared:!!program.cleared,
      sourceStart:0,
      stationStart:0,
      duration:BLOCK_SECONDS
    }];
  }

  function resolve(nowMs, schedule) {
    if (!Array.isArray(schedule) || !schedule.length) throw new Error("Ozzy TV schedule is empty.");
    const block = schedule.find(item => nowMs >= item.startsAtMs && nowMs < item.endsAtMs) || schedule[schedule.length - 1];
    const blockElapsed = Math.max(0, Math.min(BLOCK_SECONDS - 1, Math.floor((nowMs - block.startsAtMs) / 1000)));
    const segment = createSegments(block)[0];
    return {
      block,
      segment,
      segmentElapsed:blockElapsed,
      blockElapsed,
      mediaSeconds:blockElapsed,
      segmentRemaining:Math.max(0, BLOCK_SECONDS - blockElapsed),
      blockRemaining:Math.max(0, BLOCK_SECONDS - blockElapsed)
    };
  }

  function stationDurationSeconds() { return BLOCK_SECONDS; }

  root.HermitEngine = {
    TIME_ZONE,
    BLOCK_SECONDS,
    SLOTS_PER_DAY,
    DAYS_PER_WEEK,
    SLOTS_PER_WEEK,
    stationParts,
    zonedToUtc,
    dateKey,
    weekKey,
    weekInfo,
    stationDurationSeconds,
    createDaySchedule,
    createWeekSchedule,
    createSegments,
    resolve
  };
})(window);
