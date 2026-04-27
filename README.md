# Dujardin Delacour & Cie — Site Vitrine

Site vitrine officiel de **Dujardin Delacour & Cie**

> Official showcase website for **Dujardin Delacour & Cie**

---

## Stack technique / Tech Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | Angular 21 (standalone components, signals) |
| Styles | SCSS |
| Backend | Node.js + Express (mailer uniquement) |
| Mailer | [Resend](https://resend.com) |
| Déploiement | GitHub Pages (`gh-pages` branch) |

> Le backend se limite strictement à l'envoi d'emails via le formulaire de contact.
> **Aucune base de données, aucune authentification, aucune API REST complexe.**
>
> The backend is strictly limited to sending emails via the contact form.
> **No database, no authentication, no complex REST API.**

---

## Structure du projet / Project Structure

```
djd/
├── src/
│   ├── app/
│   │   ├── components/       # Composants Angular (navbar, hero, services, contact…)
│   │   ├── services/         # TranslationService, ToastService, GalleryService
│   │   ├── i18n/             # Traductions FR / EN
│   │   ├── app.ts            # Root component
│   │   └── app.config.ts     # Providers (HttpClient…)
│   └── styles.scss           # Variables CSS globales, tokens de design
├── public/                   # Assets statiques (images, logo, favicon)
├── server/
│   ├── index.js              # Serveur Express — POST /api/contact
│   ├── package.json
│   └── .env                  # Clé API Resend (non committé)
├── proxy.conf.json           # Proxy Angular dev → backend :3000
└── angular.json
```

---

## Installation & Démarrage / Installation & Getting Started

### Prérequis / Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- Angular CLI : `npm install -g @angular/cli`

---

### 1. Frontend Angular

```bash
# Cloner le repo
git clone https://github.com/ara510/djd.git
cd djd

# Installer les dépendances Angular
npm install

# Démarrer en développement (avec proxy vers le backend)
npm start
# → http://localhost:4200
```

---

### 2. Backend Mailer (formulaire de contact)

```bash
cd server

# Installer les dépendances du backend
npm install

# Créer le fichier d'environnement
cp .env.example .env   # ou créer manuellement (voir ci-dessous)
```

Contenu du fichier `server/.env` :

```env
RESEND_API_KEY=re_VOTRE_CLE_API_ICI
PORT=3000
```

Obtenir une clé API gratuite sur [resend.com](https://resend.com).

```bash
# Démarrer le backend
node index.js
# → http://localhost:3000
```

> En développement, le proxy Angular (`proxy.conf.json`) redirige automatiquement
> les requêtes `/api/*` vers `http://localhost:3000`. Les deux serveurs doivent
> donc tourner en parallèle.
>
> In development, the Angular proxy (`proxy.conf.json`) automatically forwards
> `/api/*` requests to `http://localhost:3000`. Both servers must run in parallel.

---

## Build & Déploiement / Build & Deployment

### Build de production

```bash
ng build --base-href /djd/
```

Les fichiers sont générés dans `dist/djd/browser/`.

### Déployer sur GitHub Pages

```bash
npx angular-cli-ghpages --dir=dist/djd/browser
```

> Le backend Node.js n'est **pas** déployé sur GitHub Pages (site statique uniquement).
> Pour la production, héberger `server/` sur un service comme Railway, Render ou Fly.io.
>
> The Node.js backend is **not** deployed to GitHub Pages (static site only).
> For production, host `server/` on a service like Railway, Render, or Fly.io.

---

## Internationalisation / i18n

Le site supporte le français et l'anglais via un service de traduction maison (`TranslationService`).
Les clés de traduction sont centralisées dans `src/app/i18n/translations.ts`.

The site supports French and English via a custom translation service (`TranslationService`).
Translation keys are centralised in `src/app/i18n/translations.ts`.

---

## Variables d'environnement / Environment Variables

| Variable | Description | Requis |
|----------|-------------|--------|
| `RESEND_API_KEY` | Clé API Resend pour l'envoi d'emails | Oui |
| `PORT` | Port du serveur backend (défaut : 3000) | Non |

---

## Contacts projet / Project Contacts

- **Société** : Dujardin Delacour & Cie — 16 Rue Dr Raharinosy, Andohalo, Antananarivo 101
- **Email** : mathilde.lebon@dujardin-delacour.com
- **Tél** : +261 020 85 203 55
