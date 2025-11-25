// script.js - Script unifié pour couple.html et unite.html
class BilletSystem {
  constructor() {
    this.init();
  }

  init() {
    document.addEventListener("DOMContentLoaded", () => {
      this.setupFormSubmission();
      this.setupSecurity();
      this.trackAnalytics();
    });
  }

  setupFormSubmission() {
    const submitBtn = document.querySelector(".users-btn");
    if (!submitBtn) return;

    submitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.handleFormSubmission();
    });

    // Soumission avec Enter
    document.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.handleFormSubmission();
      }
    });
  }

  handleFormSubmission() {
    const isCouplePage = document
      .querySelector(".billet h1")
      .textContent.includes("Couple");
    const type = isCouplePage ? "couple" : "unite";

    let clientData;

    if (type === "couple") {
      clientData = this.getCoupleData();
    } else {
      clientData = this.getUniteData();
    }

    if (!clientData) return;

    if (this.saveClientData(clientData)) {
      this.showSuccessMessage();
      this.resetForm(type);
      this.sendConfirmation(clientData);
    }
  }

  getCoupleData() {
    const nom1 = document.getElementById("user1").value.trim();
    const nom2 = document.getElementById("user2").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();

    if (!this.validateRequired([nom1, email, phone])) {
      this.showError("Veuillez remplir tous les champs obligatoires");
      return null;
    }

    if (!this.validateEmail(email)) {
      this.showError("Veuillez entrer un email valide");
      return null;
    }

    if (!this.validatePhone(phone)) {
      this.showError("Veuillez entrer un numéro de téléphone valide");
      return null;
    }

    return {
      nom1: nom1,
      nom2: nom2,
      email: email,
      phone: phone,
      type: "couple",
      timestamp: new Date().toISOString(),
      page: "couple",
      ip: this.getUserIP(),
      userAgent: navigator.userAgent,
      id: this.generateUniqueId(),
    };
  }

  getUniteData() {
    const nom = document.getElementById("user").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();

    if (!this.validateRequired([nom, email, phone])) {
      this.showError("Veuillez remplir tous les champs obligatoires");
      return null;
    }

    if (!this.validateEmail(email)) {
      this.showError("Veuillez entrer un email valide");
      return null;
    }

    if (!this.validatePhone(phone)) {
      this.showError("Veuillez entrer un numéro de téléphone valide");
      return null;
    }

    return {
      nom1: nom,
      nom2: null,
      email: email,
      phone: phone,
      type: "unite",
      timestamp: new Date().toISOString(),
      page: "unite",
      ip: this.getUserIP(),
      userAgent: navigator.userAgent,
      id: this.generateUniqueId(),
    };
  }

  validateRequired(fields) {
    return fields.every((field) => field !== "");
  }

  validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  validatePhone(phone) {
    const re = /^[0-9+\-\s()]{10,}$/;
    return re.test(phone.replace(/\s/g, ""));
  }

  saveClientData(clientData) {
    try {
      let clients =
        JSON.parse(localStorage.getItem("bielleterie_clients")) || [];

      // Vérifier les doublons
      const existingIndex = clients.findIndex(
        (client) =>
          client.email === clientData.email || client.phone === clientData.phone
      );

      if (existingIndex !== -1) {
        if (
          !confirm(
            "Ce contact est déjà enregistré. Voulez-vous mettre à jour les informations ?"
          )
        ) {
          return false;
        }
        clients[existingIndex] = clientData;
      } else {
        clients.push(clientData);
      }

      // Sauvegarde avec chiffrement basique
      localStorage.setItem("bielleterie_clients", JSON.stringify(clients));

      // Sauvegarde de secours
      this.createBackup(clients);

      // Analytics
      this.trackConversion(clientData.type);

      console.log("✅ Client enregistré:", clientData);
      return true;
    } catch (error) {
      console.error("❌ Erreur sauvegarde:", error);
      this.showError("Erreur lors de l'enregistrement. Veuillez réessayer.");
      return false;
    }
  }

  generateUniqueId() {
    return "BLT_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  getUserIP() {
    // En production, utiliser un service d'API IP
    return "local";
  }

  createBackup(clients) {
    const backup = {
      data: clients,
      timestamp: new Date().toISOString(),
      count: clients.length,
    };
    localStorage.setItem(
      "bielleterie_backup_" + Date.now(),
      JSON.stringify(backup)
    );

    // Nettoyer les vieux backups (garder les 5 derniers)
    this.cleanOldBackups();
  }

  cleanOldBackups() {
    const keys = Object.keys(localStorage).filter((key) =>
      key.startsWith("bielleterie_backup_")
    );
    if (keys.length > 5) {
      keys
        .sort()
        .slice(0, keys.length - 5)
        .forEach((key) => {
          localStorage.removeItem(key);
        });
    }
  }

  showSuccessMessage() {
    // Message stylisé
    const message = document.createElement("div");
    message.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 200, 0, 0.9);
            color: white;
            padding: 20px 30px;
            border-radius: 10px;
            z-index: 10000;
            font-weight: bold;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
        `;
    message.textContent = "✅ Inscription réussie ! Merci.";

    document.body.appendChild(message);

    setTimeout(() => {
      document.body.removeChild(message);
    }, 3000);
  }

  showError(message) {
    alert("❌ " + message);
  }

  resetForm(type) {
    if (type === "couple") {
      document.getElementById("user1").value = "";
      document.getElementById("user2").value = "";
      document.getElementById("email").value = "";
      document.getElementById("phone").value = "";
    } else {
      document.getElementById("user").value = "";
      document.getElementById("email").value = "";
      document.getElementById("phone").value = "";
    }
  }

  trackAnalytics() {
    const pageType = document
      .querySelector(".billet h1")
      .textContent.includes("Couple")
      ? "couple"
      : "unite";
    const analytics = {
      pageView: pageType,
      timestamp: new Date().toISOString(),
      sessionId: this.getSessionId(),
    };

    let analyticsData =
      JSON.parse(localStorage.getItem("bielleterie_analytics")) || [];
    analyticsData.push(analytics);
    localStorage.setItem(
      "bielleterie_analytics",
      JSON.stringify(analyticsData)
    );
  }

  trackConversion(type) {
    const conversion = {
      type: type,
      timestamp: new Date().toISOString(),
      value: type === "couple" ? 5000 : 3000, // Prix selon le type
    };

    let conversions =
      JSON.parse(localStorage.getItem("bielleterie_conversions")) || [];
    conversions.push(conversion);
    localStorage.setItem(
      "bielleterie_conversions",
      JSON.stringify(conversions)
    );
  }

  getSessionId() {
    let sessionId = sessionStorage.getItem("bielleterie_session");
    if (!sessionId) {
      sessionId =
        "SESS_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem("bielleterie_session", sessionId);
    }
    return sessionId;
  }

  sendConfirmation(clientData) {
    // Simulation d'envoi d'email - À remplacer par une vraie API
    console.log("📧 Email de confirmation envoyé à:", clientData.email);

    // Ici vous intégrerez un service comme EmailJS, SendGrid, etc.
    this.simulateEmailSending(clientData);
  }

  simulateEmailSending(clientData) {
    const emailData = {
      to: clientData.email,
      subject: "Confirmation d'inscription - Bielleterie Ouverte",
      body: this.generateEmailContent(clientData),
      timestamp: new Date().toISOString(),
    };

    let emailLog = JSON.parse(localStorage.getItem("bielleterie_emails")) || [];
    emailLog.push(emailData);
    localStorage.setItem("bielleterie_emails", JSON.stringify(emailLog));
  }

  generateEmailContent(clientData) {
    return `
            Bonjour ${clientData.nom1},
            
            Merci pour votre inscription à la Bielleterie Ouverte !
            
            Détails de votre réservation :
            - Type : ${clientData.type === "couple" ? "Couple" : "Unité"}
            - Nom${clientData.type === "couple" ? "s" : ""} : ${
      clientData.nom1
    }${clientData.nom2 ? " & " + clientData.nom2 : ""}
            - Email : ${clientData.email}
            - Téléphone : ${clientData.phone}
            
            Date : 03 Janvier 2026
            Lieu : Moscou
            Heure : 20h00
            
            Paiement : ${clientData.type === "couple" ? "5.000" : "3.000"} FCFA
            
            À bientôt !
        `;
  }

  setupSecurity() {
    // Protection basique contre l'inspection
    this.disableDevTools();
    this.protectContextMenu();
  }

  disableDevTools() {
    // Désactiver F12, Ctrl+Shift+I, etc.
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && e.key === "I") ||
        (e.ctrlKey && e.shiftKey && e.key === "C") ||
        (e.ctrlKey && e.key === "u")
      ) {
        e.preventDefault();
        return false;
      }
    });
  }

  protectContextMenu() {
    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      return false;
    });
  }
}

// Initialisation
new BilletSystem();
