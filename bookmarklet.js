// NFBC_SOURCE_COMMIT eb5976693cd01b742626643913992c874e4a22ff
"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

  // src/shared/constants.ts
  var EXTENSION_NAMESPACE = "nfbc_lineup_extension";
  var STORAGE_KEYS = {
    settings: `${EXTENSION_NAMESPACE}.settings`,
    projections: `${EXTENSION_NAMESPACE}.projections`,
    syncMeta: `${EXTENSION_NAMESPACE}.syncMeta`,
    syncSourceUrls: `${EXTENSION_NAMESPACE}.syncSourceUrls`,
    syncEtags: `${EXTENSION_NAMESPACE}.syncEtags`,
    leagueMap: `${EXTENSION_NAMESPACE}.leagueMap`,
    engineMeta: `${EXTENSION_NAMESPACE}.engineMeta`,
    rosterCache: `${EXTENSION_NAMESPACE}.rosterCache`,
    lineupPeriodMeta: `${EXTENSION_NAMESPACE}.lineupPeriodMeta`,
    scratchNotified: `${EXTENSION_NAMESPACE}.scratchNotified`,
    swapExecuted: `${EXTENSION_NAMESPACE}.swapExecuted`,
    diagnostics: `${EXTENSION_NAMESPACE}.diagnostics`,
    sessionSummary: `${EXTENSION_NAMESPACE}.sessionSummary`,
    recommendationHistory: `${EXTENSION_NAMESPACE}.recommendationHistory`,
    standingsSnapshots: `${EXTENSION_NAMESPACE}.standingsSnapshots`,
    decisionLog: `${EXTENSION_NAMESPACE}.decisionLog`
  };
  var MESSAGE_TYPES = {
    syncProjectionUrl: `${EXTENSION_NAMESPACE}.syncProjectionUrl`,
    ensureFreshProjections: `${EXTENSION_NAMESPACE}.ensureFreshProjections`,
    fetchJson: `${EXTENSION_NAMESPACE}.fetchJson`,
    fetchText: `${EXTENSION_NAMESPACE}.fetchText`,
    postForm: `${EXTENSION_NAMESPACE}.postForm`,
    // POST + digest in one hop: the standings table is up to 6.5MB and only ten
    // numbers per row are ever used, so the worker reduces it and the page never
    // receives the markup.
    standingsDigest: `${EXTENSION_NAMESPACE}.standingsDigest`,
    postJson: `${EXTENSION_NAMESPACE}.postJson`,
    fetchFaabResults: `${EXTENSION_NAMESPACE}.fetchFaabResults`
  };

  // src/core/standings_digest.ts
  var DIGEST_CATEGORY_ORDER = ["R", "HR", "RBI", "SB", "AVG", "W", "K", "SV", "ERA", "WHIP"];
  var ROW_RE = /<tr[\s>][\s\S]*?<\/tr>/gi;
  var CELL_RE = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  var TEAMSTATS_RE = /\/teamstats\/\d+\/(\d+)\/\d+/;
  function cellTexts(rowHtml) {
    const cells = [];
    CELL_RE.lastIndex = 0;
    let match;
    while ((match = CELL_RE.exec(rowHtml)) !== null) {
      cells.push(
        (match[1] ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim()
      );
    }
    return cells;
  }
  __name(cellTexts, "cellTexts");
  function scanOverallDigest(html) {
    ROW_RE.lastIndex = 0;
    const rowHtmls = html.match(ROW_RE);
    if (!rowHtmls) {
      return void 0;
    }
    let headerMap;
    const rows = [];
    for (const rowHtml of rowHtmls) {
      const id = rowHtml.match(TEAMSTATS_RE)?.[1];
      if (!id) {
        if (!headerMap) {
          const labels = cellTexts(rowHtml).map((text2) => text2.toUpperCase());
          if (labels.includes("TEAM")) {
            headerMap = new Map(labels.map((label, index) => [label, index]));
          }
        }
        continue;
      }
      if (!headerMap) {
        continue;
      }
      const cells = cellTexts(rowHtml);
      const teamColIdx = headerMap.get("TEAM") ?? -1;
      const rankColIdx = headerMap.get("RANK") ?? -1;
      const leagueColIdx = headerMap.get("LEAGUE") ?? -1;
      rows.push({
        teamId: id,
        name: teamColIdx >= 0 ? normalizeDigestName(cells[teamColIdx]) : "",
        overallRank: rankColIdx >= 0 ? parseDigestNumber(cells[rankColIdx]) ?? void 0 : void 0,
        league: leagueColIdx >= 0 ? cells[leagueColIdx] : void 0,
        values: Object.fromEntries(
          DIGEST_CATEGORY_ORDER.map((category) => [
            category,
            parseDigestNumber(cells[headerMap.get(category) ?? -1])
          ])
        )
      });
    }
    return rows.length > 0 ? { rows } : void 0;
  }
  __name(scanOverallDigest, "scanOverallDigest");
  function normalizeDigestName(value) {
    return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  __name(normalizeDigestName, "normalizeDigestName");
  function parseDigestNumber(text2) {
    if (text2 == null) return null;
    const cleaned = text2.replace(/[^0-9.\-]/g, "");
    if (!cleaned || cleaned === "-" || cleaned === ".") return null;
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
  }
  __name(parseDigestNumber, "parseDigestNumber");

  // src/bookmarklet/chrome_shim.ts
  var PREFIX = "nfbc-bookmarklet:";
  var SESSION_PREFIX = "nfbc-bookmarklet-session:";
  function areaFor(prefix) {
    return prefix === SESSION_PREFIX ? window.sessionStorage : window.localStorage;
  }
  __name(areaFor, "areaFor");
  function makeArea(prefix, storage = () => areaFor(prefix)) {
    const volatile = /* @__PURE__ */ new Map();
    const area = storage;
    return {
      async get(keys) {
        const all = {};
        const backing = area();
        for (let i = 0; i < backing.length; i += 1) {
          const key = backing.key(i);
          if (!key?.startsWith(prefix)) continue;
          const raw = backing.getItem(key);
          if (raw == null) continue;
          try {
            all[key.slice(prefix.length)] = JSON.parse(raw);
          } catch {
          }
        }
        volatile.forEach((value, key) => {
          all[key] = value;
        });
        if (keys == null) return all;
        const wanted = Array.isArray(keys) ? keys : [keys];
        const out = {};
        wanted.forEach((key) => {
          if (key in all) out[key] = all[key];
        });
        return out;
      },
      async set(items) {
        Object.entries(items).forEach(([key, value]) => {
          volatile.set(key, value);
          try {
            area().setItem(prefix + key, JSON.stringify(value));
          } catch {
          }
        });
      },
      async remove(keys) {
        (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
          volatile.delete(key);
          area().removeItem(prefix + key);
        });
      }
    };
  }
  __name(makeArea, "makeArea");
  var storageLocal = makeArea(PREFIX);
  var storageSession = makeArea(SESSION_PREFIX);
  function fetchInit(url, extra = {}) {
    const sameOrigin = new URL(url, window.location.href).origin === window.location.origin;
    return sameOrigin ? { credentials: "include", ...extra } : extra;
  }
  __name(fetchInit, "fetchInit");
  var CORS_BLOCKED_HOSTS = ["fantasysp.com", "fangraphs.com"];
  function isUnreachable(url) {
    try {
      const host = new URL(url, window.location.href).hostname;
      return CORS_BLOCKED_HOSTS.some((blocked) => host.endsWith(blocked));
    } catch {
      return false;
    }
  }
  __name(isUnreachable, "isUnreachable");
  async function handleMessage(message) {
    const type = message?.type;
    const url = typeof message?.url === "string" ? message.url : void 0;
    if (url && isUnreachable(url)) {
      return { ok: false, error: `no CORS from ${url} \u2014 unavailable in bookmarklet` };
    }
    if (type === MESSAGE_TYPES.fetchText && url) {
      const response = await fetch(url, fetchInit(url));
      return { ok: true, payload: await response.text() };
    }
    if (type === MESSAGE_TYPES.fetchJson && url) {
      const response = await fetch(url, fetchInit(url, { cache: "no-store" }));
      return { ok: true, payload: await response.json() };
    }
    if (type === MESSAGE_TYPES.postForm && url) {
      const response = await fetch(url, fetchInit(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: String(message.body ?? "")
      }));
      return { ok: true, payload: await response.text() };
    }
    if (type === MESSAGE_TYPES.standingsDigest && url) {
      const response = await fetch(url, fetchInit(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: String(message.body ?? "")
      }));
      const html = await response.text();
      return { ok: true, payload: { bytes: html.length, digest: scanOverallDigest(html) ?? null } };
    }
    if (type === MESSAGE_TYPES.postJson && url) {
      const response = await fetch(url, fetchInit(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: String(message.body ?? "")
      }));
      return { ok: true, payload: await response.json() };
    }
    if (type === MESSAGE_TYPES.ensureFreshProjections) {
      return { ok: true, payload: void 0 };
    }
    return { ok: false, error: `unsupported in bookmarklet: ${String(type)}` };
  }
  __name(handleMessage, "handleMessage");
  function installChromeShim() {
    const existing = globalThis.chrome;
    const storage = existing?.storage;
    if (storage?.local) {
      return;
    }
    globalThis.chrome = {
      ...existing ?? {},
      storage: { local: storageLocal, session: storageSession },
      runtime: {
        ...existing?.runtime ?? {},
        id: "nfbc-bookmarklet",
        async sendMessage(message) {
          try {
            return await handleMessage(message);
          } catch (error) {
            return { ok: false, error: String(error) };
          }
        },
        onMessage: { addListener() {
        } }
      }
    };
  }
  __name(installChromeShim, "installChromeShim");

  // src/core/normalize.ts
  var SUFFIXES = /* @__PURE__ */ new Set(["jr", "sr", "ii", "iii", "iv"]);
  var LOOSE_FIRST_NAME_ALIASES = {
    zac: "zach",
    zachary: "zach"
  };
  var TEAM_MAP = {
    ARI: "ARI",
    ARZ: "ARI",
    ATH: "ATH",
    AZ: "ARI",
    OAK: "ATH",
    TB: "TBR",
    TBR: "TBR",
    CWS: "CHW",
    CHW: "CHW",
    MLW: "MIL",
    MIL: "MIL",
    WSH: "WSN",
    WAS: "WSN",
    SF: "SFG",
    SFG: "SFG",
    SD: "SDP",
    SDP: "SDP",
    KC: "KCR",
    KCR: "KCR"
  };
  var MLB_TEAM_ABBREVS = /* @__PURE__ */ new Set([
    "ARI",
    "ARZ",
    "AZ",
    "ATL",
    "BAL",
    "BOS",
    "CHC",
    "CWS",
    "CHW",
    "CIN",
    "CLE",
    "COL",
    "DET",
    "HOU",
    "KC",
    "KCR",
    "LAA",
    "LAD",
    "MIA",
    "MIL",
    "MLW",
    "MIN",
    "NYM",
    "NYY",
    "ATH",
    "OAK",
    "PHI",
    "PIT",
    "SD",
    "SDP",
    "SEA",
    "SF",
    "SFG",
    "STL",
    "TB",
    "TBR",
    "TEX",
    "TOR",
    "WSH",
    "WSN",
    "WAS"
  ]);
  function isTeamAbbrev(text2) {
    return MLB_TEAM_ABBREVS.has(text2.trim().toUpperCase());
  }
  __name(isTeamAbbrev, "isTeamAbbrev");
  function normalizeName(name) {
    return name.normalize("NFD").replace(new RegExp("\\p{Diacritic}", "gu"), "").replace(/[.'’,-]/g, " ").split(/\s+/).filter(Boolean).filter((part) => !SUFFIXES.has(part.toLowerCase())).join(" ").toLowerCase();
  }
  __name(normalizeName, "normalizeName");
  function looseName(normalized) {
    let collapsed = normalized;
    let previous;
    do {
      previous = collapsed;
      collapsed = collapsed.replace(/\b([a-z])\s+([a-z])\b/g, "$1$2");
    } while (collapsed !== previous);
    const parts = collapsed.split(" ").filter(Boolean);
    if (parts.length > 0) {
      parts[0] = LOOSE_FIRST_NAME_ALIASES[parts[0]] ?? parts[0];
    }
    if (parts.length <= 2) {
      return parts.join(" ");
    }
    const filtered = parts.filter((part, index) => index === 0 || index === parts.length - 1 || part.length > 1);
    return filtered.join(" ");
  }
  __name(looseName, "looseName");
  function normalizeTeam(team) {
    if (!team) {
      return void 0;
    }
    const key = team.trim().toUpperCase();
    return TEAM_MAP[key] ?? key;
  }
  __name(normalizeTeam, "normalizeTeam");
  function normalizePositionList(raw) {
    return raw.split(",").map((part) => part.trim().toUpperCase()).map((part) => part === "SP" || part === "RP" ? "P" : part).filter(Boolean);
  }
  __name(normalizePositionList, "normalizePositionList");
  var HITTER_ONLY_NAMES = /* @__PURE__ */ new Set(["shohei ohtani", "kody clemens"]);
  function isHitterOnlyOverride(name) {
    return HITTER_ONLY_NAMES.has(normalizeName(name));
  }
  __name(isHitterOnlyOverride, "isHitterOnlyOverride");
  function usableContestLabel(label) {
    const trimmed = label?.trim();
    return trimmed && !/[✓✗]/.test(trimmed) ? trimmed : void 0;
  }
  __name(usableContestLabel, "usableContestLabel");
  function stripInjectedStatusCounts(label) {
    const cleaned = label?.replace(/[✓✗]\s*\d+/g, "").replace(/\s+/g, " ").trim();
    return cleaned || void 0;
  }
  __name(stripInjectedStatusCounts, "stripInjectedStatusCounts");

  // src/core/probable_conflicts.ts
  function probableDateConflicts(candidate, evidence) {
    const name = normalizeName(candidate.name);
    const day = Date.parse(`${candidate.date}T00:00:00Z`);
    const priority = Math.max(candidate.priority, ...evidence.filter((other) => normalizeName(other.name) === name && other.date === candidate.date).map((other) => other.priority));
    return evidence.some((other) => {
      const distance = Math.abs(Date.parse(`${other.date}T00:00:00Z`) - day) / 864e5;
      return normalizeName(other.name) === name && distance > 0 && distance < 4 && other.priority >= priority;
    });
  }
  __name(probableDateConflicts, "probableDateConflicts");

  // src/core/projection_sources.ts
  var ENGINE_PROJECTIONS_URL = "http://127.0.0.1:8123/projections.json";
  var PUBLIC_ENGINE_BASE_URL = "https://raw.githubusercontent.com/binghamben/nfbc-engine-data/main/";
  var GITHUB_PROJECTIONS_URL = `${PUBLIC_ENGINE_BASE_URL}projections.json`;
  var OUTDATED_ENGINE_URLS = [
    "https://gist.githubusercontent.com/binghamben/13a5935d4f1b375ac81107f1f477daa2/raw/projections.json",
    "https://raw.githubusercontent.com/binghamben/nfbc_lineup_extension/master/research/data/extension/projections.json"
  ];
  var ENGINE_URLS = [ENGINE_PROJECTIONS_URL, GITHUB_PROJECTIONS_URL];
  var DEFAULT_PROJECTION_SOURCE_URLS = {
    WEEKLY: ENGINE_URLS,
    MON_THU: ENGINE_URLS,
    FRI_SUN: ENGINE_URLS,
    ROS: ENGINE_URLS
  };
  function isDefaultEngineUrl(url) {
    return url === ENGINE_PROJECTIONS_URL || url === GITHUB_PROJECTIONS_URL || OUTDATED_ENGINE_URLS.includes(url);
  }
  __name(isDefaultEngineUrl, "isDefaultEngineUrl");
  function configuredProjectionUrls(source) {
    const urls = source?.urls?.map((url) => url.trim()).filter(Boolean) ?? [];
    if (source?.url?.trim() && !urls.includes(source.url.trim())) {
      urls.unshift(source.url.trim());
    }
    return urls;
  }
  __name(configuredProjectionUrls, "configuredProjectionUrls");
  function isLegacySourceUrl(url) {
    return url.includes("docs.google.com") || url.includes("googleusercontent.com");
  }
  __name(isLegacySourceUrl, "isLegacySourceUrl");

  // src/core/hitter_risk.ts
  var MAX_AVAILABLE_GAMES = 14;
  var MIN_ROLE_SAMPLE_GAMES = 5;
  var MEANINGFUL_ABSENCE_GAMES = 5;
  var EARLY_SAMPLE_MIN_GAMES = 2;
  var EARLY_SAMPLE_MAX_GAMES = 4;
  var EARLY_SAMPLE_MAX_RATE = 1 / 3;
  var MATURE_SAMPLE_MIN_GAMES = 5;
  var MATURE_SAMPLE_MAX_RATE = 0.65;
  var MATURE_SAMPLE_MAX_OVERALL_RATE = 0.9;
  var STRICT_PLATOON_FAVORABLE_RATE = 0.85;
  var ROLE_TREND_WINDOW = 5;
  var ROLE_DECLINE_MAX_RECENT_RATE = 0.6;
  var ROLE_DECLINE_MIN_DROP = 0.3;
  function startRate(starts, sampleSize) {
    return sampleSize > 0 ? starts / sampleSize : 0;
  }
  __name(startRate, "startRate");
  function countStarts(normalizedName, games) {
    return games.reduce((total, game) => total + (game.starters.has(normalizedName) ? 1 : 0), 0);
  }
  __name(countStarts, "countStarts");
  function appeared(normalizedName, game) {
    return (game.appearances ?? game.starters).has(normalizedName);
  }
  __name(appeared, "appeared");
  function availableWindow(normalizedName, games) {
    if (!games.some((game) => game.appearances != null)) {
      return { games };
    }
    const appearances = games.map((game, index) => appeared(normalizedName, game) ? index : -1).filter((index) => index >= 0);
    if (appearances.length === 0) return { games: games.slice(0, MAX_AVAILABLE_GAMES) };
    let oldestCurrentAppearance = appearances[appearances.length - 1];
    let context;
    for (let index = 0; index < appearances.length - 1; index += 1) {
      const newer = appearances[index];
      const older = appearances[index + 1];
      if (older - newer - 1 >= MEANINGFUL_ABSENCE_GAMES) {
        oldestCurrentAppearance = newer;
        context = "RETURN";
        break;
      }
    }
    if (!context && oldestCurrentAppearance < MIN_ROLE_SAMPLE_GAMES - 1 && !appearances.some((index) => index >= MIN_ROLE_SAMPLE_GAMES)) context = "NEW";
    return { games: games.slice(0, Math.min(oldestCurrentAppearance + 1, MAX_AVAILABLE_GAMES)), context };
  }
  __name(availableWindow, "availableWindow");
  function combinePlayerGameHistory(normalizedName, teamHistories) {
    const stints = teamHistories.map((history) => availableWindow(normalizedName, history).games).filter((games) => games.length > 0);
    if (stints.length === 0) return [];
    if (stints.length === 1) return stints[0];
    const dated = stints.flat().filter((game) => Boolean(game.date));
    if (dated.length === 0) {
      return stints.reduce((best, next) => next.length > best.length ? next : best);
    }
    const byKey = /* @__PURE__ */ new Map();
    for (const game of dated) {
      const key = game.date;
      const existing = byKey.get(key);
      if (!existing || !existing.starters.has(normalizedName) && game.starters.has(normalizedName)) {
        byKey.set(key, game);
      }
    }
    return Array.from(byKey.values()).sort((left, right) => (right.date ?? "").localeCompare(left.date ?? "")).slice(0, MAX_AVAILABLE_GAMES);
  }
  __name(combinePlayerGameHistory, "combinePlayerGameHistory");
  function evaluateHitterRisk(normalizedName, batterHand, games) {
    const badges = [];
    const eligible = availableWindow(normalizedName, games);
    const recent12 = eligible.games.slice(0, 12);
    const recent30 = eligible.games.slice(0, 30);
    if (eligible.context && eligible.games.length < MIN_ROLE_SAMPLE_GAMES) {
      const starts = countStarts(normalizedName, eligible.games);
      badges.push({
        label: eligible.context,
        detail: `${eligible.context === "NEW" ? "New arrival" : "Recently returned"}: started ${starts} of ${eligible.games.length} observed games since appearing; role is unconfirmed and projected volume is provisionally reduced 45%`,
        tone: "context"
      });
    }
    if (recent12.length >= ROLE_TREND_WINDOW * 2) {
      const latest = recent12.slice(0, ROLE_TREND_WINDOW);
      const prior = recent12.slice(ROLE_TREND_WINDOW, ROLE_TREND_WINDOW * 2);
      const latestStarts = countStarts(normalizedName, latest);
      const priorStarts = countStarts(normalizedName, prior);
      const latestRate = startRate(latestStarts, latest.length);
      const priorRate = startRate(priorStarts, prior.length);
      if (latestRate <= ROLE_DECLINE_MAX_RECENT_RATE && priorRate - latestRate >= ROLE_DECLINE_MIN_DROP) {
        const broadRate = Math.max(0.01, startRate(countStarts(normalizedName, recent12), recent12.length));
        const projectionMultiplier = Math.max(0.45, Math.min(0.75, latestRate / broadRate));
        badges.push({
          label: "ROLE\u2193",
          detail: `Role declining: started ${latestStarts} of the last ${latest.length} team games after ${priorStarts} of the prior ${prior.length}; projected volume reduced ${Math.round((1 - projectionMultiplier) * 100)}%`,
          tone: "partTime",
          projectionMultiplier
        });
      }
    }
    let platoonBadge;
    let strictEverydayVsFavorable = false;
    if ((batterHand === "L" || batterHand === "R") && recent30.length > 0) {
      const favorableHand = batterHand === "L" ? "R" : "L";
      const sameHandGames = recent30.filter((game) => game.opponentStarterHand === batterHand);
      const favorableGames = recent30.filter((game) => game.opponentStarterHand === favorableHand);
      if (sameHandGames.length >= EARLY_SAMPLE_MIN_GAMES) {
        const starts30 = countStarts(normalizedName, recent30);
        const sameHandStarts = countStarts(normalizedName, sameHandGames);
        const overallRate = startRate(starts30, recent30.length);
        const sameHandRate = startRate(sameHandStarts, sameHandGames.length);
        const earlySampleFlag = sameHandGames.length <= EARLY_SAMPLE_MAX_GAMES && sameHandRate <= EARLY_SAMPLE_MAX_RATE;
        const matureSampleFlag = sameHandGames.length >= MATURE_SAMPLE_MIN_GAMES && overallRate < MATURE_SAMPLE_MAX_OVERALL_RATE && sameHandRate < MATURE_SAMPLE_MAX_RATE;
        if (earlySampleFlag || matureSampleFlag) {
          platoonBadge = {
            label: "Platoon",
            detail: `Started ${sameHandStarts} of last ${sameHandGames.length} vs ${batterHand}HP in last ${recent30.length} team games`,
            tone: "platoon",
            // A righty's favorable hand (LHP) is the scarce one, so he is the
            // short side; a lefty platoon still plays most of the schedule.
            platoonSide: batterHand === "R" ? "short" : "long"
          };
          const favorableRate = startRate(countStarts(normalizedName, favorableGames), favorableGames.length);
          strictEverydayVsFavorable = favorableGames.length >= MATURE_SAMPLE_MIN_GAMES && favorableRate >= STRICT_PLATOON_FAVORABLE_RATE;
        }
      }
    }
    if (recent12.length >= MIN_ROLE_SAMPLE_GAMES && !strictEverydayVsFavorable) {
      const starts12 = countStarts(normalizedName, recent12);
      if (startRate(starts12, recent12.length) < 0.8) {
        badges.push({
          label: "PT",
          detail: `Started ${starts12} of last ${recent12.length} team games`,
          tone: "partTime"
        });
      }
    }
    if (platoonBadge) {
      badges.push(platoonBadge);
    }
    return badges;
  }
  __name(evaluateHitterRisk, "evaluateHitterRisk");

  // src/core/playing_time.ts
  var TRAJECTORY_WINDOW = 10;
  var TREND_SPLIT = 5;
  var MIN_TREND_GAMES = 8;
  var TREND_DELTA = 0.25;
  var MIN_HAND_SAMPLE = 2;
  function rate(split) {
    return split.games > 0 ? split.starts / split.games : 0;
  }
  __name(rate, "rate");
  function tally(normalizedName, games) {
    let starts = 0;
    for (const game of games) {
      if (game.starters.has(normalizedName)) starts += 1;
    }
    return { starts, games: games.length };
  }
  __name(tally, "tally");
  function formatSplit(split) {
    return `${split.starts}/${split.games}`;
  }
  __name(formatSplit, "formatSplit");
  function evaluatePlayingTime(normalizedName, games) {
    if (games.length === 0) return void 0;
    const eligible = availableWindow(normalizedName, games).games;
    if (eligible.length === 0) return void 0;
    const window2 = eligible.slice(0, TRAJECTORY_WINDOW);
    const recent = tally(normalizedName, window2);
    const latest = tally(normalizedName, window2.slice(0, TREND_SPLIT));
    const prior = tally(normalizedName, window2.slice(TREND_SPLIT, TREND_SPLIT * 2));
    const vsL = tally(normalizedName, window2.filter((game) => game.opponentStarterHand === "L"));
    const vsR = tally(normalizedName, window2.filter((game) => game.opponentStarterHand === "R"));
    let trend = "unknown";
    if (window2.length >= MIN_TREND_GAMES && prior.games > 0 && latest.games > 0) {
      const delta = rate(latest) - rate(prior);
      if (delta >= TREND_DELTA) trend = "rising";
      else if (delta <= -TREND_DELTA) trend = "falling";
      else trend = "steady";
    }
    const handParts = [];
    if (vsR.games >= MIN_HAND_SAMPLE) handParts.push(`${formatSplit(vsR)} vs RHP`);
    if (vsL.games >= MIN_HAND_SAMPLE) handParts.push(`${formatSplit(vsL)} vs LHP`);
    const trendWord = trend === "rising" ? "trending up" : trend === "falling" ? "trending down" : trend === "steady" ? "steady" : "too few games to call a trend";
    const detail = [
      `Started ${recent.starts} of the last ${recent.games} team games`,
      handParts.length > 0 ? handParts.join(", ") : void 0,
      trend === "unknown" ? trendWord : `${trendWord} (last ${latest.games}: ${formatSplit(latest)}; prior ${prior.games}: ${formatSplit(prior)})`
    ].filter(Boolean).join(" \xB7 ");
    return {
      recent,
      latest,
      prior,
      vsL,
      vsR,
      trend,
      label: formatSplit(recent),
      detail
    };
  }
  __name(evaluatePlayingTime, "evaluatePlayingTime");
  function startRatesByHand(trend, batSide) {
    if (batSide !== "L" && batSide !== "R") return void 0;
    const favorableSplit = batSide === "L" ? trend.vsR : trend.vsL;
    const unfavorableSplit = batSide === "L" ? trend.vsL : trend.vsR;
    if (favorableSplit.games < MIN_HAND_SAMPLE || unfavorableSplit.games < MIN_HAND_SAMPLE) {
      return void 0;
    }
    return { favorable: rate(favorableSplit), unfavorable: rate(unfavorableSplit) };
  }
  __name(startRatesByHand, "startRatesByHand");
  function platoonProfile(trend, batSide) {
    const rates = startRatesByHand(trend, batSide);
    if (!rates) return void 0;
    const gap = rates.favorable - rates.unfavorable;
    const severity = rates.unfavorable <= 0.2 && gap >= 0.5 ? "strict" : gap >= 0.35 ? "partial" : void 0;
    if (!severity) return void 0;
    return { side: batSide === "R" ? "short" : "long", severity };
  }
  __name(platoonProfile, "platoonProfile");

  // src/shared/persistent_cache.ts
  var PREFIX2 = "nfbc.cache.";
  var setCodec = {
    encode: /* @__PURE__ */ __name((value) => Array.from(value), "encode"),
    decode: /* @__PURE__ */ __name((raw) => new Set(Array.isArray(raw) ? raw : []), "decode")
  };
  function storageKey(namespace, key) {
    return `${PREFIX2}${namespace}.${key}`;
  }
  __name(storageKey, "storageKey");
  var pendingKeys = [];
  var pendingFlush;
  function readBatched(name) {
    pendingKeys.push(name);
    if (!pendingFlush) {
      pendingFlush = Promise.resolve().then(() => {
        const keys = pendingKeys;
        pendingKeys = [];
        pendingFlush = void 0;
        return chrome.storage.local.get(keys).catch(() => ({}));
      });
    }
    return pendingFlush;
  }
  __name(readBatched, "readBatched");
  async function readStored(name, ttlMs) {
    try {
      const got = await readBatched(name);
      const entry = got[name];
      if (!entry || typeof entry.at !== "number") return void 0;
      return Date.now() - entry.at <= ttlMs ? entry : void 0;
    } catch {
      return void 0;
    }
  }
  __name(readStored, "readStored");
  async function writeStored(name, value) {
    try {
      await chrome.storage.local.set({ [name]: { at: Date.now(), value } });
    } catch {
    }
  }
  __name(writeStored, "writeStored");
  function persistentCacheByKey(ttlMs, namespace, load, codec) {
    const memory = /* @__PURE__ */ new Map();
    return (key) => {
      const existing = memory.get(key);
      if (existing && Date.now() - existing.at <= ttlMs) return existing.promise;
      const name = storageKey(namespace, key);
      const fresh = {
        at: Date.now(),
        promise: (async () => {
          const stored = await readStored(name, ttlMs);
          if (stored) return codec ? codec.decode(stored.value) : stored.value;
          const value = await load(key);
          await writeStored(name, codec ? codec.encode(value) : value);
          return value;
        })().catch((error) => {
          if (memory.get(key) === fresh) memory.delete(key);
          throw error;
        })
      };
      memory.set(key, fresh);
      return fresh.promise;
    };
  }
  __name(persistentCacheByKey, "persistentCacheByKey");
  function persistentCache(ttlMs, namespace, load, codec) {
    const keyed = persistentCacheByKey(ttlMs, namespace, () => load(), codec);
    return () => keyed("_");
  }
  __name(persistentCache, "persistentCache");

  // src/shared/ttl_cache.ts
  var MINUTES = 6e4;
  var HOURS = 36e5;
  function ttlCache(ttlMs, load) {
    let entry;
    return () => {
      if (!entry || Date.now() - entry.at > ttlMs) {
        const fresh = {
          at: Date.now(),
          promise: load().catch((error) => {
            if (entry === fresh) {
              entry = void 0;
            }
            throw error;
          })
        };
        entry = fresh;
      }
      return entry.promise;
    };
  }
  __name(ttlCache, "ttlCache");
  function ttlCacheByKey(ttlMs, load) {
    const entries = /* @__PURE__ */ new Map();
    return (key) => {
      const existing = entries.get(key);
      if (existing && Date.now() - existing.at <= ttlMs) {
        return existing.promise;
      }
      const fresh = {
        at: Date.now(),
        promise: load(key).catch((error) => {
          if (entries.get(key) === fresh) {
            entries.delete(key);
          }
          throw error;
        })
      };
      entries.set(key, fresh);
      return fresh.promise;
    };
  }
  __name(ttlCacheByKey, "ttlCacheByKey");

  // src/content/hitter_risk.ts
  function collectOpposingProbableScheduleEntries(schedule, normalizedTeams) {
    const candidates = [];
    const gaps = [];
    for (const date of schedule.dates ?? []) {
      for (const game of date.games ?? []) {
        const gameDate = game.officialDate?.slice(0, 10);
        const awayTeam = normalizeTeam(game.teams?.away?.team?.abbreviation);
        const homeTeam = normalizeTeam(game.teams?.home?.team?.abbreviation);
        const awayPitcher = game.teams?.away?.probablePitcher;
        const homePitcher = game.teams?.home?.probablePitcher;
        if (!gameDate || !awayTeam || !homeTeam) continue;
        if (normalizedTeams.has(awayTeam)) {
          if (homePitcher?.id && homePitcher.fullName) {
            candidates.push({ team: awayTeam, date: gameDate, pitcherId: homePitcher.id, pitcherName: homePitcher.fullName });
          } else {
            gaps.push({ team: awayTeam, date: gameDate, gamePk: game.gamePk, opponentSide: "home" });
          }
        }
        if (normalizedTeams.has(homeTeam)) {
          if (awayPitcher?.id && awayPitcher.fullName) {
            candidates.push({ team: homeTeam, date: gameDate, pitcherId: awayPitcher.id, pitcherName: awayPitcher.fullName });
          } else {
            gaps.push({ team: homeTeam, date: gameDate, gamePk: game.gamePk, opponentSide: "away" });
          }
        }
      }
    }
    return { candidates, gaps };
  }
  __name(collectOpposingProbableScheduleEntries, "collectOpposingProbableScheduleEntries");
  var TEAM_HISTORY_LOOKBACK_DAYS = 75;
  var TEAM_HISTORY_LIMIT = 30;
  var CROSS_TEAM_STINT_GAMES = 10;
  var MLB_TEAM_IDS = {
    ARI: 109,
    ATL: 144,
    BAL: 110,
    BOS: 111,
    CHC: 112,
    CHW: 145,
    CIN: 113,
    CLE: 114,
    COL: 115,
    DET: 116,
    HOU: 117,
    KCR: 118,
    LAA: 108,
    LAD: 119,
    MIA: 146,
    MIL: 158,
    MIN: 142,
    NYM: 121,
    NYY: 147,
    ATH: 133,
    PHI: 143,
    PIT: 134,
    SDP: 135,
    SEA: 136,
    SFG: 137,
    STL: 138,
    TBR: 139,
    TEX: 140,
    TOR: 141,
    WSN: 120
  };
  async function fetchText(url) {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.fetchText, url });
    if (!response?.ok) {
      throw new Error(typeof response?.error === "string" ? response.error : `Fetch failed for ${url}`);
    }
    return response.payload;
  }
  __name(fetchText, "fetchText");
  function parseFanGraphsProbablesGrid(html) {
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/);
    if (!match?.[1]) {
      console.warn(`[NFBC] FanGraphs probables grid returned no data payload (${html.length} bytes) \u2014 future-week matchups will be missing. Likely a bot block or page-structure change.`);
      return [];
    }
    try {
      const data = JSON.parse(match[1]);
      const queries = data?.props?.pageProps?.dehydratedState?.queries;
      if (!Array.isArray(queries) || queries.length === 0) return [];
      const records = queries[0]?.state?.data;
      return Array.isArray(records) ? records : [];
    } catch {
      return [];
    }
  }
  __name(parseFanGraphsProbablesGrid, "parseFanGraphsProbablesGrid");
  function recordsFromProbablesPayload(data) {
    const games = Array.isArray(data?.games) ? data.games : Array.isArray(data) ? data : [];
    const records = [];
    for (const game of games) {
      const sp = game?.team?.sp ?? game?.team?.primaryPitcher;
      const name = sp?.name ?? game?.teamSPPlayerName;
      const date = game?.gameDate ?? game?.GameDate;
      if (!name || !date) continue;
      records.push({
        AbbName: game?.abbName ?? game?.AbbName,
        OpponentAbbName: game?.opponent?.abbName ?? game?.OpponentAbbName,
        GameDate: date,
        teamSPPlayerName: name,
        Throws: sp?.throws ?? game?.Throws,
        isHome: game?.isHome ? 1 : 0
      });
    }
    return records;
  }
  __name(recordsFromProbablesPayload, "recordsFromProbablesPayload");
  async function fetchProbablesGridApi() {
    const text2 = await fetchText("https://www.fangraphs.com/api/roster-resource/probables-grid/data");
    try {
      return recordsFromProbablesPayload(JSON.parse(text2));
    } catch {
      return [];
    }
  }
  __name(fetchProbablesGridApi, "fetchProbablesGridApi");
  var PROBABLES_MIRROR_URL = `${PUBLIC_ENGINE_BASE_URL}l30.json`;
  async function fetchProbablesMirror() {
    const text2 = await fetchText(`${PROBABLES_MIRROR_URL}?v=${Date.now()}`);
    try {
      return recordsFromProbablesPayload(JSON.parse(text2).probables);
    } catch {
      return [];
    }
  }
  __name(fetchProbablesMirror, "fetchProbablesMirror");
  var ROTOWIRE_PROBABLES_URL = "https://www.rotowire.com/baseball/projected-starters.php";
  var MONTH_NUMBER = {
    January: 1,
    February: 2,
    March: 3,
    April: 4,
    May: 5,
    June: 6,
    July: 7,
    August: 8,
    September: 9,
    October: 10,
    November: 11,
    December: 12
  };
  var DAY_NUMBER = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function isoFromRotoWireDay(html, dayName, year) {
    const range = html.match(/([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+-\s+([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?/);
    const month = range?.[1] ? MONTH_NUMBER[range[1]] : void 0;
    const day = range?.[2] ? Number(range[2]) : void 0;
    const weekday = DAY_NUMBER[dayName];
    if (!month || !day || weekday == null) return void 0;
    const start = new Date(year, month - 1, day, 12);
    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = new Date(start);
      candidate.setDate(start.getDate() + offset);
      if (candidate.getDay() === weekday) return isoDate(candidate);
    }
    return void 0;
  }
  __name(isoFromRotoWireDay, "isoFromRotoWireDay");
  function parseRotoWireProbables(html, targetTeams, year = (/* @__PURE__ */ new Date()).getFullYear()) {
    const out = /* @__PURE__ */ new Map();
    const rows = Array.from(html.matchAll(/data-id="([A-Z]+)"[^>]*>([\s\S]*?)(?=<div class="flex-row myleagues__proteam"|<\/main>)/g));
    const starterPattern = /<a class="starters-matrix__starter([^"]*)" href="\/baseball\/player\/([^"\/]+)-\d+"[^>]*>[^<]+<\/a>\s*<span class="sm-text">([LR])<\/span>[\s\S]*?<div class="sm-text"><span class="np">([A-Z][a-z]+)<\/span>[^<]*?(?:@|vs\.?)\s*([A-Z]{2,3})<\/div>/g;
    for (const row of rows) {
      const body = row[2] ?? "";
      for (const match of body.matchAll(starterPattern)) {
        const opponent = normalizeTeam(match[5]);
        const date = isoFromRotoWireDay(html, match[4] ?? "", year);
        const hand = asPitcherHand(match[3]);
        if (!opponent || !targetTeams.has(opponent) || !date || !hand) continue;
        const name = (match[2] ?? "Probable starter").split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
        const probable = {
          name,
          hand,
          source: "rotowire",
          projected: !(match[1] ?? "").split(/\s+/).includes("bold")
        };
        const byDate = out.get(opponent) ?? /* @__PURE__ */ new Map();
        const existing = byDate.get(date) ?? [];
        if (!existing.some((item) => normalizeName(item.name) === normalizeName(name))) existing.push(probable);
        byDate.set(date, existing);
        out.set(opponent, byDate);
      }
    }
    return out;
  }
  __name(parseRotoWireProbables, "parseRotoWireProbables");
  async function fetchRotoWireProbables(targetTeams) {
    return parseRotoWireProbables(await fetchText(ROTOWIRE_PROBABLES_URL), targetTeams);
  }
  __name(fetchRotoWireProbables, "fetchRotoWireProbables");
  var getFanGraphsRecords = ttlCache(3 * HOURS, async () => {
    try {
      const api = await fetchProbablesGridApi();
      if (api.length > 0) {
        console.info(`[NFBC] FanGraphs probables grid (API): ${api.length} records`);
        return api;
      }
    } catch (error) {
      console.warn("[NFBC] probables-grid API failed; falling back to HTML scrape", error);
    }
    try {
      const records = parseFanGraphsProbablesGrid(
        await fetchText("https://www.fangraphs.com/roster-resource/probables-grid")
      );
      console.info(`[NFBC] FanGraphs probables grid (HTML fallback): ${records.length} records`);
      return records;
    } catch (error) {
      console.info("[NFBC] FanGraphs unreachable; trying the published mirror", error);
    }
    try {
      const records = await fetchProbablesMirror();
      if (records.length > 0) {
        console.info(`[NFBC] FanGraphs probables grid (published mirror): ${records.length} records`);
        return records;
      }
      console.warn("[NFBC] probables mirror is empty \u2014 future-week matchups will be missing");
    } catch (error) {
      console.warn("[NFBC] probables mirror fetch failed \u2014 future-week matchups will be missing", error);
    }
    return [];
  });
  function buildFanGraphsProbablesMap(records, targetTeams) {
    const result = /* @__PURE__ */ new Map();
    for (const record of records) {
      const pitcherName = record.teamSPPlayerName?.trim();
      const hand = asPitcherHand(record.Throws);
      const opponentAbbr = record.OpponentAbbName;
      const dateRaw = record.GameDate;
      if (!pitcherName || !hand || !opponentAbbr || !dateRaw) continue;
      const opponent = normalizeTeam(opponentAbbr);
      if (!opponent || !targetTeams.has(opponent)) continue;
      const gameDate = dateRaw.slice(0, 10);
      const byDate = result.get(opponent) ?? /* @__PURE__ */ new Map();
      const existing = byDate.get(gameDate) ?? [];
      if (!existing.some((item) => normalizeName(item.name) === normalizeName(pitcherName) && item.hand === hand)) {
        existing.push({ name: pitcherName, hand, source: "fangraphs" });
      }
      byDate.set(gameDate, existing);
      result.set(opponent, byDate);
    }
    return result;
  }
  __name(buildFanGraphsProbablesMap, "buildFanGraphsProbablesMap");
  async function fetchFanGraphsProbables(targetTeams) {
    const records = await getFanGraphsRecords();
    const allTeams = /* @__PURE__ */ new Set();
    for (const r of records) {
      const t = normalizeTeam(r.OpponentAbbName);
      if (t) allTeams.add(t);
    }
    const fullMap = buildFanGraphsProbablesMap(records, allTeams);
    const filtered = /* @__PURE__ */ new Map();
    for (const team of targetTeams) {
      const byDate = fullMap.get(team);
      if (byDate) filtered.set(team, byDate);
    }
    return filtered;
  }
  __name(fetchFanGraphsProbables, "fetchFanGraphsProbables");
  function buildFanGraphsOwnProbablesMap(records, targetTeams) {
    const result = /* @__PURE__ */ new Map();
    for (const record of records) {
      const pitcherName = record.teamSPPlayerName?.trim();
      const hand = asPitcherHand(record.Throws);
      const team = normalizeTeam(record.AbbName);
      const dateRaw = record.GameDate;
      if (!pitcherName || !hand || !team || !dateRaw || !targetTeams.has(team)) continue;
      const gameDate = dateRaw.slice(0, 10);
      const byDate = result.get(team) ?? /* @__PURE__ */ new Map();
      const existing = byDate.get(gameDate) ?? [];
      if (!existing.some((item) => normalizeName(item.name) === normalizeName(pitcherName))) {
        existing.push({ name: pitcherName, hand, source: "fangraphs" });
      }
      byDate.set(gameDate, existing);
      result.set(team, byDate);
    }
    return result;
  }
  __name(buildFanGraphsOwnProbablesMap, "buildFanGraphsOwnProbablesMap");
  async function fetchOwnProbablesByTeamDate(teams) {
    const normalizedTeams = new Set(
      teams.map((team) => normalizeTeam(team)).filter((team) => Boolean(team))
    );
    if (normalizedTeams.size === 0) {
      return /* @__PURE__ */ new Map();
    }
    const records = await getFanGraphsRecords();
    return reconcileProbableMap(buildFanGraphsOwnProbablesMap(records, normalizedTeams));
  }
  __name(fetchOwnProbablesByTeamDate, "fetchOwnProbablesByTeamDate");
  var boxscoreCache = /* @__PURE__ */ new Map();
  var personLookupCache = /* @__PURE__ */ new Map();
  var personPitchHandByIdCache = /* @__PURE__ */ new Map();
  function isHitterPlayer(player) {
    const positions = player.eligiblePositions?.filter(Boolean) ?? [];
    if (positions.length > 0) {
      return !positions.every((position2) => position2 === "P");
    }
    return player.currentSlot !== "P";
  }
  __name(isHitterPlayer, "isHitterPlayer");
  function riskKey(player) {
    return `${player.normalizedName}|${player.normalizedTeam ?? ""}`;
  }
  __name(riskKey, "riskKey");
  async function fetchJson(url) {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.fetchJson, url });
    if (!response?.ok) {
      throw new Error(typeof response?.error === "string" ? response.error : `Fetch failed for ${url}`);
    }
    return response.payload;
  }
  __name(fetchJson, "fetchJson");
  function isoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  __name(isoDate, "isoDate");
  function localTodayIso() {
    return isoDate(/* @__PURE__ */ new Date());
  }
  __name(localTodayIso, "localTodayIso");
  function recentStartDateIso() {
    const date = /* @__PURE__ */ new Date();
    date.setDate(date.getDate() - TEAM_HISTORY_LOOKBACK_DAYS);
    return isoDate(date);
  }
  __name(recentStartDateIso, "recentStartDateIso");
  function asPitcherHand(value) {
    return value === "L" || value === "R" ? value : void 0;
  }
  __name(asPitcherHand, "asPitcherHand");
  function asBatterHand(value) {
    return value === "L" || value === "R" || value === "S" ? value : void 0;
  }
  __name(asBatterHand, "asBatterHand");
  function getMlbTeamId(team) {
    return MLB_TEAM_IDS[normalizeTeam(team) ?? ""];
  }
  __name(getMlbTeamId, "getMlbTeamId");
  async function getPersonPitchHandById(personId) {
    const existing = personPitchHandByIdCache.get(personId);
    if (existing) {
      return existing;
    }
    const promise = fetchJson(`https://statsapi.mlb.com/api/v1/people/${personId}`).then((payload) => asPitcherHand(payload.people?.[0]?.pitchHand?.code)).catch(() => void 0);
    personPitchHandByIdCache.set(personId, promise);
    return promise;
  }
  __name(getPersonPitchHandById, "getPersonPitchHandById");
  function pickStarterFromFeed(feed, side) {
    const probable = feed.gameData?.probablePitchers?.[side];
    if (probable?.id != null) {
      return { id: probable.id, name: probable.fullName };
    }
    const teamBox = feed.liveData?.boxscore?.teams?.[side];
    const starterId = teamBox?.pitchers?.[0];
    if (starterId != null) {
      return { id: starterId, name: teamBox?.players?.[`ID${starterId}`]?.person?.fullName };
    }
    return void 0;
  }
  __name(pickStarterFromFeed, "pickStarterFromFeed");
  async function fetchLiveStarter(gamePk, side) {
    try {
      const feed = await fetchJson(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`);
      const starter = pickStarterFromFeed(feed, side);
      if (!starter) {
        return void 0;
      }
      const hand = await getPersonPitchHandById(starter.id);
      if (!hand) {
        return void 0;
      }
      return { name: starter.name ?? "Probable starter", hand };
    } catch {
      return void 0;
    }
  }
  __name(fetchLiveStarter, "fetchLiveStarter");
  var probablesCodec = {
    encode: /* @__PURE__ */ __name((value) => Array.from(value, ([team, byDate]) => [team, Array.from(byDate)]), "encode"),
    decode: /* @__PURE__ */ __name((raw) => new Map((Array.isArray(raw) ? raw : []).map(([team, byDate]) => [team, new Map(byDate)])), "decode")
  };
  var opposingProbablesCached = persistentCacheByKey(
    30 * MINUTES,
    "probables-v3",
    (cacheKey) => loadOpposingProbablesByTeamDate(cacheKey ? cacheKey.split(",") : []),
    probablesCodec
  );
  function fetchOpposingProbablesByTeamDate(teams) {
    const normalized = Array.from(
      new Set(teams.map((team) => normalizeTeam(team)).filter((team) => Boolean(team)))
    ).sort();
    return opposingProbablesCached(normalized.join(",")).then((map) => reconcileProbableMap(map));
  }
  __name(fetchOpposingProbablesByTeamDate, "fetchOpposingProbablesByTeamDate");
  function reconcileProbableMap(map, extra = []) {
    const claim = /* @__PURE__ */ __name((p, date) => ({ name: p.name, date, priority: p.source === "mlb" ? 3 : 1 }), "claim");
    const evidence = [...extra, ...Array.from(map.values()).flatMap((byDate) => Array.from(byDate).flatMap(([date, players]) => players.map((p) => claim(p, date))))];
    return new Map(Array.from(map, ([team, dates]) => [team, new Map(Array.from(dates, ([date, pitchers]) => [date, pitchers.filter((p) => !probableDateConflicts(claim(p, date), evidence))]))]));
  }
  __name(reconcileProbableMap, "reconcileProbableMap");
  async function loadOpposingProbablesByTeamDate(teams) {
    const normalizedTeams = new Set(teams.map((team) => normalizeTeam(team)).filter((team) => Boolean(team)));
    if (normalizedTeams.size === 0) {
      return /* @__PURE__ */ new Map();
    }
    const result = /* @__PURE__ */ new Map();
    const startDate = localTodayIso();
    const endDate = isoDate(new Date(Date.now() + 10 * 24 * 60 * 60 * 1e3));
    const [schedule, fangraphsFallback, rotoWireFallback] = await Promise.all([
      fetchJson(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=team,probablePitcher`
      ),
      fetchFanGraphsProbables(normalizedTeams).catch(() => /* @__PURE__ */ new Map()),
      fetchRotoWireProbables(normalizedTeams).catch(() => /* @__PURE__ */ new Map())
    ]);
    const { candidates, gaps } = collectOpposingProbableScheduleEntries(schedule, normalizedTeams);
    const uniquePitcherIds = Array.from(new Set(candidates.map((candidate) => candidate.pitcherId)));
    const handsById = /* @__PURE__ */ new Map();
    await Promise.all(
      uniquePitcherIds.map(async (pitcherId) => {
        handsById.set(pitcherId, await getPersonPitchHandById(pitcherId));
      })
    );
    candidates.forEach((candidate) => {
      const hand = handsById.get(candidate.pitcherId);
      if (!hand) {
        return;
      }
      const byDate = result.get(candidate.team) ?? /* @__PURE__ */ new Map();
      const existing = byDate.get(candidate.date) ?? [];
      if (!existing.some((item) => item.name === candidate.pitcherName && item.hand === hand)) {
        existing.push({ name: candidate.pitcherName, hand, source: "mlb" });
      }
      byDate.set(candidate.date, existing);
      result.set(candidate.team, byDate);
    });
    const fill = /* @__PURE__ */ __name((team, date, probables) => {
      const byDate = result.get(team) ?? /* @__PURE__ */ new Map();
      const existing = byDate.get(date) ?? [];
      for (const probable of probables) {
        if (!existing.some((item) => normalizeName(item.name) === normalizeName(probable.name) && item.hand === probable.hand)) {
          existing.push(probable);
        }
      }
      byDate.set(date, existing);
      result.set(team, byDate);
    }, "fill");
    for (const gap of gaps) {
      const fgProbables = fangraphsFallback.get(gap.team)?.get(gap.date);
      if (fgProbables && fgProbables.length > 0) {
        fill(gap.team, gap.date, fgProbables);
      }
      const rwProbables = rotoWireFallback.get(gap.team)?.get(gap.date);
      if (rwProbables && rwProbables.length > 0) {
        fill(gap.team, gap.date, rwProbables);
      }
    }
    const windowEnd = isoDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1e3));
    const liveGaps = gaps.filter((gap) => gap.gamePk != null && gap.date <= windowEnd).slice(0, 16);
    await Promise.all(liveGaps.map(async (gap) => {
      const starter = await fetchLiveStarter(gap.gamePk, gap.opponentSide);
      if (starter) {
        fill(gap.team, gap.date, [{ name: starter.name, hand: starter.hand, source: "mlb" }]);
      }
    }));
    const postedEvidence = [];
    for (const day of schedule.dates ?? []) for (const game of day.games ?? []) {
      for (const side of ["away", "home"]) {
        const name = game.teams?.[side]?.probablePitcher?.fullName;
        if (name && game.officialDate) postedEvidence.push({ name, date: game.officialDate.slice(0, 10), priority: 3 });
      }
    }
    return reconcileProbableMap(result, postedEvidence);
  }
  __name(loadOpposingProbablesByTeamDate, "loadOpposingProbablesByTeamDate");
  async function actualOpposingStarter(gamePk, team) {
    try {
      const box = await getBoxscore(gamePk);
      const away = box.teams?.away;
      const home = box.teams?.home;
      const awayTeam = normalizeTeam(away?.team?.abbreviation);
      const homeTeam = normalizeTeam(home?.team?.abbreviation);
      const opponentBox = awayTeam === team ? home : homeTeam === team ? away : void 0;
      if (!opponentBox?.team?.id) {
        return void 0;
      }
      const starter = Object.values(opponentBox.players ?? {}).find((player) => (player.stats?.pitching?.gamesStarted ?? 0) > 0);
      const name = starter?.person?.fullName;
      const opponentTeam = normalizeTeam(opponentBox.team.abbreviation);
      if (!name || !opponentTeam) {
        return void 0;
      }
      const roster = await getTeamRosterContext(opponentTeam, opponentBox.team.id).catch(() => void 0);
      const hand = roster?.pitchHandByPlayer.get(normalizeName(name)) ?? (await getPersonHandsByName(name)).pitchHand;
      return hand ? { name, hand, source: "mlb" } : void 0;
    } catch {
      return void 0;
    }
  }
  __name(actualOpposingStarter, "actualOpposingStarter");
  async function fetchActualStarterHands(teams, isoDates) {
    const result = /* @__PURE__ */ new Map();
    const normalizedTeams = new Set(teams.map((team) => normalizeTeam(team)).filter((team) => Boolean(team)));
    const today = localTodayIso();
    const past = isoDates.filter((date) => date < today);
    if (normalizedTeams.size === 0 || past.length === 0) {
      return result;
    }
    const start = past.reduce((a, b) => a < b ? a : b);
    const end = past.reduce((a, b) => a > b ? a : b);
    let schedule;
    try {
      schedule = await fetchJson(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${start}&endDate=${end}&hydrate=team`
      );
    } catch {
      return result;
    }
    const jobs = [];
    for (const day of schedule.dates ?? []) {
      for (const game of day.games ?? []) {
        const date = game.officialDate?.slice(0, 10);
        const isFinal = (game.status?.abstractGameState ?? "").toLowerCase() === "final";
        if (!date || !game.gamePk || !isFinal) {
          continue;
        }
        for (const side of ["away", "home"]) {
          const teamAbbr = normalizeTeam(game.teams?.[side]?.team?.abbreviation);
          if (teamAbbr && normalizedTeams.has(teamAbbr)) {
            jobs.push({ team: teamAbbr, date, gamePk: game.gamePk });
          }
        }
      }
    }
    await Promise.all(jobs.slice(0, 40).map(async (job) => {
      const starter = await actualOpposingStarter(job.gamePk, job.team);
      if (!starter) {
        return;
      }
      const byDate = result.get(job.team) ?? /* @__PURE__ */ new Map();
      byDate.set(job.date, [starter]);
      result.set(job.team, byDate);
    }));
    return result;
  }
  __name(fetchActualStarterHands, "fetchActualStarterHands");
  function getTeamRosterContext(team, teamId) {
    return rosterContextCached(`${team}|${teamId}`);
  }
  __name(getTeamRosterContext, "getTeamRosterContext");
  var rosterContextCodec = {
    encode: /* @__PURE__ */ __name((value) => ({
      bat: Array.from(value.batSideByPlayer),
      pitch: Array.from(value.pitchHandByPlayer),
      active: Array.from(value.activeNames)
    }), "encode"),
    decode: /* @__PURE__ */ __name((raw) => {
      const r = raw ?? {};
      return {
        batSideByPlayer: new Map(r.bat ?? []),
        pitchHandByPlayer: new Map(r.pitch ?? []),
        activeNames: new Set(r.active ?? [])
      };
    }, "decode")
  };
  var rosterContextCached = persistentCacheByKey(3 * HOURS, "roster", (cacheKey) => {
    const teamId = Number(cacheKey.split("|")[1]);
    return fetchJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active&hydrate=person`).then((payload) => {
      const batSideByPlayer = /* @__PURE__ */ new Map();
      const pitchHandByPlayer = /* @__PURE__ */ new Map();
      const activeNames = /* @__PURE__ */ new Set();
      payload.roster?.forEach((entry) => {
        const name = entry.person?.fullName;
        if (!name) {
          return;
        }
        const normalized = normalizeName(name);
        const batSide = asBatterHand(entry.person?.batSide?.code);
        const pitchHand = asPitcherHand(entry.person?.pitchHand?.code);
        if (batSide) {
          batSideByPlayer.set(normalized, batSide);
        }
        if (pitchHand) {
          pitchHandByPlayer.set(normalized, pitchHand);
        }
        activeNames.add(normalized);
        activeNames.add(looseName(normalized));
      });
      return {
        batSideByPlayer,
        pitchHandByPlayer,
        activeNames
      };
    });
  }, rosterContextCodec);
  async function fetchActiveRosterNames(teams) {
    const out = /* @__PURE__ */ new Map();
    const unique = Array.from(new Set(teams.map((team) => normalizeTeam(team)).filter((team) => Boolean(team))));
    await Promise.all(unique.map(async (team) => {
      const teamId = getMlbTeamId(team);
      if (teamId == null) {
        return;
      }
      try {
        const ctx = await getTeamRosterContext(team, teamId);
        if (ctx.activeNames.size > 0) {
          out.set(team, ctx.activeNames);
        }
      } catch {
      }
    }));
    return out;
  }
  __name(fetchActiveRosterNames, "fetchActiveRosterNames");
  var ilNamesCached = persistentCacheByKey(3 * HOURS, "il40", (cacheKey) => {
    const teamId = Number(cacheKey.split("|")[1]);
    return fetchJson(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=40Man&hydrate=person`).then((payload) => {
      const ilNames = /* @__PURE__ */ new Set();
      payload.roster?.forEach((entry) => {
        const name = entry.person?.fullName;
        const desc = entry.status?.description ?? "";
        const code = entry.status?.code ?? "";
        if (name && (/injured/i.test(desc) || code.startsWith("D"))) {
          const normalized = normalizeName(name);
          ilNames.add(normalized);
          ilNames.add(looseName(normalized));
        }
      });
      return ilNames;
    });
  }, setCodec);
  async function fetchRosterStatusByTeam(teams) {
    const out = /* @__PURE__ */ new Map();
    const unique = Array.from(new Set(teams.map((team) => normalizeTeam(team)).filter((team) => Boolean(team))));
    await Promise.all(unique.map(async (team) => {
      const teamId = getMlbTeamId(team);
      if (teamId == null) {
        return;
      }
      try {
        const [ctx, il] = await Promise.all([
          getTeamRosterContext(team, teamId),
          ilNamesCached(`${team}|${teamId}`)
        ]);
        if (ctx.activeNames.size > 0 || il.size > 0) {
          out.set(team, { active: ctx.activeNames, il });
        }
      } catch {
      }
    }));
    return out;
  }
  __name(fetchRosterStatusByTeam, "fetchRosterStatusByTeam");
  async function fetchBatSidesByPlayer(players) {
    const out = /* @__PURE__ */ new Map();
    const hitters = players.filter((player) => player.normalizedTeam && isHitterPlayer(player));
    const teams = Array.from(new Set(hitters.map((player) => player.normalizedTeam).filter((team) => Boolean(team))));
    const ctxByTeam = /* @__PURE__ */ new Map();
    await Promise.all(teams.map(async (team) => {
      const teamId = getMlbTeamId(team);
      if (teamId == null) {
        return;
      }
      try {
        ctxByTeam.set(team, await getTeamRosterContext(team, teamId));
      } catch {
      }
    }));
    for (const player of hitters) {
      const ctx = player.normalizedTeam ? ctxByTeam.get(player.normalizedTeam) : void 0;
      let hand = ctx?.batSideByPlayer.get(player.normalizedName);
      if (!hand) {
        hand = (await getPersonHandsByName(player.playerName)).batSide;
      }
      if (hand) {
        out.set(riskKey(player), hand);
      }
    }
    return out;
  }
  __name(fetchBatSidesByPlayer, "fetchBatSidesByPlayer");
  async function getPersonLookupByName(name) {
    const normalized = normalizeName(name);
    const existing = personLookupCache.get(normalized);
    if (existing) {
      return existing;
    }
    const promise = fetchJson(
      `https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(name)}&sportId=1`
    ).then((payload) => {
      const exact = payload.people?.find((person) => normalizeName(person.fullName ?? "") === normalized) ?? payload.people?.[0];
      return {
        personId: exact?.id,
        batSide: asBatterHand(exact?.batSide?.code),
        pitchHand: asPitcherHand(exact?.pitchHand?.code)
      };
    });
    personLookupCache.set(normalized, promise);
    return promise;
  }
  __name(getPersonLookupByName, "getPersonLookupByName");
  async function getPersonHandsByName(name) {
    const person = await getPersonLookupByName(name);
    return { batSide: person.batSide, pitchHand: person.pitchHand };
  }
  __name(getPersonHandsByName, "getPersonHandsByName");
  function shouldUseGame(game, todayIso) {
    if (!game.gamePk || game.gameType !== "R") {
      return false;
    }
    if ((game.officialDate ?? "") > todayIso) {
      return false;
    }
    const abstractState = game.status?.abstractGameState?.toLowerCase();
    const detailedState = game.status?.detailedState?.toLowerCase();
    const statusCode = game.status?.statusCode?.toUpperCase();
    if (abstractState === "preview" || statusCode === "S") {
      return false;
    }
    if (detailedState?.includes("postponed") || detailedState?.includes("cancelled")) {
      return false;
    }
    return true;
  }
  __name(shouldUseGame, "shouldUseGame");
  function uniqueRecentGames(schedule) {
    const today = localTodayIso();
    const unique = /* @__PURE__ */ new Map();
    const games = schedule.dates?.flatMap((date) => date.games ?? []) ?? [];
    games.filter((game) => shouldUseGame(game, today)).sort((left, right) => (right.officialDate ?? "").localeCompare(left.officialDate ?? "")).forEach((game) => {
      if (game.gamePk != null && unique.size < TEAM_HISTORY_LIMIT && !unique.has(game.gamePk)) {
        unique.set(game.gamePk, (game.officialDate ?? "").slice(0, 10));
      }
    });
    return Array.from(unique.entries()).map(([gamePk, date]) => ({ gamePk, date }));
  }
  __name(uniqueRecentGames, "uniqueRecentGames");
  function startedHitterNames(teamBox) {
    const starters = /* @__PURE__ */ new Set();
    Object.values(teamBox?.players ?? {}).forEach((player) => {
      const name = player.person?.fullName;
      const position2 = player.position?.abbreviation?.toUpperCase();
      const isBench = Boolean(player.gameStatus?.isOnBench || player.gameStatus?.isSubstitute);
      if (!name || !player.battingOrder || isBench || position2 === "P") {
        return;
      }
      starters.add(normalizeName(name));
    });
    return starters;
  }
  __name(startedHitterNames, "startedHitterNames");
  function appearedHitterNames(teamBox) {
    const appearances = /* @__PURE__ */ new Set();
    Object.values(teamBox?.players ?? {}).forEach((player) => {
      const name = player.person?.fullName;
      const position2 = player.position?.abbreviation?.toUpperCase();
      const batting = player.stats?.batting;
      if (name && position2 !== "P" && ((batting?.gamesPlayed ?? 0) > 0 || (batting?.plateAppearances ?? 0) > 0 || (batting?.atBats ?? 0) > 0)) {
        appearances.add(normalizeName(name));
      }
    });
    return appearances;
  }
  __name(appearedHitterNames, "appearedHitterNames");
  async function getBoxscore(gamePk) {
    const existing = boxscoreCache.get(gamePk);
    if (existing) {
      return existing;
    }
    const promise = fetchJson(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
    boxscoreCache.set(gamePk, promise);
    return promise;
  }
  __name(getBoxscore, "getBoxscore");
  async function buildGameSnapshot(team, teamId, gamePk, date) {
    const boxscore = await getBoxscore(gamePk);
    const away = boxscore.teams?.away;
    const home = boxscore.teams?.home;
    const awayTeam = normalizeTeam(away?.team?.abbreviation);
    const homeTeam = normalizeTeam(home?.team?.abbreviation);
    const teamBox = away?.team?.id === teamId || awayTeam === team ? away : home;
    const opponentBox = teamBox === away ? home : away;
    const starters = startedHitterNames(teamBox);
    const appearances = appearedHitterNames(teamBox);
    const starterName = Object.values(opponentBox?.players ?? {}).find((player) => (player.stats?.pitching?.gamesStarted ?? 0) > 0)?.person?.fullName;
    const opponentTeam = normalizeTeam(opponentBox?.team?.abbreviation);
    let opponentStarterHand;
    if (starterName && opponentTeam && opponentBox?.team?.id != null) {
      const opponentRoster = await getTeamRosterContext(opponentTeam, opponentBox.team.id);
      opponentStarterHand = opponentRoster.pitchHandByPlayer.get(normalizeName(starterName));
      if (!opponentStarterHand) {
        opponentStarterHand = (await getPersonHandsByName(starterName)).pitchHand;
      }
    }
    return {
      starters,
      appearances,
      opponentStarterHand,
      ...date ? { date } : {}
    };
  }
  __name(buildGameSnapshot, "buildGameSnapshot");
  function getTeamHistory(team, teamId) {
    return teamHistoryCached(`${team}|${teamId}`);
  }
  __name(getTeamHistory, "getTeamHistory");
  var teamHistoryCodec = {
    encode: /* @__PURE__ */ __name((value) => value.map((game) => ({
      s: Array.from(game.starters),
      a: game.appearances ? Array.from(game.appearances) : void 0,
      h: game.opponentStarterHand,
      d: game.date
    })), "encode"),
    decode: /* @__PURE__ */ __name((raw) => (Array.isArray(raw) ? raw : []).map((game) => {
      const g = game;
      return {
        starters: new Set(g.s ?? []),
        ...g.a ? { appearances: new Set(g.a) } : {},
        ...g.h ? { opponentStarterHand: g.h } : {},
        ...g.d ? { date: g.d } : {}
      };
    }), "decode")
  };
  var teamHistoryCached = persistentCacheByKey(3 * HOURS, "teamhist-v2", (cacheKey) => {
    const [team = "", teamIdRaw = ""] = cacheKey.split("|");
    const teamId = Number(teamIdRaw);
    return fetchJson(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${recentStartDateIso()}&endDate=${localTodayIso()}`
    ).then((schedule) => uniqueRecentGames(schedule)).then((games) => Promise.all(
      games.map((game) => buildGameSnapshot(team, teamId, game.gamePk, game.date || void 0))
    ));
  }, teamHistoryCodec);
  var MLB_ID_TO_ABBREV = new Map(
    Object.entries(MLB_TEAM_IDS).map(([abbrev, id]) => [id, abbrev])
  );
  var priorTeamIdsCached = ttlCacheByKey(6 * HOURS, async (cacheKey) => {
    const [personIdRaw = "", currentTeamIdRaw = ""] = cacheKey.split("|");
    const personId = Number(personIdRaw);
    const currentTeamId2 = Number(currentTeamIdRaw);
    if (!Number.isFinite(personId) || personId <= 0) return [];
    const season = (/* @__PURE__ */ new Date()).getFullYear();
    const payload = await fetchJson(
      `https://statsapi.mlb.com/api/v1/people/${personId}/stats?stats=gameLog&group=hitting&season=${season}&sportId=1`
    );
    const splits = payload.stats?.[0]?.splits ?? [];
    const ordered = [...splits].reverse();
    const prior = /* @__PURE__ */ new Set();
    for (const split of ordered) {
      const teamId = split.team?.id;
      if (teamId == null || teamId === currentTeamId2) continue;
      prior.add(teamId);
      if (prior.size >= 2) break;
    }
    return Array.from(prior);
  });
  async function loadPriorTeamHistories(playerName, currentTeam) {
    const out = /* @__PURE__ */ new Map();
    const currentTeamId2 = getMlbTeamId(currentTeam);
    if (currentTeamId2 == null) return out;
    try {
      const person = await getPersonLookupByName(playerName);
      if (person.personId == null) return out;
      const priorIds = await priorTeamIdsCached(`${person.personId}|${currentTeamId2}`);
      await Promise.all(priorIds.map(async (teamId) => {
        const abbrev = MLB_ID_TO_ABBREV.get(teamId);
        if (!abbrev || abbrev === currentTeam) return;
        const history = await getTeamHistory(abbrev, teamId);
        out.set(abbrev, history);
      }));
    } catch (error) {
      console.warn("NFBC prior-team history fetch failed", error);
    }
    return out;
  }
  __name(loadPriorTeamHistories, "loadPriorTeamHistories");
  function playerAppearedOnTeam(normalizedName, history) {
    return history.some(
      (game) => game.starters.has(normalizedName) || (game.appearances?.has(normalizedName) ?? false)
    );
  }
  __name(playerAppearedOnTeam, "playerAppearedOnTeam");
  function historiesForPlayer(normalizedName, currentTeam, pageHistories, priorHistories) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const push = /* @__PURE__ */ __name((team, history) => {
      if (!history || seen.has(team) || !playerAppearedOnTeam(normalizedName, history)) return;
      seen.add(team);
      out.push(history);
    }, "push");
    if (currentTeam) push(currentTeam, pageHistories.get(currentTeam) ?? priorHistories.get(currentTeam));
    for (const [team, history] of pageHistories) push(team, history);
    for (const [team, history] of priorHistories) push(team, history);
    return out;
  }
  __name(historiesForPlayer, "historiesForPlayer");
  function needsCrossTeamHistory(normalizedName, currentHistory) {
    if (!currentHistory || currentHistory.length === 0) return true;
    return availableWindow(normalizedName, currentHistory).games.length < CROSS_TEAM_STINT_GAMES;
  }
  __name(needsCrossTeamHistory, "needsCrossTeamHistory");
  function riskSummaryLines(report) {
    const lines = [];
    if (report.partTimeCount > 0) {
      lines.push(`${report.partTimeCount} hitter${report.partTimeCount === 1 ? "" : "s"} flagged PT`);
    }
    if (report.platoonCount > 0) {
      lines.push(`${report.platoonCount} hitter${report.platoonCount === 1 ? "" : "s"} flagged Platoon`);
    }
    if (report.contextCount > 0) {
      lines.push(`${report.contextCount} hitter${report.contextCount === 1 ? "" : "s"} with new/return role context`);
    }
    if (lines.length === 0) {
      lines.push("No current hitter role-risk flags");
    }
    return lines;
  }
  __name(riskSummaryLines, "riskSummaryLines");
  async function fetchPlayingTimeTrends(players) {
    const out = /* @__PURE__ */ new Map();
    const hitters = players.filter((player) => player.normalizedTeam && isHitterPlayer(player));
    if (hitters.length === 0) return out;
    try {
      const teams = Array.from(new Set(hitters.map((player) => player.normalizedTeam).filter((team) => Boolean(team))));
      const teamData = await Promise.all(
        teams.map(async (team) => {
          const teamId = getMlbTeamId(team);
          if (teamId == null) return [team, void 0];
          const [roster, history] = await Promise.all([
            getTeamRosterContext(team, teamId),
            getTeamHistory(team, teamId)
          ]);
          return [team, { roster, history }];
        })
      );
      const teamContext = new Map(teamData);
      const pageHistories = new Map(
        Array.from(teamContext.entries()).filter((entry) => Boolean(entry[1])).map(([team, context]) => [team, context.history])
      );
      const priorByPlayer = /* @__PURE__ */ new Map();
      await Promise.all(hitters.map(async (player) => {
        const team = player.normalizedTeam;
        if (!team) return;
        const currentHistory = pageHistories.get(team);
        if (!needsCrossTeamHistory(player.normalizedName, currentHistory)) return;
        priorByPlayer.set(
          riskKey(player),
          await loadPriorTeamHistories(player.playerName, team)
        );
      }));
      for (const player of hitters) {
        const context = player.normalizedTeam ? teamContext.get(player.normalizedTeam) : void 0;
        if (!context) continue;
        const histories = historiesForPlayer(
          player.normalizedName,
          player.normalizedTeam,
          pageHistories,
          priorByPlayer.get(riskKey(player)) ?? /* @__PURE__ */ new Map()
        );
        const combined = histories.length > 0 ? combinePlayerGameHistory(player.normalizedName, histories) : context.history;
        const trend = evaluatePlayingTime(player.normalizedName, combined);
        if (!trend) continue;
        const batSide = context.roster.batSideByPlayer.get(player.normalizedName) ?? (await getPersonHandsByName(player.playerName)).batSide;
        out.set(riskKey(player), {
          trend,
          batSide,
          platoon: platoonProfile(trend, batSide),
          handRates: startRatesByHand(trend, batSide)
        });
      }
    } catch (error) {
      console.warn("NFBC playing-time trend fetch failed", error);
    }
    return out;
  }
  __name(fetchPlayingTimeTrends, "fetchPlayingTimeTrends");
  async function fetchHitterRiskReport(players) {
    const hitterPlayers = players.filter((player) => player.normalizedTeam && isHitterPlayer(player));
    const badgesByKey = /* @__PURE__ */ new Map();
    if (hitterPlayers.length === 0) {
      return {
        badgesByKey,
        partTimeCount: 0,
        platoonCount: 0,
        contextCount: 0,
        summaryLines: ["No current hitter role-risk flags"]
      };
    }
    try {
      const teams = Array.from(new Set(hitterPlayers.map((player) => player.normalizedTeam).filter((team) => Boolean(team))));
      const teamData = await Promise.all(
        teams.map(async (team) => {
          const teamId = getMlbTeamId(team);
          if (teamId == null) {
            return [team, void 0];
          }
          const [roster, history] = await Promise.all([
            getTeamRosterContext(team, teamId),
            getTeamHistory(team, teamId)
          ]);
          return [team, { roster, history }];
        })
      );
      const teamContext = new Map(teamData);
      const pageHistories = new Map(
        Array.from(teamContext.entries()).filter((entry) => Boolean(entry[1])).map(([team, context]) => [team, context.history])
      );
      const priorByPlayer = /* @__PURE__ */ new Map();
      await Promise.all(hitterPlayers.map(async (player) => {
        const team = player.normalizedTeam;
        if (!team) return;
        const currentHistory = pageHistories.get(team);
        if (!needsCrossTeamHistory(player.normalizedName, currentHistory)) return;
        priorByPlayer.set(
          riskKey(player),
          await loadPriorTeamHistories(player.playerName, team)
        );
      }));
      let partTimeCount = 0;
      let platoonCount = 0;
      let contextCount = 0;
      for (const player of hitterPlayers) {
        const team = player.normalizedTeam;
        if (!team) {
          continue;
        }
        const context = teamContext.get(team);
        if (!context) {
          continue;
        }
        const batterHand = context.roster.batSideByPlayer.get(player.normalizedName) ?? (await getPersonHandsByName(player.playerName)).batSide;
        const histories = historiesForPlayer(
          player.normalizedName,
          team,
          pageHistories,
          priorByPlayer.get(riskKey(player)) ?? /* @__PURE__ */ new Map()
        );
        const combined = histories.length > 0 ? combinePlayerGameHistory(player.normalizedName, histories) : context.history;
        const badges = evaluateHitterRisk(player.normalizedName, batterHand, combined);
        if (badges.length === 0) {
          continue;
        }
        badgesByKey.set(riskKey(player), badges);
        if (badges.some((badge2) => badge2.label === "PT")) {
          partTimeCount += 1;
        }
        if (badges.some((badge2) => badge2.label === "Platoon")) {
          platoonCount += 1;
        }
        if (badges.some((badge2) => badge2.tone === "context")) contextCount += 1;
      }
      return {
        badgesByKey,
        partTimeCount,
        platoonCount,
        contextCount,
        summaryLines: riskSummaryLines({ badgesByKey, partTimeCount, platoonCount, contextCount })
      };
    } catch (error) {
      console.warn("NFBC hitter-risk fetch failed", error);
      return {
        badgesByKey,
        partTimeCount: 0,
        platoonCount: 0,
        contextCount: 0,
        summaryLines: ["Hitter role-risk signals unavailable"]
      };
    }
  }
  __name(fetchHitterRiskReport, "fetchHitterRiskReport");

  // src/content/toast.ts
  var toastEl = null;
  function showToast(message, tone = "info") {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.style.position = "fixed";
      toastEl.style.top = "20px";
      toastEl.style.right = "20px";
      toastEl.style.zIndex = "999999";
      toastEl.style.padding = "12px 16px";
      toastEl.style.borderRadius = "10px";
      toastEl.style.fontFamily = "Georgia, serif";
      toastEl.style.boxShadow = "0 10px 24px rgba(0,0,0,0.18)";
      document.body.append(toastEl);
    }
    const colors = {
      success: ["#0f5c4d", "#fff"],
      error: ["#7a1d1d", "#fff"],
      info: ["#1d1d1b", "#fff"]
    };
    toastEl.style.background = colors[tone][0];
    toastEl.style.color = colors[tone][1];
    toastEl.textContent = message;
    window.clearTimeout(toastEl._timer);
    toastEl._timer = window.setTimeout(() => {
      toastEl?.remove();
      toastEl = null;
    }, 3500);
  }
  __name(showToast, "showToast");

  // src/core/config.ts
  function defaultUrlSource(period) {
    const urls = [...DEFAULT_PROJECTION_SOURCE_URLS[period]];
    return {
      mode: "url",
      url: urls[0],
      urls,
      autoSync: true
    };
  }
  __name(defaultUrlSource, "defaultUrlSource");
  var LEAGUE_PROFILES = {
    "15T_FAAB_MAIN_EVENT": {
      id: "15T_FAAB_MAIN_EVENT",
      label: "15T FAAB (Main Event SGP)",
      sgpFactors: {
        R: 11.7,
        HR: 5.8,
        RBI: 12.7,
        SB: 4.9,
        AVG: 11e-4,
        W: 1.9,
        K: 18,
        SV: 3.1,
        ERA: -0.0608,
        WHIP: -95e-4
      },
      ratio: {
        avg: { baseHits: 1712, baseAB: 6803, baseline: 0.2517, divisor: 107e-5 },
        era: { baseER: 499, baseIP: 1155, baseline: 3.885, divisor: -0.0608 },
        whip: { baseBaseRunners: 1415, baseIP: 1155, baseline: 1.223, divisor: -95e-4 }
      }
    },
    "15T_DRAFT_CHAMPIONS": {
      id: "15T_DRAFT_CHAMPIONS",
      label: "15T Draft Champions (2025 DC SGP)",
      sgpFactors: {
        R: 13.7,
        HR: 6.2,
        RBI: 15.4,
        SB: 5.4,
        AVG: 11e-4,
        W: 2.1,
        K: 24,
        SV: 4,
        ERA: -0.0594,
        WHIP: -96e-4
      },
      ratio: {
        avg: { baseHits: 1663, baseAB: 6598, baseline: 0.2521, divisor: 11e-4 },
        era: { baseER: 477, baseIP: 1115, baseline: 3.8502, divisor: -0.0594 },
        whip: { baseBaseRunners: 1358, baseIP: 1115, baseline: 1.2178, divisor: -96e-4 }
      }
    }
  };
  var DEFAULT_SETTINGS = {
    defaultLeagueType: "15T_FAAB_MAIN_EVENT",
    seasonTotalScoringPeriods: 27,
    faabBudgetLeft: 1e3,
    // private-by-obscurity topic; subscribe to it in the ntfy app
    ntfyTopic: "nfbc-scratch-yck12os35xa6",
    // local bridge to discord_bot/ for Accept-swap buttons (port chosen to avoid
    // the 8123 engine serve); blank disables
    discordBridgeUrl: "http://127.0.0.1:8790",
    projectionSources: {
      WEEKLY: defaultUrlSource("WEEKLY"),
      MON_THU: defaultUrlSource("MON_THU"),
      FRI_SUN: defaultUrlSource("FRI_SUN"),
      ROS: defaultUrlSource("ROS")
    }
  };
  var CONTEXT_BUCKETS = {
    attack: 0.3,
    protect: 0.25,
    neutral: 0
  };

  // src/core/decision_log.ts
  function decisionKey(leagueId, teamId, period, date) {
    return `${leagueId}|${teamId}|${period}|${date}`;
  }
  __name(decisionKey, "decisionKey");
  function pickStats(stats) {
    if (!stats) return void 0;
    const out = {};
    for (const [key, value] of Object.entries(stats)) {
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    }
    return Object.keys(out).length > 0 ? out : void 0;
  }
  __name(pickStats, "pickStats");
  function round(value, places = 4) {
    if (value == null || !Number.isFinite(value)) return void 0;
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  }
  __name(round, "round");
  function buildDecisionRecord(input) {
    const { scoredPlayers, assignments, leagueId, teamId, period } = input;
    if (!leagueId || !teamId || scoredPlayers.length === 0) return void 0;
    const recommended = new Map(assignments.map((a) => [a.playerKey, a.slotId]));
    const now = input.now ?? /* @__PURE__ */ new Date();
    const players = scoredPlayers.map((player) => {
      const { row } = player;
      const projection = player.matchedProjection;
      const record2 = {
        name: row.playerName,
        positions: row.eligiblePositions,
        slot: row.currentSlot,
        benched: row.isBench,
        unmatched: player.matchStatus !== "matched"
      };
      if (row.pagePlayerId) record2.playerId = row.pagePlayerId;
      if (row.mlbTeam) record2.mlbTeam = row.mlbTeam;
      if (row.injuryStatus) record2.status = row.injuryStatus;
      const slot = recommended.get(row.rowElementKey);
      if (slot) record2.recommendedSlot = slot;
      const stats = pickStats(projection?.stats);
      if (stats) record2.projected = stats;
      if (projection?.teamGames != null) record2.teamGames = projection.teamGames;
      if (projection?.startsProjected != null) record2.startsProjected = projection.startsProjected;
      const steal = round(projection?.stealProbability, 4);
      if (steal != null) record2.stealProbability = steal;
      const raw = round(player.rawSGP);
      if (raw != null) record2.rawSGP = raw;
      const contextual = round(player.contextualSGP);
      if (contextual != null) record2.contextualSGP = contextual;
      return record2;
    });
    const record = {
      capturedAt: now.toISOString(),
      date: localDate(now),
      leagueId,
      teamId,
      period,
      locked: scoredPlayers.some((p) => p.row.isLocked),
      source: input.source ?? "page",
      players
    };
    if (input.scoringPeriod != null) record.scoringPeriod = input.scoringPeriod;
    if (input.firstGameDate) record.firstGameDate = input.firstGameDate;
    return record;
  }
  __name(buildDecisionRecord, "buildDecisionRecord");
  function localDate(now = /* @__PURE__ */ new Date()) {
    const pad = /* @__PURE__ */ __name((n2) => String(n2).padStart(2, "0"), "pad");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  __name(localDate, "localDate");
  function shouldReplace(existing, candidate) {
    if (!existing) return true;
    if (candidate.locked) return false;
    if (existing.locked) return true;
    if (existing.source !== candidate.source) return candidate.source === "page";
    return candidate.capturedAt > existing.capturedAt;
  }
  __name(shouldReplace, "shouldReplace");
  function recordDecision(store, record, keepDays = 90, now = /* @__PURE__ */ new Date()) {
    const key = decisionKey(record.leagueId, record.teamId, record.period, record.date);
    if (!shouldReplace(store[key], record)) return store;
    return pruneDecisions({ ...store, [key]: record }, keepDays, now);
  }
  __name(recordDecision, "recordDecision");
  function pruneDecisions(store, keepDays = 90, now = /* @__PURE__ */ new Date()) {
    const cutoff = localDate(new Date(now.getTime() - keepDays * 864e5));
    const out = {};
    for (const [key, record] of Object.entries(store)) {
      if (record.date >= cutoff) out[key] = record;
    }
    return out;
  }
  __name(pruneDecisions, "pruneDecisions");

  // src/core/standings_snapshot.ts
  var LIVESCORING_STAT_KEY = {
    R: "h_r",
    HR: "h_hr",
    RBI: "h_rbi",
    SB: "h_sb",
    AVG: "h_avg",
    W: "p_w",
    K: "p_k",
    SV: "p_s",
    ERA: "p_era",
    WHIP: "p_whip"
  };
  var ALL_CATEGORIES = Object.keys(LIVESCORING_STAT_KEY);
  function snapshotKey(leagueId, date) {
    return `${leagueId}|${date}`;
  }
  __name(snapshotKey, "snapshotKey");
  function todayStamp(now = /* @__PURE__ */ new Date()) {
    const pad = /* @__PURE__ */ __name((n2) => String(n2).padStart(2, "0"), "pad");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  __name(todayStamp, "todayStamp");
  function buildStandingsSnapshot(payload, leagueId, date = todayStamp(), spid) {
    if (!payload || !leagueId) return void 0;
    const teams = payload.t;
    const base = payload.b;
    if (!teams || !base) return void 0;
    const lines = [];
    for (const teamId of Object.keys(teams)) {
      const stats = base[teamId]?.s;
      if (!stats) continue;
      const categories = {};
      for (const category of ALL_CATEGORIES) {
        const value = stats[LIVESCORING_STAT_KEY[category]];
        if (typeof value === "number" && Number.isFinite(value)) {
          categories[category] = value;
        }
      }
      if (Object.keys(categories).length > 0) {
        lines.push({ teamId, categories });
      }
    }
    if (lines.length === 0) return void 0;
    return spid ? { date, leagueId, spid, teams: lines } : { date, leagueId, teams: lines };
  }
  __name(buildStandingsSnapshot, "buildStandingsSnapshot");
  function pruneSnapshots(store, keepDays = 400, now = /* @__PURE__ */ new Date()) {
    const cutoff = new Date(now.getTime() - keepDays * 864e5);
    const cutoffStamp = todayStamp(cutoff);
    const out = {};
    for (const [key, snapshot] of Object.entries(store)) {
      if (snapshot.date >= cutoffStamp) out[key] = snapshot;
    }
    return out;
  }
  __name(pruneSnapshots, "pruneSnapshots");
  function recordSnapshot(store, snapshot, keepDays = 400, now = /* @__PURE__ */ new Date()) {
    const next = { ...store, [snapshotKey(snapshot.leagueId, snapshot.date)]: snapshot };
    return pruneSnapshots(next, keepDays, now);
  }
  __name(recordSnapshot, "recordSnapshot");

  // src/storage/storage.ts
  var projectionPeriods = ["WEEKLY", "MON_THU", "FRI_SUN", "ROS"];
  function cloneProjectionSource(source) {
    return { ...source, urls: source.urls ? [...source.urls] : void 0 };
  }
  __name(cloneProjectionSource, "cloneProjectionSource");
  function normalizeProjectionSource(period, stored) {
    const fallback = DEFAULT_SETTINGS.projectionSources[period];
    const urls = configuredProjectionUrls(stored).filter((url) => !isLegacySourceUrl(url));
    if (urls.length === 0 || stored?.mode === "upload" || urls.every((url) => isDefaultEngineUrl(url))) {
      return {
        ...cloneProjectionSource(fallback),
        autoSync: stored?.autoSync ?? fallback.autoSync,
        lastSyncedAt: stored?.lastSyncedAt
      };
    }
    return {
      mode: "url",
      url: urls[0],
      urls,
      autoSync: stored?.autoSync ?? fallback.autoSync,
      lastSyncedAt: stored?.lastSyncedAt
    };
  }
  __name(normalizeProjectionSource, "normalizeProjectionSource");
  function normalizeSettings(stored) {
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      projectionSources: Object.fromEntries(
        projectionPeriods.map((period) => [
          period,
          normalizeProjectionSource(period, stored?.projectionSources?.[period])
        ])
      )
    };
  }
  __name(normalizeSettings, "normalizeSettings");
  async function getSettings() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
    const stored = result[STORAGE_KEYS.settings];
    return normalizeSettings(stored);
  }
  __name(getSettings, "getSettings");
  async function getProjectionStore() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.projections);
    const stored = result[STORAGE_KEYS.projections];
    return {
      WEEKLY: stored?.WEEKLY ?? [],
      MON_THU: stored?.MON_THU ?? [],
      FRI_SUN: stored?.FRI_SUN ?? [],
      ROS: stored?.ROS ?? []
    };
  }
  __name(getProjectionStore, "getProjectionStore");
  async function setProjectionStore(store) {
    await chrome.storage.local.set({ [STORAGE_KEYS.projections]: store });
  }
  __name(setProjectionStore, "setProjectionStore");
  async function setSyncMeta(period, timestamp) {
    const result = await chrome.storage.local.get(STORAGE_KEYS.syncMeta);
    const current = result[STORAGE_KEYS.syncMeta] ?? {};
    current[period] = timestamp;
    await chrome.storage.local.set({ [STORAGE_KEYS.syncMeta]: current });
  }
  __name(setSyncMeta, "setSyncMeta");
  async function getSyncMeta() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.syncMeta);
    return result[STORAGE_KEYS.syncMeta] ?? {};
  }
  __name(getSyncMeta, "getSyncMeta");
  var STALE_PROJECTION_HOURS = 12;
  var ON_DEMAND_FRESHNESS_MINUTES = 30;
  var STALE_ENGINE_DATA_HOURS = 16;
  async function getEngineMeta() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.engineMeta);
    return result[STORAGE_KEYS.engineMeta] ?? {};
  }
  __name(getEngineMeta, "getEngineMeta");
  async function setEngineMeta(meta) {
    await chrome.storage.local.set({ [STORAGE_KEYS.engineMeta]: meta });
  }
  __name(setEngineMeta, "setEngineMeta");
  function isProjectionStale(timestamp, maxAgeHours = STALE_PROJECTION_HOURS) {
    if (!timestamp) return true;
    const last = Date.parse(timestamp);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last > maxAgeHours * 60 * 60 * 1e3;
  }
  __name(isProjectionStale, "isProjectionStale");
  function describeSyncAge(timestamp, verb = "synced") {
    if (!timestamp) return `never ${verb}`;
    const last = Date.parse(timestamp);
    if (!Number.isFinite(last)) return `never ${verb}`;
    const ageMs = Date.now() - last;
    const hours = Math.floor(ageMs / (60 * 60 * 1e3));
    if (hours < 1) return `${verb} <1h ago`;
    if (hours < 48) return `${verb} ${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${verb} ${days}d ago`;
  }
  __name(describeSyncAge, "describeSyncAge");
  async function getRosterCache() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.rosterCache);
    return result[STORAGE_KEYS.rosterCache] ?? {};
  }
  __name(getRosterCache, "getRosterCache");
  async function updateRosterCache(leagueId, roster) {
    const current = await getRosterCache();
    current[leagueId] = {
      ...roster,
      // A switched /setlineup page often exposes no team id. Do not let that
      // partial observation erase the authoritative id learned from the bulk
      // set_lineup.data.php roster.
      teamId: roster.teamId ?? current[leagueId]?.teamId
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.rosterCache]: current });
  }
  __name(updateRosterCache, "updateRosterCache");
  async function setLineupPeriodMeta(meta) {
    await chrome.storage.local.set({ [STORAGE_KEYS.lineupPeriodMeta]: meta });
  }
  __name(setLineupPeriodMeta, "setLineupPeriodMeta");
  async function getLeagueMap() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.leagueMap);
    return result[STORAGE_KEYS.leagueMap] ?? {};
  }
  __name(getLeagueMap, "getLeagueMap");
  async function mergeLeagueMap(values) {
    const current = await getLeagueMap();
    await chrome.storage.local.set({ [STORAGE_KEYS.leagueMap]: { ...current, ...values } });
  }
  __name(mergeLeagueMap, "mergeLeagueMap");
  async function getStandingsSnapshots() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.standingsSnapshots);
    return result[STORAGE_KEYS.standingsSnapshots] ?? {};
  }
  __name(getStandingsSnapshots, "getStandingsSnapshots");
  async function saveStandingsSnapshot(snapshot) {
    const current = await getStandingsSnapshots();
    const key = snapshotKey(snapshot.leagueId, snapshot.date);
    const existing = current[key];
    if (existing && existing.teams.length === snapshot.teams.length) return;
    await chrome.storage.local.set({
      [STORAGE_KEYS.standingsSnapshots]: recordSnapshot(current, snapshot)
    });
  }
  __name(saveStandingsSnapshot, "saveStandingsSnapshot");
  async function getDecisionLog() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.decisionLog);
    return result[STORAGE_KEYS.decisionLog] ?? {};
  }
  __name(getDecisionLog, "getDecisionLog");
  async function saveDecisionRecord(record) {
    const current = await getDecisionLog();
    const next = recordDecision(current, record);
    if (next === current) return;
    await chrome.storage.local.set({ [STORAGE_KEYS.decisionLog]: next });
  }
  __name(saveDecisionRecord, "saveDecisionRecord");
  async function setSessionSummary(summary) {
    await chrome.storage.session.set({ [STORAGE_KEYS.sessionSummary]: summary });
  }
  __name(setSessionSummary, "setSessionSummary");
  async function getSessionSummary() {
    const result = await chrome.storage.session.get(STORAGE_KEYS.sessionSummary);
    return result[STORAGE_KEYS.sessionSummary];
  }
  __name(getSessionSummary, "getSessionSummary");
  async function clearSessionSummary() {
    await chrome.storage.session.remove(STORAGE_KEYS.sessionSummary);
  }
  __name(clearSessionSummary, "clearSessionSummary");

  // src/content/lineup_actions.ts
  function normalizeText(value) {
    return value?.replace(/\s+/g, " ").trim() ?? "";
  }
  __name(normalizeText, "normalizeText");
  function selectedTeamNode() {
    return document.querySelector("tr.selected");
  }
  __name(selectedTeamNode, "selectedTeamNode");
  function readCookie(name) {
    const parts = document.cookie.split(";").map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const [key, ...value] = part.split("=");
      if (key === name) {
        return value.join("=");
      }
    }
    return void 0;
  }
  __name(readCookie, "readCookie");
  function findWeekSelect() {
    const selects = Array.from(document.querySelectorAll("select"));
    return selects.find(
      (select) => Array.from(select.options).some((option) => /Week\s+\d+/i.test(option.textContent ?? ""))
    ) ?? null;
  }
  __name(findWeekSelect, "findWeekSelect");
  function urlSegments() {
    const match = window.location.pathname.match(/\/setlineup(?:all)?\/\d+\/(\d+)(?:\/(\d+))?/);
    return match ? { teamId: match[1], spid: match[2] } : {};
  }
  __name(urlSegments, "urlSegments");
  function parseIdsFromPage() {
    const selectedTeam = selectedTeamNode();
    const teamSpan = selectedTeam?.querySelector("span");
    const selectedTeamText = normalizeText(teamSpan?.textContent ?? selectedTeam?.textContent);
    const weekSelect2 = findWeekSelect();
    const periodText = weekSelect2?.selectedOptions?.[0]?.textContent?.trim() ?? weekSelect2?.value ?? "";
    const scoringMatch = periodText.match(/Week (\d+)/i);
    const sub = periodText.includes("Fri") ? "4" : periodText.includes("Mon") ? "3" : "1";
    return {
      teamId: urlSegments().teamId ?? selectedTeam?.getAttribute("data-team-id") ?? selectedTeamText.match(/ACCT#:(\d+)/)?.[1] ?? readCookie("team_id") ?? document.body.textContent?.match(/ACCT#:(\d+)/)?.[1],
      scoringPeriodId: scoringMatch?.[1],
      subScoringPeriodId: sub
    };
  }
  __name(parseIdsFromPage, "parseIdsFromPage");
  function globalSubScoringPeriodId(ids) {
    const week = Number(ids.scoringPeriodId);
    if (!Number.isFinite(week) || week < 1) {
      return void 0;
    }
    const isMonThu = ids.subScoringPeriodId === "3";
    return String(2 * week - (isMonThu ? 1 : 0));
  }
  __name(globalSubScoringPeriodId, "globalSubScoringPeriodId");
  function serializeSetLineupAssignments(rows, assignments) {
    const assignmentByKey = new Map(assignments.map((assignment) => [assignment.playerKey, assignment.slotId]));
    return rows.map((row) => [
      row.pagePlayerId ?? "",
      assignmentByKey.get(row.rowElementKey) ?? "Bench"
    ]);
  }
  __name(serializeSetLineupAssignments, "serializeSetLineupAssignments");
  function buildSetLineupSaveDiff(currentRows, assignments, orderedRows = currentRows) {
    const assignmentByKey = new Map(assignments.map((assignment) => [assignment.playerKey, assignment.slotId]));
    const currentIndex = new Map(currentRows.map((row, index) => [row.rowElementKey, index]));
    const mutations = [];
    orderedRows.forEach((row, toIndex) => {
      const fromIndex = currentIndex.get(row.rowElementKey) ?? toIndex;
      const fromSlot = row.isActive ? row.currentSlot : "Bench";
      const toSlot = assignmentByKey.get(row.rowElementKey) ?? "Bench";
      if (fromSlot !== toSlot) {
        mutations.push({
          playerKey: row.rowElementKey,
          playerName: row.playerName,
          kind: "slot",
          fromSlot,
          toSlot,
          fromIndex,
          toIndex
        });
      } else if (fromIndex !== toIndex) {
        mutations.push({
          playerKey: row.rowElementKey,
          playerName: row.playerName,
          kind: "order",
          fromSlot,
          toSlot,
          fromIndex,
          toIndex
        });
      }
    });
    return { ordered: serializeSetLineupAssignments(orderedRows, assignments), mutations };
  }
  __name(buildSetLineupSaveDiff, "buildSetLineupSaveDiff");
  async function saveSetLineup(rows, assignments) {
    const assignmentByKey = new Map(assignments.map((assignment) => [assignment.playerKey, assignment.slotId]));
    const ids = parseIdsFromPage();
    const teamId = document.body.textContent?.match(/ACCT#:(\d+)/)?.[1] ?? ids.teamId;
    const spid = globalSubScoringPeriodId(ids);
    if (!teamId || !spid) {
      throw new Error("Unable to derive setlineup save identifiers.");
    }
    const ordered = serializeSetLineupAssignments(rows, assignments);
    const params = new URLSearchParams({
      type: "save_lineup",
      formdata: JSON.stringify({ 0: ordered }),
      sel_team_id: teamId,
      sel_spid: spid
    });
    const response = await fetch("https://nfc.shgn.com/set_lineup.data.php", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: params.toString()
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
    }
    if (!response.ok || payload?.status !== "success") {
      const detail = typeof payload?.message === "string" && payload.message || typeof payload?.error === "string" && payload.error || (payload?.errors != null ? JSON.stringify(payload.errors) : "") || (!response.ok ? `HTTP ${response.status}` : "unexpected response from NFBC");
      console.warn("[NFBC] setlineup save rejected: " + JSON.stringify({
        status: response.status,
        sentIds: { sel_team_id: teamId, sel_spid: spid, parsed: ids },
        assignments: ordered.length,
        payload
      }));
      throw new Error(`NFBC setlineup save failed: ${detail}`);
    }
    const changedRowKeys = rows.filter((row) => (assignmentByKey.get(row.rowElementKey) ?? "Bench") !== (row.isActive ? row.currentSlot : "Bench")).map((row) => row.rowElementKey);
    await setSessionSummary({ page: "setlineup", changedRowKeys });
    showToast("Auto-Changes Successful", "success");
    window.setTimeout(() => window.location.reload(), 600);
  }
  __name(saveSetLineup, "saveSetLineup");
  function currentSubScoringPeriodId() {
    return document.querySelector("#sp_selector")?.value ?? void 0;
  }
  __name(currentSubScoringPeriodId, "currentSubScoringPeriodId");
  async function postSetLineupAll(teamId, subScoringPeriodId, lineup) {
    const formdata = JSON.stringify({ 0: lineup });
    const params = new URLSearchParams({
      type: "save_lineup",
      formdata,
      sel_team_id: teamId,
      sel_spid: subScoringPeriodId
    });
    const response = await fetch("https://nfc.shgn.com/set_lineup.data.php", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: params.toString()
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
    }
    if (!response.ok || payload?.status !== "success") {
      console.warn("[NFBC] setlineupall save rejected: " + JSON.stringify({
        status: response.status,
        sentIds: { sel_team_id: teamId, sel_spid: subScoringPeriodId },
        assignments: lineup.length,
        payload
      }));
      const detail = typeof payload?.message === "string" && payload.message || (!response.ok ? `HTTP ${response.status}` : payload == null ? "non-JSON response from NFBC (session expired?)" : "unexpected response from NFBC");
      throw new Error(`Save failed for team ${teamId}: ${detail}`);
    }
  }
  __name(postSetLineupAll, "postSetLineupAll");
  async function saveSetLineupAll(plans, onProgress, subScoringPeriodIdOverride) {
    const subScoringPeriodId = subScoringPeriodIdOverride ?? currentSubScoringPeriodId();
    if (!subScoringPeriodId) {
      throw new Error("Unable to derive setlineupall sub scoring period.");
    }
    const changedRowKeys = [];
    const changedPlans = plans.map((plan) => {
      const assignmentByKey = new Map(plan.assignments.map((assignment) => [assignment.playerKey, assignment.slotId]));
      const lineup = plan.rows.map((row) => {
        const nextSlot = assignmentByKey.get(row.rowElementKey) ?? "Bench";
        return [row.pagePlayerId ?? "", nextSlot];
      });
      const changedKeys = plan.rows.filter((row) => (assignmentByKey.get(row.rowElementKey) ?? "Bench") !== (row.isActive ? row.currentSlot : "Bench")).map((row) => row.rowElementKey);
      return {
        ...plan,
        lineup,
        changedKeys
      };
    }).filter((plan) => plan.changedKeys.length > 0 || plan.forceSave === true);
    for (const [index, plan] of changedPlans.entries()) {
      onProgress?.({
        phase: "saving",
        teamId: plan.teamId,
        leagueLabel: plan.leagueLabel,
        changedCount: plan.changedKeys.length,
        index: index + 1,
        total: changedPlans.length
      });
      try {
        await postSetLineupAll(plan.teamId, subScoringPeriodId, plan.lineup);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${plan.leagueLabel}: ${message}`);
      }
      changedRowKeys.push(...plan.changedKeys);
      onProgress?.({
        phase: "saved",
        teamId: plan.teamId,
        leagueLabel: plan.leagueLabel,
        changedCount: plan.changedKeys.length,
        index: index + 1,
        total: changedPlans.length
      });
    }
    await setSessionSummary({ page: "setlineupall", changedRowKeys });
    showToast(`Auto-Changes Successful: ${changedPlans.length} team(s) saved`, "success");
    window.setTimeout(() => window.location.reload(), 900);
    return { savedTeams: changedPlans.length, changedRowKeys };
  }
  __name(saveSetLineupAll, "saveSetLineupAll");

  // src/core/lineup_snapshots.ts
  function parseIlPlacements(payload) {
    const placements = [];
    for (const tx of payload.transactions ?? []) {
      const description = tx.description ?? "";
      if (!/placed .+ on the .*injured list/i.test(description)) continue;
      const name = tx.person?.fullName;
      const date = tx.date ?? tx.effectiveDate;
      if (!name || !date) continue;
      placements.push({ name, teamId: tx.toTeam?.id, date, description });
    }
    return placements;
  }
  __name(parseIlPlacements, "parseIlPlacements");
  function battingSlot(value) {
    if (!value) return void 0;
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return void 0;
    }
    return numeric >= 100 ? Math.floor(numeric / 100) : numeric;
  }
  __name(battingSlot, "battingSlot");
  function buildSnapshot(team, gameIndex, normalizeName2) {
    const starters = /* @__PURE__ */ new Map();
    Object.values(team?.players ?? {}).forEach((player) => {
      const name = player.person?.fullName;
      const position2 = player.position?.abbreviation?.toUpperCase();
      const order = battingSlot(player.battingOrder);
      const isBench = Boolean(player.gameStatus?.isOnBench || player.gameStatus?.isSubstitute);
      if (!name || !order || isBench || position2 === "P") {
        return;
      }
      starters.set(normalizeName2(name), order);
    });
    return {
      gameIndex,
      hasPostedLineup: starters.size > 0,
      starters
    };
  }
  __name(buildSnapshot, "buildSnapshot");
  function lineupPeriodStart(now, twiceWeekly) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = start.getDay();
    const toMonday = (day + 6) % 7;
    if (twiceWeekly && day >= 5) {
      start.setDate(start.getDate() - (day - 5));
    } else if (twiceWeekly && day === 0) {
      start.setDate(start.getDate() - 2);
    } else {
      start.setDate(start.getDate() - toMonday);
    }
    return start;
  }
  __name(lineupPeriodStart, "lineupPeriodStart");

  // src/content/lineup_status.ts
  function localDateIso() {
    const date = /* @__PURE__ */ new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  __name(localDateIso, "localDateIso");
  function isPitcherRow(row) {
    return row.currentSlot === "P" || row.eligiblePositions.length > 0 && row.eligiblePositions.every((position2) => position2 === "P");
  }
  __name(isPitcherRow, "isPitcherRow");
  function lineupKey(row) {
    return `${row.normalizedName}|${row.normalizedTeam ?? ""}`;
  }
  __name(lineupKey, "lineupKey");
  function currentSeasonYear() {
    return (/* @__PURE__ */ new Date()).getFullYear();
  }
  __name(currentSeasonYear, "currentSeasonYear");
  function dateLabelToIso(label) {
    const match = label.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!match) {
      return void 0;
    }
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (!Number.isFinite(month) || !Number.isFinite(day)) {
      return void 0;
    }
    return `${currentSeasonYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  __name(dateLabelToIso, "dateLabelToIso");
  function buildHandIndicator(probables) {
    if (!probables || probables.length === 0) {
      return void 0;
    }
    const source = probables.some((p) => p.source === "mlb") ? "mlb" : probables[0]?.source;
    const hands = Array.from(new Set(probables.map((probable) => probable.hand)));
    if (hands.length === 1) {
      const hand = hands[0] ?? "R";
      return {
        label: `${hand}HP`,
        detail: probables.length === 1 ? `${probables[0]?.name} (${hand}) ${probables[0]?.projected ? "projected by RotoWire" : "probable starter"}` : `${probables.map((probable) => `${probable.name} (${probable.hand})${probable.projected ? " projected" : ""}`).join(", ")}`,
        tone: hand === "L" ? "left" : "right",
        source,
        gameCount: probables.length,
        games: probables.map((probable) => ({
          hand: probable.hand,
          detail: `${probable.name} (${probable.hand})${probable.projected ? " projected" : ""}`
        }))
      };
    }
    return {
      label: "L/R",
      detail: probables.map((probable) => `${probable.name} (${probable.hand})${probable.projected ? " projected" : ""}`).join(", "),
      tone: "mixed",
      source,
      gameCount: probables.length,
      games: probables.map((probable) => ({
        hand: probable.hand,
        detail: `${probable.name} (${probable.hand})${probable.projected ? " projected" : ""}`
      }))
    };
  }
  __name(buildHandIndicator, "buildHandIndicator");
  async function fetchJson2(url) {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.fetchJson, url });
    if (!response?.ok) {
      throw new Error(typeof response?.error === "string" ? response.error : `Fetch failed for ${url}`);
    }
    return response.payload;
  }
  __name(fetchJson2, "fetchJson");
  function appendSnapshot(store, team, snapshot) {
    const normalizedTeam = normalizeTeam(team);
    if (!normalizedTeam) {
      return;
    }
    const existing = store.get(normalizedTeam) ?? [];
    existing.push(snapshot);
    existing.sort((left, right) => left.gameIndex - right.gameIndex);
    store.set(normalizedTeam, existing);
  }
  __name(appendSnapshot, "appendSnapshot");
  function resolveBubble(row, snapshots, hasGameToday) {
    if (!row.normalizedTeam || !snapshots || snapshots.length === 0) {
      return hasGameToday ? { label: "No LU", detail: "Team lineup has not been posted yet", tone: "pending" } : { label: "Off", detail: "No MLB game scheduled today", tone: "off" };
    }
    const multipleGames = snapshots.length > 1;
    for (const snapshot of snapshots) {
      const order = snapshot.starters.get(row.normalizedName);
      if (!order) {
        continue;
      }
      return {
        label: String(order),
        detail: multipleGames ? `Starting in game ${snapshot.gameIndex}, batting ${order}` : `Starting in today's lineup, batting ${order}`,
        tone: "in"
      };
    }
    const postedGame = snapshots.find((snapshot) => snapshot.hasPostedLineup);
    if (postedGame) {
      return {
        label: "X",
        detail: multipleGames ? `Not in the posted starting lineup for game ${postedGame.gameIndex}` : "Not in the posted starting lineup",
        tone: "out"
      };
    }
    return {
      label: "No LU",
      detail: "Team lineup has not been posted yet",
      tone: "pending"
    };
  }
  __name(resolveBubble, "resolveBubble");
  var snapshotCodec = {
    encode: /* @__PURE__ */ __name((value) => ({
      s: Array.from(value.snapshots, ([team, list]) => [team, list.map((x) => [x.gameIndex, x.hasPostedLineup, Array.from(x.starters)])]),
      w: Array.from(value.withGameToday)
    }), "encode"),
    decode: /* @__PURE__ */ __name((raw) => {
      const r = raw ?? {};
      return {
        snapshots: new Map((r.s ?? []).map(([team, list]) => [
          team,
          list.map(([gameIndex, hasPostedLineup, starters]) => ({ gameIndex, hasPostedLineup, starters: new Map(starters) }))
        ])),
        withGameToday: new Set(r.w ?? [])
      };
    }, "decode")
  };
  var teamSnapshotsCached = persistentCacheByKey(
    2 * MINUTES,
    "lineups",
    // Keyed by date as well as clubs, so a tab left open overnight can never be
    // served yesterday's lineups.
    (key) => loadTeamSnapshots(key.split("|").slice(1)),
    snapshotCodec
  );
  async function fetchLineupBubbles(rows) {
    const hitterRows = rows.filter((row) => !isPitcherRow(row) && row.normalizedName && row.normalizedTeam);
    if (hitterRows.length === 0) return /* @__PURE__ */ new Map();
    const teams = Array.from(new Set(hitterRows.map((row) => row.normalizedTeam))).sort();
    if (teams.length === 0) return /* @__PURE__ */ new Map();
    const { snapshots, withGameToday } = await teamSnapshotsCached(`${localDateIso()}|${teams.join("|")}`);
    const bubbles = /* @__PURE__ */ new Map();
    hitterRows.forEach((row) => {
      const team = row.normalizedTeam ?? "";
      bubbles.set(lineupKey(row), resolveBubble(row, snapshots.get(team), withGameToday.has(team)));
    });
    return bubbles;
  }
  __name(fetchLineupBubbles, "fetchLineupBubbles");
  async function loadTeamSnapshots(teams) {
    const empty = { snapshots: /* @__PURE__ */ new Map(), withGameToday: /* @__PURE__ */ new Set() };
    try {
      const schedule = await fetchJson2(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${localDateIso()}&hydrate=team`
      );
      const games = schedule.dates?.flatMap((date) => date.games ?? []) ?? [];
      const relevantGames = /* @__PURE__ */ new Map();
      games.forEach((game) => {
        if (!game.link) {
          return;
        }
        const away = normalizeTeam(game.teams?.away?.team?.abbreviation);
        const home = normalizeTeam(game.teams?.home?.team?.abbreviation);
        if (away && teams.includes(away) || home && teams.includes(home)) {
          relevantGames.set(game.link, game);
        }
      });
      const teamsWithGameToday = /* @__PURE__ */ new Set();
      relevantGames.forEach((game) => {
        const away = normalizeTeam(game.teams?.away?.team?.abbreviation);
        const home = normalizeTeam(game.teams?.home?.team?.abbreviation);
        if (away) teamsWithGameToday.add(away);
        if (home) teamsWithGameToday.add(home);
      });
      const feeds = await Promise.all(
        Array.from(relevantGames.values()).map(async (game, index) => {
          try {
            const feed = await fetchJson2(`https://statsapi.mlb.com${game.link}`);
            return { feed, gameIndex: index + 1 };
          } catch {
            return void 0;
          }
        })
      );
      const snapshotsByTeam = /* @__PURE__ */ new Map();
      feeds.forEach((entry) => {
        if (!entry) return;
        const { feed, gameIndex } = entry;
        appendSnapshot(snapshotsByTeam, feed.gameData?.teams?.away?.abbreviation, buildSnapshot(feed.liveData?.boxscore?.teams?.away, gameIndex, normalizeName));
        appendSnapshot(snapshotsByTeam, feed.gameData?.teams?.home?.abbreviation, buildSnapshot(feed.liveData?.boxscore?.teams?.home, gameIndex, normalizeName));
      });
      return { snapshots: snapshotsByTeam, withGameToday: teamsWithGameToday };
    } catch (error) {
      console.warn("NFBC lineup-status fetch failed", error);
      return empty;
    }
  }
  __name(loadTeamSnapshots, "loadTeamSnapshots");
  async function fetchFreshIlFlags(rows) {
    const out = /* @__PURE__ */ new Map();
    const named = rows.filter((row) => row.normalizedName && row.normalizedTeam);
    if (named.length === 0) {
      return out;
    }
    try {
      const now = /* @__PURE__ */ new Date();
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const iso = /* @__PURE__ */ __name((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, "iso");
      const txs = await fetchJson2(
        `https://statsapi.mlb.com/api/v1/transactions?startDate=${iso(yesterday)}&endDate=${iso(now)}`
      );
      const placements = parseIlPlacements(txs);
      if (placements.length === 0) {
        return out;
      }
      const teams = await fetchJson2(
        "https://statsapi.mlb.com/api/v1/teams?sportId=1"
      );
      const abbrevById = /* @__PURE__ */ new Map();
      for (const team of teams.teams ?? []) {
        if (team.id != null && team.abbreviation) {
          abbrevById.set(team.id, normalizeTeam(team.abbreviation) ?? team.abbreviation);
        }
      }
      const byKey = /* @__PURE__ */ new Map();
      for (const placement of placements) {
        const team = placement.teamId != null ? abbrevById.get(placement.teamId) ?? "" : "";
        byKey.set(`${normalizeName(placement.name)}|${team}`, {
          date: placement.date,
          description: placement.description
        });
      }
      named.forEach((row) => {
        const flag = byKey.get(`${row.normalizedName}|${row.normalizedTeam ?? ""}`);
        if (flag) {
          out.set(lineupKey(row), flag);
        }
      });
    } catch (error) {
      console.warn("NFBC IL-flag fetch failed", error);
    }
    return out;
  }
  __name(fetchFreshIlFlags, "fetchFreshIlFlags");
  async function fetchScheduleHandIndicators(rows, dateLabels) {
    const hitterRows = rows.filter((row) => !isPitcherRow(row) && row.normalizedName && row.normalizedTeam);
    const activeDates = dateLabels.map((label) => ({ label, iso: dateLabelToIso(label) })).filter((item) => Boolean(item.iso));
    if (hitterRows.length === 0 || activeDates.length === 0) {
      return /* @__PURE__ */ new Map();
    }
    try {
      const teams = Array.from(new Set(hitterRows.map((row) => row.normalizedTeam).filter((team) => Boolean(team))));
      const [probableMap, actualMap] = await Promise.all([
        fetchOpposingProbablesByTeamDate(teams),
        fetchActualStarterHands(teams, activeDates.map((date) => date.iso)).catch(() => /* @__PURE__ */ new Map())
      ]);
      const indicators = /* @__PURE__ */ new Map();
      hitterRows.forEach((row) => {
        const team = row.normalizedTeam;
        if (!team) {
          return;
        }
        const probableByDate = probableMap.get(team);
        const actualByDate = actualMap.get(team);
        if (!probableByDate && !actualByDate) {
          return;
        }
        const rowIndicators = /* @__PURE__ */ new Map();
        activeDates.forEach(({ label, iso }) => {
          const indicator = buildHandIndicator(probableByDate?.get(iso) ?? actualByDate?.get(iso));
          if (indicator) {
            rowIndicators.set(label, indicator);
          }
        });
        if (rowIndicators.size > 0) {
          indicators.set(lineupKey(row), rowIndicators);
        }
      });
      return indicators;
    } catch (error) {
      console.warn("NFBC schedule-handedness fetch failed", error);
      return /* @__PURE__ */ new Map();
    }
  }
  __name(fetchScheduleHandIndicators, "fetchScheduleHandIndicators");
  async function fetchOwnStartConfirmations(rows, dateLabels) {
    const pitcherRows = rows.filter((row) => isPitcherRow(row) && row.normalizedName && row.normalizedTeam);
    const activeDates = dateLabels.map((label) => ({ label, iso: dateLabelToIso(label) })).filter((item) => Boolean(item.iso));
    if (pitcherRows.length === 0 || activeDates.length === 0) {
      return /* @__PURE__ */ new Map();
    }
    try {
      const teams = Array.from(new Set(pitcherRows.map((row) => row.normalizedTeam).filter((team) => Boolean(team))));
      const ownMap = await fetchOwnProbablesByTeamDate(teams);
      const confirmations = /* @__PURE__ */ new Map();
      pitcherRows.forEach((row) => {
        const byDate = row.normalizedTeam ? ownMap.get(row.normalizedTeam) : void 0;
        if (!byDate) {
          return;
        }
        const rowLoose = looseName(row.normalizedName ?? "");
        const rowDates = /* @__PURE__ */ new Map();
        activeDates.forEach(({ label, iso }) => {
          const mine = byDate.get(iso)?.find((probable) => {
            const pn = normalizeName(probable.name);
            return pn === row.normalizedName || looseName(pn) === rowLoose;
          });
          if (mine) {
            rowDates.set(label, mine.hand);
          }
        });
        if (rowDates.size > 0) {
          confirmations.set(lineupKey(row), rowDates);
        }
      });
      return confirmations;
    } catch (error) {
      console.warn("NFBC own-probable confirmation fetch failed", error);
      return /* @__PURE__ */ new Map();
    }
  }
  __name(fetchOwnStartConfirmations, "fetchOwnStartConfirmations");

  // src/core/slot_assignment.ts
  function buildMatrix(candidates) {
    const players = [...new Set(candidates.map((candidate) => candidate.playerKey))];
    const slots = [...new Set(candidates.map((candidate) => candidate.slotId))];
    const weights = players.map(() => slots.map(() => Number.NEGATIVE_INFINITY));
    for (const candidate of candidates) {
      const i = players.indexOf(candidate.playerKey);
      const j = slots.indexOf(candidate.slotId);
      weights[i][j] = candidate.weight;
    }
    return { players, slots, weights };
  }
  __name(buildMatrix, "buildMatrix");
  function solveMaximumWeightAssignment(candidates) {
    if (candidates.length === 0) {
      return { totalWeight: 0, assignments: [] };
    }
    const { players, slots, weights } = buildMatrix(candidates);
    const size = Math.max(players.length, slots.length);
    const scale = candidates.reduce((max, candidate) => Number.isFinite(candidate.weight) ? Math.max(max, Math.abs(candidate.weight)) : max, 1);
    const maxWeight = candidates.reduce((max, candidate) => Number.isFinite(candidate.weight) ? Math.max(max, candidate.weight / scale) : max, 0);
    const forbiddenCost = 2 * size + 1;
    const cost = Array.from({ length: size + 1 }, () => Array(size + 1).fill(0));
    for (let i = 0; i < players.length; i += 1) {
      for (let j = 0; j < slots.length; j += 1) {
        const weight = weights[i][j];
        cost[i + 1][j + 1] = Number.isFinite(weight) ? maxWeight - weight / scale : forbiddenCost;
      }
    }
    const u = Array(size + 1).fill(0);
    const v = Array(size + 1).fill(0);
    const p = Array(size + 1).fill(0);
    const way = Array(size + 1).fill(0);
    for (let i = 1; i <= size; i += 1) {
      p[0] = i;
      let j0 = 0;
      const minv = Array(size + 1).fill(Infinity);
      const used = Array(size + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = Infinity;
        let j1 = 0;
        for (let j = 1; j <= size; j += 1) {
          if (used[j]) {
            continue;
          }
          const cur = cost[i0][j] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
        for (let j = 0; j <= size; j += 1) {
          if (used[j]) {
            u[p[j]] += delta;
            v[j] -= delta;
          } else {
            minv[j] -= delta;
          }
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0 !== 0);
    }
    const assignments = [];
    let totalWeight = 0;
    for (let j = 1; j <= size; j += 1) {
      const i = p[j];
      if (i === 0 || i > players.length || j > slots.length) {
        continue;
      }
      const weight = weights[i - 1][j - 1];
      if (!Number.isFinite(weight)) {
        continue;
      }
      assignments.push({
        playerKey: players[i - 1],
        slotId: slots[j - 1],
        weight
      });
      totalWeight += weight;
    }
    return { totalWeight, assignments };
  }
  __name(solveMaximumWeightAssignment, "solveMaximumWeightAssignment");
  function normalizedSlotLabel(label) {
    return label.trim().toUpperCase();
  }
  __name(normalizedSlotLabel, "normalizedSlotLabel");
  function isEligibleForSlot(positions, slot) {
    if (slot.group === "bench") {
      return true;
    }
    if (slot.group === "pitcher") {
      return positions.includes("P");
    }
    const pos = slot.normalizedLabel;
    if (positions.includes(pos)) return true;
    if (pos === "UT") return positions.some((entry) => entry !== "P");
    if (pos === "CI") return positions.some((entry) => ["1B", "3B"].includes(entry));
    if (pos === "MI") return positions.some((entry) => ["2B", "SS"].includes(entry));
    if (pos === "OF") return positions.includes("OF");
    return false;
  }
  __name(isEligibleForSlot, "isEligibleForSlot");

  // src/content/lineup_parser.ts
  function parsePlayerIdFromHref(href) {
    if (!href) return void 0;
    const match = href.match(/\/player\/baseball\/(\d+)/);
    return match?.[1];
  }
  __name(parsePlayerIdFromHref, "parsePlayerIdFromHref");
  function parsePlayerNameFromHref(href) {
    if (!href) return void 0;
    const slug = href.split("/").at(-1);
    if (!slug) return void 0;
    return decodeURIComponent(slug).replace(/\+/g, " ");
  }
  __name(parsePlayerNameFromHref, "parsePlayerNameFromHref");
  function detectPeriodFromText(value) {
    const normalized = value.toUpperCase();
    if (normalized.includes("MON") && normalized.includes("THU")) return "MON_THU";
    if (normalized.includes("FRI") && normalized.includes("SUN")) return "FRI_SUN";
    if (normalized.includes("WEEK")) return "WEEKLY";
    return "UNKNOWN";
  }
  __name(detectPeriodFromText, "detectPeriodFromText");
  function parseSetLineupRoster() {
    const cards = Array.from(document.querySelectorAll(".Player[data-can-set-lineup='1']"));
    return cards.map((card, index) => {
      const slotButton = card.querySelector("button[title]");
      const playerLink = card.querySelector("a[href*='/player/baseball/']");
      const playerName = (parsePlayerNameFromHref(playerLink?.getAttribute("href") ?? null) ?? card.querySelector(".PlayerName")?.textContent ?? playerLink?.textContent ?? "").replace(/\s+/g, " ").trim();
      const nameSubtree = playerLink ?? card.querySelector(".PlayerName");
      const rawTeam = Array.from(card.querySelectorAll("span")).filter((node) => !(nameSubtree && nameSubtree.contains(node))).map((node) => node.textContent?.trim() ?? "").find((text2) => isTeamAbbrev(text2));
      const sub = card.querySelector(".position .sub")?.textContent?.replace(/[()]/g, "") ?? "";
      const currentSlot = slotButton?.querySelector(".pos")?.textContent?.trim() ?? "BN";
      const title = slotButton?.getAttribute("title") ?? "";
      const injuryStatus = (card.querySelector("[class*='InjuryText']")?.textContent ?? card.querySelector("[class*='InjuryText']")?.getAttribute("title") ?? "").replace(/\s+/g, " ").trim() || void 0;
      return {
        pagePlayerId: parsePlayerIdFromHref(playerLink?.getAttribute("href") ?? null),
        playerName,
        normalizedName: normalizeName(playerName),
        mlbTeam: rawTeam,
        normalizedTeam: normalizeTeam(rawTeam),
        eligiblePositions: sub ? normalizePositionList(sub) : [currentSlot],
        currentSlot,
        isBench: currentSlot === "BN",
        isActive: currentSlot !== "BN",
        // NFBC has used "Team Locked" and shorter "Locked" copy; treat any lock title.
        isLocked: /lock/i.test(title) && !/set position/i.test(title),
        injuryStatus,
        rowElementKey: `setlineup:${parsePlayerIdFromHref(playerLink?.getAttribute("href") ?? null) ?? index}`,
        slotControlSelector: `.Player[data-can-set-lineup='1']:nth-of-type(${index + 1}) button[title]`
      };
    });
  }
  __name(parseSetLineupRoster, "parseSetLineupRoster");
  function parseSetLineupSlots(rows) {
    const slotCounts = /* @__PURE__ */ new Map();
    return rows.filter((row) => row.isActive).map((row) => {
      const nextCount = (slotCounts.get(row.currentSlot) ?? 0) + 1;
      slotCounts.set(row.currentSlot, nextCount);
      return {
        id: `${row.currentSlot}::${nextCount}`,
        label: row.currentSlot,
        normalizedLabel: normalizedSlotLabel(row.currentSlot),
        group: row.currentSlot === "P" ? "pitcher" : "hitter"
      };
    });
  }
  __name(parseSetLineupSlots, "parseSetLineupSlots");
  function parseSetLineupAllRoster(block) {
    const root = block ?? document.querySelector("[id^='tl_']");
    if (!root) return [];
    const teamId = root.id.replace(/^tl_/, "");
    const leagueLabel = root.querySelector(".league_name > div")?.textContent ?? "";
    const leagueId = leagueLabel.match(/#(\d+)/)?.[1];
    const rows = Array.from(root.querySelectorAll("tr"));
    return rows.map((row, index) => {
      const select = row.querySelector("select.lineup_position");
      const hiddenPosition = row.querySelector(`input[type='hidden'].position_${teamId}[data-player_id]`);
      const control = select ?? hiddenPosition;
      if (!control) return null;
      const link = row.querySelector("a[href*='/player/baseball/']");
      const name = (row.querySelector(".player_names")?.getAttribute("data-name") ?? row.querySelector(".player_names")?.textContent ?? link?.textContent ?? "").trim();
      const team = row.children[2]?.textContent?.trim() ?? void 0;
      const currentSlot = select?.value ?? hiddenPosition?.value ?? "Bench";
      const eligiblePositions = select ? Array.from(select.options).map((option) => option.value).filter((value) => value !== "Bench") : currentSlot === "Bench" ? [] : [currentSlot];
      const playerId = select?.dataset.player_id ?? hiddenPosition?.dataset.player_id;
      return {
        pagePlayerId: playerId,
        teamId,
        leagueId,
        containerId: root.id,
        playerName: name,
        normalizedName: normalizeName(name),
        mlbTeam: team,
        normalizedTeam: normalizeTeam(team),
        eligiblePositions,
        currentSlot,
        isBench: currentSlot === "Bench",
        isActive: currentSlot !== "Bench",
        isLocked: select ? select.disabled : true,
        rowElementKey: `setlineupall:${teamId}:${playerId ?? index}`,
        slotControlSelector: select ? `#${root.id} select.lineup_position[data-player_id='${playerId ?? ""}']` : void 0
      };
    }).filter((row) => row !== null);
  }
  __name(parseSetLineupAllRoster, "parseSetLineupAllRoster");
  function parseSetLineupAllSlots(rows) {
    const slotCounts = /* @__PURE__ */ new Map();
    return rows.filter((row) => row.isActive).map((row) => {
      const nextCount = (slotCounts.get(row.currentSlot) ?? 0) + 1;
      slotCounts.set(row.currentSlot, nextCount);
      return {
        id: `${row.currentSlot}::${nextCount}`,
        label: row.currentSlot,
        normalizedLabel: normalizedSlotLabel(row.currentSlot),
        group: row.currentSlot === "P" ? "pitcher" : "hitter"
      };
    });
  }
  __name(parseSetLineupAllSlots, "parseSetLineupAllSlots");

  // src/core/projection_confidence.ts
  function impliedPlayerGames(projection) {
    const pa = projection.stats.PA ?? 0;
    const ab = projection.stats.AB ?? 0;
    const paEstimate = pa > 0 ? pa / 4.2 : 0;
    const abEstimate = ab > 0 ? ab / 3.8 : 0;
    return Math.max(paEstimate, abEstimate, 0);
  }
  __name(impliedPlayerGames, "impliedPlayerGames");
  function estimateProjectedGamesByTeam(projections) {
    const byTeam = /* @__PURE__ */ new Map();
    const explicitByTeam = /* @__PURE__ */ new Map();
    projections.forEach((projection) => {
      if (!projection.isHitter || projection.isPitcher || !projection.normalizedTeam) {
        return;
      }
      if (projection.teamGames != null && Number.isFinite(projection.teamGames) && projection.teamGames > 0) {
        const explicit = explicitByTeam.get(projection.normalizedTeam) ?? [];
        explicit.push(projection.teamGames);
        explicitByTeam.set(projection.normalizedTeam, explicit);
      }
      const impliedGames = impliedPlayerGames(projection);
      if (impliedGames <= 0) {
        return;
      }
      const current = byTeam.get(projection.normalizedTeam) ?? [];
      current.push(impliedGames);
      byTeam.set(projection.normalizedTeam, current);
    });
    const estimates = /* @__PURE__ */ new Map();
    const teams = /* @__PURE__ */ new Set([...byTeam.keys(), ...explicitByTeam.keys()]);
    teams.forEach((team) => {
      const explicit = explicitByTeam.get(team);
      if (explicit?.length) {
        const ordered = [...explicit].sort((left, right) => left - right);
        estimates.set(team, Math.round(ordered[Math.floor(ordered.length / 2)]));
        return;
      }
      const values = byTeam.get(team) ?? [];
      const top = values.sort((left, right) => right - left).slice(0, 3);
      if (top.length === 0) {
        return;
      }
      const mean = top.reduce((sum, value) => sum + value, 0) / top.length;
      estimates.set(team, Math.max(0, Math.round(mean)));
    });
    return estimates;
  }
  __name(estimateProjectedGamesByTeam, "estimateProjectedGamesByTeam");
  function evaluateProjectionFreshness(projections, scheduledGamesByTeam2) {
    const projectedGamesByTeam = estimateProjectedGamesByTeam(projections);
    const checkedTeams = Array.from(scheduledGamesByTeam2.keys()).filter((team) => projectedGamesByTeam.has(team)).length;
    if (checkedTeams === 0) {
      return {
        tone: "watch",
        checkedTeams: 0,
        mismatchedTeams: [],
        summary: "Projection freshness unavailable"
      };
    }
    const mismatchedTeams = Array.from(scheduledGamesByTeam2.entries()).flatMap(([team, scheduledGames]) => {
      const projectedGames = projectedGamesByTeam.get(team);
      if (projectedGames == null) {
        return [];
      }
      const difference = Math.abs(projectedGames - scheduledGames);
      return difference >= 2 ? [{ team, scheduledGames, projectedGames, difference }] : [];
    }).sort((left, right) => right.difference - left.difference || left.team.localeCompare(right.team));
    const mismatchRatio = mismatchedTeams.length / checkedTeams;
    const tone = mismatchedTeams.length >= 6 || mismatchRatio >= 0.22 ? "low" : mismatchedTeams.length >= 3 || mismatchRatio >= 0.12 ? "watch" : "fresh";
    const sample = mismatchedTeams.slice(0, 4).map((item) => `${item.team} ${item.projectedGames}/${item.scheduledGames}`).join(", ");
    return {
      tone,
      checkedTeams,
      mismatchedTeams,
      summary: tone === "fresh" ? `Projection freshness looks aligned with schedule (${checkedTeams} teams checked)` : `Schedule mismatch suggests projections may be stale (${mismatchedTeams.length}/${checkedTeams} teams, ${sample})`
    };
  }
  __name(evaluateProjectionFreshness, "evaluateProjectionFreshness");

  // src/content/projection_confidence.ts
  var MONTH_INDEX = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11
  };
  async function fetchJson3(url) {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.fetchJson, url });
    if (!response?.ok) {
      throw new Error(typeof response?.error === "string" ? response.error : `Fetch failed for ${url}`);
    }
    return response.payload;
  }
  __name(fetchJson3, "fetchJson");
  function toIso(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  __name(toIso, "toIso");
  function startOfWeekMonday(date) {
    const copy = new Date(date);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  __name(startOfWeekMonday, "startOfWeekMonday");
  function defaultDateRange(period, now = /* @__PURE__ */ new Date()) {
    const weekStart = startOfWeekMonday(now);
    if (period === "WEEKLY") {
      const end2 = new Date(weekStart);
      end2.setDate(end2.getDate() + 6);
      return { start: toIso(weekStart), end: toIso(end2) };
    }
    if (period === "MON_THU") {
      const start2 = new Date(weekStart);
      if (now.getDay() === 5 || now.getDay() === 6 || now.getDay() === 0) {
        start2.setDate(start2.getDate() + 7);
      }
      const end2 = new Date(start2);
      end2.setDate(end2.getDate() + 3);
      return { start: toIso(start2), end: toIso(end2) };
    }
    const start = new Date(weekStart);
    start.setDate(start.getDate() + 4);
    if (now.getDay() >= 1 && now.getDay() <= 4) {
      return { start: toIso(start), end: toIso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 2)) };
    }
    if (now.getDay() === 0) {
      start.setDate(start.getDate() + 7);
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    return { start: toIso(start), end: toIso(end) };
  }
  __name(defaultDateRange, "defaultDateRange");
  function parseDateRangeFromLabel(label, now = /* @__PURE__ */ new Date()) {
    const match = label.match(
      /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2})(?:st|nd|rd|th)?\s*-\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Za-z]{3})\s+(\d{1,2})(?:st|nd|rd|th)?/i
    );
    if (!match) {
      return void 0;
    }
    const [, startMonthToken, startDayToken, endMonthToken, endDayToken] = match;
    const startMonth = MONTH_INDEX[startMonthToken.slice(0, 3).toUpperCase()];
    const endMonth = MONTH_INDEX[endMonthToken.slice(0, 3).toUpperCase()];
    const startDay = Number(startDayToken);
    const endDay = Number(endDayToken);
    if ([startMonth, endMonth, startDay, endDay].some((value) => !Number.isFinite(value))) {
      return void 0;
    }
    const year = now.getFullYear();
    const start = new Date(year, startMonth, startDay);
    const endYear = endMonth < startMonth ? year + 1 : year;
    const end = new Date(endYear, endMonth, endDay);
    return { start: toIso(start), end: toIso(end) };
  }
  __name(parseDateRangeFromLabel, "parseDateRangeFromLabel");
  async function scheduledGamesByTeam(range) {
    const schedule = await fetchJson3(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${range.start}&endDate=${range.end}&hydrate=team`
    );
    const gamesByTeam = /* @__PURE__ */ new Map();
    for (const date of schedule.dates ?? []) {
      for (const game of date.games ?? []) {
        const away = normalizeTeam(game.teams?.away?.team?.abbreviation);
        const home = normalizeTeam(game.teams?.home?.team?.abbreviation);
        if (away) {
          gamesByTeam.set(away, (gamesByTeam.get(away) ?? 0) + 1);
        }
        if (home) {
          gamesByTeam.set(home, (gamesByTeam.get(home) ?? 0) + 1);
        }
      }
    }
    return gamesByTeam;
  }
  __name(scheduledGamesByTeam, "scheduledGamesByTeam");
  async function buildProjectionFreshnessReport(period, projections, rangeLabel, explicitRange) {
    try {
      const range = explicitRange ?? (rangeLabel ? parseDateRangeFromLabel(rangeLabel) : void 0) ?? defaultDateRange(period);
      const games = await scheduledGamesByTeam(range);
      return evaluateProjectionFreshness(projections, games);
    } catch (error) {
      console.warn("NFBC projection freshness check failed", error);
      return {
        tone: "watch",
        checkedTeams: 0,
        mismatchedTeams: [],
        summary: "Projection freshness unavailable"
      };
    }
  }
  __name(buildProjectionFreshnessReport, "buildProjectionFreshnessReport");

  // src/core/engine_loader.ts
  function isEngineDocument(text2) {
    const head = text2.trimStart();
    return head.startsWith("{") && head.includes("nfbc-engine");
  }
  __name(isEngineDocument, "isEngineDocument");
  function toRecord(period, player, isPitcher) {
    const stats = player.stats ?? {};
    const num2 = /* @__PURE__ */ __name((key) => {
      const value = stats[key];
      return typeof value === "number" && Number.isFinite(value) ? value : void 0;
    }, "num");
    const num22 = /* @__PURE__ */ __name((source, key) => {
      const value = source?.[key];
      return typeof value === "number" && Number.isFinite(value) ? value : void 0;
    }, "num2");
    return {
      mlbamId: typeof player.mlbam_id === "number" ? player.mlbam_id : typeof player.player_id === "number" ? player.player_id : void 0,
      sourcePeriod: period,
      playerName: player.name,
      normalizedName: normalizeName(player.name),
      team: player.team ?? "",
      normalizedTeam: normalizeTeam(player.team),
      positions: normalizePositionList(player.pos ?? (isPitcher ? "P" : "UT")),
      isHitter: !isPitcher,
      isPitcher,
      // the row-pill value: this period's engine SGP plus its 80% band
      periodValue: typeof player.decision_sgp === "number" ? player.decision_sgp : typeof player.sgp === "number" ? player.sgp : void 0,
      periodP10: typeof player.decision_sgp_p10 === "number" ? player.decision_sgp_p10 : typeof player.sgp_p10 === "number" ? player.sgp_p10 : void 0,
      periodP90: typeof player.decision_sgp_p90 === "number" ? player.decision_sgp_p90 : typeof player.sgp_p90 === "number" ? player.sgp_p90 : void 0,
      startsProjected: isPitcher && typeof player.n_starts === "number" ? player.n_starts : void 0,
      confirmedStarts: isPitcher && typeof player.confirmed_starts === "number" ? player.confirmed_starts : !isPitcher && player.hitter_games ? player.hitter_games.filter((g) => g.confirmed && g.p_start > 0).length : void 0,
      inferredStarts: isPitcher && typeof player.inferred_starts === "number" ? player.inferred_starts : void 0,
      startDetails: isPitcher && Array.isArray(player.starts) ? player.starts : void 0,
      expectedPa: !isPitcher && typeof player.expected_pa === "number" ? player.expected_pa : num2("PA"),
      hitterGames: !isPitcher ? player.hitter_games : void 0,
      confirmedReturn: !isPitcher ? player.confirmed_return : void 0,
      // Chance of at least one steal across the period, opposing battery included.
      stealProbability: !isPitcher && typeof player.sb_prob === "number" ? player.sb_prob : void 0,
      stealPitcherContext: !isPitcher ? player.sb_pitcher_context : void 0,
      // Games in the period — count dispersion scales with it, so a 4-game week
      // is not modelled with a 3-game week's clustering.
      teamGames: typeof player.team_games === "number" ? player.team_games : void 0,
      expectedStarts: !isPitcher && typeof player.expected_starts === "number" ? player.expected_starts : void 0,
      scheduleDelta: !isPitcher && typeof player.schedule_delta === "number" ? player.schedule_delta : void 0,
      rosSchedule: !isPitcher && player.ros_schedule ? {
        games: typeof player.ros_schedule.games === "number" ? player.ros_schedule.games : void 0,
        vsLhp: typeof player.ros_schedule.vs_lhp === "number" ? player.ros_schedule.vs_lhp : void 0,
        vsRhp: typeof player.ros_schedule.vs_rhp === "number" ? player.ros_schedule.vs_rhp : void 0,
        opponentKbbZ: typeof player.ros_schedule.opp_kbb_z === "number" ? player.ros_schedule.opp_kbb_z : void 0,
        confidence: typeof player.ros_schedule.confidence === "number" ? player.ros_schedule.confidence : void 0,
        posted: player.ros_schedule.posted,
        grid: player.ros_schedule.grid,
        inferred: player.ros_schedule.inferred
      } : void 0,
      roleBucket: !isPitcher ? typeof player.role_bucket === "string" ? player.role_bucket : typeof player.role === "string" ? player.role : void 0 : void 0,
      availabilityStatus: player.availability_status,
      actionable: typeof player.actionable === "boolean" ? player.actionable : void 0,
      recommendationTier: typeof player.recommendation_tier === "string" ? player.recommendation_tier : typeof player.actionable_tier === "string" ? player.actionable_tier : void 0,
      recommendationReasons: Array.isArray(player.recommendation_reasons) ? player.recommendation_reasons : typeof player.status_reason === "string" ? [player.status_reason] : void 0,
      callupFlat: !isPitcher && player.callup_flat === 1 ? true : void 0,
      topProspectPtBump: !isPitcher && player.top_prospect_pt_bump === 1 ? true : void 0,
      topProspectPtFloor: !isPitcher && typeof player.top_prospect_pt_floor === "number" ? player.top_prospect_pt_floor : void 0,
      topProspectBaseShare: !isPitcher && typeof player.top_prospect_base_share === "number" ? player.top_prospect_base_share : void 0,
      firstGame: !isPitcher && player.g1?.date && typeof player.g1.sgp === "number" ? {
        date: player.g1.date,
        sgp: player.g1.sgp,
        stats: {
          PA: num22(player.g1.stats, "PA"),
          AB: num22(player.g1.stats, "AB"),
          R: num22(player.g1.stats, "R"),
          H: num22(player.g1.stats, "H"),
          HR: num22(player.g1.stats, "HR"),
          RBI: num22(player.g1.stats, "RBI"),
          SB: num22(player.g1.stats, "SB")
        }
      } : void 0,
      stats: isPitcher ? {
        IP: num2("IP"),
        W: num2("W"),
        SV: num2("SV"),
        K_pitch: num2("K_pitch"),
        ER: num2("ER"),
        HA: num2("HA"),
        BB_pitch: num2("BB_pitch") ?? 0
      } : {
        PA: num2("PA"),
        AB: num2("AB"),
        R: num2("R"),
        H: num2("H"),
        HR: num2("HR"),
        RBI: num2("RBI"),
        SB: num2("SB")
      },
      // Keep the model score available for diagnostics and category math audits;
      // periodValue is the calibrated score used for actual decisions.
      rawRow: {
        sgp: player.sgp,
        sgp_p10: player.sgp_p10,
        sgp_p90: player.sgp_p90,
        usage_guard: player.usage_guard
      }
    };
  }
  __name(toRecord, "toRecord");
  function recordKey(record) {
    return `${record.isPitcher ? "P" : "H"}|${record.normalizedName}|${record.normalizedTeam ?? ""}`;
  }
  __name(recordKey, "recordKey");
  function preferProjection(left, right) {
    if (left.isPitcher && right.isPitcher) {
      const leftStarts = left.startsProjected ?? 0;
      const rightStarts = right.startsProjected ?? 0;
      if (leftStarts !== rightStarts) {
        return rightStarts > leftStarts ? right : left;
      }
      return (right.periodValue ?? Number.NEGATIVE_INFINITY) > (left.periodValue ?? Number.NEGATIVE_INFINITY) ? right : left;
    }
    return left;
  }
  __name(preferProjection, "preferProjection");
  function dedupeRecords(records) {
    const byKey = /* @__PURE__ */ new Map();
    for (const record of records) {
      const key = recordKey(record);
      const existing = byKey.get(key);
      byKey.set(key, existing ? preferProjection(existing, record) : record);
    }
    return Array.from(byKey.values());
  }
  __name(dedupeRecords, "dedupeRecords");
  function parseEngineDocument(text2) {
    const doc = JSON.parse(text2);
    const out = {};
    for (const [period, data] of Object.entries(doc.periods ?? {})) {
      const p = period;
      const records = [];
      for (const hitter of data?.hitters ?? []) {
        records.push(toRecord(p, hitter, false));
      }
      for (const pitcher of data?.pitchers ?? []) {
        records.push(toRecord(p, pitcher, true));
      }
      if (records.length > 0) {
        out[p] = dedupeRecords(records);
      }
    }
    if (doc.periods && !("ROS" in doc.periods)) {
      out.ROS = [];
    }
    return out;
  }
  __name(parseEngineDocument, "parseEngineDocument");

  // src/core/freeagents_projection_store.ts
  function overlayNextWeekStore(current, next) {
    return {
      WEEKLY: next.WEEKLY && next.WEEKLY.length > 0 ? next.WEEKLY : current.WEEKLY,
      MON_THU: next.MON_THU && next.MON_THU.length > 0 ? next.MON_THU : [],
      FRI_SUN: next.FRI_SUN && next.FRI_SUN.length > 0 ? next.FRI_SUN : [],
      ROS: next.ROS && next.ROS.length > 0 ? next.ROS : current.ROS
    };
  }
  __name(overlayNextWeekStore, "overlayNextWeekStore");

  // src/content/lineup_store.ts
  function mondayOf(date) {
    const copy = new Date(date);
    const day = copy.getDay();
    copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  __name(mondayOf, "mondayOf");
  function labelIsFutureWeek(periodLabel, now = /* @__PURE__ */ new Date()) {
    const range = parseDateRangeFromLabel(periodLabel, now);
    if (!range) return false;
    return mondayOf(/* @__PURE__ */ new Date(`${range.start}T12:00:00`)) > mondayOf(now);
  }
  __name(labelIsFutureWeek, "labelIsFutureWeek");
  async function loadLineupStore(periodLabel) {
    const current = await getProjectionStore();
    if (!labelIsFutureWeek(periodLabel)) return current;
    try {
      const settings = await getSettings();
      const source = settings.projectionSources.WEEKLY;
      if (source.autoSync === false) {
        return current;
      }
      const urls = configuredProjectionUrls(source).map((u) => u.replace("projections.json", "projections_next.json"));
      for (const url of urls) {
        const resp = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.fetchText, url });
        if (!resp?.ok || typeof resp.payload !== "string" || !isEngineDocument(resp.payload)) continue;
        const byPeriod = parseEngineDocument(resp.payload);
        if (byPeriod.WEEKLY && byPeriod.WEEKLY.length > 0) {
          return overlayNextWeekStore(current, byPeriod);
        }
      }
    } catch (error) {
      console.warn("[NFBC] next-week projections unavailable; using current", error);
    }
    return current;
  }
  __name(loadLineupStore, "loadLineupStore");

  // src/content/overlay_ui.ts
  var STATUS_TONES = {
    info: "info",
    loading: "loading",
    success: "success",
    error: "error"
  };
  function ensureButton(role, label, tone) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.role = role;
    button.dataset.tone = tone;
    button.className = "nfbc-action-button";
    button.textContent = label;
    return button;
  }
  __name(ensureButton, "ensureButton");
  function createPanelRoot(id, classes) {
    const root = document.createElement("div");
    root.id = id;
    root.classList.add(...classes);
    return root;
  }
  __name(createPanelRoot, "createPanelRoot");
  function statusNode(text2 = "Idle") {
    const node = document.createElement("div");
    node.dataset.role = "status";
    node.className = "nfbc-panel-status";
    node.textContent = text2;
    node.dataset.tone = STATUS_TONES.info;
    return node;
  }
  __name(statusNode, "statusNode");
  function summaryNode() {
    const node = document.createElement("div");
    node.dataset.role = "summary";
    node.className = "nfbc-panel-summary";
    return node;
  }
  __name(summaryNode, "summaryNode");
  function ensurePanel(title) {
    const existing = document.getElementById("nfbc-extension-panel");
    if (existing) {
      return {
        root: existing,
        title: existing.querySelector("[data-role='title']"),
        status: existing.querySelector("[data-role='status']"),
        optimizeButton: existing.querySelector("[data-role='optimize']"),
        refreshButton: existing.querySelector("[data-role='refresh']"),
        summary: existing.querySelector("[data-role='summary']")
      };
    }
    const root = createPanelRoot("nfbc-extension-panel", ["nfbc-overlay-panel"]);
    const titleNode = document.createElement("div");
    titleNode.dataset.role = "title";
    titleNode.className = "nfbc-panel-title";
    titleNode.textContent = title;
    const actions = document.createElement("div");
    actions.className = "nfbc-panel-actions";
    const optimizeButton = ensureButton("optimize", "Optimize", "primary");
    const refreshButton = ensureButton("refresh", "Refresh", "secondary");
    actions.append(optimizeButton, refreshButton);
    const status = statusNode();
    const summary = summaryNode();
    root.append(titleNode, status, actions, summary);
    document.body.append(root);
    return { root, title: titleNode, status, optimizeButton, refreshButton, summary };
  }
  __name(ensurePanel, "ensurePanel");
  function ensureSetLineupShell(title) {
    const existing = document.getElementById("nfbc-setlineup-shell");
    if (existing) {
      return {
        root: existing,
        title: existing.querySelector("[data-role='title']"),
        subtitle: existing.querySelector("[data-role='subtitle']"),
        swaps: existing.querySelector("[data-role='swaps']"),
        optimizeButton: existing.querySelector("[data-role='optimize']"),
        refreshButton: existing.querySelector("[data-role='refresh']"),
        metrics: existing.querySelector("[data-role='metrics']"),
        strengthGrid: existing.querySelector("[data-role='strength-grid']"),
        toolbar: existing.querySelector("[data-role='toolbar']"),
        helpButton: existing.querySelector("[data-role='help-button']"),
        helpPanel: existing.querySelector("[data-role='help-panel']")
      };
    }
    const root = createPanelRoot("nfbc-setlineup-shell", ["nfbc-sl-shell"]);
    root.dataset.density = "comfortable";
    root.dataset.schedule = "false";
    root.dataset.onlyChanges = "false";
    root.dataset.benchCollapsed = "true";
    const header = document.createElement("div");
    header.className = "nfbc-sl-header";
    const main2 = document.createElement("div");
    main2.className = "nfbc-sl-header-main";
    const left = document.createElement("div");
    left.className = "nfbc-sl-header-primary";
    const titleNode = document.createElement("div");
    titleNode.dataset.role = "title";
    titleNode.className = "nfbc-sl-title";
    titleNode.textContent = title;
    const subtitle = document.createElement("div");
    subtitle.dataset.role = "subtitle";
    subtitle.className = "nfbc-sl-subtitle";
    subtitle.textContent = "Loading lineup data";
    subtitle.setAttribute("role", "status");
    subtitle.setAttribute("aria-live", "polite");
    subtitle.setAttribute("aria-atomic", "true");
    const actions = document.createElement("div");
    actions.className = "nfbc-sl-header-actions";
    const optimizeButton = ensureButton("optimize", "Optimize", "primary");
    const refreshButton = ensureButton("refresh", "Refresh", "secondary");
    left.append(titleNode, subtitle, actions);
    const metrics = document.createElement("div");
    metrics.dataset.role = "metrics";
    metrics.className = "nfbc-sl-kpis";
    const strength = document.createElement("div");
    strength.className = "nfbc-sl-strength";
    const strengthTitle = document.createElement("div");
    strengthTitle.className = "nfbc-sl-section-title";
    strengthTitle.textContent = "Category Strength";
    const strengthGrid = document.createElement("div");
    strengthGrid.dataset.role = "strength-grid";
    strengthGrid.className = "nfbc-sl-strength-grid";
    strength.append(strengthTitle, strengthGrid);
    main2.append(left, metrics, strength);
    const toolbar = document.createElement("div");
    toolbar.dataset.role = "toolbar";
    toolbar.className = "nfbc-sl-toolbar";
    const helpButton = ensureButton("help-button", "Help", "secondary");
    helpButton.classList.add("nfbc-sl-help-trigger");
    const helpPanel = document.createElement("div");
    helpPanel.dataset.role = "help-panel";
    helpPanel.className = "nfbc-sl-help-panel";
    helpPanel.hidden = true;
    const swaps = document.createElement("div");
    swaps.dataset.role = "swaps";
    swaps.className = "nfbc-sl-swaps";
    swaps.hidden = true;
    actions.append(optimizeButton, refreshButton, toolbar);
    header.append(swaps, main2, helpPanel);
    toolbar.append(helpButton);
    root.append(header);
    return { root, title: titleNode, subtitle, swaps, optimizeButton, refreshButton, metrics, strengthGrid, toolbar, helpButton, helpPanel };
  }
  __name(ensureSetLineupShell, "ensureSetLineupShell");
  function summaryLine(text2) {
    const row = document.createElement("div");
    row.className = "nfbc-summary-line";
    row.textContent = text2;
    return row;
  }
  __name(summaryLine, "summaryLine");
  function renderSummary(container, lines) {
    container.replaceChildren(...lines.map(summaryLine));
  }
  __name(renderSummary, "renderSummary");
  function renderMetricCards(container, cards) {
    const grid = document.createElement("div");
    grid.className = "nfbc-metric-grid";
    cards.forEach((card) => {
      const item = document.createElement("div");
      item.className = "nfbc-metric-card";
      item.dataset.tone = card.tone ?? "neutral";
      if (card.detail) {
        item.dataset.nfbcTooltip = card.detail;
        item.setAttribute("aria-label", card.detail);
      }
      const label = document.createElement("div");
      label.className = "nfbc-metric-label";
      label.textContent = card.label;
      const value = document.createElement("div");
      value.className = "nfbc-metric-value";
      value.textContent = card.value;
      item.append(label, value);
      grid.append(item);
    });
    container.append(grid);
  }
  __name(renderMetricCards, "renderMetricCards");
  function renderChipGrid(container, cells) {
    const grid = document.createElement("div");
    grid.className = "nfbc-chip-grid";
    cells.forEach((cell) => {
      const chip = document.createElement("div");
      chip.className = "nfbc-chip-cell";
      chip.dataset.tone = cell.tone ?? "neutral";
      if (cell.detail) {
        chip.title = cell.detail;
      }
      const label = document.createElement("div");
      label.className = "nfbc-chip-label";
      label.textContent = cell.label;
      const value = document.createElement("div");
      value.className = "nfbc-chip-value";
      value.textContent = cell.value;
      chip.append(label, value);
      grid.append(chip);
    });
    container.append(grid);
  }
  __name(renderChipGrid, "renderChipGrid");
  function appendNotes(container, notes) {
    notes.forEach((note) => {
      const row = document.createElement("div");
      row.className = "nfbc-note-line";
      row.textContent = note;
      container.append(row);
    });
  }
  __name(appendNotes, "appendNotes");
  function fillHelpPanel(container, notes) {
    container.replaceChildren();
    appendNotes(container, notes);
  }
  __name(fillHelpPanel, "fillHelpPanel");
  function setPanelBusy(panel, busy, labels = {}) {
    const optimizeLabel = labels.optimize ?? "Optimize";
    const refreshLabel = labels.refresh ?? "Refresh";
    panel.optimizeButton.disabled = busy;
    panel.refreshButton.disabled = busy;
    panel.optimizeButton.textContent = optimizeLabel;
    panel.refreshButton.textContent = refreshLabel;
    panel.optimizeButton.dataset.busy = busy ? "true" : "false";
    panel.refreshButton.dataset.busy = busy ? "true" : "false";
    const root = panel.optimizeButton.closest("#nfbc-setlineup-shell, #nfbc-extension-panel");
    root?.setAttribute("aria-busy", String(busy));
  }
  __name(setPanelBusy, "setPanelBusy");
  function setPanelStatus(panel, message, tone = "info") {
    panel.status.textContent = message;
    panel.status.dataset.tone = STATUS_TONES[tone];
  }
  __name(setPanelStatus, "setPanelStatus");

  // src/content/readability_theme.ts
  var THEME_STYLE_ID = "nfbc-extension-readability-theme";
  var BASE_THEME = `
body[data-nfbc-ext-readability="on"] {
  --nfbc-ext-page-bg: #0a1628;
  --nfbc-ext-surface: #0f1f3d;
  --nfbc-ext-surface-2: #152a4a;
  --nfbc-ext-surface-3: #1b3358;
  --nfbc-ext-surface-4: #213d66;
  --nfbc-ext-border: #2d5080;
  --nfbc-ext-border-soft: #1e3a5f;
  --nfbc-ext-border-strong: #3d6898;
  --nfbc-ext-text: #d4dde9;
  --nfbc-ext-text-strong: #f0f4fa;
  --nfbc-ext-text-muted: #94a8c4;
  --nfbc-ext-text-faint: #6b82a4;
  --nfbc-ext-accent: #f0b832;
  --nfbc-ext-accent-soft: rgba(240, 184, 50, 0.18);
  --nfbc-ext-success: #34d399;
  --nfbc-ext-warning: #fbbf24;
  --nfbc-ext-danger: #fb7185;
  --nfbc-ext-panel-bg: linear-gradient(180deg, rgba(15, 31, 61, 0.97), rgba(21, 42, 74, 0.94));
  --nfbc-ext-shadow: 0 10px 24px rgba(6, 12, 28, 0.36);
  color: var(--nfbc-ext-text);
}

body[data-nfbc-ext-readability="on"]:not([data-nfbc-ext-page="setlineup"]) button,
body[data-nfbc-ext-readability="on"]:not([data-nfbc-ext-page="setlineup"]) select,
body[data-nfbc-ext-readability="on"]:not([data-nfbc-ext-page="setlineup"]) input[type="search"],
body[data-nfbc-ext-readability="on"]:not([data-nfbc-ext-page="setlineup"]) input[type="text"] {
  border-radius: 10px;
}

body[data-nfbc-ext-readability="on"] select,
body[data-nfbc-ext-readability="on"]:not([data-nfbc-ext-page="setlineup"]) input[type="search"],
body[data-nfbc-ext-readability="on"]:not([data-nfbc-ext-page="setlineup"]) input[type="text"] {
  background: var(--nfbc-ext-surface);
  border: 1px solid var(--nfbc-ext-border);
  color: var(--nfbc-ext-text-strong);
  box-shadow: none;
}

body[data-nfbc-ext-readability="on"]:not([data-nfbc-ext-page="setlineup"]) select:focus,
body[data-nfbc-ext-readability="on"] input[type="search"]:focus,
body[data-nfbc-ext-readability="on"] input[type="text"]:focus {
  outline: none;
  border-color: #f0b832;
  box-shadow: 0 0 0 3px rgba(240, 184, 50, 0.2);
}

body[data-nfbc-ext-readability="on"] .nfbc-overlay-panel,
body[data-nfbc-ext-readability="on"] .nfbc-inline-summary {
  background: var(--nfbc-ext-panel-bg);
  border: 1px solid var(--nfbc-ext-border);
  border-radius: 16px;
  box-shadow: var(--nfbc-ext-shadow);
  color: var(--nfbc-ext-text);
  font-family: "Segoe UI", Tahoma, sans-serif;
}

body[data-nfbc-ext-readability="on"] .nfbc-overlay-panel {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 999998;
  width: 260px;
  padding: 12px;
}

body[data-nfbc-ext-readability="on"] .nfbc-inline-summary {
  margin: 0 0 14px 0;
  padding: 12px 14px;
}

body[data-nfbc-ext-readability="on"] .nfbc-panel-title,
body[data-nfbc-ext-readability="on"] .nfbc-sl-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--nfbc-ext-text-strong);
}

body[data-nfbc-ext-readability="on"] .nfbc-panel-status,
body[data-nfbc-ext-readability="on"] .nfbc-sl-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--nfbc-ext-text-muted);
}

body[data-nfbc-ext-readability="on"] .nfbc-sl-subtitle[data-stale="true"] {
  color: #ffd54a;
  font-weight: 700;
}

body[data-nfbc-ext-readability="on"] .nfbc-panel-status[data-tone="loading"] {
  color: #f0b832;
}

body[data-nfbc-ext-readability="on"] .nfbc-panel-status[data-tone="success"] {
  color: #6ee7b7;
}

body[data-nfbc-ext-readability="on"] .nfbc-panel-status[data-tone="error"] {
  color: #fda4af;
}

body[data-nfbc-ext-readability="on"] .nfbc-panel-actions,
body[data-nfbc-ext-readability="on"] .nfbc-sl-header-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}

body[data-nfbc-ext-readability="on"] .nfbc-action-button {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 10px;
  color: #eff6ff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  min-height: 34px;
  padding: 8px 12px;
  transition: background-color 120ms ease, border-color 120ms ease, opacity 120ms ease;
}

body[data-nfbc-ext-readability="on"] .nfbc-action-button[data-tone="primary"] {
  background: linear-gradient(180deg, #b8860b, #a07608);
  border-color: #d4a017;
  color: #fffbeb;
}

body[data-nfbc-ext-readability="on"] .nfbc-action-button[data-tone="secondary"] {
  background: rgba(15, 31, 61, 0.9);
  border-color: #2d5080;
}

body[data-nfbc-ext-readability="on"] .nfbc-action-button:hover:not(:disabled) {
  border-color: #f0b832;
}

body[data-nfbc-ext-readability="on"] .nfbc-action-button:disabled {
  cursor: wait;
  opacity: 0.7;
}

body[data-nfbc-ext-readability="on"] .nfbc-panel-summary {
  margin-top: 12px;
}

body[data-nfbc-ext-readability="on"] .nfbc-summary-line,
body[data-nfbc-ext-readability="on"] .nfbc-note-line {
  color: var(--nfbc-ext-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

body[data-nfbc-ext-readability="on"] .nfbc-summary-line + .nfbc-summary-line,
body[data-nfbc-ext-readability="on"] .nfbc-note-line + .nfbc-note-line {
  margin-top: 4px;
}

body[data-nfbc-ext-readability="on"] .nfbc-panel-section {
  margin-top: 12px;
}

body[data-nfbc-ext-readability="on"] .nfbc-panel-section-title,
body[data-nfbc-ext-readability="on"] .nfbc-sl-section-title {
  color: var(--nfbc-ext-text-faint);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
  text-transform: uppercase;
}

body[data-nfbc-ext-readability="on"] .nfbc-metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 8px;
}

body[data-nfbc-ext-readability="on"] .nfbc-metric-card {
  background: rgba(10, 22, 40, 0.72);
  border: 1px solid var(--nfbc-ext-border-soft);
  border-radius: 12px;
  padding: 9px 10px;
}

body[data-nfbc-ext-readability="on"] .nfbc-metric-card[data-tone="positive"] {
  background: rgba(16, 120, 72, 0.25);
  border-color: rgba(52, 211, 153, 0.50);
}

body[data-nfbc-ext-readability="on"] .nfbc-metric-card[data-tone="warning"] {
  background: rgba(146, 90, 14, 0.22);
  border-color: rgba(251, 191, 36, 0.45);
}

body[data-nfbc-ext-readability="on"] .nfbc-metric-label,
body[data-nfbc-ext-readability="on"] .nfbc-chip-label {
  color: var(--nfbc-ext-text-faint);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

body[data-nfbc-ext-readability="on"] .nfbc-metric-value {
  color: var(--nfbc-ext-text-strong);
  font-size: 18px;
  font-weight: 800;
  margin-top: 4px;
}

body[data-nfbc-ext-readability="on"] .nfbc-chip-grid {
  display: grid;
  gap: 4px;
  /* all five categories (R/HR/RBI/SB/AVG \xB7 W/K/SV/ERA/WHIP) on one row */
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

body[data-nfbc-ext-readability="on"] .nfbc-chip-cell {
  background: rgba(10, 22, 40, 0.66);
  border: 1px solid var(--nfbc-ext-border-soft);
  border-radius: 8px;
  padding: 3px 4px;
  text-align: center;
}

body[data-nfbc-ext-readability="on"] .nfbc-chip-cell[data-tone="elite"] {
  background: rgba(20, 83, 45, 0.34);
  border-color: rgba(74, 222, 128, 0.55);
}

body[data-nfbc-ext-readability="on"] .nfbc-chip-cell[data-tone="strong"] {
  background: rgba(20, 83, 45, 0.24);
  border-color: rgba(134, 239, 172, 0.48);
}

body[data-nfbc-ext-readability="on"] .nfbc-chip-cell[data-tone="weak"] {
  background: rgba(133, 77, 14, 0.30);
  border-color: rgba(251, 191, 36, 0.55);
}

body[data-nfbc-ext-readability="on"] .nfbc-chip-cell[data-tone="poor"] {
  background: rgba(153, 27, 27, 0.30);
  border-color: rgba(252, 130, 130, 0.55);
}

body[data-nfbc-ext-readability="on"] .nfbc-chip-value {
  color: var(--nfbc-ext-text-strong);
  font-size: 12px;
  font-weight: 800;
  margin-top: 3px;
}

body[data-nfbc-ext-readability="on"] .nfbc-help-toggle {
  margin-top: 10px;
}

body[data-nfbc-ext-readability="on"] .nfbc-inline-link {
  appearance: none;
  background: transparent;
  border: 0;
  color: #f0b832;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  padding: 0;
}

body[data-nfbc-ext-readability="on"] .nfbc-help-panel,
body[data-nfbc-ext-readability="on"] .nfbc-sl-help-panel {
  background: rgba(10, 22, 40, 0.9);
  border: 1px solid var(--nfbc-ext-border);
  border-radius: 12px;
  margin-top: 8px;
  padding: 10px 12px;
}
`;
  var SET_LINEUP_ALL_THEME = `
body[data-nfbc-ext-readability="on"] #team_selector,
body[data-nfbc-ext-readability="on"] #sp_selector,
body[data-nfbc-ext-readability="on"] select.lineup_position {
  background: var(--nfbc-ext-surface);
  border: 1px solid var(--nfbc-ext-border);
  color: var(--nfbc-ext-text-strong);
}

body[data-nfbc-ext-readability="on"] [id^="tl_"] {
  background: linear-gradient(180deg, #ffffff, #f7f9fc);
  border: 1px solid var(--nfbc-ext-border-soft);
  border-radius: 16px;
  box-shadow: var(--nfbc-ext-shadow);
  padding: 8px;
}

body[data-nfbc-ext-readability="on"] [id^="tl_"] .league_name {
  background: linear-gradient(90deg, rgba(240, 184, 50, 0.22), rgba(240, 184, 50, 0.04));
  border: 1px solid rgba(184, 134, 11, 0.35);
  border-radius: 12px;
  color: var(--nfbc-ext-text-strong);
  font-weight: 700;
  margin-bottom: 10px;
  padding: 10px 12px;
}

body[data-nfbc-ext-readability="on"] table.data.league.standard_view {
  background: transparent;
  color: var(--nfbc-ext-text);
}

body[data-nfbc-ext-readability="on"] table.data.league.standard_view tr {
  background: transparent;
}

body[data-nfbc-ext-readability="on"] table.data.league.standard_view td,
body[data-nfbc-ext-readability="on"] table.data.league.standard_view th {
  border-color: var(--nfbc-ext-border-soft);
  color: var(--nfbc-ext-text);
}

body[data-nfbc-ext-readability="on"] table.data.league.standard_view tbody tr:nth-child(odd) {
  background: rgba(20, 40, 80, 0.03);
}

body[data-nfbc-ext-readability="on"] table.data.league.standard_view tbody tr:nth-child(even) {
  background: rgba(20, 40, 80, 0.06);
}

body[data-nfbc-ext-readability="on"] button.savebutton {
  background: linear-gradient(180deg, #b8860b, #a07608);
  border: 1px solid #d4a017;
  color: #fffbeb;
}

/* Light-theme the whole page: redefine the shared variables at the page level
   (navy + gold on white) so every var-driven rule \u2014 the overlay panel, the form
   controls, the team blocks and tables \u2014 flips light. The few hardcoded-dark
   fills (team-block card, league-name band, table stripes) are lightened in
   their own rules above. Mirrors the freeagents page theme. */
body[data-nfbc-ext-page="setlineupall"] {
  --nfbc-ext-surface: #ffffff;
  --nfbc-ext-surface-2: #f4f6f9;
  --nfbc-ext-surface-3: #eef1f6;
  --nfbc-ext-border: #d4d9e2;
  --nfbc-ext-border-soft: #e3e7ee;
  --nfbc-ext-border-strong: #c2c9d6;
  --nfbc-ext-text: #1f2937;
  --nfbc-ext-text-strong: #111827;
  --nfbc-ext-text-muted: #5b6573;
  --nfbc-ext-text-faint: #8a93a3;
  --nfbc-ext-panel-bg: linear-gradient(180deg, #ffffff, #f4f7fc);
  --nfbc-ext-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
  color: #1f2937;
}
body[data-nfbc-ext-page="setlineupall"] .nfbc-action-button[data-tone="secondary"] {
  background: #ffffff;
  border-color: #c2c9d6;
  color: #1f2937;
}
body[data-nfbc-ext-page="setlineupall"] .nfbc-panel-status[data-tone="loading"] { color: #b8860b; }
body[data-nfbc-ext-page="setlineupall"] .nfbc-panel-status[data-tone="success"] { color: #15803d; }
body[data-nfbc-ext-page="setlineupall"] .nfbc-panel-status[data-tone="error"] { color: #b91c1c; }
`;
  var FREE_AGENTS_THEME = `
/* White-based theme: redefine the shared panel variables to a light palette
   (navy + gold on white) so every var-driven panel rule flips light, then
   override the few hardcoded-dark panel colors and restyle the table light. */
body[data-nfbc-ext-page="freeagents"] {
  --nfbc-ext-surface: #ffffff;
  --nfbc-ext-surface-2: #f4f6f9;
  --nfbc-ext-surface-3: #eef1f6;
  --nfbc-ext-border: #d4d9e2;
  --nfbc-ext-border-soft: #e3e7ee;
  --nfbc-ext-border-strong: #c2c9d6;
  --nfbc-ext-text: #1f2937;
  --nfbc-ext-text-strong: #111827;
  --nfbc-ext-text-muted: #5b6573;
  --nfbc-ext-text-faint: #8a93a3;
  --nfbc-ext-panel-bg: #ffffff;
  --nfbc-ext-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
  color: #1f2937;
}
body[data-nfbc-ext-page="freeagents"] .nfbc-overlay-panel {
  border-color: var(--nfbc-ext-border);
}
body[data-nfbc-ext-page="freeagents"] .nfbc-action-button[data-tone="secondary"] {
  background: #ffffff;
  border-color: #c2c9d6;
  color: #1f2937;
}
body[data-nfbc-ext-page="freeagents"] .nfbc-panel-status[data-tone="success"] { color: #15803d; }
body[data-nfbc-ext-page="freeagents"] .nfbc-panel-status[data-tone="error"] { color: #b91c1c; }
body[data-nfbc-ext-page="freeagents"] .nfbc-metric-card,
body[data-nfbc-ext-page="freeagents"] .nfbc-chip-cell {
  background: #f7f9fc;
  border-color: #e3e7ee;
}
body[data-nfbc-ext-page="freeagents"] .nfbc-metric-card[data-tone="positive"] { background: #ddf1e3; border-color: #8fcaa5; }
body[data-nfbc-ext-page="freeagents"] .nfbc-metric-card[data-tone="positive"] .nfbc-metric-value { color: #15803d; }
body[data-nfbc-ext-page="freeagents"] .nfbc-metric-card[data-tone="warning"] { background: #fde3cd; border-color: #e2a268; }
body[data-nfbc-ext-page="freeagents"] .nfbc-metric-card[data-tone="warning"] .nfbc-metric-value { color: #9a4a06; }
body[data-nfbc-ext-page="freeagents"] .nfbc-chip-cell[data-tone="elite"] { background: #b5e6c6; border-color: #4caf72; }
body[data-nfbc-ext-page="freeagents"] .nfbc-chip-cell[data-tone="strong"] { background: #ddf1e3; border-color: #8fcaa5; }
body[data-nfbc-ext-page="freeagents"] .nfbc-chip-cell[data-tone="weak"] { background: #fde3cd; border-color: #e2a268; }
body[data-nfbc-ext-page="freeagents"] .nfbc-chip-cell[data-tone="poor"] { background: #f6c8c8; border-color: #d76e6e; }
body[data-nfbc-ext-page="freeagents"] .nfbc-inline-link { color: #16365c; }
body[data-nfbc-ext-page="freeagents"] .nfbc-help-panel { background: #f7f9fc; border-color: #e3e7ee; }

/* Dock the overlay panel to the bottom-right so it never covers NFBC's native
   My Teams / My Roster / Bids / Pending FAAB column (which sits top-right). */
body[data-nfbc-ext-readability="on"] .nfbc-overlay-panel {
  top: auto;
  bottom: 16px;
  right: 16px;
  width: 220px;
  max-height: 60vh;
  overflow-y: auto;
  font-size: 11px;
  padding: 8px 10px;
}

/* On /freeagents the panel is moved into the document flow at the top (see
   dockPanelTop) instead of floating \u2014 render it as a compact horizontal bar so
   the controls and data-health note sit inline near the top of the page rather
   than in a corner popup. Higher specificity than the bottom-dock rule above. */
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] .nfbc-overlay-panel {
  position: static;
  width: auto;
  max-height: none;
  overflow: visible;
  margin: 0 8px 8px;
  padding: 6px 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
}
body[data-nfbc-ext-page="freeagents"] .nfbc-overlay-panel .nfbc-panel-title { font-size: 12px; margin: 0; }
body[data-nfbc-ext-page="freeagents"] .nfbc-overlay-panel .nfbc-panel-status { margin: 0; }
body[data-nfbc-ext-page="freeagents"] .nfbc-overlay-panel .nfbc-panel-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  margin: 0;
}
body[data-nfbc-ext-page="freeagents"] .nfbc-overlay-panel .nfbc-panel-section { margin: 0; }
body[data-nfbc-ext-page="freeagents"] .nfbc-overlay-panel .nfbc-panel-section,
body[data-nfbc-ext-page="freeagents"] .nfbc-overlay-panel .nfbc-panel-summary > * {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}

/* Bids / Claim List panel: the form-control revert below resets the bid field
   (input[type=number]) and the league dropdown to wide UA defaults, pushing the
   trash / add-conditional (+) buttons off the right edge so they need a
   horizontal scroll. Re-compact them (higher specificity than the :where revert
   wins). The bid input only ever holds up to 3 digits. */
body[data-nfbc-ext-readability="on"] .PlayersPageClaims input[type="number"] {
  width: 50px !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageClaims select {
  max-width: 190px !important;
}
/* Keep all five claim columns inside the right rail. NFBC forces each Add/Drop
   line to nowrap, which makes the table wider than its card and hides the final
   add-conditional button. Let only that descriptive column wrap; preserve the
   compact fixed controls and keep horizontal scrolling as a last-resort
   backstop for unusually narrow viewports. */
body[data-nfbc-ext-readability="on"] .PlayersPageClaims { overflow-x: auto !important; }
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data {
  width: 100% !important;
  max-width: 100% !important;
  font-size: 11px !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data td,
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data th {
  padding: 2px 4px !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody td:nth-child(1),
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody td:nth-child(2) {
  width: 24px !important;
  padding-left: 1px !important;
  padding-right: 1px !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody td:nth-child(3) > div {
  white-space: normal !important;
  line-height: 1.45 !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody td:nth-child(4) {
  width: 46px !important;
  padding-left: 2px !important;
  padding-right: 2px !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody td:nth-child(5) {
  width: 50px !important;
  padding-left: 1px !important;
  padding-right: 1px !important;
  white-space: nowrap !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody td:nth-child(1) button,
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody td:nth-child(2) button,
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody td:nth-child(4) button,
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody td:nth-child(5) button {
  box-sizing: border-box !important;
  min-width: 0 !important;
  padding: 1px 3px !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody td:nth-child(5) button {
  width: 23px !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody input[type="number"] {
  width: 40px !important;
}

/* My Teams is a table of link-buttons. Turn the bare bordered rows into a
   compact league picker with a clear active state. */
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] .PlayersPageMyTeamSelector {
  width: 100% !important; margin: 0 0 12px !important;
  border: 1px solid #cbd5e1 !important; border-radius: 7px !important;
  border-collapse: separate !important; border-spacing: 0 !important;
  overflow: hidden !important; box-shadow: 0 1px 3px rgba(15, 23, 42, .08) !important;
}
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] .PlayersPageMyTeamSelector td {
  padding: 0 !important; border: 0 !important; border-bottom: 1px solid #e2e8f0 !important; background: #fff !important;
}
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] .PlayersPageMyTeamSelector tr:last-child td { border-bottom: 0 !important; }
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] .PlayersPageMyTeamSelector tr:nth-child(even) td { background: #f8fafc !important; }
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] .PlayersPageMyTeamSelector button.link {
  display: block !important; width: 100% !important; padding: 6px 9px !important;
  border: 0 !important; background: transparent !important; color: #24364b !important;
  font: 500 11px/1.25 Arial, sans-serif !important; text-align: left !important;
  white-space: normal !important; cursor: pointer !important;
}
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] .PlayersPageMyTeamSelector tr:hover td { background: #edf4fb !important; }
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] .PlayersPageMyTeamSelector tr[data-highlight="1"] td {
  background: #dcefe3 !important; box-shadow: inset 3px 0 #23834b !important;
}
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] .PlayersPageMyTeamSelector tr[data-highlight="1"] button.link {
  color: #14532d !important; font-weight: 700 !important;
}

/* Match the right-rail My Roster card to the compact decision table: predictable
   columns, the same zebra palette, and no long-name overflow on a smaller
   monitor. The roster has only action/player/eligibility fields, so the player
   column receives the flexible remainder.
   NOTE: do NOT set table-layout:fixed here. NFBC's collapsible header is a
   single <td colspan="100">, and fixed layout derives the column grid from that
   first row -- it would build 100 ~4px columns and squash every body cell to an
   unreadable sliver. Auto layout honours the td width hints below just fine. */
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] table.PlayersPageMyRoster {
  width: 100% !important;
  table-layout: auto !important;
  border-collapse: separate !important;
  border-spacing: 0 !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 7px !important;
  overflow: hidden !important;
  font: 500 11px/1.25 Arial, sans-serif !important;
  color: #1f2937 !important;
}
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] table.PlayersPageMyRoster th,
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] table.PlayersPageMyRoster td {
  padding: 4px 6px !important;
  border-color: #e2e8f0 !important;
  vertical-align: middle !important;
  box-sizing: border-box !important;
}
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] table.PlayersPageMyRoster tbody tr:nth-child(odd) td { background: #fff !important; }
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] table.PlayersPageMyRoster tbody tr:nth-child(even) td { background: #eaeef5 !important; }
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] table.PlayersPageMyRoster tbody tr:hover td { background: #edf4fb !important; }
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] table.PlayersPageMyRoster tbody td:first-child { width: 34px !important; text-align: center !important; }
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] table.PlayersPageMyRoster tbody td:last-child {
  width: 76px !important;
  text-align: right !important;
  white-space: normal !important;
  color: #475569 !important;
  font-size: 10px !important;
}
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] table.PlayersPageMyRoster tbody td:nth-child(2) {
  width: auto !important;
  min-width: 0 !important;
  /* auto layout: let long names wrap rather than widen the card (ellipsis needs
     a fixed-width cell, which this table can't have -- see the colspan note) */
  overflow-wrap: anywhere !important;
  white-space: normal !important;
}
/* Each bid is an Add row followed by its Drop row. Visually join each pair and
   put a stronger rule between claims so long lists are easier to scan. */
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody tr:has(input[type="number"]) td {
  border-top: 2px solid #aeb9c8 !important; background: #f7f9fc !important; padding-top: 5px !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody tr:has(input[type="number"]) + tr td {
  background: #f7f9fc !important; border-bottom: 1px solid #d7dde6 !important; padding-bottom: 5px !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody tr:has(input[type="number"]):hover td,
body[data-nfbc-ext-readability="on"] .PlayersPageClaims table.data tbody tr:has(input[type="number"]):hover + tr td {
  background: #edf3f9 !important;
}
/* Keep native form controls (filter selects, the right-rail FAAB dropdown, the
   No-Changes button) looking native. NOTE: only form controls are reverted --
   we must NOT revert native tables, because 'revert' rolls back to the UA
   origin and would strip NFBC's own '.card' author styling (e.g. the right-rail
   My Teams / My Roster / Bids cards). Extension table styling is already scoped
   to '.PlayersPageTable table.data', so native tables are left untouched. */
body[data-nfbc-ext-readability="on"][data-nfbc-ext-page="freeagents"] :where(
  button,
  select,
  input,
  a.button,
  [role='button']
):not(.nfbc-action-button):not(.nfbc-inline-link):not(#nfbc-extension-panel *):not(.PlayersPageTable *):not([data-nfbc-ext]):not([data-nfbc-ext] *) {
  all: revert;
}

body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data {
  color: #1f2937;
}

/* NFBC wraps the Free Agents table in card containers that can interfere with
   sticky positioning depending on the page's native overflow rules. Keep the
   wrapper visible so the header can pin to the viewport while the long list
   scrolls. */
body[data-nfbc-ext-page="freeagents"] .PlayersPageTable,
body[data-nfbc-ext-page="freeagents"] .PlayersPageTable.card {
  overflow: visible !important;
}

body[data-nfbc-ext-page="freeagents"] .PlayersPageTable table.data {
  position: relative;
}

body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data tr:nth-child(odd) td {
  background: #ffffff !important;
}

body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data tr:nth-child(even) td {
  background: #eaeef5 !important;
}

body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td,
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data th {
  border-color: #e8ebf0;
  color: #1f2937 !important;
}

body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data thead td,
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data thead th {
  background: #f4f6f9 !important;
  border-bottom: 2px solid #16365c;
  color: #16365c !important;
  font-weight: 800;
  /* keep the column labels visible while scrolling the long FA list */
  position: sticky;
  top: 0;
  z-index: 8;
  background-clip: padding-box;
  box-shadow: inset 0 -1px 0 #d4d9e2;
}

body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data a {
  color: #1d4ed8 !important;
  font-weight: 700;
  opacity: 1 !important;
  text-decoration-color: rgba(29, 78, 216, 0.4);
}

body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data a:hover {
  color: #16365c !important;
  text-decoration-color: #b8860b;
}

/* Player names slightly larger than the (compact 11px) stat cells for
   readability, without widening the numeric columns. */
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data a[href*='/player/baseball/'] {
  font-size: 13px;
}

/* Free-agent player cells are intentionally two lines: the name remains an
   uninterrupted scan target and the denser recent-form badge sits below it.
   NFBC's native row styles are quite aggressive, hence the scoped !important
   declarations here. */
body[data-nfbc-ext-page="freeagents"] .PlayersPageTable table.data [data-nfbc-ext="name-row"] {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  justify-content: center !important;
  gap: 2px !important;
  width: 100% !important;
  min-width: 0 !important;
  line-height: 1.2 !important;
}
body[data-nfbc-ext-page="freeagents"] .PlayersPageTable table.data [data-nfbc-ext="name-text"] {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
body[data-nfbc-ext-page="freeagents"] .PlayersPageTable table.data [data-nfbc-ext="l30"] {
  align-self: flex-start !important;
  max-width: 100% !important;
  margin: 0 !important;
  font-size: 10px !important;
}

/* At the compact breakpoint retain L30 and the estimator, while moving the
   swing/miss details into the existing tooltip. */
body[data-nfbc-ext-page="freeagents"] .PlayersPageTable table.data[data-nfbc-decision-compact="true"]
  [data-nfbc-ext="l30"] [data-nfbc-rater-segment="SwS"],
body[data-nfbc-ext-page="freeagents"] .PlayersPageTable table.data[data-nfbc-decision-compact="true"]
  [data-nfbc-ext="l30"] [data-nfbc-rater-segment="K-BB"] {
  display: none !important;
}

/* "Fits My Needs" row tint: a light left-to-right green/amber wash */
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data tr[data-nfbc-fit="light"] td {
  background: linear-gradient(90deg, #fff6e0, #ffffff) !important;
}

body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data tr[data-nfbc-fit="medium"] td {
  background: linear-gradient(90deg, #fdebc8, #ffffff) !important;
}

body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data tr[data-nfbc-fit="strong"] td {
  background: linear-gradient(90deg, #d8f0e0, #ffffff) !important;
}

/* Keep the wide player table (native stat columns + the extension's added ones)
   from forcing a PAGE-level horizontal scroll, which pushed the right-rail Bids
   panel out of reach. Let the table scroll inside its own box and allow the flex
   item to shrink (min-width:0) so the sidebar stays on-screen. */
body[data-nfbc-ext-readability="on"] .PlayersPageTable {
  overflow-x: auto !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

/* Compact native table to make room for extension columns */
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data {
  font-size: 11px;
}
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td,
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data th {
  padding: 3px 5px;
  white-space: nowrap;
}

/* Sortable extension headers */
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data th[data-nfbc-ext] {
  cursor: pointer;
  user-select: none;
  transition: color 0.15s, border-color 0.15s;
  font-size: 10px;
  padding: 3px 4px !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data th[data-nfbc-ext]:hover {
  color: #b8860b;
}
body[data-nfbc-ext-page="freeagents"] .PlayersPageTable table.data [data-nfbc-ext="global-rank"] {
  display: inline-block;
  margin-left: 3px;
  padding: 0 2px;
  border-radius: 3px;
  background: #e8eef8;
  color: #475569;
  font-size: 8px;
  font-weight: 800;
  line-height: 12px;
  vertical-align: 1px;
  letter-spacing: -0.02em;
}

/* League-wide Best Adds discovery board. The native NFBC table remains the
   transaction surface below it; this board is intentionally self-contained so
   pagination and native filters cannot narrow the ranking universe. */
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds {
  margin: 0 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  overflow: hidden;
  background: #fff;
  color: #1f2937;
  font: 500 11px/1.35 Arial, sans-serif;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-heading"] {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 9px;
  background: #f4f6f9;
  border-bottom: 1px solid #d7dde6;
  color: #16365c;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-heading"] strong {
  font-weight: 800;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-heading"] span {
  color: #64748b;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-heading"] button {
  margin-left: auto;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-controls"] {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  border-bottom: 1px solid #e2e8f0;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds input[type="search"] {
  flex: 1 1 220px;
  min-width: 180px;
  padding: 4px 6px;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds select {
  padding: 4px 6px;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-positions"] {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  flex-basis: 100%;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds button {
  padding: 2px 6px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #fff;
  color: #334155;
  font: 700 10px/1.35 Arial, sans-serif;
  cursor: pointer;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds button[aria-pressed="true"] {
  border-color: #16365c;
  background: #16365c;
  color: #fff;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-status"] {
  padding: 5px 9px;
  color: #64748b;
  background: #f8fafc;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-table-wrap"] {
  max-height: 380px;
  overflow: auto;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-more"] {
  display: block;
  margin: 6px auto;
  min-width: 110px;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-more"][hidden] {
  display: none;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds th,
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds td {
  padding: 5px 7px;
  border-bottom: 1px solid #e6eaf0;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f4f6f9;
  color: #16365c;
  font-weight: 800;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds th:nth-child(2),
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds td:nth-child(2),
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds th:nth-child(11),
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds td:nth-child(11) {
  text-align: left;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds td:nth-child(11) {
  color: #475569;
  font-weight: 700;
  letter-spacing: .01em;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds td[data-nfbc-player="true"] {
  color: #1d4ed8;
  font-weight: 800;
  white-space: normal;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-name-line"] {
  display: flex;
  align-items: center;
  gap: 5px;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-player-team"] {
  display: block;
  color: #64748b;
  font-size: 9px;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds tbody tr:nth-child(even) td {
  background: #eef2f7;
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds tbody tr[data-status="provisional"] td {
  background-image: linear-gradient(90deg, rgba(245,158,11,.08), transparent);
}
body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds tbody tr:hover td {
  background: #edf4fb !important;
}
@media (max-width: 760px) {
  body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds {
    margin-left: 0;
    margin-right: 0;
  }
  body[data-nfbc-ext-page="freeagents"] #nfbc-global-best-adds [data-nfbc-ext="global-best-adds-heading"] {
    flex-wrap: wrap;
  }
}
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data th[data-nfbc-sort-active="true"] {
  color: #b8860b;
  border-bottom: 2px solid #b8860b;
}

/* Rank column \u2014 narrow */
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td[data-nfbc-ext="fit-rank"] {
  font-weight: 800;
  text-align: center;
  padding: 3px 2px !important;
  color: #5b6573 !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td[data-nfbc-rank-top="true"] {
  color: #b8860b !important;
}

/* GS column \u2014 narrow, gold highlight for 2+ starts */
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td[data-nfbc-ext="pitcher-gs"] {
  text-align: center;
  padding: 3px 2px !important;
  color: #5b6573 !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td[data-nfbc-gs-flag="true"] {
  color: #b8860b !important;
  font-weight: 800;
}
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td[data-nfbc-ext="pitcher-gs"][data-nfbc-gs-source="fg"] {
  color: #1d4ed8 !important;
  font-weight: 700;
}

/* Extension value columns \u2014 tight */
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td[data-nfbc-ext] {
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  padding: 3px 3px !important;
  color: #1f2937 !important;
}

/* --- pitcher start confirmation (FanGraphs grid vs NFBC/engine) --- */
/* GS-column pip: \u2713 confirmed, \u26A0 partial/unconfirmed, \u25C6N FanGraphs-only */
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data [data-nfbc-ext="gs-confirm"] {
  display: inline-block;
  font-size: 10px;
  font-weight: 800;
  margin-left: 3px;
}
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data [data-nfbc-ext="gs-confirm"]::before {
  content: attr(data-nfbc-glyph);
}
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data [data-nfbc-ext="gs-confirm"][data-tone="confirmed"] { color: #15803d !important; }
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data [data-nfbc-ext="gs-confirm"][data-tone="partial"],
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data [data-nfbc-ext="gs-confirm"][data-tone="native"] { color: #d97706 !important; }
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data [data-nfbc-ext="gs-confirm"][data-tone="fg"] { color: #1d4ed8 !important; }

/* schedule-mode per-day start markers on pitcher rows */
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td.starting_pitcher[data-nfbc-start]::before {
  content: none !important;
}
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data [data-nfbc-ext="schedule-start"] {
  font-size: 9px;
  line-height: 1;
  margin-right: 3px;
  vertical-align: 1px;
}
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data [data-nfbc-ext="schedule-start"][data-tone="confirmed"] { color: #15803d !important; }
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data [data-nfbc-ext="schedule-start"][data-tone="native"] { color: #b8860b !important; }
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data [data-nfbc-ext="schedule-start"][data-tone="fg"] { color: #1d4ed8 !important; }
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td[data-nfbc-start="confirmed"] { background: #ecfdf3 !important; }
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td[data-nfbc-start="native"] { background: #fdf7e8 !important; }
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td[data-nfbc-start="fg"] { background: #eef3ff !important; }
body[data-nfbc-ext-readability="on"] .PlayersPageTable table.data td[data-nfbc-start-conflict="true"] {
  outline: 1px dashed #d9534f;
  outline-offset: -2px;
}
`;
  var SET_LINEUP_NATIVE = `
#nfbc-setlineup-shell {
  background: #ffffff;
  border: 1px solid #d4d9e2;
  border-radius: 8px;
  color: #1f2937;
  font-size: 12px;
  margin: 8px 0;
  padding: 10px 12px;
}
#nfbc-setlineup-shell [data-role="title"],
#nfbc-setlineup-shell .nfbc-panel-title {
  font-size: 14px;
  font-weight: 700;
}
#nfbc-setlineup-shell [data-role="subtitle"] {
  color: #6b7280;
  font-size: 11px;
  margin-bottom: 6px;
}
#nfbc-setlineup-shell button,
#nfbc-setlineup-shell .nfbc-action-button {
  background: #f4f6f9;
  border: 1px solid #c2c9d6;
  border-radius: 5px;
  color: #1f2937;
  cursor: pointer;
  font-size: 12px;
  margin-right: 6px;
  padding: 3px 10px;
}
#nfbc-setlineup-shell .nfbc-metric-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 6px 0;
}
#nfbc-setlineup-shell .nfbc-metric-card {
  background: #f7f9fc;
  border: 1px solid #e3e7ee;
  border-radius: 6px;
  min-width: 96px;
  padding: 4px 10px;
}
#nfbc-setlineup-shell .nfbc-metric-label {
  color: #6b7280;
  font-size: 10px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
#nfbc-setlineup-shell .nfbc-metric-value {
  color: #111827;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
#nfbc-setlineup-shell .nfbc-panel-status {
  color: #6b7280;
  font-size: 11px;
}
/* --- header layout: title/controls left, KPI cards right, strength below --- */
#nfbc-setlineup-shell .nfbc-sl-header-main {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  justify-content: space-between;
}
#nfbc-setlineup-shell .nfbc-sl-header-primary {
  flex: 1 1 520px;
  min-width: 320px;
}
#nfbc-setlineup-shell .nfbc-sl-kpis {
  flex: 0 1 auto;
}
#nfbc-setlineup-shell .nfbc-sl-strength {
  flex: 1 1 100%;
}
#nfbc-setlineup-shell .nfbc-sl-header-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
#nfbc-setlineup-shell .nfbc-sl-header-actions button {
  margin-right: 0;
}
#nfbc-setlineup-shell .nfbc-sl-toolbar {
  border-left: 1px solid #d4d9e2;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: 8px;
  padding-left: 12px;
}
#nfbc-setlineup-shell .nfbc-action-button[data-tone="primary"] {
  background: #16365c;
  border-color: #16365c;
  color: #ffffff;
  font-weight: 600;
}
#nfbc-setlineup-shell .nfbc-action-button[data-tone="primary"]:hover:not(:disabled) {
  background: #1d4577;
}
#nfbc-setlineup-shell button:disabled {
  cursor: default;
  opacity: 0.6;
}
/* pressed view-toggles read as state (tinted + check), not as a primary action */
#nfbc-setlineup-shell .nfbc-sl-toolbar button[aria-pressed="true"] {
  background: #e8f0f9;
  border-color: #16365c;
  box-shadow: inset 0 1px 2px rgba(22, 54, 92, 0.16);
  color: #16365c;
  font-weight: 700;
}
#nfbc-setlineup-shell .nfbc-sl-toolbar button[aria-pressed="true"]::before {
  content: "\u2713 ";
}
#nfbc-setlineup-shell .nfbc-metric-card[data-tone="positive"] {
  background: #ddf1e3;
  border-color: #8fcaa5;
}
#nfbc-setlineup-shell .nfbc-metric-card[data-tone="positive"] .nfbc-metric-value {
  color: #15803d;
}
#nfbc-setlineup-shell .nfbc-metric-card[data-tone="warning"] {
  background: #fbe2e2;
  border-color: #e0a3a3;
}
#nfbc-setlineup-shell .nfbc-metric-card[data-tone="warning"] .nfbc-metric-value {
  color: #b91c1c;
}
#nfbc-setlineup-shell [data-role="subtitle"][data-stale="true"] {
  color: #b91c1c;
}
/* extension chips on player rows (native batting-order marker excluded) */
.nfbc-sl-badge:not([data-nfbc-ext="lineup-slot-native"]) {
  align-items: center;
  background: #f4f6f9;
  border: 1px solid #d4d9e2;
  border-radius: 4px;
  color: #374151;
  display: inline-flex;
  font-size: 10px;
  font-weight: 600;
  gap: 3px;
  line-height: 1.2;
  margin-left: 4px;
  padding: 1px 5px;
  vertical-align: middle;
  white-space: nowrap;
}
.nfbc-sl-badge:not([data-nfbc-ext="lineup-slot-native"])[data-role="raw"] {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  padding: 2px 6px;
}
.nfbc-sl-badge:not([data-nfbc-ext="lineup-slot-native"])[data-tone="elite"] {
  background: #cdeed9; border-color: #6fc08b; color: #14532d;
}
.nfbc-sl-badge:not([data-nfbc-ext="lineup-slot-native"])[data-tone="strong"] {
  background: #e2f4e8; border-color: #9bcfad; color: #166534;
}
.nfbc-sl-badge:not([data-nfbc-ext="lineup-slot-native"])[data-tone="weak"],
.nfbc-sl-badge:not([data-nfbc-ext="lineup-slot-native"])[data-tone="pending"] {
  background: #fcefcd; border-color: #ddb55e; color: #815806;
}
.nfbc-sl-badge:not([data-nfbc-ext="lineup-slot-native"])[data-tone="poor"],
.nfbc-sl-badge:not([data-nfbc-ext="lineup-slot-native"])[data-tone="danger"],
.nfbc-sl-badge:not([data-nfbc-ext="lineup-slot-native"])[data-tone="error"] {
  background: #fbe0e0; border-color: #dd9c9c; color: #b91c1c;
}
/* playing-time signals (PT / Pl / LPA): a caution, not metadata \u2014 amber tint,
   slightly larger than the gray chips so the warning registers at a glance */
.nfbc-sl-badge:not([data-nfbc-ext="lineup-slot-native"])[data-role="risk"] {
  background: #fdf4e1; border-color: #ddb55e; color: #8a5b06;
  font-size: 10.5px; letter-spacing: 0.04em;
}
.nfbc-sl-badge:not([data-nfbc-ext="lineup-slot-native"])[data-role="warning"] {
  letter-spacing: 0.04em;
}
/* lineup status indicator: re-enabled 2026-06-15 (shows MLB lineup state \u2014
   batting-order # when starting, X when scratched, No LU before posting, Off
   when idle). An empty/no-data slot (pitchers, unmatched rows) stays IN FLOW
   but renders blank \u2014 it reserves the bubble column so the projection chip to
   its right keeps a straight vertical edge on every row. */
[data-nfbc-ext="lineup-slot-native"][data-nfbc-empty="true"],
[data-nfbc-ext="lineup-slot"][data-nfbc-empty="true"] {
  background: transparent !important;
  border-color: transparent !important;
  color: transparent !important;
}
/* Consistent lineup-status bubble in ANY theme \u2014 covers both the reused
   native batting-order element (lineup-slot-native, which the base chip rules
   above deliberately skip) and our custom slot. !important to beat NFBC's
   native .BattingOrder circle styling. Starting = green, scratched (X) = red,
   not-posted (No LU) = amber, idle (Off) = muted gray. */
.nfbc-sl-badge[data-role="lineup"] {
  align-items: center !important;
  border-radius: 999px !important;
  border-style: solid !important;
  border-width: 1px !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  justify-content: center !important;
  line-height: 1.2 !important;
  /* fixed width so the bubble column AND the projection-chip column to its
     right both stay perfectly vertical down the roster */
  overflow: hidden !important;
  padding: 1px 2px !important;
  vertical-align: middle;
  width: 26px !important;
}
/* the longer pre-lineup labels shrink to fit the fixed bubble width */
.nfbc-sl-badge[data-role="lineup"][data-tone="pending"],
.nfbc-sl-badge[data-role="lineup"][data-tone="off"] {
  font-size: 8px !important;
  letter-spacing: -0.02em;
}
.nfbc-sl-badge[data-role="lineup"][data-tone="in"] {
  background: #16a34a !important; border-color: #15803d !important; color: #ffffff !important;
}
.nfbc-sl-badge[data-role="lineup"][data-tone="out"] {
  background: #dc2626 !important; border-color: #b91c1c !important; color: #ffffff !important;
}
.nfbc-sl-badge[data-role="lineup"][data-tone="pending"] {
  background: #fef3c7 !important; border-color: #e2c277 !important; color: #92660a !important;
}
.nfbc-sl-badge[data-role="lineup"][data-tone="off"] {
  background: #eceef1 !important; border-color: #d4d9e2 !important; color: #9aa1ad !important;
}
/* live lineup update just changed this bubble: gold pulse for a few seconds */
.nfbc-sl-bubble-flash {
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(201, 162, 39, 0.65);
  transition: box-shadow 0.4s ease;
}
/* schedule view: the day grid already shows every opponent, so the condensed
   game-count line ("3: 3MIA") under the name is redundant */
.nfbc-sl-row--schedule [data-nfbc-ext="game-count"] {
  display: none !important;
}

/* --- panel: category strength + section titles --- */
#nfbc-setlineup-shell .nfbc-sl-section-title,
#nfbc-setlineup-shell .nfbc-panel-section-title {
  color: #6b7280;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  margin: 8px 0 4px;
  text-transform: uppercase;
}
#nfbc-setlineup-shell .nfbc-chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
#nfbc-setlineup-shell .nfbc-chip-cell {
  align-items: baseline;
  background: #f7f9fc;
  border: 1px solid #e3e7ee;
  border-radius: 5px;
  display: inline-flex;
  gap: 5px;
  justify-content: space-between;
  min-width: 64px;
  padding: 2px 8px;
}
#nfbc-setlineup-shell .nfbc-chip-label {
  color: #6b7280;
  font-size: 10px;
  font-weight: 700;
}
#nfbc-setlineup-shell .nfbc-chip-value {
  color: #111827;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
/* category strength: a real red-to-green gradient so weak/strong categories
   jump out \u2014 elite deep green, poor unmistakably red, values tinted to match */
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="elite"] {
  background: #b5e6c6; border-color: #4caf72;
}
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="elite"] .nfbc-chip-value {
  color: #14532d;
}
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="positive"],
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="strong"] {
  background: #ddf1e3; border-color: #8fcaa5;
}
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="strong"] .nfbc-chip-value,
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="positive"] .nfbc-chip-value {
  color: #166534;
}
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="warning"],
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="weak"] {
  background: #fde3cd; border-color: #e2a268;
}
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="weak"] .nfbc-chip-value,
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="warning"] .nfbc-chip-value {
  color: #9a4a06;
}
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="poor"],
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="danger"] {
  background: #f6c8c8; border-color: #d76e6e;
}
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="poor"] .nfbc-chip-value,
#nfbc-setlineup-shell .nfbc-chip-cell[data-tone="danger"] .nfbc-chip-value {
  color: #991b1b;
}
#nfbc-setlineup-shell .nfbc-note-line {
  color: #6b7280;
  font-size: 11px;
}

/* --- player rows: let cards grow, give chip rails breathing room --- */
.nfbc-sl-row {
  height: auto !important;
  min-height: 0 !important;
  padding-top: 4px;
  padding-bottom: 4px;
}
/* Vertically center the [position circle | photo | info-row] row. Do NOT set
   text-align here \u2014 it cascades into the native slot-circle button and shoves
   the position letter off-center. Left-alignment is scoped to the name area
   (info-row) below so the native bubble keeps its own centered formatting. */
.nfbc-sl-row [data-nfbc-ext="info-pane"] {
  align-items: center !important;
}
.nfbc-sl-row [data-nfbc-ext="info-row"] {
  text-align: left !important;
}
.nfbc-sl-row [data-nfbc-ext="info-row"] div:not([data-nfbc-ext]):not([data-nfbc-ext="schedule-grid"] *) {
  align-items: flex-start !important;
  justify-content: flex-start !important;
  text-align: left !important;
}
/* info-pane is a row-flex of [position circle, photo, info-row]. The two
   leading wrappers must never grow/shrink, and info-row takes the rest \u2014 so
   the name always starts at the same x regardless of slot label width or
   photo state (this is what shifted Kirk/Bleday right). */
.nfbc-sl-row [data-nfbc-ext="info-pane"] > div:not([data-nfbc-ext]) {
  flex: 0 0 auto !important;
}
/* info-row is a COLUMN flex (name-row stacked over the trailing chip rail).
   Its cross axis is therefore horizontal, so align-items must be flex-start \u2014
   the native align-items:center was centering the whole name-row in the
   column and pushing every bench name ~57px right of its pills. */
.nfbc-sl-row [data-nfbc-ext="info-row"] {
  align-items: flex-start !important;
  display: flex !important;
  flex: 1 1 auto !important;
  flex-direction: column !important;
  justify-content: flex-start !important;
  min-width: 0;
}
/* the L30 pill self-right-justifies inline; pin it left on this page */
body[data-nfbc-ext-page="setlineup"] [data-nfbc-ext="l30"] {
  margin-left: 0 !important;
}
/* chip rails are ROW flex, so align-items:center vertically centers chips */
.nfbc-sl-row [data-nfbc-ext="badge-rail"],
.nfbc-sl-row [data-nfbc-ext="secondary-badges"] {
  align-items: center;
  column-gap: 4px;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start !important;
  min-width: 0;
  row-gap: 2px;
}
.nfbc-sl-row [data-nfbc-ext="secondary-badges"] {
  margin-top: 1px;
}
.nfbc-sl-row [data-nfbc-ext="metric-block"] {
  align-items: center;
  column-gap: 3px;
  display: inline-flex;
}
.nfbc-sl-row [data-nfbc-ext="name-text"] {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* one-line identity: name, team, positions, and the projection chip stay on a
   single line so the L30 + warning chips remain a clean second line. Never
   wrap \u2014 when a multi-position player (e.g. "(SS, 2B, 3B)") runs long the name
   ellipsizes instead, so the F-S chip never drops to its own line and pushes
   the rest to a clipped third line. */
.nfbc-sl-row [data-nfbc-ext="name-row"] {
  align-items: center !important;
  /* info-row is a COLUMN flex with align-items:flex-start, which shrink-wraps
     the name-row to its content \u2014 leaving margin-left:auto nothing to push
     into. Stretch it to full width so the bubble + projection chip actually
     pin to the right edge and form vertical columns. */
  align-self: stretch !important;
  column-gap: 6px;
  display: flex !important;
  flex-wrap: nowrap !important;
  justify-content: flex-start !important;
  min-width: 0;
  width: 100%;
}
/* only the name shrinks; team / position / chips keep their size */
.nfbc-sl-row [data-nfbc-ext="name-row"] [data-nfbc-ext="team"],
.nfbc-sl-row [data-nfbc-ext="name-row"] [data-nfbc-ext="position"] {
  flex-shrink: 0;
}
/* The name must be the leftmost item on EVERY row regardless of DOM order:
   NFBC sometimes emits a leading element (batting-order marker, IL tag) that
   otherwise pushes the name right and breaks the left edge of the column
   (e.g. Kirk / Bleday). Pin the name first and chips after with flex order. */
.nfbc-sl-row [data-nfbc-ext="name-text"],
.nfbc-sl-row [data-nfbc-ext="name-row"] a[href*="/player/baseball/"] {
  order: -1;
}
.nfbc-sl-row [data-nfbc-ext="name-row"] [data-nfbc-ext="team"] { order: 1; }
.nfbc-sl-row [data-nfbc-ext="name-row"] [data-nfbc-ext="position"] { order: 2; }
.nfbc-sl-row [data-nfbc-ext="name-row"] [data-nfbc-ext="lineup-slot-native"],
.nfbc-sl-row [data-nfbc-ext="name-row"] [data-nfbc-ext="lineup-slot"] { order: 4; }
.nfbc-sl-row [data-nfbc-ext="name-row"] .nfbc-sl-badge[data-role="raw"] { order: 5; }
.nfbc-sl-row [data-nfbc-ext="name-row"] [data-nfbc-ext="l30"] { order: 6; }
.nfbc-sl-row [data-nfbc-ext="name-row"] .nfbc-sl-badge {
  flex-shrink: 0;
}
/* pin the lineup bubble + period projection chip to the right edge of the
   identity line, both fixed-width, so they form two clean vertical columns
   down the roster. margin-left:auto on the bubble (the first right-cluster
   item) pushes the whole cluster right; the projection chip's fixed width
   keeps the bubble column from drifting. */
.nfbc-sl-row [data-nfbc-ext="name-row"] [data-nfbc-ext="lineup-slot-native"],
.nfbc-sl-row [data-nfbc-ext="name-row"] [data-nfbc-ext="lineup-slot"] {
  margin-left: auto;
}
.nfbc-sl-row [data-nfbc-ext="name-row"] .nfbc-sl-badge[data-role="raw"] {
  justify-content: flex-end;
  min-width: 58px;
}
/* The name is the one element allowed to shrink (and ellipsize) so the rest
   of the identity line \u2014 team, positions, projection chip \u2014 always fits on
   one line. max-width keeps short-name rows from over-reserving space. */
.nfbc-sl-row [data-nfbc-ext="name-text"] {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 220px;
}

/* --- schedule day grid: visible column structure, aligned numerals --- */
.nfbc-sl-row [data-nfbc-ext="schedule-cell"] {
  align-content: center;
  border-left: 1px solid #edf0f4;
  display: grid;
  gap: 1px;
  grid-template-rows: 17px 18px;
  text-align: center;
}
.nfbc-sl-row [data-nfbc-ext="schedule-cell"]:first-child {
  border-left: 0;
}
.nfbc-sl-row [data-nfbc-ext="schedule-top"] {
  align-items: center;
  display: flex;
  gap: 6px;
  justify-content: center;
}
.nfbc-sl-row [data-nfbc-ext="schedule-opponent"] {
  font-weight: 700;
  white-space: nowrap;
}
.nfbc-sl-row [data-role="schedule-hand"] {
  border: 1px solid currentColor;
  box-shadow: none;
  font-size: 11px;
  font-weight: 900 !important;
  line-height: 16px;
  min-height: 18px;
  min-width: 18px;
  padding: 0 4px;
}
.nfbc-sl-row [data-role="schedule-hand"][data-tone="left"] {
  background: #dbeafe;
  border-color: #2563eb;
  color: #1d4ed8;
}
.nfbc-sl-row [data-role="schedule-hand"][data-tone="right"] {
  background: #fee2e2;
  border-color: #dc2626;
  color: #b91c1c;
}
.nfbc-sl-row [data-role="schedule-hand"][data-tone="mixed"] {
  background: #f3e8ff;
  border-color: #9333ea;
  color: #7e22ce;
}
.nfbc-sl-row [data-nfbc-ext="schedule-dh"] {
  background: #f59e0b;
  border-radius: 3px;
  color: #1f2937;
  flex: 0 0 auto;
  font-size: 8px;
  font-weight: 900;
  line-height: 13px;
  padding: 0 3px;
}
.nfbc-sl-row [data-nfbc-ext="schedule-dh-games"] {
  border-top: 1px solid #dbe1e8;
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 0;
  padding-top: 1px;
}
.nfbc-sl-row [data-nfbc-ext="schedule-dh-game"] {
  align-items: center;
  display: flex;
  gap: 3px;
  justify-content: center;
  min-width: 0;
}
.nfbc-sl-row [data-nfbc-ext="schedule-dh-game"] + [data-nfbc-ext="schedule-dh-game"] {
  border-left: 1px solid #dbe1e8;
  padding-left: 4px;
}
.nfbc-sl-row [data-nfbc-ext="schedule-dh-hand"] {
  border: 1px solid currentColor;
  border-radius: 999px;
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 900;
  line-height: 16px;
  min-width: 18px;
  padding: 0 4px;
  text-align: center;
}
.nfbc-sl-row [data-nfbc-ext="schedule-dh-hand"][data-tone="left"] {
  background: #dbeafe;
  border-color: #2563eb;
  color: #1d4ed8;
}
.nfbc-sl-row [data-nfbc-ext="schedule-dh-hand"][data-tone="right"] {
  background: #fee2e2;
  border-color: #dc2626;
  color: #b91c1c;
}
.nfbc-sl-row .gametime,
.nfbc-sl-row [data-nfbc-ext="schedule-time"] {
  display: block;
  font-variant-numeric: tabular-nums;
  text-align: center;
  width: 100%;
}
.nfbc-sl-row [data-nfbc-ext="schedule-dh-game"] [data-nfbc-ext="schedule-time"] {
  width: auto;
}

/* --- probable-start marker (restores NFBC's native start symbol the cell
   rebuild drops, cross-confirmed with the FanGraphs grid) ---
   The native ::before is killed on rebuilt cells so it can't double up. */
.nfbc-sl-row [data-nfbc-ext="schedule-cell"].starting_pitcher::before {
  content: none !important;
}
.nfbc-sl-row [data-nfbc-ext="schedule-start"] {
  font-size: 9px;
  line-height: 1;
  margin-right: 3px;
  vertical-align: 1px;
}
/* both NFBC and FanGraphs agree -> confident green */
.nfbc-sl-row [data-nfbc-ext="schedule-start"][data-tone="confirmed"] { color: #15803d; }
.nfbc-sl-row [data-nfbc-ext="schedule-cell"][data-nfbc-start="confirmed"] {
  background: #ecfdf3;
  box-shadow: inset 0 0 0 1px #9ad6b3;
}
/* NFBC marks a start FanGraphs hasn't posted yet -> gold (NFBC's own logic) */
.nfbc-sl-row [data-nfbc-ext="schedule-start"][data-tone="native"] { color: #b8860b; }
.nfbc-sl-row [data-nfbc-ext="schedule-cell"][data-nfbc-start="native"] {
  background: #fdf7e8;
  box-shadow: inset 0 0 0 1px #e2c789;
}
/* FanGraphs lists a start NFBC hasn't marked -> blue heads-up */
.nfbc-sl-row [data-nfbc-ext="schedule-start"][data-tone="fg"] { color: #1d4ed8; }
.nfbc-sl-row [data-nfbc-ext="schedule-cell"][data-nfbc-start="fg"] {
  background: #eef3ff;
  box-shadow: inset 0 0 0 1px #a8c0f0;
}
/* day-shift: NFBC and FanGraphs disagree on WHICH day \u2014 dashed red ring so the
   "verify before lock" conflict pops regardless of source tint */
.nfbc-sl-row [data-nfbc-ext="schedule-cell"][data-nfbc-start-conflict="true"] {
  outline: 1px dashed #d9534f;
  outline-offset: -2px;
}

/* --- roster section dividers (Starters / Bench): standalone header bars
   inserted between the native cards; they no longer wrap the cards (moving
   the native cards crashed NFBC's reconciler), so the bar is the whole thing --- */
.nfbc-sl-section {
  background: #f7f9fc;
  border: 1px solid #e3e7ee;
  border-radius: 8px;
  margin: 10px 0 2px;
}
.nfbc-sl-section-header {
  align-items: center;
  border-radius: 8px;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  padding: 5px 12px;
}
.nfbc-sl-section-title-row {
  align-items: baseline;
  display: flex;
  gap: 8px;
}
.nfbc-sl-section-label {
  color: #16365c;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.nfbc-sl-section-summary {
  color: #6b7280;
  font-size: 11px;
}
.nfbc-sl-section-toggle {
  background: #ffffff;
  border: 1px solid #c2c9d6;
  border-radius: 5px;
  color: #374151;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 8px;
}
.nfbc-sl-section-body {
  padding: 2px 6px 6px;
}

/* --- native chrome the extension replaces ---
   The native schedule-display select stays in the DOM (the toolbar toggle
   drives it) but is hidden; the duplicated card title disappears; the gray
   "No Changes" pill becomes quiet status text. Tags applied in setlineup.ts. */
[data-nfbc-native="schedule-select"],
[data-nfbc-native="card-title"] {
  display: none !important;
}
[data-nfbc-native="no-changes"] {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  color: #6b7280 !important;
  cursor: default !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  padding: 0 !important;
}
[data-nfbc-native="no-changes"]::before {
  color: #15803d;
  content: "\u2713 ";
}
[data-nfbc-native="date-header"] {
  background: #f7f9fc;
  border-bottom: 1px solid #e3e7ee;
  border-radius: 6px 6px 0 0;
  color: #16365c;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  padding: 4px 0;
}

/* --- recommended swaps: leads the shell so the moves to make come first --- */
#nfbc-setlineup-shell .nfbc-sl-swaps {
  align-items: center;
  background: #fdf6e7;
  border: 1px solid #ecd9a8;
  border-radius: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 8px;
  padding: 6px 10px;
}
#nfbc-setlineup-shell .nfbc-sl-swaps-label {
  color: #92600a;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  margin-right: 4px;
  text-transform: uppercase;
}
/* cleared state: lineup already matches the optimizer */
#nfbc-setlineup-shell .nfbc-sl-swaps[data-state="optimized"] {
  background: #eef8f0;
  border-color: #b5dec3;
}
#nfbc-setlineup-shell .nfbc-sl-swaps[data-state="optimized"] .nfbc-sl-swaps-label {
  color: #166534;
  margin-right: 0;
}
#nfbc-setlineup-shell .nfbc-sl-swap-chip {
  background: #ffffff;
  border: 1px solid #e3cfa0;
  border-radius: 5px;
  color: #374151;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  white-space: nowrap;
}
#nfbc-setlineup-shell .nfbc-sl-swap-chip[data-direction="in"] {
  background: #ddf1e3;
  border-color: #8fcaa5;
  color: #166534;
}
#nfbc-setlineup-shell .nfbc-sl-swap-chip[data-direction="out"] {
  background: #fdf0f0;
  border-color: #d9b1b1;
  color: #7f1d1d;
}
#nfbc-setlineup-shell .nfbc-sl-swap-chip[data-direction="none"] {
  background: #eef8f0;
  border-color: #b5dec3;
  color: #166534;
}
/* dual view: stack the team-context and raw-SGP sections, each its own row */
#nfbc-setlineup-shell .nfbc-sl-swaps:has(.nfbc-sl-swap-group) {
  align-items: stretch;
  flex-direction: column;
}
#nfbc-setlineup-shell .nfbc-sl-swap-group {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
}

#nfbc-setlineup-shell .nfbc-sl-projection-blocker {
  align-items: flex-start;
  background: #fff1f2;
  border: 1px solid #fda4af;
  border-radius: 6px;
  color: #881337;
  display: flex;
  font-size: 12px;
  gap: 10px;
  justify-content: space-between;
  padding: 7px 9px;
  width: 100%;
}

#nfbc-setlineup-shell .nfbc-sl-projection-blocker--resolved {
  background: #ecfdf3;
  border-color: #86c79d;
  color: #166534;
  display: grid;
  gap: 2px;
}

#nfbc-setlineup-shell .nfbc-sl-projection-blocker__copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

#nfbc-setlineup-shell .nfbc-sl-projection-blocker__summary {
  display: block;
  font-size: 13px;
  font-weight: 800;
}

#nfbc-setlineup-shell .nfbc-sl-projection-blocker__outcome,
#nfbc-setlineup-shell .nfbc-sl-projection-blocker__freshness {
  display: block;
  font-weight: 500;
  line-height: 1.35;
}

#nfbc-setlineup-shell .nfbc-sl-projection-blocker__freshness {
  color: #9f1239;
  font-size: 11px;
}

#nfbc-setlineup-shell .nfbc-sl-projection-blocker--resolved .nfbc-sl-projection-blocker__freshness {
  color: #166534;
}

#nfbc-setlineup-shell .nfbc-sl-projection-blocker__details {
  font-weight: 600;
  margin-top: 2px;
}

#nfbc-setlineup-shell .nfbc-sl-projection-blocker__details summary {
  cursor: pointer;
  width: fit-content;
}

#nfbc-setlineup-shell .nfbc-sl-projection-blocker__details ul {
  display: grid;
  gap: 3px;
  margin: 5px 0 0;
  padding-left: 18px;
}

#nfbc-setlineup-shell .nfbc-sl-projection-blocker .nfbc-action-button {
  flex: 0 0 auto;
  white-space: nowrap;
}

@media (max-width: 760px) {
  #nfbc-setlineup-shell .nfbc-sl-projection-blocker {
    align-items: stretch;
    flex-direction: column;
  }

  #nfbc-setlineup-shell .nfbc-sl-projection-blocker .nfbc-action-button {
    align-self: flex-start;
  }
}

/* text-align catch-all for non-div nodes the flex sweep above misses, scoped
   to the name area so it never touches the native position-circle button */
.nfbc-sl-row [data-nfbc-ext="info-row"] :not([data-nfbc-ext="schedule-grid"]):not([data-nfbc-ext="schedule-grid"] *) {
  text-align: left !important;
}

/* the row card must grow to fit a wrapped warning line (e.g. \u26A0 PT\xB7PI\xB7LPA on
   a third line) instead of clipping it under the next row's border */
.nfbc-sl-row {
  overflow: visible !important;
}
.nfbc-sl-row [data-nfbc-ext="info-pane"] {
  overflow: visible !important;
}

/* zebra striping: parity tagged in JS (cards share the container with header
   bars + native chrome, so :nth-of-type can't isolate them) */
.Player[data-can-set-lineup="1"][data-nfbc-stripe="1"] {
  background: #f7f9fc;
}

/* Full-roster recommendation scan: keep native row content and state intact,
   then add a restrained directional rail + inset wash around every move. */
.Player[data-can-set-lineup="1"].nfbc-sl-row--changed[data-nfbc-recommendation="start"] {
  box-shadow: inset 5px 0 #15803d, inset 0 0 0 1px #86c79d !important;
  outline: 2px solid rgba(21, 128, 61, 0.16);
  outline-offset: -2px;
}
.Player[data-can-set-lineup="1"].nfbc-sl-row--changed[data-nfbc-recommendation="bench"] {
  background-color: #fff1f2 !important;
  box-shadow: inset 5px 0 #b42318, inset 0 0 0 1px #e2a29d !important;
  outline: 2px solid rgba(180, 35, 24, 0.14);
  outline-offset: -2px;
}
.Player[data-can-set-lineup="1"].nfbc-sl-row--changed[data-nfbc-recommendation="start"]::before {
  background: #15803d !important;
}
.Player[data-can-set-lineup="1"].nfbc-sl-row--changed[data-nfbc-recommendation="bench"]::before {
  background: #b42318 !important;
}

/* view toggles operate on the cards in place (cards are no longer reparented):
   collapse hides bench cards, only-changes hides untouched cards */
body[data-nfbc-sl-bench-collapsed="true"] .Player[data-can-set-lineup="1"][data-nfbc-bench="true"] {
  display: none !important;
}
body[data-nfbc-sl-only-changes="true"] .Player[data-can-set-lineup="1"]:not(.nfbc-sl-row--changed):not(.nfbc-sl-row--saved) {
  display: none !important;
}

/* persistent active-IL chip: unmistakable red, same weight as IL NEW */
.nfbc-sl-badge[data-nfbc-il-active="true"] {
  background: #fdeeee;
  border-color: #ecc2c2;
  color: #b91c1c;
}

/* left team-menu indicator: a small gold pill just before a team's name
   showing how many optimizer moves are available for that team. The count is
   rendered via ::before so the <i> carries no text node (keeps the page's
   span/text-based team-name parsing untouched). */
.nfbc-team-opt-flag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  margin-right: 6px;
  padding: 0 4px;
  border-radius: 8px;
  background: #f0b832;
  color: #0a1628;
  font-size: 10px;
  font-weight: 800;
  font-style: normal;
  line-height: 16px;
  vertical-align: middle;
  box-sizing: border-box;
  cursor: help;
}
.nfbc-team-opt-flag::before {
  content: attr(data-count);
}
`;
  function applyReadabilityTheme(page) {
    document.body.dataset.nfbcExtReadability = page === "setlineup" ? "native" : "on";
    document.body.dataset.nfbcExtPage = page;
    const existing = document.getElementById(THEME_STYLE_ID);
    const style = existing ?? document.createElement("style");
    style.id = THEME_STYLE_ID;
    style.textContent = page === "setlineup" ? SET_LINEUP_NATIVE : [
      BASE_THEME,
      page === "setlineupall" ? SET_LINEUP_ALL_THEME : "",
      page === "freeagents" ? FREE_AGENTS_THEME : ""
    ].join("\n");
    if (!existing) {
      document.head.append(style);
    }
  }
  __name(applyReadabilityTheme, "applyReadabilityTheme");

  // src/core/category_gain.ts
  var GAIN_CATEGORIES = ["R", "HR", "RBI", "SB", "AVG"];
  var SD_PER_GAME = {
    R: 3.22,
    HR: 1.19,
    RBI: 3.12,
    SB: 1.04,
    AVG: 2.74
  };
  var LEAGUE_AVG = 0.2438;
  var DISPERSION_PER_GAME = {
    R: Number.POSITIVE_INFINITY,
    HR: Number.POSITIVE_INFINITY,
    RBI: 0.79,
    SB: Number.POSITIVE_INFINITY
  };
  var CONTRIBUTION_THRESHOLD = {
    R: 2,
    RBI: 2,
    HR: 1,
    SB: 1
  };
  function contributionThreshold(category) {
    return CONTRIBUTION_THRESHOLD[category] ?? 1;
  }
  __name(contributionThreshold, "contributionThreshold");
  function normalPdf(z) {
    return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  }
  __name(normalPdf, "normalPdf");
  function normalCdf(z) {
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  }
  __name(normalCdf, "normalCdf");
  function differentialSd(category, games) {
    const perGame = SD_PER_GAME[category];
    if (!perGame) return 0;
    const spans = Number.isFinite(games) && games > 0 ? games : 3;
    return perGame * Math.sqrt(2 * spans);
  }
  __name(differentialSd, "differentialSd");
  function probabilityOfContribution(category, expected, games = 3) {
    const k = contributionThreshold(category);
    if (!Number.isFinite(expected) || expected <= 0) return 0;
    const perGame = DISPERSION_PER_GAME[category] ?? Number.POSITIVE_INFINITY;
    const spans = Number.isFinite(games) && games > 0 ? games : 3;
    let p0;
    let p1;
    if (!Number.isFinite(perGame)) {
      p0 = Math.exp(-expected);
      p1 = expected * p0;
    } else {
      const r = perGame * spans;
      const p = r / (r + expected);
      p0 = Math.pow(p, r);
      p1 = r * (1 - p) * p0;
    }
    return k <= 1 ? 1 - p0 : Math.max(0, 1 - p0 - p1);
  }
  __name(probabilityOfContribution, "probabilityOfContribution");
  function probabilityOfHelpingAverage(hits, atBats) {
    if (!Number.isFinite(atBats) || atBats <= 0) return 0;
    if (!Number.isFinite(hits) || hits < 0) return 0;
    const p = Math.min(0.999, Math.max(1e-3, hits / atBats));
    const sd = Math.sqrt(atBats * p * (1 - p));
    if (sd <= 0) return p > LEAGUE_AVG ? 1 : 0;
    return 1 - normalCdf((LEAGUE_AVG * atBats + 0.5 - atBats * p) / sd);
  }
  __name(probabilityOfHelpingAverage, "probabilityOfHelpingAverage");
  function pickGainCategory(gaps, swingByCategory, games = 3, minValue = 4e-3) {
    if (!gaps) return void 0;
    let best;
    for (const category of GAIN_CATEGORIES) {
      const gap = gaps[category]?.gain;
      const swing = swingByCategory[category] ?? 0;
      if (gap == null || !Number.isFinite(gap) || gap < 0) continue;
      if (!Number.isFinite(swing) || swing <= 0) continue;
      const sd = differentialSd(category, games);
      if (sd <= 0) continue;
      const value = normalPdf(gap / sd) * (swing / sd);
      if (!best || value > best.value) {
        best = {
          category,
          gap,
          sd,
          swing,
          value,
          pointChance: 1 - normalCdf(gap / sd)
        };
      }
    }
    return best && best.value >= minValue ? best : void 0;
  }
  __name(pickGainCategory, "pickGainCategory");
  function gainTone(probability) {
    if (probability >= 0.5) return "elite";
    if (probability >= 0.3) return "strong";
    if (probability >= 0.12) return "weak";
    return "neutral";
  }
  __name(gainTone, "gainTone");

  // src/core/contextual_math.ts
  function usesLateSeasonContext(contexts, progress) {
    return progress >= 26 / 27 && contexts.some((context) => Object.values(context.categories).some((gap) => gap.fieldGaps?.some(Number.isFinite)));
  }
  __name(usesLateSeasonContext, "usesLateSeasonContext");
  function seasonProgressWeight(progress) {
    if (progress <= 0.5) return 0;
    if (progress <= 0.7) return (progress - 0.5) / 0.2 * 0.35;
    if (progress <= 0.85) return 0.35 + (progress - 0.7) / 0.15 * 0.3;
    if (progress <= 1) return 0.65 + (progress - 0.85) / 0.15 * 0.2;
    return 0.85;
  }
  __name(seasonProgressWeight, "seasonProgressWeight");
  function categoryMultiplier(category, contexts, progress) {
    if (contexts.length === 0) {
      return 1;
    }
    const weight = Math.min(0.85, seasonProgressWeight(progress));
    return contexts.reduce((max, row) => {
      const gap = row.categories[category];
      if (!gap) {
        return max;
      }
      return Math.max(max, 1 + CONTEXT_BUCKETS[gap.tag] * weight);
    }, 1);
  }
  __name(categoryMultiplier, "categoryMultiplier");
  function pointOpportunity(gap, sgpDivisor) {
    if (gap == null || !Number.isFinite(gap) || !Number.isFinite(sgpDivisor) || sgpDivisor === 0) return 0;
    return 1 / (1 + Math.abs(gap / sgpDivisor));
  }
  __name(pointOpportunity, "pointOpportunity");
  function expectedPointMultipliers(contexts, progress, profile) {
    if (usesLateSeasonContext(contexts, progress)) {
      return lateSeasonMultipliers(contexts, profile);
    }
    const seasonWeight = Math.min(0.85, seasonProgressWeight(progress));
    return Object.fromEntries(Object.keys(profile.sgpFactors).map((category) => {
      const divisor = Math.abs(profile.sgpFactors[category]);
      const leverage = contexts.reduce((best, context) => {
        const gap = context.categories[category];
        if (!gap || gap.tag === "neutral") return best;
        const distance = gap.tag === "attack" ? gap.gain : gap.loss;
        return Math.max(best, CONTEXT_BUCKETS[gap.tag] * pointOpportunity(distance, divisor));
      }, 0);
      return [category, 1 + leverage * seasonWeight];
    }));
  }
  __name(expectedPointMultipliers, "expectedPointMultipliers");
  function lateSeasonMultipliers(contexts, profile) {
    const categories = Object.keys(profile.sgpFactors);
    const densities = {};
    for (const category of categories) {
      const divisor = Math.abs(profile.sgpFactors[category]);
      if (!(divisor > 0)) continue;
      for (const context of contexts) {
        const gap = context.categories[category];
        if (!gap) continue;
        const distances = (gap.fieldGaps ?? [gap.gain, gap.loss]).filter((value) => value != null && Number.isFinite(value) && value >= 0);
        if (!distances.length) continue;
        const density = distances.reduce((sum, distance) => sum + Math.exp(-0.5 * (distance / divisor) ** 2), 0);
        densities[category] = Math.max(densities[category] ?? 0, density);
      }
    }
    const values = Object.values(densities);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Object.fromEntries(categories.map((category) => [
      category,
      densities[category] == null || !(mean > 1e-12) ? 1 : Math.max(0.15, Math.min(4, densities[category] / mean))
    ]));
  }
  __name(lateSeasonMultipliers, "lateSeasonMultipliers");
  function contextualizeBreakdown(breakdown, context, progress, profile, precomputed) {
    const contexts = Array.isArray(context) ? context : context ? [context] : [];
    if (contexts.length === 0) {
      return Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    }
    const multipliers = precomputed ?? (profile ? expectedPointMultipliers(contexts, progress, profile) : void 0);
    return Object.entries(breakdown).reduce((sum, [category, value]) => sum + value * (multipliers?.[category] ?? categoryMultiplier(category, contexts, progress)), 0);
  }
  __name(contextualizeBreakdown, "contextualizeBreakdown");

  // src/core/player_match.ts
  function posKey(pos) {
    if (pos === "LF" || pos === "CF" || pos === "RF") return "OF";
    if (pos === "DH") return "UT";
    return pos;
  }
  __name(posKey, "posKey");
  function positionsOverlap(left, right) {
    const rightKeys = new Set(right.map(posKey));
    return left.some((pos) => rightKeys.has(posKey(pos)));
  }
  __name(positionsOverlap, "positionsOverlap");
  function uniqueNameCandidates(row, projections) {
    const rowName = row.normalizedName || normalizeName(row.playerName);
    return projections.filter((projection) => projection.normalizedName === rowName);
  }
  __name(uniqueNameCandidates, "uniqueNameCandidates");
  function formatPositions(positions) {
    return positions.join("/") || "?";
  }
  __name(formatPositions, "formatPositions");
  function matchPlayer(row, projections) {
    if (row.pagePlayerId) {
      const byId = projections.find((projection) => projection.nfbcPlayerId === row.pagePlayerId);
      if (byId) {
        return { projection: byId, status: "matched" };
      }
    }
    const rowName = row.normalizedName || normalizeName(row.playerName);
    const rowTeam = row.normalizedTeam || normalizeTeam(row.mlbTeam);
    const candidates = projections.filter((projection) => {
      return projection.normalizedName === rowName && projection.normalizedTeam === rowTeam;
    });
    if (candidates.length === 1) {
      return { projection: candidates[0], status: "matched" };
    }
    const narrowed = candidates.filter((projection) => positionsOverlap(row.eligiblePositions, projection.positions));
    if (narrowed.length === 1) {
      return { projection: narrowed[0], status: "matched" };
    }
    const uniqueByName = uniqueNameCandidates(row, projections);
    if (uniqueByName.length === 1) {
      return { projection: uniqueByName[0], status: "matched" };
    }
    if (uniqueByName.length === 0) {
      const rowLoose = looseName(rowName);
      if (rowLoose) {
        const looseCandidates = projections.filter(
          (projection) => looseName(projection.normalizedName) === rowLoose
        );
        const looseExact = looseCandidates.filter((projection) => projection.normalizedTeam === rowTeam);
        if (looseExact.length === 1) {
          return { projection: looseExact[0], status: "matched" };
        }
        if (looseExact.length > 1) {
          const looseExactNarrowed = looseExact.filter(
            (projection) => positionsOverlap(row.eligiblePositions, projection.positions)
          );
          if (looseExactNarrowed.length === 1) {
            return { projection: looseExactNarrowed[0], status: "matched" };
          }
          return {
            status: "unmatched",
            reason: `Projection position mismatch (page=${formatPositions(row.eligiblePositions)}, team=${rowTeam ?? "?"}, exact=${looseExact.length})`
          };
        }
        if (looseCandidates.length === 1) {
          return { projection: looseCandidates[0], status: "matched" };
        }
      }
      return {
        status: "unmatched",
        reason: `Projection missing for current period (team=${rowTeam ?? "?"}, pos=${formatPositions(row.eligiblePositions)})`
      };
    }
    if (candidates.length > 1 && narrowed.length === 0) {
      return {
        status: "unmatched",
        reason: `Projection position mismatch (page=${formatPositions(row.eligiblePositions)}, team=${rowTeam ?? "?"}, exact=${candidates.length})`
      };
    }
    if (narrowed.length > 1 || candidates.length > 1 || uniqueByName.length > 1) {
      return {
        status: "unmatched",
        reason: `Projection duplicate ambiguity (team=${rowTeam ?? "?"}, pos=${formatPositions(row.eligiblePositions)}, exact=${candidates.length}, exactPos=${narrowed.length}, uniqueName=${uniqueByName.length})`
      };
    }
    return {
      status: "unmatched",
      reason: `Conservative match blocked (team=${rowTeam ?? "?"}, pos=${formatPositions(row.eligiblePositions)}, exact=${candidates.length}, exactPos=${narrowed.length}, uniqueName=${uniqueByName.length})`
    };
  }
  __name(matchPlayer, "matchPlayer");

  // src/core/sgp_math.ts
  function n(value) {
    return value ?? 0;
  }
  __name(n, "n");
  function avgSgp(hits, atBats, profile) {
    const { baseHits, baseAB, baseline, divisor } = profile.ratio.avg;
    return ((baseHits + hits) / (baseAB + atBats) - baseline) / divisor;
  }
  __name(avgSgp, "avgSgp");
  function eraSgp(earnedRuns, inningsPitched, profile) {
    const { baseER, baseIP, baseline, divisor } = profile.ratio.era;
    return ((baseER + earnedRuns) * 9 / (baseIP + inningsPitched) - baseline) / divisor;
  }
  __name(eraSgp, "eraSgp");
  function whipSgp(hitsAllowed, walksAllowed, inningsPitched, profile) {
    const { baseBaseRunners, baseIP, baseline, divisor } = profile.ratio.whip;
    return ((baseBaseRunners + hitsAllowed + walksAllowed) / (baseIP + inningsPitched) - baseline) / divisor;
  }
  __name(whipSgp, "whipSgp");
  function scoreProjection(projection, profile) {
    const breakdown = {};
    if (projection.isHitter) {
      breakdown.R = n(projection.stats.R) / profile.sgpFactors.R;
      breakdown.HR = n(projection.stats.HR) / profile.sgpFactors.HR;
      breakdown.RBI = n(projection.stats.RBI) / profile.sgpFactors.RBI;
      breakdown.SB = n(projection.stats.SB) / profile.sgpFactors.SB;
      breakdown.AVG = avgSgp(n(projection.stats.H), n(projection.stats.AB), profile) - avgSgp(0, 0, profile);
    }
    if (projection.isPitcher) {
      breakdown.W = n(projection.stats.W) / profile.sgpFactors.W;
      breakdown.K = n(projection.stats.K_pitch) / profile.sgpFactors.K;
      breakdown.SV = n(projection.stats.SV) / profile.sgpFactors.SV;
      breakdown.ERA = eraSgp(n(projection.stats.ER), n(projection.stats.IP), profile) - eraSgp(0, 0, profile);
      breakdown.WHIP = whipSgp(n(projection.stats.HA), n(projection.stats.BB_pitch), n(projection.stats.IP), profile) - whipSgp(0, 0, 0, profile);
    }
    return {
      total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
      breakdown
    };
  }
  __name(scoreProjection, "scoreProjection");

  // src/core/optimizer.ts
  function preferProjectionOrderedHitterSlots(idAssignments, slotById, scoredByKey, fixedKeys) {
    const hitterEntries = idAssignments.filter((a) => slotById.get(a.slotId)?.group === "hitter");
    const movable = hitterEntries.filter((a) => !fixedKeys.has(a.playerKey));
    const fixedHitters = hitterEntries.filter((a) => fixedKeys.has(a.playerKey));
    if (movable.length < 2) {
      return idAssignments;
    }
    const others = idAssignments.filter((a) => slotById.get(a.slotId)?.group !== "hitter");
    const slotIds = movable.map((a) => a.slotId);
    const BASE = 1e3;
    const slotTier = /* @__PURE__ */ __name((slot) => {
      if (slot.normalizedLabel === "UT") return 0;
      if (slot.normalizedLabel === "CI" || slot.normalizedLabel === "MI") return 1;
      return 2;
    }, "slotTier");
    const rankedKeys = movable.slice().sort((a, b) => rawProjectionSGP(scoredByKey.get(a.playerKey)) - rawProjectionSGP(scoredByKey.get(b.playerKey))).map((entry) => entry.playerKey);
    const projectionRank = new Map(rankedKeys.map((key, index) => [key, index + 1]));
    const candidates = movable.flatMap((entry) => {
      const scored = scoredByKey.get(entry.playerKey);
      const positions = scored?.row.eligiblePositions ?? [];
      return slotIds.map((slotId) => {
        const slot = slotById.get(slotId);
        const eligible = isEligibleForSlot(positions, slot);
        const weight = eligible ? BASE + (projectionRank.get(entry.playerKey) ?? 0) * slotTier(slot) : Number.NEGATIVE_INFINITY;
        return { playerKey: entry.playerKey, slotId, weight };
      });
    });
    const solved = solveMaximumWeightAssignment(candidates);
    if (solved.assignments.length !== movable.length) {
      return idAssignments;
    }
    const reslotted = solved.assignments.map((a) => ({
      playerKey: a.playerKey,
      slotId: a.slotId,
      weight: decisionSGP(scoredByKey.get(a.playerKey))
    }));
    return [...others, ...fixedHitters, ...reslotted];
  }
  __name(preferProjectionOrderedHitterSlots, "preferProjectionOrderedHitterSlots");
  function decisionSGP(player) {
    return player?.contextualSGP ?? player?.rawSGP ?? 0;
  }
  __name(decisionSGP, "decisionSGP");
  function rawProjectionSGP(player) {
    return player?.rawSGP ?? 0;
  }
  __name(rawProjectionSGP, "rawProjectionSGP");
  var UNAVAILABLE_SLOT_WEIGHT = -1e6;
  function isUnavailableForLineup(row) {
    const status = (row.injuryStatus ?? "").toUpperCase();
    if (!status) {
      return false;
    }
    return /\bIL\b|IL\d|\bSUS\b|\bNA\b|MINOR|MILB|\bAAA\b|\bAA\b/.test(status);
  }
  __name(isUnavailableForLineup, "isUnavailableForLineup");
  function hasPostedStart(player) {
    return (player?.matchedProjection?.confirmedStarts ?? 0) > 0;
  }
  __name(hasPostedStart, "hasPostedStart");
  function isUnavailableForDecision(player) {
    if (player == null) return false;
    return isUnavailableForLineup(player.row) && !hasPostedStart(player);
  }
  __name(isUnavailableForDecision, "isUnavailableForDecision");
  function activeNameUnion(activeRosters) {
    const union = /* @__PURE__ */ new Set();
    activeRosters.forEach((names) => names.forEach((name) => union.add(name)));
    return union;
  }
  __name(activeNameUnion, "activeNameUnion");
  function isBenchMinorWithoutTeam(row, activeNames) {
    if (!row.isBench || row.normalizedTeam || !row.normalizedName) {
      return false;
    }
    return !activeNames.has(row.normalizedName) && !activeNames.has(looseName(row.normalizedName));
  }
  __name(isBenchMinorWithoutTeam, "isBenchMinorWithoutTeam");
  function shouldMarkMinorLeaguer(row, activeRosters, activeNames) {
    if (row.injuryStatus) {
      return false;
    }
    if (row.normalizedTeam) {
      const active2 = activeRosters.get(row.normalizedTeam);
      if (!active2 || active2.size === 0) {
        return false;
      }
      return !active2.has(row.normalizedName) && !active2.has(looseName(row.normalizedName));
    }
    return isBenchMinorWithoutTeam(row, activeNames);
  }
  __name(shouldMarkMinorLeaguer, "shouldMarkMinorLeaguer");
  function shouldMarkRosteredIl(row, status) {
    if (isUnavailableForLineup(row)) return false;
    if (!row.normalizedTeam || !status || status.il.size === 0) return false;
    const loose = looseName(row.normalizedName);
    const onIl = status.il.has(row.normalizedName) || status.il.has(loose);
    const onActive = status.active.has(row.normalizedName) || status.active.has(loose);
    return onIl && !onActive;
  }
  __name(shouldMarkRosteredIl, "shouldMarkRosteredIl");
  function isMinorLeagueStatus(status) {
    const value = (status ?? "").toUpperCase();
    if (/\bIL\b|IL\d|\bSUS\b/.test(value)) {
      return false;
    }
    return /\bNA\b|MINOR|MILB|\bAAA\b|\bAA\b/.test(value);
  }
  __name(isMinorLeagueStatus, "isMinorLeagueStatus");
  function orderSavedRosterByProjection(rows, assignments, scoredPlayers) {
    const assignmentByKey = new Map(assignments.map((a) => [a.playerKey, a.slotId]));
    const scoredByKey = new Map(scoredPlayers.map((p) => [p.row.rowElementKey, p]));
    const projByKey = new Map(scoredPlayers.map((p) => [p.row.rowElementKey, p.matchedProjection]));
    const isReliever = /* @__PURE__ */ __name((key) => {
      const proj = projByKey.get(key);
      return proj != null && (proj.startsProjected ?? 0) < 1;
    }, "isReliever");
    const out = rows.slice();
    let changed = false;
    const score = /* @__PURE__ */ __name((row) => rawProjectionSGP(scoredByKey.get(row.rowElementKey)), "score");
    const stableSortBucket = /* @__PURE__ */ __name((predicate, compare) => {
      const indices = rows.flatMap((row, index) => predicate(row) ? [index] : []);
      if (indices.length < 2) return;
      const original = indices.map((index) => rows[index]);
      const ordered = original.slice().sort(compare);
      if (ordered.every((row, index) => row === original[index])) return;
      changed = true;
      indices.forEach((rowIndex, index) => {
        out[rowIndex] = ordered[index];
      });
    }, "stableSortBucket");
    const pitcherCompare = /* @__PURE__ */ __name((a, b) => Number(isReliever(a.rowElementKey)) - Number(isReliever(b.rowElementKey)) || score(b) - score(a), "pitcherCompare");
    const isPitcher = /* @__PURE__ */ __name((row) => row.eligiblePositions.length > 0 && row.eligiblePositions.every((position2) => position2 === "P"), "isPitcher");
    const activeHitterSlots = new Set(assignments.map((a) => a.slotId).filter((slot) => slot !== "P"));
    activeHitterSlots.forEach((slot) => stableSortBucket(
      (row) => assignmentByKey.get(row.rowElementKey) === slot,
      (a, b) => score(b) - score(a)
    ));
    stableSortBucket((row) => assignmentByKey.get(row.rowElementKey) === "P", pitcherCompare);
    stableSortBucket(
      (row) => !assignmentByKey.has(row.rowElementKey) && !isPitcher(row),
      (a, b) => score(b) - score(a)
    );
    stableSortBucket(
      (row) => !assignmentByKey.has(row.rowElementKey) && isPitcher(row),
      pitcherCompare
    );
    return changed ? out : rows;
  }
  __name(orderSavedRosterByProjection, "orderSavedRosterByProjection");
  function hitterPaReference(projections) {
    const pas = projections.filter((p) => p.isHitter && !p.isPitcher && (p.stats.PA ?? 0) > 0).map((p) => p.stats.PA).sort((a, b) => a - b);
    if (pas.length === 0) return 0;
    return pas[Math.min(pas.length - 1, Math.floor(pas.length * 0.85))];
  }
  __name(hitterPaReference, "hitterPaReference");
  function lowVolumeWarnings(projection, hitterPaRef = 0) {
    if (!projection) return [];
    const warnings = [];
    if (projection.isHitter) {
      const threshold = hitterPaRef > 0 ? hitterPaRef * 0.4 : 8;
      if ((projection.stats.PA ?? 0) < threshold) {
        warnings.push("Low hitter volume");
      }
    }
    if (projection.isPitcher) {
      const ip = projection.stats.IP ?? 0;
      const wins = projection.stats.W ?? 0;
      const saves = projection.stats.SV ?? 0;
      if (ip < 0.35 && wins < 0.15 && saves < 0.15) {
        warnings.push("Low pitcher volume");
      }
    }
    return warnings;
  }
  __name(lowVolumeWarnings, "lowVolumeWarnings");
  function scoreRoster(rows, projections, profile, context, seasonProgress) {
    const hitterPaRef = hitterPaReference(projections);
    const multipliers = expectedPointMultipliers(context ?? [], seasonProgress, profile);
    return rows.map((row) => {
      const matched = matchPlayer(row, projections);
      if (!matched.projection) {
        const pitcherSlot = row.currentSlot === "P" || row.eligiblePositions.length > 0 && row.eligiblePositions.every((pos) => pos === "P");
        if (row.isActive && (row.isLocked || pitcherSlot)) {
          return {
            row,
            matchStatus: "matched",
            rawSGP: 0,
            contextualSGP: 0,
            categoryBreakdown: {},
            warnings: pitcherSlot && !row.isLocked ? ["No start in this period's projection feed (counted as 0 SGP)"] : [],
            lockedProjectionGap: true
          };
        }
        return {
          row,
          matchStatus: "unmatched",
          rawSGP: null,
          contextualSGP: null,
          categoryBreakdown: {},
          warnings: [matched.reason ?? "Unmatched projection"]
        };
      }
      const scored = scoreProjection(matched.projection, profile);
      return {
        row,
        matchedProjection: matched.projection,
        matchStatus: "matched",
        rawSGP: scored.total,
        contextualSGP: contextualizeBreakdown(scored.breakdown, context, seasonProgress, profile, multipliers),
        categoryBreakdown: scored.breakdown,
        warnings: lowVolumeWarnings(matched.projection, hitterPaRef)
      };
    });
  }
  __name(scoreRoster, "scoreRoster");
  function contextSwapDrivers(contextActive, rawActive, contexts, seasonProgress, profile) {
    if (!contexts || contexts.length === 0) {
      return [];
    }
    const sumByCategory = /* @__PURE__ */ __name((players) => {
      const totals = {};
      for (const player of players) {
        for (const [category, value] of Object.entries(player.categoryBreakdown)) {
          totals[category] = (totals[category] ?? 0) + value;
        }
      }
      return totals;
    }, "sumByCategory");
    const ctx = sumByCategory(contextActive);
    const raw = sumByCategory(rawActive);
    const multipliers = expectedPointMultipliers(contexts, seasonProgress, profile);
    const categories = /* @__PURE__ */ new Set([...Object.keys(ctx), ...Object.keys(raw)]);
    const scored = [];
    for (const category of categories) {
      const delta = (ctx[category] ?? 0) - (raw[category] ?? 0);
      const extra = delta * ((multipliers[category] ?? 1) - 1);
      if (extra > 1e-6) {
        scored.push({ category, extra });
      }
    }
    return scored.sort((a, b) => b.extra - a.extra).map((entry) => entry.category);
  }
  __name(contextSwapDrivers, "contextSwapDrivers");
  function optimizeLineup(rows, slots, projections, profile, context, seasonProgress) {
    const scoredPlayers = scoreRoster(rows, projections, profile, context, seasonProgress);
    const activeSlots = slots.filter((slot) => slot.group !== "bench");
    const activePlayers = scoredPlayers.filter((player) => player.row.isActive);
    const rowMap = new Map(scoredPlayers.map((player) => [player.row.rowElementKey, player]));
    const slotIdByRowKey = new Map(
      activePlayers.map((player, index) => [player.row.rowElementKey, activeSlots[index]?.id ?? player.row.currentSlot])
    );
    const slotLabelById = new Map(activeSlots.map((slot) => [slot.id, slot.label]));
    const slotById = new Map(activeSlots.map((slot) => [slot.id, slot]));
    const warnings = [];
    const lineupValue = /* @__PURE__ */ __name((player) => player == null || isUnavailableForDecision(player) ? 0 : decisionSGP(player), "lineupValue");
    const lineupValueOf = /* @__PURE__ */ __name((playerKey) => lineupValue(rowMap.get(playerKey)), "lineupValueOf");
    const pinnedRows = scoredPlayers.filter((player) => {
      if (player.row.isLocked && player.row.isBench) return true;
      if (player.row.isLocked && player.row.isActive) return true;
      if (player.row.isActive && player.matchStatus === "unmatched") return true;
      return false;
    });
    const pinnedSlotIds = /* @__PURE__ */ new Set();
    const currentAssignmentsById = [];
    let currentTotal = 0;
    for (const player of activePlayers) {
      const slotId = slotIdByRowKey.get(player.row.rowElementKey) ?? player.row.currentSlot;
      currentAssignmentsById.push({
        playerKey: player.row.rowElementKey,
        slotId,
        weight: lineupValue(player)
      });
      currentTotal += lineupValue(player);
    }
    const pinnedKeys = /* @__PURE__ */ new Set();
    for (const player of pinnedRows) {
      if (player.row.isActive) {
        pinnedSlotIds.add(slotIdByRowKey.get(player.row.rowElementKey) ?? player.row.currentSlot);
        pinnedKeys.add(player.row.rowElementKey);
      }
    }
    const openSlots = activeSlots.filter((slot) => !pinnedSlotIds.has(slot.id));
    const candidates = scoredPlayers.filter((player) => {
      if (player.matchStatus !== "matched" || player.rawSGP == null) return false;
      if (pinnedRows.includes(player)) return false;
      if (player.row.isLocked && player.row.isBench) return false;
      if (player.row.isBench && isUnavailableForDecision(player)) return false;
      return true;
    });
    const weightedCandidates = candidates.flatMap(
      (player) => openSlots.map((slot) => ({
        playerKey: player.row.rowElementKey,
        slotId: slot.id,
        weight: !isEligibleForSlot(player.row.eligiblePositions, slot) ? Number.NEGATIVE_INFINITY : !isUnavailableForDecision(player) ? decisionSGP(player) : slot.id === slotIdByRowKey.get(player.row.rowElementKey) ? UNAVAILABLE_SLOT_WEIGHT : Number.NEGATIVE_INFINITY
      }))
    );
    const optimizedAssignments = solveMaximumWeightAssignment(weightedCandidates);
    const filledSlotIds = new Set(optimizedAssignments.assignments.map((a) => a.slotId));
    const optimizedKeys = new Set(optimizedAssignments.assignments.map((a) => a.playerKey));
    const keptIncumbents = activePlayers.filter((player) => !optimizedKeys.has(player.row.rowElementKey)).map((player) => ({ player, slotId: slotIdByRowKey.get(player.row.rowElementKey) })).filter((entry) => entry.slotId != null && !pinnedSlotIds.has(entry.slotId) && !filledSlotIds.has(entry.slotId)).map(({ player, slotId }) => {
      filledSlotIds.add(slotId);
      return { playerKey: player.row.rowElementKey, slotId, weight: lineupValue(player) };
    });
    const pinnedAssignments = pinnedRows.filter((player) => player.row.isActive).map((player) => ({
      playerKey: player.row.rowElementKey,
      slotId: slotIdByRowKey.get(player.row.rowElementKey) ?? player.row.currentSlot,
      weight: lineupValue(player)
    }));
    let allAssignments = [...pinnedAssignments, ...optimizedAssignments.assignments, ...keptIncumbents].map((assignment) => ({ ...assignment, weight: lineupValueOf(assignment.playerKey) }));
    const labelTally = /* @__PURE__ */ __name((labels) => {
      const tally2 = /* @__PURE__ */ new Map();
      labels.forEach((label) => tally2.set(label, (tally2.get(label) ?? 0) + 1));
      return tally2;
    }, "labelTally");
    const expectedShape = labelTally(activeSlots.map((slot) => slot.label));
    const proposedShape = labelTally(
      allAssignments.map((assignment) => slotLabelById.get(assignment.slotId) ?? assignment.slotId)
    );
    const shapeMismatches = Array.from(expectedShape.entries()).filter(([label, count]) => (proposedShape.get(label) ?? 0) !== count).map(([label, count]) => `${label} (${proposedShape.get(label) ?? 0}/${count})`);
    if (shapeMismatches.length > 0 || proposedShape.size !== expectedShape.size) {
      warnings.push(`Kept the current lineup: proposed slots did not match the league's layout \u2014 ${shapeMismatches.join(", ")}`);
      allAssignments = currentAssignmentsById.map((assignment) => ({
        ...assignment,
        weight: lineupValueOf(assignment.playerKey)
      }));
    }
    const optimizedTotal = allAssignments.reduce((sum, item) => sum + item.weight, 0);
    const serializableAssignments = preferProjectionOrderedHitterSlots(allAssignments, slotById, rowMap, pinnedKeys).map((assignment) => ({
      ...assignment,
      slotId: slotLabelById.get(assignment.slotId) ?? assignment.slotId
    }));
    const optimizerSerialized = allAssignments.map((assignment) => ({
      ...assignment,
      slotId: slotLabelById.get(assignment.slotId) ?? assignment.slotId
    }));
    const promotions = optimizerSerialized.map((assignment) => {
      const row = rowMap.get(assignment.playerKey)?.row;
      if (!row || row.isActive) return null;
      return {
        playerKey: assignment.playerKey,
        from: row.currentSlot,
        to: assignment.slotId
      };
    }).filter((change) => change !== null);
    const assignedKeys = new Set(optimizerSerialized.map((assignment) => assignment.playerKey));
    const demotions = scoredPlayers.filter((player) => player.row.isActive && !assignedKeys.has(player.row.rowElementKey)).map((player) => ({ playerKey: player.row.rowElementKey, from: player.row.currentSlot, to: "BN" }));
    const changes = [...promotions, ...demotions];
    const unmatchedActivePlayers = scoredPlayers.filter((player) => player.row.isActive && player.matchStatus === "unmatched");
    if (unmatchedActivePlayers.length > 0) {
      const label = /* @__PURE__ */ __name((player) => {
        const team = player.row.mlbTeam || "?";
        return `${player.row.playerName} (${team}, ${player.row.currentSlot})`;
      }, "label");
      const grouped = {
        team: [],
        position: [],
        duplicate: [],
        blocked: []
      };
      unmatchedActivePlayers.forEach((player) => {
        const reason = player.warnings[0] ?? "Unmatched projection";
        if (reason.startsWith("Projection missing")) {
          return;
        } else if (reason.startsWith("Projection team mismatch")) {
          grouped.team.push(player.row.playerName);
        } else if (reason.startsWith("Projection position mismatch")) {
          grouped.position.push(player.row.playerName);
        } else if (reason.startsWith("Projection duplicate ambiguity")) {
          grouped.duplicate.push(player.row.playerName);
        } else {
          grouped.blocked.push(player.row.playerName);
        }
      });
      const count = unmatchedActivePlayers.length;
      warnings.push(
        `${count} active ${count === 1 ? "player has" : "players have"} no current projection and ${count === 1 ? "was" : "were"} left in place: ` + unmatchedActivePlayers.map(label).join(", ")
      );
      if (grouped.team.length > 0) {
        warnings.push(`Team mismatch blocked a match: ${grouped.team.join(", ")}`);
      }
      if (grouped.position.length > 0) {
        warnings.push(`Position mismatch blocked a match: ${grouped.position.join(", ")}`);
      }
      if (grouped.duplicate.length > 0) {
        warnings.push(`Duplicate projection rows blocked a match: ${grouped.duplicate.join(", ")}`);
      }
      if (grouped.blocked.length > 0) {
        warnings.push(`Other match blocks: ${grouped.blocked.join(", ")}`);
      }
    }
    if (optimizedTotal <= currentTotal) {
      const currentSaved = preferProjectionOrderedHitterSlots(currentAssignmentsById, slotById, rowMap, pinnedKeys).map((assignment) => ({
        ...assignment,
        slotId: slotLabelById.get(assignment.slotId) ?? assignment.slotId
      }));
      return {
        currentTotal,
        optimizedTotal: currentTotal,
        assignments: currentSaved,
        scoredPlayers,
        changes: [],
        warnings
      };
    }
    return {
      currentTotal,
      optimizedTotal,
      assignments: serializableAssignments,
      scoredPlayers,
      changes,
      warnings
    };
  }
  __name(optimizeLineup, "optimizeLineup");

  // src/content/row_annotations.ts
  function badge(text2, role, tone) {
    const span = document.createElement("span");
    span.textContent = text2;
    span.className = "nfbc-sl-badge";
    span.dataset.nfbcExt = "badge";
    span.dataset.role = role;
    span.dataset.tone = tone;
    return span;
  }
  __name(badge, "badge");
  function setAccessibleDetail(element, detail) {
    element.setAttribute("aria-label", detail);
    element.dataset.nfbcTooltip = detail;
    element.removeAttribute("title");
  }
  __name(setAccessibleDetail, "setAccessibleDetail");
  function clearExisting(container) {
    container.querySelectorAll(
      [
        "[data-nfbc-ext='badge']",
        "[data-nfbc-ext='badge-rail']",
        "[data-nfbc-ext='metric-block']",
        "[data-nfbc-ext='secondary-badges']",
        "[data-nfbc-ext='lineup-slot']",
        "[data-nfbc-ext='changed-chip']",
        "[data-nfbc-ext='schedule-inner']",
        "[data-nfbc-ext='schedule-top']",
        "[data-nfbc-ext='schedule-opponent']",
        "[data-nfbc-ext='schedule-dh']",
        "[data-nfbc-ext='schedule-dh-games']",
        "[data-nfbc-ext='schedule-dh-game']",
        "[data-nfbc-ext='schedule-dh-hand']",
        "[data-nfbc-ext='schedule-time']"
      ].join(", ")
    ).forEach((node) => node.remove());
  }
  __name(clearExisting, "clearExisting");
  function lineupKey2(row) {
    return `${row.normalizedName}|${row.normalizedTeam ?? ""}`;
  }
  __name(lineupKey2, "lineupKey");
  function lineupBubbleTone(tone) {
    return tone;
  }
  __name(lineupBubbleTone, "lineupBubbleTone");
  function rawTone(value) {
    if (value < 0) {
      return "poor";
    }
    if (value < 0.15) {
      return "neutral";
    }
    if (value < 0.35) {
      return "weak";
    }
    if (value < 0.6) {
      return "strong";
    }
    return "elite";
  }
  __name(rawTone, "rawTone");
  function projectionPeriodShortLabel(period) {
    switch (period) {
      case "MON_THU":
        return "M-T";
      case "FRI_SUN":
        return "F-S";
      case "WEEKLY":
        return "Wk";
      case "ROS":
        return "ROS";
      default:
        return "Proj";
    }
  }
  __name(projectionPeriodShortLabel, "projectionPeriodShortLabel");
  function projectionPeriodTitleLabel(period) {
    switch (period) {
      case "MON_THU":
        return "Mon-Thu";
      case "FRI_SUN":
        return "Fri-Sun";
      case "WEEKLY":
        return "Weekly";
      case "ROS":
        return "ROS";
      default:
        return "Projected";
    }
  }
  __name(projectionPeriodTitleLabel, "projectionPeriodTitleLabel");
  function ratingInputsDetail(pitcherRow) {
    if (pitcherRow) {
      return "Biggest inputs, in order: (1) volume \u2014 number of starts this period \xD7 innings per start (recent workload, rest, team hook); (2) skill \u2014 blended K-BB%, ER/out and WHIP components (K-rate carries the most); (3) opponent \u2014 strikeouts forced by the lineup faced + their run environment; (4) park, temperature & wind (runs/hits allowed) and home/away. Converted to SGP with your league's K, W, SV, ERA, WHIP weights. W is barely predictable, so it's a small, capped input.";
    }
    return "Biggest inputs, in order: (1) playing time \u2014 games this period \xD7 expected plate appearances (start probability vs the projected starters' hands, and lineup slot); (2) per-PA skill \u2014 blended R/HR/RBI/SB/AVG rates (skill matters most for SB and HR); (3) park, temperature & wind on HR; (4) platoon vs the projected starters' hands and opposing-SP quality. Converted to SGP with your league's R, HR, RBI, SB, AVG weights (one SB or HR is worth ~2\xD7 a run).";
  }
  __name(ratingInputsDetail, "ratingInputsDetail");
  function projectedLineSummary(projection, pitcherRow) {
    if (!projection) {
      return "";
    }
    const s = projection.stats;
    const num2 = /* @__PURE__ */ __name((v, d = 0) => v == null ? "0" : v.toFixed(d), "num");
    const parts = [];
    if (pitcherRow) {
      const ip = s.IP ?? 0;
      if (projection.startsProjected != null) parts.push(`${num2(projection.startsProjected)} start${projection.startsProjected === 1 ? "" : "s"}`);
      if (ip > 0) parts.push(`${num2(ip, 1)} IP`);
      if (s.K_pitch != null) parts.push(`${num2(s.K_pitch, 1)} K`);
      if (ip > 0 && s.ER != null) parts.push(`${(s.ER / ip * 9).toFixed(2)} ERA`);
      if (ip > 0) parts.push(`${(((s.HA ?? 0) + (s.BB_pitch ?? 0)) / ip).toFixed(2)} WHIP`);
      if (s.W != null && s.W > 0.05) parts.push(`${num2(s.W, 1)} W`);
      if (s.SV != null && s.SV > 0.05) parts.push(`${num2(s.SV, 1)} SV`);
    } else {
      const ab = s.AB ?? 0;
      const avg = s.AVG ?? (ab > 0 && s.H != null ? s.H / ab : void 0);
      if (s.PA != null) parts.push(`${num2(s.PA)} PA`);
      if (s.R != null) parts.push(`${num2(s.R, 1)} R`);
      if (s.HR != null) parts.push(`${num2(s.HR, 1)} HR`);
      if (s.RBI != null) parts.push(`${num2(s.RBI, 1)} RBI`);
      if (s.SB != null) {
        const chance = projection.stealProbability;
        parts.push(chance != null ? `${num2(s.SB, 1)} SB (${Math.round(chance * 100)}% chance)` : `${num2(s.SB, 1)} SB`);
      }
      if (avg != null) parts.push(`${avg.toFixed(3).replace(/^0/, "")} AVG`);
    }
    return parts.length > 0 ? ` This player's projection \u2014 ${parts.join(", ")}.` : "";
  }
  __name(projectedLineSummary, "projectedLineSummary");
  function returnAwareRisks(risks, projection) {
    if (!projection?.confirmedReturn) return risks;
    return [
      ...risks.filter((r) => !["ROLE\u2193", "PT", "RETURN"].includes(r.label)),
      { label: "RETURN", tone: "context", detail: "Confirmed lineup return after missed appearances. Playing time uses the established pre-absence role, with matchup and rest limits for later games." }
    ];
  }
  __name(returnAwareRisks, "returnAwareRisks");
  function optimizerRoleAdjustmentDetail(projection) {
    const adjustment = projection?.rawRow?.optimizerRoleAdjustment;
    if (!adjustment || !Number.isFinite(adjustment.factor) || adjustment.factor >= 1) return "";
    const reduction = Math.round((1 - adjustment.factor) * 100);
    const original = adjustment.originalPa == null ? "" : ` from ${adjustment.originalPa.toFixed(0)} baseline PA`;
    return ` Optimizer role adjustment: ${adjustment.label} role is unconfirmed, so projected volume was reduced ${reduction}%${original}. The displayed PA is the adjusted value and includes any confirmed posted start.`;
  }
  __name(optimizerRoleAdjustmentDetail, "optimizerRoleAdjustmentDetail");
  function projectionValueBadge(player, pitcherRow) {
    const rawValue = player.rawSGP;
    if (rawValue == null) {
      return null;
    }
    const projection = player.matchedProjection;
    const value = rawValue.toFixed(2);
    const sourcePeriod = projection?.sourcePeriod;
    const label = pitcherRow ? "Wk" : projectionPeriodShortLabel(sourcePeriod);
    const raw = badge(`${label} ${value}`, "raw", rawTone(rawValue));
    const contextual = player.contextualSGP;
    const contextNote = contextual != null ? ` Start/sit decision value: ${contextual.toFixed(2)} SGP after the selected context policy (equal to raw when context is unavailable or neutral).` : " The start/sit optimizer has no usable value for this player.";
    const engineValue = projection?.periodValue;
    const band = projection?.periodP10 != null && projection?.periodP90 != null ? ` (80% range ${projection.periodP10.toFixed(2)} to ${projection.periodP90.toFixed(2)})` : "";
    const engineNote = engineValue != null ? ` Engine's own SGP for this projection: ${engineValue.toFixed(2)}${band}.` : "";
    const workloadNote = projection?.startDetails?.some((start) => start.workload_uncertain) ? " Starter workload uncertain: no MLB start in the last 30 days. Recent outing workload limits the estimate when available; a probable assignment does not establish normal starter innings." : "";
    setAccessibleDetail(
      raw,
      `${pitcherRow ? "Pitcher" : "Hitter"} ${projectionPeriodTitleLabel(sourcePeriod)} rating (${value}, raw) \u2014 league-profile-specific projected SGP for this period.${contextNote}${projectedLineSummary(projection, pitcherRow)}${optimizerRoleAdjustmentDetail(projection)} ${ratingInputsDetail(pitcherRow)}${engineNote}${workloadNote}`
    );
    return raw;
  }
  __name(projectionValueBadge, "projectionValueBadge");
  function warningTone(label) {
    if (label === "Low PA" || label === "Low IP") {
      return "warning";
    }
    if (label === "Warning") {
      return "neutral";
    }
    return "danger";
  }
  __name(warningTone, "warningTone");
  function riskTone(risk) {
    return risk.tone;
  }
  __name(riskTone, "riskTone");
  function isPitcherRow2(row) {
    return row.currentSlot === "P" || row.eligiblePositions.length > 0 && row.eligiblePositions.every((position2) => position2 === "P");
  }
  __name(isPitcherRow2, "isPitcherRow");
  function stealTone(probability) {
    if (probability >= 0.35) return "elite";
    if (probability >= 0.2) return "strong";
    if (probability >= 0.08) return "weak";
    return "neutral";
  }
  __name(stealTone, "stealTone");
  function warningBadgeLabel(warnings) {
    const [first = "Warning"] = warnings;
    if (first === "Low hitter volume") {
      return "Low PA";
    }
    if (first === "Low pitcher volume") {
      return "Low IP";
    }
    if (first.startsWith("Projection missing")) {
      return "No Proj";
    }
    if (first.startsWith("Projection team mismatch")) {
      return "Team Diff";
    }
    if (first.startsWith("Projection position mismatch")) {
      return "Pos Diff";
    }
    if (first.startsWith("Projection duplicate ambiguity")) {
      return "Dup Proj";
    }
    if (first.startsWith("Conservative match blocked") || first.startsWith("Unmatched projection")) {
      return "Unmatched";
    }
    return first.length <= 18 ? first : "Warning";
  }
  __name(warningBadgeLabel, "warningBadgeLabel");
  var SIGNAL_LEGEND = {
    PT: "PT = part-time risk: started under ~80% of the last 12 team games (from MLB boxscore start history).",
    PL: "Pl = platoon risk: tends to sit vs same-handed starters (batter hand vs recent opposing-SP hands).",
    LPA: "L PA = low projected plate appearances for this period.",
    LIP: "L IP = low projected innings for this period."
  };
  function signalLegend(short) {
    return SIGNAL_LEGEND[short.replace(/\s+/g, "").toUpperCase()];
  }
  __name(signalLegend, "signalLegend");
  function signalsLegend(shorts) {
    const lines = Array.from(new Set(shorts.map(signalLegend).filter((x) => Boolean(x))));
    return lines.length > 0 ? ` \xB7 ${lines.join(" ")}` : "";
  }
  __name(signalsLegend, "signalsLegend");
  var WARNING_LEGEND = {
    "No Proj": "No matching projection found \u2014 the player is left in place and not scored.",
    "Team Diff": "A projection exists but under a different MLB team \u2014 the match was blocked to avoid scoring the wrong player.",
    "Pos Diff": "The matched projection's position doesn't line up \u2014 match blocked.",
    "Dup Proj": "Several projection rows matched this name \u2014 too ambiguous to score.",
    "Unmatched": "Couldn't confidently match this player to a projection."
  };
  function findSetLineupCard(row, fallbackIndex) {
    if (row.pagePlayerId) {
      const link = document.querySelector(
        `.Player[data-can-set-lineup='1'] a[href*='/player/baseball/${row.pagePlayerId}/']`
      );
      const card = link?.closest(".Player[data-can-set-lineup='1']");
      if (card) {
        return card;
      }
    }
    if (row.slotControlSelector) {
      const control = document.querySelector(row.slotControlSelector);
      const card = control?.closest(".Player[data-can-set-lineup='1']");
      if (card) {
        return card;
      }
    }
    return document.querySelector(`.Player[data-can-set-lineup='1']:nth-of-type(${fallbackIndex + 1})`);
  }
  __name(findSetLineupCard, "findSetLineupCard");
  function resolveSetLineupLayout(card) {
    const infoPane = Array.from(card.children).find(
      (child) => child instanceof HTMLElement && child.tagName !== "BUTTON"
    ) ?? null;
    const anchor = card.querySelector(".PlayerName")?.closest("a");
    const nameText = anchor?.parentElement;
    const nameRow = nameText?.parentElement;
    const infoRow = nameRow?.parentElement;
    const trailingInfo = infoRow?.children.item(1);
    const teamNode = nameText?.nextElementSibling;
    const positionNode = nameRow?.querySelector(":scope > .position") ?? null;
    const gameCountGroup = Array.from(nameRow?.children ?? []).find(
      (child) => child instanceof HTMLElement && Boolean(child.querySelector("button.link, [class*='GameCount__CondensedWrapper']"))
    ) ?? Array.from(trailingInfo?.children ?? []).find(
      // Brittle assumption: NFBC's condensed game-count control still renders as a link-style button
      // or a wrapper with a `GameCount__CondensedWrapper` class inside the row trailing area.
      (child) => child instanceof HTMLElement && (child.matches("button.link") || Boolean(child.querySelector("button.link, [class*='GameCount__CondensedWrapper']")))
    );
    return {
      infoPane,
      infoRow,
      trailingInfo,
      nameRow,
      nameText,
      teamNode,
      positionNode,
      gameCountGroup: gameCountGroup ?? null
    };
  }
  __name(resolveSetLineupLayout, "resolveSetLineupLayout");
  function applySetLineupStructureClasses(card) {
    const layout = resolveSetLineupLayout(card);
    card.classList.add("nfbc-sl-row");
    if (layout.infoPane) {
      layout.infoPane.dataset.nfbcExt = "info-pane";
    }
    if (layout.infoRow) {
      layout.infoRow.dataset.nfbcExt = "info-row";
    }
    if (layout.trailingInfo) {
      layout.trailingInfo.dataset.nfbcExt = "trailing";
    }
    if (layout.nameRow) {
      layout.nameRow.dataset.nfbcExt = "name-row";
    }
    if (layout.nameText) {
      layout.nameText.dataset.nfbcExt = "name-text";
    }
    if (layout.teamNode) {
      layout.teamNode.dataset.nfbcExt = "team";
    }
    if (layout.positionNode) {
      layout.positionNode.dataset.nfbcExt = "position";
    }
    if (layout.gameCountGroup) {
      layout.gameCountGroup.dataset.nfbcExt = "game-count";
    }
    const nativeMode = document.body.dataset.nfbcExtReadability === "native";
    if (!nativeMode) {
      const lockedButton = card.querySelector("button[title='Team Locked']");
      const slotButton = lockedButton ?? card.querySelector("button[title='Set Position']");
      card.dataset.nfbcLocked = lockedButton ? "true" : "false";
      if (slotButton) {
        slotButton.dataset.nfbcExt = "slot-button";
      }
    }
    return layout;
  }
  __name(applySetLineupStructureClasses, "applySetLineupStructureClasses");
  function moveInjuryDesignationBeforeName(layout) {
    const anchor = layout.nameText?.querySelector("a");
    if (!anchor) {
      return;
    }
    const injuryEl = anchor.querySelector("[class*='InjuryText']");
    if (!injuryEl || !injuryEl.textContent?.trim() || anchor.firstElementChild === injuryEl) {
      return;
    }
    injuryEl.style.marginRight = "4px";
    anchor.prepend(injuryEl);
  }
  __name(moveInjuryDesignationBeforeName, "moveInjuryDesignationBeforeName");
  function ensureSetLineupLineupSlot(card) {
    const existing = card.querySelector("[data-nfbc-ext='lineup-slot']");
    if (existing) {
      return existing;
    }
    const anchor = card.querySelector(".PlayerName")?.closest("a");
    const nameText = anchor?.parentElement;
    const nativeOrder = nameText?.parentElement?.querySelector(":scope > .BattingOrder");
    if (nativeOrder) {
      nativeOrder.classList.add("nfbc-sl-badge");
      nativeOrder.dataset.role = "lineup";
      nativeOrder.dataset.nfbcExt = "lineup-slot-native";
      const teamNode2 = card.querySelector("[data-nfbc-ext='team']");
      if (teamNode2?.parentElement) {
        teamNode2.parentElement.insertBefore(nativeOrder, teamNode2);
      } else if (nameText) {
        nameText.after(nativeOrder);
      }
      return nativeOrder;
    }
    const slot = badge("", "lineup", "neutral");
    slot.dataset.nfbcExt = "lineup-slot";
    const teamNode = card.querySelector("[data-nfbc-ext='team']");
    if (teamNode?.parentElement) {
      teamNode.parentElement.insertBefore(slot, teamNode);
      return slot;
    }
    if (nameText?.parentElement) {
      nameText.after(slot);
      return slot;
    }
    card.prepend(slot);
    return slot;
  }
  __name(ensureSetLineupLineupSlot, "ensureSetLineupLineupSlot");
  function ensureSetLineupBadgeRail(card, layout) {
    const existing = card.querySelector("[data-nfbc-ext='badge-rail']");
    if (existing) {
      const metricBlock2 = existing.querySelector("[data-nfbc-ext='metric-block']");
      const badgesBlock2 = existing.querySelector("[data-nfbc-ext='secondary-badges']");
      if (metricBlock2 && badgesBlock2) {
        return { rail: existing, metricBlock: metricBlock2, badgesBlock: badgesBlock2 };
      }
    }
    const rail = document.createElement("div");
    rail.dataset.nfbcExt = "badge-rail";
    const metricBlock = document.createElement("div");
    metricBlock.dataset.nfbcExt = "metric-block";
    const badgesBlock = document.createElement("div");
    badgesBlock.dataset.nfbcExt = "secondary-badges";
    rail.append(metricBlock, badgesBlock);
    if (layout.trailingInfo) {
      layout.trailingInfo.append(rail);
    } else if (layout.nameRow) {
      layout.nameRow.append(rail);
    } else {
      card.append(rail);
    }
    return { rail, metricBlock, badgesBlock };
  }
  __name(ensureSetLineupBadgeRail, "ensureSetLineupBadgeRail");
  function placeSetLineupValueBadge(card, layout, raw) {
    if (layout.positionNode) {
      layout.positionNode.after(raw);
      return;
    }
    if (layout.teamNode) {
      layout.teamNode.after(raw);
      return;
    }
    if (layout.nameText) {
      layout.nameText.after(raw);
      return;
    }
    const badgeRail = card.querySelector("[data-nfbc-ext='metric-block']");
    if (badgeRail) {
      badgeRail.append(raw);
      return;
    }
    card.prepend(raw);
  }
  __name(placeSetLineupValueBadge, "placeSetLineupValueBadge");
  function applyLineupBubble(slot, lineupBubble) {
    slot.classList.add("nfbc-sl-badge");
    slot.dataset.role = "lineup";
    slot.dataset.tone = lineupBubbleTone(lineupBubble.tone);
    setAccessibleDetail(
      slot,
      `${lineupBubble.detail} \u2014 today's posted MLB lineup status: a number = batting that spot in the order, green = in today's lineup, red = NOT in today's posted lineup, gray = lineup not posted yet. Source: MLB StatsAPI boxscores, polled while this tab is open.`
    );
    slot.textContent = lineupBubble.label;
  }
  __name(applyLineupBubble, "applyLineupBubble");
  function changedChipDetail(saved, direction) {
    return saved ? "Saved \u2014 you just applied this lineup change; the highlight clears in a few seconds." : `Recommended ${direction === "bench" ? "bench" : direction === "start" ? "start" : "lineup"} move. See the Recommended swaps bar at the top for the exact slot, or use Apply changes to review every move before saving.`;
  }
  __name(changedChipDetail, "changedChipDetail");
  function ensureChangedChip(card, options = {}) {
    const label = options.saved ? "Saved" : options.direction === "bench" ? "Bench" : options.direction === "start" ? "Start" : "Change";
    const existing = card.querySelector("[data-nfbc-ext='changed-chip']");
    if (existing) {
      existing.textContent = label;
      setAccessibleDetail(existing, changedChipDetail(Boolean(options.saved), options.direction));
      return;
    }
    const chip = badge(label, "changed", options.direction === "start" ? "positive" : options.direction === "bench" ? "danger" : "platoon");
    chip.dataset.nfbcExt = "changed-chip";
    setAccessibleDetail(chip, changedChipDetail(Boolean(options.saved), options.direction));
    const badgesBlock = card.querySelector("[data-nfbc-ext='secondary-badges']");
    if (badgesBlock) {
      badgesBlock.prepend(chip);
      return;
    }
    const trailing = card.querySelector("[data-nfbc-ext='trailing']");
    if (trailing) {
      trailing.prepend(chip);
      return;
    }
    card.prepend(chip);
  }
  __name(ensureChangedChip, "ensureChangedChip");
  function setChangedState(card, direction) {
    const changed = direction != null;
    card.classList.toggle("nfbc-sl-row--changed", changed);
    if (direction) card.dataset.nfbcRecommendation = direction;
    else delete card.dataset.nfbcRecommendation;
    if (changed) {
      ensureChangedChip(card, { direction });
    } else {
      card.querySelector("[data-nfbc-ext='changed-chip']")?.remove();
    }
  }
  __name(setChangedState, "setChangedState");
  function findSetLineupScheduleCells(card) {
    const scheduleGrid = card.querySelector("[data-nfbc-ext='schedule-grid']") ?? Array.from(card.children).find((child) => child.querySelector(".gametime"));
    if (!scheduleGrid) {
      return [];
    }
    scheduleGrid.dataset.nfbcExt = "schedule-grid";
    return Array.from(scheduleGrid.children).filter((child) => child instanceof HTMLElement).map((cell) => {
      cell.dataset.nfbcExt = "schedule-cell";
      return cell;
    });
  }
  __name(findSetLineupScheduleCells, "findSetLineupScheduleCells");
  function scheduleTextParts(cell) {
    const cachedOpponent = cell.dataset.nfbcOpponentText;
    const cachedTime = cell.dataset.nfbcGameTimeText;
    if (cachedOpponent != null || cachedTime != null) {
      return {
        opponentText: cachedOpponent ?? "",
        gameTimeText: cachedTime ?? ""
      };
    }
    const fullText = cell.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const gameTimes = Array.from(cell.querySelectorAll(".gametime")).map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "").filter(Boolean);
    const rebuiltTime = cell.querySelector("[data-nfbc-ext='schedule-time']")?.textContent?.replace(/\s+/g, " ").trim();
    if (gameTimes.length === 0 && rebuiltTime) gameTimes.push(...rebuiltTime.split(/\s+[·/]\s+/));
    let rawOpponent = fullText;
    for (const gameTime of gameTimes) rawOpponent = rawOpponent.replace(gameTime, " ");
    const opponentParts = rawOpponent.replace(/\s+/g, " ").trim().split(" ");
    const half = opponentParts.length / 2;
    const duplicated = Number.isInteger(half) && opponentParts.slice(0, half).join(" ") === opponentParts.slice(half).join(" ");
    const opponentText = duplicated ? opponentParts.slice(0, half).join(" ") : opponentParts.join(" ");
    const existingGameTime = gameTimes.join(" \xB7 ");
    cell.dataset.nfbcOpponentText = opponentText;
    cell.dataset.nfbcGameTimeText = existingGameTime;
    return { opponentText, gameTimeText: existingGameTime };
  }
  __name(scheduleTextParts, "scheduleTextParts");
  function annotateSetLineupScheduleCells(card, indicators, dateLabels, showHandBadges, isPitcher, startConfirmations) {
    if (dateLabels.length === 0) {
      return;
    }
    const cells = findSetLineupScheduleCells(card);
    const nativeStartDates = /* @__PURE__ */ new Set();
    if (isPitcher) {
      dateLabels.forEach((label, i) => {
        if (cells[i]?.classList.contains("starting_pitcher")) {
          nativeStartDates.add(label);
        }
      });
    }
    const fgStartDates = isPitcher && startConfirmations ? new Set(startConfirmations.keys()) : /* @__PURE__ */ new Set();
    dateLabels.forEach((dateLabel, index) => {
      const cell = cells[index];
      if (!cell || cell.textContent?.trim() === "-") {
        return;
      }
      const nativeStart = nativeStartDates.has(dateLabel);
      const fgHand = isPitcher ? startConfirmations?.get(dateLabel) : void 0;
      const { opponentText, gameTimeText } = scheduleTextParts(cell);
      const hasGame = Boolean(opponentText && opponentText !== "-");
      const indicator = showHandBadges && hasGame ? indicators?.get(dateLabel) ?? {
        label: "?",
        detail: "Opposing probable-starter hand unavailable",
        tone: "unknown"
      } : void 0;
      const top = document.createElement("div");
      top.dataset.nfbcExt = "schedule-top";
      let startDetail;
      if (nativeStart || fgHand) {
        const tone = nativeStart && fgHand ? "confirmed" : nativeStart ? "native" : "fg";
        const otherFgDays = [...fgStartDates].filter((day) => day !== dateLabel);
        const otherNativeDays = [...nativeStartDates].filter((day) => day !== dateLabel);
        const conflict = tone === "native" && otherFgDays.length > 0 || tone === "fg" && otherNativeDays.length > 0;
        const marker = document.createElement("span");
        marker.dataset.nfbcExt = "schedule-start";
        marker.dataset.tone = tone;
        marker.textContent = "\u25C6";
        if (tone === "confirmed") {
          startDetail = `Probable start \u2014 NFBC + FanGraphs confirmed${fgHand ? ` (${fgHand}HP)` : ""}`;
        } else if (tone === "native") {
          startDetail = otherFgDays.length > 0 ? `NFBC start ${dateLabel}; FanGraphs lists it ${otherFgDays.join(", ")} instead \u2014 verify before lock` : "Probable start (NFBC) \u2014 not yet on the FanGraphs grid";
        } else {
          startDetail = otherNativeDays.length > 0 ? `FanGraphs start ${dateLabel}${fgHand ? ` (${fgHand}HP)` : ""}; NFBC marks ${otherNativeDays.join(", ")} instead \u2014 verify before lock` : `FanGraphs lists a probable start${fgHand ? ` (${fgHand}HP)` : ""} \u2014 NFBC not marked`;
        }
        setAccessibleDetail(marker, `\u25C6 = projected start day for this pitcher. ${startDetail}`);
        cell.dataset.nfbcStart = tone;
        if (conflict) {
          cell.dataset.nfbcStartConflict = "true";
        } else {
          delete cell.dataset.nfbcStartConflict;
        }
        top.append(marker);
      } else {
        delete cell.dataset.nfbcStart;
        delete cell.dataset.nfbcStartConflict;
      }
      const opponent = document.createElement("span");
      opponent.dataset.nfbcExt = "schedule-opponent";
      opponent.textContent = opponentText || "-";
      top.append(opponent);
      delete cell.dataset.nfbcDoubleheader;
      const doubleheader = Boolean(indicator && (indicator.gameCount ?? 1) > 1);
      if (indicator) {
        if (doubleheader) {
          const dh = document.createElement("span");
          dh.dataset.nfbcExt = "schedule-dh";
          dh.textContent = "DH";
          setAccessibleDetail(dh, `${indicator.gameCount}-game doubleheader`);
          top.append(dh);
          cell.dataset.nfbcDoubleheader = "true";
        }
        if (!doubleheader) {
          const compactHand = indicator.label === "LHP" ? "L" : indicator.label === "RHP" ? "R" : indicator.label;
          const hand = badge(compactHand, "schedule-hand", indicator.tone);
          setAccessibleDetail(
            hand,
            `${dateLabel}: ${indicator.detail} \u2014 the opposing probable starter's throwing hand (RHP/LHP). Your hitter has the platoon edge when it's the opposite of his bat side. Bold = confirmed via MLB; normal = forecast source.`
          );
          hand.style.fontWeight = indicator.source === "mlb" ? "700" : "400";
          top.append(hand);
        }
      }
      const content = [top];
      if (doubleheader && indicator) {
        const games = document.createElement("div");
        games.dataset.nfbcExt = "schedule-dh-games";
        const times = gameTimeText.split(/\s+·\s+/).filter(Boolean).sort((left, right) => {
          const clock = /* @__PURE__ */ __name((value) => {
            const match = value.match(/(\d{1,2}):(\d{2})/);
            if (!match) return Number.MAX_SAFE_INTEGER;
            const hour = Number(match[1]) % 12;
            return hour * 60 + Number(match[2]);
          }, "clock");
          return clock(left) - clock(right);
        });
        const count = Math.max(times.length, indicator.games?.length ?? 0);
        for (let gameIndex = 0; gameIndex < count; gameIndex += 1) {
          const game = document.createElement("div");
          game.dataset.nfbcExt = "schedule-dh-game";
          const time = document.createElement("span");
          time.dataset.nfbcExt = "schedule-time";
          time.textContent = times[gameIndex] ?? `Game ${gameIndex + 1}`;
          game.append(time);
          const probable = indicator.games?.[gameIndex];
          if (probable) {
            const hand = document.createElement("span");
            hand.dataset.nfbcExt = "schedule-dh-hand";
            hand.dataset.tone = probable.hand === "L" ? "left" : "right";
            hand.textContent = probable.hand;
            setAccessibleDetail(hand, probable.detail);
            game.append(hand);
          }
          games.append(game);
        }
        content.push(games);
      } else if (gameTimeText) {
        const time = document.createElement("span");
        time.dataset.nfbcExt = "schedule-time";
        time.textContent = gameTimeText;
        content.push(time);
      }
      cell.replaceChildren(...content);
      const titleParts = [dateLabel];
      if (startDetail) titleParts.push(startDetail);
      if (indicator) titleParts.push(indicator.detail);
      if (opponentText) titleParts.push(opponentText);
      if (gameTimeText) titleParts.push(gameTimeText);
      setAccessibleDetail(cell, titleParts.join(" | "));
    });
  }
  __name(annotateSetLineupScheduleCells, "annotateSetLineupScheduleCells");
  function gainCategoryValue(stats, category) {
    if (category === "AVG") {
      const { H, AB } = stats;
      if (typeof H !== "number" || typeof AB !== "number" || !Number.isFinite(H) || !Number.isFinite(AB) || AB <= 0) return void 0;
      return H - LEAGUE_AVG * AB;
    }
    const v = stats[category];
    return typeof v === "number" && Number.isFinite(v) ? v : void 0;
  }
  __name(gainCategoryValue, "gainCategoryValue");
  function decileSwing(values) {
    if (values.length < 3) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const at = /* @__PURE__ */ __name((q) => sorted[Math.min(
      sorted.length - 1,
      Math.max(0, Math.round(q * (sorted.length - 1)))
    )], "at");
    return Math.max(0, at(0.9) - at(0.1));
  }
  __name(decileSwing, "decileSwing");
  function describeGainTarget(target) {
    const unit = target.category === "AVG" ? " hits above average" : "";
    return `${target.gap.toFixed(1)}${unit} behind the team above, and a period swings ${target.sd.toFixed(1)} either way \u2014 about a ${Math.round(target.pointChance * 100)}% chance of taking the point as things stand. Best-to-worst lineup choice moves ${target.swing.toFixed(1)}, worth roughly ${Math.max(1, Math.round(target.value * 100))} point${Math.round(target.value * 100) === 1 ? "" : "s"} of that.`;
  }
  __name(describeGainTarget, "describeGainTarget");
  function medianOf(values) {
    if (values.length === 0) return void 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }
  __name(medianOf, "medianOf");
  function annotateSetLineupRows(scoredPlayers, lineupBubbles, riskBadges, scheduleHandIndicators, dateLabels = [], changedRowKeys = /* @__PURE__ */ new Set(), changedDirections = /* @__PURE__ */ new Map(), ownStartConfirmations, categoryGaps, seasonProgress = 1) {
    const byCategory = {};
    const gameCounts = [];
    for (const p of scoredPlayers) {
      if (isPitcherRow2(p.row) || isUnavailableForLineup(p.row)) continue;
      const stats = p.matchedProjection?.stats;
      if (!stats) continue;
      const games = p.matchedProjection?.teamGames;
      if (typeof games === "number" && Number.isFinite(games) && games > 0) gameCounts.push(games);
      for (const cat of GAIN_CATEGORIES) {
        const v = gainCategoryValue(stats, cat);
        if (v != null) (byCategory[cat] ??= []).push(v);
      }
    }
    const swingByCategory = {};
    for (const [cat, values] of Object.entries(byCategory)) {
      swingByCategory[cat] = decileSwing(values);
    }
    const gainTarget = seasonProgressWeight(seasonProgress) > 0 ? pickGainCategory(categoryGaps, swingByCategory, medianOf(gameCounts) ?? 3) : void 0;
    scoredPlayers.forEach((player, index) => {
      const card = findSetLineupCard(player.row, index);
      if (!card) {
        return;
      }
      card.dataset.nfbcRowKey = player.row.rowElementKey;
      card.dataset.nfbcBench = player.row.isBench ? "true" : "false";
      card.classList.toggle("nfbc-sl-row--schedule", dateLabels.length > 0);
      card.classList.toggle("nfbc-sl-row--bench", player.row.isBench);
      card.classList.toggle("nfbc-sl-row--pitcher", isPitcherRow2(player.row));
      clearExisting(card);
      const layout = applySetLineupStructureClasses(card);
      moveInjuryDesignationBeforeName(layout);
      const lineupSlot = ensureSetLineupLineupSlot(card);
      const badgeRail = ensureSetLineupBadgeRail(card, layout);
      const key = lineupKey2(player.row);
      const lineupBubble = lineupBubbles?.get(key);
      const pitcherRow = player.matchedProjection?.isPitcher === true || isPitcherRow2(player.row);
      if (lineupBubble) {
        applyLineupBubble(lineupSlot, lineupBubble);
        delete lineupSlot.dataset.nfbcEmpty;
      } else {
        const slotText = lineupSlot.textContent?.trim() ?? "";
        lineupSlot.dataset.nfbcEmpty = slotText === "" || slotText === "-" || slotText === "\u2212" || slotText === "\u2013" ? "true" : "false";
      }
      const raw = projectionValueBadge(player, pitcherRow);
      if (raw) {
        placeSetLineupValueBadge(card, layout, raw);
      }
      setChangedState(card, changedDirections.get(player.row.rowElementKey));
      const ptSignals = [];
      if (!pitcherRow) {
        const risks = returnAwareRisks(riskBadges?.get(key) ?? [], player.matchedProjection);
        risks.forEach((risk) => {
          if (risk.tone === "context") {
            const chip = badge(risk.label, "risk", riskTone(risk));
            setAccessibleDetail(chip, risk.detail);
            badgeRail.badgesBlock.append(chip);
            return;
          }
          ptSignals.push({
            short: risk.label === "Platoon" ? "PL" : risk.label,
            detail: risk.detail ?? risk.label
          });
        });
      }
      const stealChance = pitcherRow || isUnavailableForLineup(player.row) ? void 0 : player.matchedProjection?.stealProbability;
      if (stealChance != null) {
        const expected = player.matchedProjection?.stats.SB;
        const chip = badge(`SB ${Math.round(stealChance * 100)}%`, "matchup", stealTone(stealChance));
        setAccessibleDetail(
          chip,
          `${Math.round(stealChance * 100)}% chance of at least one steal this period` + (expected != null ? ` (${expected.toFixed(2)} expected)` : "") + " \u2014 includes the opposing catchers, weighted by how likely each is to start, and their pitchers' handedness." + (player.matchedProjection?.stealPitcherContext?.version === 1 ? " Also includes each projected starter's SB allowed rate, regressed for sample size and weighted by expected innings." : "") + (gainTarget?.category === "SB" ? ` Steals is also this team's best category to chase: ${describeGainTarget(gainTarget)}` : "")
        );
        badgeRail.badgesBlock.append(chip);
      }
      const gainDuplicatesSteal = gainTarget?.category === "SB";
      if (gainTarget && !gainDuplicatesSteal && !pitcherRow && !isUnavailableForLineup(player.row)) {
        const stats = player.matchedProjection?.stats;
        const expected = stats ? gainCategoryValue(stats, gainTarget.category) : void 0;
        if (expected != null) {
          const games = player.matchedProjection?.teamGames;
          const avg = gainTarget.category === "AVG";
          const chance = avg ? probabilityOfHelpingAverage(stats?.H ?? 0, stats?.AB ?? 0) : probabilityOfContribution(gainTarget.category, expected, games);
          const need = contributionThreshold(gainTarget.category);
          const chip = badge(
            `${gainTarget.category} ${Math.round(chance * 100)}%`,
            "matchup",
            gainTone(chance)
          );
          setAccessibleDetail(
            chip,
            `${gainTarget.category} is this team's best category to chase this period \u2014 ${describeGainTarget(gainTarget)} ` + (avg ? `This hitter: ${Math.round(chance * 100)}% chance he out-hits a league-average bat over the period (${expected >= 0 ? "+" : ""}${expected.toFixed(1)} hits above average projected), so starting him ${expected >= 0 ? "lifts" : "lowers"} the team average.` : `This hitter: ${expected.toFixed(2)} projected, ${Math.round(chance * 100)}% chance of ${need > 1 ? `at least ${need}` : "at least one"}${need > 1 ? ` \u2014 two rather than one because nearly every starter clears one ${gainTarget.category}` : ""}.`)
          );
          badgeRail.badgesBlock.append(chip);
        }
      }
      let dataWarning;
      if (player.warnings.length > 0) {
        const label = warningBadgeLabel(player.warnings);
        if (warningTone(label) === "warning") {
          ptSignals.push({ short: label.replace("Low ", "L"), detail: player.warnings.join(", ") });
        } else {
          dataWarning = { label, detail: player.warnings.join(", ") };
        }
      }
      if (ptSignals.length >= 2) {
        const combo = badge(`\u26A0 ${ptSignals.map((sig) => sig.short).join("\xB7")}`, "risk", "partTime");
        setAccessibleDetail(
          combo,
          `Playing-time risk \u2014 ${ptSignals.map((sig) => sig.detail).join(" | ")}${signalsLegend(ptSignals.map((s) => s.short))}`
        );
        badgeRail.badgesBlock.append(combo);
      } else {
        ptSignals.forEach((sig) => {
          const chip = badge(sig.short, "risk", "partTime");
          setAccessibleDetail(chip, `${sig.detail}${signalsLegend([sig.short])}`);
          badgeRail.badgesBlock.append(chip);
        });
      }
      if (dataWarning) {
        const warning = badge(dataWarning.label, "warning", warningTone(dataWarning.label));
        const meaning = WARNING_LEGEND[dataWarning.label];
        setAccessibleDetail(warning, meaning ? `${meaning} (${dataWarning.detail})` : dataWarning.detail);
        badgeRail.badgesBlock.append(warning);
      }
      const ilMatch = (layout.nameRow?.textContent ?? "").match(/\bIL-?\d{1,2}\b/i);
      if (ilMatch && player.row.isActive) {
        const il = badge("IL", "warning", "danger");
        il.dataset.nfbcIlActive = "true";
        setAccessibleDetail(
          il,
          `On the injured list (${ilMatch[0].toUpperCase()}, from NFBC's roster tag) but sitting in an active slot. The optimizer never recommends starting IL players \u2014 move them to the bench.`
        );
        badgeRail.badgesBlock.prepend(il);
      }
      if (isMinorLeagueStatus(player.row.injuryStatus) && !ilMatch) {
        const status = (player.row.injuryStatus ?? "").toUpperCase();
        const na = badge("NA", "warning", "danger");
        na.dataset.nfbcNa = "true";
        setAccessibleDetail(
          na,
          `Not on the MLB active roster \u2014 ${status === "MINORS" ? "in the minors (detected from the team's 26-man active roster; NFBC hasn't tagged it yet)" : `NFBC roster tag "${status}"`}. The optimizer never recommends starting them.`
        );
        badgeRail.badgesBlock.prepend(na);
      }
      if (dateLabels.length > 0) {
        annotateSetLineupScheduleCells(
          card,
          scheduleHandIndicators?.get(key),
          dateLabels,
          !pitcherRow,
          pitcherRow,
          ownStartConfirmations?.get(key)
        );
      }
    });
    document.dispatchEvent(new CustomEvent("nfbc-ext:rows-annotated"));
  }
  __name(annotateSetLineupRows, "annotateSetLineupRows");
  function applyIlBadges(scoredPlayers, flags) {
    if (flags.size === 0) {
      return;
    }
    scoredPlayers.forEach((player, index) => {
      const flag = flags.get(lineupKey2(player.row));
      if (!flag) {
        return;
      }
      const card = findSetLineupCard(player.row, index);
      const badgesBlock = card?.querySelector("[data-nfbc-ext='secondary-badges']");
      if (!badgesBlock || badgesBlock.querySelector("[data-nfbc-il]")) {
        return;
      }
      badgesBlock.querySelector("[data-nfbc-il-active]")?.remove();
      const chip = badge("IL NEW", "warning", "danger");
      chip.dataset.nfbcIl = "true";
      setAccessibleDetail(
        chip,
        `Placed on the injured list in the last ~36h (MLB transactions feed, before NFBC's roster tag catches up): ${flag.description}. Already excluded from swap recommendations.`
      );
      badgesBlock.prepend(chip);
    });
  }
  __name(applyIlBadges, "applyIlBadges");
  function applyMatchupWrcChips(scoredPlayers, chips) {
    scoredPlayers.forEach((player, index) => {
      const card = findSetLineupCard(player.row, index);
      const badgesBlock = card?.querySelector("[data-nfbc-ext='secondary-badges']");
      if (!badgesBlock) {
        return;
      }
      badgesBlock.querySelector("[data-nfbc-wrc]")?.remove();
      const chip = chips.get(lineupKey2(player.row));
      if (!chip) {
        return;
      }
      const el = badge(chip.text, "matchup", chip.tone);
      el.dataset.nfbcWrc = "true";
      setAccessibleDetail(el, chip.detail);
      badgesBlock.append(el);
    });
  }
  __name(applyMatchupWrcChips, "applyMatchupWrcChips");
  function updateSetLineupLineupBubbles(scoredPlayers, lineupBubbles) {
    scoredPlayers.forEach((player, index) => {
      const bubble = lineupBubbles.get(lineupKey2(player.row));
      if (!bubble) {
        return;
      }
      const card = findSetLineupCard(player.row, index);
      if (!card) {
        return;
      }
      const slot = ensureSetLineupLineupSlot(card);
      const changed = (slot.textContent?.trim() ?? "") !== bubble.label;
      applyLineupBubble(slot, bubble);
      delete slot.dataset.nfbcEmpty;
      if (changed) {
        slot.classList.add("nfbc-sl-bubble-flash");
        window.setTimeout(() => slot.classList.remove("nfbc-sl-bubble-flash"), 5e3);
      }
    });
  }
  __name(updateSetLineupLineupBubbles, "updateSetLineupLineupBubbles");
  function annotateSetLineupAllRows(scoredPlayers, lineupBubbles, riskBadges) {
    scoredPlayers.forEach((player) => {
      const select = player.row.slotControlSelector ? document.querySelector(player.row.slotControlSelector) : void 0;
      const row = select?.closest("tr");
      if (!row) {
        return;
      }
      clearExisting(row);
      const nameCell = row.children[1];
      if (!nameCell) {
        return;
      }
      const wrapper = document.createElement("div");
      wrapper.dataset.nfbcExt = "badge-rail";
      wrapper.style.display = "flex";
      wrapper.style.flexWrap = "wrap";
      wrapper.style.gap = "5px";
      wrapper.style.justifyContent = "flex-end";
      wrapper.style.marginTop = "4px";
      const lineupBubble = lineupBubbles?.get(lineupKey2(player.row));
      if (lineupBubble) {
        const lineup = badge(lineupBubble.label, "lineup", lineupBubbleTone(lineupBubble.tone));
        setAccessibleDetail(lineup, lineupBubble.detail);
        wrapper.append(lineup);
      }
      const pitcherRow = player.matchedProjection?.isPitcher === true || isPitcherRow2(player.row);
      const raw = projectionValueBadge(player, pitcherRow);
      if (raw) {
        wrapper.append(raw);
      }
      const risks = returnAwareRisks(riskBadges?.get(lineupKey2(player.row)) ?? [], player.matchedProjection);
      risks.forEach((risk) => {
        const riskBadge = badge(risk.label === "Platoon" ? "PL" : risk.label, "risk", riskTone(risk));
        setAccessibleDetail(riskBadge, risk.detail);
        wrapper.append(riskBadge);
      });
      if (player.warnings.length > 0) {
        const label = warningBadgeLabel(player.warnings);
        const warning = badge(label, "warning", warningTone(label));
        setAccessibleDetail(warning, player.warnings.join(", "));
        wrapper.append(warning);
      }
      nameCell.append(wrapper);
    });
  }
  __name(annotateSetLineupAllRows, "annotateSetLineupAllRows");
  async function highlightSavedChanges(rows) {
    const summary = await getSessionSummary();
    if (!summary) {
      return;
    }
    rows.forEach((row, index) => {
      if (!summary.changedRowKeys.includes(row.rowElementKey)) {
        return;
      }
      const setlineupCard = findSetLineupCard(row, index);
      if (setlineupCard) {
        setlineupCard.classList.add("nfbc-sl-row--saved");
        ensureChangedChip(setlineupCard, { saved: true });
        return;
      }
      const select = row.slotControlSelector ? document.querySelector(row.slotControlSelector) : void 0;
      const tableRow = select?.closest("tr");
      if (tableRow) {
        tableRow.dataset.nfbcSaved = "true";
        tableRow.style.background = "#fff1c7";
      }
    });
    window.setTimeout(() => {
      document.querySelectorAll(".Player[data-can-set-lineup='1'].nfbc-sl-row--saved").forEach((node) => {
        node.classList.remove("nfbc-sl-row--saved");
        const changedChip = node.querySelector("[data-nfbc-ext='changed-chip']");
        if (changedChip?.textContent === "Saved") {
          changedChip.remove();
        }
      });
      document.querySelectorAll("tr[data-nfbc-saved='true']").forEach((row) => {
        delete row.dataset.nfbcSaved;
        row.style.background = "";
      });
    }, 5e3);
    await clearSessionSummary();
  }
  __name(highlightSavedChanges, "highlightSavedChanges");

  // src/core/projection_selection.ts
  function projectionKey(projection) {
    return `${projection.normalizedName}|${projection.normalizedTeam ?? ""}`;
  }
  __name(projectionKey, "projectionKey");
  function projectionsForLineupPeriod(store, period) {
    const byKey = /* @__PURE__ */ new Map();
    const hitterSource = period === "WEEKLY" ? store.WEEKLY : store[period];
    for (const projection of hitterSource) {
      if (!projection.isHitter) continue;
      byKey.set(projectionKey(projection), projection);
    }
    for (const projection of store.WEEKLY) {
      if (!projection.isPitcher) continue;
      const key = projectionKey(projection);
      if (!byKey.has(key)) {
        byKey.set(key, projection);
      }
    }
    if (period !== "WEEKLY") {
      for (const projection of store.WEEKLY) {
        if (!projection.isHitter) continue;
        if (!isHitterOnlyOverride(projection.playerName)) continue;
        const key = projectionKey(projection);
        if (!byKey.has(key)) {
          byKey.set(key, projection);
        }
      }
    }
    return Array.from(byKey.values());
  }
  __name(projectionsForLineupPeriod, "projectionsForLineupPeriod");

  // src/content/setlineupall.ts
  function selectText(selector) {
    const select = document.querySelector(selector);
    if (!select) return "";
    return select.selectedOptions?.[0]?.textContent?.trim() ?? select.value ?? "";
  }
  __name(selectText, "selectText");
  function periodLabelFromPage() {
    return selectText("#sp_selector") || selectText("select[name='sel_spid'], select") || "";
  }
  __name(periodLabelFromPage, "periodLabelFromPage");
  function periodFromPage() {
    const value = periodLabelFromPage() || document.body.textContent || "";
    const detected = detectPeriodFromText(value);
    return detected === "UNKNOWN" ? "WEEKLY" : detected;
  }
  __name(periodFromPage, "periodFromPage");
  function currentScoringPeriod() {
    const value = selectText("#sp_selector") || selectText("select[name='sel_spid'], select") || document.body.textContent || "";
    const match = value.match(/Week\s+(\d+)/i);
    return match ? Number(match[1]) : void 0;
  }
  __name(currentScoringPeriod, "currentScoringPeriod");
  function localDateIso2(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  __name(localDateIso2, "localDateIso");
  function pageObservationRoot() {
    return document.getElementById("page_content") ?? document.getElementById("react_root") ?? document.getElementById("page") ?? document.body;
  }
  __name(pageObservationRoot, "pageObservationRoot");
  async function waitForTeamBlocks() {
    const deadline = Date.now() + 1e4;
    let lastBlockCount = 0;
    let lastSelectCount = 0;
    let stableTicks = 0;
    while (Date.now() < deadline) {
      const blockCount = document.querySelectorAll("[id^='tl_']").length;
      const selectCount = document.querySelectorAll("select.lineup_position").length;
      if (blockCount > 0 && selectCount > 0) {
        stableTicks = blockCount === lastBlockCount && selectCount === lastSelectCount ? stableTicks + 1 : 1;
        lastBlockCount = blockCount;
        lastSelectCount = selectCount;
        if (stableTicks >= 4) {
          return;
        }
      } else {
        lastBlockCount = blockCount;
        lastSelectCount = selectCount;
        stableTicks = 0;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    throw new Error("Set lineup all team blocks did not stabilize.");
  }
  __name(waitForTeamBlocks, "waitForTeamBlocks");
  function inferLeagueType(label, fallback) {
    const normalized = label.toUpperCase();
    if (normalized.includes("DRAFT CHAMPIONS") || normalized.includes("GLADIATOR")) {
      return { leagueType: "15T_DRAFT_CHAMPIONS", inferred: true };
    }
    if (normalized.includes("MAIN EVENT") || normalized.includes("AUCTION CHAMPIONSHIP") || normalized.includes("ONLINE AUCTION CHAMPIONSHIP") || normalized.includes("INVITATIONAL") || normalized.includes("LEAGUES #")) {
      return { leagueType: "15T_FAAB_MAIN_EVENT", inferred: true };
    }
    return { leagueType: fallback, inferred: false };
  }
  __name(inferLeagueType, "inferLeagueType");
  function shouldSkipLeague(label) {
    return label.toUpperCase().includes("GLADIATOR");
  }
  __name(shouldSkipLeague, "shouldSkipLeague");
  function markUnavailable(rows, activeRosters, activeNames, ilFlags, rosterStatus) {
    rows.forEach((row) => {
      if (shouldMarkMinorLeaguer(row, activeRosters, activeNames)) {
        row.injuryStatus = "MINORS";
      }
      const key = `${row.normalizedName}|${row.normalizedTeam ?? ""}`;
      if (ilFlags.has(key) && !isUnavailableForLineup(row)) {
        row.injuryStatus = row.injuryStatus ? `${row.injuryStatus} IL` : "IL";
      }
      if (shouldMarkRosteredIl(row, row.normalizedTeam ? rosterStatus.get(row.normalizedTeam) : void 0)) {
        row.injuryStatus = row.injuryStatus ? `${row.injuryStatus} IL` : "IL";
      }
    });
  }
  __name(markUnavailable, "markUnavailable");
  function isVisibleTeamBlock(block) {
    const style = window.getComputedStyle(block);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = block.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  __name(isVisibleTeamBlock, "isVisibleTeamBlock");
  function warningSummaryLines(plans) {
    return plans.filter((plan) => plan.warnings.length > 0).slice(0, 4).flatMap((plan) => plan.warnings.slice(0, 3).map((warning) => `${plan.leagueLabel}: ${warning}`)).slice(0, 8);
  }
  __name(warningSummaryLines, "warningSummaryLines");
  function isBulkView(blocks) {
    return blocks.length > 1;
  }
  __name(isBulkView, "isBulkView");
  function buildSummaryLines(period, plans, summaryLines, currentTotal, optimizedTotal, warningCount, modeNote, extraLines = [], staleWarning) {
    const gain = optimizedTotal - currentTotal;
    const gainStr = gain > 5e-3 ? `  (+${gain.toFixed(2)})` : "";
    return [
      ...staleWarning ? [staleWarning] : [],
      `Period: ${period}`,
      `Value: ${currentTotal.toFixed(2)} \u2192 ${optimizedTotal.toFixed(2)}${gainStr}`,
      ...summaryLines.slice(0, 7),
      ...warningCount > 0 ? [`Warnings: ${warningCount}`, ...warningSummaryLines(plans)] : [],
      modeNote,
      ...extraLines
    ];
  }
  __name(buildSummaryLines, "buildSummaryLines");
  function formatStaleWarning(stalePeriods, syncMeta) {
    if (stalePeriods.length === 0) return void 0;
    const parts = stalePeriods.map((period) => `${period} ${describeSyncAge(syncMeta[period])}`);
    return `STALE PROJECTIONS \u2014 ${parts.join(", ")}. Open extension options and re-sync.`;
  }
  __name(formatStaleWarning, "formatStaleWarning");
  async function runSetLineupAllPage() {
    applyReadabilityTheme("setlineupall");
    const panel = ensurePanel("NFBC Set Lineup All");
    setPanelStatus(panel, "Detecting team blocks", "loading");
    let refreshTimer;
    let refreshInFlight = false;
    let refreshQueued = false;
    let refreshQueuedForce = false;
    let lastSignature = "";
    const pageSignature = /* @__PURE__ */ __name(() => {
      const teamFilter = document.querySelector("#team_selector")?.value ?? "";
      const subPeriod = document.querySelector("#sp_selector")?.value ?? "";
      const visibleBlockIds = Array.from(document.querySelectorAll("[id^='tl_']")).filter(isVisibleTeamBlock).map((block) => block.id).join(",");
      return `${teamFilter}|${subPeriod}|${visibleBlockIds}`;
    }, "pageSignature");
    const refresh = /* @__PURE__ */ __name(async (force = false) => {
      if (refreshInFlight) {
        refreshQueued = true;
        refreshQueuedForce = refreshQueuedForce || force;
        return;
      }
      const signature = pageSignature();
      if (!force && signature === lastSignature) {
        return;
      }
      refreshInFlight = true;
      try {
        await waitForTeamBlocks();
        const settings = await getSettings();
        try {
          await chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.ensureFreshProjections,
            periods: ["WEEKLY", "MON_THU", "FRI_SUN", "ROS"],
            maxAgeMinutes: force ? 0 : ON_DEMAND_FRESHNESS_MINUTES
          });
        } catch (error) {
          console.warn("[NFBC] on-demand projection refresh failed", error);
        }
        const store = await loadLineupStore(periodLabelFromPage());
        const syncMeta = await getSyncMeta();
        const leagueMap = await getLeagueMap();
        const period = periodFromPage();
        const projections = projectionsForLineupPeriod(store, period);
        const stalePeriods = ["WEEKLY", period].filter((value, index, array) => array.indexOf(value) === index).filter((value) => isProjectionStale(syncMeta[value]));
        const parsedScoringPeriod = settings.currentScoringPeriodOverride ?? currentScoringPeriod();
        const scoringPeriod = parsedScoringPeriod ?? 1;
        const progress = scoringPeriod / settings.seasonTotalScoringPeriods;
        if (parsedScoringPeriod != null) {
          void setLineupPeriodMeta({
            anchorWeek: parsedScoringPeriod,
            anchorMondayIso: localDateIso2(lineupPeriodStart(/* @__PURE__ */ new Date(), false)),
            capturedAt: (/* @__PURE__ */ new Date()).toISOString()
          }).catch(() => void 0);
        }
        const blocks = Array.from(document.querySelectorAll("[id^='tl_']")).filter(isVisibleTeamBlock);
        const teamBlocks = blocks.map((block) => ({
          block,
          rows: parseSetLineupAllRoster(block),
          leagueLabel: block.querySelector(".league_name > div")?.textContent?.replace(/\s+/g, " ").trim() ?? block.id
        })).filter((entry) => entry.rows.length > 0 && !shouldSkipLeague(entry.leagueLabel));
        const focused = !isBulkView(blocks);
        const modeNote = focused ? "Focused view \u2014 row badges and lineup bubbles on." : "Bulk view \u2014 row badges and lineup bubbles off for speed.";
        const plans = [];
        const summaryLines = [];
        let totalChanges = 0;
        let currentTotal = 0;
        let optimizedTotal = 0;
        let warningCount = 0;
        const staleWarning = formatStaleWarning(stalePeriods, syncMeta);
        const renderSummaryLines = /* @__PURE__ */ __name((extraLines) => buildSummaryLines(period, plans, summaryLines, currentTotal, optimizedTotal, warningCount, modeNote, extraLines, staleWarning), "renderSummaryLines");
        const allRows = teamBlocks.flatMap((entry) => entry.rows);
        const lineupBubbles = focused ? await fetchLineupBubbles(allRows) : void 0;
        const rosterTeams = Array.from(new Set(allRows.map((row) => row.normalizedTeam).filter((team) => Boolean(team))));
        const [activeRosters, ilFlags, rosterStatus] = await Promise.all([
          fetchActiveRosterNames(rosterTeams).catch(() => /* @__PURE__ */ new Map()),
          fetchFreshIlFlags(allRows).catch(() => /* @__PURE__ */ new Map()),
          // 40-man IL: not time-windowed, unlike the transactions feed above.
          fetchRosterStatusByTeam(rosterTeams).catch(() => /* @__PURE__ */ new Map())
        ]);
        const activeNames = activeNameUnion(activeRosters);
        for (const { block, rows, leagueLabel } of teamBlocks) {
          markUnavailable(rows, activeRosters, activeNames, ilFlags, rosterStatus);
          const slots = parseSetLineupAllSlots(rows);
          const teamId = rows[0]?.teamId ?? block.id.replace(/^tl_/, "");
          const leagueId = rows[0]?.leagueId;
          const mappedLeagueType = leagueId ? leagueMap[leagueId]?.leagueType : void 0;
          const inferredLeague = inferLeagueType(leagueLabel, settings.defaultLeagueType);
          const leagueType = mappedLeagueType ?? inferredLeague.leagueType;
          const profile = LEAGUE_PROFILES[leagueType];
          const result = optimizeLineup(rows, slots, projections, profile, void 0, progress);
          plans.push({
            teamId,
            leagueId,
            leagueLabel,
            rows,
            changes: result.changes,
            assignments: result.assignments.map((assignment) => ({
              playerKey: assignment.playerKey,
              slotId: assignment.slotId.startsWith("OF-") ? "OF" : assignment.slotId
            })),
            currentTotal: result.currentTotal,
            optimizedTotal: result.optimizedTotal,
            warnings: result.warnings,
            scoredPlayers: result.scoredPlayers
          });
          if (focused) {
            annotateSetLineupAllRows(result.scoredPlayers, lineupBubbles);
          }
          const cleanLeagueLabel = usableContestLabel(leagueLabel) ?? (leagueId ? `League #${leagueId}` : leagueLabel);
          void updateRosterCache(leagueId ?? leagueLabel, {
            leagueId: leagueId ?? leagueLabel,
            teamId,
            label: cleanLeagueLabel,
            leagueType,
            capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
            players: rows.map((row) => ({
              name: row.playerName,
              normalizedName: row.normalizedName,
              team: row.mlbTeam,
              normalizedTeam: row.normalizedTeam,
              positions: row.eligiblePositions,
              slot: row.currentSlot,
              isBench: row.isBench,
              playerId: row.pagePlayerId
            }))
          }).catch(() => void 0);
          totalChanges += result.changes.length;
          currentTotal += result.currentTotal;
          optimizedTotal += result.optimizedTotal;
          warningCount += result.warnings.length + (!mappedLeagueType && !inferredLeague.inferred ? 1 : 0);
          if (result.changes.length > 0) {
            summaryLines.push(`${leagueLabel}: ${result.changes.length} change(s), ${result.optimizedTotal.toFixed(2)} opt`);
          }
          if (!mappedLeagueType && !inferredLeague.inferred) {
            summaryLines.push(`${leagueLabel}: using default league profile ${settings.defaultLeagueType}`);
          }
        }
        await highlightSavedChanges(plans.flatMap((plan) => plan.rows));
        setPanelStatus(panel, `${totalChanges} change(s) across ${plans.length} team(s)`, "success");
        renderSummary(panel.summary, renderSummaryLines([]));
        lastSignature = pageSignature();
        panel.optimizeButton.onclick = () => {
          const changedPlans = plans.map((plan) => ({
            plan,
            rows: orderSavedRosterByProjection(plan.rows, plan.assignments, plan.scoredPlayers)
          })).filter(({ plan, rows }) => plan.changes.length > 0 || rows !== plan.rows).map(({ plan, rows }) => ({
            teamId: plan.teamId,
            leagueLabel: plan.leagueLabel,
            rows,
            assignments: plan.assignments,
            forceSave: rows !== plan.rows
          }));
          if (changedPlans.length === 0) {
            setPanelStatus(panel, "No changes to save", "info");
            renderSummary(panel.summary, renderSummaryLines([]));
            return;
          }
          const progressLines = [];
          let savedTeams = 0;
          let completed = false;
          const pushProgressLine = /* @__PURE__ */ __name((line) => {
            progressLines.unshift(line);
            if (progressLines.length > 6) {
              progressLines.length = 6;
            }
          }, "pushProgressLine");
          setPanelBusy(panel, true, { optimize: "Saving...", refresh: "Locked" });
          setPanelStatus(panel, `Saving 0/${changedPlans.length} team(s)`, "loading");
          renderSummary(
            panel.summary,
            renderSummaryLines([
              `Preparing ${changedPlans.length} changed team(s) for save`,
              ...changedPlans.slice(0, 5).map((plan) => `Queued: ${plan.leagueLabel} (${plan.assignments.length} assignments)`)
            ])
          );
          void saveSetLineupAll(changedPlans, (progress2) => {
            if (progress2.phase === "saving") {
              setPanelStatus(panel, `Saving ${progress2.index}/${progress2.total} team(s)`, "loading");
              pushProgressLine(`Saving ${progress2.index}/${progress2.total}: ${progress2.leagueLabel}`);
            } else {
              savedTeams = progress2.index;
              setPanelStatus(panel, `${savedTeams}/${progress2.total} team(s) saved`, "success");
              pushProgressLine(`Saved ${progress2.index}/${progress2.total}: ${progress2.leagueLabel} (${progress2.changedCount} changes)`);
            }
            renderSummary(
              panel.summary,
              renderSummaryLines([...progressLines])
            );
          }).then((result) => {
            completed = true;
            setPanelStatus(panel, `${result.savedTeams} team(s) saved. Reloading...`, "success");
            renderSummary(
              panel.summary,
              renderSummaryLines([
                `Bulk save complete: ${result.savedTeams} team(s) saved`,
                ...progressLines
              ])
            );
            setPanelBusy(panel, true, { optimize: "Saved", refresh: "Reloading..." });
          }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            setPanelStatus(panel, `Save failed after ${savedTeams}/${changedPlans.length} team(s)`, "error");
            renderSummary(
              panel.summary,
              renderSummaryLines([
                `Bulk save stopped after ${savedTeams}/${changedPlans.length} team(s)`,
                message,
                ...progressLines
              ])
            );
          }).finally(() => {
            if (!completed) {
              setPanelBusy(panel, false);
            }
          });
        };
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        setPanelStatus(panel, "Load failed", "error");
        renderSummary(panel.summary, [message]);
        console.error("NFBC setlineupall refresh failed", error);
      } finally {
        refreshInFlight = false;
        if (refreshQueued) {
          refreshQueued = false;
          const queuedForce = refreshQueuedForce;
          refreshQueuedForce = false;
          window.setTimeout(() => {
            void refresh(queuedForce);
          }, 0);
        }
      }
    }, "refresh");
    const scheduleRefresh = /* @__PURE__ */ __name((force = false) => {
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }
      setPanelStatus(panel, "Refreshing...", "loading");
      refreshTimer = window.setTimeout(() => {
        void refresh(force);
      }, 200);
    }, "scheduleRefresh");
    const renderBulkReadyState = /* @__PURE__ */ __name(async () => {
      try {
        await waitForTeamBlocks();
        const blocks = Array.from(document.querySelectorAll("[id^='tl_']")).filter(isVisibleTeamBlock);
        if (!isBulkView(blocks)) {
          await refresh(true);
          return;
        }
        const period = periodFromPage();
        lastSignature = pageSignature();
        setPanelStatus(panel, "Bulk view ready", "info");
        renderSummary(panel.summary, [
          `Period: ${period}`,
          `${blocks.length} visible team(s) detected.`,
          "Bulk view is in fast mode.",
          "Click Refresh to analyze all teams.",
          "Click Optimize only after a completed refresh."
        ]);
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        setPanelStatus(panel, "Load failed", "error");
        renderSummary(panel.summary, [message]);
        console.error("NFBC setlineupall bulk-ready state failed", error);
      }
    }, "renderBulkReadyState");
    panel.refreshButton.onclick = () => {
      void refresh(true);
    };
    document.querySelector("#team_selector")?.addEventListener("change", () => {
      scheduleRefresh(true);
    });
    document.querySelector("#sp_selector")?.addEventListener("change", () => {
      scheduleRefresh(true);
    });
    const observer = new MutationObserver(() => {
      const blocks = Array.from(document.querySelectorAll("[id^='tl_']")).filter(isVisibleTeamBlock);
      if (isBulkView(blocks)) {
        return;
      }
      if (pageSignature() !== lastSignature) {
        scheduleRefresh();
      }
    });
    observer.observe(pageObservationRoot(), {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class", "value"]
    });
    await renderBulkReadyState();
  }
  __name(runSetLineupAllPage, "runSetLineupAllPage");

  // src/content/lineup_downweight.ts
  function applyPostedGame(proj, date, order) {
    const games = proj.hitterGames;
    if (!games?.length) return void 0;
    const today = games.filter((g) => g.date === date);
    if (today.length !== 1) return proj;
    const first = today[0];
    const returning = order != null && first.return_floor > 0;
    const keys = ["PA", "AB", "R", "H", "HR", "RBI", "SB"];
    const stats = { ...proj.stats };
    let scoreDelta = 0, startsDelta = 0;
    const updated = games.map((game) => {
      const oldPa = game.expected_pa;
      let probability = game.p_start, newPa = oldPa;
      if (game === first) {
        probability = order == null ? 0 : 1;
        newPa = order == null ? 0 : 4.52 - 0.104 * (order - 1);
      } else if (returning && game.date > date && !game.confirmed) {
        probability = Math.max(probability, game.return_floor);
        if (probability > game.p_start) {
          newPa = game.p_start > 0 ? oldPa * probability / game.p_start : probability * game.stats.PA;
        }
      }
      const delta = game.stats.PA > 0 ? (newPa - oldPa) / game.stats.PA : 0;
      for (const key of keys) stats[key] = Math.max(0, (stats[key] ?? 0) + game.stats[key] * delta);
      scoreDelta += game.sgp * delta;
      startsDelta += probability - game.p_start;
      return {
        ...game,
        p_start: probability,
        expected_pa: newPa,
        confirmed: game === first ? true : game.confirmed
      };
    });
    const pa = stats.PA ?? 0;
    const starts = Math.max(0, Math.min(proj.teamGames ?? games.length, (proj.expectedStarts ?? 0) + startsDelta));
    const share = starts / Math.max(1, proj.teamGames ?? games.length);
    const role = share >= 0.8 ? "everyday" : share >= 0.6 ? "regular" : share >= 0.3 ? "platoon" : "bench";
    const score = (proj.periodValue ?? 0) + scoreDelta;
    const oldWidth = ((proj.periodP90 ?? score) - (proj.periodP10 ?? score)) / 2;
    const width = oldWidth > 0 ? oldWidth * (0.216 + 0.0194 * pa) / (0.216 + 0.0194 * (proj.stats.PA ?? 0)) : void 0;
    const firstUpdated = updated.find((g) => g.game_pk === first.game_pk);
    const firstScale = first.stats.PA > 0 ? firstUpdated.expected_pa / first.stats.PA : 0;
    return {
      ...proj,
      stats,
      expectedPa: pa,
      expectedStarts: starts,
      hitterGames: updated,
      confirmedReturn: proj.confirmedReturn || returning,
      confirmedStarts: updated.filter((g) => g.confirmed && g.p_start > 0).length,
      roleBucket: role,
      actionable: share >= 0.6 && pa > 0,
      availabilityStatus: order != null ? "active" : proj.availabilityStatus,
      recommendationReasons: order != null ? [returning ? "confirmed_return" : "confirmed_start"] : proj.recommendationReasons,
      periodValue: score,
      periodP10: width == null ? void 0 : score - width,
      periodP90: width == null ? void 0 : score + width,
      firstGame: proj.firstGame?.date === date ? {
        date,
        sgp: first.sgp * firstScale,
        stats: Object.fromEntries(keys.map((k) => [k, first.stats[k] * firstScale]))
      } : proj.firstGame,
      rawRow: { ...proj.rawRow, postedStartApplied: order != null }
    };
  }
  __name(applyPostedGame, "applyPostedGame");
  function scaleProjection(projection, factor, reason) {
    const scale = /* @__PURE__ */ __name((value) => value == null ? value : value * factor, "scale");
    return {
      ...projection,
      periodValue: scale(projection.periodValue),
      periodP10: scale(projection.periodP10),
      periodP90: scale(projection.periodP90),
      expectedPa: scale(projection.expectedPa),
      expectedStarts: scale(projection.expectedStarts),
      rawRow: { ...projection.rawRow, optimizerRoleAdjustment: { label: reason, factor, originalPa: projection.stats.PA } },
      stats: {
        ...projection.stats,
        PA: scale(projection.stats.PA),
        AB: scale(projection.stats.AB),
        H: scale(projection.stats.H),
        HR: scale(projection.stats.HR),
        R: scale(projection.stats.R),
        RBI: scale(projection.stats.RBI),
        SB: scale(projection.stats.SB)
      },
      firstGame: projection.firstGame ? {
        ...projection.firstGame,
        sgp: projection.firstGame.sgp * factor,
        stats: {
          ...projection.firstGame.stats,
          PA: scale(projection.firstGame.stats.PA),
          AB: scale(projection.firstGame.stats.AB),
          H: scale(projection.firstGame.stats.H),
          HR: scale(projection.firstGame.stats.HR),
          R: scale(projection.firstGame.stats.R),
          RBI: scale(projection.firstGame.stats.RBI),
          SB: scale(projection.firstGame.stats.SB)
        }
      } : void 0
    };
  }
  __name(scaleProjection, "scaleProjection");
  function adjustConfirmedOut(projections, rows, lineupBubbles, todayIso, riskBadges = /* @__PURE__ */ new Map(), playingTime = /* @__PURE__ */ new Map()) {
    const roleAdjusted = projections.map((projection) => {
      if (!projection.isHitter) return projection;
      if (projection.hitterGames?.length) return projection;
      const usage = projection.rawRow?.usage_guard;
      const yesterday = /* @__PURE__ */ new Date(`${todayIso}T12:00:00Z`);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const usageAsOf = usage?.as_of ?? usage?.through;
      if (usage?.version === 2 && (usage.games ?? 0) >= 8 && usageAsOf && usageAsOf >= yesterday.toISOString().slice(0, 10)) return projection;
      const key = `${projection.normalizedName}|${projection.normalizedTeam ?? ""}`;
      const recent = playingTime.get(key)?.trend.recent;
      const expectedPa = projection.expectedPa ?? projection.stats.PA ?? 0;
      const teamGames = projection.teamGames ?? 0;
      const minimumGames = projection.callupFlat === true ? 4 : 5;
      if (recent && recent.games >= minimumGames && expectedPa > 0 && teamGames > 0) {
        const recentShare = recent.starts / recent.games;
        const latest = playingTime.get(key)?.trend.latest;
        const falling = playingTime.get(key)?.trend.trend === "falling";
        const observedShare = falling && latest && latest.games >= 4 ? Math.min(recentShare, latest.starts / latest.games) : recentShare;
        const projectedShare = expectedPa / (teamGames * 4);
        const toleratedGap = playingTime.get(key)?.platoon ? 0.08 : 0.15;
        if (observedShare + toleratedGap < projectedShare) {
          const factor = Math.min(1, teamGames * observedShare * 4 / expectedPa);
          return scaleProjection(projection, factor, `LIVE ${recent.starts}/${recent.games}`);
        }
      }
      const risks = riskBadges.get(key) ?? [];
      const decliningRole = risks.find((badge2) => badge2.label === "ROLE\u2193");
      if (decliningRole?.projectionMultiplier != null) {
        return scaleProjection(projection, decliningRole.projectionMultiplier, decliningRole.label);
      }
      const roleBadge = risks.find(
        (badge2) => badge2.label === "NEW" || badge2.label === "RETURN"
      );
      if (!roleBadge) return projection;
      const role = projection.roleBucket?.toLowerCase();
      const projectedStartShare = projection.teamGames && projection.expectedStarts != null ? projection.expectedStarts / projection.teamGames : 0;
      const engineModelsCredibleRole = projection.actionable === true && (role === "regular" || role === "everyday") && projectedStartShare >= 0.6 && projection.callupFlat !== true && projection.provisional !== true;
      if (engineModelsCredibleRole) return projection;
      return scaleProjection(projection, 0.55, roleBadge.label);
    });
    const outKeys = /* @__PURE__ */ new Set();
    const confirmedOrder = /* @__PURE__ */ new Map();
    rows.forEach((row) => {
      const key = `${row.normalizedName}|${row.normalizedTeam ?? ""}`;
      const bubble = lineupBubbles.get(key);
      if (bubble?.tone === "out") {
        outKeys.add(key);
      } else if (bubble?.tone === "in") {
        const order = Number.parseInt(bubble.label, 10);
        if (order >= 1 && order <= 9) confirmedOrder.set(key, order);
      }
    });
    if (outKeys.size === 0 && confirmedOrder.size === 0) {
      return roleAdjusted;
    }
    const sub = /* @__PURE__ */ __name((total, game) => Math.max(0, (total ?? 0) - (game ?? 0)), "sub");
    return roleAdjusted.map((proj) => {
      const g1 = proj.firstGame;
      if (!proj.isHitter || !g1 || g1.date !== todayIso) {
        return proj;
      }
      const key = `${proj.normalizedName}|${proj.normalizedTeam ?? ""}`;
      if (!outKeys.has(key) && !confirmedOrder.has(key)) {
        return proj;
      }
      const order = confirmedOrder.get(key);
      const rebuilt = applyPostedGame(proj, todayIso, order);
      if (rebuilt) return rebuilt;
      if (order != null) {
        const targetPa = 4.52 - 0.104 * (order - 1);
        const currentPa = g1.stats.PA ?? 0;
        if (currentPa >= targetPa) return proj;
        const totalPa = proj.stats.PA ?? 0;
        const ptDetail = riskBadges.get(key)?.find((badge2) => badge2.label === "PT")?.detail;
        const recent = ptDetail?.match(/^Started (\d+) of last (\d+) team games/);
        const isConfirmedSpotStart = recent != null && (Number(recent[1]) === 0 || proj.callupFlat === true && Number(recent[1]) <= 1) && Number(recent[2]) >= 8;
        const recentStarts = recent ? Number(recent[1]) : void 0;
        const recentGames = recent ? Number(recent[2]) : void 0;
        const isPremiumSlotReturn = recentStarts != null && recentGames != null && recentStarts >= 1 && recentStarts <= 3 && recentGames >= 8 && order <= 5 && proj.callupFlat !== true;
        const returnFloorPa = targetPa * 2;
        if (isPremiumSlotReturn && totalPa < returnFloorPa && totalPa > 0) {
          const grow = returnFloorPa / totalPa;
          const scale = /* @__PURE__ */ __name((value) => value == null ? value : value * grow, "scale");
          return {
            ...proj,
            periodValue: scale(proj.periodValue),
            stats: {
              ...proj.stats,
              PA: returnFloorPa,
              AB: scale(proj.stats.AB),
              R: scale(proj.stats.R),
              H: scale(proj.stats.H),
              HR: scale(proj.stats.HR),
              RBI: scale(proj.stats.RBI),
              SB: scale(proj.stats.SB)
            }
          };
        }
        if (isConfirmedSpotStart && totalPa > targetPa) {
          const keep = targetPa / totalPa;
          const scale = /* @__PURE__ */ __name((value) => value == null ? value : value * keep, "scale");
          return {
            ...proj,
            periodValue: scale(proj.periodValue),
            stats: {
              ...proj.stats,
              PA: targetPa,
              AB: scale(proj.stats.AB),
              R: scale(proj.stats.R),
              H: scale(proj.stats.H),
              HR: scale(proj.stats.HR),
              RBI: scale(proj.stats.RBI),
              SB: scale(proj.stats.SB)
            }
          };
        }
        const ratio = currentPa > 0 ? targetPa / currentPa : 0;
        const add = /* @__PURE__ */ __name((game, total) => currentPa > 0 ? (game ?? 0) * (ratio - 1) : totalPa > 0 ? (total ?? 0) / totalPa * targetPa : 0, "add");
        const addedPa = targetPa - currentPa;
        const addedSgp = currentPa > 0 ? g1.sgp * (ratio - 1) : 0;
        return {
          ...proj,
          periodValue: proj.periodValue != null ? proj.periodValue + addedSgp : proj.periodValue,
          stats: {
            ...proj.stats,
            PA: (proj.stats.PA ?? 0) + addedPa,
            AB: (proj.stats.AB ?? 0) + add(g1.stats.AB, proj.stats.AB),
            R: (proj.stats.R ?? 0) + add(g1.stats.R, proj.stats.R),
            H: (proj.stats.H ?? 0) + add(g1.stats.H, proj.stats.H),
            HR: (proj.stats.HR ?? 0) + add(g1.stats.HR, proj.stats.HR),
            RBI: (proj.stats.RBI ?? 0) + add(g1.stats.RBI, proj.stats.RBI),
            SB: (proj.stats.SB ?? 0) + add(g1.stats.SB, proj.stats.SB)
          }
        };
      }
      return {
        ...proj,
        periodValue: proj.periodValue != null ? proj.periodValue - g1.sgp : proj.periodValue,
        stats: {
          ...proj.stats,
          PA: sub(proj.stats.PA, g1.stats.PA),
          AB: sub(proj.stats.AB, g1.stats.AB),
          R: sub(proj.stats.R, g1.stats.R),
          H: sub(proj.stats.H, g1.stats.H),
          HR: sub(proj.stats.HR, g1.stats.HR),
          RBI: sub(proj.stats.RBI, g1.stats.RBI),
          SB: sub(proj.stats.SB, g1.stats.SB)
        }
      };
    });
  }
  __name(adjustConfirmedOut, "adjustConfirmedOut");
  function downweightConfirmedOut(...args) {
    return adjustConfirmedOut(...args).map((p, i) => p !== args[0][i] && p.isHitter && p.stats.SB != null ? { ...p, stealProbability: -Math.expm1(-Math.max(0, p.stats.SB)) } : p);
  }
  __name(downweightConfirmedOut, "downweightConfirmedOut");

  // src/core/news_impact.ts
  function classifyPlayerNews(playerName, headline, publishedAt, sourceUrl) {
    const text2 = headline.toLowerCase();
    const setback = /setback|shut down|shutdown|placed on (?:the )?(?:\d+-day )?injured list|remain(?:s)? out|not close|surgery/.test(text2);
    const returning = /activat(?:e|ed|ing)|expected to (?:return|debut|start)|set to (?:return|debut|start)|will (?:return|debut|start)|rejoin/.test(text2);
    const at = Date.parse(publishedAt);
    const expires = new Date((Number.isFinite(at) ? at : Date.now()) + 7 * 864e5).toISOString();
    return {
      playerName,
      normalizedName: normalizeName(playerName),
      headline,
      publishedAt,
      sourceUrl,
      kind: setback ? "setback" : returning ? "return" : "informational",
      factor: setback ? 0 : returning ? 1.15 : 1,
      expiresAt: expires
    };
  }
  __name(classifyPlayerNews, "classifyPlayerNews");
  function applyNewsImpacts(projections, impacts, now = Date.now(), rosFallbacks = []) {
    const fallbackByName = new Map(rosFallbacks.filter((projection) => projection.isHitter).map((projection) => [projection.normalizedName, projection]));
    return projections.map((projection) => {
      const impact = impacts.get(projection.normalizedName);
      if (!impact || impact.factor === 1 || Date.parse(impact.expiresAt) < now) return projection;
      if (impact.kind === "return" && projection.hitterGames?.length) return projection;
      const currentPa = projection.expectedPa ?? projection.stats.PA ?? 0;
      const fallback = fallbackByName.get(projection.normalizedName);
      if (impact.kind === "return" && projection.isHitter && currentPa <= 0 && fallback) {
        const games = Math.max(0, projection.teamGames ?? 0);
        const rosGames = Math.max(1, fallback.teamGames ?? fallback.rosSchedule?.games ?? 1);
        const rosStarts = Math.max(0, fallback.expectedStarts ?? 0);
        const startShare = Math.min(0.8, Math.max(0.5, rosStarts / rosGames));
        const expectedStarts = games * startShare;
        const rosPa = Math.max(0, fallback.expectedPa ?? fallback.stats.PA ?? 0);
        const paPerStart = rosStarts > 0 ? Math.min(4.3, Math.max(3.6, rosPa / rosStarts)) : 4;
        const expectedPa = expectedStarts * paPerStart;
        const scaleFromRos = rosPa > 0 ? expectedPa / rosPa : 0;
        const stats = Object.fromEntries(Object.entries(fallback.stats).map(([key, value]) => [key, typeof value === "number" ? value * scaleFromRos : value]));
        return {
          ...projection,
          periodValue: typeof fallback.periodValue === "number" ? fallback.periodValue * scaleFromRos : projection.periodValue,
          periodP10: void 0,
          periodP90: void 0,
          expectedPa,
          expectedStarts,
          roleBucket: "provisional",
          availabilityStatus: "active",
          actionable: true,
          provisional: true,
          recommendationReasons: ["explicit_return_news_pending_roster_update"],
          stats,
          stealProbability: projection.isHitter && stats.SB != null ? -Math.expm1(-Math.max(0, stats.SB)) : projection.stealProbability,
          stealPitcherContext: fallback.stealPitcherContext,
          rawRow: { ...projection.rawRow, newsImpact: impact, newsReturnBaseline: "ros_role_rates" }
        };
      }
      const scale = /* @__PURE__ */ __name((value) => value == null ? value : value * impact.factor, "scale");
      return {
        ...projection,
        periodValue: scale(projection.periodValue),
        expectedPa: scale(projection.expectedPa),
        expectedStarts: scale(projection.expectedStarts),
        hitterGames: projection.hitterGames?.map((game) => ({
          ...game,
          expected_pa: game.expected_pa * impact.factor,
          p_start: Math.min(1, game.p_start * impact.factor)
        })),
        stealProbability: projection.isHitter && projection.stats.SB != null ? -Math.expm1(-Math.max(0, projection.stats.SB * impact.factor)) : projection.stealProbability,
        stats: Object.fromEntries(Object.entries(projection.stats).map(([key, value]) => [key, typeof value === "number" ? value * impact.factor : value])),
        rawRow: { ...projection.rawRow, newsImpact: impact }
      };
    });
  }
  __name(applyNewsImpacts, "applyNewsImpacts");
  function applyReturnNewsAvailability(rows, impacts, now = Date.now()) {
    for (const row of rows) {
      const impact = impacts.get(row.normalizedName);
      if (!impact || impact.kind !== "return" || Date.parse(impact.expiresAt) < now) continue;
      const status = (row.injuryStatus ?? "").toUpperCase();
      if (/\bIL\b|IL\d|\bSUS\b|DTD/.test(status)) continue;
      if (/\bNA\b|MINOR|MILB|\bAAA\b|\bAA\b/.test(status)) row.injuryStatus = void 0;
    }
  }
  __name(applyReturnNewsAvailability, "applyReturnNewsAvailability");

  // src/content/player_news.ts
  var FEEDS = [
    "https://www.fantasysp.com/rss/mlb/allplayeral/",
    "https://www.fantasysp.com/rss/mlb/allplayernl/"
  ];
  var CACHE_KEY = "nfbc.playerNews.v1";
  var TTL_MS = 30 * 60 * 1e3;
  function text(node, tag) {
    return node.querySelector(tag)?.textContent?.trim() ?? "";
  }
  __name(text, "text");
  function parsePlayerNewsRss(xml) {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const out = [];
    for (const item of Array.from(doc.querySelectorAll("item"))) {
      const headline = text(item, "title");
      const description = text(item, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const link = text(item, "link");
      const publishedAt = text(item, "pubDate") || (/* @__PURE__ */ new Date()).toISOString();
      const explicit = text(item, "player") || text(item, "author");
      const playerName = explicit && !explicit.includes("@") ? explicit : headline.match(/^([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,2})\b/)?.[1] ?? "";
      if (!playerName) continue;
      out.push(classifyPlayerNews(playerName, `${headline}. ${description}`, publishedAt, link));
    }
    return out;
  }
  __name(parsePlayerNewsRss, "parsePlayerNewsRss");
  async function fetchPlayerNewsImpacts() {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    const cached = stored[CACHE_KEY];
    let impacts = cached?.impacts ?? [];
    if (!cached || Date.now() - cached.fetchedAt > TTL_MS) {
      const batches = await Promise.all(FEEDS.map(async (url) => {
        const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.fetchText, url });
        return response?.ok ? parsePlayerNewsRss(String(response.payload ?? "")) : [];
      }));
      const fresh = batches.flat();
      if (fresh.length) {
        impacts = fresh;
        await chrome.storage.local.set({ [CACHE_KEY]: { fetchedAt: Date.now(), impacts } });
      }
    }
    const now = Date.now();
    const byName = /* @__PURE__ */ new Map();
    for (const impact of impacts) {
      if (Date.parse(impact.expiresAt) < now) continue;
      const key = normalizeName(impact.playerName);
      const existing = byName.get(key);
      if (!existing || Date.parse(impact.publishedAt) > Date.parse(existing.publishedAt)) byName.set(key, impact);
    }
    return byName;
  }
  __name(fetchPlayerNewsImpacts, "fetchPlayerNewsImpacts");
  function annotatePlayerNews(impacts) {
    for (const link of Array.from(document.querySelectorAll('a[href*="/player/baseball/"]'))) {
      const name = link.textContent?.replace(/\s+/g, " ").trim();
      if (!name) continue;
      const impact = impacts.get(normalizeName(name));
      if (!impact) continue;
      const host = link.parentElement ?? link;
      let badge2 = host.querySelector("[data-nfbc-news]");
      if (!badge2) {
        badge2 = document.createElement("span");
        badge2.dataset.nfbcNews = "1";
        badge2.className = "nfbc-sl-badge";
        host.append(badge2);
      }
      badge2.textContent = impact.kind === "return" ? "NEWS+" : impact.kind === "setback" ? "NEWS\u2212" : "NEWS";
      badge2.title = `${impact.headline}
Published: ${new Date(impact.publishedAt).toLocaleString()}${impact.sourceUrl ? `
Source: ${impact.sourceUrl}` : ""}`;
    }
  }
  __name(annotatePlayerNews, "annotatePlayerNews");

  // src/content/standings_scraper.ts
  var CATEGORY_ORDER = ["R", "HR", "RBI", "SB", "AVG", "W", "K", "SV", "ERA", "WHIP"];
  var LIVESCORING_STAT_KEY2 = {
    R: "h_r",
    HR: "h_hr",
    RBI: "h_rbi",
    SB: "h_sb",
    AVG: "h_avg",
    W: "p_w",
    K: "p_k",
    SV: "p_s",
    ERA: "p_era",
    WHIP: "p_whip"
  };
  var HITTING_CATEGORIES = ["R", "HR", "RBI", "SB", "AVG"];
  var PITCHING_CATEGORIES = ["W", "K", "SV", "ERA", "WHIP"];
  var LOWER_IS_BETTER = /* @__PURE__ */ new Set(["ERA", "WHIP"]);
  function selectOptimizationContext(bundle, progress = 0) {
    const mode = /* @__PURE__ */ __name((context) => usesLateSeasonContext([context], progress) ? " \xB7 late-season points" : "", "mode");
    const leagueRank = bundle?.leagueRank?.rank;
    const leagueCount = bundle?.leagueRank?.teamCount;
    const hasLeagueRank = Number.isFinite(leagueRank) && Number.isFinite(leagueCount) && (leagueRank ?? 0) > 0 && (leagueCount ?? 0) > 0;
    const tracksOverall = hasLeagueRank && leagueRank <= 2;
    if (tracksOverall) {
      if (bundle?.overall) {
        return {
          contexts: [bundle.overall],
          comparisonContexts: bundle.league ? [bundle.league] : void 0,
          comparisonLabel: bundle.league ? "League context comparison" : void 0,
          comparisonReason: bundle.league ? "Shown separately from the primary overall-context recommendation." : void 0,
          source: "overall",
          label: "Overall context \xB7 league top 2" + mode(bundle.overall),
          reason: `League rank ${leagueRank} of ${leagueCount} is in the top two.`
        };
      }
      return {
        source: "raw",
        label: "Raw SGP \xB7 overall context unavailable",
        reason: `League rank ${leagueRank} of ${leagueCount} is in the top two, but overall category context is unavailable.`
      };
    }
    if (bundle?.league) {
      return {
        contexts: [bundle.league],
        source: "league",
        label: "League context" + mode(bundle.league),
        reason: hasLeagueRank ? `League rank ${leagueRank} of ${leagueCount} is outside the top two.` : "League rank is unavailable, so the optimizer defaults to league context."
      };
    }
    return {
      source: "raw",
      label: "Raw SGP \xB7 league context unavailable",
      reason: hasLeagueRank ? `League rank ${leagueRank} of ${leagueCount} is outside the top two, but league category context is unavailable.` : "League rank and league category context are unavailable."
    };
  }
  __name(selectOptimizationContext, "selectOptimizationContext");
  async function fetchText2(url) {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.fetchText, url });
    return response?.ok ? response.payload : null;
  }
  __name(fetchText2, "fetchText");
  async function postForm(url, body) {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.postForm,
      url,
      body: body.toString()
    });
    return response?.ok ? response.payload : null;
  }
  __name(postForm, "postForm");
  function parseDocument(html) {
    return new DOMParser().parseFromString(html, "text/html");
  }
  __name(parseDocument, "parseDocument");
  function buildOverallDigest(html) {
    const scanned = scanOverallDigest(html);
    if (scanned) {
      return scanned;
    }
    const doc = parseDocument(html);
    const table = doc.querySelector("table#standings_overall_1, table.data");
    if (!table) {
      return void 0;
    }
    const headerRow = findHeaderRow(table);
    if (!headerRow) {
      return void 0;
    }
    const headerMap = /* @__PURE__ */ new Map();
    Array.from(headerRow.querySelectorAll("th, td")).forEach((cell, index) => {
      headerMap.set(cell.textContent?.trim().toUpperCase() ?? "", index);
    });
    const teamColIdx = headerMap.get("TEAM") ?? -1;
    const rankColIdx = headerMap.get("RANK") ?? -1;
    const leagueColIdx = headerMap.get("LEAGUE") ?? -1;
    const rows = [];
    const dataRows = Array.from(table.rows).slice(Array.from(table.rows).indexOf(headerRow) + 1);
    for (const row of dataRows) {
      const link = row.querySelector("a[href*='/teamstats/']");
      const teamId = link?.href.match(/\/teamstats\/\d+\/(\d+)\/\d+/)?.[1];
      if (!teamId) {
        continue;
      }
      const cells = Array.from(row.cells);
      rows.push({
        teamId,
        name: teamColIdx >= 0 ? normalizeTeamName(cells[teamColIdx]?.textContent) : "",
        overallRank: rankColIdx >= 0 ? parseNumeric(cells[rankColIdx]?.textContent) ?? void 0 : void 0,
        league: leagueColIdx >= 0 ? cells[leagueColIdx]?.textContent?.replace(/\s+/g, " ").trim() : void 0,
        values: Object.fromEntries(
          CATEGORY_ORDER.map((category) => [
            category,
            parseNumeric(cells[headerMap.get(category) ?? -1]?.textContent)
          ])
        )
      });
    }
    return rows.length > 0 ? { rows } : void 0;
  }
  __name(buildOverallDigest, "buildOverallDigest");
  function asDigest(source) {
    return typeof source === "string" ? buildOverallDigest(source) : source;
  }
  __name(asDigest, "asDigest");
  function emptyContext(label) {
    return {
      label,
      categories: Object.fromEntries(
        CATEGORY_ORDER.map((category) => [category, { gain: null, loss: null, tag: "neutral" }])
      )
    };
  }
  __name(emptyContext, "emptyContext");
  function parseNumeric(text2) {
    if (!text2) return null;
    const cleaned = text2.replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  __name(parseNumeric, "parseNumeric");
  function normalizeTeamName(value) {
    return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  __name(normalizeTeamName, "normalizeTeamName");
  function percentileTone(percentile) {
    if (percentile == null) {
      return "neutral";
    }
    if (percentile >= 80) {
      return "elite";
    }
    if (percentile >= 60) {
      return "strong";
    }
    if (percentile >= 40) {
      return "neutral";
    }
    if (percentile >= 20) {
      return "weak";
    }
    return "poor";
  }
  __name(percentileTone, "percentileTone");
  function buildPercentile(entries, teamId) {
    const currentIndex = entries.findIndex((entry) => entry.teamId === teamId);
    if (currentIndex < 0) {
      return {
        percentile: null,
        rank: null,
        teamCount: entries.length,
        value: null,
        tone: "neutral"
      };
    }
    let rankIndex = currentIndex;
    while (rankIndex > 0 && entries[rankIndex - 1]?.value === entries[currentIndex]?.value) {
      rankIndex--;
    }
    const teamCount = entries.length;
    const percentile = teamCount <= 1 ? 100 : (teamCount - 1 - rankIndex) / (teamCount - 1) * 100;
    return {
      percentile,
      rank: rankIndex + 1,
      teamCount,
      value: entries[currentIndex]?.value ?? null,
      tone: percentileTone(percentile)
    };
  }
  __name(buildPercentile, "buildPercentile");
  function extractSelectedValue(select) {
    if (!select) return void 0;
    const explicitlySelected = Array.from(select.querySelectorAll("option[selected]")).at(-1);
    if (explicitlySelected instanceof HTMLOptionElement) {
      return explicitlySelected.value;
    }
    if (select instanceof HTMLSelectElement) {
      return select.value || void 0;
    }
    const option = select.querySelector("option");
    return option instanceof HTMLOptionElement ? option.value : void 0;
  }
  __name(extractSelectedValue, "extractSelectedValue");
  function extractSelectedGameTypeOption(doc) {
    const select = doc.querySelector("#game_type_id");
    const explicitlySelected = Array.from(select?.querySelectorAll("option[selected]") ?? []);
    const candidate = explicitlySelected.at(-1);
    if (candidate instanceof HTMLOptionElement) {
      return candidate;
    }
    return select?.querySelector("option") ?? void 0;
  }
  __name(extractSelectedGameTypeOption, "extractSelectedGameTypeOption");
  function parseOverallRequestConfig(html) {
    const doc = parseDocument(html);
    const gameTypeOption = extractSelectedGameTypeOption(doc);
    const gameTypeSelect = doc.querySelector("#game_type_id");
    const sport = doc.querySelector("#sport")?.value;
    const standingsType = extractSelectedValue(doc.querySelector("#standings_type"));
    if (!sport || !gameTypeOption?.value || !standingsType) {
      return void 0;
    }
    return {
      sport,
      defaultGameTypeId: gameTypeOption.value,
      standingsType,
      gameTypeOptions: Array.from(gameTypeSelect?.querySelectorAll("option") ?? []).map((option) => ({
        label: option.textContent?.trim() ?? "",
        value: option.getAttribute("value") ?? ""
      })).filter((option) => option.label && option.value)
    };
  }
  __name(parseOverallRequestConfig, "parseOverallRequestConfig");
  function normalizeContestLabel(value) {
    return (value ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  __name(normalizeContestLabel, "normalizeContestLabel");
  function chooseGameTypeId(contestLabel, options, defaultValue) {
    const normalizedContest = normalizeContestLabel(contestLabel);
    if (!normalizedContest) {
      return defaultValue;
    }
    const normalizedOptions = options.map((option) => ({ value: option.value, normalizedLabel: normalizeContestLabel(option.label) })).filter((option) => option.normalizedLabel.length > 0);
    const longestMatchIn = /* @__PURE__ */ __name((haystack) => normalizedOptions.filter((option) => haystack.includes(option.normalizedLabel)).sort((left, right) => right.normalizedLabel.length - left.normalizedLabel.length)[0]?.value, "longestMatchIn");
    const priceMatch = (contestLabel ?? "").match(/\$\s?\d/);
    if (priceMatch?.index != null && priceMatch.index > 0) {
      const prefixValue = longestMatchIn(normalizeContestLabel((contestLabel ?? "").slice(0, priceMatch.index)));
      if (prefixValue) {
        return prefixValue;
      }
    }
    return longestMatchIn(normalizedContest) ?? defaultValue;
  }
  __name(chooseGameTypeId, "chooseGameTypeId");
  function inferOverallGameTypeId(contestLabel, config) {
    return chooseGameTypeId(contestLabel, config.gameTypeOptions, config.defaultGameTypeId);
  }
  __name(inferOverallGameTypeId, "inferOverallGameTypeId");
  function classifyGap(entries, currentIndex) {
    const current = entries[currentIndex];
    if (!current) {
      return "neutral";
    }
    const gain = currentIndex > 0 ? Math.abs(current.value - entries[currentIndex - 1].value) : null;
    const loss = currentIndex < entries.length - 1 ? Math.abs(entries[currentIndex + 1].value - current.value) : null;
    const range = Math.abs((entries[0]?.value ?? current.value) - (entries.at(-1)?.value ?? current.value));
    const normalizedRange = range > 0 ? range : 1;
    const gainNorm = gain == null ? Number.POSITIVE_INFINITY : gain / normalizedRange;
    const lossNorm = loss == null ? Number.POSITIVE_INFINITY : loss / normalizedRange;
    const urgentThreshold = 0.12;
    if (gain != null && (loss == null || gainNorm <= lossNorm * 0.85) && gainNorm <= urgentThreshold) {
      return "attack";
    }
    if (loss != null && (gain == null || lossNorm <= gainNorm * 0.85) && lossNorm <= urgentThreshold) {
      return "protect";
    }
    return "neutral";
  }
  __name(classifyGap, "classifyGap");
  function buildGap(entries, teamId) {
    const currentIndex = entries.findIndex((entry) => entry.teamId === teamId);
    if (currentIndex < 0) {
      return { gain: null, loss: null, tag: "neutral" };
    }
    const current = entries[currentIndex];
    return {
      fieldGaps: entries.filter((_, index) => index !== currentIndex).map((entry) => Math.abs(entry.value - current.value)),
      gain: currentIndex > 0 ? Math.abs(current.value - entries[currentIndex - 1].value) : null,
      loss: currentIndex < entries.length - 1 ? Math.abs(entries[currentIndex + 1].value - current.value) : null,
      tag: classifyGap(entries, currentIndex)
    };
  }
  __name(buildGap, "buildGap");
  function isLeagueCategoryHeaderRow(row) {
    const labels = Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent?.trim().toUpperCase() ?? "");
    return labels.includes("TEAM") && labels.some((label) => CATEGORY_ORDER.includes(label));
  }
  __name(isLeagueCategoryHeaderRow, "isLeagueCategoryHeaderRow");
  function findHeaderRow(table) {
    return Array.from(table.rows).find((row) => {
      const labels = Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent?.trim().toUpperCase() ?? "");
      return labels.includes("TEAM") && labels.some((label) => CATEGORY_ORDER.includes(label));
    });
  }
  __name(findHeaderRow, "findHeaderRow");
  function parseLeagueEntriesAfterHeader(rows, startIndex) {
    const headerRow = rows[startIndex];
    if (!headerRow) {
      return void 0;
    }
    const headers = Array.from(headerRow.querySelectorAll("th, td")).map((cell) => cell.textContent?.trim().toUpperCase() ?? "");
    const category = headers[2];
    if (!category || !CATEGORY_ORDER.includes(category)) {
      return void 0;
    }
    const entries = [];
    for (const row of rows.slice(startIndex + 1)) {
      if (isLeagueCategoryHeaderRow(row)) {
        break;
      }
      const cells = Array.from(row.cells);
      const link = row.querySelector("a[href*='/teamstats/']");
      const teamId = link?.href.match(/\/teamstats\/\d+\/(\d+)\/\d+/)?.[1];
      const value = parseNumeric(cells[2]?.textContent);
      if (!teamId || value == null) {
        continue;
      }
      entries.push({ teamId, value });
    }
    return entries.length > 0 ? { category, entries } : void 0;
  }
  __name(parseLeagueEntriesAfterHeader, "parseLeagueEntriesAfterHeader");
  function parseLeagueEntries(table) {
    const rows = Array.from(table.rows);
    const sections = [];
    rows.forEach((row, index) => {
      if (!isLeagueCategoryHeaderRow(row)) {
        return;
      }
      const parsed = parseLeagueEntriesAfterHeader(rows, index);
      if (parsed) {
        sections.push(parsed);
      }
    });
    return sections;
  }
  __name(parseLeagueEntries, "parseLeagueEntries");
  function parseOverallPointTable(source, teamId) {
    const parsedRows = asDigest(source)?.rows;
    if (!parsedRows || parsedRows.length === 0) {
      return void 0;
    }
    const context = emptyContext("overall");
    const percentiles = {
      label: "overall",
      categories: Object.fromEntries(
        CATEGORY_ORDER.map((category) => [
          category,
          {
            percentile: null,
            rank: null,
            teamCount: 0,
            value: null,
            tone: "neutral"
          }
        ])
      )
    };
    const pointsByTeam = /* @__PURE__ */ new Map();
    for (const category of CATEGORY_ORDER) {
      const ranked = parsedRows.map((row) => ({ teamId: row.teamId, value: row.values[category] })).filter((row) => row.value != null).sort(
        (left, right) => LOWER_IS_BETTER.has(category) ? left.value - right.value : right.value - left.value
      );
      context.categories[category] = buildGap(ranked, teamId);
      percentiles.categories[category] = buildPercentile(ranked, teamId);
      const n2 = ranked.length;
      let i = 0;
      while (i < n2) {
        let j = i;
        while (j + 1 < n2 && ranked[j + 1].value === ranked[i].value) {
          j += 1;
        }
        const avgPoints = (n2 - i + (n2 - j)) / 2;
        for (let k = i; k <= j; k++) {
          const id = ranked[k].teamId;
          pointsByTeam.set(id, (pointsByTeam.get(id) ?? 0) + avgPoints);
        }
        i = j + 1;
      }
    }
    const teamPoints = pointsByTeam.get(teamId);
    const overall = teamPoints == null ? void 0 : {
      points: teamPoints,
      teamCount: pointsByTeam.size,
      rank: 1 + Array.from(pointsByTeam.values()).filter((value) => value > teamPoints).length
    };
    return { context, percentiles, overall };
  }
  __name(parseOverallPointTable, "parseOverallPointTable");
  function parseLeagueStandingsContext(html, teamId) {
    const doc = parseDocument(html);
    const context = emptyContext("league");
    Array.from(doc.querySelectorAll("table")).forEach((table) => {
      parseLeagueEntries(table).forEach((parsed) => {
        context.categories[parsed.category] = buildGap(parsed.entries, teamId);
      });
    });
    const populated = CATEGORY_ORDER.some((category) => {
      const gap = context.categories[category];
      return gap.gain != null || gap.loss != null;
    });
    return populated ? context : void 0;
  }
  __name(parseLeagueStandingsContext, "parseLeagueStandingsContext");
  function formatGap(value) {
    if (value == null) return "-";
    if (Math.abs(value) >= 10) return value.toFixed(0);
    if (Math.abs(value) >= 1) return value.toFixed(1);
    return value.toFixed(3);
  }
  __name(formatGap, "formatGap");
  function formatContextLine(label, categories, context) {
    const parts = categories.map((category) => {
      const gap = context?.categories[category] ?? { gain: null, loss: null, tag: "neutral" };
      const tag = gap.tag === "attack" ? "A" : gap.tag === "protect" ? "P" : "N";
      return `${category} ${tag} ${formatGap(gap.gain)}/${formatGap(gap.loss)}`;
    });
    return `${label}: ${parts.join(" | ")}`;
  }
  __name(formatContextLine, "formatContextLine");
  function buildSummaryLines2(bundle) {
    return [
      formatContextLine("League H", HITTING_CATEGORIES, bundle.league),
      formatContextLine("League P", PITCHING_CATEGORIES, bundle.league),
      formatContextLine("Overall H", HITTING_CATEGORIES, bundle.overall),
      formatContextLine("Overall P", PITCHING_CATEGORIES, bundle.overall)
    ];
  }
  __name(buildSummaryLines2, "buildSummaryLines");
  async function fetchLivescoringAll() {
    const raw = await fetchText2("https://nfc.shgn.com/api/react/livescoring_all");
    if (!raw) {
      return null;
    }
    try {
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : null;
    } catch {
      return null;
    }
  }
  __name(fetchLivescoringAll, "fetchLivescoringAll");
  function livescoringSessionTeamId(payload) {
    const ti = payload?.ti;
    return typeof ti === "number" || typeof ti === "string" ? String(ti) : void 0;
  }
  __name(livescoringSessionTeamId, "livescoringSessionTeamId");
  function currentSpidFromLivescoring(payload) {
    const spid = payload?.spid;
    return typeof spid === "number" || typeof spid === "string" ? String(spid) : void 0;
  }
  __name(currentSpidFromLivescoring, "currentSpidFromLivescoring");
  function buildLeagueContextFromLivescoring(payload, teamId) {
    const teams = payload.t;
    const base = payload.b;
    if (!teams || !base || !(teamId in teams)) {
      return void 0;
    }
    const teamIds = Object.keys(teams);
    const context = emptyContext("league");
    for (const category of CATEGORY_ORDER) {
      const statKey = LIVESCORING_STAT_KEY2[category];
      const ranked = teamIds.map((id) => {
        const value = base[id]?.s?.[statKey];
        return typeof value === "number" ? { teamId: id, value } : null;
      }).filter((entry) => entry !== null).sort(
        (left, right) => LOWER_IS_BETTER.has(category) ? left.value - right.value : right.value - left.value
      );
      context.categories[category] = buildGap(ranked, teamId);
    }
    const populated = CATEGORY_ORDER.some((category) => {
      const gap = context.categories[category];
      return gap.gain != null || gap.loss != null;
    });
    return populated ? context : void 0;
  }
  __name(buildLeagueContextFromLivescoring, "buildLeagueContextFromLivescoring");
  async function captureStandingsSnapshot(payload, leagueId, spid) {
    try {
      const snapshot = buildStandingsSnapshot(payload, leagueId, todayStamp(), spid);
      if (snapshot) await saveStandingsSnapshot(snapshot);
    } catch (error) {
      console.warn("[NFBC] standings snapshot not recorded", error);
    }
  }
  __name(captureStandingsSnapshot, "captureStandingsSnapshot");
  async function fetchLeagueContext(leagueId, teamId, scoringPeriodId) {
    const livescoring = await fetchLivescoringAll();
    if (livescoring) {
      void captureStandingsSnapshot(livescoring, leagueId, scoringPeriodId);
      const context = buildLeagueContextFromLivescoring(livescoring, teamId);
      if (context) {
        return context;
      }
    }
    const body = new URLSearchParams({
      league_id: leagueId,
      spid: scoringPeriodId,
      standings_type: "league_season_standings",
      view: "classic"
    });
    const hydratedHtml = await postForm("https://nfc.shgn.com/standings.data.php", body);
    if (hydratedHtml) {
      const parsedHydrated = parseLeagueStandingsContext(hydratedHtml, teamId);
      if (parsedHydrated) {
        return parsedHydrated;
      }
    }
    const shellHtml = await fetchText2(`https://nfc.shgn.com/standings/${leagueId}`);
    return shellHtml ? parseLeagueStandingsContext(shellHtml, teamId) : void 0;
  }
  __name(fetchLeagueContext, "fetchLeagueContext");
  function stripStandingsBadge(teamName) {
    return teamName.replace(/T\d+[•·.]\d+\s*$/u, "").trim();
  }
  __name(stripStandingsBadge, "stripStandingsBadge");
  function teamNameForms(teamName) {
    const clean = stripStandingsBadge(teamName);
    const full = normalizeTeamName(clean);
    const bare = normalizeTeamName(clean.split(/\s+-\s+/).pop() ?? "");
    const raw = normalizeTeamName(teamName);
    return Array.from(new Set([full, bare, raw].filter((value) => value.length > 0)));
  }
  __name(teamNameForms, "teamNameForms");
  function resolveTeamIdByName(source, teamName) {
    if (teamNameForms(teamName).length === 0) {
      return void 0;
    }
    const rows = asDigest(source)?.rows;
    if (!rows) {
      return void 0;
    }
    const entries = rows.filter((row) => row.name).map((row) => ({ id: row.teamId, name: row.name }));
    return matchTeamEntry(entries, teamName);
  }
  __name(resolveTeamIdByName, "resolveTeamIdByName");
  function matchTeamEntry(entries, teamName) {
    const forms = teamNameForms(teamName);
    if (forms.length === 0) {
      return void 0;
    }
    const [full, bare] = forms;
    for (const form of forms) {
      const exact = entries.find((entry) => entry.name === form);
      if (exact) {
        return exact.id;
      }
    }
    const looseAgainst = /* @__PURE__ */ __name((form) => entries.filter((entry) => entry.name.includes(form) || form.includes(entry.name)), "looseAgainst");
    for (const form of [full, bare]) {
      if (!form) continue;
      const matches = looseAgainst(form);
      if (matches.length === 1) {
        return matches[0].id;
      }
    }
    return void 0;
  }
  __name(matchTeamEntry, "matchTeamEntry");
  function parseCurrentSpid(pageHtml) {
    const doc = parseDocument(pageHtml);
    return doc.querySelector("#spid, input[name='spid']")?.value || doc.querySelector("select#spid option[selected], select[name='spid'] option[selected]")?.value || void 0;
  }
  __name(parseCurrentSpid, "parseCurrentSpid");
  var overallTableCache = /* @__PURE__ */ new Map();
  var OVERALL_CACHE_LIMIT = 8;
  function overallTablePost(sport, gameTypeId, spid, standingsType) {
    const key = `${sport}|${gameTypeId}|${spid}|${standingsType}`;
    const cached = overallTableCache.get(key);
    if (cached) {
      return cached;
    }
    const pending = (async () => {
      const body = new URLSearchParams({
        sport,
        game_type_id: gameTypeId,
        spid,
        standings_type: standingsType,
        view_type: "stats"
      });
      let digest;
      let bytes = 0;
      let where = "worker";
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.standingsDigest,
        url: "https://nfc.shgn.com/standings_overall.data.php",
        body: body.toString()
      }).catch(() => void 0);
      if (response?.ok && response.payload) {
        bytes = Number(response.payload.bytes ?? 0);
        digest = response.payload.digest ?? void 0;
      } else {
        where = "page";
        const html = await postForm("https://nfc.shgn.com/standings_overall.data.php", body);
        bytes = html?.length ?? 0;
        digest = html && html.length > 1e3 ? buildOverallDigest(html) : void 0;
      }
      console.info("[NFBC] standings_overall POST:", JSON.stringify({
        spid,
        gameTypeId,
        bytes,
        rows: digest?.rows.length ?? 0,
        where
      }));
      return digest ?? null;
    })();
    overallTableCache.set(key, pending);
    while (overallTableCache.size > OVERALL_CACHE_LIMIT) {
      const oldest = overallTableCache.keys().next().value;
      if (oldest === void 0) break;
      overallTableCache.delete(oldest);
    }
    return pending;
  }
  __name(overallTablePost, "overallTablePost");
  async function fetchOverallContext(teamId, scoringPeriodId, contestLabel, teamName) {
    const pageHtml = await fetchText2("https://nfc.shgn.com/standings_overall");
    if (!pageHtml) {
      console.warn("[NFBC] standings_overall page fetch returned nothing");
      return {};
    }
    const config = parseOverallRequestConfig(pageHtml);
    if (!config) {
      console.warn(
        "[NFBC] standings_overall request config not parseable",
        pageHtml.length,
        "bytes"
      );
      return {};
    }
    const gameTypeId = inferOverallGameTypeId(contestLabel, config);
    const livescoringSpid = currentSpidFromLivescoring(await fetchLivescoringAll());
    const preferred = livescoringSpid ?? parseCurrentSpid(pageHtml) ?? scoringPeriodId;
    const previous = Number(preferred) > 1 ? String(Number(preferred) - 1) : void 0;
    const candidates = [preferred, previous].filter((v) => Boolean(v));
    let digest = null;
    let usedSpid;
    for (const spid of candidates) {
      digest = await overallTablePost(config.sport, gameTypeId, spid, config.standingsType);
      if (digest) {
        usedSpid = spid;
        break;
      }
    }
    if (!digest) {
      return {};
    }
    if (usedSpid !== preferred) {
      console.info(`[NFBC] standings: period ${preferred} has no standings yet; using ${usedSpid}`);
    }
    const byName = teamName ? resolveTeamIdByName(digest, teamName) : void 0;
    const resolvedTeamId = byName ?? teamId;
    const parsed = resolvedTeamId ? parseOverallPointTable(digest, resolvedTeamId) : void 0;
    const resolvedRow = resolvedTeamId ? digest.rows.find((row) => row.teamId === resolvedTeamId) : void 0;
    const leagueRows = resolvedRow?.league ? digest.rows.filter((row) => row.league === resolvedRow.league && Number.isFinite(row.overallRank)) : [];
    const leagueRank = resolvedRow && Number.isFinite(resolvedRow.overallRank) && leagueRows.length > 0 ? {
      rank: 1 + leagueRows.filter((row) => row.overallRank < resolvedRow.overallRank).length,
      teamCount: leagueRows.length
    } : void 0;
    const resolvedInTable = Object.values(parsed?.percentiles.categories ?? {}).some((category) => category.percentile != null);
    if (!resolvedInTable) {
      console.warn("[NFBC] overall standings unresolved: " + JSON.stringify({
        contestLabel,
        gameTypeId,
        defaultGameTypeId: config.defaultGameTypeId,
        gameTypeOptions: config.gameTypeOptions?.slice(0, 12),
        teamName,
        resolvedByName: byName ?? null,
        fallbackTeamId: teamId ?? null,
        tableRows: digest.rows.length,
        usedSpid
      }));
    }
    return {
      context: parsed?.context,
      percentiles: parsed?.percentiles,
      overall: parsed?.overall,
      leagueRank
    };
  }
  __name(fetchOverallContext, "fetchOverallContext");
  var standingsBundleCached = persistentCacheByKey(
    5 * MINUTES,
    "standings-field-gaps-v2",
    (key) => {
      const [leagueId = "", teamId = "", spid = "", contest = "", team = ""] = key.split("");
      return loadStandingsContextBundle(leagueId, teamId, spid, contest || void 0, team || void 0);
    },
    {
      // Plain data, but undefined is a legitimate result and must round-trip as
      // itself rather than as a missing key.
      encode: /* @__PURE__ */ __name((value) => value ?? null, "encode"),
      decode: /* @__PURE__ */ __name((raw) => raw ?? void 0, "decode")
    }
  );
  async function fetchStandingsContextBundle(leagueId, teamId, scoringPeriodId, contestLabel, teamName) {
    return standingsBundleCached(
      [leagueId, teamId, scoringPeriodId, contestLabel ?? "", teamName ?? ""].join("")
    );
  }
  __name(fetchStandingsContextBundle, "fetchStandingsContextBundle");
  async function loadStandingsContextBundle(leagueId, teamId, scoringPeriodId, contestLabel, teamName) {
    const [league, overallBundle] = await Promise.all([
      // league context needs real ids; overall resolves by name and runs always
      leagueId && teamId ? fetchLeagueContext(leagueId, teamId, scoringPeriodId) : Promise.resolve(void 0),
      fetchOverallContext(teamId, scoringPeriodId, contestLabel, teamName)
    ]);
    const overall = overallBundle.context;
    console.info("[NFBC] standings context:", JSON.stringify({
      leagueId: leagueId || null,
      teamId: teamId || null,
      contestLabel: contestLabel ?? null,
      teamName: teamName ?? null,
      league: league ? "ok" : "empty",
      overall: overall ? "ok" : "empty",
      overallRank: overallBundle.overall ?? null,
      leagueRank: overallBundle.leagueRank ?? null
    }));
    const warnings = [];
    if (leagueId && teamId && !league) {
      const sessionTeam = livescoringSessionTeamId(await fetchLivescoringAll());
      if (!sessionTeam || sessionTeam === teamId) {
        warnings.push("League standings context unavailable \u2014 NFC live feed may have changed.");
      }
    }
    if (!overall) {
      warnings.push("Overall standings context unavailable \u2014 NFC live feed may have changed.");
    }
    if (!league && !overall) {
      return {
        contexts: [],
        summaryLines: [],
        overallPercentiles: overallBundle.percentiles,
        overallRank: overallBundle.overall,
        leagueRank: overallBundle.leagueRank,
        warnings
      };
    }
    const contexts = [league, overall].filter((context) => Boolean(context));
    return {
      contexts,
      league,
      overall,
      overallPercentiles: overallBundle.percentiles,
      overallRank: overallBundle.overall,
      leagueRank: overallBundle.leagueRank,
      summaryLines: buildSummaryLines2({ league, overall }),
      warnings
    };
  }
  __name(loadStandingsContextBundle, "loadStandingsContextBundle");

  // src/content/dom_adapter.ts
  function ownTextOf(element) {
    if (!element) {
      return void 0;
    }
    const own = Array.from(element.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? "").join(" ").trim();
    return own || void 0;
  }
  __name(ownTextOf, "ownTextOf");

  // src/core/team_opt_display.ts
  var TEAM_OPT_DISPLAY_KEY = "nfbc-team-opt-display-v1";
  function readTeamOptDisplay(text2, signature, leagueIds, now = Date.now()) {
    try {
      const value = JSON.parse(text2 ?? "null");
      if (!value || value.signature !== signature || !Number.isFinite(value.capturedAt) || now < value.capturedAt || now - value.capturedAt > 5 * 6e4 || !Array.isArray(value.counts) || !Array.isArray(value.swaps)) return void 0;
      const allowed = new Set(leagueIds);
      if (!value.counts.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && Number.isInteger(entry[1]) && entry[1] >= 0) || !value.swaps.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && typeof entry[1] === "string")) return void 0;
      return {
        ...value,
        counts: value.counts.filter(([id]) => allowed.has(id)),
        swaps: value.swaps.filter(([id]) => allowed.has(id))
      };
    } catch {
      return void 0;
    }
  }
  __name(readTeamOptDisplay, "readTeamOptDisplay");

  // src/content/team_menu_optimizations.ts
  var INDICATOR_CLASS = "nfbc-team-opt-flag";
  function localDateIso3(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  __name(localDateIso3, "localDateIso");
  function countSwaps(changes) {
    return changes.filter((change) => change.to !== "BN").length;
  }
  __name(countSwaps, "countSwaps");
  function describeSwaps(changes, rows) {
    const nameByKey = new Map(rows.map((row) => [row.rowElementKey, row.playerName]));
    const name = /* @__PURE__ */ __name((key) => nameByKey.get(key) ?? "a player", "name");
    const starts = changes.filter((c) => c.to !== "BN").map((c) => `${name(c.playerKey)} \u2192 ${c.to}`);
    const sits = changes.filter((c) => c.to === "BN").map((c) => name(c.playerKey));
    const parts = [];
    if (starts.length > 0) parts.push(`Start ${starts.join(", ")}`);
    if (sits.length > 0) parts.push(`Sit ${sits.join(", ")}`);
    return parts.join("  \xB7  ");
  }
  __name(describeSwaps, "describeSwaps");
  function readTeamMenuInfo() {
    const info = {};
    for (const button of Array.from(document.querySelectorAll("tr button"))) {
      const spans = Array.from(button.querySelectorAll(":scope > span"));
      if (spans.length === 0) {
        continue;
      }
      const contestLabel = spans[1]?.textContent?.replace(/\s+/g, " ").trim();
      const leagueId = spans.at(-1)?.textContent?.match(/#(\d+)/)?.[1];
      if (!leagueId) {
        continue;
      }
      const teamName = stripInjectedStatusCounts(ownTextOf(spans[0]) ?? spans[0]?.textContent);
      info[leagueId] = { teamName, contestLabel };
    }
    return info;
  }
  __name(readTeamMenuInfo, "readTeamMenuInfo");
  var scanCache;
  var scanGeneration = 0;
  function persistDisplay() {
    if (!scanCache) return;
    try {
      window.sessionStorage.setItem(TEAM_OPT_DISPLAY_KEY, JSON.stringify({
        signature: scanCache.signature,
        capturedAt: scanCache.capturedAt,
        counts: [...scanCache.counts],
        swaps: [...scanCache.swaps]
      }));
    } catch {
    }
  }
  __name(persistDisplay, "persistDisplay");
  function restoreTeamOptDisplay(signature, leagueIds) {
    if (scanCache?.signature === signature) return new Map(scanCache.counts);
    try {
      const saved = readTeamOptDisplay(window.sessionStorage.getItem(TEAM_OPT_DISPLAY_KEY), signature, leagueIds);
      if (saved) {
        scanCache = {
          signature,
          inputs: "",
          capturedAt: saved.capturedAt,
          counts: new Map(saved.counts),
          swaps: new Map(saved.swaps)
        };
        return new Map(scanCache.counts);
      }
    } catch {
    }
    return /* @__PURE__ */ new Map();
  }
  __name(restoreTeamOptDisplay, "restoreTeamOptDisplay");
  var lastOptPlans = /* @__PURE__ */ new Map();
  function lastOptimizedPlans() {
    return Array.from(lastOptPlans.values());
  }
  __name(lastOptimizedPlans, "lastOptimizedPlans");
  function markUnavailable2(rows, activeRosters, activeNames, ilFlags, rosterStatus) {
    rows.forEach((row) => {
      if (shouldMarkMinorLeaguer(row, activeRosters, activeNames)) {
        row.injuryStatus = "MINORS";
      }
      const key = `${row.normalizedName}|${row.normalizedTeam ?? ""}`;
      if (ilFlags.has(key) && !isUnavailableForLineup(row)) {
        row.injuryStatus = row.injuryStatus ? `${row.injuryStatus} IL` : "IL";
      }
      if (shouldMarkRosteredIl(row, row.normalizedTeam ? rosterStatus.get(row.normalizedTeam) : void 0)) {
        row.injuryStatus = row.injuryStatus ? `${row.injuryStatus} IL` : "IL";
      }
    });
  }
  __name(markUnavailable2, "markUnavailable");
  async function fetchAllTeamsHtml(spid) {
    const body = new FormData();
    body.append("type", "view");
    body.append("sel_team_id", "0");
    body.append("sel_spid", String(spid));
    const response = await fetch("https://nfc.shgn.com/set_lineup.data.php", {
      method: "POST",
      credentials: "include",
      body
    });
    if (!response.ok) {
      throw new Error(`set_lineup.data.php ${response.status}`);
    }
    return await response.text();
  }
  __name(fetchAllTeamsHtml, "fetchAllTeamsHtml");
  async function scanTeamOptimizations(options, force = false, _resolveAllContextsForSave = false) {
    const signature = String(options.spid);
    const inputs = JSON.stringify([options.pagePeriod, options.store, options.leagueMap, options.menuInfo, options.seasonProgress]);
    if (!force && scanCache && scanCache.signature === signature && scanCache.inputs === inputs && Date.now() - scanCache.capturedAt < 3e4) {
      return scanCache.counts;
    }
    const generation = ++scanGeneration;
    const html = await fetchAllTeamsHtml(options.spid);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const blocks = Array.from(doc.querySelectorAll("[id^='tl_']"));
    const plans = [];
    for (const block of blocks) {
      const rows = parseSetLineupAllRoster(block);
      const leagueId = rows[0]?.leagueId;
      if (rows.length === 0 || !leagueId) {
        continue;
      }
      const leagueLabel = block.querySelector(".league_name > div")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (shouldSkipLeague(leagueLabel)) {
        continue;
      }
      const leagueType = options.leagueMap[leagueId]?.leagueType ?? inferLeagueType(leagueLabel, options.defaultLeagueType).leagueType;
      plans.push({ leagueId, leagueType, leagueLabel, rows });
    }
    const allRows = plans.flatMap((plan) => plan.rows);
    const teams = Array.from(new Set(allRows.map((row) => row.normalizedTeam).filter((team) => Boolean(team))));
    const [activeRosters, ilFlags, rosterStatus, lineupBubbles, hitterRisk, playingTime] = await Promise.all([
      fetchActiveRosterNames(teams).catch(() => /* @__PURE__ */ new Map()),
      fetchFreshIlFlags(allRows).catch(() => /* @__PURE__ */ new Map()),
      // 40-man IL: not time-windowed, unlike the transactions feed above. This
      // path can SAVE lineups unattended, so it needs the backstop most.
      fetchRosterStatusByTeam(teams).catch(() => /* @__PURE__ */ new Map()),
      fetchLineupBubbles(allRows).catch(() => /* @__PURE__ */ new Map()),
      fetchHitterRiskReport(allRows).catch(() => ({ badgesByKey: /* @__PURE__ */ new Map(), partTimeCount: 0, platoonCount: 0, summaryLines: [] })),
      fetchPlayingTimeTrends(allRows).catch(() => /* @__PURE__ */ new Map())
    ]);
    const todayIso = localDateIso3(/* @__PURE__ */ new Date());
    const newsImpacts = await fetchPlayerNewsImpacts().catch(() => /* @__PURE__ */ new Map());
    const activeNames = activeNameUnion(activeRosters);
    const projectionsByPeriod = /* @__PURE__ */ new Map();
    const projectionsFor = /* @__PURE__ */ __name((period) => {
      let projections = projectionsByPeriod.get(period);
      if (!projections) {
        projections = projectionsForLineupPeriod(options.store, period);
        projectionsByPeriod.set(period, projections);
      }
      return projections;
    }, "projectionsFor");
    const counts = /* @__PURE__ */ new Map();
    const swaps = /* @__PURE__ */ new Map();
    const identityUpdates = Object.fromEntries(plans.flatMap((plan) => {
      const teamId = plan.rows[0]?.teamId;
      if (!teamId) return [];
      const current = options.leagueMap[plan.leagueId];
      return [[plan.leagueId, { ...current, leagueType: plan.leagueType, teamId }]];
    }));
    Object.assign(options.leagueMap, identityUpdates);
    await mergeLeagueMap(identityUpdates).catch((error) => console.warn("[NFBC] league/team identity cache not updated", error));
    const toSavePlan = /* @__PURE__ */ __name((plan, result) => {
      const assignments = result.assignments.map((a) => ({
        playerKey: a.playerKey,
        slotId: a.slotId.startsWith("OF-") ? "OF" : a.slotId
      }));
      const rows = orderSavedRosterByProjection(plan.rows, assignments, result.scoredPlayers);
      return {
        teamId: plan.rows[0]?.teamId ?? "",
        leagueLabel: plan.leagueLabel,
        rows,
        assignments,
        forceSave: rows !== plan.rows
      };
    }, "toSavePlan");
    lastOptPlans = /* @__PURE__ */ new Map();
    const flagged = [];
    for (const plan of plans) {
      markUnavailable2(plan.rows, activeRosters, activeNames, ilFlags, rosterStatus);
      applyReturnNewsAvailability(plan.rows, newsImpacts);
      const slots = parseSetLineupAllSlots(plan.rows);
      const basePeriodProjections = projectionsFor(options.pagePeriod);
      const projections = downweightConfirmedOut(
        applyNewsImpacts(basePeriodProjections, newsImpacts, Date.now(), options.store.ROS),
        plan.rows,
        lineupBubbles,
        todayIso,
        hitterRisk.badgesByKey,
        playingTime
      );
      const result = optimizeLineup(plan.rows, slots, projections, LEAGUE_PROFILES[plan.leagueType], void 0, options.seasonProgress);
      counts.set(plan.leagueId, countSwaps(result.changes));
      swaps.set(plan.leagueId, describeSwaps(result.changes, plan.rows));
      lastOptPlans.set(plan.leagueId, toSavePlan(plan, result));
      flagged.push({ plan, slots, projections });
    }
    const SWEEP_CONCURRENCY = 2;
    const rescore = /* @__PURE__ */ __name(async ({ plan, slots, projections }) => {
      try {
        const teamId = plan.rows[0]?.teamId ?? "";
        const info = options.menuInfo?.[plan.leagueId];
        const bundle = await fetchStandingsContextBundle(
          plan.leagueId,
          teamId,
          String(options.scoringPeriod),
          info?.contestLabel,
          info?.teamName
        );
        if (!bundle) {
          swaps.set(plan.leagueId, `Raw SGP \xB7 standings context unavailable. ${swaps.get(plan.leagueId) ?? ""}`);
          return;
        }
        const contextSelection = selectOptimizationContext(bundle, options.seasonProgress);
        const result = optimizeLineup(
          plan.rows,
          slots,
          projections,
          LEAGUE_PROFILES[plan.leagueType],
          contextSelection.contexts,
          options.seasonProgress
        );
        counts.set(plan.leagueId, countSwaps(result.changes));
        swaps.set(plan.leagueId, `${contextSelection.label}. ${describeSwaps(result.changes, plan.rows)}`);
        lastOptPlans.set(plan.leagueId, toSavePlan(plan, result));
      } catch (error) {
        swaps.set(plan.leagueId, `Raw SGP \xB7 standings context unavailable. ${swaps.get(plan.leagueId) ?? ""}`);
        console.warn("[NFBC] context re-check failed for league", plan.leagueId, error);
      }
    }, "rescore");
    const queue = [...flagged];
    await Promise.all(
      Array.from({ length: Math.min(SWEEP_CONCURRENCY, queue.length) }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          await rescore(next);
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      })
    );
    if (generation === scanGeneration) {
      scanCache = { signature, inputs, capturedAt: Date.now(), counts, swaps };
      persistDisplay();
    }
    return counts;
  }
  __name(scanTeamOptimizations, "scanTeamOptimizations");
  function currentTeamOptSwaps() {
    return scanCache?.swaps ?? /* @__PURE__ */ new Map();
  }
  __name(currentTeamOptSwaps, "currentTeamOptSwaps");
  function setTeamOptCount(leagueId, count, signature, swapText = "") {
    if (scanCache?.signature === signature) {
      scanCache.counts.set(leagueId, count);
      scanCache.swaps.set(leagueId, swapText);
      persistDisplay();
    }
  }
  __name(setTeamOptCount, "setTeamOptCount");
  function reconcileTeamOptScan(counts, expectedPage, currentPage, spid, live) {
    if (currentPage !== expectedPage) return false;
    if (live) {
      counts.set(live.leagueId, live.count);
      setTeamOptCount(live.leagueId, live.count, String(spid), live.swapText);
    }
    return true;
  }
  __name(reconcileTeamOptScan, "reconcileTeamOptScan");
  function renderTeamMenuOptIndicators(counts, swaps) {
    const buttons = Array.from(document.querySelectorAll("tr button"));
    for (const button of buttons) {
      const spans = Array.from(button.querySelectorAll(":scope > span"));
      if (spans.length === 0) {
        continue;
      }
      const nameSpan = spans[0];
      const contestText = spans.at(-1)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const leagueId = contestText.match(/#(\d+)/)?.[1];
      if (!leagueId) {
        continue;
      }
      const count = counts.get(leagueId) ?? 0;
      let flag = button.querySelector(`.${INDICATOR_CLASS}`);
      if (count <= 0) {
        flag?.remove();
        continue;
      }
      if (!flag) {
        flag = document.createElement("i");
        flag.className = INDICATOR_CLASS;
        flag.dataset.nfbcExt = "team-opt";
        flag.setAttribute("aria-hidden", "true");
        nameSpan.insertBefore(flag, nameSpan.firstChild);
      }
      flag.dataset.count = String(count);
      const countLabel = `${count} lineup swap${count === 1 ? "" : "s"} available`;
      const detail = swaps?.get(leagueId)?.trim();
      flag.dataset.nfbcTooltip = detail ? `${countLabel} \u2014 ${detail}` : countLabel;
      flag.removeAttribute("title");
    }
  }
  __name(renderTeamMenuOptIndicators, "renderTeamMenuOptIndicators");
  async function optimizeAndSaveAllTeams(options, onProgress) {
    await scanTeamOptimizations(options, true, true);
    return saveSetLineupAll(lastOptimizedPlans(), onProgress, String(options.spid));
  }
  __name(optimizeAndSaveAllTeams, "optimizeAndSaveAllTeams");
  var ACTION_BAR_ID = "nfbc-team-menu-actions";
  function ensureActionBarStyles() {
    if (document.getElementById("nfbc-team-menu-action-styles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "nfbc-team-menu-action-styles";
    style.textContent = `
    #${ACTION_BAR_ID} { display: flex; gap: 6px; padding: 8px 10px; }
    #${ACTION_BAR_ID} .nfbc-team-menu-action {
      flex: 1; padding: 6px 8px; font-size: 12px; font-weight: 600; cursor: pointer;
      border-radius: 6px; border: 1px solid #1f3a5f; background: #1f3a5f; color: #fff;
      white-space: nowrap; line-height: 1.2;
    }
    #${ACTION_BAR_ID} .nfbc-team-menu-action[data-label^="\u26A1"] { background: #c9a227; border-color: #c9a227; color: #1f2937; }
    #${ACTION_BAR_ID} .nfbc-team-menu-action:hover:not(:disabled) { filter: brightness(1.08); }
    #${ACTION_BAR_ID} .nfbc-team-menu-action:disabled { opacity: .6; cursor: default; }
  `;
    document.head.appendChild(style);
  }
  __name(ensureActionBarStyles, "ensureActionBarStyles");
  function renderTeamMenuActionBar(handlers) {
    const table = document.querySelector("tr button")?.closest("table");
    if (!table?.parentElement) {
      return void 0;
    }
    ensureActionBarStyles();
    let bar = document.getElementById(ACTION_BAR_ID);
    if (bar && bar.previousElementSibling !== table && bar.nextElementSibling !== table) {
      bar.remove();
      bar = null;
    }
    const mk = /* @__PURE__ */ __name((label, title, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nfbc-team-menu-action";
      b.textContent = label;
      b.dataset.label = label;
      b.dataset.nfbcTooltip = title;
      b.setAttribute("aria-label", title);
      b.addEventListener("click", () => onClick(b));
      return b;
    }, "mk");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = ACTION_BAR_ID;
      bar.dataset.nfbcExt = "team-menu-actions";
      bar.append(
        mk("\u21BB Refresh All", "Re-scan every team for available lineup swaps", handlers.onRefresh),
        mk("\u26A1 Optimize All", "Apply the optimal lineup to every team that has available swaps", handlers.onOptimizeAll)
      );
      table.parentElement.insertBefore(bar, table);
    }
    const [refresh, optimize] = Array.from(bar.querySelectorAll("button"));
    return { refresh, optimize };
  }
  __name(renderTeamMenuActionBar, "renderTeamMenuActionBar");

  // src/content/view_state.ts
  var STORAGE_KEY = "nfbc:setlineup:view-state:v1";
  var DEFAULT_VIEW_STATE = {
    density: "comfortable",
    showSchedule: false,
    showOnlyChanges: false,
    benchCollapsed: false
  };
  function normalizeBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }
  __name(normalizeBoolean, "normalizeBoolean");
  function normalizeDensity(value) {
    return value === "compact" ? "compact" : "comfortable";
  }
  __name(normalizeDensity, "normalizeDensity");
  function defaultSetLineupViewState() {
    return { ...DEFAULT_VIEW_STATE };
  }
  __name(defaultSetLineupViewState, "defaultSetLineupViewState");
  function loadSetLineupViewState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return defaultSetLineupViewState();
      }
      const parsed = JSON.parse(raw);
      return {
        density: normalizeDensity(parsed.density),
        showSchedule: normalizeBoolean(parsed.showSchedule, DEFAULT_VIEW_STATE.showSchedule),
        // Focus mode is intentionally session-local: every fresh Set Lineup view
        // opens with the full roster in context, even if the user filtered the
        // previous visit to recommended rows only.
        showOnlyChanges: DEFAULT_VIEW_STATE.showOnlyChanges,
        benchCollapsed: DEFAULT_VIEW_STATE.benchCollapsed
      };
    } catch {
      return defaultSetLineupViewState();
    }
  }
  __name(loadSetLineupViewState, "loadSetLineupViewState");
  function saveSetLineupViewState(state) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
    }
  }
  __name(saveSetLineupViewState, "saveSetLineupViewState");

  // src/content/player_rater.ts
  function currentSeason() {
    return (/* @__PURE__ */ new Date()).getFullYear();
  }
  __name(currentSeason, "currentSeason");
  function playerRaterUrl(timeframe) {
    return `https://www.fangraphs.com/api/fantasy/player-rater/data?pos=all&stats=bat&season=${currentSeason()}&timeframetype=${timeframe}&leaguetype=3`;
  }
  __name(playerRaterUrl, "playerRaterUrl");
  var BADGE_KEY = "l30";
  function pitcherRole(position2) {
    if (!position2) {
      return void 0;
    }
    const first = position2.toUpperCase().split("/").map((t) => t.trim()).find(Boolean);
    if (first === "SP" || first === "RP") {
      return first;
    }
    const upper = position2.toUpperCase();
    if (upper.includes("SP")) return "SP";
    if (upper.includes("RP")) return "RP";
    return void 0;
  }
  __name(pitcherRole, "pitcherRole");
  async function fetchJson4(url) {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.fetchJson, url });
    if (!response?.ok) {
      throw new Error(typeof response?.error === "string" ? response.error : `Fetch failed for ${url}`);
    }
    return response.payload;
  }
  __name(fetchJson4, "fetchJson");
  function num(value) {
    if (value == null || value === "") {
      return void 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : void 0;
  }
  __name(num, "num");
  function fmt(value) {
    return value == null ? "-" : value.toFixed(1);
  }
  __name(fmt, "fmt");
  function formatDollars(value) {
    return value < 0 ? `-$${Math.abs(value).toFixed(1)}` : `$${value.toFixed(1)}`;
  }
  __name(formatDollars, "formatDollars");
  function buildEntry(record) {
    const stats = record.auction;
    if (!stats || !record.playerName) {
      return void 0;
    }
    const dollars = num(stats.Dollars);
    if (dollars == null) {
      return void 0;
    }
    const ip = num(stats.IP);
    const isPitcher = (stats.PosType ?? "").toLowerCase() === "pit" || ip != null || num(stats.mW) != null;
    const breakdown = isPitcher ? `L30 \u2014 W ${fmt(num(stats.mW))} | SV ${fmt(num(stats.mSV))} | K ${fmt(num(stats.mSO))} | ERA ${fmt(num(stats.mERA))} | WHIP ${fmt(num(stats.mWHIP))} | IP ${fmt(ip)}` : `L30 \u2014 R ${fmt(num(stats.mR))} | HR ${fmt(num(stats.mHR))} | RBI ${fmt(num(stats.mRBI))} | SB ${fmt(num(stats.mSB))} | AVG ${fmt(num(stats.mAVG))} | PA ${fmt(num(stats.PA))}`;
    const entry = {
      dollars,
      isPitcher,
      team: normalizeTeam(stats.AbbName ?? stats.ShortName),
      breakdown
    };
    if (isPitcher) {
      entry.ip = ip;
      entry.saves = num(stats.mSV);
      const role = pitcherRole(stats.Position);
      if (role) {
        entry.role = role;
      }
    }
    return entry;
  }
  __name(buildEntry, "buildEntry");
  var RATER_MIRROR_URL = `${PUBLIC_ENGINE_BASE_URL}l30.json`;
  var raterWindowDays = 30;
  var raterWindowEnd;
  async function loadMirror(timeframe) {
    const payload = await fetchJson4(`${RATER_MIRROR_URL}?v=${Date.now()}`);
    if (timeframe === "last30") {
      if (typeof payload.window_days === "number") raterWindowDays = payload.window_days;
      if (typeof payload.window_end === "string") raterWindowEnd = payload.window_end;
    }
    return payload[timeframe] ?? [];
  }
  __name(loadMirror, "loadMirror");
  async function loadRater(url, timeframe) {
    let records;
    try {
      records = await loadMirror(timeframe);
    } catch (error) {
      console.info("[NFBC] rater mirror unavailable; falling back to the live leaderboard", error);
      records = (await fetchJson4(url)).data ?? [];
      if (timeframe === "last30") {
        raterWindowDays = 30;
        raterWindowEnd = void 0;
      }
    }
    const payload = { data: records };
    const map = /* @__PURE__ */ new Map();
    for (const record of payload.data ?? []) {
      const entry = buildEntry(record);
      if (!entry || !record.playerName) {
        continue;
      }
      const key = normalizeName(record.playerName);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }
  __name(loadRater, "loadRater");
  var getRater = ttlCache(3 * HOURS, () => loadRater(playerRaterUrl("last30"), "last30"));
  var getRaterSeason = ttlCache(6 * HOURS, () => loadRater(playerRaterUrl("season"), "season"));
  function last30Range() {
    const end = /* @__PURE__ */ new Date();
    const start = new Date(end.getTime() - 30 * 864e5);
    const iso = /* @__PURE__ */ __name((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, "iso");
    return { start: iso(start), end: iso(end) };
  }
  __name(last30Range, "last30Range");
  function statcastUrl() {
    const { start, end } = last30Range();
    const season = currentSeason();
    return `https://www.fangraphs.com/api/leaders/major-league/data?pos=all&stats=bat&lg=all&qual=0&type=8&season=${season}&season1=${season}&startdate=${start}&enddate=${end}&month=1000&ind=0&pageitems=2000&pagenum=1`;
  }
  __name(statcastUrl, "statcastUrl");
  var SKILLS_MIRROR_URL = `${PUBLIC_ENGINE_BASE_URL}skills.json`;
  var hitterWindowDays = 30;
  var pitchWindowDays = 30;
  var pitchTrendWindowDays = 30;
  var hitterWindowEnd;
  var pitchWindowEnd;
  async function skillsMirror(key) {
    const payload = await fetchJson4(`${SKILLS_MIRROR_URL}?v=${Date.now()}`);
    if (typeof payload.window_days === "number") {
      hitterWindowDays = payload.window_days;
    }
    if (typeof payload.window_end === "string") {
      hitterWindowEnd = payload.window_end;
    }
    if (typeof payload.pitch_window_days === "number") {
      pitchWindowDays = payload.pitch_window_days;
    }
    if (typeof payload.pitch_window_end === "string") {
      pitchWindowEnd = payload.pitch_window_end;
    }
    if (typeof payload.pitch_trend_window_days === "number") {
      pitchTrendWindowDays = payload.pitch_trend_window_days;
    }
    return payload[key] ?? {};
  }
  __name(skillsMirror, "skillsMirror");
  async function loadStatcast() {
    let payload;
    try {
      payload = await skillsMirror("statcastBat");
    } catch (error) {
      console.info("[NFBC] skills mirror unavailable; falling back to the live leaderboard", error);
      payload = await fetchJson4(statcastUrl());
      hitterWindowDays = 30;
      hitterWindowEnd = void 0;
    }
    const map = /* @__PURE__ */ new Map();
    for (const record of payload.data ?? []) {
      if (!record.PlayerName) {
        continue;
      }
      const rawXwoba = num(record.xwOBA);
      const rawBarrel = num(record["Barrel%"]);
      const xwoba = rawXwoba != null && rawXwoba >= 0 && rawXwoba <= 1 ? rawXwoba : void 0;
      const barrel = rawBarrel != null && rawBarrel >= 0 && rawBarrel <= 1 ? rawBarrel : void 0;
      if (xwoba == null && barrel == null) {
        continue;
      }
      const key = normalizeName(record.PlayerName);
      const list = map.get(key) ?? [];
      list.push({ team: normalizeTeam(record.TeamName ?? void 0), xwoba, barrel });
      map.set(key, list);
    }
    return map;
  }
  __name(loadStatcast, "loadStatcast");
  var getStatcast = ttlCache(3 * HOURS, loadStatcast);
  function pickByTeam(candidates, team) {
    if (!candidates || candidates.length === 0) {
      return void 0;
    }
    const match = candidates.find((entry) => entry.team === team);
    if (match) {
      return match;
    }
    if (team == null || candidates.length === 1) {
      return candidates[0];
    }
    return candidates.find((entry) => entry.team == null);
  }
  __name(pickByTeam, "pickByTeam");
  function formatXwoba(value) {
    return value.toFixed(3).replace(/^0\./, ".");
  }
  __name(formatXwoba, "formatXwoba");
  function formatPct(fraction) {
    return `${Math.round(fraction * 100)}%`;
  }
  __name(formatPct, "formatPct");
  function formatSiera(value) {
    return value.toFixed(2);
  }
  __name(formatSiera, "formatSiera");
  function windowLabel(days, end) {
    if (!end) return `${days}d`;
    const parsed = /* @__PURE__ */ new Date(`${end}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return `${days}d`;
    return `${days}d through ${parsed.toLocaleDateString(void 0, { month: "short", day: "numeric" })}`;
  }
  __name(windowLabel, "windowLabel");
  function cardAnchor(card) {
    return card.querySelector(".PlayerName")?.closest("a") ?? card.querySelector("a[href*='/player/baseball/']");
  }
  __name(cardAnchor, "cardAnchor");
  function cardPlayerName(card, anchor) {
    const slug = anchor.getAttribute("href")?.split("/").at(-1);
    if (slug) {
      const decoded = decodeURIComponent(slug).replace(/\+/g, " ").trim();
      if (decoded) {
        return decoded;
      }
    }
    const first = card.querySelector(".PlayerName_FirstName")?.textContent?.trim() ?? "";
    const last = card.querySelector(".PlayerName_LirstName, .PlayerName_LastName")?.textContent?.trim() ?? "";
    return `${first} ${last}`.replace(/\s+/g, " ").trim();
  }
  __name(cardPlayerName, "cardPlayerName");
  function cardTeam(anchor) {
    const card = anchor.closest(".Player[data-can-set-lineup='1']");
    const tagged = card?.querySelector("[data-nfbc-ext='team']");
    const readText = /* @__PURE__ */ __name((node2) => {
      const text2 = node2?.textContent?.replace(/ /g, " ").replace(/\s+/g, " ").trim();
      return text2 && /^[A-Z]{2,3}$/.test(text2) ? text2 : void 0;
    }, "readText");
    const taggedTeam = readText(tagged ?? null);
    if (taggedTeam) {
      return taggedTeam;
    }
    let node = anchor.parentElement?.nextElementSibling;
    while (node && (node.dataset.nfbcExt != null || node.classList.contains("nfbc-sl-badge"))) {
      node = node.nextElementSibling;
    }
    return readText(node);
  }
  __name(cardTeam, "cardTeam");
  function cardIsPitcher(card) {
    const slot = (card.querySelector(".pos")?.textContent ?? "").trim().toUpperCase();
    if (slot === "P") {
      return true;
    }
    if (slot && slot !== "BN") {
      return false;
    }
    const eligible = (card.querySelector(".position")?.textContent ?? "").toUpperCase();
    const hitter = /1B|2B|3B|SS|OF|\bC\b|DH|UT|MI|CI/;
    return /\bP\b|SP|RP/.test(eligible) && !hitter.test(eligible);
  }
  __name(cardIsPitcher, "cardIsPitcher");
  function selectEntry(candidates, isPitcher, team) {
    if (candidates.length === 0) {
      return void 0;
    }
    const sameSide = candidates.filter((entry) => entry.isPitcher === isPitcher);
    const pool = sameSide.length > 0 ? sameSide : candidates;
    const match = pool.find((entry) => entry.team === team);
    if (match) {
      return match;
    }
    if (team == null || pool.length === 1) {
      return pool[0];
    }
    return pool.find((entry) => entry.team == null);
  }
  __name(selectEntry, "selectEntry");
  function isLightTheme() {
    return document.body.dataset.nfbcExtReadability === "native";
  }
  __name(isLightTheme, "isLightTheme");
  function styleBadge(badge2) {
    badge2.style.display = "inline-flex";
    badge2.style.alignItems = "center";
    badge2.style.borderRadius = "6px";
    badge2.style.overflow = "hidden";
    badge2.style.fontSize = "11px";
    badge2.style.fontWeight = "800";
    badge2.style.lineHeight = "1.3";
    badge2.style.whiteSpace = "nowrap";
    badge2.style.verticalAlign = "middle";
    badge2.style.fontVariantNumeric = "tabular-nums";
    badge2.style.border = isLightTheme() ? "1px solid #c9d1dd" : "1px solid rgba(2, 6, 23, 0.55)";
  }
  __name(styleBadge, "styleBadge");
  function statHue(value, low, mid, high) {
    const clamp01 = /* @__PURE__ */ __name((t) => t < 0 ? 0 : t > 1 ? 1 : t, "clamp01");
    const hue = value <= mid ? clamp01((value - low) / (mid - low)) * 55 : 55 + clamp01((value - mid) / (high - mid)) * 75;
    return Math.round(hue);
  }
  __name(statHue, "statHue");
  var raterHue = /* @__PURE__ */ __name((dollars) => statHue(dollars, -3, 2, 12), "raterHue");
  var xwobaHue = /* @__PURE__ */ __name((xwoba) => statHue(xwoba, 0.28, 0.32, 0.38), "xwobaHue");
  var barrelHue = /* @__PURE__ */ __name((barrelFraction) => statHue(barrelFraction * 100, 3, 8, 15), "barrelHue");
  var sieraHue = /* @__PURE__ */ __name((siera) => statHue(-siera, -5.5, -4, -2.5), "sieraHue");
  var swstrHue = /* @__PURE__ */ __name((swstrFraction) => statHue(swstrFraction * 100, 7, 11, 15), "swstrHue");
  var kbbHue = /* @__PURE__ */ __name((kbbFraction) => statHue(kbbFraction * 100, 8, 15, 22), "kbbHue");
  function parseTrendLine(line) {
    if (!line) return void 0;
    const bf = num(line.BF);
    const siera = num(line.SIERA);
    const swstr = num(line["SwStr%"]);
    const kbb = num(line["K-BB%"]);
    const role = line.Role === "SP" || line.Role === "RP" ? line.Role : void 0;
    const rawPercentile = num(line.SkillPercentile);
    const percentile = rawPercentile != null && rawPercentile >= 0 && rawPercentile <= 100 ? rawPercentile : void 0;
    return bf == null ? void 0 : { bf, siera, swstr, kbb, role, percentile };
  }
  __name(parseTrendLine, "parseTrendLine");
  function parsePitchTrend(raw) {
    if (!raw) return void 0;
    const recent = parseTrendLine(raw.recent);
    const prior = parseTrendLine(raw.prior);
    if (!recent) return void 0;
    const games = num(raw.last3?.G);
    const k = num(raw.last3?.K);
    const bb = num(raw.last3?.BB);
    const last3 = games != null && k != null && bb != null ? { games, k, bb } : void 0;
    return { recent, prior, last3 };
  }
  __name(parsePitchTrend, "parsePitchTrend");
  function pitchUrl() {
    const { start, end } = last30Range();
    const season = currentSeason();
    return `https://www.fangraphs.com/api/leaders/major-league/data?pos=all&stats=pit&lg=all&qual=0&type=8&season=${season}&season1=${season}&startdate=${start}&enddate=${end}&month=1000&ind=0&pageitems=2000&pagenum=1`;
  }
  __name(pitchUrl, "pitchUrl");
  function pitchUrlSeason() {
    const season = currentSeason();
    return `https://www.fangraphs.com/api/leaders/major-league/data?pos=all&stats=pit&lg=all&qual=0&type=8&season=${season}&season1=${season}&month=0&ind=0&pageitems=3000&pagenum=1`;
  }
  __name(pitchUrlSeason, "pitchUrlSeason");
  async function loadPitch(url, mirrorKey) {
    let payload;
    try {
      payload = await skillsMirror(mirrorKey);
    } catch (error) {
      console.info("[NFBC] skills mirror unavailable; falling back to the live leaderboard", error);
      payload = await fetchJson4(url);
      pitchWindowDays = 30;
      pitchWindowEnd = void 0;
    }
    const map = /* @__PURE__ */ new Map();
    for (const record of payload.data ?? []) {
      if (!record.PlayerName) {
        continue;
      }
      const rawSiera = num(record.SIERA);
      const rawSwstr = num(record["SwStr%"]);
      const rawKbb = num(record["K-BB%"]);
      const siera = rawSiera != null && rawSiera >= 0 && rawSiera <= 12 ? rawSiera : void 0;
      const swstr = rawSwstr != null && rawSwstr >= 0 && rawSwstr <= 1 ? rawSwstr : void 0;
      const kbb = rawKbb != null && rawKbb >= -1 && rawKbb <= 1 ? rawKbb : void 0;
      if (siera == null && swstr == null && kbb == null) {
        continue;
      }
      const throwsRaw = (record.Throws ?? "").toUpperCase();
      const throws = throwsRaw === "L" || throwsRaw === "R" ? throwsRaw : void 0;
      const key = normalizeName(record.PlayerName);
      const list = map.get(key) ?? [];
      list.push({
        team: normalizeTeam(record.TeamName ?? void 0),
        siera,
        swstr,
        kbb,
        throws,
        trend: parsePitchTrend(record.Trend30)
      });
      map.set(key, list);
    }
    return map;
  }
  __name(loadPitch, "loadPitch");
  var getPitchStats = ttlCache(3 * HOURS, () => loadPitch(pitchUrl(), "pitchL30"));
  var pitchStatsCodec = {
    encode: /* @__PURE__ */ __name((value) => Array.from(value), "encode"),
    decode: /* @__PURE__ */ __name((raw) => new Map(Array.isArray(raw) ? raw : []), "decode")
  };
  var getPitchStatsSeasonInternal = persistentCache(
    6 * HOURS,
    "pitchseason",
    () => loadPitch(pitchUrlSeason(), "pitchSeason"),
    pitchStatsCodec
  );
  function getPitcherStatsSeason() {
    return getPitchStatsSeasonInternal();
  }
  __name(getPitcherStatsSeason, "getPitcherStatsSeason");
  function classifyPitchTrend(trend) {
    const recent = trend?.recent;
    const prior = trend?.prior;
    if (!recent || !prior || (recent.bf ?? 0) < 40 || (prior.bf ?? 0) < 40) return void 0;
    const components = [];
    if (recent.kbb != null && prior.kbb != null) components.push((recent.kbb - prior.kbb) / 0.06);
    if (recent.swstr != null && prior.swstr != null) components.push((recent.swstr - prior.swstr) / 0.02);
    if (recent.siera != null && prior.siera != null) components.push((prior.siera - recent.siera) / 0.75);
    if (components.length < 2) return void 0;
    const score = components.reduce((sum, value) => sum + value, 0) / components.length;
    if (score <= -1.5) return "down2";
    if (score <= -0.5) return "down";
    if (score >= 0.5) return "up";
    return "flat";
  }
  __name(classifyPitchTrend, "classifyPitchTrend");
  function pitchTrendLabel(trend) {
    const percentile = trend?.recent?.percentile;
    if (percentile == null) return void 0;
    const direction = classifyPitchTrend(trend);
    const arrow = direction === "down2" ? "\u2193\u2193" : direction === "down" ? "\u2193" : direction === "up" ? "\u2191" : direction === "flat" ? "\u2192" : "";
    return `P${Math.round(percentile)}${arrow ? ` ${arrow}` : ""}`;
  }
  __name(pitchTrendLabel, "pitchTrendLabel");
  function percentileOrdinal(value) {
    const rounded = Math.round(value);
    const mod100 = rounded % 100;
    const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : rounded % 10 === 1 ? "st" : rounded % 10 === 2 ? "nd" : rounded % 10 === 3 ? "rd" : "th";
    return `${rounded}${suffix}`;
  }
  __name(percentileOrdinal, "percentileOrdinal");
  function trendStat(entry) {
    const direction = classifyPitchTrend(entry.trend);
    const recent = entry.trend?.recent;
    const label = pitchTrendLabel(entry.trend);
    if (!label || !recent || recent.percentile == null) return void 0;
    const description = direction === "down2" ? "sharply declining" : direction === "down" ? "declining" : direction === "up" ? "improving" : direction === "flat" ? "stable" : void 0;
    const roleLabel = recent.role === "RP" ? "qualified relievers" : "qualified starters";
    const lines = [`Recent skill: ${percentileOrdinal(recent.percentile)} percentile among ${roleLabel}`];
    if (entry.siera != null && recent.siera != null) {
      lines.push(`SIERA ${formatSiera(recent.siera)} (${pitchTrendWindowDays}d); ${formatSiera(entry.siera)} over ${pitchWindowDays}d`);
    }
    if (entry.kbb != null && recent.kbb != null) {
      lines.push(`K-BB% ${formatPct(recent.kbb)} (${pitchTrendWindowDays}d); ${formatPct(entry.kbb)} over ${pitchWindowDays}d`);
    }
    if (entry.swstr != null && recent.swstr != null) {
      lines.push(`SwStr% ${formatPct(recent.swstr)} (${pitchTrendWindowDays}d); ${formatPct(entry.swstr)} over ${pitchWindowDays}d`);
    }
    if (description) {
      lines.push(`Trend ${description} versus the preceding ${pitchTrendWindowDays}d`);
    }
    const last3 = entry.trend?.last3;
    if (last3?.games === 3 && last3.k != null && last3.bb != null) {
      lines.push(`Last 3 outings: ${last3.k} K, ${last3.bb} BB`);
    }
    return {
      text: label,
      tag: "30D",
      // Unlike the arrow, color is absolute: the same shade means the same
      // quality tier on every roster and in every league.
      hue: statHue(recent.percentile, 10, 50, 90),
      hover: lines.join("\n")
    };
  }
  __name(trendStat, "trendStat");
  function hitterStats(entry) {
    const stats = [];
    if (entry?.xwoba != null) {
      stats.push({ text: formatXwoba(entry.xwoba), hue: xwobaHue(entry.xwoba), hover: `xwOBA ${formatXwoba(entry.xwoba)} (${windowLabel(hitterWindowDays, hitterWindowEnd)})`, tag: "xw" });
    }
    if (entry?.barrel != null) {
      stats.push({ text: formatPct(entry.barrel), hue: barrelHue(entry.barrel), hover: `Barrel ${formatPct(entry.barrel)} (${windowLabel(hitterWindowDays, hitterWindowEnd)})`, tag: "brl" });
    }
    return stats;
  }
  __name(hitterStats, "hitterStats");
  function pitcherStats(entry) {
    const stats = [];
    if (entry?.siera != null) {
      stats.push({ text: formatSiera(entry.siera), hue: sieraHue(entry.siera), hover: `SIERA ${formatSiera(entry.siera)} (${windowLabel(pitchWindowDays, pitchWindowEnd)})`, tag: "SIE" });
    }
    if (entry?.swstr != null) {
      stats.push({ text: formatPct(entry.swstr), hue: swstrHue(entry.swstr), hover: `SwStr% ${formatPct(entry.swstr)} (${windowLabel(pitchWindowDays, pitchWindowEnd)})`, tag: "SwS" });
    }
    if (entry?.kbb != null) {
      stats.push({ text: formatPct(entry.kbb), hue: kbbHue(entry.kbb), hover: `K-BB% ${formatPct(entry.kbb)} (${windowLabel(pitchWindowDays, pitchWindowEnd)})`, tag: "K-BB" });
    }
    if (entry) {
      const trend = trendStat(entry);
      if (trend) stats.push(trend);
    }
    return stats;
  }
  __name(pitcherStats, "pitcherStats");
  function segment(text2, hue, first, tag, neutral = false) {
    const light = isLightTheme();
    const span = document.createElement("span");
    span.dataset.nfbcRaterSegment = tag ?? "value";
    if (tag) {
      const label = document.createElement("span");
      label.textContent = tag;
      label.style.fontSize = "8px";
      label.style.opacity = light ? "0.65" : "0.75";
      label.style.marginRight = "2px";
      label.style.letterSpacing = "0.02em";
      span.append(label);
    }
    span.append(document.createTextNode(text2));
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.justifyContent = "flex-end";
    span.style.minWidth = first ? "52px" : "44px";
    span.style.padding = "1px 4px";
    span.style.background = neutral ? light ? "#e5e7eb" : "#475569" : light ? `hsl(${hue}, 62%, 91%)` : `hsl(${hue}, 58%, 34%)`;
    span.style.color = neutral ? light ? "#475569" : "#ffffff" : light ? `hsl(${hue}, 95%, 23%)` : "#ffffff";
    if (!first) {
      span.style.borderLeft = light ? "1px solid rgba(2, 6, 23, 0.16)" : "1px solid rgba(2, 6, 23, 0.5)";
    }
    return span;
  }
  __name(segment, "segment");
  function renderBadge(anchor, entry, stats, insertAfter) {
    const scope = anchor.closest(".Player[data-can-set-lineup='1']") ?? anchor.closest("td") ?? anchor.parentElement;
    if (!scope) {
      return;
    }
    let badge2 = scope.querySelector(`[data-nfbc-ext='${BADGE_KEY}']`);
    if (!entry) {
      badge2?.remove();
      return;
    }
    if (!badge2) {
      badge2 = document.createElement("span");
      badge2.dataset.nfbcExt = BADGE_KEY;
    }
    const segments = [segment(formatDollars(entry.dollars), raterHue(entry.dollars), true, "L30")];
    const hover = [`Rater ${windowLabel(raterWindowDays, raterWindowEnd)} ${formatDollars(entry.dollars)}`];
    for (const stat of stats) {
      segments.push(segment(stat.text, stat.hue, false, stat.tag, stat.neutral));
      hover.push(stat.hover);
    }
    badge2.replaceChildren(...segments);
    badge2.title = `${hover.join(" | ")}
${entry.breakdown}`;
    styleBadge(badge2);
    const badgesBlock = scope.querySelector("[data-nfbc-ext='secondary-badges']");
    if (badgesBlock) {
      badge2.style.margin = "0";
      if (badge2.parentElement !== badgesBlock || badgesBlock.firstElementChild !== badge2) {
        badgesBlock.prepend(badge2);
      }
      return;
    }
    const nameRow = scope.querySelector("[data-nfbc-ext='name-row']");
    if (nameRow) {
      badge2.style.margin = "0";
      if (badge2.parentElement !== nameRow || nameRow.lastElementChild !== badge2) {
        nameRow.append(badge2);
      }
      return;
    }
    if (insertAfter?.parentElement) {
      const rowDiv = insertAfter.parentElement;
      rowDiv.style.display = "flex";
      rowDiv.style.alignItems = "center";
      badge2.style.margin = "0";
      badge2.style.marginLeft = "auto";
      if (rowDiv.lastElementChild !== badge2) {
        rowDiv.append(badge2);
      }
    } else {
      badge2.style.margin = "0 6px 0 0";
      const host = anchor.parentElement;
      if (host && (badge2.nextElementSibling !== anchor || badge2.parentElement !== host)) {
        host.insertBefore(badge2, anchor);
      }
    }
  }
  __name(renderBadge, "renderBadge");
  async function annotateLineup() {
    let map;
    try {
      map = await getRater();
    } catch (error) {
      console.warn("[NFBC] player-rater fetch failed", error);
      return;
    }
    let statcast = /* @__PURE__ */ new Map();
    try {
      statcast = await getStatcast();
    } catch (error) {
      console.warn("[NFBC] statcast fetch failed", error);
    }
    let pitch = /* @__PURE__ */ new Map();
    try {
      pitch = await getPitchStats();
    } catch (error) {
      console.warn("[NFBC] pitch-stat fetch failed", error);
    }
    document.querySelectorAll(".Player[data-can-set-lineup='1']").forEach((card) => {
      const anchor = cardAnchor(card);
      if (!anchor) {
        return;
      }
      const name = cardPlayerName(card, anchor);
      if (!name) {
        return;
      }
      const normName = normalizeName(name);
      const team = normalizeTeam(cardTeam(anchor));
      const pitcher = cardIsPitcher(card);
      const entry = selectEntry(map.get(normName) ?? [], pitcher, team);
      const stats = pitcher ? pitcherStats(pickByTeam(pitch.get(normName), team)) : hitterStats(pickByTeam(statcast.get(normName), team));
      const gameCount = card.querySelector("[class*='GameCount__CondensedWrapper']")?.closest("button");
      renderBadge(anchor, entry, stats, gameCount);
    });
  }
  __name(annotateLineup, "annotateLineup");
  var MAX_RATER_FAILURES = 3;
  function mountRater(rosterSignature, annotate, reannotateEvent) {
    let lastSignature = "";
    let inFlight = false;
    let timer;
    let consecutiveFailures = 0;
    let giveUp = false;
    const run = /* @__PURE__ */ __name(async () => {
      if (inFlight || giveUp) {
        return;
      }
      const signature = rosterSignature();
      if (!signature) {
        return;
      }
      if (signature === lastSignature && document.querySelector(`[data-nfbc-ext='${BADGE_KEY}']`)) {
        return;
      }
      inFlight = true;
      try {
        await annotate();
        lastSignature = rosterSignature();
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_RATER_FAILURES) {
          giveUp = true;
          console.info("[NFBC] player rater unavailable; badges disabled for this page");
        }
        throw error;
      } finally {
        inFlight = false;
      }
    }, "run");
    const schedule = /* @__PURE__ */ __name(() => {
      if (rosterSignature() === lastSignature && document.querySelector(`[data-nfbc-ext='${BADGE_KEY}']`)) {
        return;
      }
      if (timer != null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => void run(), 200);
    }, "schedule");
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    if (reannotateEvent) {
      document.addEventListener(reannotateEvent, () => {
        lastSignature = "";
        schedule();
      });
    }
    void run();
    [600, 1500, 3e3].forEach((delay) => window.setTimeout(() => void run(), delay));
  }
  __name(mountRater, "mountRater");
  function mountLineupRater() {
    mountRater(
      () => Array.from(document.querySelectorAll(".Player[data-can-set-lineup='1'] a[href*='/player/baseball/']")).map((anchor) => anchor.getAttribute("href")).join("|"),
      annotateLineup,
      "nfbc-ext:rows-annotated"
    );
  }
  __name(mountLineupRater, "mountLineupRater");

  // src/content/matchup.ts
  var LG_WOBA = 0.315;
  var LG_KBB = 0.13;
  var PLATOON_HALF_GAP = 89e-4 / 2;
  var SP_KBB_SLOPE = 0.135;
  var GAME_CLAMP = 0.12;
  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }
  __name(clamp, "clamp");
  function lineupKey3(row) {
    return `${row.normalizedName}|${row.normalizedTeam ?? ""}`;
  }
  __name(lineupKey3, "lineupKey");
  function isHitterRow(row) {
    if (row.currentSlot === "P") {
      return false;
    }
    return row.eligiblePositions.length === 0 || !row.eligiblePositions.every((pos) => pos === "P");
  }
  __name(isHitterRow, "isHitterRow");
  function gameMultiplier(platoonAdvantage, spKbb) {
    let m = 1;
    if (platoonAdvantage != null) {
      m += (platoonAdvantage ? PLATOON_HALF_GAP : -PLATOON_HALF_GAP) / LG_WOBA;
    }
    if (spKbb != null) {
      m += -SP_KBB_SLOPE * (spKbb - LG_KBB) / LG_WOBA;
    }
    return clamp(m, 1 - GAME_CLAMP, 1 + GAME_CLAMP);
  }
  __name(gameMultiplier, "gameMultiplier");
  function enumerateDates(startIso, endIso) {
    const out = [];
    const start = /* @__PURE__ */ new Date(`${startIso}T12:00:00`);
    const end = /* @__PURE__ */ new Date(`${endIso}T12:00:00`);
    for (let d = new Date(start); d <= end && out.length < 10; d.setDate(d.getDate() + 1)) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    return out;
  }
  __name(enumerateDates, "enumerateDates");
  function pickKbb(stats, name, team) {
    const entries = stats.get(normalizeName(name));
    if (!entries || entries.length === 0) {
      return void 0;
    }
    const byTeam = team ? entries.find((entry) => entry.team === team) : void 0;
    if (byTeam) return byTeam.kbb ?? void 0;
    if (!team || entries.length === 1) return entries[0]?.kbb ?? void 0;
    return void 0;
  }
  __name(pickKbb, "pickKbb");
  async function fetchHitterMatchups(rows, periodLabel) {
    const out = /* @__PURE__ */ new Map();
    const range = parseDateRangeFromLabel(periodLabel);
    if (!range) {
      return out;
    }
    const hitters = rows.filter((row) => row.normalizedTeam && isHitterRow(row));
    if (hitters.length === 0) {
      return out;
    }
    const teams = hitters.map((row) => row.normalizedTeam).filter((team) => Boolean(team));
    const dates = enumerateDates(range.start, range.end);
    const [opposing, pitchStats, batSides] = await Promise.all([
      fetchOpposingProbablesByTeamDate(teams).catch(() => /* @__PURE__ */ new Map()),
      getPitcherStatsSeason().catch(() => /* @__PURE__ */ new Map()),
      fetchBatSidesByPlayer(hitters).catch(() => /* @__PURE__ */ new Map())
    ]);
    for (const row of hitters) {
      const team = row.normalizedTeam;
      const bat = batSides.get(lineupKey3(row));
      const byDate = opposing.get(team);
      const games = [];
      for (const date of dates) {
        const probable = byDate?.get(date)?.[0];
        if (!probable) {
          continue;
        }
        const hand = probable.hand;
        const platoonAdvantage = bat === "S" ? true : bat ? bat !== hand : void 0;
        const spKbb = pickKbb(pitchStats, probable.name, team);
        games.push({
          date,
          oppSpName: probable.name,
          oppSpHand: hand,
          platoonAdvantage,
          spKbb,
          multiplier: gameMultiplier(platoonAdvantage, spKbb)
        });
      }
      if (games.length === 0) {
        continue;
      }
      const multiplier = games.reduce((sum, g) => sum + g.multiplier, 0) / games.length;
      const edge = games.filter((g) => g.platoonAdvantage === true).length;
      const pct = Math.round((multiplier - 1) * 1e3) / 10;
      const summary = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% matchup over ${games.length} start${games.length === 1 ? "" : "s"} \xB7 ${edge} platoon edge`;
      out.set(lineupKey3(row), { multiplier, games, summary, batHand: bat });
    }
    return out;
  }
  __name(fetchHitterMatchups, "fetchHitterMatchups");
  var SPLITS_URL = "https://www.fangraphs.com/api/leaders/splits/splits-leaders";
  async function postJson(url, body) {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.postJson, url, body: JSON.stringify(body) });
    if (!response?.ok) {
      throw new Error(typeof response?.error === "string" ? response.error : `POST failed for ${url}`);
    }
    return response.payload;
  }
  __name(postJson, "postJson");
  function last30Iso() {
    const end = /* @__PURE__ */ new Date();
    const start = new Date(end.getTime() - 30 * 24 * 3600 * 1e3);
    const iso = /* @__PURE__ */ __name((d) => d.toISOString().slice(0, 10), "iso");
    return { start: iso(start), end: iso(end) };
  }
  __name(last30Iso, "last30Iso");
  async function pitcherWrcAllowed(splitId) {
    const { start, end } = last30Iso();
    const body = {
      strPlayerId: "all",
      strSplitArr: [splitId],
      strGroup: "season",
      strPosition: "P",
      strType: "2",
      strStartDate: start,
      strEndDate: end,
      strSplitTeams: false,
      dctFilters: [],
      strStatType: "player",
      strAutoPt: "false",
      arrPlayerId: [],
      strSplitArrPitch: [],
      arrWxTemperature: null,
      arrWxPressure: null,
      arrWxAirDensity: null,
      arrWxElevation: null,
      arrWxWindSpeed: null
    };
    const json = await postJson(SPLITS_URL, body);
    const cols = json.k ?? [];
    const nameIdx = cols.findIndex((c) => c === "PlayerName" || c === "Name" || c === "playerName");
    const wrcIdx = cols.indexOf("wRC+");
    const map = /* @__PURE__ */ new Map();
    if (nameIdx < 0 || wrcIdx < 0) {
      return map;
    }
    for (const row of json.v ?? []) {
      const raw = String(row[nameIdx] ?? "").replace(/<[^>]*>/g, "").trim();
      const name = normalizeName(raw);
      const wrc = Number(row[wrcIdx]);
      if (name && Number.isFinite(wrc)) {
        map.set(name, wrc);
      }
    }
    return map;
  }
  __name(pitcherWrcAllowed, "pitcherWrcAllowed");
  var pitcherWrcAllowedCached = ttlCacheByKey(3 * HOURS, (id) => pitcherWrcAllowed(id));
  async function fetchPitcherWrcAllowedVsHand() {
    const [vsL, vsR] = await Promise.all([
      pitcherWrcAllowedCached(1).catch(() => /* @__PURE__ */ new Map()),
      pitcherWrcAllowedCached(2).catch(() => /* @__PURE__ */ new Map())
    ]);
    const out = /* @__PURE__ */ new Map();
    for (const [name, value] of vsL) {
      out.set(name, { ...out.get(name) ?? {}, L: value });
    }
    for (const [name, value] of vsR) {
      out.set(name, { ...out.get(name) ?? {}, R: value });
    }
    return out;
  }
  __name(fetchPitcherWrcAllowedVsHand, "fetchPitcherWrcAllowedVsHand");
  function buildMatchupWrcChips(matchups, splits) {
    const out = /* @__PURE__ */ new Map();
    if (splits.size === 0) {
      return out;
    }
    for (const [key, matchup] of matchups) {
      const values = [];
      const detail = [];
      for (const game of matchup.games) {
        if (!game.oppSpName || !game.oppSpHand) {
          continue;
        }
        const effective = matchup.batHand === "S" ? game.oppSpHand === "L" ? "R" : "L" : matchup.batHand;
        if (effective !== "L" && effective !== "R") {
          continue;
        }
        const wrc = splits.get(normalizeName(game.oppSpName))?.[effective];
        if (wrc == null) {
          continue;
        }
        values.push(wrc);
        detail.push(`${game.date.slice(5)} vs ${game.oppSpHand}HP ${game.oppSpName}: ${Math.round(wrc)} wRC+ allowed to ${effective}HB`);
      }
      if (values.length === 0) {
        continue;
      }
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      out.set(key, {
        text: `SP ${avg}`,
        detail: `Opposing-SP matchup (display only, not in the rating): the starters your hitter faces this period have allowed ${avg} wRC+ to batters of his hand over the last 30 days (100 = league average). Higher = friendlier matchup, lower = tougher. Per game \u2014 ${detail.join(" | ")}. Source: FanGraphs splits leaderboard.`,
        tone: avg >= 110 ? "good" : avg <= 90 ? "tough" : "neutral"
      });
    }
    return out;
  }
  __name(buildMatchupWrcChips, "buildMatchupWrcChips");

  // src/content/tooltip.ts
  var installed = false;
  var tip = null;
  var active = null;
  function ensureTip() {
    if (tip && tip.isConnected) {
      return tip;
    }
    tip = document.createElement("div");
    tip.id = "nfbc-hover-tip";
    Object.assign(tip.style, {
      position: "fixed",
      zIndex: "2147483646",
      maxWidth: "340px",
      padding: "8px 10px",
      borderRadius: "8px",
      background: "#0b1f3a",
      color: "#f8fafc",
      border: "1px solid #c9a227",
      boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
      font: "12px/1.45 Georgia, serif",
      whiteSpace: "normal",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 80ms ease",
      left: "-9999px",
      top: "-9999px"
    });
    document.body.append(tip);
    return tip;
  }
  __name(ensureTip, "ensureTip");
  function position(event) {
    if (!tip) {
      return;
    }
    const rect = tip.getBoundingClientRect();
    const pad = 14;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + rect.width + 4 > window.innerWidth) {
      x = event.clientX - rect.width - pad;
    }
    if (y + rect.height + 4 > window.innerHeight) {
      y = event.clientY - rect.height - pad;
    }
    tip.style.left = `${Math.max(4, x)}px`;
    tip.style.top = `${Math.max(4, y)}px`;
  }
  __name(position, "position");
  function hide() {
    active = null;
    if (tip) {
      tip.style.opacity = "0";
      tip.style.left = "-9999px";
      tip.style.top = "-9999px";
    }
  }
  __name(hide, "hide");
  function installHoverTooltips() {
    if (installed) {
      return;
    }
    installed = true;
    document.addEventListener("mouseover", (event) => {
      const target = event.target?.closest("[data-nfbc-tooltip]");
      if (!target) {
        return;
      }
      const text2 = target.dataset.nfbcTooltip?.trim();
      if (!text2) {
        return;
      }
      active = target;
      const node = ensureTip();
      node.textContent = text2;
      node.style.opacity = "1";
      position(event);
    }, true);
    document.addEventListener("mousemove", (event) => {
      if (active) {
        position(event);
      }
    }, true);
    document.addEventListener("mouseout", (event) => {
      const related = event.relatedTarget;
      if (active && (!related || !active.contains(related))) {
        hide();
      }
    }, true);
    window.addEventListener("scroll", hide, true);
    document.addEventListener("click", hide, true);
  }
  __name(installHoverTooltips, "installHoverTooltips");

  // src/core/health_check.ts
  function formatHealthFindings(findings) {
    return [...findings].sort((left, right) => left.severity === right.severity ? 0 : left.severity === "error" ? -1 : 1).map((finding) => `${finding.severity === "error" ? "\u26D4" : "\u26A0\uFE0F"} ${finding.message} ${finding.effect}`);
  }
  __name(formatHealthFindings, "formatHealthFindings");
  var UNMATCHED_ACTIVE_SHARE = 0.25;
  function checkSetLineupHealth(inputs) {
    const findings = [];
    if (inputs.rowCount === 0 || inputs.slotCount === 0) {
      findings.push({
        id: "lineup-unparsed",
        severity: "error",
        message: "Could not read the lineup from this page.",
        effect: "No recommendations can be produced."
      });
      return findings;
    }
    if (inputs.projectionCount === 0) {
      findings.push({
        id: "projections-empty",
        severity: "error",
        message: "No projections loaded for this scoring period.",
        effect: "Every recommendation is based on nothing; do not act on them."
      });
    } else if (inputs.activeCount > 0 && inputs.unmatchedActiveCount / inputs.activeCount > UNMATCHED_ACTIVE_SHARE) {
      findings.push({
        id: "projections-unmatched",
        severity: "error",
        message: `${inputs.unmatchedActiveCount} of ${inputs.activeCount} started players have no matching projection.`,
        effect: "They are pinned in place and the optimizer is comparing the rest against nothing."
      });
    }
    if (!inputs.standingsContextAvailable) {
      findings.push({
        id: "standings-missing",
        severity: "warning",
        message: "Standings context unavailable.",
        effect: "Swaps are ranked on raw projection only, with no weighting toward the categories you need."
      });
    }
    if (inputs.rosterTeams > 0 && inputs.activeRosterTeams === 0) {
      findings.push({
        id: "active-roster-missing",
        severity: "warning",
        message: "MLB active rosters did not load.",
        effect: "Players optioned to the minors are not flagged and can be recommended to start."
      });
    }
    if (inputs.rosterTeams > 0 && inputs.ilRosterTeams === 0) {
      findings.push({
        id: "il-roster-missing",
        severity: "warning",
        message: "MLB injured lists did not load.",
        effect: "An injured player NFBC has not tagged can be recommended to start."
      });
    }
    return findings;
  }
  __name(checkSetLineupHealth, "checkSetLineupHealth");
  function standingsBannerState(input) {
    if (!input.canFetch || input.pending) return "none";
    if (!input.hasBundle) return input.teamUnresolved ? "unresolved" : "down";
    return input.warningCount > 0 ? "partial" : "none";
  }
  __name(standingsBannerState, "standingsBannerState");

  // src/core/swap_confidence.ts
  function marginalSwapKeys(changes, values, unavailable = /* @__PURE__ */ new Set()) {
    const marginal = /* @__PURE__ */ new Set();
    for (const incoming of changes.filter((c) => c.from === "BN" && c.to !== "BN")) {
      const outgoing = changes.filter((c) => c.to === "BN" && c.from === incoming.to);
      if (outgoing.length !== 1 || unavailable.has(outgoing[0].playerKey)) continue;
      const a = values.get(incoming.playerKey), b = values.get(outgoing[0].playerKey);
      if (a == null || b == null) continue;
      if (a > b && a - b <= 0.02 + 1e-9) {
        marginal.add(incoming.playerKey);
        marginal.add(outgoing[0].playerKey);
      }
    }
    return marginal;
  }
  __name(marginalSwapKeys, "marginalSwapKeys");

  // src/core/setlineup_deep_link.ts
  function parseSetLineupDeepLink(hash) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const leagueId = params.get("nfbc-league")?.trim();
    if (!leagueId || !/^\d+$/.test(leagueId)) return void 0;
    const teamId = params.get("nfbc-team")?.trim();
    return {
      leagueId,
      teamId: teamId && /^\d+$/.test(teamId) ? teamId : void 0
    };
  }
  __name(parseSetLineupDeepLink, "parseSetLineupDeepLink");

  // src/content/setlineup.ts
  var CATEGORY_ORDER2 = ["R", "HR", "RBI", "SB", "AVG", "W", "K", "SV", "ERA", "WHIP"];
  var LINEUP_POLL_MINUTES = 5;
  var lineupPollTimer;
  var lastBubbleLabels = /* @__PURE__ */ new Map();
  function bubbleKey(row) {
    return `${row.normalizedName}|${row.normalizedTeam ?? ""}`;
  }
  __name(bubbleKey, "bubbleKey");
  function startLineupPolling(rows, scoredPlayers) {
    if (lineupPollTimer !== void 0) {
      window.clearInterval(lineupPollTimer);
    }
    const pollOnce = /* @__PURE__ */ __name(async () => {
      if (!window.location.pathname.includes("setlineup")) {
        window.clearInterval(lineupPollTimer);
        lineupPollTimer = void 0;
        return;
      }
      if (document.visibilityState !== "visible") {
        return;
      }
      const bubbles = await fetchLineupBubbles(rows);
      if (bubbles.size === 0) {
        return;
      }
      const newlyOut = [];
      for (const player of scoredPlayers) {
        const key = bubbleKey(player.row);
        const bubble = bubbles.get(key);
        if (!bubble) continue;
        const prev = lastBubbleLabels.get(key);
        if (bubble.tone === "out" && prev !== void 0 && prev !== bubble.label && !player.row.isBench) {
          newlyOut.push(player.row.playerName);
        }
        lastBubbleLabels.set(key, bubble.label);
      }
      updateSetLineupLineupBubbles(scoredPlayers, bubbles);
      if (newlyOut.length > 0) {
        showToast(`Not in today's posted lineup: ${newlyOut.join(", ")}`, "error");
      }
    }, "pollOnce");
    lineupPollTimer = window.setInterval(() => {
      void pollOnce().catch(() => void 0);
    }, LINEUP_POLL_MINUTES * 60 * 1e3);
  }
  __name(startLineupPolling, "startLineupPolling");
  function selectText2(select) {
    if (!select) {
      return "";
    }
    return select.selectedOptions?.[0]?.textContent?.trim() ?? select.value ?? "";
  }
  __name(selectText2, "selectText");
  function normalizeText2(value) {
    return value?.replace(/\s+/g, " ").trim() ?? "";
  }
  __name(normalizeText2, "normalizeText");
  function selectedTeamRow() {
    return document.querySelector("tr.selected");
  }
  __name(selectedTeamRow, "selectedTeamRow");
  function selectedTeamNode2() {
    return selectedTeamRow();
  }
  __name(selectedTeamNode2, "selectedTeamNode");
  function selectedTeamPieces() {
    const row = selectedTeamRow();
    if (!row) {
      return {};
    }
    const button = row.querySelector("button") ?? row;
    const spans = Array.from(button.querySelectorAll(":scope > span"));
    const teamText = stripInjectedStatusCounts(
      normalizeText2(ownTextOf(spans[0]) ?? spans[0]?.textContent ?? row.textContent)
    );
    const leagueText = normalizeText2(spans[1]?.textContent);
    return { teamText, leagueText };
  }
  __name(selectedTeamPieces, "selectedTeamPieces");
  function selectedMenuLeagueId() {
    const row = selectedTeamRow();
    if (!row) {
      return void 0;
    }
    const button = row.querySelector("button") ?? row;
    const spans = Array.from(button.querySelectorAll(":scope > span"));
    return spans.at(-1)?.textContent?.match(/#(\d+)/)?.[1];
  }
  __name(selectedMenuLeagueId, "selectedMenuLeagueId");
  async function selectDeepLinkedTeam() {
    const target = parseSetLineupDeepLink(window.location.hash);
    if (!target) return;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (selectedMenuLeagueId() === target.leagueId) break;
      const button = Array.from(document.querySelectorAll("button")).find((candidate) => {
        const spans = Array.from(candidate.querySelectorAll(":scope > span"));
        return spans.at(-1)?.textContent?.match(/#(\d+)/)?.[1] === target.leagueId;
      });
      if (button) button.click();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  }
  __name(selectDeepLinkedTeam, "selectDeepLinkedTeam");
  function matchLastNumber(text2) {
    const matches = Array.from(text2.matchAll(/#(\d+)/g));
    return matches.at(-1)?.[1];
  }
  __name(matchLastNumber, "matchLastNumber");
  function weekSelect() {
    const selects = Array.from(document.querySelectorAll("select"));
    return selects.find((select) => Array.from(select.options).some((option) => /Week\s+\d+/i.test(option.textContent ?? ""))) ?? null;
  }
  __name(weekSelect, "weekSelect");
  function periodFromPage2() {
    const value = selectText2(weekSelect());
    const detected = detectPeriodFromText(value);
    return detected === "UNKNOWN" ? "WEEKLY" : detected;
  }
  __name(periodFromPage2, "periodFromPage");
  function periodLabelFromPage2() {
    return selectText2(weekSelect());
  }
  __name(periodLabelFromPage2, "periodLabelFromPage");
  function urlSegments2() {
    const match = window.location.pathname.match(/\/setlineup(?:all)?\/(\d+)\/(\d+)(?:\/(\d+))?/);
    return match ? { leagueId: match[1], teamId: match[2], spid: match[3] } : {};
  }
  __name(urlSegments2, "urlSegments");
  function currentLeagueId() {
    const fromUrl = urlSegments2().leagueId;
    if (fromUrl) return fromUrl;
    const selectedText = selectedTeamPieces().leagueText ?? normalizeText2(selectedTeamNode2()?.textContent);
    const pageTitle = Array.from(document.querySelectorAll("body *")).map((node) => node.textContent?.trim() ?? "").find((text2) => /#\d+$/.test(text2) && !text2.includes("ACCT#:"));
    return matchLastNumber(selectedText) ?? (pageTitle ? matchLastNumber(pageTitle) : void 0);
  }
  __name(currentLeagueId, "currentLeagueId");
  function currentTeamId() {
    return urlSegments2().teamId ?? selectedTeamNode2()?.getAttribute("data-team-id") ?? void 0;
  }
  __name(currentTeamId, "currentTeamId");
  function currentContestLabel() {
    const { teamText, leagueText } = selectedTeamPieces();
    if (leagueText) {
      return leagueText;
    }
    const selectedText = teamText ?? selectedTeamNode2()?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const selectedMatch = selectedText.match(/ACCT#:\d+\s*(.+)$/);
    if (selectedMatch?.[1]) {
      return selectedMatch[1].trim();
    }
    return Array.from(document.querySelectorAll("body *")).map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "").find((text2) => /#\d+$/.test(text2) && !text2.includes("ACCT#:") && !text2.startsWith("Week "));
  }
  __name(currentContestLabel, "currentContestLabel");
  function currentScoringPeriod2() {
    const value = selectText2(weekSelect()) || document.body.textContent || "";
    const match = value.match(/Week\s+(\d+)/i);
    return match ? Number(match[1]) : void 0;
  }
  __name(currentScoringPeriod2, "currentScoringPeriod");
  function scheduleDateLabels() {
    const headerRow = Array.from(document.querySelectorAll("div")).find((node) => {
      const children = Array.from(node.children);
      return children.length >= 2 && children.some((child) => /^\d{1,2}\/\d{1,2}$/.test(child.textContent?.trim() ?? ""));
    });
    if (headerRow instanceof HTMLElement) {
      headerRow.dataset.nfbcNative = "date-header";
    }
    return Array.from(headerRow?.children ?? []).map((child) => child.textContent?.trim() ?? "").filter((value) => /^\d{1,2}\/\d{1,2}$/.test(value));
  }
  __name(scheduleDateLabels, "scheduleDateLabels");
  function firstScheduleDateIso(labels, now = /* @__PURE__ */ new Date()) {
    const first = labels[0];
    const match = first?.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!match) return void 0;
    const [, month, day] = match;
    return `${now.getFullYear()}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  __name(firstScheduleDateIso, "firstScheduleDateIso");
  async function captureLineupDecision(input) {
    const record = buildDecisionRecord(input);
    if (record) await saveDecisionRecord(record);
  }
  __name(captureLineupDecision, "captureLineupDecision");
  function localDateIso4(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  __name(localDateIso4, "localDateIso");
  function pageObservationRoot2() {
    return document.getElementById("page_content") ?? document.getElementById("react_root") ?? document.getElementById("page") ?? document.body;
  }
  __name(pageObservationRoot2, "pageObservationRoot");
  function markMinorLeaguers(rows, activeRosters) {
    const activeNames = activeNameUnion(activeRosters);
    rows.forEach((row) => {
      if (shouldMarkMinorLeaguer(row, activeRosters, activeNames)) {
        row.injuryStatus = "MINORS";
      }
    });
  }
  __name(markMinorLeaguers, "markMinorLeaguers");
  function markFreshIl(rows, ilFlags) {
    if (ilFlags.size === 0) {
      return;
    }
    rows.forEach((row) => {
      const key = `${row.normalizedName}|${row.normalizedTeam ?? ""}`;
      if (ilFlags.has(key) && !isUnavailableForLineup(row)) {
        row.injuryStatus = row.injuryStatus ? `${row.injuryStatus} IL` : "IL";
      }
    });
  }
  __name(markFreshIl, "markFreshIl");
  function markRosteredIl(rows, rosterStatus) {
    if (rosterStatus.size === 0) {
      return;
    }
    rows.forEach((row) => {
      if (shouldMarkRosteredIl(row, row.normalizedTeam ? rosterStatus.get(row.normalizedTeam) : void 0)) {
        row.injuryStatus = row.injuryStatus ? `${row.injuryStatus} IL` : "IL";
      }
    });
  }
  __name(markRosteredIl, "markRosteredIl");
  function rosterLineupSignature() {
    return Array.from(document.querySelectorAll(".Player[data-can-set-lineup='1']")).map((card) => {
      const id = card.querySelector("a[href*='/player/baseball/']")?.getAttribute("href")?.match(/\/baseball\/(\d+)/)?.[1] ?? "";
      const slot = card.querySelector("button[title] .pos")?.textContent?.trim() ?? "";
      return `${id}:${slot}`;
    }).join("|");
  }
  __name(rosterLineupSignature, "rosterLineupSignature");
  function scheduleDisplaySelect() {
    return Array.from(document.querySelectorAll("select")).find(
      (node) => Array.from(node.options ?? []).some((option) => option.textContent?.includes("Show Schedule"))
    ) ?? null;
  }
  __name(scheduleDisplaySelect, "scheduleDisplaySelect");
  var lastNonScheduleDisplayValue;
  function rememberNonScheduleDisplay(select = scheduleDisplaySelect()) {
    if (select && !isScheduleDisplaySelected()) {
      lastNonScheduleDisplayValue = select.value;
    }
  }
  __name(rememberNonScheduleDisplay, "rememberNonScheduleDisplay");
  function isScheduleDisplaySelected() {
    const select = scheduleDisplaySelect();
    return (select?.selectedOptions?.[0]?.textContent ?? select?.value ?? "").includes("Show Schedule");
  }
  __name(isScheduleDisplaySelected, "isScheduleDisplaySelected");
  function synchronizeScheduleDisplay(showSchedule) {
    const select = scheduleDisplaySelect();
    if (!select) {
      return false;
    }
    const currentSchedule = isScheduleDisplaySelected();
    if (currentSchedule === showSchedule) {
      if (!currentSchedule) rememberNonScheduleDisplay(select);
      return false;
    }
    if (showSchedule) rememberNonScheduleDisplay(select);
    const options = Array.from(select.options);
    const targetOption = showSchedule ? options.find((option) => option.textContent?.includes("Show Schedule")) : options.find((option) => option.value === lastNonScheduleDisplayValue) ?? options.find((option) => option.textContent?.includes("Show Stats")) ?? options.find((option) => !(option.textContent ?? "").includes("Show Schedule"));
    if (!targetOption) {
      return false;
    }
    select.value = targetOption.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  __name(synchronizeScheduleDisplay, "synchronizeScheduleDisplay");
  function tagNativeChrome() {
    const select = scheduleDisplaySelect();
    if (select) {
      select.dataset.nfbcNative = "schedule-select";
    }
    document.querySelectorAll("[data-nfbc-native='no-changes']").forEach((node) => {
      if ((node.textContent?.replace(/\s+/g, " ").trim() ?? "") !== "No Changes") {
        delete node.dataset.nfbcNative;
      }
    });
    document.querySelectorAll("button, div, span, h1, h2, h3").forEach((node) => {
      if (node.children.length > 0 || node.dataset.nfbcNative) {
        return;
      }
      if (node.closest("#nfbc-setlineup-shell, #nfbc-sl-roster-root, [data-nfbc-ext], [data-nfbc-native]")) {
        return;
      }
      const text2 = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (text2 === "No Changes") {
        (node.closest("button") ?? node).dataset.nfbcNative = "no-changes";
      } else if (text2 === "Starters" || text2 === "Pitchers" || text2 === "Bench") {
        node.dataset.nfbcNative = "card-title";
      }
    });
  }
  __name(tagNativeChrome, "tagNativeChrome");
  var rosterWaitDetail = {};
  var scriptStart = performance.now();
  async function waitForRoster() {
    const deadline = Date.now() + 1e4;
    const tickMs = 25;
    const stableForMs = 150;
    const benchlessStableForMs = 1200;
    const started = performance.now();
    let lastCount = 0;
    let unchangedSince;
    const since = /* @__PURE__ */ __name(() => Math.round(performance.now() - started), "since");
    while (Date.now() < deadline) {
      const cards = Array.from(document.querySelectorAll(".Player[data-can-set-lineup='1']"));
      const count = cards.length;
      const hasBench = cards.some((card) => card.querySelector("button[title] .pos")?.textContent?.trim() === "BN");
      if (count > 0 && rosterWaitDetail.firstCards == null) {
        rosterWaitDetail.firstCards = since();
        rosterWaitDetail.firstCount = count;
      }
      if (hasBench && rosterWaitDetail.firstBench == null) rosterWaitDetail.firstBench = since();
      if (count > 0 && count !== lastCount) rosterWaitDetail.lastChange = since();
      if (count > 0) {
        if (count !== lastCount) {
          unchangedSince = performance.now();
          lastCount = count;
        } else if (unchangedSince == null) {
          unchangedSince = performance.now();
        }
        const settleMs = hasBench ? stableForMs : benchlessStableForMs;
        if (performance.now() - unchangedSince >= settleMs) {
          rosterWaitDetail.exit = since();
          rosterWaitDetail.finalCount = count;
          return { hasBench };
        }
      } else {
        lastCount = count;
        unchangedSince = void 0;
      }
      await new Promise((resolve) => window.setTimeout(resolve, tickMs));
    }
    throw new Error("Set lineup roster did not stabilize.");
  }
  __name(waitForRoster, "waitForRoster");
  function percentileCells(row) {
    return CATEGORY_ORDER2.map((category) => {
      const item = row?.categories[category];
      const percentile = item?.percentile;
      const value = percentile == null ? "--" : `${Math.round(percentile)}%`;
      const rank = item?.rank == null || item.teamCount <= 0 ? "No overall standing value" : `Rank ${item.rank}/${item.teamCount}`;
      const statValue = item?.value == null ? "" : ` | Value ${item.value}`;
      return {
        label: category,
        value,
        tone: item?.tone ?? "neutral",
        detail: `${category}: ${value}${rank ? ` | ${rank}` : ""}${statValue}`
      };
    });
  }
  __name(percentileCells, "percentileCells");
  function findShellAnchor() {
    return document.querySelector(".Page__ListsWrapper-sc-1adavv2-2, [class*='Page__ListsWrapper']") ?? document.querySelector(".list_wrapper, [class*='PlayersListNew__Wrapper']")?.parentElement ?? null;
  }
  __name(findShellAnchor, "findShellAnchor");
  function mountShell(shell) {
    const anchor = findShellAnchor();
    if (!anchor?.parentElement) {
      if (!shell.root.isConnected) {
        document.body.prepend(shell.root);
      }
      return;
    }
    if (shell.root.parentElement !== anchor.parentElement || shell.root.nextElementSibling !== anchor) {
      anchor.parentElement.insertBefore(shell.root, anchor);
    }
  }
  __name(mountShell, "mountShell");
  function setViewDatasets(shell, state) {
    shell.root.dataset.density = state.density;
    shell.root.dataset.schedule = String(state.showSchedule);
    shell.root.dataset.onlyChanges = String(state.showOnlyChanges);
    shell.root.dataset.benchCollapsed = String(state.benchCollapsed);
    document.body.dataset.nfbcSlDensity = state.density;
    document.body.dataset.nfbcSlSchedule = String(state.showSchedule);
    document.body.dataset.nfbcSlOnlyChanges = String(state.showOnlyChanges);
    document.body.dataset.nfbcSlBenchCollapsed = String(state.benchCollapsed);
  }
  __name(setViewDatasets, "setViewDatasets");
  function toolbarButton(label, pressed, onClick, detail) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.viewToggle = label.toLowerCase().replace(/\s+/g, "-");
    button.setAttribute("aria-pressed", String(pressed));
    button.textContent = label;
    if (detail) {
      button.dataset.nfbcTooltip = detail;
      button.title = detail;
    }
    button.addEventListener("click", onClick);
    return button;
  }
  __name(toolbarButton, "toolbarButton");
  function renderToolbar(shell, state, handlers) {
    const densityButton = toolbarButton(
      state.density === "compact" ? "Comfortable" : "Compact",
      state.density === "compact",
      handlers.onDensityToggle,
      state.density === "compact" ? "Use roomier player-row spacing." : "Use tighter row spacing to fit more players on screen."
    );
    const scheduleButton = toolbarButton(
      state.showSchedule ? "Hide Schedule" : "Show Schedule",
      state.showSchedule,
      handlers.onScheduleToggle,
      state.showSchedule ? "Hide the per-day opponent and probable-starter schedule." : "Show each player's week of games: opponent, projected start days (\u25C6), game time, and opposing-SP hand."
    );
    const changesButton = toolbarButton(
      state.showOnlyChanges ? "Show All Players" : "Only Changes",
      state.showOnlyChanges,
      handlers.onChangesToggle,
      state.showOnlyChanges ? "Show every active and bench player." : "Hide rows the optimizer isn't moving \u2014 show only recommended swaps."
    );
    const benchButton = toolbarButton(
      state.benchCollapsed ? "Expand Bench" : "Collapse Bench",
      state.benchCollapsed,
      handlers.onBenchToggle,
      state.benchCollapsed ? "Show the bench section." : "Hide the bench section to focus on your active lineup."
    );
    shell.helpButton.dataset.nfbcTooltip = "Open the legend: what every chip, color, and input on this page means.";
    shell.toolbar.replaceChildren(densityButton, scheduleButton, changesButton, benchButton, shell.helpButton);
  }
  __name(renderToolbar, "renderToolbar");
  function sectionSummary(text2) {
    const node = document.createElement("div");
    node.className = "nfbc-sl-section-summary";
    node.textContent = text2;
    return node;
  }
  __name(sectionSummary, "sectionSummary");
  function ensureSection(id, label, toggleable = false) {
    const existing = document.getElementById(id);
    if (existing) {
      return {
        section: existing,
        summary: existing.querySelector(".nfbc-sl-section-summary"),
        toggle: existing.querySelector(".nfbc-sl-section-toggle")
      };
    }
    const section = document.createElement("div");
    section.id = id;
    section.className = "nfbc-sl-section";
    section.dataset.nfbcExt = "section";
    const header = document.createElement("div");
    header.className = "nfbc-sl-section-header";
    const titleRow = document.createElement("div");
    titleRow.className = "nfbc-sl-section-title-row";
    const title = document.createElement("div");
    title.className = "nfbc-sl-section-label";
    title.textContent = label;
    const summary = sectionSummary("");
    titleRow.append(title, summary);
    header.append(titleRow);
    let toggle;
    if (toggleable) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "nfbc-sl-section-toggle";
      header.append(toggle);
    }
    section.append(header);
    return { section, summary, toggle };
  }
  __name(ensureSection, "ensureSection");
  function ensureRosterSections(state) {
    const cards = Array.from(document.querySelectorAll(".Player[data-can-set-lineup='1']"));
    if (cards.length === 0) {
      return null;
    }
    const starters = ensureSection("nfbc-sl-section-starters", "Starters");
    const bench = ensureSection("nfbc-sl-section-bench", "Bench", true);
    bench.section.dataset.section = "bench";
    starters.section.dataset.section = "starters";
    bench.toggle.textContent = state.benchCollapsed ? "Expand" : "Collapse";
    return {
      starters: {
        section: starters.section,
        summary: starters.summary
      },
      bench: {
        section: bench.section,
        summary: bench.summary,
        toggle: bench.toggle
      }
    };
  }
  __name(ensureRosterSections, "ensureRosterSections");
  function renderHealthNotes(container, findings) {
    container.querySelectorAll("[data-nfbc-ext='health-note']").forEach((node) => node.remove());
    formatHealthFindings(findings).reverse().forEach((line) => {
      const note = document.createElement("div");
      note.dataset.nfbcExt = "health-note";
      note.className = "nfbc-note-line";
      note.textContent = line;
      container.prepend(note);
    });
  }
  __name(renderHealthNotes, "renderHealthNotes");
  function renderStrengthGrid(container, percentileRow, pending = false) {
    container.querySelectorAll(":scope > *:not([data-nfbc-ext='health-note'])").forEach((n2) => n2.remove());
    if (!percentileRow) {
      const empty = document.createElement("div");
      empty.className = "nfbc-note-line";
      empty.textContent = pending ? "Category strength loading\u2026" : "Category strength unavailable \u2014 this team's standings did not load";
      container.append(empty);
      return;
    }
    renderChipGrid(container, percentileCells(percentileRow));
  }
  __name(renderStrengthGrid, "renderStrengthGrid");
  function renderKpis(container, currentTotal, optimizedTotal, freshness) {
    const netGain = optimizedTotal - currentTotal;
    const netGainValue = netGain > 0 ? `\u25B2 +${netGain.toFixed(2)}` : netGain < 0 ? `\u25BC ${netGain.toFixed(2)}` : "0.00";
    container.replaceChildren();
    renderMetricCards(container, [
      {
        label: "Current Value",
        value: currentTotal.toFixed(2),
        detail: "Total optimizer SGP of the players you currently have in active slots (sum of each row's optimizer value)."
      },
      {
        label: "Optimized Value",
        value: optimizedTotal.toFixed(2),
        tone: optimizedTotal > currentTotal ? "positive" : "neutral",
        detail: "Total optimizer SGP if you make every recommended swap \u2014 the best eligible lineup from your roster for this period."
      },
      {
        label: "Net Gain",
        value: netGainValue,
        tone: netGain > 0 ? "positive" : netGain < 0 ? "warning" : "neutral",
        detail: "Optimized minus Current \u2014 the projected SGP you'd add this period by applying the recommended swaps. 0.00 means your lineup is already optimal."
      },
      {
        label: "Schedule Match",
        value: freshness.tone === "fresh" ? "OK" : freshness.tone === "watch" ? "\u26A0\uFE0F Check" : "\u{1F6A9} Mismatch",
        tone: freshness.tone === "fresh" ? "positive" : freshness.tone === "low" ? "warning" : "neutral",
        detail: `Whether the projections' game counts line up with this week's actual MLB schedule. ${freshness.summary}`
      }
    ]);
  }
  __name(renderKpis, "renderKpis");
  function swapSignature(changes) {
    return [...changes].map((c) => `${c.playerKey}:${c.to}`).sort().join("|");
  }
  __name(swapSignature, "swapSignature");
  function renderSwapSection(section, heading, headingTip, changes, nameByKey, valueByKey, unavailable = /* @__PURE__ */ new Set()) {
    const label = document.createElement("span");
    label.className = "nfbc-sl-swaps-label";
    label.textContent = heading;
    label.dataset.nfbcTooltip = headingTip;
    section.append(label);
    const valueStr = /* @__PURE__ */ __name((key) => {
      const v = valueByKey.get(key);
      return v == null ? "" : ` ${v >= 0 ? "" : "\u2212"}${Math.abs(v).toFixed(2)}`;
    }, "valueStr");
    if (changes.length === 0) {
      const note = document.createElement("span");
      note.className = "nfbc-sl-swap-chip";
      note.dataset.direction = "none";
      note.textContent = "\u2713 optimized";
      section.append(note);
      return;
    }
    const ordered = [...changes].sort((a, b) => Number(a.to === "BN") - Number(b.to === "BN"));
    const marginal = marginalSwapKeys(changes, valueByKey, unavailable);
    ordered.forEach((change) => {
      const chip = document.createElement("span");
      chip.className = "nfbc-sl-swap-chip";
      chip.dataset.direction = change.to === "BN" ? "out" : "in";
      const verb = change.to === "BN" ? "Bench" : "Start";
      const name = nameByKey.get(change.playerKey) ?? change.playerKey;
      chip.textContent = `${verb} ${name}${valueStr(change.playerKey)} (${change.from} \u2192 ${change.to})`;
      if (marginal.has(change.playerKey)) chip.textContent += " \xB7 marginal edge";
      chip.dataset.nfbcTooltip = change.to === "BN" ? `Move ${name} (projected${valueStr(change.playerKey)} SGP) to the bench (out of ${change.from}) \u2014 a higher-projected player takes this slot. Part of a swap with a "Start" chip.` : `Move ${name} (projected${valueStr(change.playerKey)} SGP) into your ${change.to} slot (from ${change.from}) \u2014 higher projected SGP than the player currently there.`;
      if (marginal.has(change.playerKey)) chip.dataset.nfbcTooltip += " The projected advantage is at most 0.02 SGP. Treat this as a toss-up and check posted lineups; this label is not a calibrated confidence estimate.";
      section.append(chip);
    });
  }
  __name(renderSwapSection, "renderSwapSection");
  function renderSwaps(container, contextChanges, rawChanges, drivers, rows, contextValueByKey, rawValueByKey, contextLabel, contextReason, validationWarning) {
    container.replaceChildren();
    container.hidden = false;
    if (validationWarning) {
      container.dataset.state = "warning";
      const label = document.createElement("span");
      label.className = "nfbc-sl-swaps-label";
      label.textContent = `\u26A0 Optimization could not produce a valid lineup \u2014 current lineup retained`;
      label.dataset.nfbcTooltip = validationWarning;
      container.append(label);
      return;
    }
    const nameByKey = new Map(rows.map((row) => [row.rowElementKey, row.playerName]));
    const unavailable = new Set(rows.filter(isUnavailableForLineup).map((row) => row.rowElementKey));
    const differs = swapSignature(contextChanges) !== swapSignature(rawChanges);
    if (!differs) {
      container.dataset.state = contextChanges.length === 0 ? "optimized" : "swaps";
      if (contextChanges.length === 0) {
        const label = document.createElement("span");
        label.className = "nfbc-sl-swaps-label";
        label.textContent = `\u2713 Lineup is optimized \xB7 ${contextLabel}`;
        label.dataset.nfbcTooltip = `Your active lineup already has the highest decision SGP available from your roster for this period \u2014 no moves recommended. ${contextReason}`;
        container.append(label);
        return;
      }
      renderSwapSection(
        container,
        `Recommended swaps \xB7 ${contextLabel}`,
        `Each chip is one move the optimizer recommends to raise your projected SGP this period. ${contextReason} Press Optimize to apply them all at once, or make them by hand.`,
        contextChanges,
        nameByKey,
        contextValueByKey,
        unavailable
      );
      return;
    }
    container.dataset.state = "swaps";
    const ctxSection = document.createElement("div");
    ctxSection.className = "nfbc-sl-swap-group";
    const driverNote = drivers.length > 0 ? ` \xB7 favors ${drivers.slice(0, 3).join(", ")}` : "";
    renderSwapSection(
      ctxSection,
      `${contextLabel}${driverNote}`,
      `${contextReason} The swaps maximize SGP after weighting categories by the selected standings pool${drivers.length > 0 ? ` \u2014 this lineup leans into ${drivers.join(", ")}` : ""}. This is what the team-menu indicator counts.`,
      contextChanges,
      nameByKey,
      contextValueByKey,
      unavailable
    );
    const rawSection = document.createElement("div");
    rawSection.className = "nfbc-sl-swap-group";
    renderSwapSection(
      rawSection,
      "Raw SGP",
      "The swaps that maximize plain projected SGP, ignoring standings need \u2014 shown for comparison against the team-context recommendation.",
      rawChanges,
      nameByKey,
      rawValueByKey,
      unavailable
    );
    container.append(ctxSection, rawSection);
  }
  __name(renderSwaps, "renderSwaps");
  function renderProjectionBlocker(container, players, onRefresh, options) {
    if (players.length === 0) {
      if (!options.rematchAttempted) return;
      const resolved = document.createElement("div");
      resolved.className = "nfbc-sl-projection-blocker nfbc-sl-projection-blocker--resolved";
      resolved.setAttribute("role", "status");
      resolved.setAttribute("aria-live", "polite");
      const summary2 = document.createElement("strong");
      summary2.className = "nfbc-sl-projection-blocker__summary";
      summary2.textContent = "Projection gaps resolved";
      const outcome2 = document.createElement("span");
      outcome2.className = "nfbc-sl-projection-blocker__outcome";
      outcome2.textContent = "Recommendations were rebuilt from the refreshed matches.";
      const freshness2 = document.createElement("span");
      freshness2.className = "nfbc-sl-projection-blocker__freshness";
      freshness2.textContent = options.freshness;
      resolved.append(summary2, outcome2, freshness2);
      container.prepend(resolved);
      return;
    }
    const warning = document.createElement("div");
    warning.className = "nfbc-sl-projection-blocker";
    warning.setAttribute("role", "alert");
    warning.setAttribute("aria-live", "assertive");
    const copy = document.createElement("div");
    copy.className = "nfbc-sl-projection-blocker__copy";
    const summary = document.createElement("strong");
    summary.className = "nfbc-sl-projection-blocker__summary";
    summary.textContent = options.rematchAttempted ? `Still blocked after refresh \u2014 ${players.length} active projection ${players.length === 1 ? "gap remains" : "gaps remain"}` : `Apply blocked \u2014 ${players.length} active projection ${players.length === 1 ? "gap" : "gaps"}`;
    const outcome = document.createElement("span");
    outcome.className = "nfbc-sl-projection-blocker__outcome";
    outcome.textContent = options.rematchAttempted ? "The latest rematch did not find every active player. Review the affected players below." : "Every active player needs a current projection before the extension can apply changes.";
    const freshness = document.createElement("span");
    freshness.className = "nfbc-sl-projection-blocker__freshness";
    freshness.textContent = options.freshness;
    const details = document.createElement("details");
    details.className = "nfbc-sl-projection-blocker__details";
    details.open = true;
    const detailsSummary = document.createElement("summary");
    detailsSummary.textContent = `${players.length} affected ${players.length === 1 ? "player" : "players"}`;
    const list = document.createElement("ul");
    players.forEach((player) => {
      const reason = player.warnings[0] ?? "No current projection match";
      const item = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = `${player.row.playerName} (${player.row.mlbTeam || "?"}, ${player.row.currentSlot})`;
      item.append(name, document.createTextNode(` \u2014 ${reason}`));
      list.append(item);
    });
    details.append(detailsSummary, list);
    copy.append(summary, outcome, freshness, details);
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "nfbc-action-button";
    refresh.dataset.tone = "secondary";
    refresh.textContent = "Refresh & rematch";
    refresh.title = "Reload projection data and rerun player matching before applying a lineup.";
    refresh.addEventListener("click", onRefresh);
    warning.append(copy, refresh);
    container.prepend(warning);
  }
  __name(renderProjectionBlocker, "renderProjectionBlocker");
  function benchRiskCount(scoredPlayers, riskBadges) {
    return scoredPlayers.filter((player) => {
      if (!player.row.isBench) {
        return false;
      }
      const rowKey = `${player.row.normalizedName}|${player.row.normalizedTeam ?? ""}`;
      return Boolean(riskBadges.get(rowKey)?.length) || player.warnings.length > 0;
    }).length;
  }
  __name(benchRiskCount, "benchRiskCount");
  function applyRosterSections(sections, rows, scoredPlayers, changedRowKeys, riskBadges, state) {
    const cards = Array.from(document.querySelectorAll(".Player[data-can-set-lineup='1']"));
    cards.forEach((card, index) => {
      card.dataset.nfbcStripe = index % 2 === 1 ? "1" : "0";
    });
    const firstCard = cards[0];
    const firstBenchCard = cards.find((card) => card.dataset.nfbcBench === "true");
    if (firstCard?.parentElement && firstCard.previousElementSibling !== sections.starters.section) {
      firstCard.parentElement.insertBefore(sections.starters.section, firstCard);
    }
    if (firstBenchCard?.parentElement) {
      if (firstBenchCard.previousElementSibling !== sections.bench.section) {
        firstBenchCard.parentElement.insertBefore(sections.bench.section, firstBenchCard);
      }
      sections.bench.section.style.display = "";
      const benchParent = firstBenchCard.parentElement;
      const currentAssignments = rows.filter((row) => row.isActive).map((row) => ({ playerKey: row.rowElementKey, slotId: row.currentSlot }));
      const visuallyOrderedBench = orderSavedRosterByProjection(rows, currentAssignments, scoredPlayers).filter((row) => row.isBench);
      const cardByKey = new Map(rows.map((row, index) => [row.rowElementKey, cards[index]]));
      benchParent.style.display = "flex";
      benchParent.style.flexDirection = "column";
      Array.from(benchParent.children).forEach((child, index) => {
        child.style.order = String(index * 100);
      });
      const firstBenchOrder = Array.from(benchParent.children).indexOf(firstBenchCard) * 100;
      visuallyOrderedBench.forEach((row, index) => {
        const card = cardByKey.get(row.rowElementKey);
        if (!card) return;
        card.style.order = String(firstBenchOrder + index);
        card.dataset.nfbcStripe = index % 2 === 1 ? "1" : "0";
      });
    } else {
      sections.bench.section.style.display = "none";
    }
    const activeCount = rows.filter((row) => !row.isBench).length;
    const benchRows = rows.filter((row) => row.isBench);
    const changedActiveCount = rows.filter((row) => !row.isBench && changedRowKeys.has(row.rowElementKey)).length;
    const benchPromotions = benchRows.filter((row) => changedRowKeys.has(row.rowElementKey)).length;
    const flaggedBenchRisks = benchRiskCount(scoredPlayers, riskBadges);
    sections.starters.summary.textContent = `${activeCount} active \xB7 ${changedActiveCount} changed`;
    sections.bench.summary.textContent = `${benchRows.length} players \xB7 ${benchPromotions} strong alt \xB7 ${flaggedBenchRisks} flagged risk`;
    sections.bench.toggle.textContent = state.benchCollapsed ? "Expand" : "Collapse";
  }
  __name(applyRosterSections, "applyRosterSections");
  function helpLines(freshnessSummary, roleRiskSummary, warnings) {
    return [
      freshnessSummary,
      roleRiskSummary,
      ...warnings.slice(0, 8),
      "Legend: number after the name = posted batting order. F-S / Wk = projected SGP for the period (green strong, red weak).",
      "Form pill = league-context roto value over an exact 30-day box-score window; hitter skills use 30-day Statcast and pitcher skills use 60-day Statcast/box scores. Hover any segment for its data-through date.",
      "Row chips: IL = on the injured list; PT = started under 80% of the last 12 team games; PL = platoon risk vs same-handed starters.",
      "A category chip (e.g. HR 41%) marks where this team can gain the most ground this period \u2014 the category whose standings gap the roster's own projections cover the largest share of. Every available hitter carries one so the lineup can be compared on it. Runs and RBI ask for at least TWO (nearly every starter clears one, so one tells you nothing); HR and SB ask for one. Hover for the gap and this hitter's projected amount.",
      "SB n% = chance of at least one steal this period, counting the opposing catchers weighted by how likely each is to start. On every available hitter so the number can be compared across the lineup; hidden for IL/suspended/minors. Colour bands the chance; hover the projection chip for the expected count alongside it.",
      "Schedule mode shows opponent plus probable-starter hand (RHP / LHP) on the first line and game time beneath it."
    ];
  }
  __name(helpLines, "helpLines");
  async function runSetLineupPage() {
    await selectDeepLinkedTeam();
    applyReadabilityTheme("setlineup");
    installHoverTooltips();
    const shell = ensureSetLineupShell("NFBC Set Lineup");
    mountShell(shell);
    let viewState = loadSetLineupViewState();
    let refreshTimer;
    let refreshInFlight = false;
    let refreshQueued = false;
    let refreshQueuedForce = false;
    let refreshQueuedQuiet = true;
    let contextInvalidated = false;
    let contextReloadScheduled = false;
    let lastSignature = "";
    let lastOptCounts = /* @__PURE__ */ new Map();
    const OBSERVER_CONFIG = {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    };
    let pageObserver;
    let menuObserver;
    let observedMenuRoot;
    const pauseObserver = /* @__PURE__ */ __name((fn) => {
      pageObserver?.disconnect();
      try {
        return fn();
      } finally {
        if (!contextInvalidated) {
          pageObserver?.observe(pageObservationRoot2(), OBSERVER_CONFIG);
        }
      }
    }, "pauseObserver");
    let networkCache;
    let settledBundle;
    let renderedStrengthSignature;
    let clearedForSignature;
    let rosterCtx;
    let rosterLineupSig = "";
    let recacheTimer;
    const writeRosterCache = /* @__PURE__ */ __name((rows) => {
      if (!rosterCtx) {
        return;
      }
      const { leagueId, teamId, contestLabel, periodLabel, leagueType } = rosterCtx;
      const cleanContestLabel = usableContestLabel(contestLabel);
      void updateRosterCache(leagueId ?? cleanContestLabel ?? "default", {
        leagueId: leagueId ?? cleanContestLabel ?? "default",
        teamId,
        label: cleanContestLabel || periodLabel || "NFBC league",
        leagueType,
        usesSubPeriods: periodFromPage2() !== "WEEKLY",
        capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
        players: rows.map((row) => ({
          name: row.playerName,
          normalizedName: row.normalizedName,
          team: row.mlbTeam,
          normalizedTeam: row.normalizedTeam,
          positions: row.eligiblePositions,
          slot: row.currentSlot,
          isBench: row.isBench,
          playerId: row.pagePlayerId
        }))
      }).catch(() => void 0);
    }, "writeRosterCache");
    const maybeRecacheRoster = /* @__PURE__ */ __name(() => {
      if (recacheTimer != null) {
        return;
      }
      recacheTimer = window.setTimeout(() => {
        recacheTimer = void 0;
        if (!rosterCtx) {
          return;
        }
        const sig = rosterLineupSignature();
        if (!sig || sig === rosterLineupSig) {
          return;
        }
        rosterLineupSig = sig;
        writeRosterCache(parseSetLineupRoster());
        scheduleRefresh(true, true);
      }, 800);
    }, "maybeRecacheRoster");
    const applyState = /* @__PURE__ */ __name(() => {
      setViewDatasets(shell, viewState);
    }, "applyState");
    const updateState = /* @__PURE__ */ __name((patch) => {
      viewState = { ...viewState, ...patch };
      saveSetLineupViewState(viewState);
      applyState();
    }, "updateState");
    const scheduleRefresh = /* @__PURE__ */ __name((force = false, quiet = false) => {
      if (contextInvalidated) {
        return;
      }
      const current = pageSignature();
      if (current !== lastSignature && lastSignature !== "" && clearedForSignature !== current) {
        clearedForSignature = current;
        lockStaleContext();
      }
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        void refresh(force, quiet);
      }, 200);
    }, "scheduleRefresh");
    const renderToolbarState = /* @__PURE__ */ __name(() => {
      renderToolbar(shell, viewState, {
        onDensityToggle: /* @__PURE__ */ __name(() => {
          updateState({ density: viewState.density === "compact" ? "comfortable" : "compact" });
          renderToolbarState();
        }, "onDensityToggle"),
        onScheduleToggle: /* @__PURE__ */ __name(() => {
          const next = !viewState.showSchedule;
          updateState({ showSchedule: next });
          renderToolbarState();
          synchronizeScheduleDisplay(next);
          scheduleRefresh(true);
        }, "onScheduleToggle"),
        onChangesToggle: /* @__PURE__ */ __name(() => {
          updateState({ showOnlyChanges: !viewState.showOnlyChanges });
          renderToolbarState();
        }, "onChangesToggle"),
        onBenchToggle: /* @__PURE__ */ __name(() => {
          updateState({ benchCollapsed: !viewState.benchCollapsed });
          renderToolbarState();
        }, "onBenchToggle")
      });
    }, "renderToolbarState");
    shell.helpButton.addEventListener("click", () => {
      shell.helpPanel.hidden = !shell.helpPanel.hidden;
      shell.helpButton.setAttribute("aria-expanded", String(!shell.helpPanel.hidden));
    });
    applyState();
    renderToolbarState();
    synchronizeScheduleDisplay(viewState.showSchedule);
    const STANDINGS_GRACE_MS = 150;
    const STANDINGS_RETRY_MS = 3e3;
    let standingsRetried = false;
    let projectionRematchSignature;
    const pageSignature = /* @__PURE__ */ __name(() => {
      const { teamText, leagueText } = selectedTeamPieces();
      return [
        currentLeagueId() ?? "",
        teamText ?? "",
        leagueText ?? "",
        periodFromPage2(),
        // MON_THU / FRI_SUN repeats every week. Without the actual selected
        // label, Week 20 Fri-Sun and Week 21 Fri-Sun have the same signature and
        // a native week change can leave the previous week's advice in place.
        periodLabelFromPage2(),
        isScheduleDisplaySelected() ? "schedule" : "standard"
      ].join("|");
    }, "pageSignature");
    const clearStaleAnnotations = /* @__PURE__ */ __name(() => {
      document.querySelectorAll(
        "[data-nfbc-ext='badge'],[data-nfbc-ext='badge-rail'],[data-nfbc-ext='metric-block'],[data-nfbc-ext='secondary-badges'],[data-nfbc-ext='lineup-slot'],[data-nfbc-ext='changed-chip'],[data-nfbc-ext='schedule-inner'],[data-nfbc-ext='schedule-top'],[data-nfbc-ext='schedule-opponent'],[data-nfbc-ext='schedule-dh'],[data-nfbc-ext='schedule-dh-games'],[data-nfbc-ext='schedule-dh-game'],[data-nfbc-ext='schedule-dh-hand'],[data-nfbc-ext='schedule-time']"
      ).forEach((node) => node.remove());
      document.querySelectorAll(".Player[data-can-set-lineup='1'].nfbc-sl-row--changed").forEach((row) => {
        row.classList.remove("nfbc-sl-row--changed");
        delete row.dataset.nfbcRecommendation;
      });
      networkCache = void 0;
      renderedStrengthSignature = void 0;
      renderStrengthGrid(shell.strengthGrid, void 0, true);
      shell.swaps.replaceChildren();
      shell.metrics.replaceChildren();
    }, "clearStaleAnnotations");
    const lockStaleContext = /* @__PURE__ */ __name((label = periodLabelFromPage2() || "lineup selection") => {
      clearStaleAnnotations();
      shell.subtitle.textContent = `Refreshing ${label}\u2026`;
      shell.optimizeButton.dataset.applyBlocked = "true";
      setPanelBusy(shell, true, { optimize: "Refreshing selection\u2026", refresh: "Refreshing\u2026" });
    }, "lockStaleContext");
    const recoverInvalidatedContext = /* @__PURE__ */ __name((error) => {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      if (!/extension context invalidated/i.test(message)) {
        return false;
      }
      contextInvalidated = true;
      refreshQueued = false;
      refreshQueuedForce = false;
      refreshQueuedQuiet = true;
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
        refreshTimer = void 0;
      }
      if (recacheTimer != null) {
        window.clearTimeout(recacheTimer);
        recacheTimer = void 0;
      }
      pageObserver?.disconnect();
      menuObserver?.disconnect();
      shell.subtitle.textContent = "Extension updated \u2014 reloading lineup page\u2026";
      shell.optimizeButton.dataset.applyBlocked = "true";
      setPanelBusy(shell, true, { optimize: "Reloading\u2026", refresh: "Reloading\u2026" });
      if (!contextReloadScheduled) {
        contextReloadScheduled = true;
        window.setTimeout(() => window.location.reload(), 250);
      }
      return true;
    }, "recoverInvalidatedContext");
    const refresh = /* @__PURE__ */ __name(async (force = false, quiet = false) => {
      if (contextInvalidated) {
        return;
      }
      if (refreshInFlight) {
        refreshQueued = true;
        refreshQueuedForce = refreshQueuedForce || force;
        refreshQueuedQuiet = refreshQueuedQuiet && quiet;
        return;
      }
      const signature = pageSignature();
      if (!force && signature === lastSignature) {
        return;
      }
      if (signature !== lastSignature && lastSignature !== "") {
        clearStaleAnnotations();
      }
      refreshInFlight = true;
      if (!quiet) {
        setPanelBusy(shell, true, {
          optimize: shell.optimizeButton.dataset.readyLabel ?? "Apply lineup",
          refresh: "Refreshing..."
        });
        shell.subtitle.textContent = "Refreshing lineup data";
      }
      try {
        const t0 = performance.now();
        const phase = {};
        const mark = /* @__PURE__ */ __name((name) => {
          phase[name] = Math.round(performance.now() - t0);
        }, "mark");
        const { hasBench } = await waitForRoster();
        mark("rosterReady");
        mountShell(shell);
        if (!hasBench) {
          shell.subtitle.textContent = `${periodLabelFromPage2()} | Fixed lineup \u2014 no bench to optimize`;
          shell.metrics.replaceChildren();
          shell.swaps.replaceChildren();
          shell.swaps.hidden = true;
          shell.strengthGrid.replaceChildren();
          fillHelpPanel(shell.helpPanel, [
            "This contest has no bench: all rostered players occupy scoring slots and the lineup never changes.",
            "The optimizer is skipped here \u2014 there is no swap it could recommend."
          ]);
          lastSignature = signature;
          return;
        }
        const actualSchedule = isScheduleDisplaySelected();
        if (viewState.showSchedule !== actualSchedule) {
          updateState({ showSchedule: actualSchedule });
          renderToolbarState();
        }
        const reuse = networkCache && networkCache.signature === signature ? networkCache : void 0;
        if (!reuse) {
          void chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.ensureFreshProjections,
            periods: ["WEEKLY", "MON_THU", "FRI_SUN", "ROS"],
            maxAgeMinutes: force ? 0 : ON_DEMAND_FRESHNESS_MINUTES
          }).then((response) => {
            const refreshed = response?.payload?.refreshed;
            if (Array.isArray(refreshed) && refreshed.length > 0 && !force) {
              void refresh(false, true);
            }
          }).catch((error) => console.warn("[NFBC] projection refresh failed", error));
        }
        const periodLabel = periodLabelFromPage2();
        const [settings, store, syncMeta, leagueMap, engineMeta] = await Promise.all([
          getSettings(),
          loadLineupStore(periodLabel),
          getSyncMeta(),
          getLeagueMap(),
          getEngineMeta()
        ]);
        const leagueId = currentLeagueId();
        const teamId = (leagueId ? leagueMap[leagueId]?.teamId : void 0) ?? currentTeamId();
        const period = periodFromPage2();
        const rows = parseSetLineupRoster();
        const slots = parseSetLineupSlots(rows);
        const ilFlagsPromise = reuse ? void 0 : fetchFreshIlFlags(rows).then((v) => {
          mark("f_il");
          return v;
        });
        const hitterRiskPromise = reuse ? void 0 : fetchHitterRiskReport(rows).then((v) => {
          mark("f_risk");
          return v;
        });
        const playingTimePromise = reuse ? void 0 : fetchPlayingTimeTrends(rows).catch(() => /* @__PURE__ */ new Map());
        const activeRosterPromise = reuse ? void 0 : fetchActiveRosterNames(
          rows.map((row) => row.normalizedTeam).filter((team) => Boolean(team))
        ).catch(() => /* @__PURE__ */ new Map());
        const rosterStatusPromise = reuse ? void 0 : fetchRosterStatusByTeam(
          rows.map((row) => row.normalizedTeam).filter((team) => Boolean(team))
        ).catch(() => /* @__PURE__ */ new Map());
        const matchupPromise = reuse ? void 0 : fetchHitterMatchups(rows, periodLabelFromPage2()).then((v) => {
          mark("f_matchup");
          return v;
        }).catch(() => /* @__PURE__ */ new Map());
        const leagueType = (leagueId ? leagueMap[leagueId]?.leagueType : void 0) ?? settings.defaultLeagueType;
        const profile = LEAGUE_PROFILES[leagueType];
        const projections = projectionsForLineupPeriod(store, period);
        const scoringPeriod = settings.currentScoringPeriodOverride ?? currentScoringPeriod2() ?? 1;
        const progress = scoringPeriod / settings.seasonTotalScoringPeriods;
        const contestLabel = currentContestLabel();
        const teamName = selectedTeamPieces().teamText;
        const dateLabels = actualSchedule ? scheduleDateLabels() : [];
        const canFetchStandings = Boolean(teamName) || Boolean(leagueId && teamId);
        console.info("[NFBC] refresh identity:", JSON.stringify({
          teamName: teamName ?? null,
          contestLabel: contestLabel ?? null,
          leagueId: leagueId ?? null,
          teamId: teamId ?? null,
          canFetchStandings,
          reuse: Boolean(reuse)
        }));
        const recoveredBundle = settledBundle?.signature === signature ? settledBundle.bundle : void 0;
        const standingsPromise = reuse ? Promise.resolve(reuse.contextBundle ?? recoveredBundle) : (canFetchStandings ? fetchStandingsContextBundle(leagueId ?? "", teamId ?? "", String(scoringPeriod), contestLabel, teamName) : Promise.resolve(void 0)).then((v) => {
          mark("f_standings");
          return v;
        });
        const [lineupBubbles, scheduleHands, ownStartConfirmations] = reuse ? [reuse.lineupBubbles, reuse.scheduleHands, reuse.ownStartConfirmations] : await Promise.all([
          fetchLineupBubbles(rows).then((v) => {
            mark("f_bubbles");
            return v;
          }),
          (dateLabels.length > 0 ? fetchScheduleHandIndicators(rows, dateLabels) : Promise.resolve(/* @__PURE__ */ new Map())).then((v) => {
            mark("f_hands");
            return v;
          }),
          (dateLabels.length > 0 ? fetchOwnStartConfirmations(rows, dateLabels) : Promise.resolve(/* @__PURE__ */ new Map())).then((v) => {
            mark("f_confirm");
            return v;
          })
        ]);
        const raced = reuse ? { settled: true, bundle: reuse.contextBundle ?? recoveredBundle } : await Promise.race([
          standingsPromise.catch(() => void 0).then((bundle) => ({ settled: true, bundle })),
          new Promise((resolve) => window.setTimeout(() => resolve({ settled: false, bundle: void 0 }), STANDINGS_GRACE_MS))
        ]);
        const standingsPending = !raced.settled;
        const contextBundle = raced.bundle;
        mark("contextReady");
        if (!reuse && !contextBundle) {
          const settle = /* @__PURE__ */ __name((bundle) => {
            if (pageSignature() !== signature) return;
            if (bundle && networkCache && networkCache.signature === signature) {
              networkCache.contextBundle = bundle;
            }
            if (bundle) {
              settledBundle = { signature, bundle };
            }
            void refresh(true, true);
          }, "settle");
          const usable = /* @__PURE__ */ __name((bundle) => Boolean(bundle?.contexts?.length), "usable");
          void standingsPromise.then(
            (bundle) => {
              if (usable(bundle) || standingsRetried) return settle(bundle);
              standingsRetried = true;
              window.setTimeout(() => {
                if (pageSignature() !== signature) return;
                void fetchStandingsContextBundle(leagueId ?? "", teamId ?? "", String(scoringPeriod), contestLabel, teamName).then((retryBundle) => settle(usable(retryBundle) ? retryBundle : bundle)).catch(() => settle(bundle));
              }, STANDINGS_RETRY_MS);
            },
            () => settle(void 0)
          );
        }
        mark("context");
        const activeRosters = reuse ? reuse.activeRosters : await activeRosterPromise;
        const rosterStatus = reuse ? reuse.rosterStatus : await rosterStatusPromise;
        const ilFlags = reuse ? reuse.ilFlags : await ilFlagsPromise.catch(() => /* @__PURE__ */ new Map());
        const matchups = reuse ? reuse.matchups : await matchupPromise;
        markMinorLeaguers(rows, activeRosters);
        markFreshIl(rows, ilFlags);
        markRosteredIl(rows, rosterStatus);
        mark("rosters");
        const hitterRisk = reuse ? reuse.hitterRisk : await hitterRiskPromise;
        const playingTime = reuse ? reuse.playingTime : await playingTimePromise;
        mark("risk");
        const newsImpacts = await fetchPlayerNewsImpacts().catch(() => /* @__PURE__ */ new Map());
        mark("news");
        annotatePlayerNews(newsImpacts);
        applyReturnNewsAvailability(rows, newsImpacts);
        const optimizerProjections = downweightConfirmedOut(
          applyNewsImpacts(projections, newsImpacts, Date.now(), store.ROS),
          rows,
          lineupBubbles,
          localDateIso4(/* @__PURE__ */ new Date()),
          hitterRisk.badgesByKey,
          playingTime
        );
        const freshnessPromise = buildProjectionFreshnessReport(period, projections, periodLabel);
        const contextSelection = selectOptimizationContext(contextBundle, progress);
        const decisionContexts = contextSelection.contexts;
        const result = optimizeLineup(rows, slots, optimizerProjections, profile, decisionContexts, progress);
        const comparisonResult = contextSelection.comparisonContexts?.length ? optimizeLineup(
          rows,
          slots,
          optimizerProjections,
          profile,
          contextSelection.comparisonContexts,
          progress
        ) : void 0;
        const rawResult = decisionContexts?.length ? optimizeLineup(rows, slots, optimizerProjections, profile, void 0, progress) : result;
        const activeOf = /* @__PURE__ */ __name((r) => {
          const keys = new Set(r.assignments.map((a) => a.playerKey));
          return r.scoredPlayers.filter((p) => keys.has(p.row.rowElementKey));
        }, "activeOf");
        const swapDrivers = contextSwapDrivers(activeOf(result), activeOf(rawResult), decisionContexts, progress, profile);
        mark("optimize");
        const changedRowKeys = new Set(result.changes.map((change) => change.playerKey));
        const changedDirections = new Map(result.changes.map((change) => [
          change.playerKey,
          change.to === "BN" ? "bench" : "start"
        ]));
        if (signature !== pageSignature()) {
          refreshQueued = true;
          refreshQueuedForce = true;
          refreshQueuedQuiet = false;
          lockStaleContext();
          return;
        }
        const renderedMenuLeagueId = selectedMenuLeagueId() ?? leagueId;
        void captureLineupDecision({
          scoredPlayers: result.scoredPlayers,
          assignments: result.assignments,
          leagueId: leagueId ?? "",
          teamId: teamId ?? "",
          period,
          scoringPeriod,
          firstGameDate: firstScheduleDateIso(dateLabels)
        }).catch((error) => console.warn("[NFBC] decision log not recorded", error));
        networkCache = {
          signature,
          hitterRisk,
          playingTime,
          activeRosters,
          rosterStatus,
          ilFlags,
          matchups,
          contextBundle,
          lineupBubbles,
          scheduleHands,
          ownStartConfirmations
        };
        pauseObserver(() => {
          annotateSetLineupRows(
            result.scoredPlayers,
            lineupBubbles,
            hitterRisk.badgesByKey,
            scheduleHands,
            dateLabels,
            changedRowKeys,
            changedDirections,
            ownStartConfirmations,
            // League gaps, not overall: the period's realistic target is the team
            // immediately above you in your own league.
            contextBundle?.league?.categories,
            progress
          );
          const sections = ensureRosterSections(viewState);
          if (sections) {
            sections.bench.toggle.onclick = () => {
              updateState({ benchCollapsed: !viewState.benchCollapsed });
              renderToolbarState();
              sections.bench.toggle.textContent = viewState.benchCollapsed ? "Expand" : "Collapse";
            };
            applyRosterSections(
              sections,
              rows,
              result.scoredPlayers,
              changedRowKeys,
              hitterRisk.badgesByKey,
              viewState
            );
          }
          tagNativeChrome();
          applyIlBadges(result.scoredPlayers, ilFlags);
        });
        if (matchups.size > 0) {
          void fetchPitcherWrcAllowedVsHand().then((splits) => {
            const chips = buildMatchupWrcChips(matchups, splits);
            if (chips.size > 0) {
              pauseObserver(() => applyMatchupWrcChips(result.scoredPlayers, chips));
            }
          }).catch(() => void 0);
        }
        await highlightSavedChanges(rows);
        lastBubbleLabels.clear();
        lineupBubbles.forEach((bubble, key) => lastBubbleLabels.set(key, bubble.label));
        startLineupPolling(rows, result.scoredPlayers);
        rosterCtx = { leagueId, teamId, contestLabel, periodLabel, leagueType };
        writeRosterCache(rows);
        rosterLineupSig = rosterLineupSignature();
        void setLineupPeriodMeta({
          anchorWeek: scoringPeriod,
          anchorMondayIso: localDateIso4(lineupPeriodStart(/* @__PURE__ */ new Date(), false)),
          capturedAt: (/* @__PURE__ */ new Date()).toISOString()
        }).catch(() => void 0);
        const pendingFreshness = {
          tone: "fresh",
          checkedTeams: 0,
          mismatchedTeams: [],
          summary: "Checking projection freshness..."
        };
        renderKpis(shell.metrics, result.currentTotal, result.optimizedTotal, pendingFreshness);
        renderSwaps(
          shell.swaps,
          result.changes,
          rawResult.changes,
          swapDrivers,
          rows,
          new Map(result.scoredPlayers.map((p) => [p.row.rowElementKey, p.contextualSGP ?? p.rawSGP])),
          new Map(rawResult.scoredPlayers.map((p) => [p.row.rowElementKey, p.rawSGP])),
          contextSelection.label,
          contextSelection.reason,
          result.warnings.find((warning) => warning.startsWith("Kept the current lineup:"))
        );
        if (comparisonResult && swapSignature(comparisonResult.changes) !== swapSignature(result.changes)) {
          const comparisonGroup = document.createElement("div");
          comparisonGroup.className = "nfbc-sl-swap-group";
          renderSwapSection(
            comparisonGroup,
            contextSelection.comparisonLabel ?? "League context comparison",
            `${contextSelection.comparisonReason ?? "Separate league-context result."} The Apply lineup button uses the primary overall-context recommendation.`,
            comparisonResult.changes,
            new Map(rows.map((row) => [row.rowElementKey, row.playerName])),
            new Map(comparisonResult.scoredPlayers.map((player) => [
              player.row.rowElementKey,
              player.contextualSGP ?? player.rawSGP
            ]))
          );
          shell.swaps.append(comparisonGroup);
        }
        const unmatchedActivePlayers = result.scoredPlayers.filter((player) => player.row.isActive && player.matchStatus === "unmatched");
        const projectionFreshness = `Projection feed ${describeSyncAge(syncMeta[period])} \xB7 Engine ${describeSyncAge(engineMeta.generatedAt, "built")}`;
        renderProjectionBlocker(shell.swaps, unmatchedActivePlayers, () => {
          projectionRematchSignature = signature;
          showToast("Refreshing projections and rematching players...", "info");
          void refresh(true);
        }, {
          rematchAttempted: projectionRematchSignature === signature,
          freshness: projectionFreshness
        });
        const haveNewPercentiles = Boolean(contextBundle?.overallPercentiles);
        const keepRenderedStrength = !haveNewPercentiles && renderedStrengthSignature === signature;
        if (!keepRenderedStrength) {
          renderStrengthGrid(shell.strengthGrid, contextBundle?.overallPercentiles, standingsPending);
          renderedStrengthSignature = haveNewPercentiles ? signature : void 0;
        }
        renderHealthNotes(shell.strengthGrid, checkSetLineupHealth({
          rowCount: rows.length,
          slotCount: slots.length,
          activeCount: result.scoredPlayers.filter((p) => p.row.isActive).length,
          unmatchedActiveCount: result.scoredPlayers.filter((p) => p.row.isActive && p.matchStatus === "unmatched").length,
          // Pending is not missing: claiming the ranking is unweighted while the
          // bundle is still in flight fires on every uncached load and then
          // silently contradicts itself when the re-render lands.
          standingsContextAvailable: standingsPending || Boolean(decisionContexts?.length),
          projectionCount: projections.length,
          activeRosterTeams: activeRosters.size,
          ilRosterTeams: rosterStatus.size,
          rosterTeams: new Set(rows.map((r) => r.normalizedTeam).filter(Boolean)).size
        }));
        const mountMs = Math.round(performance.now() - t0);
        console.info(`[NFBC] setlineup mounted in ${mountMs}ms`);
        document.documentElement.dataset.nfbcTiming = JSON.stringify({
          bootMs: Math.round(scriptStart),
          ...phase,
          mountMs,
          roster: { ...rosterWaitDetail }
        });
        const optSpid = 2 * scoringPeriod - (period === "MON_THU" ? 1 : 0);
        const scanOptions = {
          spid: optSpid,
          store,
          seasonProgress: progress,
          leagueMap,
          defaultLeagueType: settings.defaultLeagueType,
          pagePeriod: period,
          scoringPeriod,
          menuInfo: readTeamMenuInfo()
        };
        lastOptCounts = restoreTeamOptDisplay(String(optSpid), Object.keys(scanOptions.menuInfo));
        const reRender = /* @__PURE__ */ __name((counts) => {
          if (!reconcileTeamOptScan(
            counts,
            signature,
            pageSignature(),
            optSpid,
            renderedMenuLeagueId ? {
              leagueId: renderedMenuLeagueId,
              count: countSwaps(result.changes),
              swapText: describeSwaps(result.changes, rows)
            } : void 0
          )) return false;
          lastOptCounts = counts;
          renderTeamMenuOptIndicators(lastOptCounts, currentTeamOptSwaps());
          return true;
        }, "reRender");
        const handleTeamActionError = /* @__PURE__ */ __name((action, error) => {
          if (recoverInvalidatedContext(error)) {
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          showToast(`${action} failed: ${message}`, "error");
        }, "handleTeamActionError");
        renderTeamMenuActionBar({
          onRefresh: /* @__PURE__ */ __name((button) => {
            const orig = button.dataset.label ?? button.textContent ?? "";
            button.disabled = true;
            button.textContent = "Refreshing\u2026";
            scanTeamOptimizations(scanOptions, true).then((counts) => {
              if (reRender(counts)) showToast("Team optimization indicators refreshed.", "info");
            }).catch((error) => handleTeamActionError("Refresh", error)).finally(() => {
              button.disabled = false;
              button.textContent = orig;
            });
          }, "onRefresh"),
          onOptimizeAll: /* @__PURE__ */ __name((button) => {
            const orig = button.dataset.label ?? button.textContent ?? "";
            button.disabled = true;
            button.textContent = "Optimizing\u2026";
            optimizeAndSaveAllTeams(scanOptions, (p) => {
              button.textContent = `Saving ${p.index + 1}/${p.total}\u2026`;
            }).then((res) => {
              showToast(res.savedTeams > 0 ? `Optimize All: saved ${res.savedTeams} team${res.savedTeams === 1 ? "" : "s"}.` : "Optimize All: every lineup was already optimal.", "success");
            }).catch((error) => handleTeamActionError("Optimize All", error)).finally(() => {
              button.disabled = false;
              button.textContent = orig;
            });
          }, "onOptimizeAll")
        });
        if (renderedMenuLeagueId) {
          const liveCount = countSwaps(result.changes);
          setTeamOptCount(
            renderedMenuLeagueId,
            liveCount,
            String(optSpid),
            describeSwaps(result.changes, rows)
          );
          lastOptCounts.set(renderedMenuLeagueId, liveCount);
          renderTeamMenuOptIndicators(lastOptCounts, currentTeamOptSwaps());
        }
        void scanTeamOptimizations(
          scanOptions,
          // only refetch the bulk view on a loud refresh (week change / Refresh
          // press); a quiet swap re-optimize reuses the cache and just overrides
          // the selected team's count below
          force && !quiet
        ).then(reRender).catch((error) => {
          if (!recoverInvalidatedContext(error)) {
            console.warn("[NFBC] team-menu optimization scan failed", error);
          }
        });
        const roleRiskSummary = hitterRisk.summaryLines.length > 0 ? hitterRisk.summaryLines.join(" \xB7 ") : "No current hitter role-risk flags";
        void freshnessPromise.then((freshness) => {
          renderKpis(shell.metrics, result.currentTotal, result.optimizedTotal, freshness);
          fillHelpPanel(shell.helpPanel, helpLines(freshness.summary, roleRiskSummary, result.warnings));
        }).catch(() => void 0);
        fillHelpPanel(shell.helpPanel, helpLines("Checking projection freshness...", roleRiskSummary, result.warnings));
        const stalePeriods = [];
        const periodsToCheck = period === "WEEKLY" ? ["WEEKLY"] : ["WEEKLY", period];
        for (const checkPeriod of periodsToCheck) {
          if (isProjectionStale(syncMeta[checkPeriod])) {
            stalePeriods.push(checkPeriod);
          }
        }
        const engineStale = engineMeta.generatedAt != null && isProjectionStale(engineMeta.generatedAt, STALE_ENGINE_DATA_HOURS);
        const engineWarning = engineStale ? `ENGINE DATA ${describeSyncAge(engineMeta.generatedAt, "built")} \u2014 run refresh_all | ` : "";
        const stalePrefix = stalePeriods.length > 0 ? `STALE: ${stalePeriods.map((p) => `${p} ${describeSyncAge(syncMeta[p])}`).join(", ")} | ` : "";
        const standingsBanner = standingsBannerState({
          canFetch: canFetchStandings,
          pending: standingsPending,
          hasBundle: Boolean(contextBundle),
          warningCount: contextBundle?.warnings.length ?? 0,
          // The endpoints answered for this contest -- some other team's fetch
          // proved it -- so a missing bundle here is about THIS team, not the feed.
          teamUnresolved: Boolean(settledBundle) || renderedStrengthSignature != null
        });
        const standingsFailed = standingsBanner === "down";
        const standingsPartial = standingsBanner === "partial";
        const standingsUnresolved = standingsBanner === "unresolved";
        const missingHalves = (contextBundle?.warnings ?? []).map((warning) => warning.startsWith("League") ? "league" : warning.startsWith("Overall") ? "overall" : "context").filter((half, index, all) => all.indexOf(half) === index).join(" + ");
        const standingsPrefix = standingsFailed ? "STANDINGS FEED DOWN | " : standingsUnresolved ? "STANDINGS: TEAM NOT FOUND | " : standingsPartial ? `STANDINGS PARTIAL: no ${missingHalves} | ` : "";
        shell.subtitle.textContent = `${engineWarning}${stalePrefix}${standingsPrefix}${periodLabel || period} | ${result.changes.length} change${result.changes.length === 1 ? "" : "s"} available | ${actualSchedule ? "Schedule view" : "Standard view"}`;
        shell.subtitle.dataset.stale = stalePeriods.length > 0 || engineStale || standingsFailed ? "true" : "false";
        if (stalePeriods.length > 0) {
          showToast(`Projections are stale (${stalePeriods.join(", ")}). Open extension options to re-sync.`, "error");
        } else if (engineStale && engineMeta.generatedAt) {
          showToast(`Engine data was ${describeSyncAge(engineMeta.generatedAt, "built")} \u2014 the daily refresh may have failed.`, "error");
        } else if (standingsFailed) {
          showToast("Standings context unavailable \u2014 the NFC live feed may have changed shape.", "error");
        } else if (standingsPartial) {
          showToast(`No ${missingHalves} standings; needs-aware ranking is using what arrived.`, "error");
        }
        const applyLabel = result.changes.length > 0 ? `Apply ${result.changes.length} change${result.changes.length === 1 ? "" : "s"}` : result.warnings.some((warning) => warning.startsWith("Kept the current lineup:")) ? "Optimization needs review" : "Lineup optimized";
        const readyLabel = unmatchedActivePlayers.length > 0 ? `Resolve ${unmatchedActivePlayers.length} projection ${unmatchedActivePlayers.length === 1 ? "gap" : "gaps"}` : applyLabel;
        shell.optimizeButton.dataset.readyLabel = readyLabel;
        shell.optimizeButton.dataset.applyBlocked = String(unmatchedActivePlayers.length > 0 || result.changes.length === 0);
        shell.optimizeButton.textContent = readyLabel;
        shell.optimizeButton.disabled = unmatchedActivePlayers.length > 0 || result.changes.length === 0;
        shell.optimizeButton.title = unmatchedActivePlayers.length > 0 ? "Refresh and resolve every active player's projection before applying changes." : result.changes.length === 0 ? "No lineup changes are recommended." : `Review and confirm ${result.changes.length} lineup changes before NFBC saves them.`;
        shell.optimizeButton.onclick = () => {
          const saveAssignments = result.assignments.map((assignment) => ({
            playerKey: assignment.playerKey,
            slotId: assignment.slotId.startsWith("OF-") ? "OF" : assignment.slotId
          }));
          const orderedRows = orderSavedRosterByProjection(rows, saveAssignments, result.scoredPlayers);
          const saveDiff = buildSetLineupSaveDiff(rows, saveAssignments, orderedRows);
          const displaySlot = /* @__PURE__ */ __name((slot) => slot === "Bench" ? "BN" : slot, "displaySlot");
          const pendingLines = saveDiff.mutations.map((mutation) => mutation.kind === "slot" ? `Move ${mutation.playerName}: ${displaySlot(mutation.fromSlot)} \u2192 ${displaySlot(mutation.toSlot)}` : `Reorder ${mutation.playerName} within ${displaySlot(mutation.toSlot)}: save position ${mutation.fromIndex + 1} \u2192 ${mutation.toIndex + 1}`);
          const confirmed = window.confirm(
            `NFBC will save ${saveDiff.mutations.length} pending lineup ${saveDiff.mutations.length === 1 ? "mutation" : "mutations"}:

${pendingLines.map((line) => `\u2022 ${line}`).join("\n")}

This is the complete serialized save diff. Continue and reload the page?`
          );
          if (!confirmed) return;
          void saveSetLineup(
            orderedRows,
            saveAssignments
          ).catch((error) => {
            showToast(String(error), "error");
          });
        };
        lastSignature = signature;
      } catch (error) {
        if (recoverInvalidatedContext(error)) {
          return;
        }
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        shell.subtitle.textContent = `Load failed | ${message}`;
        shell.metrics.replaceChildren();
        shell.swaps.replaceChildren();
        shell.swaps.hidden = true;
        shell.strengthGrid.replaceChildren();
        fillHelpPanel(shell.helpPanel, [message]);
        console.error("NFBC setlineup refresh failed", error);
      } finally {
        if (!contextInvalidated && !quiet) {
          setPanelBusy(shell, false, {
            optimize: shell.optimizeButton.dataset.readyLabel ?? "Apply lineup",
            refresh: "Refresh"
          });
          shell.optimizeButton.disabled = shell.optimizeButton.dataset.applyBlocked === "true";
        }
        refreshInFlight = false;
        if (!contextInvalidated && refreshQueued) {
          refreshQueued = false;
          const queuedForce = refreshQueuedForce;
          refreshQueuedForce = false;
          const queuedQuiet = refreshQueuedQuiet;
          refreshQueuedQuiet = true;
          window.setTimeout(() => {
            void refresh(queuedForce, queuedQuiet);
          }, 0);
        }
      }
    }, "refresh");
    shell.refreshButton.onclick = () => {
      void (async () => {
        const settings = await getSettings();
        const urls = configuredProjectionUrls(settings.projectionSources.WEEKLY);
        if (urls.length === 0) throw new Error("No engine projection URL is configured");
        const response = await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.syncProjectionUrl,
          period: "WEEKLY",
          url: urls[0],
          urls
        });
        if (!response?.ok) {
          throw new Error(response?.error ?? "Projection sync did not complete");
        }
        showToast(`Projection data synced (${response.payload?.count ?? 0} weekly rows).`, "success");
      })().catch((error) => {
        if (recoverInvalidatedContext(error)) {
          return;
        }
        console.warn("[NFBC] explicit projection refresh failed", error);
        showToast(`Projection refresh failed: ${String(error)}`, "error");
      }).finally(() => {
        if (!contextInvalidated) {
          networkCache = void 0;
          void refresh(true);
        }
      });
    };
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (!Array.from(target.options).some((option) => /Week\s+\d+/i.test(option.textContent ?? ""))) return;
      const next = target.selectedOptions[0]?.textContent?.trim() || "selected week";
      lockStaleContext(next);
      scheduleRefresh(true);
    }, true);
    scheduleDisplaySelect()?.addEventListener("change", () => {
      rememberNonScheduleDisplay();
      scheduleRefresh(true);
    });
    const ensureMenuObserved = /* @__PURE__ */ __name(() => {
      if (contextInvalidated) {
        return;
      }
      const root = selectedTeamRow()?.closest("table") ?? void 0;
      if (!root || root === observedMenuRoot) {
        return;
      }
      menuObserver?.disconnect();
      menuObserver = new MutationObserver(() => {
        if (pageSignature() !== lastSignature) {
          scheduleRefresh();
        }
      });
      menuObserver.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"]
      });
      observedMenuRoot = root;
    }, "ensureMenuObserved");
    pageObserver = new MutationObserver(() => {
      if (contextInvalidated) {
        return;
      }
      if (pageSignature() !== lastSignature) {
        scheduleRefresh();
      }
      ensureMenuObserved();
      maybeRecacheRoster();
      if (lastOptCounts.size > 0) {
        renderTeamMenuOptIndicators(lastOptCounts, currentTeamOptSwaps());
      }
    });
    pageObserver.observe(pageObservationRoot2(), OBSERVER_CONFIG);
    ensureMenuObserved();
    await refresh(true);
  }
  __name(runSetLineupPage, "runSetLineupPage");

  // src/bookmarklet/setlineup.ts
  installChromeShim();
  var BANNER_ID = "nfbc-bookmarklet-banner";
  function banner(message, tone = "info") {
    let node = document.getElementById(BANNER_ID);
    if (!node) {
      node = document.createElement("div");
      node.id = BANNER_ID;
      node.style.cssText = [
        "position:fixed",
        "top:0",
        "left:0",
        "right:0",
        "z-index:2147483647",
        "padding:6px 12px",
        "font:600 13px/1.4 system-ui,sans-serif",
        "text-align:center",
        "color:#fff"
      ].join(";");
      document.body.append(node);
    }
    node.style.background = tone === "error" ? "#b91c1c" : "#1d4ed8";
    node.textContent = message;
  }
  __name(banner, "banner");
  function dismissBanner(afterMs) {
    window.setTimeout(() => document.getElementById(BANNER_ID)?.remove(), afterMs);
  }
  __name(dismissBanner, "dismissBanner");
  async function seedProjections() {
    const response = await fetch(GITHUB_PROJECTIONS_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`projection fetch failed: HTTP ${response.status}`);
    }
    const text2 = await response.text();
    if (!isEngineDocument(text2)) {
      throw new Error("published file is not an engine document");
    }
    const byPeriod = parseEngineDocument(text2);
    const store = {
      WEEKLY: byPeriod.WEEKLY ?? [],
      MON_THU: byPeriod.MON_THU ?? [],
      FRI_SUN: byPeriod.FRI_SUN ?? [],
      ROS: byPeriod.ROS ?? []
    };
    await setProjectionStore(store);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const period of Object.keys(store)) {
      await setSyncMeta(period, now);
    }
    const generatedAt = (() => {
      try {
        const parsed = JSON.parse(text2);
        return typeof parsed.generated_at === "string" ? parsed.generated_at : void 0;
      } catch {
        return void 0;
      }
    })();
    await setEngineMeta({ generatedAt, fetchedAt: now });
    return store.WEEKLY.length;
  }
  __name(seedProjections, "seedProjections");
  function extensionAlreadyActive() {
    return document.body.hasAttribute("data-nfbc-ext-readability") || document.getElementById("nfbc-setlineup-shell") != null || document.getElementById("nfbc-extension-panel") != null;
  }
  __name(extensionAlreadyActive, "extensionAlreadyActive");
  async function main() {
    if (extensionAlreadyActive()) {
      banner("NFBC extension is already running here \u2014 bookmarklet not needed");
      dismissBanner(6e3);
      return;
    }
    try {
      banner("NFBC: fetching projections\u2026");
      const count = await seedProjections();
      banner(`NFBC: ${count} weekly projections loaded \u2014 optimizing\u2026`);
      if (window.location.href.includes("/setlineupall")) {
        await runSetLineupAllPage();
      } else {
        await runSetLineupPage();
        mountLineupRater();
      }
      banner("NFBC: ready");
      dismissBanner(2500);
    } catch (error) {
      banner(`NFBC bookmarklet failed: ${String(error)}`, "error");
      dismissBanner(12e3);
      console.error("[NFBC] bookmarklet", error);
    }
  }
  __name(main, "main");
  void main();
})();
