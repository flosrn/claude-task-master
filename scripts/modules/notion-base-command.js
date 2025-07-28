/**
 * notion-base-command.js
 * Base class for all Notion commands to eliminate code duplication
 * and standardize error handling and context management.
 */

import path from 'path';
import { log } from './utils.js';
import { initTaskMaster } from '../../src/task-master.js';
import { setHierarchicalSyncMode } from './notion.js';

/**
 * Context object that encapsulates all command execution context
 */
export class NotionCommandContext {
	constructor({
		projectRoot,
		taskMaster,
		preserveFlattenTasks = false,
		dryRun = false,
		preserveExtraTasks = false,
		verbose = false
	}) {
		this.projectRoot = projectRoot;
		this.taskMaster = taskMaster;
		this.preserveFlattenTasks = preserveFlattenTasks;
		this.dryRun = dryRun;
		this.preserveExtraTasks = preserveExtraTasks;
		this.verbose = verbose;

		// Derived paths
		this.mappingFile = path.resolve(
			projectRoot,
			'.taskmaster/notion-sync.json'
		);
		this.tasksFile = taskMaster
			? taskMaster.getTasksPath()
			: path.join(projectRoot, '.taskmaster/tasks.json');
		this.currentTag = taskMaster ? taskMaster.getCurrentTag() : 'master';

		// Configuration
		this.hierarchicalMode = !preserveFlattenTasks;
	}

	/**
	 * Get mode description for logging
	 */
	getModeDescription() {
		return this.preserveFlattenTasks ? 'legacy flat mode' : 'hierarchical mode';
	}

	/**
	 * Get command options summary for logging
	 */
	getOptionsDescription() {
		const options = [];
		if (this.dryRun) options.push('dry-run');
		if (this.preserveExtraTasks) options.push('preserve-extra-tasks');
		if (this.verbose) options.push('verbose');
		return options.length > 0 ? ` (${options.join(', ')})` : '';
	}
}

/**
 * Standardized error handler with actionable messages and consistent behavior
 */
export class NotionErrorHandler {
	/**
	 * Handle and format errors consistently across all commands
	 */
	static handleError(error, commandName, context) {
		const errorInfo = this.analyzeError(error);

		log('error', commandName.toUpperCase(), `${errorInfo.message}`);

		if (errorInfo.suggestion) {
			log('info', commandName.toUpperCase(), `💡 ${errorInfo.suggestion}`);
		}

		if (context?.verbose && errorInfo.details) {
			log('debug', commandName.toUpperCase(), `Details: ${errorInfo.details}`);
		}

		return {
			success: false,
			error: errorInfo.message,
			suggestion: errorInfo.suggestion,
			code: errorInfo.code
		};
	}

	/**
	 * Analyze error and provide actionable information
	 */
	static analyzeError(error) {
		// Notion API errors
		if (error.status === 401) {
			return {
				code: 'NOTION_AUTH_ERROR',
				message: 'Notion authentication failed',
				suggestion: 'Check NOTION_TOKEN in .env file',
				details: error.message
			};
		}

		if (error.status === 404) {
			return {
				code: 'NOTION_DB_NOT_FOUND',
				message: 'Notion database not found',
				suggestion: 'Check NOTION_DATABASE_ID in .env file',
				details: error.message
			};
		}

		if (error.status === 429) {
			return {
				code: 'NOTION_RATE_LIMIT',
				message: 'Notion API rate limit exceeded',
				suggestion: 'Wait a moment and try again, or reduce batch size',
				details: error.message
			};
		}

		// Network errors
		if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
			return {
				code: 'NETWORK_ERROR',
				message: 'Network connection failed',
				suggestion: 'Check your internet connection',
				details: error.message
			};
		}

		// File system errors
		if (error.code === 'ENOENT') {
			return {
				code: 'FILE_NOT_FOUND',
				message: 'Required file not found',
				suggestion: "Make sure you're in a TaskMaster project directory",
				details: error.message
			};
		}

		// Generic errors
		return {
			code: 'UNKNOWN_ERROR',
			message: error.message || 'An unexpected error occurred',
			suggestion: 'Run with --verbose for more details',
			details: error.stack
		};
	}

	/**
	 * Create a standardized success result
	 */
	static createSuccessResult(data = {}) {
		return {
			success: true,
			...data
		};
	}
}

/**
 * Transaction manager for rollback capabilities
 */
export class TransactionManager {
	constructor(commandName) {
		this.commandName = commandName;
		this.operations = [];
		this.rollbackInProgress = false;
	}

	/**
	 * Execute an operation and track it for potential rollback
	 */
	async executeOperation(operation) {
		if (this.rollbackInProgress) {
			throw new Error('Cannot execute operations during rollback');
		}

		try {
			const result = await operation.execute();

			// Store operation for potential rollback
			this.operations.push({
				operation,
				result,
				timestamp: Date.now()
			});

			return result;
		} catch (error) {
			// Automatically trigger rollback on failure
			await this.rollback();
			throw error;
		}
	}

	/**
	 * Rollback all operations in reverse order
	 */
	async rollback() {
		if (this.rollbackInProgress) {
			return; // Prevent infinite rollback loops
		}

		this.rollbackInProgress = true;
		log(
			'warn',
			this.commandName.toUpperCase(),
			'🔄 Rolling back operations...'
		);

		const rollbackErrors = [];

		// Rollback in reverse order
		for (let i = this.operations.length - 1; i >= 0; i--) {
			const { operation, result } = this.operations[i];

			try {
				if (operation.rollback) {
					await operation.rollback(result);
					log(
						'info',
						this.commandName.toUpperCase(),
						`✅ Rolled back: ${operation.name || 'operation'}`
					);
				}
			} catch (rollbackError) {
				rollbackErrors.push({
					operation: operation.name,
					error: rollbackError.message
				});
				log(
					'error',
					this.commandName.toUpperCase(),
					`❌ Rollback failed: ${operation.name} - ${rollbackError.message}`
				);
			}
		}

		this.operations = [];
		this.rollbackInProgress = false;

		if (rollbackErrors.length > 0) {
			log(
				'warn',
				this.commandName.toUpperCase(),
				`⚠️  ${rollbackErrors.length} rollback operations failed`
			);
		} else {
			log(
				'success',
				this.commandName.toUpperCase(),
				'✅ All operations rolled back successfully'
			);
		}

		return rollbackErrors;
	}

	/**
	 * Commit all operations (clear rollback history)
	 */
	commit() {
		this.operations = [];
		log(
			'info',
			this.commandName.toUpperCase(),
			'✅ Transaction committed successfully'
		);
	}

	/**
	 * Get transaction status
	 */
	getStatus() {
		return {
			operationCount: this.operations.length,
			rollbackInProgress: this.rollbackInProgress,
			canRollback: this.operations.length > 0 && !this.rollbackInProgress
		};
	}
}

/**
 * Base abstract class for all Notion commands
 * Eliminates code duplication and standardizes error handling
 */
export default class BaseNotionCommand {
	constructor(commandName) {
		this.commandName = commandName;
	}

	/**
	 * Main execution method that handles common setup and error handling
	 */
	async execute(options = {}) {
		const transactionManager = new TransactionManager(this.commandName);

		try {
			// Phase 1: Initialize context with common logic
			const context = await this.initializeContext(options);

			// Phase 2: Validate prerequisites
			await this.validatePrerequisites(context);

			// Phase 3: Execute command-specific logic
			const result = await this.runCommand(context, transactionManager);

			// Phase 4: Commit transaction on success
			transactionManager.commit();

			return NotionErrorHandler.createSuccessResult(result);
		} catch (error) {
			// Automatic rollback on any error
			await transactionManager.rollback();

			// Standardized error handling
			return NotionErrorHandler.handleError(error, this.commandName, options);
		}
	}

	/**
	 * Initialize command context with common setup logic
	 */
	async initializeContext(options) {
		const { projectRoot: providedRoot, preserveFlattenTasks = false } = options;

		// Configure hierarchy behavior globally
		if (preserveFlattenTasks) {
			setHierarchicalSyncMode(false);
		}

		// Initialize TaskMaster
		const taskMaster = await initTaskMaster(providedRoot);
		const projectRoot = taskMaster.getProjectRoot();

		if (!projectRoot) {
			throw new Error(
				'Project root not found. Please run this command from a TaskMaster project directory.'
			);
		}

		// Create standardized context
		const context = new NotionCommandContext({
			projectRoot,
			taskMaster,
			...options
		});

		// Log command start with unified format
		const modeText = ` (${context.getModeDescription()})`;
		const optionsText = context.getOptionsDescription();

		log(
			'info',
			this.commandName.toUpperCase(),
			`Starting ${this.getCommandDescription()}${modeText}${optionsText}...`
		);

		return context;
	}

	/**
	 * Validate prerequisites before running command
	 */
	async validatePrerequisites(context) {
		// Default validation - can be overridden by subclasses
		if (!context.projectRoot) {
			throw new Error('Invalid project root');
		}

		if (!context.taskMaster) {
			throw new Error('TaskMaster not properly initialized');
		}
	}

	/**
	 * Abstract method that must be implemented by subclasses
	 */
	async runCommand(context, transactionManager) {
		throw new Error('runCommand must be implemented by subclass');
	}

	/**
	 * Get human-readable command description
	 */
	getCommandDescription() {
		return `${this.commandName} operation`;
	}

	/**
	 * Utility method for consistent logging
	 */
	log(level, message, ...args) {
		log(level, this.commandName.toUpperCase(), message, ...args);
	}
}
