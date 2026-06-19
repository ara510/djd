require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const { Pool } = require('pg');
const { Resend } = require('resend');

const app    = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT   = process.env.PORT || 3000;

// ─── Stockage des médias (images/vidéos) sur disque ─────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'veille');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '').slice(0, 10).replace(/[^.\w]/g, '');
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 Mo / fichier (couvre vidéos)
  fileFilter: (req, file, cb) => cb(null, /^(image|video)\//.test(file.mimetype)),
});

// Corbeille fichiers : les médias retirés y sont déplacés, puis effacés après 7 jours.
const TRASH_DIR = path.join(__dirname, 'uploads', 'trash');
const FILE_TRASH_DAYS = 7;
fs.mkdirSync(TRASH_DIR, { recursive: true });

/** Déplace les fichiers médias (URLs /uploads/veille/...) vers la corbeille fichiers. */
function trashMediaFiles(urls) {
  for (const u of (urls || [])) {
    if (typeof u !== 'string' || !u.includes('/uploads/veille/')) continue; // ignore base64 / URLs externes
    const name = path.basename(u.split('?')[0]);
    if (name) fs.rename(path.join(UPLOADS_DIR, name), path.join(TRASH_DIR, `${Date.now()}-${name}`), () => {});
  }
}

/** Efface définitivement les fichiers de la corbeille de plus de 7 jours. */
function purgeTrashFiles() {
  fs.readdir(TRASH_DIR, (err, files) => {
    if (err) return;
    const cutoff = Date.now() - FILE_TRASH_DAYS * 86400000;
    for (const f of files) {
      const fp = path.join(TRASH_DIR, f);
      fs.stat(fp, (e, st) => { if (!e && st.isFile() && st.mtimeMs < cutoff) fs.unlink(fp, () => {}); });
    }
  });
}
purgeTrashFiles();
setInterval(purgeTrashFiles, 6 * 60 * 60 * 1000); // toutes les 6 h

// ─── PostgreSQL pool ───────────────────────────────────────────────────────────
const db = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'djd-ws-db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

// En dev : CORS vers Angular dev server. En prod : même domaine, pas besoin de CORS.
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:4200' }));
}
app.use(express.json({ limit: '10mb' })); // les médias passent par /api/upload (multipart), plus en base64
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '30d' }));

// Auto-migration
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT`).catch(() => {});
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`).catch(() => {});
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telephone VARCHAR(30)`).catch(() => {});
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pays VARCHAR(100)`).catch(() => {});
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ville VARCHAR(100)`).catch(() => {});
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS genre VARCHAR(30)`).catch(() => {});
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_email BOOLEAN NOT NULL DEFAULT TRUE`).catch(() => {});
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'generale'`).catch(() => {});
// Remappage des anciens plans (free/pro/premium) → veille (generale/sectorielle/dediee)
db.query(`ALTER TABLE users ALTER COLUMN plan SET DEFAULT 'generale'`).catch(() => {});
db.query(`UPDATE users SET plan = 'generale'    WHERE plan = 'free'`).catch(() => {});
db.query(`UPDATE users SET plan = 'sectorielle' WHERE plan = 'pro'`).catch(() => {});
db.query(`UPDATE users SET plan = 'dediee'      WHERE plan = 'premium'`).catch(() => {});
db.query(`ALTER TABLE users DROP COLUMN IF EXISTS phone_verified`).catch(() => {});
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
// Admin = email du domaine DJD. Synchronise les comptes existants sur cette règle.
db.query(`UPDATE users SET is_admin = TRUE  WHERE LOWER(email) LIKE '%@dujardin-delacour.com' AND is_admin = FALSE`).catch(() => {});
db.query(`UPDATE users SET is_admin = FALSE WHERE LOWER(email) NOT LIKE '%@dujardin-delacour.com' AND is_admin = TRUE`).catch(() => {});
db.query(`
  CREATE TABLE IF NOT EXISTS veille_items (
    id             SERIAL PRIMARY KEY,
    title          TEXT NOT NULL,
    source         TEXT,
    source_type    VARCHAR(20) NOT NULL DEFAULT 'web',
    social_network VARCHAR(20),
    sector         VARCHAR(40),
    url            TEXT,
    excerpt        TEXT,
    image          TEXT,
    video          TEXT,
    author         TEXT,
    status         VARCHAR(12) NOT NULL DEFAULT 'published',
    published_at   TIMESTAMPTZ DEFAULT NOW(),
    created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
db.query(`ALTER TABLE veille_items ADD COLUMN IF NOT EXISTS social_network VARCHAR(20)`).catch(() => {});
db.query(`ALTER TABLE veille_items ADD COLUMN IF NOT EXISTS status VARCHAR(12) NOT NULL DEFAULT 'published'`).catch(() => {});
db.query(`ALTER TABLE veille_items ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
db.query(`ALTER TABLE veille_items ADD COLUMN IF NOT EXISTS video TEXT`).catch(() => {});
db.query(`ALTER TABLE veille_items ADD COLUMN IF NOT EXISTS author TEXT`).catch(() => {});
db.query(`ALTER TABLE veille_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`).catch(() => {});
db.query(`ALTER TABLE veille_items ADD COLUMN IF NOT EXISTS source_types TEXT[]`).catch(() => {});
db.query(`UPDATE veille_items SET source_types = ARRAY[source_type] WHERE source_types IS NULL`).catch(() => {});
db.query(`ALTER TABLE veille_items ADD COLUMN IF NOT EXISTS sectors TEXT[]`).catch(() => {});
db.query(`UPDATE veille_items SET sectors = ARRAY[sector] WHERE sectors IS NULL AND sector IS NOT NULL`).catch(() => {});
db.query(`ALTER TABLE veille_items ADD COLUMN IF NOT EXISTS tone VARCHAR(10)`).catch(() => {}); // ton : positif / neutre / negatif (indicateur du PDF de veille)
db.query(`ALTER TABLE veille_items ADD COLUMN IF NOT EXISTS sources TEXT[]`).catch(() => {});
db.query(`UPDATE veille_items SET sources = ARRAY[source] WHERE sources IS NULL AND source IS NOT NULL`).catch(() => {});
db.query(`ALTER TABLE veille_items ADD COLUMN IF NOT EXISTS images TEXT[]`).catch(() => {});
db.query(`UPDATE veille_items SET images = ARRAY[image] WHERE images IS NULL AND image IS NOT NULL`).catch(() => {});
db.query(`ALTER TABLE veille_items ALTER COLUMN title DROP NOT NULL`).catch(() => {});

// Corbeille : purge des veilles supprimées depuis plus de 15 jours (+ déplace leurs médias en corbeille fichiers).
function purgeVeilleTrash() {
  db.query(`DELETE FROM veille_items WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '15 days' RETURNING images, video`)
    .then(r => r.rows.forEach(row => trashMediaFiles([...(row.images || []), row.video])))
    .catch(() => {});
}
purgeVeilleTrash();
setInterval(purgeVeilleTrash, 6 * 60 * 60 * 1000); // toutes les 6 h
db.query(`
  CREATE TABLE IF NOT EXISTS veille_states (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    veille_id  INTEGER NOT NULL REFERENCES veille_items(id) ON DELETE CASCADE,
    favorite   BOOLEAN NOT NULL DEFAULT FALSE,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, veille_id)
  )
`).catch(() => {});
db.query(`
  CREATE TABLE IF NOT EXISTS activity_log (
    id         SERIAL PRIMARY KEY,
    actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name TEXT,
    action     VARCHAR(40) NOT NULL,
    target     TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
db.query(`
  CREATE TABLE IF NOT EXISTS email_otps (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    code       VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
db.query(`
  CREATE TABLE IF NOT EXISTS feedback (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rating     SMALLINT CHECK (rating >= 1 AND rating <= 5),
    category   VARCHAR(30),
    comment    TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
db.query(`
  CREATE TABLE IF NOT EXISTS leads (
    id         SERIAL PRIMARY KEY,
    email      TEXT NOT NULL,
    kind       VARCHAR(40),
    detail     TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
// Chat support intégré : une conversation par compte (user_id) ou par visiteur (guest_token).
db.query(`
  CREATE TABLE IF NOT EXISTS chat_conversations (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    guest_token     TEXT,
    guest_email     TEXT,
    guest_name      TEXT,
    status          VARCHAR(12) NOT NULL DEFAULT 'open',
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
db.query(`CREATE INDEX IF NOT EXISTS idx_chat_conv_user  ON chat_conversations(user_id)`).catch(() => {});
db.query(`CREATE INDEX IF NOT EXISTS idx_chat_conv_token ON chat_conversations(guest_token)`).catch(() => {});
db.query(`
  CREATE TABLE IF NOT EXISTS chat_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender          VARCHAR(8) NOT NULL,
    body            TEXT NOT NULL,
    read_by_staff   BOOLEAN NOT NULL DEFAULT FALSE,
    read_by_user    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
db.query(`CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id)`).catch(() => {});
// Alertes « Option » (temps réel / récapitulatif quotidien / bulletin hebdomadaire).
// Diffusées par email à la publication ; visibles dans le dashboard admin uniquement.
db.query(`
  CREATE TABLE IF NOT EXISTS alerts (
    id           SERIAL PRIMARY KEY,
    kind         VARCHAR(20) NOT NULL DEFAULT 'realtime',
    title        TEXT NOT NULL,
    source       TEXT,
    url          TEXT,
    context      TEXT,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
db.query(`CREATE INDEX IF NOT EXISTS idx_alerts_kind ON alerts(kind)`).catch(() => {});
db.query(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS payload JSONB`).catch(() => {}); // récap quotidien / bulletin hebdo (rubriques + faits)

// ─── JWT middleware ────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorisé.' });
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide.' });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const { rows } = await db.query('SELECT is_admin, email_verified FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length || !rows[0].is_admin) return res.status(403).json({ error: 'Accès réservé à l\'équipe DJD.' });
    if (!rows[0].email_verified) return res.status(403).json({ error: 'Veuillez vérifier votre email pour accéder aux fonctionnalités admin.' });
    next();
  } catch {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// Auth optionnelle : renseigne req.user si un token valide est présent, sinon poursuit (visiteur anonyme).
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try { req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET); } catch { /* visiteur anonyme */ }
  }
  next();
}

// Admin d'office : tout email du domaine DJD est administrateur.
const ADMIN_EMAIL_DOMAIN = '@dujardin-delacour.com';
function isDjdEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(ADMIN_EMAIL_DOMAIN);
}

// Journal d'activité admin (fire-and-forget).
function logActivity(req, action, target) {
  const actorName = req.user?.username ? '@' + req.user.username : null;
  db.query(
    'INSERT INTO activity_log (actor_id, actor_name, action, target) VALUES ($1,$2,$3,$4)',
    [req.user?.id || null, actorName, action, target || null]
  ).catch(() => {});
}

// ─── POST /api/auth/register ───────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { nom, prenoms, date_naissance, email, username, password } = req.body;

  if (!nom || !prenoms || !date_naissance || !email || !username || !password)
    return res.status(400).json({ error: 'Tous les champs sont requis.' });

  if (!/^[a-zA-Z0-9]+$/.test(username))
    return res.status(400).json({ error: 'Le nom d\'utilisateur ne peut contenir que des lettres et des chiffres.' });

  if (
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^a-zA-Z0-9]/.test(password)
  ) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un symbole.' });

  try {
    const emailCheck    = await db.query('SELECT id FROM users WHERE email    = $1', [email]);
    const usernameCheck = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (emailCheck.rows.length)    return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
    if (usernameCheck.rows.length) return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris.' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      'INSERT INTO users (nom, prenoms, date_naissance, email, username, password_hash, terms_accepted, is_admin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, nom, prenoms, email, username, date_naissance, avatar, telephone, pays, ville, genre, notif_email, email_verified, plan, is_admin, created_at, deleted_at',
      [nom, prenoms, date_naissance, email, username, hash, true, isDjdEmail(email)]
    );
    const user  = rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Champs manquants.' });

  try {
    const { rows } = await db.query(
      'SELECT id, nom, prenoms, email, username, password_hash, avatar, date_naissance, telephone, pays, ville, genre, notif_email, email_verified, plan, is_admin, disabled, created_at, deleted_at FROM users WHERE username = $1',
      [username]
    );
    if (!rows.length) return res.status(401).json({ error: 'Identifiants incorrects.' });

    const user  = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects.' });
    if (user.disabled) return res.status(403).json({ error: 'Ce compte a été désactivé. Contactez l\'administrateur.' });

    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── GET /api/auth/me ──────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, nom, prenoms, email, username, date_naissance, avatar, telephone, pays, ville, genre, notif_email, email_verified, plan, is_admin, disabled, created_at, deleted_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (rows[0].disabled) return res.status(403).json({ error: 'Compte désactivé.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── PATCH /api/auth/me ────────────────────────────────────────────────────────
app.patch('/api/auth/me', requireAuth, async (req, res) => {
  const { nom, prenoms, email, username, date_naissance, avatar, telephone, pays, ville, genre, notif_email, currentPassword, newPassword } = req.body;

  if (!nom || !prenoms || !email || !username || !date_naissance)
    return res.status(400).json({ error: 'Champs requis manquants.' });

  if (!/^[a-zA-Z0-9]+$/.test(username))
    return res.status(400).json({ error: 'Le nom d\'utilisateur ne peut contenir que des lettres et des chiffres.' });

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const user = rows[0];

    if (email !== user.email) {
      const check = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, req.user.id]);
      if (check.rows.length) return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
    }
    if (username !== user.username) {
      const check = await db.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, req.user.id]);
      if (check.rows.length) return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris.' });
    }

    let newHash = user.password_hash;
    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis.' });
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
      if (newPassword.length < 8) return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
      newHash = await bcrypt.hash(newPassword, 12);
    }

    const newAvatar     = avatar !== undefined ? avatar : user.avatar;
    const isAdmin       = isDjdEmail(email);       // statut admin recalculé selon le domaine de l'email
    const emailChanged  = email !== user.email;
    // Nouvel email = non vérifié : on réinitialise pour relancer la confirmation.
    const emailVerified = emailChanged ? false : user.email_verified;

    const { rows: updated } = await db.query(
      `UPDATE users SET nom=$1, prenoms=$2, email=$3, username=$4, date_naissance=$5, avatar=$6, password_hash=$7,
       telephone=$8, pays=$9, ville=$10, genre=$11, notif_email=$12, is_admin=$13, email_verified=$14
       WHERE id=$15
       RETURNING id, nom, prenoms, email, username, date_naissance, avatar, telephone, pays, ville, genre, notif_email, email_verified, plan, is_admin, created_at, deleted_at`,
      [nom, prenoms, email, username, date_naissance, newAvatar, newHash,
       telephone ?? null, pays ?? null, ville ?? null, genre ?? null,
       notif_email !== undefined ? notif_email : true, isAdmin, emailVerified,
       req.user.id]
    );

    const updatedUser = updated[0];
    const token = jwt.sign({ id: updatedUser.id, username: updatedUser.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: updatedUser });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── DELETE /api/auth/me ───────────────────────────────────────────────────────
app.delete('/api/auth/me', requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Mot de passe requis.' });

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect.' });

    await db.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /api/auth/recover ────────────────────────────────────────────────────
app.post('/api/auth/recover', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE users SET deleted_at = NULL WHERE id = $1
       RETURNING id, nom, prenoms, email, username, date_naissance, avatar, telephone, pays, ville, genre, notif_email, email_verified, plan, is_admin, created_at, deleted_at`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });

    const user  = rows[0];
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    console.error('Recover account error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const APP_URL = process.env.APP_URL || 'http://localhost:4200';

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function emailLayout(content) {
  const logoUrl = `${APP_URL}/assets/DJD2.png`;
  return `
  <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#EFECE5;border-radius:6px;overflow:hidden;">
    <div style="padding:28px 40px;text-align:center;">
      <img src="${logoUrl}" alt="Dujardin Delacour & Cie" width="140" style="display:block;margin:0 auto;max-width:140px;" />
    </div>
    <div style="background:#fff;padding:36px 40px;">${content}</div>
    <div style="padding:16px 40px 24px;text-align:center;">
      <p style="font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#9A8E7E;margin:0;">
        Dujardin Delacour &amp; Cie — Antananarivo, Madagascar
      </p>
    </div>
  </div>`;
}

// ─── POST /api/auth/send-otp ──────────────────────────────────────────────────
app.post('/api/auth/send-otp', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT email, email_verified FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (rows[0].email_verified) return res.status(400).json({ error: 'Email déjà vérifié.' });

    const code    = generateOtp();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await db.query('UPDATE email_otps SET used = TRUE WHERE user_id = $1 AND used = FALSE', [req.user.id]);
    await db.query('INSERT INTO email_otps (user_id, code, expires_at) VALUES ($1,$2,$3)', [req.user.id, code, expires]);

    await resend.emails.send({
      from:    'noreply@dujardin-delacour.com',
      to:      rows[0].email,
      subject: 'Votre code de vérification — Dujardin Delacour',
      html: emailLayout(`
        <h2 style="font-size:1.1rem;font-weight:400;color:#1A1916;margin:0 0 8px;">Vérification de votre adresse e-mail</h2>
        <p style="font-size:0.85rem;color:#6B6560;margin:0 0 28px;line-height:1.6;">
          Entrez le code ci-dessous dans l'application. Il expire dans <strong>15 minutes</strong>.
        </p>
        <div style="text-align:center;margin:0 0 28px;">
          <span style="font-size:2.5rem;letter-spacing:0.4em;font-weight:700;color:#1A1916;font-family:monospace;">
            ${code}
          </span>
        </div>
        <p style="font-size:0.75rem;color:#9A8E7E;margin:0;">
          Si vous n'avez pas demandé ce code, ignorez cet e-mail.
        </p>
      `),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────
app.post('/api/auth/verify-otp', requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code requis.' });

  try {
    const { rows } = await db.query(
      'SELECT id FROM email_otps WHERE user_id=$1 AND code=$2 AND used=FALSE AND expires_at > NOW()',
      [req.user.id, code]
    );
    if (!rows.length) return res.status(400).json({ error: 'Code invalide ou expiré.' });

    await db.query('UPDATE email_otps SET used=TRUE WHERE id=$1', [rows[0].id]);
    const { rows: updated } = await db.query(
      `UPDATE users SET email_verified=TRUE WHERE id=$1
       RETURNING id,nom,prenoms,email,username,date_naissance,avatar,telephone,pays,ville,genre,notif_email,email_verified,plan,is_admin,created_at,deleted_at`,
      [req.user.id]
    );
    const token = jwt.sign({ id: updated[0].id, username: updated[0].username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: updated[0] });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis.' });

  try {
    const { rows } = await db.query(
      'SELECT id, nom FROM users WHERE email=$1 AND deleted_at IS NULL', [email]
    );
    if (!rows.length) return res.json({ success: true }); // anti-enumération

    const resetToken = jwt.sign({ id: rows[0].id, type: 'pwd_reset' }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const resetUrl   = `${APP_URL}?reset=${resetToken}`;

    await resend.emails.send({
      from:    'noreply@dujardin-delacour.com',
      to:      email,
      subject: 'Réinitialisation de mot de passe — Dujardin Delacour',
      html: emailLayout(`
        <h2 style="font-size:1.1rem;font-weight:400;color:#1A1916;margin:0 0 8px;">Réinitialisation de mot de passe</h2>
        <p style="font-size:0.85rem;color:#6B6560;margin:0 0 28px;line-height:1.6;">
          Bonjour ${rows[0].nom},<br/>
          Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe. Ce lien expire dans <strong>15 minutes</strong>.
        </p>
        <div style="text-align:center;margin:0 0 28px;">
          <a href="${resetUrl}" style="display:inline-block;background:#1A1916;color:#fff;text-decoration:none;padding:12px 32px;font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;border-radius:2px;">
            Réinitialiser mon mot de passe
          </a>
        </div>
        <p style="font-size:0.75rem;color:#9A8E7E;margin:0;">
          Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail.
        </p>
      `),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /api/auth/reset-password ────────────────────────────────────────────
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token et mot de passe requis.' });

  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password))
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un symbole.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'pwd_reset') return res.status(400).json({ error: 'Token invalide.' });

    const hash = await bcrypt.hash(password, 12);
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, payload.id]);
    res.json({ success: true });
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(400).json({ error: 'Lien expiré. Veuillez faire une nouvelle demande.' });
    res.status(400).json({ error: 'Token invalide.' });
  }
});

// ─── POST /api/feedback ───────────────────────────────────────────────────────
app.post('/api/feedback', requireAuth, async (req, res) => {
  const { rating, category, comment } = req.body;
  if (rating && (rating < 1 || rating > 5))
    return res.status(400).json({ error: 'Note invalide.' });

  try {
    await db.query(
      'INSERT INTO feedback (user_id, rating, category, comment) VALUES ($1, $2, $3, $4)',
      [req.user.id, rating || null, category || null, comment?.trim() || null]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── GET /api/feedback — consultation (admin DJD) ─────────────────────────────
app.get('/api/feedback', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT f.id, f.rating, f.category, f.comment, f.created_at,
              u.username, u.nom, u.prenoms, u.email
       FROM feedback f
       LEFT JOIN users u ON u.id = f.user_id
       ORDER BY f.created_at DESC
       LIMIT 500`
    );
    res.json(rows);
  } catch (err) {
    console.error('Feedback list error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── GET /api/users — liste des comptes (admin DJD) ───────────────────────────
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, nom, prenoms, username, email, avatar, plan, is_admin, email_verified, disabled, created_at, deleted_at
       FROM users ORDER BY created_at DESC LIMIT 1000`
    );
    res.json(rows);
  } catch (err) {
    console.error('Users list error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── PATCH /api/users/:id/plan — changer l'abonnement d'un compte (admin DJD) ──
app.patch('/api/users/:id/plan', requireAuth, requireAdmin, async (req, res) => {
  const { plan } = req.body;
  if (!['generale', 'sectorielle', 'dediee'].includes(plan))
    return res.status(400).json({ error: 'Abonnement invalide.' });
  try {
    const { rows } = await db.query(
      'UPDATE users SET plan = $1 WHERE id = $2 RETURNING id, plan, username',
      [plan, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    logActivity(req, 'user.plan', `@${rows[0].username} → ${plan}`);
    res.json(rows[0]);
  } catch (err) {
    console.error('User plan update error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── GET /api/stats — statistiques (admin DJD) ────────────────────────────────
app.get('/api/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [veille, byStatus, byType, bySector, byMonth, users, byPlan, feedback, byCat] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS total FROM veille_items`),
      db.query(`SELECT status, COUNT(*)::int AS count FROM veille_items GROUP BY status`),
      db.query(`SELECT source_type, COUNT(*)::int AS count FROM veille_items GROUP BY source_type ORDER BY count DESC`),
      db.query(`SELECT sector, COUNT(*)::int AS count FROM veille_items WHERE sector IS NOT NULL GROUP BY sector ORDER BY count DESC`),
      db.query(`SELECT to_char(date_trunc('month', published_at), 'YYYY-MM') AS month, COUNT(*)::int AS count
                FROM veille_items GROUP BY 1 ORDER BY 1 DESC LIMIT 6`),
      db.query(`SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE is_admin)::int        AS admins,
                       COUNT(*) FILTER (WHERE email_verified)::int  AS verified,
                       COUNT(*) FILTER (WHERE disabled)::int        AS disabled
                FROM users`),
      db.query(`SELECT plan, COUNT(*)::int AS count FROM users WHERE is_admin = FALSE GROUP BY plan`),
      db.query(`SELECT COUNT(*)::int AS total, ROUND(AVG(rating)::numeric, 1) AS avg FROM feedback WHERE rating IS NOT NULL`),
      db.query(`SELECT category, COUNT(*)::int AS count FROM feedback WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC`),
    ]);

    const statusMap = Object.fromEntries(byStatus.rows.map(r => [r.status, r.count]));
    res.json({
      veille: {
        total:     veille.rows[0].total,
        published: statusMap['published'] || 0,
        draft:     statusMap['draft'] || 0,
        byType:    byType.rows,
        bySector:  bySector.rows,
        byMonth:   byMonth.rows.reverse(),
      },
      users: {
        total:    users.rows[0].total,
        admins:   users.rows[0].admins,
        verified: users.rows[0].verified,
        disabled: users.rows[0].disabled,
        byPlan:   byPlan.rows,
      },
      feedback: {
        total: feedback.rows[0].total,
        avg:   feedback.rows[0].avg ? Number(feedback.rows[0].avg) : 0,
        byCategory: byCat.rows,
      },
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── GET /api/activity — journal d'activité (admin DJD) ───────────────────────
app.get('/api/activity', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, actor_name, action, target, created_at
       FROM activity_log ORDER BY created_at DESC, id DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    console.error('Activity list error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── PATCH /api/users/:id/disabled — activer/désactiver un compte (admin DJD) ──
app.patch('/api/users/:id/disabled', requireAuth, requireAdmin, async (req, res) => {
  const disabled = !!req.body.disabled;
  const targetId = parseInt(req.params.id, 10);
  if (targetId === req.user.id)
    return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' });
  try {
    const target = await db.query('SELECT is_admin FROM users WHERE id = $1', [targetId]);
    if (!target.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    if (target.rows[0].is_admin)
      return res.status(403).json({ error: 'Impossible de désactiver un compte administrateur.' });
    const { rows } = await db.query(
      'UPDATE users SET disabled = $1 WHERE id = $2 RETURNING id, disabled, username',
      [disabled, targetId]
    );
    logActivity(req, disabled ? 'user.disable' : 'user.enable', `@${rows[0].username}`);
    res.json(rows[0]);
  } catch (err) {
    console.error('User disable error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── POST /api/contact ─────────────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message)
    return res.status(400).json({ error: 'Champs manquants.' });

  try {
    await resend.emails.send({
      from:    'noreply@dujardin-delacour.com',
      to:      'nathanrakotomavo05@gmail.com',
      subject: `[Site Web DJD] Nouveau message de ${name}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #EFECE5; border-radius: 6px; overflow: hidden;">
          <div style="background: #1a191600; padding: 32px 40px; text-align: center;">
            <img src="${APP_URL}/assets/DJD2.png" alt="Dujardin Delacour & Cie" width="140" style="display:block;margin:0 auto;max-width:140px;" />
          </div>
          <div style="padding: 36px 40px;">
            <h2 style="font-family:Georgia,serif;font-size:1.1rem;font-weight:400;color:#1A1916;margin:0 0 6px;">Nouveau message reçu</h2>
            <p style="font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;color:#9A8E7E;margin:0 0 28px;">Formulaire de contact — Site web</p>
            <hr style="border:none;border-top:1px solid #D4CFCA;margin:0 0 24px;" />
            <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
              <tr><td style="padding:8px 0;color:#9A8E7E;width:90px;vertical-align:top;">Nom</td><td style="padding:8px 0;color:#1A1916;font-weight:600;">${name}</td></tr>
              <tr><td style="padding:8px 0;color:#9A8E7E;vertical-align:top;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#1A1916;">${email}</a></td></tr>
              <tr><td style="padding:8px 0;color:#9A8E7E;vertical-align:top;">Message</td><td style="padding:8px 0;color:#1A1916;white-space:pre-line;line-height:1.7;">${message}</td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #D4CFCA;margin:28px 0 0;" />
          </div>
          <div style="padding:16px 40px 28px;text-align:center;">
            <p style="font-size:0.72rem;letter-spacing:0.1em;text-transform:uppercase;color:#9A8E7E;margin:0;">Dujardin Delacour & Cie — Antananarivo, Madagascar</p>
          </div>
        </div>`,
    });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ error: 'Échec de l\'envoi.' });
  }
});

// ─── POST /api/leads — capture d'email (rapport d'exemple, ressources…) (public) ──
const LEADS_EMAIL = 'nathanrakotomavo05@gmail.com'; // destinataire des notifications prospects
app.post('/api/leads', async (req, res) => {
  const { email, kind, detail } = req.body;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return res.status(400).json({ error: 'Adresse email invalide.' });
  try {
    await db.query(
      'INSERT INTO leads (email, kind, detail) VALUES ($1, $2, $3)',
      [email.trim().toLowerCase(), (kind || '').slice(0, 40), (detail || '').slice(0, 200)]
    );
    resend.emails.send({
      from:    'noreply@dujardin-delacour.com',
      to:      LEADS_EMAIL,
      subject: `[DJD] Nouveau prospect — ${kind || 'contact'}`,
      html: emailLayout(`
        <h2 style="font-family:Georgia,serif;font-size:1.1rem;font-weight:400;color:#1A1916;margin:0 0 6px;">Nouveau prospect</h2>
        <p style="font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;color:#9A8E7E;margin:0 0 24px;">Capture d'email — Site web</p>
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <tr><td style="padding:8px 0;color:#9A8E7E;width:90px;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#1A1916;">${email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#9A8E7E;">Source</td><td style="padding:8px 0;color:#1A1916;">${kind || '—'}${detail ? ' · ' + detail : ''}</td></tr>
        </table>`),
    }).catch(() => {});
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Lead error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── GET /api/leads — liste des prospects (admin DJD) ─────────────────────────
app.get('/api/leads', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, kind, detail, created_at FROM leads ORDER BY created_at DESC LIMIT 1000'
    );
    res.json(rows);
  } catch (err) {
    console.error('Leads list error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── Chat support (messagerie intégrée) ───────────────────────────────────────
const CHAT_BODY_MAX = 2000;
const CHAT_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const esc = (s) => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// Résout la conversation courante (connecté = par user_id, visiteur = par guest_token).
async function resolveConversation(req, { createIfMissing = false, guestEmail, guestName } = {}) {
  if (req.user?.id) {
    const found = await db.query(`SELECT * FROM chat_conversations WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [req.user.id]);
    if (found.rows.length) return found.rows[0];
    if (!createIfMissing) return null;
    const created = await db.query(`INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING *`, [req.user.id]);
    return created.rows[0];
  }
  const token = (req.body?.guestToken || req.query?.token || '').toString().slice(0, 64);
  if (!token) return null;
  const found = await db.query(`SELECT * FROM chat_conversations WHERE guest_token = $1 ORDER BY id DESC LIMIT 1`, [token]);
  if (found.rows.length) return found.rows[0];
  if (!createIfMissing) return null;
  const created = await db.query(
    `INSERT INTO chat_conversations (guest_token, guest_email, guest_name) VALUES ($1, $2, $3) RETURNING *`,
    [token, (guestEmail || '').toLowerCase() || null, (guestName || '').slice(0, 80) || null]
  );
  return created.rows[0];
}

// GET /api/chat/me — conversation + messages du visiteur/utilisateur courant (polling)
// ?seen=1 marque les réponses du staff comme lues (uniquement quand le chat est ouvert).
app.get('/api/chat/me', optionalAuth, async (req, res) => {
  try {
    const conv = await resolveConversation(req, { createIfMissing: false });
    if (!conv) return res.json({ conversation: null, messages: [], unread: 0 });
    const { rows } = await db.query(
      `SELECT id, sender, body, created_at FROM chat_messages WHERE conversation_id = $1 ORDER BY id ASC`, [conv.id]
    );
    const u = await db.query(
      `SELECT COUNT(*)::int AS n FROM chat_messages WHERE conversation_id = $1 AND sender = 'staff' AND NOT read_by_user`, [conv.id]
    );
    let unread = u.rows[0].n;
    if (req.query.seen === '1') {
      db.query(`UPDATE chat_messages SET read_by_user = TRUE WHERE conversation_id = $1 AND sender = 'staff' AND NOT read_by_user`, [conv.id]).catch(() => {});
      unread = 0;
    }
    res.json({
      conversation: { id: conv.id, status: conv.status, hasEmail: !!(conv.guest_email || req.user) },
      messages: rows,
      unread,
    });
  } catch (err) {
    console.error('Chat me error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/chat/messages — message d'un visiteur/utilisateur
app.post('/api/chat/messages', optionalAuth, async (req, res) => {
  const body = (req.body?.body || '').toString().trim();
  if (!body) return res.status(400).json({ error: 'Message vide.' });
  if (body.length > CHAT_BODY_MAX) return res.status(400).json({ error: 'Message trop long.' });

  const guestEmail = (req.body?.guestEmail || '').toString().trim().toLowerCase();
  const guestName  = (req.body?.guestName  || '').toString().trim();

  // Les visiteurs anonymes doivent laisser un email (pour être recontactés).
  if (!req.user) {
    const token = (req.body?.guestToken || '').toString();
    if (!token) return res.status(400).json({ error: 'Session invalide.' });
    const existing = await db.query(`SELECT guest_email FROM chat_conversations WHERE guest_token = $1 LIMIT 1`, [token]);
    const hasEmail = existing.rows.length && existing.rows[0].guest_email;
    if (!hasEmail && !CHAT_EMAIL_RE.test(guestEmail))
      return res.status(400).json({ error: 'Email requis.', needEmail: true });
  }

  try {
    const conv = await resolveConversation(req, { createIfMissing: true, guestEmail, guestName });
    if (!conv) return res.status(400).json({ error: 'Impossible de démarrer la conversation.' });

    // Anti-spam : on ne notifie le staff que sur le 1er message d'une rafale non lue.
    const pending = await db.query(
      `SELECT 1 FROM chat_messages WHERE conversation_id = $1 AND sender = 'user' AND NOT read_by_staff LIMIT 1`, [conv.id]
    );
    const wasIdle = pending.rows.length === 0;

    const { rows } = await db.query(
      `INSERT INTO chat_messages (conversation_id, sender, body) VALUES ($1, 'user', $2) RETURNING id, sender, body, created_at`,
      [conv.id, body]
    );
    await db.query(`UPDATE chat_conversations SET last_message_at = NOW(), status = 'open' WHERE id = $1`, [conv.id]);

    if (wasIdle) {
      const who = req.user ? `@${req.user.username}` : (conv.guest_email || 'Visiteur');
      resend.emails.send({
        from: 'noreply@dujardin-delacour.com',
        to: LEADS_EMAIL,
        subject: `[DJD] Nouveau message chat — ${who}`,
        html: emailLayout(`
          <h2 style="font-family:Georgia,serif;font-size:1.1rem;font-weight:400;color:#1A1916;margin:0 0 6px;">Nouveau message dans le chat</h2>
          <p style="font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;color:#9A8E7E;margin:0 0 24px;">De ${esc(who)}</p>
          <p style="font-size:0.95rem;color:#1A1916;line-height:1.6;background:#EFECE5;padding:14px 16px;border-radius:6px;margin:0 0 20px;">${esc(body)}</p>
          <a href="${APP_URL}" style="display:inline-block;background:#1A1916;color:#fff;text-decoration:none;font-size:0.8rem;letter-spacing:0.08em;text-transform:uppercase;padding:12px 22px;border-radius:4px;">Répondre depuis le dashboard</a>`),
      }).catch(() => {});
    }

    res.status(201).json({ conversationId: conv.id, message: rows[0] });
  } catch (err) {
    console.error('Chat send error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/chat/conversations — liste pour le staff (aperçu + non-lus)
app.get('/api/chat/conversations', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.id, c.user_id, c.guest_email, c.guest_name, c.status, c.last_message_at, c.created_at,
             u.username, u.nom, u.prenoms, u.email AS user_email, u.plan,
             (SELECT body   FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
             (SELECT sender FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_sender,
             (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id AND m.sender = 'user' AND NOT m.read_by_staff)::int AS unread
      FROM chat_conversations c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id)
      ORDER BY c.last_message_at DESC LIMIT 300`);
    res.json(rows);
  } catch (err) {
    console.error('Chat conversations error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/chat/conversations/:id — messages d'une conversation (marque lus côté staff)
app.get('/api/chat/conversations/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const conv = await db.query(`
      SELECT c.*, u.username, u.nom, u.prenoms, u.email AS user_email, u.plan
      FROM chat_conversations c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1`, [req.params.id]);
    if (!conv.rows.length) return res.status(404).json({ error: 'Conversation introuvable.' });
    const { rows } = await db.query(
      `SELECT id, sender, body, created_at FROM chat_messages WHERE conversation_id = $1 ORDER BY id ASC`, [req.params.id]
    );
    db.query(`UPDATE chat_messages SET read_by_staff = TRUE WHERE conversation_id = $1 AND sender = 'user' AND NOT read_by_staff`, [req.params.id]).catch(() => {});
    res.json({ conversation: conv.rows[0], messages: rows });
  } catch (err) {
    console.error('Chat conversation error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/chat/conversations/:id/messages — réponse du staff
app.post('/api/chat/conversations/:id/messages', requireAuth, requireAdmin, async (req, res) => {
  const body = (req.body?.body || '').toString().trim();
  if (!body) return res.status(400).json({ error: 'Message vide.' });
  if (body.length > CHAT_BODY_MAX) return res.status(400).json({ error: 'Message trop long.' });
  try {
    const conv = await db.query(`SELECT * FROM chat_conversations WHERE id = $1`, [req.params.id]);
    if (!conv.rows.length) return res.status(404).json({ error: 'Conversation introuvable.' });
    const { rows } = await db.query(
      `INSERT INTO chat_messages (conversation_id, sender, body, read_by_staff) VALUES ($1, 'staff', $2, TRUE) RETURNING id, sender, body, created_at`,
      [req.params.id, body]
    );
    await db.query(`UPDATE chat_conversations SET last_message_at = NOW(), status = 'open' WHERE id = $1`, [req.params.id]);
    const c = conv.rows[0];
    logActivity(req, 'chat.reply', c.guest_email || ('user#' + c.user_id));

    // Notifie l'utilisateur par email qu'il a une réponse.
    let toEmail = c.guest_email, notify = !!c.guest_email;
    if (c.user_id) {
      const u = await db.query(`SELECT email, notif_email FROM users WHERE id = $1`, [c.user_id]);
      if (u.rows.length) { toEmail = u.rows[0].email; notify = u.rows[0].notif_email !== false; }
    }
    if (notify && toEmail) {
      resend.emails.send({
        from: 'noreply@dujardin-delacour.com',
        to: toEmail,
        subject: 'Réponse de Dujardin Delacour & Cie',
        html: emailLayout(`
          <h2 style="font-family:Georgia,serif;font-size:1.1rem;font-weight:400;color:#1A1916;margin:0 0 6px;">Vous avez une réponse</h2>
          <p style="font-size:0.75rem;letter-spacing:0.12em;text-transform:uppercase;color:#9A8E7E;margin:0 0 24px;">Notre équipe vous a répondu</p>
          <p style="font-size:0.95rem;color:#1A1916;line-height:1.6;background:#EFECE5;padding:14px 16px;border-radius:6px;margin:0 0 20px;">${esc(body)}</p>
          <a href="${APP_URL}" style="display:inline-block;background:#1A1916;color:#fff;text-decoration:none;font-size:0.8rem;letter-spacing:0.08em;text-transform:uppercase;padding:12px 22px;border-radius:4px;">Poursuivre la conversation</a>`),
      }).catch(() => {});
    }
    res.status(201).json({ message: rows[0] });
  } catch (err) {
    console.error('Chat reply error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── Veille (dashboard) ───────────────────────────────────────────────────────
const VEILLE_TYPES    = ['web', 'social', 'radio', 'tv', 'presse'];
const SOCIAL_NETWORKS = ['facebook', 'youtube', 'instagram', 'x', 'linkedin'];
const VEILLE_SECTORS  = ['politique','economie','international','social','environnement','agriculture','tourisme','btp','mines','telecoms','autre'];

// Gating par abonnement : niveau minimal requis par secteur (0=générale, 1=sectorielle, 2=dédiée)
const PLAN_LEVEL = { generale: 0, sectorielle: 1, dediee: 2 };
const SECTOR_MIN_LEVEL = {
  politique: 0, economie: 0, international: 0, social: 0, autre: 0,
  environnement: 1, agriculture: 1, tourisme: 1, btp: 1,
  mines: 2, telecoms: 2,
};
const sectorsForLevel = (level) =>
  VEILLE_SECTORS.filter(s => (SECTOR_MIN_LEVEL[s] ?? 0) <= level);

// Programmation comparée par DATE en heure locale (Madagascar) pour éviter les
// décalages de fuseau (une date du jour stockée à minuit UTC tombait « dans le futur »).
const APP_TZ = 'Indian/Antananarivo';
const dlocal = (col) => `(${col} AT TIME ZONE '${APP_TZ}')::date`;
const scheduledSql = (col) => `(${dlocal(col)} > ${dlocal('NOW()')})`;     // date future → programmée
const visibleSql   = (col) => `(${dlocal(col)} <= ${dlocal('NOW()')})`;    // date ≤ aujourd'hui → visible

// GET /api/veille — liste (tous les connectés), filtres optionnels ?type=&sector=&q=
// Filtrage par abonnement : un compte ne reçoit que les secteurs autorisés par son plan.
app.get('/api/veille', requireAuth, async (req, res) => {
  const { type, sector, q, from, to } = req.query;
  const where = [];
  const params = [req.user.id]; // $1 = état (favori/lu) du compte courant

  try {
    const u = await db.query('SELECT plan, is_admin FROM users WHERE id = $1', [req.user.id]);
    const isAdmin = u.rows[0]?.is_admin;
    where.push(`vi.deleted_at IS NULL`); // exclut les veilles en corbeille
    if (!isAdmin) {
      const level   = PLAN_LEVEL[u.rows[0]?.plan] ?? 0;
      const allowed = sectorsForLevel(level);
      params.push(allowed);
      // visible si l'item a au moins un secteur autorisé (chevauchement) OU aucun secteur (actualité générale)
      where.push(`(vi.sectors IS NULL OR vi.sectors && $${params.length}::text[])`);
      // seules les veilles publiées sont visibles des abonnés (les brouillons restent internes)
      where.push(`vi.status = 'published'`);
      // les veilles programmées (date future) restent masquées jusqu'à leur date
      where.push(visibleSql('vi.published_at'));
    }

    if (type)   { params.push(type);    where.push(`$${params.length} = ANY(vi.source_types)`); }
    if (sector) { params.push(sector);  where.push(`$${params.length} = ANY(vi.sectors)`); }
    if (q)      { params.push(`%${q}%`); where.push(`(vi.title ILIKE $${params.length} OR vi.excerpt ILIKE $${params.length} OR vi.source ILIKE $${params.length})`); }
    // Filtre par période (dates en heure locale Madagascar)
    if (from)   { params.push(from); where.push(`${dlocal('vi.published_at')} >= $${params.length}::date`); }
    if (to)     { params.push(to);   where.push(`${dlocal('vi.published_at')} <= $${params.length}::date`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await db.query(
      `SELECT vi.id, vi.title, vi.source, vi.sources, vi.source_type, vi.source_types, vi.social_network, vi.sector, vi.sectors, vi.tone, vi.url, vi.excerpt, vi.image, vi.images, vi.video, vi.author,
              COALESCE(array_length(vi.images, 1), 0) AS images_count,
              (vi.video IS NOT NULL) AS has_video,
              vi.status, vi.pinned, vi.published_at, ${scheduledSql('vi.published_at')} AS scheduled, vi.created_at,
              COALESCE(vs.favorite, FALSE) AS favorite,
              COALESCE(vs.is_read,  FALSE) AS read
       FROM veille_items vi
       LEFT JOIN veille_states vs ON vs.veille_id = vi.id AND vs.user_id = $1
       ${clause}
       ORDER BY vi.pinned DESC, vi.published_at DESC, vi.id DESC LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('Veille list error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/veille/:id/state — favori / lu pour le compte courant
app.post('/api/veille/:id/state', requireAuth, async (req, res) => {
  const favorite = req.body.favorite ?? null;
  const read     = req.body.read ?? null;
  try {
    const { rows } = await db.query(
      `INSERT INTO veille_states (user_id, veille_id, favorite, is_read)
       VALUES ($1, $2, COALESCE($3, FALSE), COALESCE($4, FALSE))
       ON CONFLICT (user_id, veille_id) DO UPDATE SET
         favorite   = COALESCE($3, veille_states.favorite),
         is_read    = COALESCE($4, veille_states.is_read),
         updated_at = NOW()
       RETURNING favorite, is_read AS read`,
      [req.user.id, req.params.id, favorite, read]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Veille state error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/veille/trash — corbeille (admin DJD) — défini avant /:id
app.get('/api/veille/trash', requireAuth, requireAdmin, async (req, res) => {
  purgeVeilleTrash();
  try {
    const { rows } = await db.query(
      `SELECT id, title, source, sources, source_type, source_types, social_network, sector, url, excerpt, image, author,
              (video IS NOT NULL) AS has_video, status, pinned, published_at, created_at, deleted_at
       FROM veille_items WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    console.error('Veille trash error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/veille/public — vitrine grand public (sans compte) : Veille Générale publiée
app.get('/api/veille/public', async (req, res) => {
  try {
    const allowed = sectorsForLevel(0); // niveau Générale uniquement
    const { rows } = await db.query(
      `SELECT id, title, source, source_type, source_types, social_network, sector, sectors, tone, url, excerpt, image, author,
              COALESCE(array_length(images, 1), 0) AS images_count, (video IS NOT NULL) AS has_video,
              published_at
       FROM veille_items
       WHERE deleted_at IS NULL AND status = 'published' AND ${visibleSql('published_at')}
         AND (sectors IS NULL OR sectors && $1::text[])
       ORDER BY pinned DESC, published_at DESC, id DESC
       LIMIT 30`,
      [allowed]
    );
    res.json(rows);
  } catch (err) {
    console.error('Veille public error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/veille/:id — détail complet (avec vidéo), accès contrôlé comme la liste
app.get('/api/veille/:id', requireAuth, async (req, res) => {
  try {
    const u = await db.query('SELECT plan, is_admin FROM users WHERE id = $1', [req.user.id]);
    const isAdmin = u.rows[0]?.is_admin;
    const { rows } = await db.query(
      `SELECT id, title, source, sources, source_type, source_types, social_network, sector, sectors, tone, url, excerpt, image, images, video, author,
              status, pinned, published_at, ${scheduledSql('published_at')} AS scheduled, created_at
       FROM veille_items WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Veille introuvable.' });
    const item = rows[0];
    if (!isAdmin) {
      const level       = PLAN_LEVEL[u.rows[0]?.plan] ?? 0;
      const allowed     = sectorsForLevel(level);
      const itemSectors = item.sectors?.length ? item.sectors : (item.sector ? [item.sector] : []);
      const sectorOk    = !itemSectors.length || itemSectors.some(s => allowed.includes(s));
      if (item.status !== 'published' || item.scheduled || !sectorOk)
        return res.status(403).json({ error: 'Accès non autorisé.' });
    }
    res.json(item);
  } catch (err) {
    console.error('Veille get error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Normalise le réseau social : conservé uniquement si "social" fait partie des types.
function normalizeNetwork(types, social_network) {
  if (!types.includes('social')) return null;
  return SOCIAL_NETWORKS.includes(social_network) ? social_network : null;
}

// Normalise les types de source : tableau filtré sur VEILLE_TYPES, dédoublonné, ≥1.
function normalizeTypes(source_types, source_type) {
  let arr = Array.isArray(source_types) ? source_types : (source_type ? [source_type] : []);
  arr = [...new Set(arr.filter(t => VEILLE_TYPES.includes(t)))];
  return arr;
}

// Normalise les secteurs : tableau de secteurs valides, dédoublonnés (accepte l'ancien champ unique).
function normalizeSectors(sectors, sector) {
  let arr = Array.isArray(sectors) ? sectors : (sector ? [sector] : []);
  arr = [...new Set(arr.filter(s => VEILLE_SECTORS.includes(s)))];
  return arr;
}

// Indicateur de ton (PDF de veille) : positif / neutre / negatif, sinon null.
const VEILLE_TONES = ['positif', 'neutre', 'negatif'];
function normalizeTone(tone) {
  return VEILLE_TONES.includes(tone) ? tone : null;
}

// Normalise les comptes/pages/groupes : tableau de chaînes nettoyées, dédoublonnées.
function normalizeSources(sources, source) {
  let arr = Array.isArray(sources) ? sources : (source ? [source] : []);
  arr = arr.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
  return [...new Set(arr)];
}

// Normalise les images (URL ou base64) : tableau de chaînes non vides (max 10).
function normalizeImages(images, image) {
  let arr = Array.isArray(images) ? images : (image ? [image] : []);
  arr = arr.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
  return arr.slice(0, 10);
}

// Une date seule (aaaa-mm-jj) est ancrée à MIDI UTC : la date du calendrier reste
// identique quel que soit le fuseau d'affichage (corrige le décalage -1 jour à l'édition).
function normalizePublishedAt(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T12:00:00Z`;
  return v;
}

// POST /api/upload — upload de médias (images/vidéos) sur disque (admin DJD)
app.post('/api/upload', requireAuth, requireAdmin, upload.array('files', 10), (req, res) => {
  try {
    const urls = (req.files || []).map(f => `/uploads/veille/${f.filename}`);
    res.json({ urls });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Échec de l\'upload.' });
  }
});

// POST /api/veille — créer (admin DJD)
app.post('/api/veille', requireAuth, requireAdmin, async (req, res) => {
  let { title, source, sources, source_type, source_types, social_network, sector, sectors, tone, url, excerpt, image, images, video, author, published_at, status, pinned } = req.body;
  const types = normalizeTypes(source_types, source_type);
  if (!types.length) return res.status(400).json({ error: 'Au moins un type de source est requis.' });
  const sectorsArr = normalizeSectors(sectors, sector);
  if (!sectorsArr.length) return res.status(400).json({ error: 'Au moins un secteur est requis.' });
  const sectorPrimary = sectorsArr[0];
  if (!['draft', 'published'].includes(status)) status = 'published';
  const primary = types[0];
  const srcArr = normalizeSources(sources, source);
  const srcJoined = srcArr.length ? srcArr.join(', ') : null;
  const imgArr = normalizeImages(images, image);
  const imgPrimary = imgArr[0] || null;
  social_network = normalizeNetwork(types, social_network);
  const authorVal = types.includes('presse') ? (author?.trim() || null) : null;
  const toneVal = normalizeTone(tone);
  try {
    const { rows } = await db.query(
      `INSERT INTO veille_items (title, source, sources, source_type, source_types, social_network, sector, sectors, tone, url, excerpt, image, images, video, author, status, pinned, published_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,COALESCE($18, NOW()),$19)
       RETURNING id, title, source, sources, source_type, source_types, social_network, sector, sectors, tone, url, excerpt, image, video, author, status, pinned, published_at, ${scheduledSql('published_at')} AS scheduled, created_at`,
      [title?.trim() || null, srcJoined, srcArr, primary, types, social_network, sectorPrimary, sectorsArr, toneVal, url || null, excerpt || null, imgPrimary, imgArr, video || null, authorVal, status, !!pinned, normalizePublishedAt(published_at), req.user.id]
    );
    logActivity(req, 'veille.create', rows[0].source);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Veille create error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/veille/:id — modifier (admin DJD)
app.patch('/api/veille/:id', requireAuth, requireAdmin, async (req, res) => {
  let { title, source, sources, source_type, source_types, social_network, sector, sectors, tone, url, excerpt, image, images, video, author, published_at, status, pinned } = req.body;
  const types = normalizeTypes(source_types, source_type);
  if (!types.length) return res.status(400).json({ error: 'Au moins un type de source est requis.' });
  const sectorsArr = normalizeSectors(sectors, sector);
  if (!sectorsArr.length) return res.status(400).json({ error: 'Au moins un secteur est requis.' });
  const sectorPrimary = sectorsArr[0];
  if (!['draft', 'published'].includes(status)) status = 'published';
  const primary = types[0];
  const srcArr = normalizeSources(sources, source);
  const srcJoined = srcArr.length ? srcArr.join(', ') : null;
  const imgArr = normalizeImages(images, image);
  const imgPrimary = imgArr[0] || null;
  social_network = normalizeNetwork(types, social_network);
  const authorVal = types.includes('presse') ? (author?.trim() || null) : null;
  const toneVal = normalizeTone(tone);
  try {
    const before = await db.query('SELECT images, video FROM veille_items WHERE id = $1', [req.params.id]);
    const { rows } = await db.query(
      `UPDATE veille_items SET title=$1, source=$2, sources=$3, source_type=$4, source_types=$5, social_network=$6, sector=$7, sectors=$8, tone=$9, url=$10, excerpt=$11, image=$12, images=$13, video=$14, author=$15, status=$16, pinned=$17, published_at=COALESCE($18, published_at)
       WHERE id=$19
       RETURNING id, title, source, sources, source_type, source_types, social_network, sector, sectors, tone, url, excerpt, image, video, author, status, pinned, published_at, ${scheduledSql('published_at')} AS scheduled, created_at`,
      [title?.trim() || null, srcJoined, srcArr, primary, types, social_network, sectorPrimary, sectorsArr, toneVal, url || null, excerpt || null, imgPrimary, imgArr, video || null, authorVal, status, !!pinned, normalizePublishedAt(published_at), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Veille introuvable.' });
    // Médias retirés lors de l'édition → corbeille fichiers
    if (before.rows[0]) {
      const oldFiles = [...(before.rows[0].images || []), before.rows[0].video].filter(Boolean);
      const newFiles = [...imgArr, video || null].filter(Boolean);
      trashMediaFiles(oldFiles.filter(u => !newFiles.includes(u)));
    }
    logActivity(req, 'veille.update', rows[0].source);
    res.json(rows[0]);
  } catch (err) {
    console.error('Veille update error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/veille/:id/pin — épingler / désépingler (admin DJD)
app.patch('/api/veille/:id/pin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      'UPDATE veille_items SET pinned = $1 WHERE id = $2 RETURNING id, pinned, source',
      [!!req.body.pinned, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Veille introuvable.' });
    logActivity(req, req.body.pinned ? 'veille.pin' : 'veille.unpin', rows[0].source);
    res.json(rows[0]);
  } catch (err) {
    console.error('Veille pin error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/veille/:id — déplacer vers la corbeille (soft delete, admin DJD)
app.delete('/api/veille/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      'UPDATE veille_items SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING source',
      [req.params.id]
    );
    if (rows.length) logActivity(req, 'veille.delete', rows[0].source);
    res.json({ success: true });
  } catch (err) {
    console.error('Veille delete error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/veille/:id/restore — restaurer depuis la corbeille (admin DJD)
app.post('/api/veille/:id/restore', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(
      'UPDATE veille_items SET deleted_at = NULL WHERE id = $1 RETURNING source',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Veille introuvable.' });
    logActivity(req, 'veille.restore', rows[0].source);
    res.json({ success: true });
  } catch (err) {
    console.error('Veille restore error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/veille/:id/permanent — suppression définitive (admin DJD)
app.delete('/api/veille/:id/permanent', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM veille_items WHERE id = $1 RETURNING source, images, video', [req.params.id]);
    if (rows[0]) trashMediaFiles([...(rows[0].images || []), rows[0].video]);
    logActivity(req, 'veille.purge', rows[0]?.source);
    res.json({ success: true });
  } catch (err) {
    console.error('Veille purge error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── Alertes « Option » (temps réel) ─────────────────────────────────────────
const ALERT_KINDS = ['realtime', 'daily', 'weekly'];

// Construit le HTML d'une alerte temps réel (même charte que les autres emails).
function alertEmailHtml(a) {
  const dateStr = a.published_at
    ? new Date(a.published_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: APP_TZ })
    : '';
  let sourceLine = '';
  if (a.source || a.url) {
    const label = esc(a.source || 'Lien');
    const value = a.url ? `<a href="${esc(a.url)}" style="color:#8B6B3D;">${label}</a>` : label;
    sourceLine = `<p style="font-size:0.85rem;color:#6B6560;margin:20px 0 0;"><strong style="color:#9A8E7E;">Source :</strong> ${value}</p>`;
  }
  return emailLayout(`
    <p style="font-size:0.7rem;letter-spacing:0.14em;text-transform:uppercase;color:#B23A2E;font-weight:700;margin:0 0 12px;">⚡ Alerte — temps réel</p>
    ${dateStr ? `<p style="font-size:0.78rem;color:#9A8E7E;margin:0 0 6px;">${dateStr}</p>` : ''}
    <h2 style="font-family:Georgia,serif;font-size:1.15rem;font-weight:400;color:#1A1916;line-height:1.45;margin:0 0 16px;">${esc(a.title)}</h2>
    ${a.context ? `<p style="font-size:0.95rem;color:#3A352F;line-height:1.7;white-space:pre-line;margin:0;">${esc(a.context)}</p>` : ''}
    ${sourceLine}
  `);
}

const clip = (v, max) => (typeof v === 'string' ? v : '').trim().slice(0, max);

// Rubriques → faits (date facultative pour le bulletin hebdo, texte, sources, lien). Partagé récap/bulletin.
function normalizeRubriques(rubriques) {
  return (Array.isArray(rubriques) ? rubriques : []).map(r => ({
    name: clip(r?.name, 120),
    facts: (Array.isArray(r?.facts) ? r.facts : []).map(f => ({
      date:    clip(f?.date, 20),
      text:    clip(f?.text, 2000),
      sources: clip(f?.sources, 300),
      url:     clip(f?.url, 500),
    })).filter(f => f.text),
  })).filter(r => r.name || r.facts.length);
}

// Récapitulatif quotidien : rubriques + faits à suivre.
function normalizeRecapPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return { rubriques: normalizeRubriques(payload.rubriques), follow_up: clip(payload.follow_up, 1000) };
}

// Bulletin hebdomadaire : période + résumé exécutif + rubriques + tendances + signaux d'alerte.
function normalizeBulletinPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return {
    period_from: clip(payload.period_from, 20),
    period_to:   clip(payload.period_to, 20),
    summary:     clip(payload.summary, 3000),
    rubriques:   normalizeRubriques(payload.rubriques),
    trends:      clip(payload.trends, 2000),
    signals:     clip(payload.signals, 2000),
  };
}

// Diffuse un email à tous les abonnés (hors comptes DJD), par paquets de 45 en BCC. Renvoie le nb de destinataires.
async function broadcastToSubscribers(subject, html) {
  const { rows } = await db.query(
    `SELECT email FROM users WHERE is_admin = FALSE AND deleted_at IS NULL AND notif_email <> FALSE AND email IS NOT NULL`
  );
  const recipients = [...new Set(rows.map(r => r.email.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) return 0;
  for (let i = 0; i < recipients.length; i += 45) {
    resend.emails.send({
      from:    'noreply@dujardin-delacour.com',
      to:      'noreply@dujardin-delacour.com',
      bcc:     recipients.slice(i, i + 45),
      subject,
      html,
    }).catch(err => console.error('Broadcast email error:', err));
  }
  return recipients.length;
}

// GET /api/alerts?kind= — temps réel : admin uniquement ; récap/bulletin : tous les abonnés.
app.get('/api/alerts', requireAuth, async (req, res) => {
  const kind = ALERT_KINDS.includes(req.query.kind) ? req.query.kind : 'realtime';
  try {
    const u = await db.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
    const isAdmin = u.rows[0]?.is_admin;
    if (kind === 'realtime' && !isAdmin) return res.status(403).json({ error: 'Accès réservé à l\'équipe DJD.' });
    const where  = ['kind = $1'];
    const params = [kind];
    if (!isAdmin) where.push(visibleSql('published_at')); // un abonné ne voit pas une publication post-datée
    const { rows } = await db.query(
      `SELECT id, kind, title, source, url, context, payload, published_at, created_at
       FROM alerts WHERE ${where.join(' AND ')} ORDER BY published_at DESC, id DESC LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('Alerts list error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Valide le corps d'une alerte/récap/bulletin selon son type. Renvoie { error } ou { title, payload }.
function prepareAlert(kind, body) {
  if (kind === 'realtime') {
    if (!body.title?.trim()) return { error: 'Le titre est requis.' };
    return { title: body.title.trim(), payload: null };
  }
  const payload = kind === 'weekly' ? normalizeBulletinPayload(body.payload) : normalizeRecapPayload(body.payload);
  if (!payload || !payload.rubriques.some(r => r.facts.length))
    return { error: 'Ajoutez au moins une rubrique contenant un fait.' };
  const fallback = kind === 'daily' ? 'Récapitulatif quotidien' : 'Bulletin hebdomadaire';
  return { title: (body.title?.trim() || fallback), payload };
}

// POST /api/alerts — créer + diffuser par email (admin DJD)
app.post('/api/alerts', requireAuth, requireAdmin, async (req, res) => {
  let { kind, source, url, context, published_at } = req.body;
  kind = ALERT_KINDS.includes(kind) ? kind : 'realtime';
  const prep = prepareAlert(kind, req.body);
  if (prep.error) return res.status(400).json({ error: prep.error });
  try {
    const { rows } = await db.query(
      `INSERT INTO alerts (kind, title, source, url, context, payload, published_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, NOW()),$8)
       RETURNING id, kind, title, source, url, context, payload, published_at, created_at`,
      [kind, prep.title, source?.trim() || null, url?.trim() || null, context?.trim() || null,
       prep.payload ? JSON.stringify(prep.payload) : null, normalizePublishedAt(published_at), req.user.id]
    );
    const alert = rows[0];
    // Diffusion email : uniquement le temps réel (contenu complet). Récap/bulletin = consultables sur le site, sans email.
    let sent = 0;
    if (kind === 'realtime') sent = await broadcastToSubscribers(`⚡ Alerte — ${alert.title}`.slice(0, 120), alertEmailHtml(alert));
    logActivity(req, 'alert.create', alert.title);
    res.status(201).json({ ...alert, sent });
  } catch (err) {
    console.error('Alert create error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/alerts/:id — modifier (correction, sans re-diffuser) (admin DJD)
app.patch('/api/alerts/:id', requireAuth, requireAdmin, async (req, res) => {
  const { source, url, context, published_at } = req.body;
  try {
    const existing = await db.query('SELECT kind FROM alerts WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Alerte introuvable.' });
    const kind = existing.rows[0].kind;
    const prep = prepareAlert(kind, req.body);
    if (prep.error) return res.status(400).json({ error: prep.error });
    const { rows } = await db.query(
      `UPDATE alerts SET title=$1, source=$2, url=$3, context=$4, payload=$5, published_at=COALESCE($6, published_at)
       WHERE id=$7 RETURNING id, kind, title, source, url, context, payload, published_at, created_at`,
      [prep.title, source?.trim() || null, url?.trim() || null, context?.trim() || null,
       prep.payload ? JSON.stringify(prep.payload) : null, normalizePublishedAt(published_at), req.params.id]
    );
    logActivity(req, 'alert.update', rows[0].title);
    res.json(rows[0]);
  } catch (err) {
    console.error('Alert update error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/alerts/:id — supprimer (admin DJD)
app.delete('/api/alerts/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM alerts WHERE id = $1 RETURNING title', [req.params.id]);
    if (rows.length) logActivity(req, 'alert.delete', rows[0].title);
    res.json({ success: true });
  } catch (err) {
    console.error('Alert delete error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ─── Servir le front Angular en production ────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const DIST_FOLDER = path.join(__dirname, '..', 'dist', 'djd', 'browser');
  app.use(express.static(DIST_FOLDER));
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_FOLDER, 'index.html'));
  });
}

app.listen(PORT, () => console.log(`✅ Serveur DJD démarré sur http://localhost:${PORT}`));
