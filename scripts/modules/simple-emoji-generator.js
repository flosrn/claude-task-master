/**
 * simple-emoji-generator.js
 * Solution unifiée simple pour la génération d'emojis IA + validation Notion
 */

import { generateTextService } from './ai-services-unified.js';
import { log } from './utils.js';

/**
 * Modèles par ordre de priorité
 */
const AI_MODELS = [
    { provider: 'gemini', model: 'gemini-1.5-flash', role: 'emoji' },
    { provider: 'openai', model: 'gpt-4o-mini', role: 'main' },
    { provider: 'anthropic', model: 'claude-3-haiku', role: 'fallback' }
];

/**
 * Normalise un emoji pour Notion (retire variations Unicode + rejette drapeaux)
 */
function normalizeEmojiForNotion(emoji) {
    if (!emoji || typeof emoji !== 'string') return '📋';
    
    // Retire toutes les variations Unicode
    const cleaned = emoji
        .replace(/\uFE0F/g, '') // variation selector-16
        .replace(/\uFE0E/g, '') // variation selector-15  
        .replace(/\u200D/g, '') // zero-width joiner
        .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '') // skin tones
        .replace(/[\u{20E0}-\u{20EF}]/gu, '') // combining marks
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '') // variation selectors
        .trim();

    // REJETER LES DRAPEAUX (problème 🇫🇷)
    if (/[\u{1F1E0}-\u{1F1FF}]/u.test(cleaned)) {
        log('debug', `[EMOJI] Flag emoji "${emoji}" rejected, using fallback`);
        return '📋';
    }

    // Extrait le premier emoji valide (sans drapeaux)
    const match = cleaned.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]/u);
    
    if (match) {
        log('debug', `[EMOJI] Normalized "${emoji}" → "${match[0]}"`);
        return match[0];
    }

    // Fallback pour symboles simples courants (pas de drapeaux ici)
    const simpleSymbols = {
        '⚡': '⚡', '⭐': '⭐', '⚙': '⚙', '⛏': '⛏', '⌨': '⌨',
        '🛠': '🛠', '🛡': '🛡', '🗝': '🗝', '🗂': '🗂', '🗃': '🗃'
    };
    
    if (simpleSymbols[cleaned]) {
        log('debug', `[EMOJI] Symbol mapping "${emoji}" → "${simpleSymbols[cleaned]}"`);
        return simpleSymbols[cleaned];
    }

    // Dernier fallback
    log('debug', `[EMOJI] Fallback: "${emoji}" → "📋"`);
    return '📋';
}

/**
 * Génère un emoji pour une tâche avec IA + fallbacks
 * @param {Object} task - Tâche TaskMaster
 * @returns {Promise<string>} Emoji normalisé pour Notion
 */
export async function generateSimpleTaskEmoji(task) {
    if (!task || !task.title) return '📋';
    
    // Prompt simple et efficace
    const prompt = `Task: "${task.title}"${task.description ? `\nDescription: "${task.description}"` : ''}

Generate ONE single emoji that best represents this task. Respond with ONLY the emoji character, nothing else.`;

    // Essaye chaque modèle dans l'ordre
    for (const model of AI_MODELS) {
        try {
            log('debug', `[EMOJI] Trying ${model.provider}/${model.model} for: ${task.title}`);
            
            const result = await generateTextService({
                provider: model.provider,
                modelId: model.model,
                role: model.role,
                prompt,
                maxTokens: 10,
                temperature: 0.3
            });

            if (result) {
                let resultText = '';
                if (typeof result === 'string') {
                    resultText = result;
                } else if (result && typeof result === 'object') {
                    // CORRECT: TaskMaster AI service returns { mainResult, telemetryData, tagInfo }
                    resultText = result.mainResult || 
                                result.text || 
                                result.content || 
                                result.message || 
                                result.response ||
                                (result.choices?.[0]?.message?.content) ||
                                (result.candidates?.[0]?.content?.parts?.[0]?.text) ||
                                String(result);
                }
                
                if (resultText && typeof resultText === 'string' && resultText.trim()) {
                    const normalizedEmoji = normalizeEmojiForNotion(resultText.trim());
                    log('info', `[EMOJI] ${model.provider} generated: "${resultText.trim()}" → "${normalizedEmoji}" for task ${task.id || 'unknown'}`);
                    return normalizedEmoji;
                }
            }
        } catch (error) {
            log('warn', `[EMOJI] ${model.provider} failed: ${error.message}`);
            continue; // Essaye le modèle suivant
        }
    }
    
    // Tous les modèles ont échoué
    log('warn', `[EMOJI] All AI models failed, using fallback for task: ${task.title}`);
    return '📋';
}