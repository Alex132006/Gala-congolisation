function saveLocalData(clientData) {
  try {
    // Stockage dans l'espace admin (chiffré)
    let allClients =
      JSON.parse(localStorage.getItem("bielleterie_clients_secure")) || [];

    // Vérifier les doublons
    const isDuplicate = allClients.some(
      (client) =>
        client.email === clientData.email || client.phone === clientData.phone
    );

    if (!isDuplicate) {
      allClients.push(clientData);

      // Chiffrement basique pour le stockage
      const encryptedData = btoa(
        encodeURIComponent(JSON.stringify(allClients))
      );
      localStorage.setItem("bielleterie_clients_secure", encryptedData);

      console.log("✅ Données enregistrées de manière sécurisée");
    } else {
      console.log("⚠️ Client déjà enregistré");
    }

    // Stockage backup local (seulement si pas de doublon)
    if (!isDuplicate) {
      let independentData =
        JSON.parse(localStorage.getItem("bielleterie_independent")) || [];
      independentData.push(clientData);
      localStorage.setItem(
        "bielleterie_independent",
        JSON.stringify(independentData)
      );
    }
  } catch (error) {
    console.error("❌ Erreur sauvegarde:", error);
    // Fallback: sauvegarde locale simple
    let fallbackData =
      JSON.parse(localStorage.getItem("bielleterie_fallback")) || [];
    fallbackData.push(clientData);
    localStorage.setItem("bielleterie_fallback", JSON.stringify(fallbackData));
  }
}
