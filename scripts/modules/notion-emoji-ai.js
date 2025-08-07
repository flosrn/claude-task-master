/**
 * notion-emoji-ai.js
 * IA-powered emoji generation for Notion tasks
 */

import { generateTextService } from './ai-services-unified.js';
import { generateTaskEmojiWithFallback } from './emoji-fallback-system.js';
import { log } from './utils.js';

/**
 * Cache to avoid re-requesting AI for the same tasks
 */
const emojiCache = new Map();

/**
 * Generates an appropriate emoji for a task using AI
 * @param {Object} task - The task (with title, description, etc.)
 * @param {string} projectRoot - Project root directory (optional, for TaskMaster)
 * @param {string} session - Session ID (optional, for TaskMaster)
 * @returns {Promise<string>} The emoji chosen by AI or default emoji
 */
export async function generateTaskEmoji(
	task,
	projectRoot = process.cwd(),
	session = null,
	options = {}
) {
	// Utiliser le nouveau système de fallback intelligent
	if (options.useAdvancedFallback !== false) {
		log('debug', `[EMOJI] Using advanced fallback system for: ${task.title}`);
		return await generateTaskEmojiWithFallback(
			task,
			projectRoot,
			session,
			options
		);
	}

	// Garde l'ancien système pour compatibilité backwards
	try {
		// Create a cache key based on task content
		const cacheKey = generateCacheKey(task);

		// Check cache first
		if (emojiCache.has(cacheKey)) {
			log('debug', `[EMOJI] Cache hit for task: ${task.title}`);
			return emojiCache.get(cacheKey);
		}

		// Prepare task context for AI
		const taskContext = buildTaskContext(task);

		// Optimized prompt for AI
		const prompt = buildEmojiPrompt(taskContext);

		log('debug', `[EMOJI] Requesting AI emoji for: ${task.title}`);

		// AI call with timeout and fallback - uses fast emoji model
		const response = await generateTextService({
			prompt,
			role: 'emoji', // Use fast emoji model (falls back to main if not configured)
			session: session,
			projectRoot: projectRoot,
			commandName: 'emoji-generation',
			outputType: session ? 'mcp' : 'cli' // MCP if session provided, otherwise CLI
		});

		// Extract emoji from response (response.mainResult for unified system)
		const responseText = response.mainResult || response.text || response;
		const emoji = extractEmojiFromResponse(responseText);

		// Validate emoji
		const validEmoji = validateEmoji(emoji);

		// Cache to avoid future calls
		emojiCache.set(cacheKey, validEmoji);

		log('debug', `[EMOJI] Generated ${validEmoji} for task: ${task.title}`);
		return validEmoji;
	} catch (error) {
		log(
			'warn',
			`[EMOJI] Legacy system failed for task ${task.title}: ${error.message}, trying fallback...`
		);
		// Fallback vers le nouveau système si l'ancien échoue
		return await generateTaskEmojiWithFallback(
			task,
			projectRoot,
			session,
			options
		);
	}
}

/**
 * Generates a cache key based on significant task content
 */
function generateCacheKey(task) {
	const content = [
		task.title || '',
		task.description || '',
		task.priority || '',
		task.status || ''
	]
		.join('|')
		.toLowerCase()
		.trim();

	// Simple hash to avoid overly long keys
	return btoa(content).slice(0, 32);
}

/**
 * Builds task context for AI
 */
function buildTaskContext(task) {
	const context = {
		title: task.title || 'Untitled',
		description: task.description || '',
		details: task.details || '',
		priority: task.priority || 'medium',
		status: task.status || 'pending'
	};

	// Add significant keywords
	const keywords = extractKeywords(context);
	context.keywords = keywords;

	return context;
}

/**
 * Extracts significant keywords from task context
 */
function extractKeywords(context) {
	const text = [context.title, context.description, context.details]
		.join(' ')
		.toLowerCase();

	// Common technical keywords
	const technicalKeywords = [
		'api',
		'database',
		'frontend',
		'backend',
		'ui',
		'ux',
		'design',
		'test',
		'testing',
		'debug',
		'bug',
		'fix',
		'security',
		'auth',
		'deploy',
		'performance',
		'optimize',
		'refactor',
		'implement',
		'create',
		'build',
		'setup',
		'config',
		'documentation',
		'docs'
	];

	return technicalKeywords.filter((keyword) => text.includes(keyword));
}

/**
 * Builds optimized prompt for emoji generation
 */
function buildEmojiPrompt(taskContext) {
	return `You are an expert in productivity and task management. Your role is to choose the PERFECT emoji to visually represent a task in a project management system.

TASK TO ANALYZE:
- Title: "${taskContext.title}"
- Description: "${taskContext.description}"
- Details: "${taskContext.details}"
- Priority: ${taskContext.priority}
- Status: ${taskContext.status}
- Detected keywords: ${taskContext.keywords.join(', ')}

INSTRUCTIONS:
1. Analyze the CONTENT and CONTEXT of the task
2. Choose ONE emoji that best represents this task
3. Prioritize CLARITY and instant RECOGNITION
4. Think about the user who needs to quickly identify the task type

GOOD PRACTICE EXAMPLES:
- 🛠️ for implementation/development
- 🐛 for bug fixes
- 🎨 for design/UI
- 📚 for documentation
- 🔐 for security
- ⚡ for performance
- 🧪 for tests
- 🚀 for deployment
- 📱 for mobile
- 🌐 for web/frontend
- ⚙️ for backend/config

RESPOND ONLY WITH THE CHOSEN EMOJI, NOTHING ELSE.`;
}

/**
 * Extracts emoji from AI response
 */
function extractEmojiFromResponse(responseText) {
	if (!responseText) return null;

	// Regex to extract first emoji found
	const emojiRegex =
		/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
	const matches = responseText.match(emojiRegex);

	if (matches && matches.length > 0) {
		return matches[0];
	}

	// Fallback: search for common emojis in text
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
		if (keywords.some((keyword) => lowerResponse.includes(keyword))) {
			return emoji;
		}
	}

	return null;
}

/**
 * Validates emoji and returns default emoji if invalid
 */
function validateEmoji(emoji) {
	if (!emoji || typeof emoji !== 'string' || emoji.length === 0) {
		return '📋'; // Default emoji
	}

	// Check if it's a valid Unicode emoji
	const emojiRegex =
		/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;

	if (emojiRegex.test(emoji)) {
		return emoji;
	}

	return '📋'; // Default emoji if validation fails
}

/**
 * Returns a default emoji based on simple heuristics
 */
function getDefaultEmoji(task) {
	const title = (task.title || '').toLowerCase();
	const description = (task.description || '').toLowerCase();
	const fullText = `${title} ${description}`;

	// Simple heuristics for fallback
	if (
		fullText.includes('bug') ||
		fullText.includes('fix') ||
		fullText.includes('error')
	) {
		return '🐛';
	}
	if (
		fullText.includes('design') ||
		fullText.includes('ui') ||
		fullText.includes('style') ||
		fullText.includes('icon')
	) {
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
	if (fullText.includes('config') || fullText.includes('configuration')) {
		return '⚙️';
	}
	if (
		fullText.includes('monitor') ||
		fullText.includes('monitoring') ||
		fullText.includes('analytics')
	) {
		return '📊';
	}
	if (
		fullText.includes('package') ||
		fullText.includes('implement') ||
		fullText.includes('create')
	) {
		return '📦';
	}

	// Default
	return '📋';
}

/**
 * Clears cache (useful for tests or restart)
 */
export function clearEmojiCache() {
	emojiCache.clear();
	log('debug', '[EMOJI] Cache cleared');
}

/**
 * Returns cache statistics
 */
export function getEmojiCacheStats() {
	return {
		size: emojiCache.size,
		keys: Array.from(emojiCache.keys())
	};
}
