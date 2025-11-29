// server.js
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// Configuration Mailtrap
const transporter = nodemailer.createTransporter({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "VOTRE_USER_MAILTRAP", // À remplacer
    pass: "VOTRE_PASS_MAILTRAP", // À remplacer
  },
});

// Route pour envoyer les emails d'inscription
app.post("/send-inscription", async (req, res) => {
  try {
    const { nom1, nom2, email, phone, type, amount } = req.body;

    const mailOptions = {
      from: '"Bielleterie" <noreply@bielleterie.com>',
      to: "votre-email@domaine.com", // Email où recevoir les notifications
      subject: `Nouvelle inscription ${type.toUpperCase()} - Bielleterie`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ff6b6b;">Nouvelle Inscription Bielleterie</h2>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px;">
            <h3>Détails de l'inscription</h3>
            <p><strong>Type:</strong> ${type}</p>
            <p><strong>Nom 1:</strong> ${nom1}</p>
            ${nom2 ? `<p><strong>Nom 2:</strong> ${nom2}</p>` : ""}
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Téléphone:</strong> ${phone}</p>
            <p><strong>Montant:</strong> ${amount} ₽</p>
            <p><strong>Date:</strong> ${new Date().toLocaleString("fr-FR")}</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Email envoyé avec succès" });
  } catch (error) {
    console.error("Erreur envoi email:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
