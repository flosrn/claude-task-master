/**
 * notion-emoji-ai.js
 * IA-powered emoji generation for Notion tasks
 */

import { generateTextService } from './ai-services-unified.js';
import { log } from './utils.js';

/**
 * Cache pour éviter de re-demander l'IA pour les mêmes tâches
 */
const emojiCache = new Map();

/**
 * Génère un emoji approprié pour une tâche en utilisant l'IA
 * @param {Object} task - La tâche (avec title, description, etc.)
 * @returns {Promise<string>} L'emoji choisi par l'IA ou emoji par défaut
 */
export async function generateTaskEmoji(task) {
	try {
		// Créer une clé de cache basée sur le contenu de la tâche
		const cacheKey = generateCacheKey(task);
		
		// Vérifier le cache d'abord
		if (emojiCache.has(cacheKey)) {
			log('debug', `[EMOJI] Cache hit for task: ${task.title}`);
			return emojiCache.get(cacheKey);
		}

		// Préparer le contexte de la tâche pour l'IA
		const taskContext = buildTaskContext(task);
		
		// Prompt optimisé pour l'IA
		const prompt = buildEmojiPrompt(taskContext);
		
		log('debug', `[EMOJI] Requesting AI emoji for: ${task.title}`);
		
		// Appel IA avec timeout et fallback
		const response = await generateTextService({
			prompt,
			role: 'main', // Utilise le modèle principal configuré
			outputType: 'cli'
		});
		
		// Extraire l'emoji de la réponse
		const emoji = extractEmojiFromResponse(response.text);
		
		// Valider l'emoji
		const validEmoji = validateEmoji(emoji);
		
		// Mettre en cache pour éviter les appels futurs
		emojiCache.set(cacheKey, validEmoji);
		
		log('debug', `[EMOJI] Generated ${validEmoji} for task: ${task.title}`);
		return validEmoji;
		
	} catch (error) {
		log('warn', `[EMOJI] Failed to generate emoji for task ${task.title}: ${error.message}`);
		return getDefaultEmoji(task);
	}
}

/**
 * Génère une clé de cache basée sur le contenu significatif de la tâche
 */
function generateCacheKey(task) {
	const content = [
		task.title || '',
		task.description || '',
		task.priority || '',
		task.status || ''
	].join('|').toLowerCase().trim();
	
	// Hash simple pour éviter les clés trop longues
	return btoa(content).slice(0, 32);
}

/**
 * Construit le contexte de la tâche pour l'IA
 */
function buildTaskContext(task) {
	const context = {
		title: task.title || 'Sans titre',
		description: task.description || '',
		details: task.details || '',
		priority: task.priority || 'medium',
		status: task.status || 'pending'
	};
	
	// Ajouter des mots-clés significatifs
	const keywords = extractKeywords(context);
	context.keywords = keywords;
	
	return context;
}

/**
 * Extrait des mots-clés significatifs du contexte de la tâche
 */
function extractKeywords(context) {
	const text = [context.title, context.description, context.details].join(' ').toLowerCase();
	
	// Mots-clés techniques communs
	const technicalKeywords = [
		'api', 'database', 'frontend', 'backend', 'ui', 'ux', 'design',
		'test', 'testing', 'debug', 'bug', 'fix', 'security', 'auth',
		'deploy', 'performance', 'optimize', 'refactor', 'implement',
		'create', 'build', 'setup', 'config', 'documentation', 'docs'
	];
	
	return technicalKeywords.filter(keyword => text.includes(keyword));
}

/**
 * Construit le prompt optimisé pour la génération d'emoji
 */
function buildEmojiPrompt(taskContext) {
	return `Tu es un expert en productivité et gestion de tâches. Ton rôle est de choisir l'emoji PARFAIT pour représenter visuellement une tâche dans un système de gestion de projet.

TÂCHE À ANALYSER:
- Titre: "${taskContext.title}"
- Description: "${taskContext.description}"
- Détails: "${taskContext.details}"
- Priorité: ${taskContext.priority}
- Statut: ${taskContext.status}
- Mots-clés détectés: ${taskContext.keywords.join(', ')}

INSTRUCTIONS:
1. Analyse le CONTENU et le CONTEXTE de la tâche
2. Choisis UN SEUL emoji qui représente le mieux cette tâche
3. Priorise la CLARTÉ et la RECONNAISSANCE instantanée
4. Pense à l'utilisateur qui doit rapidement identifier le type de tâche

EXEMPLES DE BONNES PRATIQUES:
- 🛠️ pour implémentation/développement
- 🐛 pour correction de bugs
- 🎨 pour design/UI
- 📚 pour documentation
- 🔐 pour sécurité
- ⚡ pour performance
- 🧪 pour tests
- 🚀 pour déploiement
- 📱 pour mobile
- 🌐 pour web/frontend
- ⚙️ pour backend/config

RÉPONDS UNIQUEMENT AVEC L'EMOJI CHOISI, RIEN D'AUTRE.`;
}

/**
 * Extrait l'emoji de la réponse de l'IA
 */
function extractEmojiFromResponse(responseText) {
	if (!responseText) return null;
	
	// Regex pour extraire le premier emoji trouvé
	const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
	const matches = responseText.match(emojiRegex);
	
	if (matches && matches.length > 0) {
		return matches[0];
	}
	
	// Fallback: chercher des emojis communs en texte
	const textEmojis = {
		'🛠️': ['tool', 'build', 'implement', 'develop'],
		'🐛': ['bug', 'fix', 'error', 'debug'],
		'🎨': ['design', 'ui', 'style', 'visual'],
		'📚': ['doc', 'documentation', 'readme'],
		'🔐': ['security', 'auth', 'login'],
		'⚡': ['performance', 'optimize', 'fast'],
		'🧪': ['test', 'testing', 'spec'],
		'🚀': ['deploy', 'launch', 'release']
	};
	
	const lowerResponse = responseText.toLowerCase();
	for (const [emoji, keywords] of Object.entries(textEmojis)) {
		if (keywords.some(keyword => lowerResponse.includes(keyword))) {
			return emoji;
		}
	}
	
	return null;
}

/**
 * Valide l'emoji et retourne un emoji par défaut si invalide
 */
function validateEmoji(emoji) {
	if (!emoji || typeof emoji !== 'string' || emoji.length === 0) {
		return '📋'; // Emoji par défaut
	}
	
	// Vérifier que c'est bien un emoji Unicode
	const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
	
	if (emojiRegex.test(emoji)) {
		return emoji;
	}
	
	return '📋'; // Emoji par défaut si validation échoue
}

/**
 * Retourne un emoji par défaut basé sur des heuristiques simples
 */
function getDefaultEmoji(task) {
	const title = (task.title || '').toLowerCase();
	const description = (task.description || '').toLowerCase();
	const fullText = `${title} ${description}`;
	
	// Heuristiques simples pour fallback
	if (fullText.includes('bug') || fullText.includes('fix') || fullText.includes('error')) {
		return '🐛';
	}
	if (fullText.includes('design') || fullText.includes('ui') || fullText.includes('style')) {
		return '🎨';
	}
	if (fullText.includes('test') || fullText.includes('testing')) {
		return '🧪';
	}
	if (fullText.includes('doc') || fullText.includes('readme')) {
		return '📚';
	}
	if (fullText.includes('security') || fullText.includes('auth')) {
		return '🔐';
	}
	if (fullText.includes('performance') || fullText.includes('optimize')) {
		return '⚡';
	}
	if (fullText.includes('deploy') || fullText.includes('release')) {
		return '🚀';
	}
	if (fullText.includes('api') || fullText.includes('backend')) {
		return '⚙️';
	}
	if (fullText.includes('frontend') || fullText.includes('web')) {
		return '🌐';
	}
	
	// Par défaut
	return '📋';
}

/**
 * Efface le cache (utile pour les tests ou le redémarrage)
 */
export function clearEmojiCache() {
	emojiCache.clear();
	log('debug', '[EMOJI] Cache cleared');
}

/**
 * Retourne les statistiques du cache
 */
export function getEmojiCacheStats() {
	return {
		size: emojiCache.size,
		keys: Array.from(emojiCache.keys())
	};
}