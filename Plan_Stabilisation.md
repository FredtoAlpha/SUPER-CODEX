# Plan de Stabilisation & Portabilité

## 1. État des Lieux : Le "Mille-Feuille"
Votre analyse est correcte. Le projet empile plusieurs époques :
*   **Legacy :** `Code.js`, `LEGACY_*` (Dépendance forte à l'interface Sheets classique).
*   **V14/V15 (Actuel) :** `Orchestration_V14I.js`, `Phase4_Optimisation_V15.js` (Logique plus pure, mais encore liée à Sheets pour les E/S).
*   **V2 (Futur) :** `OptiConfig_System.js` (Tentative d'abstraction de la config).

## 2. Réponse sur la Portabilité
**Est-ce portable ? OUI, mais...**
*   **Le Moteur (Cœur) :** La logique de répartition (`Phase4`, `Phase3`) est du pur JavaScript. Elle est **100% portable** (Node.js, React, Python via traduction).
*   **Les Entrées/Sorties (Perifériques) :** Tout ce qui est `SpreadsheetApp.getActive()`, `.getRange()`, `.setValue()` est **100% propriétaire Google**.
*   **L'Interface :** Le HTML/CSS est standard, mais la communication `google.script.run` est propriétaire.

**Verdict :** Pour sortir de Google Apps Script, il faudrait "juste" remplacer la couche de lecture/écriture (Sheets) par une base de données (SQL/NoSQL) et une API. Le "cerveau" du projet est sauf.

## 3. Améliorations & Bugs Potentiels
Voici les points de fragilité identifiés lors de l'audit :

### 🔴 Points Critiques (Risque de casse)
1.  **Architecture Hybride (Le plus dangereux) :** `OptiConfig_System.js` lit parfois dans `_OPTI_CONFIG` (nouveau) et parfois dans `_STRUCTURE` (ancien). Si vous modifiez la structure de l'onglet `_STRUCTURE` (ex: suppression de colonnes), le nouveau système plante silencieusement ou revient à des valeurs par défaut.
2.  **Détection "Magique" des Classes :** Le système devine les classes en scannant les onglets (`6°1CACHE`, `6°1TEST`). Si un utilisateur renomme mal un onglet, la classe disparaît du radar.
3.  **Couplage Fort UI/Backend :** L'interface Admin écrit du JSON directement dans des cellules cachées (`_OPTI_CONFIG`). C'est fragile : si le format JSON est mal formé (erreur manuelle), tout plante.

### 🟠 Améliorations Possibles (Stabilisation)
1.  **Verrouiller la Source de Vérité :** Décider une fois pour toutes : est-ce `_STRUCTURE` ou `_OPTI_CONFIG` qui fait foi ? (Recommandation : Migrer totalement vers `_OPTI_CONFIG` pour l'admin et ne garder `_STRUCTURE` que pour l'import initial).
2.  **Tests Unitaires "Santé" :** Créer un script `CheckHealth()` qui vérifie la cohérence des données avant de lancer l'optimisation (ex: "Est-ce que toutes les classes de `_STRUCTURE` ont des quotas définis ?").
3.  **Nettoyage du Code Mort :** Supprimer les appels à `LEGACY_` dans le pipeline V14 pour éviter les confusions.

## 4. Plan d'Action Proposé
Si vous voulez "peaufiner" et sécuriser l'admin :

1.  **[SECURITE]** Créer un validateur de configuration (empêche de lancer si incohérence).
2.  **[NETTOYAGE]** Isoler le code "Moteur" du code "Google Sheets" (créer une couche d'abstraction `DataAccessLayer`). Cela préparera la portabilité.
3.  **[UI]** Finir l'interface Admin pour qu'elle écrive proprement dans `_OPTI_CONFIG` sans passer par des "hacks" hybrides.

Je peux commencer par le point 1 (Validateur) ou 2 (Isolation) selon votre priorité.
