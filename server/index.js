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

// ─── Veille (dashboard) ───────────────────────────────────────────────────────
const VEILLE_TYPES    = ['web', 'social', 'radio', 'tv', 'presse'];
const SOCIAL_NETWORKS = ['facebook', 'youtube', 'instagram', 'x', 'linkedin'];
const VEILLE_SECTORS  = ['politique','economie','international','social','environnement','agriculture','tourisme','btp','mines','telecoms','biodiversite','autre'];

// Gating par abonnement : niveau minimal requis par secteur (0=générale, 1=sectorielle, 2=dédiée)
const PLAN_LEVEL = { generale: 0, sectorielle: 1, dediee: 2 };
const SECTOR_MIN_LEVEL = {
  politique: 0, economie: 0, international: 0, social: 0, autre: 0,
  environnement: 1, agriculture: 1, tourisme: 1, btp: 1,
  mines: 2, telecoms: 2, biodiversite: 2,
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
      // secteurs autorisés OU items sans secteur (actualité générale)
      where.push(`(vi.sector IS NULL OR vi.sector = ANY($${params.length}))`);
      // seules les veilles publiées sont visibles des abonnés (les brouillons restent internes)
      where.push(`vi.status = 'published'`);
      // les veilles programmées (date future) restent masquées jusqu'à leur date
      where.push(visibleSql('vi.published_at'));
    }

    if (type)   { params.push(type);    where.push(`$${params.length} = ANY(vi.source_types)`); }
    if (sector) { params.push(sector);  where.push(`vi.sector = $${params.length}`); }
    if (q)      { params.push(`%${q}%`); where.push(`(vi.title ILIKE $${params.length} OR vi.excerpt ILIKE $${params.length} OR vi.source ILIKE $${params.length})`); }
    // Filtre par période (dates en heure locale Madagascar)
    if (from)   { params.push(from); where.push(`${dlocal('vi.published_at')} >= $${params.length}::date`); }
    if (to)     { params.push(to);   where.push(`${dlocal('vi.published_at')} <= $${params.length}::date`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await db.query(
      `SELECT vi.id, vi.title, vi.source, vi.sources, vi.source_type, vi.source_types, vi.social_network, vi.sector, vi.url, vi.excerpt, vi.image, vi.author,
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

// GET /api/veille/:id — détail complet (avec vidéo), accès contrôlé comme la liste
app.get('/api/veille/:id', requireAuth, async (req, res) => {
  try {
    const u = await db.query('SELECT plan, is_admin FROM users WHERE id = $1', [req.user.id]);
    const isAdmin = u.rows[0]?.is_admin;
    const { rows } = await db.query(
      `SELECT id, title, source, sources, source_type, source_types, social_network, sector, url, excerpt, image, images, video, author,
              status, pinned, published_at, ${scheduledSql('published_at')} AS scheduled, created_at
       FROM veille_items WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Veille introuvable.' });
    const item = rows[0];
    if (!isAdmin) {
      const level    = PLAN_LEVEL[u.rows[0]?.plan] ?? 0;
      const allowed  = sectorsForLevel(level);
      const sectorOk = !item.sector || allowed.includes(item.sector);
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
  let { title, source, sources, source_type, source_types, social_network, sector, url, excerpt, image, images, video, author, published_at, status, pinned } = req.body;
  const types = normalizeTypes(source_types, source_type);
  if (!types.length) return res.status(400).json({ error: 'Au moins un type de source est requis.' });
  if (!VEILLE_SECTORS.includes(sector)) return res.status(400).json({ error: 'Le secteur est requis.' });
  if (!['draft', 'published'].includes(status)) status = 'published';
  const primary = types[0];
  const srcArr = normalizeSources(sources, source);
  const srcJoined = srcArr.length ? srcArr.join(', ') : null;
  const imgArr = normalizeImages(images, image);
  const imgPrimary = imgArr[0] || null;
  social_network = normalizeNetwork(types, social_network);
  const authorVal = types.includes('presse') ? (author?.trim() || null) : null;
  try {
    const { rows } = await db.query(
      `INSERT INTO veille_items (title, source, sources, source_type, source_types, social_network, sector, url, excerpt, image, images, video, author, status, pinned, published_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16, NOW()),$17)
       RETURNING id, title, source, sources, source_type, source_types, social_network, sector, url, excerpt, image, video, author, status, pinned, published_at, ${scheduledSql('published_at')} AS scheduled, created_at`,
      [title?.trim() || null, srcJoined, srcArr, primary, types, social_network, sector, url || null, excerpt || null, imgPrimary, imgArr, video || null, authorVal, status, !!pinned, published_at || null, req.user.id]
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
  let { title, source, sources, source_type, source_types, social_network, sector, url, excerpt, image, images, video, author, published_at, status, pinned } = req.body;
  const types = normalizeTypes(source_types, source_type);
  if (!types.length) return res.status(400).json({ error: 'Au moins un type de source est requis.' });
  if (!VEILLE_SECTORS.includes(sector)) return res.status(400).json({ error: 'Le secteur est requis.' });
  if (!['draft', 'published'].includes(status)) status = 'published';
  const primary = types[0];
  const srcArr = normalizeSources(sources, source);
  const srcJoined = srcArr.length ? srcArr.join(', ') : null;
  const imgArr = normalizeImages(images, image);
  const imgPrimary = imgArr[0] || null;
  social_network = normalizeNetwork(types, social_network);
  const authorVal = types.includes('presse') ? (author?.trim() || null) : null;
  try {
    const before = await db.query('SELECT images, video FROM veille_items WHERE id = $1', [req.params.id]);
    const { rows } = await db.query(
      `UPDATE veille_items SET title=$1, source=$2, sources=$3, source_type=$4, source_types=$5, social_network=$6, sector=$7, url=$8, excerpt=$9, image=$10, images=$11, video=$12, author=$13, status=$14, pinned=$15, published_at=COALESCE($16, published_at)
       WHERE id=$17
       RETURNING id, title, source, sources, source_type, source_types, social_network, sector, url, excerpt, image, video, author, status, pinned, published_at, ${scheduledSql('published_at')} AS scheduled, created_at`,
      [title?.trim() || null, srcJoined, srcArr, primary, types, social_network, sector, url || null, excerpt || null, imgPrimary, imgArr, video || null, authorVal, status, !!pinned, published_at || null, req.params.id]
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

// ─── Servir le front Angular en production ────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const DIST_FOLDER = path.join(__dirname, '..', 'dist', 'djd', 'browser');
  app.use(express.static(DIST_FOLDER));
  app.get('*', (req, res) => {
    res.sendFile(path.join(DIST_FOLDER, 'index.html'));
  });
}

app.listen(PORT, () => console.log(`✅ Serveur DJD démarré sur http://localhost:${PORT}`));
