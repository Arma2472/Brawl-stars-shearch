/**
 * Configuration de l'URL de base de l'API :
 * - Laisser vide ("") si le frontend et la Function sont hébergés sur le même domaine Cloudflare Pages.
 * - Renseigner "https://<NOM_DU_PROJET>.pages.dev" si le frontend est déployé séparément sur GitHub Pages.
 */
const API_BASE_URL = "";

const MODE_LABELS = {
  gemGrab: "Razzia de gemmes",
  brawlBall: "Brawl Ball",
  bounty: "Prime",
  heist: "Braquage",
  hotZone: "Zone réservée",
  knockout: "Hors-jeu",
  soloShowdown: "Survivant Solo",
  duoShowdown: "Survivant Duo",
  trioShowdown: "Survivant Trio",
  duels: "Duels",
  wipeout: "Chasseurs",
  wipeout5V5: "Chasseurs 5v5",
  brawlBall5V5: "Brawl Ball 5v5",
  gemGrab5V5: "Razzia de gemmes 5v5",
  knockout5V5: "Hors-jeu 5v5",
  basketBrawl: "Basket Brawl",
  volleyBrawl: "Volley Brawl",
  roboRumble: "Robots à gogo",
  bossFight: "Combat de boss",
  bigGame: "Chasse au gros gibier",
  trophyEscape: "Fuite aux trophées",
  paintBrawl: "Paint Brawl",
};

const state = {
  profile: null,
  battlelog: [],
  battleFilter: "all",
  brawlerQuery: "",
  brawlerSort: "trophies",
};

const elements = {
  form: document.getElementById("search-form"),
  tagInput: document.getElementById("tag-input"),
  submitBtn: document.getElementById("search-submit"),
  focusSearchBtn: document.getElementById("focus-search-btn"),
  quickTagBtns: document.querySelectorAll(".quick-tag-btn"),
  errorBanner: document.getElementById("error-banner"),
  errorMessage: document.getElementById("error-message"),
  emptyState: document.getElementById("empty-state"),
  loadingState: document.getElementById("loading-state"),
  resultsView: document.getElementById("results-view"),
  profileIcon: document.getElementById("profile-icon"),
  profileIconFallback: document.getElementById("profile-icon-fallback"),
  playerName: document.getElementById("player-name"),
  playerTag: document.getElementById("player-tag"),
  playerClub: document.getElementById("player-club"),
  playerLevel: document.getElementById("player-level"),
  statTrophies: document.getElementById("stat-trophies"),
  statHighest: document.getElementById("stat-highest"),
  stat3v3: document.getElementById("stat-3v3"),
  statShowdown: document.getElementById("stat-showdown"),
  statBrawlers: document.getElementById("stat-brawlers"),
  historySummary: document.getElementById("history-summary"),
  battleFilterBtns: document.querySelectorAll("[data-battle-filter]"),
  battlelogList: document.getElementById("battlelog-list"),
  battlelogEmpty: document.getElementById("battlelog-empty"),
  brawlersSummary: document.getElementById("brawlers-summary"),
  brawlerFilter: document.getElementById("brawler-filter"),
  brawlerSort: document.getElementById("brawler-sort"),
  brawlersGrid: document.getElementById("brawlers-grid"),
  brawlersEmpty: document.getElementById("brawlers-empty"),
};

function formatNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString("fr-FR") : "0";
}

function normalizeTag(rawTag) {
  return String(rawTag || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function parseBrawlColor(rawColor) {
  if (typeof rawColor !== "string" || !/^0x[0-9a-fA-F]{8}$/.test(rawColor)) {
    return "#f1f5f9";
  }
  const hex = `#${rawColor.slice(4)}`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.25 ? "#f1f5f9" : hex;
}

function formatModeName(mode) {
  if (!mode) return "Mode inconnu";
  if (MODE_LABELS[mode]) return MODE_LABELS[mode];
  return mode
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function setViewState(view) {
  elements.emptyState.classList.toggle("hidden", view !== "empty");
  elements.loadingState.classList.toggle("hidden", view !== "loading");
  elements.resultsView.classList.toggle("hidden", view !== "results");
  elements.submitBtn.disabled = view === "loading";
  const label = elements.submitBtn.querySelector(".btn-label");
  if (label) {
    label.textContent = view === "loading" ? "Chargement..." : "Rechercher";
  }
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorBanner.classList.remove("hidden");
}

function clearError() {
  elements.errorBanner.classList.add("hidden");
  elements.errorMessage.textContent = "";
}

function findPlayedBrawler(battle, playerTag) {
  if (!battle) return null;
  const targetTag = `#${normalizeTag(playerTag)}`;

  if (Array.isArray(battle.teams)) {
    for (const team of battle.teams) {
      if (!Array.isArray(team)) continue;
      for (const participant of team) {
        if (
          participant?.tag &&
          `#${normalizeTag(participant.tag)}` === targetTag
        ) {
          return participant.brawler || null;
        }
      }
    }
  }

  if (Array.isArray(battle.players)) {
    for (const participant of battle.players) {
      if (
        participant?.tag &&
        `#${normalizeTag(participant.tag)}` === targetTag
      ) {
        return participant.brawler || null;
      }
    }
  }

  if (
    battle.starPlayer?.tag &&
    `#${normalizeTag(battle.starPlayer.tag)}` === targetTag
  ) {
    return battle.starPlayer.brawler || null;
  }

  return null;
}

function classifyBattleOutcome(battle) {
  const rawResult = battle?.result;
  if (rawResult === "victory") {
    return { kind: "victory", label: "Victoire" };
  }
  if (rawResult === "defeat") {
    return { kind: "defeat", label: "Défaite" };
  }
  if (rawResult === "draw") {
    return { kind: "draw", label: "Égalité" };
  }

  const rank = Number(battle?.rank);
  if (Number.isFinite(rank) && rank > 0) {
    const mode = String(battle?.mode || "").toLowerCase();
    const isTop = mode.includes("duo") ? rank <= 2 : rank <= 4;
    return {
      kind: isTop ? "victory" : "defeat",
      label: `${isTop ? "Victoire" : "Défaite"} · Top ${rank}`,
    };
  }

  return { kind: "draw", label: "Terminée" };
}

function renderProfile(profile) {
  const iconId = Number(profile?.icon?.id);
  elements.profileIconFallback.classList.add("hidden");
  elements.profileIcon.classList.remove("hidden");

  if (Number.isInteger(iconId) && iconId > 0) {
    elements.profileIcon.src = `https://cdn.brawlify.com/profile-icons/regular/${iconId}.png`;
    elements.profileIcon.alt = `Icône de ${profile.name || "joueur"}`;
    elements.profileIcon.onerror = () => {
      elements.profileIcon.classList.add("hidden");
      elements.profileIconFallback.textContent = (profile.name || "BS")
        .slice(0, 2)
        .toUpperCase();
      elements.profileIconFallback.classList.remove("hidden");
    };
  } else {
    elements.profileIcon.classList.add("hidden");
    elements.profileIconFallback.textContent = (profile.name || "BS")
      .slice(0, 2)
      .toUpperCase();
    elements.profileIconFallback.classList.remove("hidden");
  }

  elements.playerName.textContent = profile.name || "Joueur inconnu";
  elements.playerName.style.color = parseBrawlColor(profile.nameColor);

  elements.playerTag.textContent = profile.tag || "";
  elements.playerClub.textContent = profile.club?.name || "Sans club";
  elements.playerLevel.textContent = `Niveau ${formatNumber(
    profile.expLevel ?? 1
  )}`;

  elements.statTrophies.textContent = formatNumber(profile.trophies);
  elements.statHighest.textContent = formatNumber(profile.highestTrophies);
  elements.stat3v3.textContent = formatNumber(profile["3vs3Victories"]);

  const solo = Number(profile.soloVictories ?? 0);
  const duo = Number(profile.duoVictories ?? 0);
  elements.statShowdown.textContent = `${formatNumber(solo)} / ${formatNumber(
    duo
  )}`;

  const unlockedCount = Array.isArray(profile.brawlers)
    ? profile.brawlers.length
    : 0;
  elements.statBrawlers.textContent = formatNumber(unlockedCount);
}

function renderBattlelog() {
  const recentTen = state.battlelog.slice(0, 10);
  const mapped = recentTen.map((entry) => {
    const battle = entry?.battle || {};
    const outcome = classifyBattleOutcome(battle);
    return { entry, battle, outcome };
  });

  const winsCount = mapped.filter((m) => m.outcome.kind === "victory").length;
  elements.historySummary.textContent =
    recentTen.length > 0
      ? `${winsCount} victoire${winsCount > 1 ? "s" : ""} sur les ${
          recentTen.length
        } dernières parties`
      : "Aucune partie récente disponible";

  const filtered = mapped.filter((item) => {
    if (state.battleFilter === "all") return true;
    return item.outcome.kind === state.battleFilter;
  });

  elements.battlelogList.replaceChildren();

  if (filtered.length === 0) {
    elements.battlelogList.classList.add("hidden");
    elements.battlelogEmpty.classList.remove("hidden");
    return;
  }

  elements.battlelogList.classList.remove("hidden");
  elements.battlelogEmpty.classList.add("hidden");

  const fragment = document.createDocumentFragment();

  for (const { entry, battle, outcome } of filtered) {
    const row = document.createElement("div");
    row.className = "battle-row";

    const modeCol = document.createElement("div");
    modeCol.className = "battle-mode-col";

    const modeSpan = document.createElement("span");
    modeSpan.className = "battle-mode";
    modeSpan.textContent = formatModeName(entry?.event?.mode || battle.mode);

    const mapSpan = document.createElement("span");
    mapSpan.className = "battle-map";
    mapSpan.textContent = entry?.event?.map || "Carte inconnue";

    modeCol.append(modeSpan, mapSpan);

    const brawlerCol = document.createElement("div");
    brawlerCol.className = "battle-brawler-col";

    const playedBrawler = findPlayedBrawler(battle, state.profile?.tag);
    const brawlerId = Number(playedBrawler?.id);

    if (Number.isInteger(brawlerId) && brawlerId > 0) {
      const thumb = document.createElement("img");
      thumb.className = "brawler-mini-thumb";
      thumb.src = `https://cdn.brawlify.com/brawlers/borderless/${brawlerId}.png`;
      thumb.alt = playedBrawler?.name || "Brawler";
      thumb.referrerPolicy = "no-referrer";
      thumb.loading = "lazy";
      thumb.onerror = () => {
        thumb.style.display = "none";
      };
      brawlerCol.appendChild(thumb);
    }

    const brawlerTextWrap = document.createElement("div");
    const brawlerName = document.createElement("div");
    brawlerName.className = "battle-brawler-name";
    brawlerName.textContent = playedBrawler?.name || "Brawler";

    const brawlerPower = document.createElement("div");
    brawlerPower.className = "battle-brawler-power";
    brawlerPower.textContent = playedBrawler?.power
      ? `Pouvoir ${playedBrawler.power}`
      : "Partie classée / amicale";

    brawlerTextWrap.append(brawlerName, brawlerPower);
    brawlerCol.appendChild(brawlerTextWrap);

    const resultSpan = document.createElement("span");
    resultSpan.className = `battle-result is-${outcome.kind}`;
    resultSpan.textContent = outcome.label;

    const deltaSpan = document.createElement("span");
    const trophyChange = Number(battle.trophyChange);
    if (Number.isFinite(trophyChange) && trophyChange !== 0) {
      deltaSpan.className = `battle-delta ${
        trophyChange > 0 ? "is-positive" : "is-negative"
      }`;
      deltaSpan.textContent =
        trophyChange > 0 ? `+${trophyChange} tr.` : `${trophyChange} tr.`;
    } else {
      deltaSpan.className = "battle-delta is-neutral";
      deltaSpan.textContent = "0 tr.";
    }

    row.append(modeCol, brawlerCol, resultSpan, deltaSpan);
    fragment.appendChild(row);
  }

  elements.battlelogList.appendChild(fragment);
}

function renderBrawlers() {
  const list = Array.isArray(state.profile?.brawlers)
    ? [...state.profile.brawlers]
    : [];
  const query = state.brawlerQuery.trim().toLowerCase();

  const filtered = list.filter((brawler) =>
    String(brawler?.name || "")
      .toLowerCase()
      .includes(query)
  );

  filtered.sort((a, b) => {
    switch (state.brawlerSort) {
      case "power":
        return (
          (b.power ?? 0) - (a.power ?? 0) ||
          (b.trophies ?? 0) - (a.trophies ?? 0)
        );
      case "rank":
        return (
          (b.rank ?? 0) - (a.rank ?? 0) ||
          (b.trophies ?? 0) - (a.trophies ?? 0)
        );
      case "name":
        return String(a.name || "").localeCompare(String(b.name || ""), "fr");
      case "trophies":
      default:
        return (
          (b.trophies ?? 0) - (a.trophies ?? 0) ||
          (b.highestTrophies ?? 0) - (a.highestTrophies ?? 0)
        );
    }
  });

  elements.brawlersSummary.textContent = `${list.length} brawler${
    list.length > 1 ? "s" : ""
  } débloqué${list.length > 1 ? "s" : ""}`;

  elements.brawlersGrid.replaceChildren();

  if (filtered.length === 0) {
    elements.brawlersGrid.classList.add("hidden");
    elements.brawlersEmpty.classList.remove("hidden");
    return;
  }

  elements.brawlersGrid.classList.remove("hidden");
  elements.brawlersEmpty.classList.add("hidden");

  const fragment = document.createDocumentFragment();

  for (const brawler of filtered) {
    const card = document.createElement("article");
    card.className = "brawler-card";

    const brawlerId = Number(brawler?.id);
    if (Number.isInteger(brawlerId) && brawlerId > 0) {
      const img = document.createElement("img");
      img.className = "brawler-portrait";
      img.src = `https://cdn.brawlify.com/brawlers/borderless/${brawlerId}.png`;
      img.alt = brawler.name || "Brawler";
      img.referrerPolicy = "no-referrer";
      img.loading = "lazy";
      img.onerror = () => {
        img.style.display = "none";
      };
      card.appendChild(img);
    }

    const info = document.createElement("div");
    info.className = "brawler-info";

    const topLine = document.createElement("div");
    topLine.className = "brawler-top-line";

    const nameEl = document.createElement("span");
    nameEl.className = "brawler-name";
    nameEl.textContent = brawler.name || "Brawler";

    const trophiesEl = document.createElement("span");
    trophiesEl.className = "brawler-trophies";
    trophiesEl.textContent = `${formatNumber(brawler.trophies)} tr.`;

    topLine.append(nameEl, trophiesEl);

    const subMeta = document.createElement("div");
    subMeta.className = "brawler-sub-meta";
    const starPowersCount = Array.isArray(brawler.starPowers)
      ? brawler.starPowers.length
      : 0;
    const gadgetsCount = Array.isArray(brawler.gadgets)
      ? brawler.gadgets.length
      : 0;
    subMeta.textContent = `Niv. ${brawler.power ?? 1} · Rang ${
      brawler.rank ?? 1
    } · ${starPowersCount} PS · ${gadgetsCount} Gad.`;

    info.append(topLine, subMeta);
    card.appendChild(info);
    fragment.appendChild(card);
  }

  elements.brawlersGrid.appendChild(fragment);
}

async function fetchPlayerStats(rawTag) {
  const cleanTag = normalizeTag(rawTag);

  if (!/^[A-Z0-9]{2,16}$/.test(cleanTag)) {
    showError(
      "Tag joueur invalide. Saisissez 2 à 16 caractères alphanumériques (ex: #2PP)."
    );
    return;
  }

  elements.tagInput.value = cleanTag;
  clearError();
  setViewState("loading");

  const base = API_BASE_URL.replace(/\/+$/, "");
  const endpoint = `${base}/api/player?tag=${encodeURIComponent(cleanTag)}`;

  try {
    const response = await fetch(endpoint);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const msg =
        data?.error ||
        `Erreur serveur (HTTP ${response.status}) lors de la récupération du profil.`;
      throw new Error(msg);
    }

    if (!data?.profile) {
      throw new Error("Réponse API invalide : profil manquant.");
    }

    state.profile = data.profile;
    state.battlelog = Array.isArray(data.battlelog)
      ? data.battlelog
      : data.battlelog?.items || [];

    renderProfile(state.profile);
    renderBattlelog();
    renderBrawlers();
    setViewState("results");

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("tag", cleanTag);
    window.history.replaceState({}, "", nextUrl);
  } catch (err) {
    setViewState(state.profile ? "results" : "empty");
    showError(
      err?.message || "Une erreur réseau est survenue lors du chargement."
    );
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  fetchPlayerStats(elements.tagInput.value);
});

elements.quickTagBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tag = btn.dataset.tag || "";
    elements.tagInput.value = tag;
    fetchPlayerStats(tag);
  });
});

elements.focusSearchBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
  elements.tagInput.focus();
  elements.tagInput.select();
});

elements.battleFilterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.battleFilter = btn.dataset.battleFilter || "all";
    elements.battleFilterBtns.forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    renderBattlelog();
  });
});

elements.brawlerFilter.addEventListener("input", (event) => {
  state.brawlerQuery = event.target.value || "";
  renderBrawlers();
});

elements.brawlerSort.addEventListener("change", (event) => {
  state.brawlerSort = event.target.value || "trophies";
  renderBrawlers();
});

const initialTag = new URLSearchParams(window.location.search).get("tag");
if (initialTag) {
  elements.tagInput.value = normalizeTag(initialTag);
  fetchPlayerStats(initialTag);
}
