# BrawlStats Tracker

Application web complète (Backend Serverless Cloudflare Pages + Frontend statique) permettant de consulter les statistiques d'un joueur **Brawl Stars** : profil, trophées, club, brawlers débloqués et les **10 dernières parties**.

L'API officielle Brawl Stars imposant un filtrage strict par adresse IP, le backend passe par le proxy à IP fixe `https://bsproxy.royaleapi.dev/v1` (**`45.79.218.79`**).

---

## Arborescence du dépôt

```text
.
├── functions/
│   └── api/
│       └── player.js      # Cloudflare Pages Function (proxy sécurisé + CORS)
├── public/
│   ├── index.html         # Interface statique (Cloudflare Pages & GitHub Pages)
│   ├── style.css          # Thème sombre moderne et responsive
│   └── app.js             # Logique client (constante API_BASE_URL configurable)
└── README.md
```

---

## 1. Vérifier la clé API sur `developer.brawlstars.com`

1. Connectez-vous sur [developer.brawlstars.com](https://developer.brawlstars.com/).
2. Ouvrez **My Account** puis sélectionnez votre clé API (ou cliquez sur **Create New Key**).
3. Dans le champ **Allowed IP Addresses**, assurez-vous que l'adresse IP exacte suivante est bien enregistrée :
   ```text
   45.79.218.79
   ```
4. Copiez votre **Token** sans jamais le coller dans le code source ni le committer sur GitHub.

---

## 2. Déployer sur Cloudflare Pages (recommandé)

Cloudflare Pages héberge à la fois le frontend statique (`public/`) et la Function serverless (`functions/`).

1. Poussez ce dépôt sur **GitHub**.
2. Dans le dashboard **Cloudflare** -> **Workers & Pages** -> **Create** -> **Pages** -> **Connect to Git**, sélectionnez votre dépôt.
3. Renseignez les paramètres de build :
   - **Framework preset** : `None`
   - **Build command** : *(laisser vide)*
   - **Build output directory** : `public`
4. Déployez le projet une première fois, puis ajoutez votre secret :
   - Allez dans **Settings** -> **Environment variables**.
   - Ajoutez la variable **Production** (et **Preview** si besoin) :
     - **Variable name** : `BRAWL_API_KEY`
     - **Value** : votre token Brawl Stars
     - Cochez **Encrypt** (Secret).
5. Déclenchez un redéploiement (**Deployments** -> **Retry deployment**) pour que la Function prenne en compte `BRAWL_API_KEY`.
6. Dans `public/app.js`, laissez `const API_BASE_URL = "";` : le frontend appelle directement `/api/player` sur le même domaine `.pages.dev`.

---

## 3. Publier le frontend sur GitHub Pages (optionnel)

Si vous souhaitez héberger uniquement l'interface sur **GitHub Pages** tout en conservant le backend sécurisé sur Cloudflare Pages :

1. Ouvrez `public/app.js` et modifiez la première constante avec l'URL de votre projet Cloudflare Pages (sans slash final) :
   ```js
   const API_BASE_URL = "https://votre-projet.pages.dev";
   ```
2. Poussez le dossier `public/` vers la branche publiée par GitHub Pages (via GitHub Actions ou en configurant la source de déploiement sur le dossier correspondant).
3. Les en-têtes CORS (`Access-Control-Allow-Origin: *`) configurés dans `functions/api/player.js` autorisent automatiquement les appels depuis `*.github.io` vers `*.pages.dev`.
