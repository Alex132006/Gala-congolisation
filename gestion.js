// script.js - À ajouter avant </body> sur les pages couple.html et unite.html
document.addEventListener("DOMContentLoaded", function () {
  const submitBtn = document.querySelector(".users-btn");

  submitBtn.addEventListener("click", function () {
    // Déterminer le type de formulaire (couple ou unite)
    const isCouplePage = document
      .querySelector(".billet h1")
      .textContent.includes("Couple");
    const type = isCouplePage ? "couple" : "unite";

    let clientData;

    if (type === "couple") {
      // Récupération des données pour COUPLE
      const nom1 = document.getElementById("user1").value.trim();
      const nom2 = document.getElementById("user2").value.trim();
      const email = document.getElementById("email").value.trim();
      const phone = document.getElementById("phone").value.trim();

      // Validation
      if (!nom1 || !email || !phone) {
        alert("Veuillez remplir tous les champs obligatoires");
        return;
      }

      if (!validateEmail(email)) {
        alert("Veuillez entrer un email valide");
        return;
      }

      clientData = {
        nom1: nom1,
        nom2: nom2,
        email: email,
        phone: phone,
        type: "couple",
        timestamp: new Date().toISOString(),
      };
    } else {
      // Récupération des données pour UNITE
      const nom = document.getElementById("user").value.trim();
      const email = document.getElementById("email").value.trim();
      const phone = document.getElementById("phone").value.trim();

      // Validation
      if (!nom || !email || !phone) {
        alert("Veuillez remplir tous les champs obligatoires");
        return;
      }

      if (!validateEmail(email)) {
        alert("Veuillez entrer un email valide");
        return;
      }

      clientData = {
        nom1: nom,
        nom2: null,
        email: email,
        phone: phone,
        type: "unite",
        timestamp: new Date().toISOString(),
      };
    }

    // Sauvegarde des données
    saveClientData(clientData);

    // Message de confirmation
    alert("Merci ! Vos informations ont été enregistrées.");

    // Réinitialisation du formulaire
    resetForm(type);
  });

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  function saveClientData(clientData) {
    // Récupération des données existantes
    let clients = JSON.parse(localStorage.getItem("bielleterie_clients")) || [];

    // Vérifier si l'email n'existe pas déjà
    const existingClient = clients.find(
      (client) => client.email === clientData.email
    );
    if (existingClient) {
      if (
        !confirm(
          "Cet email est déjà enregistré. Voulez-vous mettre à jour les informations ?"
        )
      ) {
        return;
      }
      // Mettre à jour le client existant
      const index = clients.findIndex(
        (client) => client.email === clientData.email
      );
      clients[index] = clientData;
    } else {
      // Ajouter le nouveau client
      clients.push(clientData);
    }

    // Sauvegarde
    localStorage.setItem("bielleterie_clients", JSON.stringify(clients));

    console.log("Client enregistré:", clientData);
  }

  function resetForm(type) {
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
});
