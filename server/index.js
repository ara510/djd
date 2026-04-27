require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Resend } = require('resend');

const app    = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT   = process.env.PORT || 3000;

app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());

app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Champs manquants.' });
  }

  try {
    await resend.emails.send({
      from:    'onboarding@resend.dev',
      to:      'nathanrakotomavo05@gmail.com',
      subject: `[Site Web DJD] Nouveau message de ${name}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; background: #EFECE5; border-radius: 6px; overflow: hidden;">

          <!-- Header -->
          <div style="background: #1a191600; padding: 32px 40px; text-align: center;">
            <img
              src="https://ara510.github.io/djd/DJD.png"
              alt="Dujardin Delacour & Cie"
              width="200"
              style="display: block; margin: 0 auto; max-width: 120px;"
            />
          </div>

          <!-- Body -->
          <div style="padding: 36px 40px;">
            <h2 style="font-family: Georgia, serif; font-size: 1.1rem; font-weight: 400; color: #1A1916; margin: 0 0 6px;">
              Nouveau message reçu
            </h2>
            <p style="font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; color: #9A8E7E; margin: 0 0 28px;">
              Formulaire de contact — Site web
            </p>

            <hr style="border: none; border-top: 1px solid #D4CFCA; margin: 0 0 24px;" />

            <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
              <tr>
                <td style="padding: 8px 0; color: #9A8E7E; width: 90px; vertical-align: top;">Nom</td>
                <td style="padding: 8px 0; color: #1A1916; font-weight: 600;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #9A8E7E; vertical-align: top;">Email</td>
                <td style="padding: 8px 0;">
                  <a href="mailto:${email}" style="color: #1A1916;">${email}</a>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #9A8E7E; vertical-align: top;">Message</td>
                <td style="padding: 8px 0; color: #1A1916; white-space: pre-line; line-height: 1.7;">${message}</td>
              </tr>
            </table>

            <hr style="border: none; border-top: 1px solid #D4CFCA; margin: 28px 0 0;" />
          </div>

          <!-- Footer -->
          <div style="padding: 16px 40px 28px; text-align: center;">
            <p style="font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; color: #9A8E7E; margin: 0;">
              Dujardin Delacour & Cie — Antananarivo, Madagascar
            </p>
          </div>

        </div>
      `,
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ error: 'Échec de l\'envoi.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Serveur DJD démarré sur http://localhost:${PORT}`);
})