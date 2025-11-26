// billet-db.js - Base de données IndexedDB pour la bielleterie (Version Synchronisée)
class BilletDB {
  constructor() {
    this.dbName = "BielleterieDB";
    this.version = 3;
    this.db = null;
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  async init() {
    if (this.isInitialized && this.db) {
      return this.db;
    }

    // Éviter les initialisations multiples
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error("❌ Erreur ouverture BDD:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;

        // Gérer les erreurs de base de données
        this.db.onerror = (event) => {
          console.error("❌ Erreur BDD:", event.target.error);
        };

        console.log("✅ Base de données initialisée - Version:", this.version);
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log(
          "🔄 Mise à jour structure BDD - Version:",
          event.oldVersion,
          "→",
          event.newVersion
        );

        // Supprimer les anciennes tables si existantes
        if (db.objectStoreNames.contains("clients")) {
          db.deleteObjectStore("clients");
        }
        if (db.objectStoreNames.contains("payments")) {
          db.deleteObjectStore("payments");
        }
        if (db.objectStoreNames.contains("backups")) {
          db.deleteObjectStore("backups");
        }
        if (db.objectStoreNames.contains("sync_queue")) {
          db.deleteObjectStore("sync_queue");
        }

        // Table des clients
        const clientStore = db.createObjectStore("clients", {
          keyPath: "id",
          autoIncrement: false,
        });

        // Index pour recherches rapides
        clientStore.createIndex("email", "email", { unique: false });
        clientStore.createIndex("phone", "phone", { unique: false });
        clientStore.createIndex("type", "type", { unique: false });
        clientStore.createIndex("timestamp", "timestamp", { unique: false });
        clientStore.createIndex("paiement", "paiement", { unique: false });

        // Table des paiements
        const paymentStore = db.createObjectStore("payments", {
          keyPath: "id",
          autoIncrement: false,
        });

        paymentStore.createIndex("clientId", "clientId", { unique: false });
        paymentStore.createIndex("status", "status", { unique: false });
        paymentStore.createIndex("timestamp", "timestamp", { unique: false });

        // Table des sauvegardes
        const backupStore = db.createObjectStore("backups", {
          keyPath: "id",
          autoIncrement: false,
        });

        backupStore.createIndex("timestamp", "timestamp", { unique: false });

        // Table de synchronisation
        const syncStore = db.createObjectStore("sync_queue", {
          keyPath: "id",
          autoIncrement: true,
        });

        syncStore.createIndex("timestamp", "timestamp", { unique: false });
        syncStore.createIndex("processed", "processed", { unique: false });

        console.log("✅ Structure BDD créée avec succès");
      };

      request.onblocked = () => {
        console.warn("⚠️ BDD bloquée - Fermez les autres onglets");
      };
    });

    return this.initializationPromise;
  }

  // ==================== VÉRIFICATION DE CONNEXION ====================
  async ensureConnection() {
    try {
      if (!this.isInitialized || !this.db) {
        await this.init();
      }
      return true;
    } catch (error) {
      console.error("❌ Erreur connexion BDD:", error);
      throw error;
    }
  }

  // ==================== OPÉRATIONS CLIENTS ====================
  async saveClient(client) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(["clients"], "readwrite");
        const store = transaction.objectStore("clients");

        // Validation et complétion des données
        if (!client.id) {
          client.id = this.generateClientId(client.type);
        }

        if (!client.timestamp) {
          client.timestamp = new Date().toISOString();
        }

        // S'assurer que tous les champs requis sont présents
        const completeClient = {
          id: client.id,
          nom1: client.nom1 || "",
          nom2: client.nom2 || "",
          email: client.email || "",
          phone: client.phone || "",
          type: client.type || "unite",
          timestamp: client.timestamp,
          page: client.page || "unknown",
          ip: client.ip || "local",
          userAgent: client.userAgent || navigator.userAgent,
          paiement: client.paiement || "En attente",
          paymentDate: client.paymentDate || null,
        };

        const request = store.put(completeClient);

        request.onerror = () => {
          console.error("❌ Erreur sauvegarde client:", request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log(
            "✅ Client sauvegardé:",
            completeClient.id,
            "-",
            completeClient.nom1
          );

          // Déclencher la synchronisation cross-pages
          this.triggerCrossPageSync(completeClient);
          resolve(completeClient.id);
        };

        transaction.oncomplete = () => {
          console.log("💾 Transaction client complétée");
        };

        transaction.onerror = (event) => {
          console.error("❌ Erreur transaction:", event.target.error);
          reject(event.target.error);
        };
      } catch (error) {
        console.error("❌ Erreur critique sauvegarde client:", error);
        reject(error);
      }
    });
  }

  async getClient(id) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(["clients"], "readonly");
        const store = transaction.objectStore("clients");
        const request = store.get(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        transaction.onerror = (event) => {
          reject(event.target.error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  async getAllClients() {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(["clients"], "readonly");
        const store = transaction.objectStore("clients");
        const request = store.getAll();

        request.onerror = () => {
          console.error("❌ Erreur getAllClients:", request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log(
            "📊 Chargement clients:",
            request.result.length,
            "clients trouvés"
          );
          resolve(request.result);
        };

        transaction.onerror = (event) => {
          console.error(
            "❌ Erreur transaction getAllClients:",
            event.target.error
          );
          reject(event.target.error);
        };
      } catch (error) {
        console.error("❌ Erreur critique getAllClients:", error);
        reject(error);
      }
    });
  }

  async getClientsByType(type) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["clients"], "readonly");
      const store = transaction.objectStore("clients");
      const index = store.index("type");
      const request = index.getAll(type);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async searchClients(searchTerm) {
    await this.ensureConnection();
    const clients = await this.getAllClients();
    const term = searchTerm.toLowerCase();

    return clients.filter(
      (client) =>
        client.nom1.toLowerCase().includes(term) ||
        (client.nom2 && client.nom2.toLowerCase().includes(term)) ||
        client.email.toLowerCase().includes(term) ||
        client.phone.includes(term) ||
        client.type.includes(term)
    );
  }

  async deleteClient(id) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["clients"], "readwrite");
      const store = transaction.objectStore("clients");
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
    });
  }

  async getClientsByDateRange(startDate, endDate) {
    await this.ensureConnection();
    const clients = await this.getAllClients();
    return clients.filter((client) => {
      const clientDate = new Date(client.timestamp);
      return clientDate >= startDate && clientDate <= endDate;
    });
  }

  // ==================== SYNCHRONISATION CROSS-PAGES ====================
  triggerCrossPageSync(clientData) {
    try {
      const syncData = {
        action: "new_client",
        data: clientData,
        timestamp: Date.now(),
        source: window.location.href,
      };

      localStorage.setItem("bielleterie_sync_event", JSON.stringify(syncData));

      window.dispatchEvent(
        new CustomEvent("bielleterieDataChanged", {
          detail: { client: clientData },
        })
      );

      console.log(
        "🔄 Synchronisation cross-pages déclenchée pour:",
        clientData.id
      );
    } catch (error) {
      console.error("❌ Erreur synchronisation:", error);
    }
  }

  setupCrossPageListener() {
    window.addEventListener("storage", (event) => {
      if (event.key === "bielleterie_sync_event" && event.newValue) {
        try {
          const syncData = JSON.parse(event.newValue);
          if (syncData.action === "new_client") {
            console.log(
              "🔄 Client reçu depuis autre onglet:",
              syncData.data.id
            );
            this.processIncomingClient(syncData.data);
          }
        } catch (error) {
          console.error("❌ Erreur traitement sync:", error);
        }
      }
    });

    window.addEventListener("bielleterieDataChanged", (event) => {
      console.log("🔄 Événement données changées:", event.detail.client.id);
    });

    console.log("👂 Écouteur synchronisation activé");
  }

  async processIncomingClient(clientData) {
    try {
      const existing = await this.getClient(clientData.id);
      if (!existing) {
        await this.saveClient(clientData);
        console.log("✅ Client synchronisé:", clientData.id);
      }
    } catch (error) {
      console.error("❌ Erreur traitement client entrant:", error);
    }
  }

  // ==================== OPÉRATIONS PAIEMENTS ====================
  async savePayment(payment) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      if (!payment.id) {
        payment.id =
          "pay_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      }

      if (!payment.timestamp) {
        payment.timestamp = new Date().toISOString();
      }

      const transaction = this.db.transaction(["payments"], "readwrite");
      const store = transaction.objectStore("payments");
      const request = store.put(payment);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(payment.id);
    });
  }

  async getClientPayments(clientId) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["payments"], "readonly");
      const store = transaction.objectStore("payments");
      const index = store.index("clientId");
      const request = index.getAll(clientId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // ==================== STATISTIQUES ====================
  async getStats() {
    await this.ensureConnection();
    const clients = await this.getAllClients();
    const today = new Date().toDateString();

    const todayClients = clients.filter(
      (client) => new Date(client.timestamp).toDateString() === today
    );

    const paidClients = clients.filter((client) => client.paiement === "Payé");

    const stats = {
      total: clients.length,
      today: todayClients.length,
      couples: clients.filter((c) => c.type === "couple").length,
      unites: clients.filter((c) => c.type === "unite").length,
      payes: paidClients.length,
      enAttente: clients.filter((c) => c.paiement === "En attente").length,
      revenue: paidClients.reduce((total, client) => {
        return total + (client.type === "couple" ? 5000 : 3000);
      }, 0),
    };

    console.log("📈 Statistiques calculées:", stats);
    return stats;
  }

  // ==================== SAUVEGARDES ====================
  async createBackup() {
    await this.ensureConnection();
    const clients = await this.getAllClients();
    const payments = await this.getAllPayments();

    const backup = {
      id: "backup_" + Date.now(),
      timestamp: new Date().toISOString(),
      clients: clients,
      payments: payments,
      clientCount: clients.length,
      paymentCount: payments.length,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["backups"], "readwrite");
      const store = transaction.objectStore("backups");
      const request = store.put(backup);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log(
          "💾 Sauvegarde créée:",
          backup.id,
          "-",
          backup.clientCount,
          "clients"
        );
        resolve(backup);
      };
    });
  }

  async getAllBackups() {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["backups"], "readonly");
      const store = transaction.objectStore("backups");
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async restoreBackup(backupId) {
    await this.ensureConnection();

    const backup = await new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["backups"], "readonly");
      const store = transaction.objectStore("backups");
      const request = store.get(backupId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    if (!backup) {
      throw new Error("Sauvegarde non trouvée");
    }

    for (const client of backup.clients) {
      await this.saveClient(client);
    }

    console.log("🔄 Sauvegarde restaurée:", backup.clientCount, "clients");
    return backup;
  }

  // ==================== UTILITAIRES ====================
  generateClientId(type) {
    const prefix = type === "couple" ? "CPL" : "UNI";
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getAllPayments() {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["payments"], "readonly");
      const store = transaction.objectStore("payments");
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async clearAllData() {
    await this.ensureConnection();

    return new Promise(async (resolve, reject) => {
      try {
        await this.clearStore("clients");
        await this.clearStore("payments");
        await this.clearStore("backups");
        await this.clearStore("sync_queue");

        console.log("✅ Toutes les données supprimées");
        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
  }

  async clearStore(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
    });
  }

  async exportToJSON() {
    await this.ensureConnection();
    const clients = await this.getAllClients();
    const payments = await this.getAllPayments();

    return {
      exportDate: new Date().toISOString(),
      clients: clients,
      payments: payments,
      stats: {
        totalClients: clients.length,
        totalPayments: payments.length,
      },
    };
  }

  async importFromJSON(data) {
    await this.ensureConnection();

    if (!data.clients || !Array.isArray(data.clients)) {
      throw new Error("Format de données invalide");
    }

    for (const client of data.clients) {
      await this.saveClient(client);
    }

    if (data.payments && Array.isArray(data.payments)) {
      for (const payment of data.payments) {
        await this.savePayment(payment);
      }
    }

    console.log("📥 Import JSON réussi:", data.clients.length, "clients");
    return data.clients.length;
  }

  // ==================== DIAGNOSTIC ====================
  async diagnostic() {
    try {
      await this.ensureConnection();
      const clients = await this.getAllClients();
      const payments = await this.getAllPayments();
      const backups = await this.getAllBackups();

      return {
        dbInitialized: this.isInitialized,
        totalClients: clients.length,
        totalPayments: payments.length,
        totalBackups: backups.length,
        dbVersion: this.version,
        dbName: this.dbName,
        lastClient: clients.length > 0 ? clients[clients.length - 1] : null,
      };
    } catch (error) {
      return {
        error: error.message,
        dbInitialized: this.isInitialized,
      };
    }
  }

  // ==================== RÉINITIALISATION ====================
  async resetDatabase() {
    try {
      this.db?.close();
      this.isInitialized = false;
      this.db = null;
      this.initializationPromise = null;

      const request = indexedDB.deleteDatabase(this.dbName);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          console.log("✅ Base de données supprimée");
          resolve(true);
        };
        request.onerror = () => {
          console.error("❌ Erreur suppression BDD:", request.error);
          reject(request.error);
        };
        request.onblocked = () => {
          console.warn("⚠️ BDD bloquée - Fermez les autres onglets");
          reject(new Error("BDD bloquée"));
        };
      });
    } catch (error) {
      console.error("❌ Erreur réinitialisation:", error);
      throw error;
    }
  }
}

// Instance globale avec initialisation automatique
const billetDB = new BilletDB();

// Initialisation automatique au chargement
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await billetDB.init();
    billetDB.setupCrossPageListener();
    console.log("🗃️ Base de données Bielleterie synchronisée - PRÊTE");

    const clients = await billetDB.getAllClients();
    console.log(`📊 ${clients.length} clients chargés au démarrage`);
  } catch (error) {
    console.error("❌ Erreur initialisation BDD:", error);
  }
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BilletDB, billetDB };
}
