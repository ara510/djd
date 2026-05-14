require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');
const { Resend } = require('resend');

const app    = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT   = process.env.PORT || 3000;

// ─── PostgreSQL pool ───────────────────────────────────────────────────────────
// En prod (Neon) : DATABASE_URL avec SSL. En dev : paramètres individuels.
const db = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     process.env.DB_PORT     || 5432,
        database: process.env.DB_NAME     || 'djd-ws-db',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
      }
);

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200').split(',');
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '5mb' }));

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
db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});

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
      'INSERT INTO users (nom, prenoms, date_naissance, email, username, password_hash, terms_accepted) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nom, prenoms, email, username, date_naissance, avatar, telephone, pays, ville, genre, notif_email, email_verified, phone_verified, created_at, deleted_at',
      [nom, prenoms, date_naissance, email, username, hash, true]
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
      'SELECT id, nom, prenoms, email, username, password_hash, avatar, date_naissance, telephone, pays, ville, genre, notif_email, email_verified, phone_verified, created_at, deleted_at FROM users WHERE username = $1',
      [username]
    );
    if (!rows.length) return res.status(401).json({ error: 'Identifiants incorrects.' });

    const user  = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects.' });

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
      'SELECT id, nom, prenoms, email, username, date_naissance, avatar, telephone, pays, ville, genre, notif_email, email_verified, phone_verified, created_at, deleted_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });
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

    const newAvatar = avatar !== undefined ? avatar : user.avatar;

    const { rows: updated } = await db.query(
      `UPDATE users SET nom=$1, prenoms=$2, email=$3, username=$4, date_naissance=$5, avatar=$6, password_hash=$7,
       telephone=$8, pays=$9, ville=$10, genre=$11, notif_email=$12
       WHERE id=$13
       RETURNING id, nom, prenoms, email, username, date_naissance, avatar, telephone, pays, ville, genre, notif_email, email_verified, phone_verified, created_at, deleted_at`,
      [nom, prenoms, email, username, date_naissance, newAvatar, newHash,
       telephone ?? null, pays ?? null, ville ?? null, genre ?? null,
       notif_email !== undefined ? notif_email : true,
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
       RETURNING id, nom, prenoms, email, username, date_naissance, avatar, telephone, pays, ville, genre, notif_email, email_verified, phone_verified, created_at, deleted_at`,
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

// ─── POST /api/contact ─────────────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message)
    return res.status(400).json({ error: 'Champs manquants.' });

  try {
    await resend.emails.send({
      from:    'onboarding@resend.dev',
      to:      'nathanrakotomavo05@gmail.com',
      subject: `[Site Web DJD] Nouveau message de ${name}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #EFECE5; border-radius: 6px; overflow: hidden;">
          <div style="background: #1a191600; padding: 32px 40px; text-align: center;">
            <img src="https://ara510.github.io/djd/DJD.png" alt="Dujardin Delacour & Cie" width="200" style="display:block;margin:0 auto;max-width:120px;" />
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

app.listen(PORT, () => console.log(`✅ Serveur DJD démarré sur http://localhost:${PORT}`));
