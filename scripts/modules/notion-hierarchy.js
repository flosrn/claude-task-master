/**
 * notion-hierarchy.js
 * Module to manage hierarchical synchronization between TaskMaster and Notion
 */

import { log } from './utils.js';

const LOG_TAG = '[NOTION-HIERARCHY]';
const logger = {
	info: (...args) => log('info', LOG_TAG, ...args),
	warn: (...args) => log('warn', LOG_TAG, ...args),
	error: (...args) => log('error', LOG_TAG, ...args),
	debug: (...args) => log('debug', LOG_TAG, ...args),
	success: (...args) => log('success', LOG_TAG, ...args)
};

/**
 * Builds Notion relation properties (Parent/Sub-items and Dependencies)
 * @param {Object} task - The task with its metadata
 * @param {string} tag - The current tag
 * @param {Object} mapping - The TaskMaster ID -> Notion ID mapping
 * @param {boolean} useDependencyRelations - If true, use relations for dependencies
 * @param {string} dependencyRelationName - Name of the dependency relation property
 * @returns {Object} The Notion relation properties
 */
export function buildHierarchicalRelations(
	task,
	tag,
	mapping,
	useDependencyRelations = false,
	dependencyRelationName = 'Dependencies Tasks'
) {
	const relations = {};

	// Parent-child relation
	if (task._parentId) {
		const parentNotionId = mapping?.[tag]?.[task._parentId];
		if (parentNotionId) {
			relations['Parent item'] = {
				relation: [{ id: parentNotionId }]
			};
		}
	}

	// Dependencies
	if (Array.isArray(task.dependencies) && task.dependencies.length > 0) {
		if (useDependencyRelations) {
			// Use native relations if the property exists
			const dependencyIds = task.dependencies
				.map((depId) => mapping?.[tag]?.[depId])
				.filter((notionId) => notionId);

			if (dependencyIds.length > 0) {
				relations[dependencyRelationName] = {
					relation: dependencyIds.map((id) => ({ id }))
				};
			}
		}
		// Note: rich_text dependencies are handled in buildNotionProperties
	}

	return relations;
}

/**
 * Updates all hierarchical relations after page creation
 * @param {Array} flattenedTasks - Flattened tasks with metadata
 * @param {string} tag - The current tag
 * @param {Object} mapping - The TaskMaster ID -> Notion ID mapping
 * @param {Object} notion - Notion client
 * @param {Object} options - Configuration options
 */
export async function updateHierarchicalRelations(
	flattenedTasks,
	tag,
	mapping,
	notion,
	options = {}
) {
	const {
		debug = false,
		useDependencyRelations = false,
		dependencyRelationName = 'Dependencies Tasks'
	} = options;
	let updatedCount = 0;
	let errors = [];

	logger.info(
		`Updating hierarchical relations for ${flattenedTasks.length} tasks...`
	);

	// Group updates by batch for optimization
	const updateBatches = [];
	const BATCH_SIZE = 10;

	for (let i = 0; i < flattenedTasks.length; i += BATCH_SIZE) {
		const batch = flattenedTasks.slice(i, i + BATCH_SIZE);
		updateBatches.push(batch);
	}

	// Process each batch
	for (const [batchIndex, batch] of updateBatches.entries()) {
		if (debug)
			logger.debug(
				`Traitement du batch ${batchIndex + 1}/${updateBatches.length}`
			);

		const updatePromises = batch.map(async (item) => {
			const { id, task } = item;
			const taskTag = item.tag || tag; // Use task tag if available

			const notionId = mapping?.[taskTag]?.[id];
			if (!notionId) {
				if (debug) logger.warn(`No Notion ID for task [${taskTag}] ${id}`);
				return null;
			}

			const relations = buildHierarchicalRelations(
				task,
				taskTag,
				mapping,
				useDependencyRelations,
				dependencyRelationName
			);
			if (Object.keys(relations).length === 0) {
				return null; // No relations to update
			}

			try {
				// Check if page is archived before updating
				const pageInfo = await notion.pages.retrieve({ page_id: notionId });
				if (pageInfo.archived) {
					if (debug) logger.warn(`Skipping archived page [${taskTag}] ${id}`);
					return { id, success: false, error: 'Page is archived' };
				}

				await notion.pages.update({
					page_id: notionId,
					properties: relations
				});

				if (debug) {
					logger.debug(
						`Relations updated for [${taskTag}] ${id}:`,
						Object.keys(relations).join(', ')
					);
				}
				return { id, success: true };
			} catch (error) {
				errors.push({ id, error: error.message });
				return { id, success: false, error: error.message };
			}
		});

		// Wait for all batch updates to complete
		const results = await Promise.all(updatePromises);
		updatedCount += results.filter((r) => r && r.success).length;

		// Pause between batches to avoid rate limiting
		if (batchIndex < updateBatches.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	// Final report
	if (updatedCount > 0) {
		logger.success(
			`${updatedCount} hierarchical relations updated successfully`
		);
	}

	if (errors.length > 0) {
		logger.warn(`${errors.length} errors during relation updates:`);
		errors.forEach(({ id, error }) => {
			logger.error(`  - Task ${id}: ${error}`);
		});
	}

	return { updatedCount, errors };
}

/**
 * Checks if the Notion database has the necessary relation properties
 * @param {Object} database - Notion database object
 * @returns {Object} Relation properties status
 */
export function checkRelationProperties(database) {
	const properties = database.properties || {};
	const status = {
		hasParentRelation: false,
		hasSubItemRelation: false,
		hasDependencyRelation: false,
		parentRelationName: null,
		subItemRelationName: null,
		dependencyRelationName: null
	};

	for (const [name, prop] of Object.entries(properties)) {
		if (prop.type === 'relation') {
			const nameLower = name.toLowerCase();
			if (nameLower.includes('parent')) {
				status.hasParentRelation = true;
				status.parentRelationName = name;
			} else if (nameLower.includes('sub')) {
				status.hasSubItemRelation = true;
				status.subItemRelationName = name;
			} else if (nameLower.includes('dependenc')) {
				status.hasDependencyRelation = true;
				status.dependencyRelationName = name;
			}
		}
	}

	return status;
}

/**
 * Reconstructs TaskMaster hierarchy from Notion pages
 * Useful for bidirectional synchronization
 * @param {Array} notionPages - Pages retrieved from Notion
 * @param {string} tag - The current tag
 * @param {string} dependencyRelationName - Name of the dependency relation property
 * @returns {Object} Reconstructed hierarchical structure
 */
export function reconstructHierarchyFromNotion(
	notionPages,
	tag,
	dependencyRelationName = 'Dependencies Tasks'
) {
	const hierarchy = {};
	const tasksByNotionId = new Map();
	const tasksByTaskMasterId = new Map();

	// First pass: index all tasks
	for (const page of notionPages) {
		const taskId = page.properties.taskid?.rich_text?.[0]?.plain_text;
		if (!taskId) continue;

		const task = {
			id: taskId,
			notionId: page.id,
			title: page.properties.title?.title?.[0]?.plain_text || '',
			parentRelations: page.properties['Parent item']?.relation || [],
			subItemRelations: page.properties['Sub-item']?.relation || [],
			dependencies: page.properties[dependencyRelationName]?.relation || []
		};

		tasksByNotionId.set(page.id, task);
		tasksByTaskMasterId.set(taskId, task);
	}

	// Second pass: reconstruct hierarchy
	for (const task of tasksByNotionId.values()) {
		// Identify parent TaskMaster ID from Notion relation
		let parentTaskMasterId = null;

		if (task.parentRelations.length > 0) {
			const parentNotionId = task.parentRelations[0].id;
			const parentTask = tasksByNotionId.get(parentNotionId);
			if (parentTask) {
				parentTaskMasterId = parentTask.id;
			}
		}

		// Reconstruct subtasks
		const subtaskIds = [];
		for (const subRelation of task.subItemRelations) {
			const subTask = tasksByNotionId.get(subRelation.id);
			if (subTask) {
				subtaskIds.push(subTask.id);
			}
		}

		hierarchy[task.id] = {
			notionId: task.notionId,
			parentId: parentTaskMasterId,
			subtaskIds,
			title: task.title
		};
	}

	return hierarchy;
}

/**
 * Validates the integrity of the synchronized hierarchy
 * @param {Object} taskMasterData - TaskMaster data
 * @param {Object} notionHierarchy - Hierarchy reconstructed from Notion
 * @returns {Object} Validation report
 */
export function validateHierarchyIntegrity(taskMasterData, notionHierarchy) {
	const issues = [];
	const stats = {
		totalTasks: 0,
		validTasks: 0,
		orphanedSubtasks: 0,
		missingRelations: 0,
		circularDependencies: 0
	};

	// Check each TaskMaster task
	const allTasks = new Map();

	// Collect all tasks and subtasks
	for (const task of taskMasterData.tasks || []) {
		stats.totalTasks++;
		allTasks.set(String(task.id), { ...task, isRoot: true });

		if (Array.isArray(task.subtasks)) {
			for (const subtask of task.subtasks) {
				const subtaskId = `${task.id}.${subtask.id}`;
				stats.totalTasks++;
				allTasks.set(subtaskId, {
					...subtask,
					id: subtaskId,
					parentId: task.id,
					isRoot: false
				});
			}
		}
	}

	// Validate each task
	for (const [taskId, task] of allTasks) {
		const notionInfo = notionHierarchy[taskId];

		if (!notionInfo) {
			issues.push({
				type: 'missing_in_notion',
				taskId,
				title: task.title
			});
			continue;
		}

		// Check parent-child consistency
		if (!task.isRoot && task.parentId) {
			if (notionInfo.parentId !== String(task.parentId)) {
				issues.push({
					type: 'parent_mismatch',
					taskId,
					expectedParent: task.parentId,
					actualParent: notionInfo.parentId
				});
				stats.missingRelations++;
			}
		}

		// Check orphans
		if (notionInfo.parentId && !allTasks.has(notionInfo.parentId)) {
			issues.push({
				type: 'orphaned_subtask',
				taskId,
				parentId: notionInfo.parentId
			});
			stats.orphanedSubtasks++;
		}

		stats.validTasks++;
	}

	return {
		isValid: issues.length === 0,
		stats,
		issues
	};
}

export default {
	buildHierarchicalRelations,
	updateHierarchicalRelations,
	checkRelationProperties,
	reconstructHierarchyFromNotion,
	validateHierarchyIntegrity
};
