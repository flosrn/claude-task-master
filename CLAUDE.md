# Claude Code Instructions

## Task Master Notion - Enhanced AI-Powered Task Management

### Identification du Projet

**Task Master Notion** est un fork avancé de Task Master AI qui ajoute une intégration complète et bidirectionnelle avec Notion. Cette version étend les capacités de gestion de tâches avec:

- **Synchronisation hiérarchique** : Sync bidirectionnelle des relations parent-enfant entre TaskMaster et Notion
- **Génération d'emojis IA** : Génération automatique d'emojis contextuels pour les tâches
- **Traduction française** : Support intégré pour la traduction français ↔ anglais
- **Gestion transactionnelle** : Opérations atomiques avec rollback automatique
- **Validation et réparation** : Outils de diagnostic et réparation de la synchronisation

## Architecture du Projet

### Structure des Modules Notion

```
scripts/modules/
├── notion.js                      # Module principal Notion avec détection auto des capacités
├── notion-commands.js             # Interface CLI pour les commandes Notion
├── notion-base-command.js         # Classe de base abstraite pour les commandes
├── notion-operations.js           # Opérations transactionnelles avec rollback
├── notion-hierarchy.js            # Gestion de la hiérarchie TaskMaster ↔ Notion
├── notion-commands-hierarchy.js   # Commandes spécialisées pour la hiérarchie
├── notion-reset-command.js        # Commande de reset complet de la DB Notion
├── notion-emoji-ai.js            # Génération d'emojis IA pour les tâches
├── notion-translation-integration.js  # Intégration traduction FR/EN
├── business-to-technical-translator.js # Traduction business → technique
└── emoji-fallback-system.js      # Système de fallback pour emojis
```

### Binaires et Points d'Entrée

- **CLI Principal** : `bin/task-master.js` → `task-master-notion`
- **Serveur MCP** : `mcp-server/server.js` → `task-master-notion-mcp`
- **Alias MCP** : `task-master-ai-notion` (compatibilité)

## Commandes Notion Essentielles

### Commandes de Validation et Diagnostic

```bash
# Validation de la synchronisation avec détection hiérarchique automatique
task-master-notion validate-notion-sync [--preserve-flatten-tasks] [--verbose]

# Validation du setup de hiérarchie (propriétés de relation Notion)
task-master-notion validate-notion-hierarchy-setup

# Validation de l'intégrité hiérarchique TaskMaster ↔ Notion
task-master-notion validate-notion-hierarchy
```

### Commandes de Réparation et Maintenance

```bash
# Réparation intelligente complète (recommandée pour la plupart des cas)
task-master-notion repair-notion-db [--dry-run] [--preserve-extra-tasks] [--preserve-flatten-tasks]

# Réparation spécifique de la hiérarchie parent-enfant
task-master-notion repair-notion-hierarchy [--dry-run] [--force]

# Reset complet de la base Notion (destructif)
task-master-notion reset-notion-db [--preserve-flatten-tasks]
```

## Modes de Synchronisation

### Mode Hiérarchique (Par Défaut)

- **Activation** : Automatique si les propriétés de relation Notion sont détectées
- **Relations créées** : 
  - `Parent item` → `Sub-item` (bidirectionnelle)
  - `Dependencies Tasks` (si propriété existe)
- **Détection automatique** : Le système détecte les capacités de la base Notion
- **Structure** : Tâches principales (1, 2, 3) et sous-tâches (1.1, 1.2, 2.1)

### Mode Legacy/Flat

- **Activation** : `--preserve-flatten-tasks`
- **Comportement** : Toutes les tâches au même niveau hiérarchique
- **Compatibilité** : Bases Notion existantes sans propriétés de relation

## Configuration et Variables d'Environnement

### Variables Notion Requises

```bash
# .env
NOTION_TOKEN=secret_xxxxxxxxxxxxx           # Token d'intégration Notion
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxx   # ID de la base de données Notion
```

### Configuration des Modèles IA

```json
// .taskmaster/config.json
{
  "models": {
    "main": {
      "provider": "anthropic",
      "modelId": "claude-3-7-sonnet-20250219",
      "maxTokens": 120000,
      "temperature": 0.2
    },
    "research": {
      "provider": "perplexity", 
      "modelId": "sonar",
      "maxTokens": 8700,
      "temperature": 0.1
    },
    "fallback": {
      "provider": "anthropic",
      "modelId": "claude-3-5-sonnet-20241022", 
      "maxTokens": 8192,
      "temperature": 0.2
    }
  }
}
```

## Fonctionnalités Avancées

### 1. Génération d'Emojis IA

```javascript
// Génération automatique d'emojis contextuels pour les tâches
const emoji = await generateTaskEmoji(task, {
  useAI: true,
  fallbackEnabled: true,
  maxRetries: 3
});
```

### 2. Système Transactionnel

```javascript
// Toutes les opérations Notion supportent le rollback automatique
const transaction = new TransactionManager('repair-notion-db');
await transaction.executeOperation(new CreatePagesOperation(tasks, { notion, databaseId }));
// En cas d'erreur : rollback automatique de toutes les opérations
```

### 3. Détection Automatique des Capacités

```javascript
// Le système détecte automatiquement les capacités hiérarchiques de Notion
const capabilities = await detectHierarchyCapabilities();
if (capabilities.isFullyConfigured) {
  // Mode hiérarchique automatique
} else {
  // Suggestions pour configurer les propriétés manquantes
}
```

### 4. Traduction Intégrée

- **Propriétés françaises** : `Nom`, `Statut`, `Priorité`, `Complexité`
- **Mapping automatique** : Traduction EN ↔ FR des valeurs de statut/priorité
- **Business to Technical** : Traduction des descriptions business vers technique

## Workflow de Développement Notion

### 1. Initialisation d'un Projet avec Notion

```bash
# Initialiser le projet TaskMaster
task-master-notion init

# Configurer les tokens Notion dans .env
echo "NOTION_TOKEN=secret_xxxxx" >> .env
echo "NOTION_DATABASE_ID=xxxxx" >> .env

# Valider la configuration et détecter les capacités
task-master-notion validate-notion-sync

# Si nécessaire, configurer la hiérarchie Notion
task-master-notion validate-notion-hierarchy-setup
```

### 2. Cycle de Développement Quotidien

```bash
# Obtenir la prochaine tâche
task-master-notion next

# Travailler sur une tâche et logging des notes
task-master-notion update-subtask --id=1.2 --prompt="implémentation des tests unitaires..."

# Marquer comme terminé (sync automatique vers Notion)
task-master-notion set-status --id=1.2 --status=done

# Validation périodique de la sync
task-master-notion validate-notion-sync --verbose
```

### 3. Maintenance et Réparation

```bash
# Diagnostic complet (à lancer régulièrement)
task-master-notion validate-notion-sync --verbose

# Réparation intelligente (si des problèmes sont détectés)
task-master-notion repair-notion-db --dry-run  # Preview
task-master-notion repair-notion-db            # Exécution

# En cas de problèmes hiérarchiques spécifiques
task-master-notion repair-notion-hierarchy --force
```

## Intégration MCP (Model Context Protocol)

### Configuration MCP

```json
// .mcp.json
{
  "mcpServers": {
    "task-master-ai": {
      "command": "npx",
      "args": ["-y", "--package=task-master-ai-notion", "task-master-ai-notion"],
      "env": {
        "NOTION_TOKEN": "secret_xxxxx",
        "NOTION_DATABASE_ID": "xxxxx",
        "ANTHROPIC_API_KEY": "sk-xxxxx"
      }
    }
  }
}
```

### Outils MCP Disponibles

```javascript
// Outils de validation et réparation Notion
validate_notion_sync     // = task-master-notion validate-notion-sync
repair_notion_db         // = task-master-notion repair-notion-db
reset_notion_db         // = task-master-notion reset-notion-db

// Outils de gestion hiérarchique
validate_notion_hierarchy_setup    // = task-master-notion validate-notion-hierarchy-setup
validate_notion_hierarchy         // = task-master-notion validate-notion-hierarchy
repair_notion_hierarchy          // = task-master-notion repair-notion-hierarchy

// Outils TaskMaster standards (hérités)
get_tasks, next_task, add_task, expand_task, etc.
```

## Architecture Technique Détaillée

### Classes et Modules Clés

#### `BaseNotionCommand` (notion-base-command.js)
- **Rôle** : Classe abstraite pour toutes les commandes Notion
- **Fonctionnalités** :
  - Gestion d'erreurs standardisée avec suggestions actionables
  - Contexte unifié (`NotionCommandContext`)
  - Transaction manager intégré avec rollback automatique
  - Validation des prérequis automatique

#### `TransactionManager` (notion-operations.js)
- **Rôle** : Gestion transactionnelle des opérations Notion
- **Opérations supportées** :
  - `ArchivePagesOperation` avec rollback (restore)
  - `CreatePagesOperation` avec rollback (archive)
  - `UpdateMappingOperation` avec sauvegarde/restore
  - `CompositeOperation` pour opérations complexes

#### Gestion Hiérarchique (notion-hierarchy.js)
- **Relations** : Construction et mise à jour des relations Notion
- **Validation** : Vérification d'intégrité hiérarchique
- **Reconstruction** : Rebuild de la hiérarchie depuis Notion

### Propriétés Notion Supportées

#### Propriétés Standard TaskMaster
```javascript
{
  "Name": { "title": [{ "text": { "content": task.title } }] },
  "Task Id": { "rich_text": [{ "text": { "content": task.id } }] },
  "Status": { "select": { "name": translatedStatus } },
  "Priority": { "select": { "name": translatedPriority } },
  "Complexity": { "number": task.complexity || 1 }
}
```

#### Propriétés Hiérarchiques (Auto-détectées)
```javascript
{
  "Parent item": { "relation": [{ "id": parentNotionId }] },     // → Sub-item
  "Dependencies Tasks": { "relation": dependencyNotionIds },     // Optionnel
  "Description": { "rich_text": [...] },                        // Description enrichie
  "Dependencies": { "rich_text": [...] }                        // Fallback textuel
}
```

#### Propriétés de Métadonnées
```javascript
{
  "Tags": { "multi_select": [{ "name": currentTag }] },
  "Last Sync": { "date": { "start": new Date().toISOString() } },
  "🎯": { "select": { "name": generatedEmoji } }                // Emoji IA
}
```

## Gestion d'Erreurs et Diagnostic

### Messages d'Erreur Standardisés

```javascript
// Erreurs Notion API
NOTION_AUTH_ERROR → "Check NOTION_TOKEN in .env file"
NOTION_DB_NOT_FOUND → "Check NOTION_DATABASE_ID in .env file"
NOTION_RATE_LIMIT → "Wait a moment and try again, or reduce batch size"

// Erreurs réseau et fichiers
NETWORK_ERROR → "Check your internet connection"
FILE_NOT_FOUND → "Make sure you're in a TaskMaster project directory"
```

### Diagnostic Automatique

```bash
# Le système fournit automatiquement des diagnostics détaillés
task-master-notion validate-notion-sync --verbose

# Exemple de sortie :
# 🩺 Notion Sync Health Check
# ═══════════════════════════════════════════════════════
# 🚀 Mode: Hierarchical sync
# 📝 TaskMaster tasks: 25 (15 main tasks, 10 subtasks)
# 📄 Notion DB tasks: 25 (15 main tasks, 10 subtasks)
# ✅ Perfect sync! Your TaskMaster tasks and Notion DB are perfectly aligned! 🎉
```

## Bonnes Pratiques de Développement

### 1. Validation Régulière
```bash
# Avant chaque session de travail
task-master-notion validate-notion-sync

# Après modifications importantes
task-master-notion validate-notion-hierarchy
```

### 2. Utilisation des Dry-Run
```bash
# Toujours tester les opérations destructives
task-master-notion repair-notion-db --dry-run
task-master-notion reset-notion-db --dry-run
```

### 3. Préservation des Données
```bash
# Préserver les tâches extra dans Notion si nécessaire
task-master-notion repair-notion-db --preserve-extra-tasks

# Mode legacy pour les bases existantes
task-master-notion repair-notion-db --preserve-flatten-tasks
```

### 4. Monitoring et Logs
```bash
# Activer les logs détaillés pour le debugging
DEBUG=1 task-master-notion validate-notion-sync

# Utiliser le mode verbose pour plus d'informations
task-master-notion validate-notion-sync --verbose
```

## Intégration Claude Code

### Slash Commands Recommandées

```markdown
<!-- .claude/commands/notion-sync-check.md -->
Validate TaskMaster-Notion synchronization and provide status report

Steps:
1. Run `task-master-notion validate-notion-sync --verbose`
2. If issues found, suggest repair commands
3. Provide summary of sync status and next steps
```

```markdown
<!-- .claude/commands/notion-repair.md -->
Repair Notion database synchronization issues

Steps:
1. Run `task-master-notion repair-notion-db --dry-run` to preview changes
2. Review the proposed changes with the user
3. Execute `task-master-notion repair-notion-db` if approved
4. Validate the repair with `task-master-notion validate-notion-sync`
```

### Workflow Claude Code Typique

```bash
# 1. Diagnostic initial
/notion-sync-check

# 2. Développement des tâches
task-master-notion next
task-master-notion show 1.2
# [Implémentation avec Claude Code]
task-master-notion update-subtask --id=1.2 --prompt="détails implémentation..."

# 3. Finalisation et sync
task-master-notion set-status --id=1.2 --status=done
/notion-sync-check  # Validation finale
```

## Tests et Développement Local

### Dossier de Test Intégré

Le projet inclut un dossier de test préconfiguré : `/test-notion-sync/`

- **Localisation** : `/Users/flo/Code/github/claude-task-master/test-notion-sync/`
- **Configuration** : Contient une structure TaskMaster complète avec tâches de test
- **Usage** : Parfait pour tester les fonctionnalités Notion sans affecter un projet en cours

#### Utilisation du Dossier de Test

```bash
# Se déplacer vers le dossier de test
cd /Users/flo/Code/github/claude-task-master/test-notion-sync/

# Utiliser le script TaskMaster local (important!)
node ../bin/task-master.js list                    # Lister les tâches de test
node ../bin/task-master.js validate-notion-sync    # Test de validation
node ../bin/task-master.js repair-notion-db        # Test de réparation

# Ou créer un alias pour simplifier
alias task-master-local='node ../bin/task-master.js'
task-master-local validate-notion-sync --verbose
```

#### Avantages du Dossier de Test

- **Isolation** : Tests sans impact sur les projets réels
- **Données pré-configurées** : 14 tâches de test avec hiérarchie complexe
- **Configuration complète** : `.taskmaster/` et `.env` préconfigurés
- **Tests complets** : Couvre validation, réparation, et synchronisation

#### Configuration du Dossier de Test

```bash
# Dans le dossier test-notion-sync/
# Configurer les variables Notion
cp .env.example .env
# Éditer .env avec vos tokens Notion de test

# Tester la configuration
node ../bin/task-master.js validate-notion-sync
```

**Important** : Toujours utiliser `node ../bin/task-master.js` depuis le dossier de test pour utiliser la version locale de TaskMaster Notion plutôt que la version globalement installée.

## Dépannage et FAQ

### Problèmes Courants

**Q: La synchronisation hiérarchique ne fonctionne pas**
```bash
# R: Vérifier les propriétés de relation Notion
task-master-notion validate-notion-hierarchy-setup
# Suivre les instructions pour créer les propriétés manquantes
```

**Q: Des tâches dupliquées apparaissent dans Notion**
```bash
# R: Utiliser la réparation intelligente
task-master-notion repair-notion-db
# Cela supprime automatiquement les doublons
```

**Q: La base Notion est corrompue**
```bash
# R: Reset complet (destructif)
task-master-notion reset-notion-db
# OU réparation avec préservation des données extra
task-master-notion repair-notion-db --preserve-extra-tasks
```

### Logs et Debug

```bash
# Activer le debug complet
DEBUG=1 task-master-notion validate-notion-sync --verbose

# Logs spécifiques aux modules
DEBUG=notion:* task-master-notion repair-notion-db
```

---

**Note Importante** : TaskMaster Notion est conçu comme la source de vérité. Les réparations privilégient toujours les données TaskMaster en cas de conflit, sauf si `--preserve-extra-tasks` est spécifié.

## Commandes de Reference Rapide

```bash
# Validation et diagnostic
task-master-notion validate-notion-sync [--verbose]
task-master-notion validate-notion-hierarchy-setup
task-master-notion validate-notion-hierarchy

# Réparation et maintenance  
task-master-notion repair-notion-db [--dry-run] [--preserve-extra-tasks]
task-master-notion repair-notion-hierarchy [--dry-run] [--force]
task-master-notion reset-notion-db

# Gestion des tâches (hérité de TaskMaster)
task-master-notion next
task-master-notion show <id>
task-master-notion set-status --id=<id> --status=<status>
task-master-notion update-subtask --id=<id> --prompt="notes..."
```