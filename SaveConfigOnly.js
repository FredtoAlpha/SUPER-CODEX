/**
 * =====================================================================
 * SAUVEGARDE DE _CONFIG SANS DÉTRUIRE LES ONGLETS
 * =====================================================================
 * Met à jour uniquement _CONFIG avec les nouveaux paramètres
 * Ne touche PAS aux onglets sources existants
 * Ne touche PAS à CONSOLIDATION
 */

function saveConfigurationOnly(params) {
  try {
    Logger.log("💾 SAUVEGARDE DE _CONFIG UNIQUEMENT...");
    Logger.log("  - NIVEAU: " + params.niveau);
    Logger.log("  - NB_SOURCES: " + params.nbSources);
    Logger.log("  - NB_DEST: " + params.nbDest);
    Logger.log("  - LV2: " + params.lv2);
    Logger.log("  - OPT: " + params.opt);
    Logger.log("  - DISPOSITIF: " + params.dispo);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Créer ou récupérer _CONFIG
    let configSheet = ss.getSheetByName('_CONFIG');
    if (!configSheet) {
      configSheet = ss.insertSheet('_CONFIG');
      Logger.log("📄 _CONFIG créé");
    } else {
      Logger.log("📝 _CONFIG existant - mise à jour");
    }
    
    // Effacer le contenu
    configSheet.clear();
    
    // Écrire la nouvelle configuration
    const configData = [
      ["Paramètre", "Valeur"],
      ["ADMIN_PWD", params.adminPassword || "admin123"],
      ["NIVEAU", params.niveau],
      ["NB_SOURCES", params.nbSources],
      ["NB_DEST", params.nbDest],
      ["LV2", params.lv2],
      ["OPT", params.opt],
      ["DISPOSITIF", params.dispo],
      ["DATE_UPDATE", new Date().toISOString()]
    ];
    
    configSheet.getRange(1, 1, configData.length, 2).setValues(configData);
    
    // Formater
    configSheet.getRange(1, 1, 1, 2)
      .setFontWeight('bold')
      .setBackground('#4a5568')
      .setFontColor('#ffffff')
      .setFontSize(12);
    
    configSheet.setColumnWidth(1, 200);
    configSheet.setColumnWidth(2, 400);
    
    // Alterner les couleurs des lignes
    for (let i = 2; i <= configData.length; i++) {
      const bg = (i % 2 === 0) ? '#1e293b' : '#0f172a';
      configSheet.getRange(i, 1, 1, 2).setBackground(bg);
    }
    
    Logger.log("✅ _CONFIG sauvegardé avec succès !");
    Logger.log("⚠️ Onglets sources et CONSOLIDATION NON touchés");
    
    return {
      success: true,
      message: "Configuration sauvegardée ! Vos données existantes sont préservées."
    };
    
  } catch (e) {
    Logger.log("❌ ERREUR: " + e.message);
    Logger.log(e.stack);
    return {
      success: false,
      error: e.message
    };
  }
}

/**
 * Wrapper pour l'appeler depuis l'interface V3
 */
function v3_saveConfigOnly(params) {
  return saveConfigurationOnly(params);
}
