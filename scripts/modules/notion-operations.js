/**
 * notion-operations.js
 * Transactional operations for Notion with rollback capabilities
 */

import fs from 'fs';
import { log } from './utils.js';
import { buildNotionPageContent } from './notion.js';

/**
 * Base class for all transactional operations
 */
export class BaseOperation {
	constructor(name, dependencies = {}) {
		this.name = name;
		this.notion = dependencies.notion;
		this.logger = dependencies.logger || this.createDefaultLogger();
	}

	createDefaultLogger() {
		return {
			info: (...args) => log('info', '[OPERATION]', ...args),
			warn: (...args) => log('warn', '[OPERATION]', ...args),
			error: (...args) => log('error', '[OPERATION]', ...args),
			success: (...args) => log('success', '[OPERATION]', ...args)
		};
	}

	async execute() {
		throw new Error('execute() must be implemented by subclass');
	}

	async rollback(result) {
		// Default: no rollback needed
		this.logger.info(`No rollback needed for ${this.name}`);
	}
}

/**
 * Operation to archive Notion pages with rollback (restore)
 */
export class ArchivePagesOperation extends BaseOperation {
	constructor(pages, dependencies) {
		super('Archive Pages', dependencies);
		this.pages = pages;
		this.archivedPages = [];
	}

	async execute() {
		this.logger.info(`Archiving ${this.pages.length} pages...`);

		const results = {
			succeeded: 0,
			failed: 0,
			errors: [],
			archivedPages: []
		};

		// Process pages in batches to avoid rate limits
		const BATCH_SIZE = 10;
		for (let i = 0; i < this.pages.length; i += BATCH_SIZE) {
			const batch = this.pages.slice(i, i + BATCH_SIZE);
			const batchPromises = batch.map((page) => this.archivePage(page));

			const batchResults = await Promise.allSettled(batchPromises);

			for (const [index, result] of batchResults.entries()) {
				if (result.status === 'fulfilled') {
					results.succeeded++;
					this.archivedPages.push({
						pageId: batch[index].id,
						title:
							batch[index].properties?.Name?.title?.[0]?.text?.content ||
							'Untitled',
						originalData: batch[index] // Store for potential rollback
					});
				} else {
					results.failed++;
					results.errors.push({
						pageId: batch[index].id,
						error: result.reason.message
					});
				}
			}
		}

		this.logger.success(
			`Archived ${results.succeeded}/${this.pages.length} pages`
		);

		if (results.failed > 0) {
			this.logger.warn(`${results.failed} pages failed to archive`);
		}

		return results;
	}

	async archivePage(page) {
		try {
			await this.notion.pages.update({
				page_id: page.id,
				archived: true
			});
			return { success: true, pageId: page.id };
		} catch (error) {
			throw new Error(`Failed to archive page ${page.id}: ${error.message}`);
		}
	}

	async rollback(result) {
		if (this.archivedPages.length === 0) {
			this.logger.info('No pages to restore');
			return;
		}

		this.logger.warn(
			`Restoring ${this.archivedPages.length} archived pages...`
		);

		const restorePromises = this.archivedPages.map(async (archivedPage) => {
			try {
				await this.notion.pages.update({
					page_id: archivedPage.pageId,
					archived: false
				});
				return { success: true, pageId: archivedPage.pageId };
			} catch (error) {
				this.logger.error(
					`Failed to restore page ${archivedPage.pageId}: ${error.message}`
				);
				return {
					success: false,
					pageId: archivedPage.pageId,
					error: error.message
				};
			}
		});

		const restoreResults = await Promise.allSettled(restorePromises);
		const restored = restoreResults.filter(
			(r) => r.status === 'fulfilled' && r.value.success
		).length;

		this.logger.success(
			`Restored ${restored}/${this.archivedPages.length} pages`
		);
	}
}

/**
 * Operation to create Notion pages with rollback (archive created pages)
 */
export class CreatePagesOperation extends BaseOperation {
	constructor(tasksToCreate, dependencies) {
		super('Create Pages', dependencies);
		this.tasksToCreate = tasksToCreate;
		this.createdPages = [];
		this.databaseId = dependencies.databaseId;
	}

	async execute() {
		this.logger.info(`Creating ${this.tasksToCreate.length} new pages...`);

		const results = {
			succeeded: 0,
			failed: 0,
			errors: [],
			createdPages: []
		};

		// Process in batches
		const BATCH_SIZE = 5; // Smaller batch for creates
		for (let i = 0; i < this.tasksToCreate.length; i += BATCH_SIZE) {
			const batch = this.tasksToCreate.slice(i, i + BATCH_SIZE);

			for (const taskInfo of batch) {
				try {
					const createdPage = await this.createPage(taskInfo);
					results.succeeded++;
					results.createdPages.push(createdPage);
					this.createdPages.push(createdPage);
				} catch (error) {
					results.failed++;
					results.errors.push({
						taskId: taskInfo.id,
						error: error.message
					});
				}
			}

			// Small delay between batches to respect rate limits
			if (i + BATCH_SIZE < this.tasksToCreate.length) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		this.logger.success(
			`Created ${results.succeeded}/${this.tasksToCreate.length} pages`
		);

		if (results.failed > 0) {
			this.logger.warn(`${results.failed} pages failed to create`);
		}

		return results;
	}

	async createPage(taskInfo) {
		const { task, properties } = taskInfo;

		// Generate formatted content for the page
		const pageContent = buildNotionPageContent(task);

		const pageData = {
			parent: { database_id: this.databaseId },
			properties: properties,
			children: pageContent
		};

		const createdPage = await this.notion.pages.create(pageData);

		return {
			pageId: createdPage.id,
			taskId: task.id,
			title: task.title
		};
	}

	async rollback(result) {
		if (this.createdPages.length === 0) {
			this.logger.info('No created pages to remove');
			return;
		}

		this.logger.warn(`Removing ${this.createdPages.length} created pages...`);

		const archiveOperation = new ArchivePagesOperation(
			this.createdPages.map((cp) => ({ id: cp.pageId })),
			{ notion: this.notion, logger: this.logger }
		);

		await archiveOperation.execute();
	}
}

/**
 * Operation to update the mapping file with rollback
 */
export class UpdateMappingOperation extends BaseOperation {
	constructor(mappingFile, newMapping, newMeta, dependencies) {
		super('Update Mapping', dependencies);
		this.mappingFile = mappingFile;
		this.newMapping = newMapping;
		this.newMeta = newMeta;
		this.originalContent = null;
	}

	async execute() {
		// Backup original content
		try {
			if (fs.existsSync(this.mappingFile)) {
				this.originalContent = fs.readFileSync(this.mappingFile, 'utf8');
			}
		} catch (error) {
			this.logger.warn(
				`Could not backup original mapping file: ${error.message}`
			);
		}

		// Write new content
		const content = JSON.stringify(
			{
				mapping: this.newMapping,
				meta: this.newMeta
			},
			null,
			2
		);

		fs.writeFileSync(this.mappingFile, content, 'utf8');

		this.logger.success('Mapping file updated successfully');

		return {
			mappingFile: this.mappingFile,
			mappingCount: Object.keys(this.newMapping).length
		};
	}

	async rollback(result) {
		if (this.originalContent !== null) {
			try {
				fs.writeFileSync(this.mappingFile, this.originalContent, 'utf8');
				this.logger.success('Mapping file restored to original state');
			} catch (error) {
				this.logger.error(`Failed to restore mapping file: ${error.message}`);
			}
		} else {
			// If there was no original file, remove the created one
			try {
				if (fs.existsSync(this.mappingFile)) {
					fs.unlinkSync(this.mappingFile);
					this.logger.success('Created mapping file removed');
				}
			} catch (error) {
				this.logger.error(`Failed to remove mapping file: ${error.message}`);
			}
		}
	}
}

/**
 * Operation to clear the mapping file with rollback
 */
export class ClearMappingOperation extends BaseOperation {
	constructor(mappingFile, dependencies) {
		super('Clear Mapping', dependencies);
		this.mappingFile = mappingFile;
		this.originalContent = null;
	}

	async execute() {
		// Backup original content
		try {
			if (fs.existsSync(this.mappingFile)) {
				this.originalContent = fs.readFileSync(this.mappingFile, 'utf8');
			}
		} catch (error) {
			this.logger.warn(
				`Could not backup original mapping file: ${error.message}`
			);
		}

		// Clear mapping
		const emptyContent = JSON.stringify({ mapping: {}, meta: {} }, null, 2);
		fs.writeFileSync(this.mappingFile, emptyContent, 'utf8');

		this.logger.success('Mapping file cleared');

		return {
			mappingFile: this.mappingFile,
			cleared: true
		};
	}

	async rollback(result) {
		if (this.originalContent !== null) {
			try {
				fs.writeFileSync(this.mappingFile, this.originalContent, 'utf8');
				this.logger.success('Mapping file restored from backup');
			} catch (error) {
				this.logger.error(`Failed to restore mapping file: ${error.message}`);
			}
		} else {
			this.logger.info('No original mapping file to restore');
		}
	}
}

/**
 * Composite operation that executes multiple operations as a unit
 */
export class CompositeOperation extends BaseOperation {
	constructor(name, operations, dependencies) {
		super(name, dependencies);
		this.operations = operations;
		this.executedOperations = [];
	}

	async execute() {
		const results = [];

		for (const operation of this.operations) {
			try {
				const result = await operation.execute();
				results.push({ operation: operation.name, result, success: true });
				this.executedOperations.push({ operation, result });
			} catch (error) {
				// Rollback all previously executed operations
				await this.rollbackExecuted();
				throw error;
			}
		}

		return results;
	}

	async rollback(result) {
		await this.rollbackExecuted();
	}

	async rollbackExecuted() {
		// Rollback in reverse order
		for (let i = this.executedOperations.length - 1; i >= 0; i--) {
			const { operation, result } = this.executedOperations[i];
			try {
				await operation.rollback(result);
			} catch (rollbackError) {
				this.logger.error(
					`Rollback failed for ${operation.name}: ${rollbackError.message}`
				);
			}
		}
		this.executedOperations = [];
	}
}
