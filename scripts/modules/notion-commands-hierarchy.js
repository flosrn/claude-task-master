/**
 * notion-commands-hierarchy.js
 * Commandes CLI pour la gestion de la hiérarchie Notion
 */

import { log } from './utils.js';
import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { currentTaskMaster } from '../../src/task-master.js';
import {
	checkRelationProperties,
	reconstructHierarchyFromNotion,
	validateHierarchyIntegrity,
	updateHierarchicalRelations
} from './notion-hierarchy.js';

const LOG_TAG = '[NOTION-HIERARCHY-CMD]';
const logger = {
	info: (...args) => log('info', LOG_TAG, ...args),
	warn: (...args) => log('warn', LOG_TAG, ...args),
	error: (...args) => log('error', LOG_TAG, ...args),
	success: (...args) => log('success', LOG_TAG, ...args)
};

/**
 * Valide la configuration de la base de données Notion pour la hiérarchie
 */
export async function validateNotionHierarchySetup(projectRoot) {
	logger.info('Validating Notion hierarchical configuration...\n');

	// Charger la configuration
	const envPath = path.join(projectRoot, '.env');
	if (!fs.existsSync(envPath)) {
		logger.error('.env file not found');
		return;
	}

	const envVars = dotenv.parse(fs.readFileSync(envPath));
	const NOTION_TOKEN = envVars.NOTION_TOKEN;
	const NOTION_DATABASE_ID = envVars.NOTION_DATABASE_ID;

	if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
		logger.error('Missing Notion configuration in .env');
		return;
	}

	const notion = new Client({ auth: NOTION_TOKEN });

	try {
		// Retrieve database
		const database = await notion.databases.retrieve({
			database_id: NOTION_DATABASE_ID
		});

		const relationStatus = checkRelationProperties(database);

		console.log('📊 Relation properties status:\n');
		console.log(
			`  ✅ Parent item: ${relationStatus.hasParentRelation ? 'Configured' : '❌ Missing'}`
		);
		if (relationStatus.parentRelationName) {
			console.log(`     → Name: "${relationStatus.parentRelationName}"`);
		}

		console.log(
			`  ✅ Sub-item: ${relationStatus.hasSubItemRelation ? 'Configured' : '❌ Missing'}`
		);
		if (relationStatus.subItemRelationName) {
			console.log(`     → Name: "${relationStatus.subItemRelationName}"`);
		}

		console.log(
			`  ${relationStatus.hasDependencyRelation ? '✅' : '⚠️ '} Dependencies Tasks: ${relationStatus.hasDependencyRelation ? 'Configured' : 'Not configured (optional)'}`
		);
		if (relationStatus.dependencyRelationName) {
			console.log(`     → Name: "${relationStatus.dependencyRelationName}"`);
		}

		// Recommendations
		if (
			!relationStatus.hasParentRelation ||
			!relationStatus.hasSubItemRelation
		) {
			console.log('\n⚠️  Incomplete configuration!');
			console.log('\nTo enable full hierarchical synchronization:');
			console.log('1. Open your database in Notion');
			console.log('2. Add the missing relation properties');
			console.log('3. Type: Relation (self-referencing)');
		} else if (!relationStatus.hasDependencyRelation) {
			console.log('\n💡 Tip: To manage dependencies with native relations:');
			console.log('1. Add a "Dependencies Tasks" property');
			console.log('2. Type: Relation (self-referencing, multi-select)');
		} else {
			console.log(
				'\n✅ Complete configuration! Hierarchical synchronization is ready.'
			);
		}
	} catch (error) {
		logger.error('Error during validation:', error.message);
	}
}

/**
 * Validates the integrity of the synchronized hierarchy
 */
export async function validateNotionHierarchyIntegrity(projectRoot) {
	logger.info('Validating hierarchy integrity...\n');

	const taskMaster = currentTaskMaster || {};
	const tasksPath = taskMaster.getTasksPath
		? taskMaster.getTasksPath()
		: path.join(projectRoot, '.taskmaster/tasks.json');

	if (!fs.existsSync(tasksPath)) {
		logger.error('Fichier tasks.json introuvable');
		return;
	}

	// Charger les données TaskMaster
	const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
	const currentTag = taskMaster.getCurrentTag
		? taskMaster.getCurrentTag()
		: 'master';
	const taskMasterData = tasksData[currentTag];

	if (!taskMasterData || !taskMasterData.tasks) {
		logger.error(`Aucune tâche trouvée pour le tag "${currentTag}"`);
		return;
	}

	// Charger la configuration Notion
	const envPath = path.join(projectRoot, '.env');
	const envVars = dotenv.parse(fs.readFileSync(envPath));
	const NOTION_TOKEN = envVars.NOTION_TOKEN;
	const NOTION_DATABASE_ID = envVars.NOTION_DATABASE_ID;

	const notion = new Client({ auth: NOTION_TOKEN });

	try {
		// Récupérer toutes les pages de la base de données
		logger.info('Retrieving Notion pages...');

		const pages = [];
		let hasMore = true;
		let startCursor = undefined;

		while (hasMore) {
			const response = await notion.databases.query({
				database_id: NOTION_DATABASE_ID,
				filter: {
					property: 'tag',
					rich_text: { contains: currentTag }
				},
				start_cursor: startCursor
			});

			pages.push(...response.results);
			hasMore = response.has_more;
			startCursor = response.next_cursor;
		}

		logger.info(`${pages.length} Notion pages found for tag "${currentTag}"`);

		// Reconstruire la hiérarchie depuis Notion
		const notionHierarchy = reconstructHierarchyFromNotion(pages, currentTag);

		// Valider l'intégrité
		const validation = validateHierarchyIntegrity(
			taskMasterData,
			notionHierarchy
		);

		console.log('\n📊 Validation report:\n');
		console.log(`  Total TaskMaster tasks: ${validation.stats.totalTasks}`);
		console.log(`  Valid tasks: ${validation.stats.validTasks}`);
		console.log(`  Orphaned subtasks: ${validation.stats.orphanedSubtasks}`);
		console.log(`  Missing relations: ${validation.stats.missingRelations}`);

		if (validation.isValid) {
			console.log('\n✅ Hierarchy synchronized correctly!');
		} else {
			console.log(`\n⚠️  ${validation.issues.length} problèmes détectés:\n`);

			// Grouper les problèmes par type
			const issuesByType = {};
			validation.issues.forEach((issue) => {
				if (!issuesByType[issue.type]) {
					issuesByType[issue.type] = [];
				}
				issuesByType[issue.type].push(issue);
			});

			// Afficher les problèmes groupés
			for (const [type, issues] of Object.entries(issuesByType)) {
				console.log(`  ${type.replace(/_/g, ' ').toUpperCase()}:`);
				issues.slice(0, 5).forEach((issue) => {
					if (type === 'missing_in_notion') {
						console.log(`    - Tâche ${issue.taskId}: "${issue.title}"`);
					} else if (type === 'parent_mismatch') {
						console.log(
							`    - Tâche ${issue.taskId}: parent attendu ${issue.expectedParent}, trouvé ${issue.actualParent}`
						);
					} else if (type === 'orphaned_subtask') {
						console.log(
							`    - Tâche ${issue.taskId}: parent ${issue.parentId} introuvable`
						);
					}
				});
				if (issues.length > 5) {
					console.log(`    ... et ${issues.length - 5} autres`);
				}
			}

			console.log('\n💡 Pour corriger ces problèmes, utilisez:');
			console.log('  task-master repair-notion-hierarchy');
		}
	} catch (error) {
		logger.error('Error during validation:', error.message);
	}
}

/**
 * Repairs the hierarchy in Notion
 */
export async function repairNotionHierarchy(projectRoot, options = {}) {
	const { dryRun = false } = options;

	logger.info(
		`Repairing Notion hierarchy ${dryRun ? '(DRY RUN MODE)' : ''}...\n`
	);

	// Load configuration and data
	const envPath = path.join(projectRoot, '.env');
	const envVars = dotenv.parse(fs.readFileSync(envPath));
	const NOTION_TOKEN = envVars.NOTION_TOKEN;
	const NOTION_DATABASE_ID = envVars.NOTION_DATABASE_ID;

	const notion = new Client({ auth: NOTION_TOKEN });

	// Load mapping
	const mappingPath = path.join(projectRoot, '.taskmaster/notion-sync.json');
	let mapping = {};
	if (fs.existsSync(mappingPath)) {
		const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
		mapping = mappingData.mapping || {};
	}

	// Load tasks
	const taskMaster = currentTaskMaster || {};
	const tasksPath = taskMaster.getTasksPath
		? taskMaster.getTasksPath()
		: path.join(projectRoot, '.taskmaster/tasks.json');
	const tasksData = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
	const currentTag = taskMaster.getCurrentTag
		? taskMaster.getCurrentTag()
		: 'master';
	const taskMasterData = tasksData[currentTag];

	if (!taskMasterData || !taskMasterData.tasks) {
		logger.error(`Aucune tâche trouvée pour le tag "${currentTag}"`);
		return;
	}

	// Prepare flattened tasks
	const flattenedTasks = [];
	for (const task of taskMasterData.tasks) {
		// Parent task
		flattenedTasks.push({
			id: String(task.id),
			task: { ...task, _isSubtask: false },
			tag: currentTag
		});

		// Subtasks
		if (Array.isArray(task.subtasks)) {
			for (const subtask of task.subtasks) {
				const subtaskId = `${task.id}.${subtask.id}`;
				flattenedTasks.push({
					id: subtaskId,
					task: {
						...subtask,
						id: subtaskId,
						_parentId: String(task.id),
						_isSubtask: true
					},
					tag: currentTag
				});
			}
		}
	}

	logger.info(`${flattenedTasks.length} tasks to process`);

	if (dryRun) {
		console.log('\n🔍 Dry run mode - No changes will be made');
		console.log('\nRelations that would be updated:');

		let count = 0;
		for (const { id, task } of flattenedTasks) {
			if (task._parentId) {
				console.log(`  - ${id} → parent: ${task._parentId}`);
				count++;
			}
		}
		console.log(`\nTotal: ${count} parent-child relations`);
		return;
	}

	// Check relation properties
	try {
		const database = await notion.databases.retrieve({
			database_id: NOTION_DATABASE_ID
		});
		const relationStatus = checkRelationProperties(database);

		if (
			!relationStatus.hasParentRelation ||
			!relationStatus.hasSubItemRelation
		) {
			logger.error('Parent/Sub-item relation properties are not configured');
			logger.info(
				'Use "task-master validate-notion-hierarchy-setup" for more information'
			);
			return;
		}

		// Update relations
		const result = await updateHierarchicalRelations(
			flattenedTasks,
			currentTag,
			mapping,
			notion,
			{
				debug: true,
				useDependencyRelations: relationStatus.hasDependencyRelation
			}
		);

		if (result.updatedCount > 0) {
			logger.success(
				`✅ ${result.updatedCount} relations updated successfully`
			);
		}

		if (result.errors.length > 0) {
			logger.warn(`⚠️  ${result.errors.length} errors encountered`);
		}
	} catch (error) {
		logger.error('Error during repair:', error.message);
	}
}

// Export commands
export default {
	validateNotionHierarchySetup,
	validateNotionHierarchyIntegrity,
	repairNotionHierarchy
};
