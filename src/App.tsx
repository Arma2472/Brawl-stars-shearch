/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Search, Trophy, Users } from "lucide-react";

interface BrawlerItem {
  id: number;
  name: string;
  power: number;
  rank: number;
  trophies: number;
  highestTrophies: number;
  starPowers?: Array<{ id: number; name: string }>;
  gadgets?: Array<{ id: number; name: string }>;
}

interface PlayerProfile {
  tag: string;
  name: string;
  nameColor?: string;
  icon?: { id: number };
  trophies: number;
  highestTrophies: number;
  expLevel?: number;
  "3vs3Victories"?: number;
  soloVictories?: number;
  duoVictories?: number;
  club?: { tag?: string; name?: string };
  brawlers?: BrawlerItem[];
}

interface BattleParticipant {
  tag?: string;
  name?: string;
  brawler?: {
    id: number;
    name: string;
    power?: number;
    trophies?: number;
  };
}

interface BattleLogEntry {
  battleTime?: string;
  event?: {
    id?: number;
    mode?: string;
    map?: string;
  };
  battle?: {
    mode?: string;
    type?: string;
    result?: "victory" | "defeat" | "draw";
    rank?: number;
    trophyChange?: number;
    starPlayer?: BattleParticipant;
    teams?: BattleParticipant[][];
    players?: BattleParticipant[];
  };
}

const MODE_LABELS: Record<string, string> = {
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

function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function formatNumber(value?: number): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString("fr-FR") : "0";
}

function parseBrawlColor(rawColor?: string): string {
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

function formatModeName(mode?: string): string {
  if (!mode) return "Mode inconnu";
  if (MODE_LABELS[mode]) return MODE_LABELS[mode];
  return mode
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function findPlayedBrawler(
  battle: BattleLogEntry["battle"],
  playerTag?: string
) {
  if (!battle || !playerTag) return null;
  const target = `#${normalizeTag(playerTag)}`;

  if (Array.isArray(battle.teams)) {
    for (const team of battle.teams) {
      if (!Array.isArray(team)) continue;
      for (const p of team) {
        if (p?.tag && `#${normalizeTag(p.tag)}` === target) {
          return p.brawler ?? null;
        }
      }
    }
  }

  if (Array.isArray(battle.players)) {
    for (const p of battle.players) {
      if (p?.tag && `#${normalizeTag(p.tag)}` === target) {
        return p.brawler ?? null;
      }
    }
  }

  if (
    battle.starPlayer?.tag &&
    `#${normalizeTag(battle.starPlayer.tag)}` === target
  ) {
    return battle.starPlayer.brawler ?? null;
  }

  return null;
}

function classifyOutcome(battle?: BattleLogEntry["battle"]): {
  kind: "victory" | "defeat" | "draw";
  label: string;
} {
  if (!battle) return { kind: "draw", label: "Terminée" };
  if (battle.result === "victory") {
    return { kind: "victory", label: "Victoire" };
  }
  if (battle.result === "defeat") {
    return { kind: "defeat", label: "Défaite" };
  }
  if (battle.result === "draw") {
    return { kind: "draw", label: "Égalité" };
  }

  const rank = Number(battle.rank);
  if (Number.isFinite(rank) && rank > 0) {
    const mode = String(battle.mode || "").toLowerCase();
    const isTop = mode.includes("duo") ? rank <= 2 : rank <= 4;
    return {
      kind: isTop ? "victory" : "defeat",
      label: `${isTop ? "Victoire" : "Défaite"} · Top ${rank}`,
    };
  }

  return { kind: "draw", label: "Terminée" };
}

export default function App() {
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [battlelog, setBattlelog] = useState<BattleLogEntry[]>([]);
  const [battleFilter, setBattleFilter] = useState<"all" | "victory" | "defeat">(
    "all"
  );
  const [brawlerQuery, setBrawlerQuery] = useState("");
  const [brawlerSort, setBrawlerSort] = useState<
    "trophies" | "power" | "rank" | "name"
  >("trophies");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [failedThumbIds, setFailedThumbIds] = useState<Record<number, boolean>>(
    {}
  );

  const inputRef = useRef<HTMLInputElement>(null);

  async function searchPlayer(rawTag: string) {
    const clean = normalizeTag(rawTag);
    if (!/^[A-Z0-9]{2,16}$/.test(clean)) {
      setError(
        "Tag joueur invalide. Saisissez 2 à 16 caractères alphanumériques (ex: #2PP)."
      );
      return;
    }

    setTagInput(clean);
    setError(null);
    setLoading(true);
    setAvatarFailed(false);

    try {
      const response = await fetch(
        `/api/player?tag=${encodeURIComponent(clean)}`
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Erreur serveur (HTTP ${response.status}) lors de la récupération du profil.`
        );
      }

      if (!data?.profile) {
        throw new Error("Réponse API invalide : profil manquant.");
      }

      setProfile(data.profile);
      setBattlelog(
        Array.isArray(data.battlelog)
          ? data.battlelog
          : data.battlelog?.items ?? []
      );

      const url = new URL(window.location.href);
      url.searchParams.set("tag", clean);
      window.history.replaceState({}, "", url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Une erreur réseau est survenue lors du chargement."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialTag = new URLSearchParams(window.location.search).get("tag");
    if (initialTag) {
      searchPlayer(initialTag);
    }
  }, []);

  const recentMatches = useMemo(() => {
    return battlelog.slice(0, 10).map((entry) => {
      const outcome = classifyOutcome(entry.battle);
      const playedBrawler = findPlayedBrawler(entry.battle, profile?.tag);
      return { entry, outcome, playedBrawler };
    });
  }, [battlelog, profile?.tag]);

  const winsCount = useMemo(
    () => recentMatches.filter((m) => m.outcome.kind === "victory").length,
    [recentMatches]
  );

  const filteredMatches = useMemo(() => {
    if (battleFilter === "all") return recentMatches;
    return recentMatches.filter((m) => m.outcome.kind === battleFilter);
  }, [recentMatches, battleFilter]);

  const sortedBrawlers = useMemo(() => {
    const list = Array.isArray(profile?.brawlers) ? [...profile.brawlers] : [];
    const q = brawlerQuery.trim().toLowerCase();
    const filtered = list.filter((b) =>
      b.name.toLowerCase().includes(q)
    );

    filtered.sort((a, b) => {
      switch (brawlerSort) {
        case "power":
          return b.power - a.power || b.trophies - a.trophies;
        case "rank":
          return b.rank - a.rank || b.trophies - a.trophies;
        case "name":
          return a.name.localeCompare(b.name, "fr");
        case "trophies":
        default:
          return b.trophies - a.trophies || b.highestTrophies - a.highestTrophies;
      }
    });

    return filtered;
  }, [profile?.brawlers, brawlerQuery, brawlerSort]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchPlayer(tagInput);
  };

  const focusSearch = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-slate-100">
      <header className="sticky top-0 z-20 bg-[#0B0F17]/90 backdrop-blur-md border-b border-slate-400/15">
        <div className="max-w-[1180px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            BrawlStats
          </a>

          <nav
            aria-label="Navigation principale"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
          >
            <a
              href="#profil"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Profil
            </a>
            <a
              href="#historique"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Historique
            </a>
            <a
              href="#brawlers"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Brawlers
            </a>
          </nav>

          <button
            type="button"
            onClick={focusSearch}
            className="px-4 py-2 rounded-lg border border-slate-400/25 bg-[#121826] hover:bg-[#172033] text-xs font-semibold text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Rechercher un tag
          </button>
        </div>
      </header>

      <main
        id="top"
        className="flex-1 w-full max-w-[1180px] mx-auto px-6 pt-10 pb-16"
      >
        <section className="pb-8 border-b border-slate-400/15">
          <div className="max-w-2xl mb-6">
            <h1 className="font-display text-[clamp(1.75rem,3.2vw,2.5rem)] font-bold leading-tight tracking-tight text-balance mb-2.5">
              Statistiques de joueur Brawl Stars
            </h1>
            <p className="text-[15px] text-slate-400">
              Consultez les trophées, le club, les brawlers débloqués et les 10
              dernières parties à partir d&apos;un tag joueur officiel.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col sm:flex-row gap-3 max-w-[620px]"
          >
            <label htmlFor="tag-input" className="sr-only">
              Tag joueur Brawl Stars
            </label>
            <div className="flex-1 flex items-center bg-[#0E1420] border border-slate-400/25 focus-within:border-amber-500 rounded-[10px] px-3.5 min-h-[46px] transition-colors">
              <span
                aria-hidden="true"
                className="font-mono text-base font-semibold text-slate-500 mr-2 select-none"
              >
                #
              </span>
              <input
                ref={inputRef}
                id="tag-input"
                name="tag"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                maxLength={18}
                placeholder="Entrez un tag joueur (ex: 2PP)"
                className="w-full bg-transparent border-0 outline-none text-slate-100 font-mono text-[15px] font-medium uppercase placeholder:normal-case placeholder:font-sans placeholder:text-slate-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="px-6 min-h-[46px] rounded-[10px] bg-amber-500 hover:bg-amber-400 disabled:opacity-65 text-[#0B0F17] text-sm font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:cursor-wait"
            >
              {loading ? "Chargement..." : "Rechercher"}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2 mt-3.5">
            <span className="text-[13px] text-slate-500">Exemples :</span>
            {["2PP", "8000", "99LY0P"].map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => searchPlayer(example)}
                className="px-2.5 py-1 rounded-md border border-slate-400/15 bg-[#121826] hover:bg-[#172033] hover:border-slate-400/30 text-xs font-mono font-medium text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
              >
                #{example}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-6 px-5 py-4 rounded-[10px] border border-red-500/35 bg-red-500/10 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-sm font-semibold text-red-300 mb-0.5">
                Impossible de charger les statistiques
              </strong>
              <p className="text-sm text-red-100">{error}</p>
            </div>
          </div>
        )}

        {!loading && !profile && (
          <section className="mt-10 py-12 px-6 rounded-[14px] border border-slate-400/15 bg-[#121826] text-center">
            <div className="w-13 h-13 mx-auto mb-4 rounded-xl border border-slate-400/15 bg-[#0B0F17] text-amber-500 flex items-center justify-center">
              <Search className="w-6 h-6" />
            </div>
            <h2 className="font-display text-lg font-bold mb-2">
              Prêt pour l&apos;analyse
            </h2>
            <p className="max-w-lg mx-auto text-sm text-slate-400">
              Saisissez le tag d&apos;un joueur (visible sous son icône de profil
              dans Brawl Stars, par exemple{" "}
              <code className="font-mono text-amber-400">#2PP</code>) pour
              afficher son palmarès complet et son historique récent.
            </p>
          </section>
        )}

        {loading && (
          <section
            aria-label="Chargement des statistiques"
            className="mt-8 space-y-5"
          >
            <div className="h-28 rounded-[14px] border border-slate-400/15 bg-[#121826] animate-pulse" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-22 rounded-[10px] border border-slate-400/15 bg-[#121826] animate-pulse"
                />
              ))}
            </div>
            <div className="h-72 rounded-[14px] border border-slate-400/15 bg-[#121826] animate-pulse" />
          </section>
        )}

        {!loading && profile && (
          <div className="mt-8 space-y-11">
            <section id="profil" aria-label="Profil joueur" className="space-y-6">
              <div className="flex items-center gap-5 p-5 sm:px-6 rounded-[14px] bg-[#121826] border border-slate-400/15">
                <div className="w-[72px] h-[72px] rounded-[14px] overflow-hidden shrink-0 bg-[#0B0F17] border border-slate-400/25 flex items-center justify-center">
                  {profile.icon?.id && !avatarFailed ? (
                    <img
                      src={`https://cdn.brawlify.com/profile-icons/regular/${profile.icon.id}.png`}
                      alt={`Icône de ${profile.name}`}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarFailed(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-display font-bold text-xl text-amber-500">
                      {profile.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <h2
                    className="font-display text-[clamp(1.4rem,2.5vw,1.9rem)] font-bold leading-tight mb-1.5 break-words"
                    style={{ color: parseBrawlColor(profile.nameColor) }}
                  >
                    {profile.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-400">
                    <span className="font-mono-tabular text-slate-100">
                      {profile.tag}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      {profile.club?.name || "Sans club"}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Niveau {formatNumber(profile.expLevel ?? 1)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
                <div className="p-4 sm:p-5 rounded-[10px] bg-[#121826] border border-slate-400/15 flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    Trophées actuels
                  </span>
                  <strong className="font-mono-tabular text-2xl font-bold text-amber-400">
                    {formatNumber(profile.trophies)}
                  </strong>
                </div>

                <div className="p-4 sm:p-5 rounded-[10px] bg-[#121826] border border-slate-400/15 flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-400">
                    Record de trophées
                  </span>
                  <strong className="font-mono-tabular text-2xl font-bold text-slate-100">
                    {formatNumber(profile.highestTrophies)}
                  </strong>
                </div>

                <div className="p-4 sm:p-5 rounded-[10px] bg-[#121826] border border-slate-400/15 flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-400">
                    Victoires 3v3
                  </span>
                  <strong className="font-mono-tabular text-2xl font-bold text-slate-100">
                    {formatNumber(profile["3vs3Victories"])}
                  </strong>
                </div>

                <div className="p-4 sm:p-5 rounded-[10px] bg-[#121826] border border-slate-400/15 flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-400">
                    Victoires Solo / Duo
                  </span>
                  <strong className="font-mono-tabular text-2xl font-bold text-slate-100">
                    {formatNumber(profile.soloVictories)} /{" "}
                    {formatNumber(profile.duoVictories)}
                  </strong>
                </div>

                <div className="p-4 sm:p-5 rounded-[10px] bg-[#121826] border border-slate-400/15 flex flex-col gap-1.5 col-span-2 lg:col-span-1">
                  <span className="text-xs font-medium text-slate-400">
                    Brawlers débloqués
                  </span>
                  <strong className="font-mono-tabular text-2xl font-bold text-slate-100">
                    {formatNumber(profile.brawlers?.length ?? 0)}
                  </strong>
                </div>
              </div>
            </section>

            <section
              id="historique"
              aria-labelledby="history-heading"
              className="pt-8 border-t border-slate-400/15"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                  <h2
                    id="history-heading"
                    className="font-display text-xl font-bold"
                  >
                    10 dernières parties
                  </h2>
                  <p className="mt-1 text-[13px] text-slate-400">
                    {recentMatches.length > 0
                      ? `${winsCount} victoire${
                          winsCount > 1 ? "s" : ""
                        } sur les ${recentMatches.length} dernières parties`
                      : "Aucune partie récente disponible"}
                  </p>
                </div>

                <div
                  role="group"
                  aria-label="Filtrer les parties"
                  className="inline-flex items-center gap-1 p-1 bg-[#121826] border border-slate-400/15 rounded-[9px]"
                >
                  {(
                    [
                      { key: "all", label: "Toutes" },
                      { key: "victory", label: "Victoires" },
                      { key: "defeat", label: "Défaites" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setBattleFilter(tab.key)}
                      className={`px-3.5 py-1.5 rounded-md text-[13px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                        battleFilter === tab.key
                          ? "bg-[#172033] text-slate-100"
                          : "text-slate-400 hover:text-slate-100"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredMatches.length > 0 ? (
                <div className="border border-slate-400/15 rounded-[14px] bg-[#121826] overflow-hidden divide-y divide-slate-400/15">
                  {filteredMatches.map(({ entry, outcome, playedBrawler }, i) => {
                    const delta = Number(entry.battle?.trophyChange ?? 0);
                    const bId = Number(playedBrawler?.id);
                    const showThumb =
                      Number.isInteger(bId) && bId > 0 && !failedThumbIds[bId];

                    return (
                      <div
                        key={`${entry.battleTime ?? "match"}-${i}`}
                        className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(180px,1.4fr)_minmax(160px,1.1fr)_130px_96px] items-center gap-3 md:gap-4 px-5 py-3.5 hover:bg-[#172033] transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="block text-sm font-semibold text-slate-100">
                            {formatModeName(
                              entry.event?.mode || entry.battle?.mode
                            )}
                          </span>
                          <span className="block text-[13px] text-slate-400 truncate">
                            {entry.event?.map || "Carte inconnue"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5 min-w-0 col-span-1">
                          {showThumb && (
                            <img
                              src={`https://cdn.brawlify.com/brawlers/borderless/${bId}.png`}
                              alt={playedBrawler?.name || "Brawler"}
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              onError={() =>
                                setFailedThumbIds((prev) => ({
                                  ...prev,
                                  [bId]: true,
                                }))
                              }
                              className="w-8.5 h-8.5 rounded-lg bg-[#0B0F17] border border-slate-400/15 object-cover shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-100 truncate">
                              {playedBrawler?.name || "Brawler"}
                            </div>
                            <div className="font-mono-tabular text-xs text-slate-500">
                              {playedBrawler?.power
                                ? `Pouvoir ${playedBrawler.power}`
                                : "Partie classée / amicale"}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-[13px] font-semibold md:text-right whitespace-nowrap ${
                            outcome.kind === "victory"
                              ? "text-emerald-400"
                              : outcome.kind === "defeat"
                                ? "text-red-400"
                                : "text-slate-400"
                          }`}
                        >
                          {outcome.label}
                        </span>

                        <span
                          className={`font-mono-tabular text-[13px] font-bold text-right whitespace-nowrap px-2.5 py-1 rounded-md ${
                            delta > 0
                              ? "text-emerald-400 bg-emerald-500/10"
                              : delta < 0
                                ? "text-red-400 bg-red-500/10"
                                : "text-slate-400 bg-slate-400/10"
                          }`}
                        >
                          {delta > 0
                            ? `+${delta} tr.`
                            : delta < 0
                              ? `${delta} tr.`
                              : "0 tr."}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-7 px-5 text-center text-sm text-slate-400 border border-slate-400/15 rounded-[10px] bg-[#121826]">
                  Aucune partie correspondante dans le journal récent.
                </p>
              )}
            </section>

            <section
              id="brawlers"
              aria-labelledby="brawlers-heading"
              className="pt-8 border-t border-slate-400/15"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                  <h2
                    id="brawlers-heading"
                    className="font-display text-xl font-bold"
                  >
                    Brawlers débloqués
                  </h2>
                  <p className="mt-1 text-[13px] text-slate-400">
                    {profile.brawlers?.length ?? 0} brawler
                    {(profile.brawlers?.length ?? 0) > 1 ? "s" : ""} débloqué
                    {(profile.brawlers?.length ?? 0) > 1 ? "s" : ""}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
                  <label htmlFor="brawler-filter" className="sr-only">
                    Filtrer par nom de brawler
                  </label>
                  <input
                    id="brawler-filter"
                    type="search"
                    value={brawlerQuery}
                    onChange={(e) => setBrawlerQuery(e.target.value)}
                    placeholder="Filtrer un brawler..."
                    className="h-[38px] px-3 rounded-lg border border-slate-400/25 bg-[#0E1420] text-slate-100 text-[13px] focus:outline-none focus:border-amber-500"
                  />

                  <label htmlFor="brawler-sort" className="sr-only">
                    Trier les brawlers
                  </label>
                  <select
                    id="brawler-sort"
                    value={brawlerSort}
                    onChange={(e) =>
                      setBrawlerSort(
                        e.target.value as "trophies" | "power" | "rank" | "name"
                      )
                    }
                    className="h-[38px] px-3 rounded-lg border border-slate-400/25 bg-[#0E1420] text-slate-100 text-[13px] focus:outline-none focus:border-amber-500"
                  >
                    <option value="trophies">Trier : Trophées</option>
                    <option value="power">Trier : Pouvoir</option>
                    <option value="rank">Trier : Rang</option>
                    <option value="name">Trier : Nom</option>
                  </select>
                </div>
              </div>

              {sortedBrawlers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                  {sortedBrawlers.map((brawler) => {
                    const showThumb = !failedThumbIds[brawler.id];
                    return (
                      <article
                        key={brawler.id}
                        className="flex items-center gap-3.5 px-4 py-3.5 rounded-[10px] bg-[#121826] border border-slate-400/15 hover:border-slate-400/30 hover:bg-[#172033] transition-colors"
                      >
                        {showThumb && (
                          <img
                            src={`https://cdn.brawlify.com/brawlers/borderless/${brawler.id}.png`}
                            alt={brawler.name}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            onError={() =>
                              setFailedThumbIds((prev) => ({
                                ...prev,
                                [brawler.id]: true,
                              }))
                            }
                            className="w-12 h-12 rounded-[10px] bg-[#0B0F17] border border-slate-400/15 object-cover shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2 mb-1">
                            <span className="text-sm font-semibold text-slate-100 truncate">
                              {brawler.name}
                            </span>
                            <span className="font-mono-tabular text-[13px] font-bold text-amber-400 whitespace-nowrap">
                              {formatNumber(brawler.trophies)} tr.
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 tabular-nums">
                            Niv. {brawler.power} · Rang {brawler.rank} ·{" "}
                            {brawler.starPowers?.length ?? 0} PS ·{" "}
                            {brawler.gadgets?.length ?? 0} Gad.
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="py-7 px-5 text-center text-sm text-slate-400 border border-slate-400/15 rounded-[10px] bg-[#121826]">
                  Aucun brawler ne correspond à votre filtre.
                </p>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-400/15 py-5 text-xs text-slate-500">
        <div className="max-w-[1180px] mx-auto px-6 flex flex-wrap justify-between gap-3">
          <span>
            BrawlStats — Données officielles Brawl Stars via proxy IP fixe
          </span>
          <span>Contenu non affilié à Supercell</span>
        </div>
      </footer>
    </div>
  );
}
