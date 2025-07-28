/**
 * notion-reset-command.js
 * Reset command implementation using the new base architecture
 */

import BaseNotionCommand from './notion-base-command.js';
import {
	ArchivePagesOperation,
	ClearMappingOperation,
	CompositeOperation
} from './notion-operations.js';
import {
	syncTasksWithNotion,
	detectHierarchyCapabilities,
	loadNotionSyncMapping
} from './notion.js';
import { readJSON } from './utils.js';
import path from 'path';
import { Client } from '@notionhq/client';

/**
 * Reset Notion Database Command
 * Archives all existing pages and recreates them from TaskMaster tasks
 */
export class ResetNotionCommand extends BaseNotionCommand {
	constructor() {
		super('RESET');
	}

	getCommandDescription() {
		return 'complete Notion DB reset';
	}

	async validatePrerequisites(context) {
		await super.validatePrerequisites(context);

		// Initialize Notion client
		this.notion = await this.initializeNotionClient();
		if (!this.notion) {
			throw new Error('Notion sync is disabled or not configured');
		}
	}

	async initializeNotionClient() {
		const { initNotion, getIsNotionEnabled, getNotionClient } = await import(
			'./notion.js'
		);
		await initNotion();

		if (!getIsNotionEnabled()) {
			return null;
		}

		return getNotionClient();
	}

	async runCommand(context, transactionManager) {
		this.log(
			'warn',
			'This will archive ALL existing pages in Notion DB and recreate them from TaskMaster tasks.'
		);

		// Phase 1: Fetch all existing pages
		const existingPages = await this.fetchExistingPages();
		this.log(
			'info',
			`Found ${existingPages.length} existing Notion DB tasks to remove`
		);

		// Phase 2: Archive all existing pages (transactional)
		let archiveResults = { succeeded: 0, failed: 0, errors: [] };
		if (existingPages.length > 0) {
			const archiveOperation = new ArchivePagesOperation(existingPages, {
				notion: this.notion,
				logger: this.createOperationLogger()
			});

			archiveResults =
				await transactionManager.executeOperation(archiveOperation);
		}

		// Phase 3: Clear sync mapping (transactional)
		const clearMappingOperation = new ClearMappingOperation(
			context.mappingFile,
			{
				logger: this.createOperationLogger()
			}
		);

		await transactionManager.executeOperation(clearMappingOperation);
		this.log('info', 'Sync mapping file cleared');

		// Phase 4: Load TaskMaster tasks and validate
		const currentData = await this.loadTaskMasterData(context);
		if (!currentData || !currentData._rawTaggedData) {
			throw new Error('No TaskMaster tasks found');
		}

		// Phase 5: Recreate all TaskMaster tasks (transactional)
		this.log('info', 'Recreating all TaskMaster tasks in Notion DB...');

		const syncOperation = new SyncTasksOperation(
			currentData._rawTaggedData,
			context,
			{
				notion: this.notion,
				logger: this.createOperationLogger()
			}
		);

		const syncResults =
			await transactionManager.executeOperation(syncOperation);

		// Phase 6: Update hierarchical relations
		await this.updateHierarchicalRelations(context, currentData);

		// Final success message
		const message = `Successfully reset Notion DB - removed ${archiveResults.succeeded}/${existingPages.length} existing tasks and recreated all TaskMaster tasks`;
		this.log('success', message);

		return {
			archivedPages: archiveResults.succeeded,
			failedArchives: archiveResults.failed,
			archiveErrors: archiveResults.errors,
			message
		};
	}

	async fetchExistingPages() {
		const { fetchAllNotionPages } = await import('./notion.js');
		return await fetchAllNotionPages();
	}

	async loadTaskMasterData(context) {
		return readJSON(context.tasksFile, context.projectRoot);
	}

	async updateHierarchicalRelations(context, currentData) {
		this.log(
			'info',
			'Updating hierarchical relations for all recreated tasks...'
		);

		// Check if hierarchical sync is available
		const hierarchyCapabilities = await detectHierarchyCapabilities();
		const useHierarchicalSync = hierarchyCapabilities?.canCreateWithHierarchy;

		if (!useHierarchicalSync) {
			this.log(
				'info',
				'Hierarchical sync not available, skipping relation updates'
			);
			return;
		}

		// Get current tag and mapping
		const { mapping } = loadNotionSyncMapping(context.mappingFile);

		if (currentData._rawTaggedData[context.currentTag]?.tasks) {
			// Flatten tasks for hierarchical update
			const flattenedTasks = this.flattenTasksForHierarchy(
				currentData._rawTaggedData[context.currentTag].tasks,
				context.currentTag
			);

			// Update hierarchical relations
			const { updateHierarchicalRelations } = await import(
				'./notion-hierarchy.js'
			);
			await updateHierarchicalRelations(
				flattenedTasks,
				context.currentTag,
				mapping,
				this.notion,
				{
					debug: false,
					useDependencyRelations: hierarchyCapabilities.hasDependencyRelations
				}
			);

			this.log(
				'success',
				`Updated hierarchical relations for ${flattenedTasks.length} tasks`
			);
		}
	}

	flattenTasksForHierarchy(tasks, tag) {
		const flattenedTasks = [];

		for (const task of tasks) {
			// Parent task
			flattenedTasks.push({
				id: String(task.id),
				task: { ...task, _isSubtask: false },
				tag: tag
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
						tag: tag
					});
				}
			}
		}

		return flattenedTasks;
	}

	createOperationLogger() {
		return {
			info: (...args) => this.log('info', ...args),
			warn: (...args) => this.log('warn', ...args),
			error: (...args) => this.log('error', ...args),
			success: (...args) => this.log('success', ...args)
		};
	}
}

/**
 * Custom operation for syncing TaskMaster tasks with Notion
 */
class SyncTasksOperation {
	constructor(rawTaggedData, context, dependencies) {
		this.name = 'Sync TaskMaster Tasks';
		this.rawTaggedData = rawTaggedData;
		this.context = context;
		this.notion = dependencies.notion;
		this.logger = dependencies.logger;
		this.createdPages = [];
	}

	async execute() {
		// Use empty previous state to create all tasks as new
		const emptyPrevious = {};

		await syncTasksWithNotion(
			emptyPrevious,
			this.rawTaggedData,
			this.context.projectRoot
		);

		this.logger.success('All TaskMaster tasks recreated in Notion DB');

		return {
			syncCompleted: true,
			taskCount: this.countTotalTasks(this.rawTaggedData)
		};
	}

	async rollback(result) {
		// The rollback for sync operations is complex as it would require
		// identifying and removing only the newly created pages.
		// For now, we rely on the broader transaction rollback.
		this.logger.warn(
			'Sync operation rollback relies on transaction-level rollback'
		);
	}

	countTotalTasks(rawTaggedData) {
		let count = 0;
		for (const tag in rawTaggedData) {
			if (rawTaggedData[tag]?.tasks) {
				for (const task of rawTaggedData[tag].tasks) {
					count++; // Main task
					if (Array.isArray(task.subtasks)) {
						count += task.subtasks.length; // Subtasks
					}
				}
			}
		}
		return count;
	}
}

export default ResetNotionCommand;
