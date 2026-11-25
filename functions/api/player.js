const BRAWL_PROXY_BASE = "https://bsproxy.royaleapi.dev/v1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function normalizeAndValidateTag(rawTag) {
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

function mapUpstreamError(status, fallbackMessage) {
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

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (request.method !== "GET") {
    return jsonResponse(
      { error: "Méthode non autorisée. Utilisez GET." },
      405
    );
  }

  const apiKey = env?.BRAWL_API_KEY?.trim();
  if (!apiKey) {
    return jsonResponse(
      {
        error:
          "Configuration serveur incomplète : la variable d'environnement secrète BRAWL_API_KEY est manquante.",
      },
      500
    );
  }

  const url = new URL(request.url);
  const rawTag = url.searchParams.get("tag");
  const cleanTag = normalizeAndValidateTag(rawTag);

  if (!cleanTag) {
    return jsonResponse(
      {
        error:
          "Tag joueur manquant ou invalide. Saisissez entre 2 et 16 caractères alphanumériques (ex: #2PP).",
      },
      400
    );
  }

  const encodedTag = `%23${encodeURIComponent(cleanTag)}`;
  const profileUrl = `${BRAWL_PROXY_BASE}/players/${encodedTag}`;
  const battlelogUrl = `${BRAWL_PROXY_BASE}/players/${encodedTag}/battlelog`;

  const requestHeaders = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  try {
    const [profileRes, battlelogRes] = await Promise.all([
      fetch(profileUrl, { headers: requestHeaders }),
      fetch(battlelogUrl, { headers: requestHeaders }),
    ]);

    if (!profileRes.ok) {
      let upstreamReason = "";
      try {
        const errBody = await profileRes.json();
        upstreamReason = errBody?.message || errBody?.reason || "";
      } catch {
        // Ignorer si la réponse n'est pas en JSON
      }
      const mapped = mapUpstreamError(profileRes.status, upstreamReason);
      return jsonResponse({ error: mapped.error }, mapped.status);
    }

    const profileData = await profileRes.json();

    let battlelogItems = [];
    if (battlelogRes.ok) {
      const battlelogData = await battlelogRes.json();
      battlelogItems = Array.isArray(battlelogData?.items)
        ? battlelogData.items
        : [];
    } else if (battlelogRes.status === 403 || battlelogRes.status === 429) {
      const mapped = mapUpstreamError(battlelogRes.status);
      return jsonResponse({ error: mapped.error }, mapped.status);
    }

    return jsonResponse(
      {
        profile: profileData,
        battlelog: battlelogItems,
      },
      200,
      {
        "Cache-Control": "public, max-age=30",
      }
    );
  } catch {
    return jsonResponse(
      {
        error:
          "Impossible de joindre le proxy Brawl Stars (bsproxy.royaleapi.dev). Vérifiez votre connexion ou réessayez.",
      },
      502
    );
  }
}
