#!/usr/bin/env node

/**
 * Script de debug pour analyser la synchronisation Notion vs TaskMaster
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { initNotion, fetchAllNotionPages } from './scripts/modules/notion.js';
import { initTaskMaster } from './src/task-master.js';

async function debugNotionSync() {
	console.log(
		'🔍 DEBUG: Analyse complète de la synchronisation Notion vs TaskMaster\n'
	);

	try {
		// 1. Récupérer TOUTES les tâches TaskMaster
		console.log('📋 ÉTAPE 1: Analyse des tâches TaskMaster');
		console.log('=' + '='.repeat(50));

		// Accès direct au fichier tasks.json
		const tasksFile = join(
			'/Users/flo/Code/nextjs/gapila',
			'.taskmaster',
			'tasks',
			'tasks.json'
		);

		console.log(`📂 Lecture du fichier: ${tasksFile}`);
		const tasksData = JSON.parse(readFileSync(tasksFile, 'utf8'));
		const allTaskMasterTasks = tasksData.master?.tasks || [];

		console.log(`📊 Total des tâches TaskMaster: ${allTaskMasterTasks.length}`);
		console.log('📝 Liste des tâches TaskMaster:');

		allTaskMasterTasks.forEach((task) => {
			console.log(`  - ${task.id}: ${task.title} (${task.status})`);
			if (task.subtasks && task.subtasks.length > 0) {
				task.subtasks.forEach((subtask) => {
					console.log(
						`    └─ ${subtask.id}: ${subtask.title} (${subtask.status})`
					);
				});
			}
		});

		// 2. Récupérer TOUTES les pages Notion
		console.log('\n📄 ÉTAPE 2: Analyse de la database Notion');
		console.log('=' + '='.repeat(50));

		await initNotion();
		const notionPages = await fetchAllNotionPages();

		console.log(`📊 Total des pages Notion: ${notionPages.length}`);
		console.log('📝 Liste des pages Notion:');

		notionPages.forEach((page, index) => {
			const taskId =
				page.properties?.['Task Id']?.rich_text?.[0]?.text?.content?.trim();
			const title =
				page.properties?.title?.title?.[0]?.text?.content ||
				page.properties?.Title?.title?.[0]?.text?.content ||
				page.properties?.Titre?.title?.[0]?.text?.content ||
				'Sans titre';
			const status =
				page.properties?.status?.select?.name ||
				page.properties?.Status?.select?.name ||
				page.properties?.Statut?.select?.name ||
				'Pas de statut';

			console.log(
				`  ${index + 1}. Task ID: "${taskId || 'VIDE'}" | Titre: "${title}" | Statut: "${status}"`
			);
		});

		// 3. Analyse des différences
		console.log('\n🔄 ÉTAPE 3: Comparaison détaillée');
		console.log('=' + '='.repeat(50));

		// Créer une map des tâches TaskMaster (avec sous-tâches)
		const taskMasterMap = new Map();
		allTaskMasterTasks.forEach((task) => {
			taskMasterMap.set(String(task.id), task);
			if (task.subtasks) {
				task.subtasks.forEach((subtask) => {
					taskMasterMap.set(String(subtask.id), subtask);
				});
			}
		});

		// Créer une map des pages Notion avec Task Id
		const notionTaskMap = new Map();
		const notionPagesWithoutTaskId = [];

		notionPages.forEach((page) => {
			const taskId =
				page.properties?.['Task Id']?.rich_text?.[0]?.text?.content?.trim();
			if (taskId) {
				notionTaskMap.set(taskId, page);
			} else {
				notionPagesWithoutTaskId.push(page);
			}
		});

		console.log(`📊 TaskMaster: ${taskMasterMap.size} tâches au total`);
		console.log(`📊 Notion avec Task Id: ${notionTaskMap.size} pages`);
		console.log(
			`📊 Notion sans Task Id: ${notionPagesWithoutTaskId.length} pages`
		);

		// 4. DEBUG: Vérifier les tâches spécifiques 6,7,8,9
		console.log('\n🔍 DEBUG: Vérification spécifique des tâches 6,7,8,9');
		console.log('=' + '='.repeat(50));

		const criticalTasks = ['6', '7', '8', '9'];
		criticalTasks.forEach((taskId) => {
			const inTaskMaster = taskMasterMap.has(taskId);
			const inNotion = notionTaskMap.has(taskId);
			console.log(
				`  Tâche ${taskId}: TaskMaster=${inTaskMaster}, Notion=${inNotion}`
			);
			if (inTaskMaster) {
				const task = taskMasterMap.get(taskId);
				console.log(`    → TaskMaster: "${task.title}"`);
			}
			if (inNotion) {
				const page = notionTaskMap.get(taskId);
				const title =
					page.properties?.title?.title?.[0]?.text?.content ||
					page.properties?.Title?.title?.[0]?.text?.content ||
					page.properties?.Titre?.title?.[0]?.text?.content ||
					'Sans titre';
				console.log(`    → Notion: "${title}"`);
			}
		});

		// 4. Identifier les tâches manquantes dans Notion
		console.log('\n❌ ÉTAPE 4: Tâches TaskMaster manquantes dans Notion');
		console.log('=' + '='.repeat(50));

		const missingInNotion = [];
		for (const [taskId, task] of taskMasterMap) {
			if (!notionTaskMap.has(taskId)) {
				missingInNotion.push({ id: taskId, task });
				console.log(`  ❌ Manque: ${taskId} - "${task.title}"`);
			}
		}

		if (missingInNotion.length === 0) {
			console.log('  ✅ Aucune tâche TaskMaster manquante dans Notion');
		}

		// 5. Identifier les tâches Notion en trop
		console.log('\n➕ ÉTAPE 5: Tâches Notion en trop');
		console.log('=' + '='.repeat(50));

		const extraInNotion = [];
		for (const [taskId, page] of notionTaskMap) {
			if (!taskMasterMap.has(taskId)) {
				extraInNotion.push({ id: taskId, page });
				const title =
					page.properties?.title?.title?.[0]?.text?.content ||
					page.properties?.Title?.title?.[0]?.text?.content ||
					page.properties?.Titre?.title?.[0]?.text?.content ||
					'Sans titre';
				console.log(`  ➕ En trop: ${taskId} - "${title}"`);
			}
		}

		if (extraInNotion.length === 0) {
			console.log('  ✅ Aucune tâche Notion en trop');
		}

		// 6. Pages Notion sans Task Id
		console.log('\n⚠️  ÉTAPE 6: Pages Notion sans Task Id');
		console.log('=' + '='.repeat(50));

		if (notionPagesWithoutTaskId.length > 0) {
			notionPagesWithoutTaskId.forEach((page, index) => {
				const title =
					page.properties?.title?.title?.[0]?.text?.content ||
					page.properties?.Title?.title?.[0]?.text?.content ||
					page.properties?.Titre?.title?.[0]?.text?.content ||
					'Sans titre';
				console.log(`  ⚠️  Page ${index + 1}: "${title}"`);
			});
		} else {
			console.log('  ✅ Toutes les pages Notion ont un Task Id');
		}

		// 7. Résumé final
		console.log('\n📊 RÉSUMÉ FINAL');
		console.log('=' + '='.repeat(50));
		console.log(`TaskMaster: ${taskMasterMap.size} tâches`);
		console.log(`Notion (avec Task Id): ${notionTaskMap.size} pages`);
		console.log(
			`Notion (sans Task Id): ${notionPagesWithoutTaskId.length} pages`
		);
		console.log(`Manquantes dans Notion: ${missingInNotion.length}`);
		console.log(`En trop dans Notion: ${extraInNotion.length}`);

		if (
			missingInNotion.length > 0 ||
			extraInNotion.length > 0 ||
			notionPagesWithoutTaskId.length > 0
		) {
			console.log('\n❌ SYNCHRONISATION INCORRECTE !');
		} else {
			console.log('\n✅ SYNCHRONISATION PARFAITE !');
		}
	} catch (error) {
		console.error("❌ Erreur lors de l'analyse:", error);
	}
}

debugNotionSync();
