/**
 * ===================================================================
 * 🔌 Console de Pilotage V3 - Backend Adapters
 * ===================================================================
 *
 * Ce fichier contient les wrappers et adaptateurs pour connecter
 * la Console de Pilotage V3 (frontend) avec les fonctions backend
 * existantes. Il assure que toutes les fonctions retournent des
 * objets de succès/erreur cohérents.
 *
 * @version 1.0.0
 * @date 2025-11-15
 * ===================================================================
 */


/**
 * Charge la configuration pour pré-remplir le formulaire d'initialisation
 * Utilise le CacheService pour éviter les lectures répétées du spreadsheet (Anti-429)
 * @returns {Object} Données pour le formulaire
 */
function v3_loadConfigForForm() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("v3_config_form");

  if (cached) {
    // console.log("Serving config from cache");
    return JSON.parse(cached);
  }

  try {
    const config = getConfig();
    
    // 🔍 DEBUG: Logs détaillés pour comprendre le problème
    Logger.log("🔍 DEBUG v3_loadConfigForForm:");
    Logger.log("  - config.NIVEAU = " + JSON.stringify(config.NIVEAU));
    Logger.log("  - config.NB_SOURCES = " + JSON.stringify(config.NB_SOURCES));
    Logger.log("  - config.NB_DEST = " + JSON.stringify(config.NB_DEST));
    Logger.log("  - config.ADMIN_PASSWORD = " + (config.ADMIN_PASSWORD ? "[présent]" : "[absent]"));
    Logger.log("  - config.LV2_OPTIONS = " + JSON.stringify(config.LV2_OPTIONS));
    
    // Tenter de récupérer nbSources/Dest depuis CONFIG si stocké, sinon valeurs par défaut
    // Note: Ces valeurs ne sont pas toujours stockées explicitement dans _CONFIG standard

    // Récupérer les options pour le niveau actuel
    const niveau = config.NIVEAU || "5e";
    const niveauKey = niveau.toLowerCase().replace('°', 'e');
    const optArray = (config.OPTIONS && config.OPTIONS[niveauKey]) || [];

    const result = {
      success: true,
      adminPassword: config.ADMIN_PASSWORD || config.ADMIN_PASSWORD_DEFAULT || "admin123",
      niveau: config.NIVEAU || "5°",
      // Ces valeurs ne sont pas standard dans _CONFIG, on essaie de les deviner ou défaut
      nbSources: config.NB_SOURCES || 6,
      nbDest: config.NB_DEST || 6,
      lv2: (config.LV2_OPTIONS || []).join(', '),
      opt: optArray.join(', '),
      dispo: config.DISPOSITIFS ? config.DISPOSITIFS.join(', ') : "PAI, PPRE, ULIS, UPE2A"
    };
    
    Logger.log("📦 RESULT v3_loadConfigForForm:");
    Logger.log("  - result.niveau = " + JSON.stringify(result.niveau));
    Logger.log("  - result.nbSources = " + JSON.stringify(result.nbSources));
    Logger.log("  - result.nbDest = " + JSON.stringify(result.nbDest));

    // Mettre en cache pour 10 minutes (600 secondes)
    cache.put("v3_config_form", JSON.stringify(result), 600);
    return result;

  } catch (e) {
    Logger.log("Erreur v3_loadConfigForForm: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Sauvegarde uniquement la configuration dans _CONFIG sans toucher aux onglets
 */
function v3_saveConfigOnly(form) {
  try {
    // 1. Mettre à jour les paramètres simples
    updateConfig('ADMIN_PASSWORD', form.adminPassword);
    updateConfig('NIVEAU', form.niveau);
    updateConfig('NB_SOURCES', form.nbSources); // On stocke pour la prochaine fois
    updateConfig('NB_DEST', form.nbDest);       // On stocke pour la prochaine fois

    // 2. Mettre à jour les listes (LV2, OPT, DISPO)
    // LV2
    updateConfig('LV2_OPTIONS', form.lv2); // updateConfig gère les strings avec virgules

    // OPT (Dépend du niveau)
    const niveauKey = form.niveau.toLowerCase().replace('°', 'e');
    // Pour OPT, c'est plus complexe car c'est une sous-clé de OPTIONS
    // On va utiliser une clé spéciale "OPTIONS_5e" que getConfig sait lire
    updateConfig(`OPTIONS_${niveauKey.toUpperCase()}`, form.opt);

    // DISPO (Nouveau)
    if (form.dispo) {
      updateConfig('DISPOSITIFS', form.dispo); // updateConfig gère les strings avec virgules si implémenté
      // Si updateConfig ne gère pas les arrays pour les nouvelles clés, il stockera le string, ce qui est OK
    }

    // Invalider le cache pour forcer le rechargement au prochain appel
    CacheService.getScriptCache().remove("v3_config_form");

    return { success: true, message: "Configuration sauvegardée !" };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * ===================================================================
 * PHASE 1 : INITIALISATION
 * ===================================================================
 */

/**
 * Lance l'initialisation complète à partir des données de la console.
 * Remplace l'ancienne fonction `ouvrirInitialisation`.
 *
 * @param {Object} config - L'objet de configuration venant du frontend.
 * @returns {Object} {success: boolean, message?: string, error?: string}
 */
function v3_runInitialisation(config) {
  try {
    // Valider la configuration reçue
    if (!config || !config.niveau || !config.nbSources || !config.nbDest || !config.lv2 || !config.opt) {
      throw new Error("La configuration reçue est incomplète.");
    }

    // Appeler la fonction d'initialisation principale avec les données de la console
    return initialiserSysteme(
      config.niveau,
      config.nbSources,
      config.nbDest,
      config.lv2,
      config.opt
    );

  } catch (e) {
    Logger.log(`Erreur dans v3_runInitialisation: ${e.message}`);
    return {
      success: false,
      error: e.message || "Erreur lors de l'initialisation"
    };
  }
}

/**
 * Initialise le système avec les données du formulaire INTÉGRÉ
 * ZÉRO POPUP - Tout est géré via le formulaire de la console
 *
 * @param {Object} formData - Les données du formulaire
 * @param {string} formData.adminPassword - Mot de passe admin
 * @param {string} formData.niveau - Niveau scolaire (6°, 5°, 4°, 3°)
 * @param {number} formData.nbSources - Nombre de sources
 * @param {number} formData.nbDest - Nombre de destinations
 * @param {string} formData.lv2 - LV2 (séparées par virgules)
 * @param {string} formData.opt - Options (séparées par virgules)
 * @returns {Object} {success: boolean, message?: string, error?: string}
 */
function v3_runInitializationWithForm(formData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = getConfig();

    // 1. Vérifier le mot de passe (cherche d'abord ADMIN_PASSWORD, sinon ADMIN_PASSWORD_DEFAULT)
    const expectedPassword = config.ADMIN_PASSWORD || config.ADMIN_PASSWORD_DEFAULT || "admin123";
    if (formData.adminPassword !== expectedPassword) {
      return {
        success: false,
        error: "Mot de passe administrateur incorrect"
      };
    }

    // 2. Valider les données (Validation OUVERTE - accepte n'importe quel niveau)
    if (!formData.niveau || formData.niveau.trim() === "") {
      return {
        success: false,
        error: "Niveau scolaire requis"
      };
    }

    if (formData.nbSources < 1 || formData.nbSources > 20) {
      return {
        success: false,
        error: "Nombre de sources invalide (1-20)"
      };
    }

    if (formData.nbDest < 1 || formData.nbDest > 15) {
      return {
        success: false,
        error: "Nombre de destinations invalide (1-15)"
      };
    }

    // 3. Nettoyer les LV2, Options, et Dispositifs
    const lv2Array = nettoyerListeInput(formData.lv2);
    const optArray = nettoyerListeInput(formData.opt);
    // Nouveau : On traite aussi les dispositifs
    const dispoArray = nettoyerListeInput(formData.dispo);

    Logger.log(`V3 Init - Niveau: ${formData.niveau}`);
    Logger.log(`V3 Init - Sources: ${formData.nbSources}`);
    Logger.log(`V3 Init - Destinations: ${formData.nbDest}`);
    Logger.log(`V3 Init - LV2: ${lv2Array.join(', ')}`);
    Logger.log(`V3 Init - Options: ${optArray.join(', ')}`);
    Logger.log(`V3 Init - Dispositifs: ${dispoArray.join(', ')}`);

    // 4. Vérifier si déjà initialisé (silencieux, pas de popup)
    const structureSheet = ss.getSheetByName(config.SHEETS.STRUCTURE);
    if (structureSheet) {
      Logger.log("ATTENTION: Le système est déjà initialisé. Réinitialisation en cours...");
    }

    // 5. Appeler la fonction d'initialisation principale SANS POPUPS
    // On appelle directement initialiserSysteme() au lieu de ouvrirInitialisation()
    initialiserSysteme(formData.niveau, formData.nbSources, formData.nbDest, lv2Array, optArray, dispoArray);

    return {
      success: true,
      message: `Système initialisé avec succès pour ${formData.niveau} (${formData.nbSources} sources → ${formData.nbDest} destinations)`
    };

  } catch (e) {
    Logger.log(`Erreur dans v3_runInitializationWithForm: ${e.message}`);
    Logger.log(e.stack);
    return {
      success: false,
      error: e.message || "Erreur lors de l'initialisation"
    };
  }
}

/**
 * ===================================================================
 * PHASE 2 : DIAGNOSTIC
 * ===================================================================
 */

/**
 * Wrapper pour runGlobalDiagnostics()
 * La fonction originale retourne déjà un array d'objets, donc on l'utilise directement.
 * On l'expose sous un nom V3 pour cohérence.
 *
 * @returns {Array<Object>} Array d'objets diagnostic
 */
function v3_runDiagnostics() {
  try {
    return runGlobalDiagnostics();
  } catch (e) {
    Logger.log(`Erreur dans v3_runDiagnostics: ${e.message}`);
    return [{
      id: 'fatal_error',
      status: 'error',
      icon: 'error',
      message: 'Erreur critique: ' + e.message
    }];
  }
}

/**
 * ===================================================================
 * PHASE 3 : GÉNÉRATION
 * ===================================================================
 */

/**
 * Wrapper pour legacy_runFullPipeline() qui retourne un objet de succès
 * La fonction originale affiche des alerts et lance le pipeline sans retourner de valeur.
 *
 * @returns {Object} {success: boolean, message?: string, error?: string}
 */
function v3_runGeneration() {
  try {
    // La fonction originale gère sa propre confirmation via UI.alert
    // et affiche des toasts pour le feedback
    legacy_runFullPipeline();

    // Si aucune exception n'est levée, on considère que c'est un succès
    return {
      success: true,
      message: "Génération des classes lancée. Le processus peut prendre 2-5 minutes."
    };
  } catch (e) {
    Logger.log(`Erreur dans v3_runGeneration: ${e.message}`);
    return {
      success: false,
      error: e.message || "Erreur lors de la génération des classes"
    };
  }
}

/**
 * ===================================================================
 * PHASE 4 : OPTIMISATION
 * ===================================================================
 */

/**
 * Wrapper pour showOptimizationPanel() qui retourne un objet de succès
 * La fonction originale affiche un modal et ne retourne rien.
 *
 * @returns {Object} {success: boolean, message?: string, error?: string}
 */
function v3_runOptimization() {
  try {
    // Afficher le panneau d'optimisation
    showOptimizationPanel();

    return {
      success: true,
      message: "Panneau d'optimisation ouvert. Utilisez-le pour affiner la répartition."
    };
  } catch (e) {
    Logger.log(`Erreur dans v3_runOptimization: ${e.message}`);
    return {
      success: false,
      error: e.message || "Erreur lors de l'ouverture du panneau d'optimisation"
    };
  }
}

/**
 * ===================================================================
 * PHASE 5 : SWAPS MANUELS
 * ===================================================================
 */

/**
 * Wrapper pour setBridgeContext() - déjà OK, on l'expose pour cohérence
 *
 * @param {string} mode - Le mode à charger (ex: 'TEST')
 * @param {string} sourceSheetName - Nom de la feuille source
 * @returns {Object} {success: boolean, error?: string}
 */
function v3_setBridgeContext(mode, sourceSheetName) {
  return setBridgeContext(mode, sourceSheetName);
}

/**
 * ===================================================================
 * PHASE 6 : FINALISATION
 * ===================================================================
 */

/**
 * Wrapper pour finalizeProcess() - déjà OK, on l'expose pour cohérence
 *
 * @returns {Object} {success: boolean, message?: string, error?: string}
 */
function v3_finalizeProcess() {
  return finalizeProcess();
}

/**
 * Wrapper pour runGlobalDiagnostics() utilisé avant la finalisation
 * C'est la même fonction que v3_runDiagnostics() mais on la garde
 * pour cohérence avec le code existant.
 */
function v3_runPreFinalizeDiagnostics() {
  return v3_runDiagnostics();
}

/**
 * ===================================================================
 * FONCTIONS UTILITAIRES
 * ===================================================================
 */

/**
 * Fonction pour ouvrir la Console de Pilotage V3
 * À ajouter au menu Google Sheets
 */
function ouvrirConsolePilotageV3() {
  const html = HtmlService.createHtmlOutputFromFile('ConsolePilotageV3')
    .setWidth(1600)
    .setHeight(900)
    .setTitle('Console de Pilotage V3 - Expert Edition');

  SpreadsheetApp.getUi().showModelessDialog(html, 'Console de Pilotage V3');
}

/**
 * Fonction pour mettre à jour les métriques en temps réel
 * Cette fonction peut être appelée périodiquement par le frontend
 *
 * @returns {Object} {students, classes, sources, destinations}
 */
function v3_getMetrics() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Compter les élèves depuis CONSOLIDATION
    const consolidationSheet = ss.getSheetByName('CONSOLIDATION');
    const studentCount = consolidationSheet && consolidationSheet.getLastRow() > 1
      ? consolidationSheet.getLastRow() - 1
      : 0;

    // Compter les classes depuis _STRUCTURE
    const structureSheet = ss.getSheetByName('_STRUCTURE');
    const classCount = structureSheet && structureSheet.getLastRow() > 1
      ? structureSheet.getLastRow() - 1
      : 0;

    // Compter les onglets sources (qui ne se terminent pas par TEST ou DEF)
    const allSheets = ss.getSheets();
    const sourceSheets = allSheets.filter(s => {
      const name = s.getName();
      return !name.endsWith('TEST') && !name.endsWith('DEF') &&
        !name.startsWith('_') && name !== 'CONSOLIDATION';
    });

    // Compter les onglets de destination (TEST ou DEF)
    const destSheets = allSheets.filter(s => {
      const name = s.getName();
      return name.endsWith('TEST') || name.endsWith('DEF');
    });

    return {
      students: studentCount,
      classes: classCount,
      sources: sourceSheets.length,
      destinations: destSheets.length
    };
  } catch (e) {
    Logger.log(`Erreur dans v3_getMetrics: ${e.message}`);
    return {
      students: 0,
      classes: 0,
      sources: 0,
      destinations: 0
    };
  }
}

/**
 * ===================================================================
 * CRÉATION DU MENU
 * ===================================================================
 *
 * Ajouter cette fonction au fichier principal pour créer le menu
 */
function createConsolePilotageV3Menu() {
  SpreadsheetApp.getUi()
    .createMenu('🚀 Console de Pilotage V3')
    .addItem('📊 Ouvrir la Console V3', 'ouvrirConsolePilotageV3')
    .addSeparator()
    .addItem('📈 Voir les Métriques', 'showV3Metrics')
    .addToUi();
}

function showV3Metrics() {
  const metrics = v3_getMetrics();
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Métriques du Système',
    `👥 Élèves: ${metrics.students}\n` +
    `🏫 Classes: ${metrics.classes}\n` +
    `📁 Sources: ${metrics.sources}\n` +
    `🎯 Destinations: ${metrics.destinations}`,
    ui.ButtonSet.OK
  );
}

/**
 * ===================================================================
 * FONCTIONS SUPPLÉMENTAIRES POUR CONSOLE V3
 * ===================================================================
 */

/**
 * Ouvre l'interface ConfigurationComplete pour configurer la structure des classes
 */
function ouvrirConfigurationComplete() {
  const html = HtmlService.createHtmlOutputFromFile('ConfigurationComplete')
    .setWidth(900)
    .setHeight(700)
    .setTitle('⚙️ Configuration Complète - Structure & Options');

  SpreadsheetApp.getUi().showModalDialog(html, '⚙️ Configuration Complète');
}

/**
 * Wrapper pour genererNomPrenomEtID() avec retour de succès/erreur
 */
function v3_genererNomPrenomEtID() {
  try {
    Logger.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Logger.log("🚀 DÉBUT: Génération IDs + Consolidation");
    Logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Étape 1 : Générer les IDs dans les sources
    Logger.log("📝 ÉTAPE 1/2 : Génération des IDs dans les sources...");
    genererNomPrenomEtID();
    Logger.log("✅ IDs générés\n");

    // Étape 2 : Consolider toutes les sources → CONSOLIDATION
    Logger.log("📊 ÉTAPE 2/2 : Consolidation vers CONSOLIDATION...");
    const resultatConso = consoliderDonnees();
    Logger.log(`✅ ${resultatConso}\n`);

    Logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Logger.log("🎉 SUCCÈS: Processus complet terminé");
    Logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    return {
      success: true,
      message: `IDs générés ✓ | ${resultatConso}`
    };
  } catch (e) {
    Logger.log(`\n❌ ERREUR dans v3_genererNomPrenomEtID: ${e.message}`);
    Logger.log(e.stack);
    return {
      success: false,
      error: e.message || 'Erreur lors de la génération/consolidation'
    };
  }
}

/**
 * Récupère les statistiques complètes depuis CONSOLIDATION
 * @returns {Object} Statistiques complètes pour Phase STATS
 */
function v3_getStats() {
  return getConsolidationStats();
}

/**
 * Lit l'onglet _STRUCTURE pour calculer le nombre total de places disponibles
 * @returns {Object} {success: boolean, totalPlaces: number, classes: Array, error?: string}
 */
function v3_getStructureInfo() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const structureSheet = ss.getSheetByName('_STRUCTURE');

    if (!structureSheet) {
      return {
        success: false,
        error: 'Onglet _STRUCTURE non trouvé. Lancez d\'abord l\'initialisation.'
      };
    }

    const lastRow = structureSheet.getLastRow();
    if (lastRow <= 1) {
      return {
        success: false,
        error: 'L\'onglet _STRUCTURE est vide'
      };
    }

    // Lire les données (à partir de la ligne 2 jusqu'à la fin)
    const data = structureSheet.getRange(2, 1, lastRow - 1, 5).getValues();

    let totalPlaces = 0;
    const classes = [];

    data.forEach(row => {
      const classe = row[0]; // Colonne A: CLASSE
      const effectif = parseInt(row[1], 10) || 0; // Colonne B: EFFECTIF
      const lv2 = row[2]; // Colonne C: LV2
      const opt = row[3]; // Colonne D: OPT
      const commentaire = row[4]; // Colonne E: COMMENTAIRE

      if (classe && classe.toString().trim() !== '') {
        totalPlaces += effectif;
        classes.push({
          classe: classe,
          effectif: effectif,
          lv2: lv2,
          opt: opt,
          commentaire: commentaire
        });
      }
    });

    return {
      success: true,
      totalPlaces: totalPlaces,
      classes: classes,
      nbClasses: classes.length
    };
  } catch (e) {
    Logger.log(`Erreur dans v3_getStructureInfo: ${e.message}`);
    return {
      success: false,
      error: e.message || 'Erreur lors de la lecture de _STRUCTURE'
    };
  }
}

/**
 * ===================================================================
 * PHASE 3 : ÉDITEUR DE STRUCTURE INTÉGRÉ
 * ===================================================================
 */

/**
 * Récupère les données pour l'éditeur de structure intégré (Phase 4)
 * Avec pré-remplissage intelligent des quotas depuis les STATS
 */
function v3_getStructureDataForEditor() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const config = getConfig(); // Lit _CONFIG pour avoir les options/LV2 définies en Phase 1

    // Lire LV2 et OPT depuis les bonnes propriétés
    const niveau = config.NIVEAU || "5e";
    const niveauKey = niveau.toLowerCase().replace('°', 'e'); // "5°" → "5e"

    const lv2Raw = config.LV2_OPTIONS || []; // Array déjà parsé
    const optRaw = (config.OPTIONS && config.OPTIONS[niveauKey]) || []; // Array déjà parsé

    // 1. Récupérer les options actives (déjà des arrays)
    const lv2List = Array.isArray(lv2Raw) ? lv2Raw : [];
    // FILTRE ANTI-DUPLICATION : On retire des Options tout ce qui est déjà en LV2
    const optListRaw = Array.isArray(optRaw) ? optRaw : [];
    const optList = optListRaw.filter(opt => !lv2List.includes(opt));

    // 2. Récupérer les stats pour pré-remplir les quotas (info uniquement)
    const stats = getConsolidationStats();
    const lv2Stats = stats.success ? stats.lv2 : {};
    const optStats = stats.success ? stats.options : {};
    const comboStats = stats.success ? stats.combos : {};

    // 3. Tenter de lire la structure existante dans _STRUCTURE
    const structureSheet = ss.getSheetByName('_STRUCTURE');
    let classesGenerated = [];
    let loadedFromSheet = false;

    if (structureSheet && structureSheet.getLastRow() > 1) {
      const data = structureSheet.getRange(2, 1, structureSheet.getLastRow() - 1, 4).getValues();
      // Format attendu: [Type, Nom, Capacité, OptionsString]

      data.forEach(row => {
        // FILTRE : On ne veut QUE les classes de type "TEST" pour l'éditeur
        // Les types peuvent être "SOURCE", "TEST", "DEF"
        const type = String(row[0]).trim().toUpperCase();

        if (type === "TEST" && row[1] && String(row[1]).trim() !== "") { // Si Type est TEST et Nom existe
          const quotas = {};
          // Initialiser toutes les options possibles à 0
          [...lv2List, ...optList].forEach(k => quotas[k] = 0);

          // Parser la string d'options (ex: "ITA=5,LATIN=2")
          if (row[3]) {
            const parts = String(row[3]).split(',');
            parts.forEach(p => {
              const [k, v] = p.split('=');
              if (k && v) {
                const keyClean = k.trim().toUpperCase();
                // On ne garde que si c'est une LV2 ou OPTION valide (pas les combos)
                if (lv2List.includes(keyClean) || optList.includes(keyClean)) {
                  // Additionner les valeurs si la clé existe déjà (gestion des doublons)
                  quotas[keyClean] = (quotas[keyClean] || 0) + (parseInt(v) || 0);
                }
              }
            });
          }

          classesGenerated.push({
            name: row[1],
            capacity: parseInt(row[2]) || 30,
            quotas: quotas
          });
        }
      });

      if (classesGenerated.length > 0) {
        loadedFromSheet = true;
        Logger.log(`✅ Structure chargée depuis _STRUCTURE (${classesGenerated.length} classes TEST)`);
      }
    }

    // 4. Si rien chargé depuis _STRUCTURE, générer le squelette par défaut via Config
    if (!loadedFromSheet) {
      const nbDest = parseInt(config.NB_DEST) || 6;
      Logger.log(`🎯 Génération structure par défaut: ${nbDest} classes (config.NB_DEST=${config.NB_DEST})`);

      for (let i = 1; i <= nbDest; i++) {
        const quotas = {};
        // Initialiser TOUS les quotas à 0
        lv2List.forEach(lv2 => quotas[lv2] = 0);
        optList.forEach(opt => quotas[opt] = 0);

        classesGenerated.push({
          name: `${niveau}${i}`,
          capacity: 30,
          quotas: quotas
        });
      }
    }

    return {
      success: true,
      lv2: lv2List,
      options: optList,
      classes: classesGenerated,
      source: loadedFromSheet ? 'SHEET' : 'CONFIG',
      stats: {
        effectifs: stats.effectifs || { total: 0 },
        lv2: lv2Stats,
        options: optStats,
        combos: comboStats
      }
    };

  } catch (e) {
    Logger.log("Erreur v3_getStructureDataForEditor: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Sauvegarde la structure depuis l'éditeur intégré
 */
function v3_saveStructureFromEditor(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('_STRUCTURE');

    // Si pas de feuille, on la recrée (sécurité)
    if (!sheet) {
      sheet = ss.insertSheet('_STRUCTURE');
    }

    // 1. Lire les données existantes pour PRÉSERVER les lignes non-TEST (SOURCE, DEF)
    const existingData = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues() : [];
    const preservedRows = [];

    existingData.forEach(row => {
      const type = String(row[0]).trim().toUpperCase();
      // On garde tout ce qui n'est PAS "TEST"
      if (type !== "TEST") {
        preservedRows.push(row);
      }
    });

    Logger.log(`Préservation de ${preservedRows.length} lignes (SOURCE/DEF)`);

    // On réécrit le sheet proprement
    sheet.clear();

    const headers = ["Type", "Nom Classe", "Capacité Max", "Options (Quotas)"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#d3d3d3");

    // Construire les nouvelles lignes TEST
    const newTestRows = [];
    data.classes.forEach(cls => {
      // Construire la chaîne d'options : "ITA=5,LATIN=2"
      let optsParts = [];
      if (cls.quotas) {
        for (const [key, val] of Object.entries(cls.quotas)) {
          if (val > 0) optsParts.push(`${key}=${val}`);
        }
      }

      // Ligne pour la classe (Type TEST pour le moteur)
      newTestRows.push(["TEST", cls.name, cls.capacity, optsParts.join(',')]);
    });

    // Combiner : Lignes préservées + Nouvelles lignes TEST
    const finalRows = [...preservedRows, ...newTestRows];

    if (finalRows.length > 0) {
      sheet.getRange(2, 1, finalRows.length, 4).setValues(finalRows);
    }

    Logger.log("Structure enregistrée avec succès");
    return { success: true, message: "Structure enregistrée !" };

  } catch (e) {
    Logger.log("Erreur v3_saveStructureFromEditor: " + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * ===================================================================
 * SYSTÈME DE SAUVEGARDE/REPRISE AUTOMATIQUE
 * ===================================================================
 */

/**
 * Sauvegarde la progression actuelle (phase et métadonnées)
 * @param {number} phase - Numéro de la phase actuelle (1-6)
 * @param {Object} metadata - Métadonnées optionnelles (nbEleves, structure validée, etc.)
 * @returns {Object} {success: boolean}
 */
function v3_saveProgress(phase, metadata) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName('_CONFIG');
    
    if (!configSheet) {
      throw new Error("Onglet _CONFIG introuvable");
    }
    
    // Chercher ou créer la ligne PROGRESS
    const data = configSheet.getDataRange().getValues();
    let progressRow = -1;
    
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === 'PROGRESS') {
        progressRow = i + 1;
        break;
      }
    }
    
    // Préparer les données de progression
    const progressData = {
      phase: phase,
      timestamp: new Date().toISOString(),
      metadata: metadata || {}
    };
    
    const progressValue = JSON.stringify(progressData);
    
    if (progressRow === -1) {
      // Ajouter une nouvelle ligne à la fin
      const lastRow = configSheet.getLastRow();
      configSheet.getRange(lastRow + 1, 1).setValue('PROGRESS');
      configSheet.getRange(lastRow + 1, 2).setValue(progressValue);
    } else {
      // Mettre à jour la ligne existante
      configSheet.getRange(progressRow, 2).setValue(progressValue);
    }
    
    Logger.log(`✅ Progression sauvegardée : Phase ${phase}`);
    return { success: true };
    
  } catch (e) {
    Logger.log(`Erreur v3_saveProgress: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Charge la dernière progression sauvegardée
 * @returns {Object} {success: boolean, phase?: number, metadata?: Object}
 */
function v3_loadProgress() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName('_CONFIG');
    
    if (!configSheet) {
      return { success: false, error: "Onglet _CONFIG introuvable" };
    }
    
    // Chercher la ligne PROGRESS
    const data = configSheet.getDataRange().getValues();
    
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === 'PROGRESS') {
        const progressValue = data[i][1];
        
        if (!progressValue) {
          return { success: true, phase: 1, metadata: {}, firstTime: true };
        }
        
        try {
          const progressData = JSON.parse(progressValue);
          return {
            success: true,
            phase: progressData.phase || 1,
            metadata: progressData.metadata || {},
            timestamp: progressData.timestamp
          };
        } catch (parseError) {
          Logger.log(`Erreur parsing PROGRESS: ${parseError.message}`);
          return { success: true, phase: 1, metadata: {}, firstTime: true };
        }
      }
    }
    
    // Aucune progression trouvée = première utilisation
    return { success: true, phase: 1, metadata: {}, firstTime: true };
    
  } catch (e) {
    Logger.log(`Erreur v3_loadProgress: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * ===================================================================
 * GESTION DE SESSION (STATUS / LOAD / RESET)
 * ===================================================================
 */

/**
 * Retourne l'état de la session sauvegardée pour la console V3.
 * Permet au frontend de savoir si une reprise est possible.
 */
function v3_getSessionStatus() {
  try {
    const progress = v3_loadProgress();
    const hasBackup = Boolean(progress && progress.success && !progress.firstTime);

    return {
      success: true,
      hasBackup: hasBackup,
      progress: progress.success ? progress : null
    };
  } catch (e) {
    Logger.log(`Erreur v3_getSessionStatus: ${e.message}`);
    return { success: false, hasBackup: false, error: e.message };
  }
}

/**
 * Charge la session sauvegardée : configuration + progression.
 */
function v3_loadSessionState() {
  try {
    // Invalider le cache pour forcer une relecture fraîche depuis _CONFIG
    CacheService.getScriptCache().remove("v3_config_form");
    Logger.log("📥 v3_loadSessionState: Cache invalidé pour relecture fraîche");
    
    const config = v3_loadConfigForForm();
    const progress = v3_loadProgress();

    if (!config || config.success === false) {
      throw new Error(config && config.error ? config.error : "Configuration introuvable");
    }

    return {
      success: true,
      config: config,
      progress: progress && progress.success ? progress : null
    };
  } catch (e) {
    Logger.log(`Erreur v3_loadSessionState: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Réinitialise la session en supprimant la progression stockée.
 */
function v3_resetSessionState() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName('_CONFIG');

    if (!configSheet) {
      throw new Error("Onglet _CONFIG introuvable");
    }

    const data = configSheet.getDataRange().getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === 'PROGRESS') {
        configSheet.getRange(i + 1, 2).clearContent();
        CacheService.getScriptCache().remove("v3_config_form");
        return { success: true, reset: true };
      }
    }

    // Si aucune ligne PROGRESS trouvée, on considère le reset comme réussi
    CacheService.getScriptCache().remove("v3_config_form");
    return { success: true, reset: true };
  } catch (e) {
    Logger.log(`Erreur v3_resetSessionState: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Compte les élèves déjà placés dans les onglets TEST par LV2/Option
 * @returns {Object} {success, counts: {capacity: X, ESP: Y, ITA: Z, ...}}
 */
function v3_getPlacedStudentsCounts() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    
    // Filtrer les onglets TEST
    const testSheets = sheets.filter(s => {
      const name = s.getName();
      return name.indexOf('°TEST') > -1 || /TEST\d+$/.test(name);
    });
    
    if (testSheets.length === 0) {
      return {
        success: true,
        counts: { capacity: 0 }
      };
    }
    
    // Récupérer la config pour savoir quelles colonnes chercher
    const config = getConfig();
    const lv2Options = config.LV2_OPTIONS || [];
    const niveau = config.NIVEAU || "5e";
    const niveauKey = niveau.toLowerCase().replace('°', 'e');
    const optionsArray = (config.OPTIONS && config.OPTIONS[niveauKey]) || [];
    
    // Initialiser les compteurs
    const counts = { capacity: 0 };
    lv2Options.forEach(lv2 => counts[lv2] = 0);
    optionsArray.forEach(opt => counts[opt] = 0);
    
    // Parcourir chaque onglet TEST
    testSheets.forEach(sheet => {
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return; // Pas de données
      
      const headers = data[0];
      const rows = data.slice(1);
      
      // Trouver les indices des colonnes LV2 et Options
      const lv2Index = headers.indexOf('LV2');
      const optIndex = headers.indexOf('OPT');
      
      // Compter les élèves (lignes non vides)
      rows.forEach(row => {
        if (row[0]) { // Si la première colonne n'est pas vide (ID ou NOM)
          counts.capacity++;
          
          // Compter par LV2
          if (lv2Index !== -1 && row[lv2Index]) {
            const lv2Value = String(row[lv2Index]).trim().toUpperCase();
            if (counts[lv2Value] !== undefined) {
              counts[lv2Value]++;
            }
          }
          
          // Compter par Option
          if (optIndex !== -1 && row[optIndex]) {
            const optValue = String(row[optIndex]).trim().toUpperCase();
            if (counts[optValue] !== undefined) {
              counts[optValue]++;
            }
          }
        }
      });
    });
    
    return {
      success: true,
      counts: counts
    };
    
  } catch (e) {
    Logger.log(`Erreur v3_getPlacedStudentsCounts: ${e.message}`);
    return { success: false, error: e.message };
  }
}
