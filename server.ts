import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BRAWL_PROXY_BASE = "https://bsproxy.royaleapi.dev/v1";
const PORT = 3000;

function normalizeAndValidateTag(rawTag: unknown): string | null {
  if (typeof rawTag !== "string") {
    return null;
  }

  const cleaned = rawTag
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!/^[A-Z0-9]{2,16}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function mapUpstreamError(status: number, fallbackMessage?: string) {
  switch (status) {
    case 400:
      return {
        status: 400,
        error: "Tag joueur invalide selon l'API Brawl Stars.",
      };
    case 403:
      return {
        status: 403,
        error:
          "Accès refusé par l'API Brawl Stars (403). Vérifiez que BRAWL_API_KEY est valide et autorise l'IP 45.79.218.79.",
      };
    case 404:
      return {
        status: 404,
        error: "Joueur introuvable. Vérifiez le tag saisi et réessayez.",
      };
    case 429:
      return {
        status: 429,
        error:
          "Quota de requêtes dépassé auprès de l'API Brawl Stars (429). Patientez quelques secondes.",
      };
    case 503:
      return {
        status: 503,
        error:
          "Les serveurs Brawl Stars sont actuellement en maintenance (503). Réessayez plus tard.",
      };
    default:
      return {
        status: status >= 500 ? 502 : status,
        error:
          fallbackMessage ||
          `Erreur inattendue de l'API Brawl Stars (HTTP ${status}).`,
      };
  }
}

async function startServer() {
  const app = express();

  app.use("/api/player", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/api/player", async (req, res) => {
    const apiKey = process.env.BRAWL_API_KEY?.trim();
    if (!apiKey) {
      res.status(500).json({
        error:
          "Configuration serveur incomplète : la variable d'environnement secrète BRAWL_API_KEY est manquante.",
      });
      return;
    }

    const cleanTag = normalizeAndValidateTag(req.query.tag);
    if (!cleanTag) {
      res.status(400).json({
        error:
          "Tag joueur manquant ou invalide. Saisissez entre 2 et 16 caractères alphanumériques (ex: #2PP).",
      });
      return;
    }

    const encodedTag = `%23${encodeURIComponent(cleanTag)}`;
    const profileUrl = `${BRAWL_PROXY_BASE}/players/${encodedTag}`;
    const battlelogUrl = `${BRAWL_PROXY_BASE}/players/${encodedTag}/battlelog`;

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    };

    try {
      const [profileRes, battlelogRes] = await Promise.all([
        fetch(profileUrl, { headers }),
        fetch(battlelogUrl, { headers }),
      ]);

      if (!profileRes.ok) {
        let upstreamReason = "";
        try {
          const errBody = (await profileRes.json()) as {
            message?: string;
            reason?: string;
          };
          upstreamReason = errBody?.message || errBody?.reason || "";
        } catch {
          // Ignorer si la réponse n'est pas en JSON
        }
        const mapped = mapUpstreamError(profileRes.status, upstreamReason);
        res.status(mapped.status).json({ error: mapped.error });
        return;
      }

      const profileData = await profileRes.json();

      let battlelogItems: unknown[] = [];
      if (battlelogRes.ok) {
        const battlelogData = (await battlelogRes.json()) as {
          items?: unknown[];
        };
        battlelogItems = Array.isArray(battlelogData?.items)
          ? battlelogData.items
          : [];
      } else if (battlelogRes.status === 403 || battlelogRes.status === 429) {
        const mapped = mapUpstreamError(battlelogRes.status);
        res.status(mapped.status).json({ error: mapped.error });
        return;
      }

      res.setHeader("Cache-Control", "public, max-age=30");
      res.status(200).json({
        profile: profileData,
        battlelog: battlelogItems,
      });
    } catch {
      res.status(502).json({
        error:
          "Impossible de joindre le proxy Brawl Stars (bsproxy.royaleapi.dev). Vérifiez votre connexion ou réessayez.",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
