// billet-db-enhanced.js - Base de données avec synchronisation temps réel améliorée
class EnhancedBilletDB {
  constructor() {
    this.dbName = "BielleterieDB";
    this.version = 6; // Version incrémentée pour les nouvelles fonctionnalités
    this.db = null;
    this.isInitialized = false;
    this.initializationPromise = null;
    this.backupInterval = null;
    this.syncInterval = null;

    // Nouvelles propriétés pour l'amélioration
    this.syncQueue = [];
    this.isSyncing = false;
    this.maxRetries = 3;
    this.syncConflicts = new Map();
    this.metrics = new MetricsTracker();
    this.encryptionKey = localStorage.getItem("bielleterie_encryption_key");

    // Observer de performance
    this.setupPerformanceObserver();
  }

  // ==================== INITIALISATION AMÉLIORÉE ====================
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

        // Démarrer les systèmes améliorés
        this.startAutoBackup();
        this.startSyncSystem();
        this.setupAdminSyncListener();
        this.setupCrossPageListener();
        this.restoreFromBackupIfNeeded();

        // Générer une clé de chiffrement si nécessaire
        this.ensureEncryptionKey();

        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log("🔄 Mise à jour structure BDD version", this.version);

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

        // Créer les index avancés
        this.createAdvancedIndexes(db);

        console.log("✅ Structure BDD créée avec succès");
      };

      request.onblocked = () => {
        console.warn("⚠️ BDD bloquée - Fermez les autres onglets");
      };
    });

    return this.initializationPromise;
  }

  // ==================== INDEXATION AVANCÉE ====================
  createAdvancedIndexes(db) {
    try {
      if (db.objectStoreNames.contains("clients")) {
        const transaction = db.transaction(["clients"], "readwrite");
        const clientStore = transaction.objectStore("clients");

        // Index composite pour les statistiques
        if (!clientStore.indexNames.contains("type_paiement")) {
          clientStore.createIndex("type_paiement", ["type", "paiement"], {
            unique: false,
          });
        }

        // Index pour les requêtes par date et type
        if (!clientStore.indexNames.contains("date_type")) {
          clientStore.createIndex("date_type", ["timestamp", "type"], {
            unique: false,
          });
        }

        // Index pour la synchronisation
        if (!clientStore.indexNames.contains("sync_status")) {
          clientStore.createIndex("sync_status", ["synced", "lastUpdated"], {
            unique: false,
          });
        }
      }
    } catch (error) {
      console.warn("⚠️ Impossible de créer les index avancés:", error);
    }
  }

  // ==================== SYSTÈME DE SYNCHRONISATION AMÉLIORÉ ====================
  startSyncSystem() {
    // Synchronisation toutes les 10 secondes
    this.syncInterval = setInterval(() => {
      this.processSync();
    }, 10000);

    // Synchronisation immédiate au démarrage
    setTimeout(() => {
      this.processSync();
    }, 2000);

    console.log("🔄 Système de synchronisation activé");
  }

  async processSync() {
    if (this.isSyncing) {
      console.log("⏳ Synchronisation déjà en cours...");
      return;
    }

    const startTime = Date.now();

    try {
      this.isSyncing = true;

      // Traiter d'abord la file d'attente
      if (this.syncQueue.length > 0) {
        await this.processSyncQueue();
      }

      // Ensuite synchroniser les clients non synchronisés
      const unsyncedClients = await this.getUnsyncedClients();

      if (unsyncedClients.length > 0) {
        console.log(`🔄 ${unsyncedClients.length} clients à synchroniser`);

        // Synchroniser avec l'admin
        const success = await this.syncWithAdmin(unsyncedClients);

        if (success) {
          // Marquer comme synchronisés
          await this.markAsSynced(unsyncedClients);
          this.metrics.recordSync(Date.now() - startTime, true);
        } else {
          this.metrics.recordSync(Date.now() - startTime, false);
        }
      }
    } catch (error) {
      console.error("❌ Erreur synchronisation:", error);
      this.metrics.recordSync(Date.now() - startTime, false);
    } finally {
      this.isSyncing = false;
    }
  }

  // 🆕 File de synchronisation avec gestion des conflits
  async enqueueForSync(client) {
    const syncItem = {
      client,
      retries: 0,
      timestamp: Date.now(),
      status: "pending",
    };

    this.syncQueue.push(syncItem);
    console.log(`📥 Client ajouté à la file de sync: ${client.id}`);

    // Démarrer le traitement si pas déjà en cours
    if (!this.isSyncing) {
      await this.processSyncQueue();
    }
  }

  async processSyncQueue() {
    if (this.isSyncing || this.syncQueue.length === 0) return;

    this.isSyncing = true;
    console.log(
      `🔄 Traitement de la file de sync: ${this.syncQueue.length} éléments`
    );

    while (this.syncQueue.length > 0) {
      const syncItem = this.syncQueue[0];
      syncItem.status = "processing";

      try {
        await this.syncWithAdmin([syncItem.client]);
        syncItem.status = "synced";

        // Marquer le client comme synchronisé dans la BDD
        await this.markClientAsSynced(syncItem.client.id);

        this.syncQueue.shift(); // Retirer de la file après succès
        console.log(`✅ Client synchronisé: ${syncItem.client.id}`);
      } catch (error) {
        syncItem.retries++;
        syncItem.lastError = error.message;

        if (syncItem.retries >= this.maxRetries) {
          syncItem.status = "failed";
          this.syncQueue.shift();
          console.error(
            `❌ Échec sync après ${this.maxRetries} tentatives:`,
            syncItem.client.id
          );
        } else {
          console.warn(
            `⚠️ Nouvelle tentative ${syncItem.retries}/${this.maxRetries} pour:`,
            syncItem.client.id
          );
          // Réessayer après délai exponentiel
          await this.delay(Math.pow(2, syncItem.retries) * 1000);
        }
      }
    }

    this.isSyncing = false;
    console.log("✅ File de sync traitée");
  }

  async markClientAsSynced(clientId) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["clients"], "readwrite");
      const store = transaction.objectStore("clients");

      const getRequest = store.get(clientId);
      getRequest.onsuccess = () => {
        const client = getRequest.result;
        if (client) {
          client.synced = true;
          client.syncedAt = new Date().toISOString();
          client.lastUpdated = new Date().toISOString();

          const putRequest = store.put(client);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getUnsyncedClients() {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["clients"], "readonly");
      const store = transaction.objectStore("clients");
      const index = store.index("sync_status");
      const range = IDBKeyRange.only([false]); // synced = false

      const request = index.getAll(range);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const clients = request.result;
        resolve(clients);
      };
    });
  }

  async syncWithAdmin(clients) {
    console.log("📤 Envoi des clients à l'admin:", clients.length);

    // Chiffrer les données sensibles si nécessaire
    const clientsToSync = this.encryptionKey
      ? clients.map((client) => this.encryptSensitiveData(client))
      : clients;

    const syncData = {
      action: "sync_clients",
      clients: clientsToSync,
      timestamp: new Date().toISOString(),
      source: "device_" + this.getDeviceId(),
      version: this.version,
      encrypted: !!this.encryptionKey,
    };

    // Stocker dans localStorage pour la synchronisation
    localStorage.setItem("bielleterie_sync_to_admin", JSON.stringify(syncData));

    // Déclencher un événement pour l'admin
    window.dispatchEvent(
      new CustomEvent("bielleterieNewClients", {
        detail: {
          clients: clientsToSync,
          syncData: syncData,
        },
      })
    );

    // Simuler un envoi réseau réussi (à remplacer par votre API réelle)
    return this.simulateNetworkRequest(clientsToSync);
  }

  async simulateNetworkRequest(clients) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simuler un succès 95% du temps
        if (Math.random() > 0.05) {
          resolve(true);
        } else {
          reject(new Error("Erreur réseau simulée"));
        }
      }, 500);
    });
  }

  async markAsSynced(clients) {
    await this.ensureConnection();

    const transaction = this.db.transaction(["clients"], "readwrite");
    const store = transaction.objectStore("clients");

    for (const client of clients) {
      client.synced = true;
      client.syncedAt = new Date().toISOString();
      client.lastUpdated = new Date().toISOString();
      store.put(client);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log(`✅ ${clients.length} clients marqués comme synchronisés`);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // ==================== SYNCHRONISATION BIDIRECTIONNELLE ====================
  setupAdminSyncListener() {
    window.addEventListener("bielleterieAdminUpdate", async (event) => {
      try {
        const { action, data } = event.detail;
        console.log("📥 Mise à jour reçue de l'admin:", action);

        switch (action) {
          case "client_updated":
            await this.handleClientUpdate(data);
            break;
          case "client_deleted":
            await this.handleClientDeletion(data.clientId);
            break;
          case "force_sync":
            await this.forceFullSync();
            break;
          case "config_update":
            await this.handleConfigUpdate(data);
            break;
        }
      } catch (error) {
        console.error("❌ Erreur traitement mise à jour admin:", error);
      }
    });

    console.log("👂 Écouteur synchronisation admin activé");
  }

  async handleClientUpdate(updatedClient) {
    try {
      const existing = await this.getClient(updatedClient.id);

      // Résolution de conflits (stratégie "le dernier gagne")
      if (existing) {
        const existingTime = new Date(
          existing.lastUpdated || existing.timestamp
        );
        const updatedTime = new Date(
          updatedClient.lastUpdated || updatedClient.timestamp
        );

        if (updatedTime > existingTime) {
          // Décrypter si nécessaire
          const clientToSave =
            this.encryptionKey && updatedClient.encrypted
              ? this.decryptSensitiveData(updatedClient)
              : updatedClient;

          await this.saveClientDirect(clientToSave);
          console.log("✅ Client mis à jour depuis admin:", updatedClient.id);
        } else {
          console.log(
            "⏸️  Client plus récent localement, ignore update:",
            updatedClient.id
          );
        }
      } else {
        // Nouveau client de l'admin
        const clientToSave =
          this.encryptionKey && updatedClient.encrypted
            ? this.decryptSensitiveData(updatedClient)
            : updatedClient;

        await this.saveClientDirect(clientToSave);
        console.log("✅ Nouveau client ajouté depuis admin:", updatedClient.id);
      }
    } catch (error) {
      console.error("❌ Erreur mise à jour client admin:", error);
    }
  }

  async handleClientDeletion(clientId) {
    try {
      await this.deleteClient(clientId);
      console.log("✅ Client supprimé via admin:", clientId);
    } catch (error) {
      console.error("❌ Erreur suppression client admin:", error);
    }
  }

  async forceFullSync() {
    console.log("🔄 Synchronisation forcée demandée par admin");

    const allClients = await this.getAllClients();
    const unsyncedClients = allClients.filter((client) => !client.synced);

    if (unsyncedClients.length > 0) {
      console.log(`🔄 Synchronisation de ${unsyncedClients.length} clients`);
      await this.syncWithAdmin(unsyncedClients);
      await this.markAsSynced(unsyncedClients);
    } else {
      console.log("✅ Tous les clients sont déjà synchronisés");
    }
  }

  async handleConfigUpdate(config) {
    try {
      localStorage.setItem("bielleterie_config", JSON.stringify(config));
      console.log("✅ Configuration mise à jour:", config);

      // Redémarrer les intervalles si nécessaire
      if (config.syncInterval) {
        this.restartSyncSystem(config.syncInterval);
      }
    } catch (error) {
      console.error("❌ Erreur mise à jour config:", error);
    }
  }

  restartSyncSystem(newInterval) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.processSync();
    }, newInterval);

    console.log(`🔄 Intervalle de sync mis à jour: ${newInterval}ms`);
  }

  // ==================== MÉTHODES CLIENT AVEC SYNC AMÉLIORÉ ====================
  async saveClient(client) {
    // Validation des données
    this.validateClient(client);

    // Utiliser la méthode avec reprise sur erreur
    return await this.saveClientWithRecovery(client);
  }

  async saveClientWithRecovery(client) {
    const maxRetries = 2;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Tentative de sauvegarde principale
        const result = await this.saveClientDirect(client);

        // Ajouter à la file de synchronisation
        await this.enqueueForSync(result);

        return result;
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) break;

        // Stratégies de récupération selon le type d'erreur
        if (error.name === "QuotaExceededError") {
          await this.cleanupOldData();
        } else if (error.name === "VersionError") {
          await this.handleVersionConflict();
        } else if (error.name === "ConstraintError") {
          // ID dupliqué, générer un nouveau
          client.id = this.generateClientId(client.type);
        }

        await this.delay(1000 * (attempt + 1)); // Backoff exponentiel
      }
    }

    // Fallback vers localStorage si tout échoue
    console.warn("⚠️ Fallback vers localStorage après échecs répétés");
    this.saveToFallback(client);
    throw lastError;
  }

  async saveClientDirect(client) {
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
          version: 1,
        };

        // Chiffrer les données sensibles si activé
        const clientToSave = this.encryptionKey
          ? this.encryptSensitiveData(completeClient)
          : completeClient;

        const request = store.put(clientToSave);

        request.onerror = () => {
          console.error("❌ Erreur sauvegarde client:", request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log("✅ Client sauvegardé:", completeClient.id);
          this.metrics.recordSave(true);

          // Sauvegardes
          this.createAutoBackup();
          this.saveToFallback(completeClient);

          this.triggerCrossPageSync(completeClient);
          resolve(completeClient);
        };

        transaction.onerror = (event) => {
          console.error("❌ Erreur transaction:", event.target.error);
          this.metrics.recordSave(false);
          reject(event.target.error);
        };
      } catch (error) {
        console.error("❌ Erreur critique sauvegarde client:", error);
        this.metrics.recordSave(false);
        reject(error);
      }
    });
  }

  // ==================== VALIDATION ET SÉCURITÉ ====================
  validateClient(client) {
    const required = ["nom1", "type"];
    const errors = [];

    required.forEach((field) => {
      if (!client[field] || client[field].trim() === "") {
        errors.push(`Champ requis manquant: ${field}`);
      }
    });

    // Validation email
    if (client.email && !this.isValidEmail(client.email)) {
      errors.push("Format email invalide");
    }

    // Validation téléphone
    if (client.phone && !this.isValidPhone(client.phone)) {
      errors.push("Format téléphone invalide");
    }

    // Validation type
    const validTypes = ["unite", "couple"];
    if (!validTypes.includes(client.type)) {
      errors.push(`Type invalide. Doit être: ${validTypes.join(", ")}`);
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(", ")}`);
    }

    return true;
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidPhone(phone) {
    const phoneRegex = /^[+]?[\d\s\-()]{10,}$/;
    return phoneRegex.test(phone);
  }

  // ==================== CHIFFREMENT DES DONNÉES ====================
  ensureEncryptionKey() {
    if (!this.encryptionKey) {
      this.encryptionKey =
        "key_" + Date.now() + "_" + Math.random().toString(36).substr(2, 16);
      localStorage.setItem("bielleterie_encryption_key", this.encryptionKey);
    }
  }

  encryptSensitiveData(client) {
    if (!this.encryptionKey) return client;

    const sensitiveClient = { ...client };
    const fieldsToEncrypt = ["email", "phone", "nom1", "nom2"];

    fieldsToEncrypt.forEach((field) => {
      if (sensitiveClient[field]) {
        sensitiveClient[field] = this.simpleEncrypt(sensitiveClient[field]);
      }
    });

    sensitiveClient.encrypted = true;
    return sensitiveClient;
  }

  decryptSensitiveData(client) {
    if (!client.encrypted || !this.encryptionKey) return client;

    const decryptedClient = { ...client };
    const fieldsToDecrypt = ["email", "phone", "nom1", "nom2"];

    fieldsToDecrypt.forEach((field) => {
      if (decryptedClient[field]) {
        decryptedClient[field] = this.simpleDecrypt(decryptedClient[field]);
      }
    });

    decryptedClient.encrypted = false;
    return decryptedClient;
  }

  simpleEncrypt(text) {
    // Chiffrement simple base64 (remplacer par une vraie solution de chiffrement)
    return btoa(unescape(encodeURIComponent(text + this.encryptionKey)));
  }

  simpleDecrypt(encryptedText) {
    try {
      const decrypted = decodeURIComponent(escape(atob(encryptedText)));
      return decrypted.replace(this.encryptionKey, "");
    } catch (error) {
      console.error("❌ Erreur déchiffrement:", error);
      return "[chiffré]";
    }
  }

  // ==================== MÉTHODES EXISTANTES AMÉLIORÉES ====================
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
        request.onsuccess = () => {
          const clients = request.result;
          // Décrypter les données si nécessaire
          const decryptedClients = this.encryptionKey
            ? clients.map((client) => this.decryptSensitiveData(client))
            : clients;
          resolve(decryptedClients);
        };
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
      syncQueue: this.syncQueue.length,
      metrics: this.metrics.getSyncMetrics(),
    };

    return stats;
  }

  // ==================== BATCH PROCESSING ====================
  async batchSaveClients(clients, batchSize = 50) {
    const results = {
      success: 0,
      errors: 0,
      errorsList: [],
    };

    for (let i = 0; i < clients.length; i += batchSize) {
      const batch = clients.slice(i, i + batchSize);

      try {
        const promises = batch.map((client) =>
          this.saveClientWithRecovery(client)
        );
        const settledResults = await Promise.allSettled(promises);

        settledResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            results.success++;
          } else {
            results.errors++;
            results.errorsList.push({
              client: batch[index],
              error: result.reason.message,
            });
          }
        });

        // Pause pour éviter de bloquer l'UI
        await this.delay(100);

        console.log(
          `📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
            clients.length / batchSize
          )} traité`
        );
      } catch (error) {
        console.error("❌ Erreur batch:", error);
        results.errors += batch.length;
        batch.forEach((client) => {
          results.errorsList.push({
            client,
            error: error.message,
          });
        });
      }
    }

    console.log(
      `✅ Batch processing terminé: ${results.success} succès, ${results.errors} erreurs`
    );
    return results;
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

    console.log("👂 Écouteur synchronisation cross-page activé");
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

  // ==================== SAUVEGARDE AUTOMATIQUE AMÉLIORÉE ====================
  startAutoBackup() {
    // Sauvegarde toutes les 30 secondes
    this.backupInterval = setInterval(() => {
      this.createAutoBackup();
    }, 30000);

    // Sauvegarde avant déchargement de la page
    window.addEventListener("beforeunload", () => {
      this.createAutoBackup();
    });

    // Sauvegarde quand la page devient visible
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        this.createAutoBackup();
      }
    });

    console.log("💾 Système de sauvegarde automatique activé");
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
        version: this.version,
      };

      await this.saveBackup(backup);
      this.saveToLocalStorageBackup(backup);
      this.metrics.recordBackup("created");
    } catch (error) {
      console.error("❌ Erreur sauvegarde auto:", error);
    }
  }

  async cleanupOldData() {
    try {
      console.log("🧹 Nettoyage des anciennes données...");

      // Supprimer les sauvegardes anciennes (garder seulement les 5 dernières)
      const backups = await this.getAllBackups();
      if (backups.length > 5) {
        backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const toDelete = backups.slice(5);

        for (const backup of toDelete) {
          await this.deleteBackup(backup.id);
        }
        console.log(`✅ ${toDelete.length} anciennes sauvegardes supprimées`);
      }

      // Nettoyer le localStorage
      this.cleanupLocalStorage();
    } catch (error) {
      console.error("❌ Erreur nettoyage données:", error);
    }
  }

  cleanupLocalStorage() {
    const keysToKeep = [
      "bielleterie_device_id",
      "bielleterie_encryption_key",
      "bielleterie_config",
      "bielleterie_auto_backup",
      "bielleterie_last_backup",
    ];

    Object.keys(localStorage)
      .filter(
        (key) => key.startsWith("bielleterie_") && !keysToKeep.includes(key)
      )
      .forEach((key) => {
        localStorage.removeItem(key);
      });

    console.log("✅ localStorage nettoyé");
  }

  // ==================== MÉTHODES UTILITAIRES ====================
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  generateClientId(type) {
    const prefix = type === "couple" ? "CPL" : "UNI";
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  setupPerformanceObserver() {
    if (window.PerformanceObserver) {
      this.performanceObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration > 1000) {
            // Seuil de performance
            console.warn(
              `🐢 Performance lente: ${entry.name} - ${entry.duration}ms`
            );
          }
        });
      });

      try {
        this.performanceObserver.observe({ entryTypes: ["measure"] });
      } catch (e) {
        // Navigator might not support the entryTypes
      }
    }
  }

  // ==================== MÉTHODES DE BASE (existantes) ====================
  async getClient(id) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["clients"], "readonly");
      const store = transaction.objectStore("clients");
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const client = request.result;
        const decryptedClient =
          this.encryptionKey && client
            ? this.decryptSensitiveData(client)
            : client;
        resolve(decryptedClient);
      };
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

        // Vider les files
        this.syncQueue = [];

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
      version: this.version,
      deviceId: this.getDeviceId(),
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

    const results = await this.batchSaveClients(data.clients);
    console.log("📥 Import JSON réussi:", results.success, "clients importés");
    return results;
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

  async deleteBackup(backupId) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["backups"], "readwrite");
      const store = transaction.objectStore("backups");
      const request = store.delete(backupId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
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

    const results = await this.batchSaveClients(backup.clients);
    this.metrics.recordBackup("restored");

    console.log("🔄 Sauvegarde restaurée:", results.success, "clients");
    return results;
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
          console.log(
            "✅ Restauration depuis fallback:",
            fallbackClients.length,
            "clients"
          );
          const results = await this.batchSaveClients(fallbackClients);
          console.log(
            `✅ ${results.success} clients restaurés depuis fallback`
          );
        }
      }
    } catch (error) {
      console.error("❌ Erreur restauration:", error);
    }
  }

  async handleVersionConflict() {
    console.warn("🔄 Conflit de version détecté, réinitialisation...");
    await this.resetDatabase();
    await this.init();
  }

  // ==================== DIAGNOSTIC AMÉLIORÉ ====================
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
        syncQueue: this.syncQueue.length,
        isSyncing: this.isSyncing,
        encryption: !!this.encryptionKey,
        lastClient: clients.length > 0 ? clients[clients.length - 1] : null,
        localStorageBackup: localStorageBackup
          ? localStorageBackup.clients.length
          : 0,
        fallbackClients: fallbackClients.length,
        lastBackup: localStorage.getItem("bielleterie_last_backup"),
        metrics: this.metrics.getSyncMetrics(),
        performance: {
          memory: window.performance?.memory,
          navigation: window.performance?.getEntriesByType("navigation")[0],
        },
      };
    } catch (error) {
      return {
        error: error.message,
        dbInitialized: this.isInitialized,
        syncQueue: this.syncQueue.length,
        isSyncing: this.isSyncing,
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
      this.syncQueue = [];
      this.isSyncing = false;

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

  // ==================== MIGRATION ====================
  async migrateToEnhancedVersion() {
    const diagnostic = await this.diagnostic();

    console.log("🚀 Migration vers version améliorée...");
    console.log("État actuel:", diagnostic);

    // 1. Créer une sauvegarde complète
    const backup = await this.createBackup();
    console.log("💾 Sauvegarde créée:", backup.id);

    // 2. Mettre à jour les index
    await this.createAdvancedIndexes(this.db);

    // 3. Migrer les données existantes
    const clients = await this.getAllClients();
    const migrationResults = await this.batchSaveClients(clients);

    console.log("✅ Migration terminée:", migrationResults);
    return migrationResults;
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
      version: this.version,
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
}

// ==================== CLASSE METRICS TRACKER ====================
class MetricsTracker {
  constructor() {
    this.metrics = {
      sync: { success: 0, failures: 0, totalTime: 0 },
      save: { success: 0, failures: 0 },
      backup: { created: 0, restored: 0 },
    };
    this.startTime = Date.now();
  }

  recordSync(duration, success = true) {
    if (success) {
      this.metrics.sync.success++;
      this.metrics.sync.totalTime += duration;
    } else {
      this.metrics.sync.failures++;
    }
  }

  recordSave(success = true) {
    if (success) {
      this.metrics.save.success++;
    } else {
      this.metrics.save.failures++;
    }
  }

  recordBackup(type) {
    if (this.metrics.backup[type] !== undefined) {
      this.metrics.backup[type]++;
    }
  }

  getSyncMetrics() {
    const totalSyncs = this.metrics.sync.success + this.metrics.sync.failures;
    const avgTime =
      this.metrics.sync.success > 0
        ? this.metrics.sync.totalTime / this.metrics.sync.success
        : 0;

    return {
      totalSyncs: totalSyncs,
      successRate: totalSyncs > 0 ? this.metrics.sync.success / totalSyncs : 0,
      averageSyncTime: avgTime,
      uptime: Date.now() - this.startTime,
      saves: this.metrics.save,
      backups: this.metrics.backup,
    };
  }

  reset() {
    this.metrics = {
      sync: { success: 0, failures: 0, totalTime: 0 },
      save: { success: 0, failures: 0 },
      backup: { created: 0, restored: 0 },
    };
    this.startTime = Date.now();
  }
}

// Instance globale
const billetDB = new EnhancedBilletDB();

// Initialisation automatique
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await billetDB.init();
    console.log("🗃️ Base de données SYNC TEMPS RÉEL AMÉLIORÉE - PRÊTE");

    const clients = await billetDB.getAllClients();
    const stats = await billetDB.getStats();

    console.log(
      `📊 ${clients.length} clients chargés - ${
        clients.filter((c) => !c.synced).length
      } à synchroniser`
    );
    console.log("📈 Métriques:", stats.metrics);

    // Migration automatique si nécessaire
    const diagnostic = await billetDB.diagnostic();
    if (diagnostic.dbVersion < 6) {
      console.log("🔄 Migration automatique vers version améliorée...");
      await billetDB.migrateToEnhancedVersion();
    }
  } catch (error) {
    console.error("❌ Erreur initialisation BDD:", error);
  }
});

// Export pour utilisation globale
window.BilletDB = EnhancedBilletDB;
window.billetDB = billetDB;
