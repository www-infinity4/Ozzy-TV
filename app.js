(function () {
  "use strict";

  const engine = window.HermitEngine;
  const catalog = window.HERMIT_CATALOG || [];
  const $ = id => document.getElementById(id);
  const els = {
    clock:$("stationClock"), mode:$("modeLabel"), title:$("nowTitle"), artist:$("nowArtist"), slot:$("programTime"),
    playerShell:$("screenShell"), stationCard:$("stationCard"), cardLabel:$("stationCardLabel"), cardTitle:$("stationCardTitle"), cardCountdown:$("stationCardCountdown"),
    enter:$("enterButton"), restart:$("restartButton"), rewind:$("rewindButton"), live:$("liveButton"),
    position:$("positionLabel"), remaining:$("remainingLabel"), progress:$("progressBar"), next:$("nextCards"), guide:$("guideRows"), guideDate:$("guideDate")
  };

  let player = null;
  let playerReady = false;
  let apiRequested = false;
  let entered = false;
  let schedule = [];
  let scheduleKey = "";
  let loadedKey = "";
  let loadedSlotId = "";
  let endedSlotId = "";
  let mode = "live";
  let timeShiftBaseMs = 0;
  let timeShiftStartedMs = 0;
  const failedVideoIds = new Set();

  function activeClockMs() {
    return mode === "live" ? Date.now() : timeShiftBaseMs + (Date.now() - timeShiftStartedMs);
  }

  function formatTime(ms) {
    return new Intl.DateTimeFormat("en-US", {timeZone:engine.TIME_ZONE,hour:"numeric",minute:"2-digit"}).format(new Date(ms));
  }

  function formatDuration(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(seconds / 60), rest = seconds % 60;
    return minutes ? `${minutes}:${String(rest).padStart(2,"0")}` : `0:${String(rest).padStart(2,"0")}`;
  }

  function art(program) {
    if (program.posterUrl) return program.posterUrl;
    return program.videoId ? `https://i.ytimg.com/vi/${program.videoId}/hqdefault.jpg` : "";
  }

  function ensureSchedule(nowMs) {
    const key = engine.dateKey(nowMs);
    if (key === scheduleKey && schedule.length) return;
    scheduleKey = key;
    const available = catalog.filter(item => !failedVideoIds.has(item.videoId));
    schedule = engine.createDaySchedule(nowMs, available.length ? available : catalog);
    renderGuide(nowMs);
  }

  function currentIndex(nowMs) {
    const index = schedule.findIndex(item => nowMs >= item.startsAtMs && nowMs < item.endsAtMs);
    return index < 0 ? 0 : index;
  }

  function renderGuide(nowMs) {
    if (!els.guide || !schedule.length) return;
    const start = currentIndex(nowMs);
    const rows = schedule.slice(start, Math.min(schedule.length, start + 24));
    if (els.guideDate) {
      els.guideDate.textContent = new Intl.DateTimeFormat("en-US", {timeZone:engine.TIME_ZONE,weekday:"long",month:"long",day:"numeric"}).format(new Date(schedule[0].startsAtMs));
    }
    els.guide.innerHTML = rows.map(item => {
      const p = item.movie;
      return `<article class="guide-row" data-id="${item.id}"><time>${formatTime(item.startsAtMs)}</time><img src="${art(p)}" alt="" loading="lazy"><span><strong>${p.songTitle || p.title}</strong><small>${p.artist || "Ozzy TV"}</small></span></article>`;
    }).join("");
  }

  function renderNext(block) {
    if (!els.next || !block) return;
    const index = schedule.findIndex(item => item.id === block.id);
    els.next.innerHTML = Array.from({length:6}, (_, n) => schedule[(index + n + 1) % schedule.length]).map(item => {
      const p = item.movie;
      return `<article class="next-card" style="--card-art:url('${art(p).replace(/'/g,"%27")}')"><time>${formatTime(item.startsAtMs)}</time><div><strong>${p.songTitle || p.title}</strong><span>${p.artist || "Rock / Metal"}</span></div></article>`;
    }).join("");
  }

  function showIntermission(state, label) {
    if (!els.stationCard) return;
    els.stationCard.hidden = false;
    els.cardLabel.textContent = label || "OZZY TV INTERMISSION";
    els.cardTitle.textContent = "Reserved advertising window";
    els.cardCountdown.textContent = `${formatDuration(state.blockRemaining)} until ${formatTime(state.block.endsAtMs)} · next music video`;
  }

  function showUnavailable(state) {
    els.stationCard.hidden = false;
    els.cardLabel.textContent = "SOURCE SKIPPED";
    els.cardTitle.textContent = state.block.movie.title;
    els.cardCountdown.textContent = `Next music video starts at ${formatTime(state.block.endsAtMs)}`;
  }

  function loadMedia(state) {
    if (!entered) return;
    const program = state.block.movie;
    const mediaKey = `${state.block.id}:${program.videoId}`;

    if (endedSlotId === state.block.id) {
      showIntermission(state);
      return;
    }
    if (!program.videoId || !program.cleared) {
      showUnavailable(state);
      return;
    }
    if (!playerReady) return;

    if (loadedKey !== mediaKey) {
      loadedKey = mediaKey;
      loadedSlotId = state.block.id;
      endedSlotId = "";
      els.stationCard.hidden = true;
      player.loadVideoById({videoId:program.videoId,startSeconds:Math.max(0,state.mediaSeconds)});
      return;
    }

    const duration = Number(player.getDuration && player.getDuration()) || 0;
    if (duration > 1 && state.mediaSeconds >= duration - 0.35) {
      endedSlotId = state.block.id;
      try { player.stopVideo(); } catch (_) {}
      showIntermission(state);
      return;
    }

    els.stationCard.hidden = false;
    els.stationCard.hidden = true;
    if (mode === "live" && player.getPlayerState && player.getPlayerState() === YT.PlayerState.PLAYING) {
      const drift = state.mediaSeconds - player.getCurrentTime();
      if (Math.abs(drift) > 2.75) player.seekTo(state.mediaSeconds, true);
    }
  }

  function tick() {
    const now = activeClockMs();
    ensureSchedule(now);
    const state = engine.resolve(now, schedule);
    const p = state.block.movie;
    els.clock.textContent = `${formatTime(Date.now())} local`;
    els.mode.textContent = endedSlotId === state.block.id ? "LIVE · INTERMISSION" : (mode === "live" ? "LIVE MUSIC VIDEO" : "TIME SHIFTED");
    els.title.textContent = p.songTitle || p.title;
    els.artist.textContent = p.artist || "Ozzy TV";
    els.slot.textContent = `${formatTime(state.block.startsAtMs)}–${formatTime(state.block.endsAtMs)} · 10-minute slot`;
    els.position.textContent = mode === "live" ? "Synchronized station clock" : "Personal rewind";
    els.remaining.textContent = `${formatDuration(state.blockRemaining)} to next video`;
    els.progress.style.width = `${Math.min(100,(state.blockElapsed / engine.BLOCK_SECONDS) * 100)}%`;
    document.body.style.setProperty("--program-art", `url("${art(p)}")`);
    document.querySelectorAll(".guide-row").forEach(row => row.classList.toggle("current", row.dataset.id === state.block.id));
    renderNext(state.block);
    loadMedia(state);
  }

  function loadYouTubeApi() {
    if (apiRequested || playerReady) return;
    apiRequested = true;
    if (window.YT && window.YT.Player) {
      window.onYouTubeIframeAPIReady();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.referrerPolicy = "strict-origin-when-cross-origin";
    document.head.appendChild(script);
  }

  function enterStation() {
    entered = true;
    els.enter.hidden = true;
    loadYouTubeApi();
    tick();
  }

  function restartSong() {
    const now = Date.now();
    ensureSchedule(now);
    const liveState = engine.resolve(now, schedule);
    mode = "timeshift";
    timeShiftBaseMs = liveState.block.startsAtMs;
    timeShiftStartedMs = Date.now();
    loadedKey = "";
    endedSlotId = "";
    tick();
  }

  function rewind() {
    mode = "timeshift";
    timeShiftBaseMs = activeClockMs() - 30000;
    timeShiftStartedMs = Date.now();
    loadedKey = "";
    endedSlotId = "";
    tick();
  }

  function joinLive() {
    mode = "live";
    loadedKey = "";
    endedSlotId = "";
    tick();
  }

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player("player", {
      width:"100%", height:"100%",
      playerVars:{playsinline:1,controls:1,rel:0,enablejsapi:1,origin:location.origin,widget_referrer:location.href},
      events:{
        onReady:function () { playerReady = true; try { player.unMute(); player.setVolume(100); } catch (_) {} tick(); },
        onStateChange:function (event) {
          if (event.data === YT.PlayerState.ENDED && loadedSlotId) {
            endedSlotId = loadedSlotId;
            tick();
          }
        },
        onError:function () {
          const state = schedule.length ? engine.resolve(activeClockMs(), schedule) : null;
          if (state && state.block && state.block.movie.videoId) failedVideoIds.add(state.block.movie.videoId);
          scheduleKey = "";
          loadedKey = "";
          loadedSlotId = "";
          endedSlotId = "";
          setTimeout(tick, 200);
        }
      }
    });
  };

  els.enter.addEventListener("click", enterStation);
  els.restart.addEventListener("click", restartSong);
  els.rewind.addEventListener("click", rewind);
  els.live.addEventListener("click", joinLive);

  ensureSchedule(Date.now());
  tick();
  setInterval(tick, 1000);
})();
