// billet-db.js - Base de données avec synchronisation temps réel
class BilletDB {
  constructor() {
    this.dbName = "BielleterieDB";
    this.version = 5;
    this.db = null;
    this.isInitialized = false;
    this.initializationPromise = null;
    this.backupInterval = null;
    this.syncInterval = null;
  }

  async init() {
    if (this.isInitialized && this.db) {
      return this.db;
    }

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

        this.db.onerror = (event) => {
          console.error("❌ Erreur BDD:", event.target.error);
        };

        console.log("✅ Base de données initialisée - Version:", this.version);

        // Démarrer les systèmes
        this.startAutoBackup();
        this.startSyncSystem();
        this.restoreFromBackupIfNeeded();

        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log("🔄 Mise à jour structure BDD");

        // Tables existantes
        if (!db.objectStoreNames.contains("clients")) {
          const clientStore = db.createObjectStore("clients", {
            keyPath: "id",
            autoIncrement: false,
          });

          clientStore.createIndex("email", "email", { unique: false });
          clientStore.createIndex("phone", "phone", { unique: false });
          clientStore.createIndex("type", "type", { unique: false });
          clientStore.createIndex("timestamp", "timestamp", { unique: false });
          clientStore.createIndex("paiement", "paiement", { unique: false });
          clientStore.createIndex("synced", "synced", { unique: false });
        }

        if (!db.objectStoreNames.contains("payments")) {
          const paymentStore = db.createObjectStore("payments", {
            keyPath: "id",
            autoIncrement: false,
          });

          paymentStore.createIndex("clientId", "clientId", { unique: false });
          paymentStore.createIndex("status", "status", { unique: false });
          paymentStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        if (!db.objectStoreNames.contains("backups")) {
          const backupStore = db.createObjectStore("backups", {
            keyPath: "id",
            autoIncrement: false,
          });
          backupStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        console.log("✅ Structure BDD créée avec succès");
      };

      request.onblocked = () => {
        console.warn("⚠️ BDD bloquée - Fermez les autres onglets");
      };
    });

    return this.initializationPromise;
  }

  // ==================== SYSTÈME DE SYNCHRONISATION ====================
  startSyncSystem() {
    // Synchronisation toutes les 10 secondes
    this.syncInterval = setInterval(() => {
      this.processSync();
    }, 10000);

    console.log("🔄 Système de synchronisation activé");
  }

  async processSync() {
    try {
      // Récupérer les nouveaux clients non synchronisés
      const unsyncedClients = await this.getUnsyncedClients();

      if (unsyncedClients.length > 0) {
        console.log(`🔄 ${unsyncedClients.length} clients à synchroniser`);

        // Synchroniser avec l'admin
        await this.syncWithAdmin(unsyncedClients);

        // Marquer comme synchronisés
        await this.markAsSynced(unsyncedClients);
      }
    } catch (error) {
      console.error("❌ Erreur synchronisation:", error);
    }
  }

  async getUnsyncedClients() {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["clients"], "readonly");
      const store = transaction.objectStore("clients");
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const clients = request.result;
        const unsynced = clients.filter((client) => !client.synced);
        resolve(unsynced);
      };
    });
  }

  async syncWithAdmin(clients) {
    console.log("📤 Envoi des clients à l'admin:", clients.length);

    // Stocker dans localStorage pour la synchronisation
    const syncData = {
      action: "sync_clients",
      clients: clients,
      timestamp: new Date().toISOString(),
      source: "device_" + this.getDeviceId(),
    };

    localStorage.setItem("bielleterie_sync_to_admin", JSON.stringify(syncData));

    // Déclencher un événement pour l'admin
    window.dispatchEvent(
      new CustomEvent("bielleterieNewClients", {
        detail: { clients: clients },
      })
    );

    return true;
  }

  async markAsSynced(clients) {
    await this.ensureConnection();

    for (const client of clients) {
      const transaction = this.db.transaction(["clients"], "readwrite");
      const store = transaction.objectStore("clients");

      client.synced = true;
      client.syncedAt = new Date().toISOString();

      store.put(client);
    }

    console.log(`✅ ${clients.length} clients marqués comme synchronisés`);
  }

  getDeviceId() {
    let deviceId = localStorage.getItem("bielleterie_device_id");

    if (!deviceId) {
      deviceId =
        "device_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("bielleterie_device_id", deviceId);
    }

    return deviceId;
  }

  // ==================== MÉTHODES CLIENT AVEC SYNC ====================
  async saveClient(client) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(["clients"], "readwrite");
        const store = transaction.objectStore("clients");

        if (!client.id) {
          client.id = this.generateClientId(client.type);
        }

        if (!client.timestamp) {
          client.timestamp = new Date().toISOString();
        }

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
          userAgent: navigator.userAgent,
          deviceInfo: this.getDeviceInfo(),
          paiement: client.paiement || "En attente",
          paymentDate: client.paymentDate || null,
          deviceId: this.getDeviceId(),
          synced: false,
          syncedAt: null,
          lastUpdated: new Date().toISOString(),
        };

        const request = store.put(completeClient);

        request.onerror = () => {
          console.error("❌ Erreur sauvegarde client:", request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log("✅ Client sauvegardé:", completeClient.id);

          // Synchronisation immédiate
          this.triggerImmediateSync();

          // Sauvegardes
          this.createAutoBackup();
          this.saveToFallback(completeClient);

          this.triggerCrossPageSync(completeClient);
          resolve(completeClient.id);
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

  triggerImmediateSync() {
    setTimeout(() => {
      this.processSync();
    }, 1000);
  }

  getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screen: {
        width: screen.width,
        height: screen.height,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      mobile: this.isMobileDevice(),
      timestamp: new Date().toISOString(),
    };
  }

  isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  // ==================== MÉTHODES EXISTANTES ====================
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

  async getAllClients() {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction(["clients"], "readonly");
        const store = transaction.objectStore("clients");
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      } catch (error) {
        reject(error);
      }
    });
  }

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
      lastUpdate: new Date().toISOString(),
      synced: clients.filter((c) => c.synced).length,
      unsynced: clients.filter((c) => !c.synced).length,
    };

    return stats;
  }

  // ==================== SYNCHRONISATION CROSS-PAGES ====================
  triggerCrossPageSync(clientData) {
    try {
      const syncData = {
        action: "new_client",
        data: clientData,
        timestamp: Date.now(),
        source: this.getDeviceId(),
      };

      localStorage.setItem("bielleterie_sync_event", JSON.stringify(syncData));

      window.dispatchEvent(
        new CustomEvent("bielleterieDataChanged", {
          detail: { client: clientData },
        })
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
            this.processIncomingClient(syncData.data);
          }
        } catch (error) {
          console.error("❌ Erreur traitement sync:", error);
        }
      }
    });

    window.addEventListener("bielleterieDataChanged", (event) => {
      console.log("🔄 Données changées:", event.detail.client.id);
    });

    console.log("👂 Écouteur synchronisation activé");
  }

  async processIncomingClient(clientData) {
    try {
      const existing = await this.getClient(clientData.id);
      if (!existing) {
        await this.saveClient(clientData);
      }
    } catch (error) {
      console.error("❌ Erreur traitement client entrant:", error);
    }
  }

  // ==================== SAUVEGARDE AUTOMATIQUE ====================
  startAutoBackup() {
    this.backupInterval = setInterval(() => {
      this.createAutoBackup();
    }, 30000);

    window.addEventListener("beforeunload", () => {
      this.createAutoBackup();
    });
  }

  async createAutoBackup() {
    try {
      const clients = await this.getAllClients();
      const payments = await this.getAllPayments();

      const backup = {
        id: "auto_backup_latest",
        timestamp: new Date().toISOString(),
        clients: clients,
        payments: payments,
        clientCount: clients.length,
        paymentCount: payments.length,
        type: "auto",
      };

      await this.saveBackup(backup);
      this.saveToLocalStorageBackup(backup);
    } catch (error) {
      console.error("❌ Erreur sauvegarde auto:", error);
    }
  }

  async saveBackup(backup) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["backups"], "readwrite");
      const store = transaction.objectStore("backups");
      const request = store.put(backup);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(backup);
    });
  }

  saveToLocalStorageBackup(backup) {
    try {
      localStorage.setItem("bielleterie_auto_backup", JSON.stringify(backup));
      localStorage.setItem("bielleterie_last_backup", new Date().toISOString());
    } catch (error) {
      console.error("❌ Erreur sauvegarde localStorage:", error);
    }
  }

  saveToFallback(client) {
    try {
      let clients =
        JSON.parse(localStorage.getItem("bielleterie_clients_fallback")) || [];

      clients = clients.filter((c) => c.id !== client.id);
      clients.push(client);

      if (clients.length > 500) {
        clients = clients.slice(-500);
      }

      localStorage.setItem(
        "bielleterie_clients_fallback",
        JSON.stringify(clients)
      );
      localStorage.setItem("bielleterie_last_update", new Date().toISOString());
    } catch (error) {
      console.error("❌ Erreur sauvegarde fallback:", error);
    }
  }

  async restoreFromBackupIfNeeded() {
    try {
      const clients = await this.getAllClients();

      if (clients.length === 0) {
        console.log("🔄 Aucun client trouvé, tentative de restauration...");

        const fallbackClients = this.getFallbackClients();
        if (fallbackClients.length > 0) {
          console.log("✅ Restauration depuis fallback");
          for (const client of fallbackClients) {
            await this.saveClient(client);
          }
        }
      }
    } catch (error) {
      console.error("❌ Erreur restauration:", error);
    }
  }

  // ==================== UTILITAIRES ====================
  generateClientId(type) {
    const prefix = type === "couple" ? "CPL" : "UNI";
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getClient(id) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["clients"], "readonly");
      const store = transaction.objectStore("clients");
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
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

  async clearAllData() {
    await this.ensureConnection();

    return new Promise(async (resolve, reject) => {
      try {
        await this.clearStore("clients");
        await this.clearStore("payments");
        await this.clearStore("backups");

        localStorage.removeItem("bielleterie_clients_fallback");
        localStorage.removeItem("bielleterie_auto_backup");

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

    console.log("📥 Import JSON réussi:", data.clients.length, "clients");
    return data.clients.length;
  }

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

  async diagnostic() {
    try {
      await this.ensureConnection();
      const clients = await this.getAllClients();
      const payments = await this.getAllPayments();
      const backups = await this.getAllBackups();

      const localStorageBackup = this.getLocalStorageBackup();
      const fallbackClients = this.getFallbackClients();

      return {
        dbInitialized: this.isInitialized,
        totalClients: clients.length,
        syncedClients: clients.filter((c) => c.synced).length,
        unsyncedClients: clients.filter((c) => !c.synced).length,
        totalPayments: payments.length,
        totalBackups: backups.length,
        dbVersion: this.version,
        deviceId: this.getDeviceId(),
        lastClient: clients.length > 0 ? clients[clients.length - 1] : null,
        localStorageBackup: localStorageBackup
          ? localStorageBackup.clients.length
          : 0,
        fallbackClients: fallbackClients.length,
        lastBackup: localStorage.getItem("bielleterie_last_backup"),
      };
    } catch (error) {
      return {
        error: error.message,
        dbInitialized: this.isInitialized,
      };
    }
  }

  getLocalStorageBackup() {
    try {
      const backup = localStorage.getItem("bielleterie_auto_backup");
      return backup ? JSON.parse(backup) : null;
    } catch (error) {
      return null;
    }
  }

  getFallbackClients() {
    try {
      const fallback = localStorage.getItem("bielleterie_clients_fallback");
      return fallback ? JSON.parse(fallback) : [];
    } catch (error) {
      return [];
    }
  }

  async resetDatabase() {
    try {
      if (this.backupInterval) {
        clearInterval(this.backupInterval);
      }
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
      }

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
      });
    } catch (error) {
      console.error("❌ Erreur réinitialisation:", error);
      throw error;
    }
  }
}

// Instance globale
const billetDB = new BilletDB();

// Initialisation automatique
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await billetDB.init();
    billetDB.setupCrossPageListener();
    console.log("🗃️ Base de données SYNC TEMPS RÉEL - PRÊTE");

    const clients = await billetDB.getAllClients();
    console.log(
      `📊 ${clients.length} clients chargés - ${
        clients.filter((c) => !c.synced).length
      } à synchroniser`
    );
  } catch (error) {
    console.error("❌ Erreur initialisation BDD:", error);
  }
});
