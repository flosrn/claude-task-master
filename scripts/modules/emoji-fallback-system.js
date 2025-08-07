/**
 * emoji-fallback-system.js
 * Système de fallback intelligent pour génération d'emoji avec multiple IA
 */

import { generateTextService } from './ai-services-unified.js';
import { log } from './utils.js';

/**
 * Configuration des modèles fallback par ordre de priorité
 * Basé sur recherche juillet 2025: GPT-4o Mini = meilleur rapport qualité/prix
 */
const EMOJI_FALLBACK_CHAIN = [
	{
		provider: 'gemini',
		model: 'gemini-1.5-flash',
		role: 'emoji',
		maxRetries: 2,
		timeout: 5000,
		cost: 0.35, // Prix par 1M tokens
		speed: 'ultra-fast', // 0.2s TTFT
		description: 'Primary - Gemini Flash (actuel)'
	},
	{
		provider: 'openai',
		model: 'gpt-4o-mini',
		role: 'main', // Utilisation du role 'main' supporté par TaskMaster
		maxRetries: 2,
		timeout: 8000,
		cost: 0.15, // Le moins cher !
		speed: 'fast', // 80 tok/sec
		description: 'Fallback 1 - GPT-4o Mini (optimal prix/qualité)'
	},
	{
		provider: 'anthropic',
		model: 'claude-3-haiku',
		role: 'fallback', // Utilisation du role 'fallback' supporté par TaskMaster
		maxRetries: 1,
		timeout: 10000,
		cost: 0.25,
		speed: 'fastest', // 165 tok/sec
		description: 'Fallback 2 - Claude Haiku (vitesse max)'
	}
];

/**
 * Mapping des erreurs communes et stratégies de fallback
 */
const ERROR_STRATEGIES = {
	rate_limit: { skipCurrent: true, waitTime: 1000 },
	api_key_invalid: { skipProvider: true },
	model_not_found: { skipProvider: true },
	timeout: { retry: true, increaseTimeout: true },
	quota_exceeded: { skipProvider: true },
	gemini_safety_filter: {
		skipCurrent: true,
		modifyPrompt: true,
		fallbackImmediately: true
	}
};

/**
 * Cache intelligent avec TTL et metrics
 */
class EmojiCache {
	constructor() {
		this.cache = new Map();
		this.metrics = {
			hits: 0,
			misses: 0,
			errors: 0,
			providers: new Map()
		};
	}

	get(key) {
		const entry = this.cache.get(key);
		if (entry && Date.now() - entry.timestamp < 86400000) {
			// 24h TTL
			this.metrics.hits++;
			return entry.emoji;
		}
		this.metrics.misses++;
		return null;
	}

	set(key, emoji, provider) {
		this.cache.set(key, {
			emoji,
			provider,
			timestamp: Date.now()
		});

		// Metrics par provider
		const providerStats = this.metrics.providers.get(provider) || {
			success: 0,
			total: 0
		};
		providerStats.success++;
		providerStats.total++;
		this.metrics.providers.set(provider, providerStats);
	}

	getMetrics() {
		const total = this.metrics.hits + this.metrics.misses;
		return {
			...this.metrics,
			hitRate:
				total > 0 ? ((this.metrics.hits / total) * 100).toFixed(1) + '%' : '0%',
			providerReliability: Array.from(this.metrics.providers.entries()).map(
				([provider, stats]) => ({
					provider,
					successRate: ((stats.success / stats.total) * 100).toFixed(1) + '%',
					totalCalls: stats.total
				})
			)
		};
	}
}

const emojiCache = new EmojiCache();

/**
 * Générateur d'emoji avec fallback intelligent
 */
export async function generateTaskEmojiWithFallback(
	task,
	projectRoot = process.cwd(),
	session = null,
	options = {}
) {
	const cacheKey = generateCacheKey(task);

	// Check cache
	const cachedEmoji = emojiCache.get(cacheKey);
	if (cachedEmoji && !options.skipCache) {
		log('debug', `[EMOJI-FALLBACK] Cache hit: ${cachedEmoji}`);
		return cachedEmoji;
	}

	const taskContext = buildTaskContext(task);
	let lastError = null;

	// Essayer chaque provider dans l'ordre de priorité
	for (let i = 0; i < EMOJI_FALLBACK_CHAIN.length; i++) {
		const config = EMOJI_FALLBACK_CHAIN[i];

		try {
			log('debug', `[EMOJI-FALLBACK] Trying ${config.description}...`);

			const emoji = await attemptEmojiGeneration(
				taskContext,
				config,
				projectRoot,
				session,
				lastError
			);

			if (emoji && isValidEmoji(emoji)) {
				log(
					'success',
					`[EMOJI-FALLBACK] ✅ ${config.description} succeeded: ${emoji}`
				);
				emojiCache.set(cacheKey, emoji, config.provider);

				// Si ce n'est pas le provider principal, logger pour monitoring
				if (i > 0) {
					log(
						'warning',
						`[EMOJI-FALLBACK] Primary failed, used fallback ${i}: ${config.provider}`
					);
				}

				return emoji;
			}
		} catch (error) {
			lastError = error;
			log(
				'warning',
				`[EMOJI-FALLBACK] ❌ ${config.description} failed: ${error.message}`
			);

			// Analyser l'erreur et décider si on continue
			const strategy = analyzeError(error);
			if (strategy.skipProvider) {
				continue;
			}

			// Attendre avant le prochain essai si nécessaire
			if (strategy.waitTime) {
				await new Promise((resolve) => setTimeout(resolve, strategy.waitTime));
			}
		}
	}

	// Tous les providers ont échoué - utiliser emoji par défaut intelligent
	log(
		'error',
		`[EMOJI-FALLBACK] All providers failed, using intelligent default`
	);
	const defaultEmoji = getIntelligentDefaultEmoji(task);

	return defaultEmoji;
}

/**
 * Tente la génération avec un provider spécifique
 */
async function attemptEmojiGeneration(
	taskContext,
	config,
	projectRoot,
	session,
	previousError
) {
	const prompt = buildOptimizedPrompt(
		taskContext,
		config.provider,
		previousError
	);

	const requestConfig = {
		prompt,
		role: config.role,
		session: session,
		projectRoot: projectRoot,
		commandName: 'emoji-generation-fallback',
		timeout: config.timeout,
		provider: config.provider,
		model: config.model
	};

	// Optimisations spécifiques par provider
	if (config.provider === 'gemini') {
		requestConfig.temperature = 0.3; // Plus conservateur pour éviter safety filter
		requestConfig.safetySettings = 'minimal';
	} else if (config.provider === 'openai') {
		requestConfig.temperature = 0.1; // GPT-4o Mini très stable à basse température
		requestConfig.max_tokens = 10; // On veut juste un emoji
	} else if (config.provider === 'anthropic') {
		requestConfig.temperature = 0.2;
		requestConfig.max_tokens = 5;
	}

	const response = await generateTextService(requestConfig);
	return extractEmojiFromResponse(response);
}

/**
 * Analyse une erreur et retourne la stratégie de fallback
 */
function analyzeError(error) {
	const errorMessage = error.message.toLowerCase();

	for (const [errorType, strategy] of Object.entries(ERROR_STRATEGIES)) {
		if (
			errorMessage.includes(errorType.replace('_', ' ')) ||
			errorMessage.includes(errorType)
		) {
			return strategy;
		}
	}

	// Stratégie par défaut
	return { retry: true };
}

/**
 * Construit un prompt optimisé par provider
 */
function buildOptimizedPrompt(taskContext, provider, previousError) {
	let basePrompt = `Generate ONE emoji that best represents this task: "${taskContext.title}"`;

	if (taskContext.description) {
		basePrompt += `\nDescription: ${taskContext.description}`;
	}

	// Optimisations par provider
	switch (provider) {
		case 'gemini':
			return basePrompt + '\n\nRespond with only the emoji character, no text.';

		case 'openai':
			return basePrompt + '\n\nOutput format: single emoji only.';

		case 'anthropic':
			return basePrompt + '\n\nReturn only one emoji character.';

		default:
			return basePrompt + '\n\nReturn only the emoji.';
	}
}

/**
 * Valide qu'une réponse contient un emoji valide
 */
function isValidEmoji(text) {
	if (!text || typeof text !== 'string') return false;

	// Regex pour détecter les emojis Unicode
	const emojiRegex =
		/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;

	const cleaned = text.trim().replace(/["`'"]/g, '');
	return emojiRegex.test(cleaned) && cleaned.length <= 4;
}

/**
 * Extrait l'emoji de la réponse IA
 */
function extractEmojiFromResponse(response) {
	if (!response) return null;

	// Extraire le texte de la réponse selon la structure de generateTextService
	let text;
	if (typeof response === 'string') {
		text = response;
	} else if (response.mainResult) {
		text = response.mainResult;
	} else if (response.text) {
		text = response.text;
	} else if (response.message) {
		text = response.message;
	} else {
		// Fallback: convertir en string
		text = String(response);
	}

	if (!text || typeof text !== 'string') return null;

	// Nettoyer la réponse
	const cleaned = text
		.trim()
		.replace(/["`'"]/g, '')
		.replace(/emoji:?\s*/gi, '')
		.split(/\s+/)[0]; // Prendre le premier élément

	return isValidEmoji(cleaned) ? cleaned : null;
}

/**
 * Génère un emoji par défaut intelligent basé sur le contenu de la tâche
 */
function getIntelligentDefaultEmoji(task) {
	const title = (task.title || '').toLowerCase();
	const description = (task.description || '').toLowerCase();
	const content = `${title} ${description}`;

	// Mapping intelligent par mots-clés
	const emojiMap = {
		// Développement
		'api|endpoint|service': '🔌',
		'auth|login|signin': '🔐',
		'database|db|schema': '🗄️',
		'test|testing': '🧪',
		'bug|fix|error': '🐛',
		'deploy|deployment': '🚀',
		'config|configuration': '⚙️',
		'ui|interface|frontend': '🎨',
		'backend|server': '⚚',

		// Business
		'marketing|promotion': '📢',
		'analytics|metrics': '📊',
		'user|customer': '👥',
		'payment|billing': '💰',
		'security|safety': '🛡️',

		// Général
		'documentation|doc': '📝',
		'setup|init|install': '🛠️',
		'improvement|enhance': '✨',
		'research|analysis': '🔍'
	};

	for (const [keywords, emoji] of Object.entries(emojiMap)) {
		const regex = new RegExp(keywords, 'i');
		if (regex.test(content)) {
			return emoji;
		}
	}

	// Emoji par défaut basé sur le status/priority
	if (task.status === 'done') return '✅';
	if (task.status === 'in-progress') return '🔄';
	if (task.priority === 'high') return '🔥';

	return '📋'; // Fallback ultime
}

/**
 * Utilitaires
 */
function generateCacheKey(task) {
	return `emoji_${Buffer.from(task.title + (task.description || ''))
		.toString('base64')
		.slice(0, 16)}`;
}

function buildTaskContext(task) {
	return {
		title: task.title,
		description: task.description || '',
		status: task.status || 'pending',
		priority: task.priority || 'medium'
	};
}

/**
 * Fonction pour monitoring et métriques
 */
export function getEmojiSystemMetrics() {
	return {
		cache: emojiCache.getMetrics(),
		fallbackChain: EMOJI_FALLBACK_CHAIN.map((config) => ({
			provider: config.provider,
			model: config.model,
			cost: config.cost,
			speed: config.speed
		}))
	};
}

/**
 * Test du système de fallback
 */
export async function testEmojiSystemReliability() {
	const testTasks = [
		{ title: 'Implement user authentication', description: 'JWT auth system' },
		{
			title: 'Fix database migration bug',
			description: 'Schema update failing'
		},
		{
			title: 'Create marketing dashboard',
			description: 'Analytics for campaigns'
		}
	];

	const results = [];

	for (const task of testTasks) {
		const startTime = Date.now();
		try {
			const emoji = await generateTaskEmojiWithFallback(task);
			results.push({
				task: task.title,
				emoji,
				success: true,
				duration: Date.now() - startTime
			});
		} catch (error) {
			results.push({
				task: task.title,
				success: false,
				error: error.message,
				duration: Date.now() - startTime
			});
		}
	}

	return {
		results,
		metrics: getEmojiSystemMetrics()
	};
}
