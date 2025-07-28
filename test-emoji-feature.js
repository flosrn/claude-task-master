#!/usr/bin/env node

/**
 * Test script pour la feature emoji automatique
 * Usage: node test-emoji-feature.js
 */

import { generateTaskEmoji } from './scripts/modules/notion-emoji-ai.js';
import { log } from './scripts/modules/utils.js';

// Tâches de test avec différents contextes
const testTasks = [
	{
		id: '1.1',
		title: 'Implémenter une hiérarchie de configuration à 2 niveaux maximum',
		description: 'Créer un système de configuration flexible',
		priority: 'high'
	},
	{
		id: '1.2',
		title:
			'Mettre en place un système de rapport de bug in-app avec Session Replay',
		description: 'Intégrer un outil de reporting de bugs',
		priority: 'medium'
	},
	{
		id: '1.3',
		title: 'Créer le package PostHog pour le monitoring MakerKit',
		description: 'Package pour analytics et monitoring',
		priority: 'high'
	},
	{
		id: '2.1',
		title: 'Refactorisation et Centralisation de la Journalisation Applicative',
		description: 'Améliorer le système de logs',
		priority: 'medium'
	},
	{
		id: '2.2',
		title:
			'Audit et Correction de la Journalisation des Server Actions du package games',
		description: 'Fix des logs pour les actions serveur',
		priority: 'high'
	},
	{
		id: '3.1',
		title: 'Monitoring System Implementation with Highlight.io',
		description: 'Setup monitoring and observability',
		priority: 'medium'
	},
	{
		id: '4.1',
		title:
			"Refactorisation de la page de détail d'un jeu avec Server Components",
		description: 'Migration vers Next.js Server Components',
		priority: 'low'
	},
	{
		id: '5.1',
		title:
			'Implement Enhanced Logging System with Colorization for Games Feature Package',
		description: 'Add colored logs for better debugging',
		priority: 'medium'
	}
];

async function testEmojiGeneration() {
	log('info', "🧪 Test de génération d'emojis par IA...");
	log('info', '='.repeat(60));

	for (const task of testTasks) {
		try {
			log('info', `\n📋 Tâche: ${task.title}`);
			log('info', `📝 Description: ${task.description}`);
			log('info', `⚡ Priorité: ${task.priority}`);

			const startTime = Date.now();
			const emoji = await generateTaskEmoji(task);
			const duration = Date.now() - startTime;

			log('success', `${emoji} Emoji généré en ${duration}ms`);
		} catch (error) {
			log('error', `❌ Erreur pour la tâche ${task.id}: ${error.message}`);
		}
	}

	log('info', '\n' + '='.repeat(60));
	log('success', '✅ Test terminé !');
}

// Test du cache
async function testCachePerformance() {
	log('info', '\n🧪 Test de performance du cache...');

	const task = testTasks[0];

	// Premier appel (sans cache)
	log('info', '📞 Premier appel (génération IA)...');
	const start1 = Date.now();
	await generateTaskEmoji(task);
	const duration1 = Date.now() - start1;
	log('info', `⏱️  Durée sans cache: ${duration1}ms`);

	// Deuxième appel (avec cache)
	log('info', '📞 Deuxième appel (cache)...');
	const start2 = Date.now();
	await generateTaskEmoji(task);
	const duration2 = Date.now() - start2;
	log('info', `⏱️  Durée avec cache: ${duration2}ms`);

	const speedup = Math.round(duration1 / duration2);
	log('success', `🚀 Accélération: ${speedup}x plus rapide avec le cache`);
}

// Exécuter les tests
async function runTests() {
	try {
		await testEmojiGeneration();
		await testCachePerformance();
	} catch (error) {
		log('error', `❌ Erreur globale: ${error.message}`);
		process.exit(1);
	}
}

runTests();
