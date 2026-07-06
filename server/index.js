// ── Serveur DJD (site vitrine) ────────────────────────────────────────────────
// Seul endpoint actif : le formulaire de contact (email via Resend).
// Aucune base de données, aucune authentification.
// (L'ancien serveur complet veille/auth est sauvegardé dans index.full.js.bak.)
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { Resend } = require('resend');

const app     = express();
const PORT    = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || 'http://localhost:4200';
const resend  = new Resend(process.env.RESEND_API_KEY);

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:4200' }));
app.use(express.json({ limit: '1mb' }));

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
    // En dev (Resend non configuré), on n'échoue pas : on log le message en console.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[DEV] Email contact non envoyé (${err.message}). De ${name} <${email}> : ${message}`);
      return res.status(200).json({ success: true });
    }
    console.error('Resend error:', err);
    res.status(500).json({ error: 'Échec de l\'envoi.' });
  }
});

// ─── Servir le front Angular en production ────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const DIST_FOLDER = path.join(__dirname, '..', 'dist', 'djd', 'browser');
  app.use(express.static(DIST_FOLDER));
  app.get('*', (req, res) => res.sendFile(path.join(DIST_FOLDER, 'index.html')));
}

app.listen(PORT, () => console.log(`✅ Serveur DJD (vitrine) démarré sur http://localhost:${PORT}`));
