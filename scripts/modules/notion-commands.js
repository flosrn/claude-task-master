/**
 * notion-commands.js
 * Notion integration commands for Task Master CLI
 */

import path from 'path';
import { log } from './utils.js';
import {
	validateNotionSync,
	repairNotionDB,
	setHierarchicalSyncMode
} from './notion.js';
import { initTaskMaster } from '../../src/task-master.js';
import chalk from 'chalk';
import {
	validateNotionHierarchySetup,
	validateNotionHierarchyIntegrity,
	repairNotionHierarchy
} from './notion-commands-hierarchy.js';

/**
 * Command to validate Notion synchronization with hierarchy option support
 * @param {Object} options - Command options including preserveFlattenTasks
 */
export async function validateNotionSyncCommand(options = {}) {
	const { projectRoot: providedRoot, preserveFlattenTasks = false } = options;

	// Configure hierarchy behavior
	if (preserveFlattenTasks) {
		setHierarchicalSyncMode(false);
	}

	try {
		const taskMaster = await initTaskMaster(providedRoot);
		const projectRoot = taskMaster.getProjectRoot();

		if (!projectRoot) {
			log(
				'error',
				'VALIDATE',
				'Project root not found. Please run this command from a TaskMaster project directory.'
			);
			process.exit(1);
		}

		log(
			'info',
			'VALIDATE',
			'🔍 Validating Notion synchronization with hierarchy detection...'
		);

		const report = await validateNotionSync(projectRoot);

		if (report.success) {
			console.log('\n' + chalk.bold('🩺 Notion Sync Health Check'));
			console.log('═' + '═'.repeat(45));

			// Show hierarchy mode status
			if (preserveFlattenTasks) {
				console.log(
					`🔧 Mode: ${chalk.yellow('Legacy flat sync (--preserve-flatten-tasks)')}`
				);
			} else {
				console.log(`🚀 Mode: ${chalk.green('Hierarchical sync')}`);
			}

			// TaskMaster tasks breakdown
			const taskmasterDetails =
				report.mainTaskCount > 0 || report.subtaskCount > 0
					? `${chalk.cyan(report.taskmasterTaskCount)} (${chalk.green(report.mainTaskCount)} main tasks, ${chalk.blue(report.subtaskCount)} subtasks)`
					: chalk.cyan(report.taskmasterTaskCount);
			console.log(`📝 TaskMaster tasks: ${taskmasterDetails}`);

			// Notion DB tasks breakdown
			const notionDetails =
				report.notionMainTaskCount > 0 || report.notionSubtaskCount > 0
					? `${chalk.cyan(report.notionPageCount)} (${chalk.green(report.notionMainTaskCount)} main tasks, ${chalk.blue(report.notionSubtaskCount)} subtasks)`
					: chalk.cyan(report.notionPageCount);
			console.log(`📄 Notion DB tasks: ${notionDetails}`);

			// Show issues if any
			const hasIssues =
				report.duplicatesInNotion.length > 0 ||
				report.missingInNotion.length > 0 ||
				report.extraInNotion.length > 0 ||
				report.mappingIssues.length > 0;

			if (hasIssues) {
				console.log('\n' + chalk.yellow('🔧 Found some sync differences:'));

				if (report.duplicatesInNotion.length > 0) {
					console.log(
						`  ${chalk.red('🔄')} ${report.duplicatesInNotion.length} tasks have duplicate pages in Notion`
					);
					if (options.verbose) {
						report.duplicatesInNotion.forEach((dup) => {
							console.log(`    - TaskID ${dup.taskId}: ${dup.pageCount} pages`);
						});
					}
				}

				if (report.missingInNotion.length > 0) {
					console.log(
						`  ${chalk.yellow('📤')} ${report.missingInNotion.length} tasks not yet synced to Notion`
					);
					if (options.verbose) {
						report.missingInNotion.slice(0, 10).forEach((taskId) => {
							console.log(`    - TaskID ${taskId}`);
						});
						if (report.missingInNotion.length > 10) {
							console.log(
								`    ... and ${report.missingInNotion.length - 10} more`
							);
						}
					}
				}

				if (report.extraInNotion.length > 0) {
					console.log(
						`  ${chalk.blue('📥')} ${report.extraInNotion.length} extra tasks found in Notion DB`
					);
					if (options.verbose) {
						report.extraInNotion.slice(0, 10).forEach((taskId) => {
							console.log(`    - TaskID ${taskId}`);
						});
						if (report.extraInNotion.length > 10) {
							console.log(
								`    ... and ${report.extraInNotion.length - 10} more`
							);
						}
					}
				}

				if (report.mappingIssues.length > 0) {
					console.log(
						`  ${chalk.magenta('🔗')} ${report.mappingIssues.length} mapping differences detected`
					);
					if (options.verbose) {
						report.mappingIssues.forEach((issue) => {
							console.log(
								`    - [${issue.tag}] ${issue.taskId}: ${issue.issue}`
							);
						});
					}
				}

				// Smart repair suggestions based on what was found
				console.log(
					`\n${chalk.green('💡 Quick fix:')} Run ${chalk.bold('task-master repair-notion-db')} to sync everything up!`
				);

				if (report.extraInNotion.length > 0) {
					console.log(
						`   ${chalk.dim('→ By default, extra Notion tasks will be removed (TaskMaster is source of truth)')}`
					);
					console.log(
						`   ${chalk.dim('→ To keep extra Notion tasks, use:')} ${chalk.bold('task-master repair-notion-db --preserve-extra-tasks')}`
					);
				}
			} else {
				console.log(
					`\n${chalk.green('✅ Perfect sync!')} Your TaskMaster tasks and Notion DB are perfectly aligned! 🎉`
				);
			}
		} else {
			log('error', 'VALIDATE', `Failed to validate sync: ${report.error}`);
			process.exit(1);
		}
	} catch (error) {
		log(
			'error',
			'VALIDATE',
			`Failed to validate Notion sync: ${error.message}`
		);
		process.exit(1);
	}
}

/**
 * Command to completely reset the Notion DB by archiving all pages and recreating from TaskMaster tasks
 * @param {Object} options - Command options
 */
export async function resetNotionDBCommand(options = {}) {
	// Import the new ResetNotionCommand
	const { ResetNotionCommand } = await import('./notion-reset-command.js');

	// Create command instance and execute
	const resetCommand = new ResetNotionCommand();
	const result = await resetCommand.execute(options);

	// Handle result consistently with new error handling
	if (result.success) {
		// Success already logged by the command
		return result;
	} else {
		// Error handling and suggestions already provided by ErrorHandler
		process.exit(1);
	}
}

/**
 * Command to repair Notion database comprehensively
 * Combines duplicate removal and missing task synchronization
 * @param {Object} options - Command options
 */
export async function repairNotionDBCommand(options = {}) {
	const {
		dryRun = false,
		preserveExtraTasks = false,
		preserveFlattenTasks = false,
		projectRoot: providedRoot
	} = options;

	// Configure hierarchy behavior
	if (preserveFlattenTasks) {
		setHierarchicalSyncMode(false);
	}

	try {
		const taskMaster = await initTaskMaster(providedRoot);
		const projectRoot = taskMaster.getProjectRoot();

		if (!projectRoot) {
			log(
				'error',
				'REPAIR',
				'Project root not found. Please run this command from a TaskMaster project directory.'
			);
			process.exit(1);
		}

		const modeText = preserveFlattenTasks
			? ' (legacy flat mode)'
			: ' (hierarchical mode)';
		log(
			'info',
			'REPAIR',
			`${dryRun ? '[DRY RUN] ' : ''}Starting comprehensive Notion repair${modeText}...`
		);

		const result = await repairNotionDB(projectRoot, {
			dryRun,
			preserveExtraTasks
		});

		if (result.success) {
			log('success', 'REPAIR', result.summary);

			// Detailed reporting
			if (result.duplicatesFound > 0) {
				console.log(
					`\n${chalk.yellow('Duplicates:')} ${result.duplicatesFound} taskids had duplicates`
				);
				if (!dryRun && result.duplicatesRemoved > 0) {
					console.log(
						`  → Removed ${result.duplicatesRemoved} duplicate pages`
					);
				}
			}

			if (
				result.tasksAdded > 0 ||
				(dryRun && result.additionDetails.length > 0)
			) {
				const count = dryRun
					? result.additionDetails.length
					: result.tasksAdded;
				console.log(
					`\n${chalk.blue('TaskMaster Tasks Added:')} ${count} tasks ${dryRun ? 'would be' : 'were'} synchronized to Notion DB`
				);
			}

			if (result.extraTasksFound > 0) {
				if (result.preserveExtraTasks) {
					console.log(
						`\n${chalk.yellow('Extra Tasks Preserved:')} ${result.extraTasksFound} extra tasks found in Notion DB but preserved due to --preserve-extra-tasks option`
					);
				} else {
					const removedCount = dryRun ? 0 : result.extraTasksRemoved;
					if (dryRun) {
						console.log(
							`\n${chalk.cyan('Extra Tasks:')} ${result.extraTasksFound} extra tasks found in Notion DB ${dryRun ? 'would be' : 'were'} removed (TaskMaster is source of truth)`
						);
					} else if (removedCount > 0) {
						console.log(
							`\n${chalk.green('Extra Tasks Cleaned:')} ${removedCount} extra tasks removed from Notion DB (TaskMaster is source of truth)`
						);
					}
				}
			}

			if (result.propertiesUpdated > 0) {
				console.log(
					`\n${chalk.blue('Properties Updated:')} ${result.propertiesUpdated} tasks had their properties refreshed (including dependencies)`
				);
			}

			if (result.pagesWithoutTaskId > 0) {
				console.log(
					`\n${chalk.yellow('Warning:')} ${result.pagesWithoutTaskId} pages found without taskid property`
				);
			}

			// Summary stats
			console.log(`\n${chalk.green('Summary:')}`);
			console.log(`  TaskMaster tasks: ${result.taskmasterTaskCount}`);
			console.log(`  Notion DB tasks: ${result.notionPageCount}`);
			if (dryRun) {
				console.log(`  ${chalk.cyan('[DRY RUN]')} No actual changes made`);
			} else {
				// Check if any changes were actually made
				const hasChanges =
					(result.duplicatesRemoved || 0) > 0 ||
					(result.tasksAdded || 0) > 0 ||
					(result.extraTasksRemoved || 0) > 0 ||
					(result.invalidMappingsRemoved || 0) > 0 ||
					(result.propertiesUpdated || 0) > 0;

				if (hasChanges) {
					console.log(
						`\n🎉 ${chalk.green.bold('Great!')} Your Notion DB has been successfully repaired and is now perfectly synchronized! ✨`
					);
				} else {
					console.log(
						`\n✅ ${chalk.green.bold('Perfect!')} Your Notion DB is already perfectly synchronized - no repairs needed! 😊`
					);
				}
			}
		} else {
			log('error', 'REPAIR', `Repair failed: ${result.error}`);
			process.exit(1);
		}
	} catch (error) {
		log('error', 'REPAIR', `Failed to repair Notion: ${error.message}`);
		process.exit(1);
	}
}

/**
 * Command to validate Notion hierarchy setup
 * @param {Object} options - Command options
 */
export async function validateNotionHierarchySetupCommand(options = {}) {
	const { projectRoot: providedRoot } = options;

	try {
		const taskMaster = await initTaskMaster(providedRoot);
		const projectRoot = taskMaster.getProjectRoot();

		if (!projectRoot) {
			log(
				'error',
				'VALIDATE-HIERARCHY',
				'Project root not found. Please run this command from a TaskMaster project directory.'
			);
			process.exit(1);
		}

		await validateNotionHierarchySetup(projectRoot);
	} catch (error) {
		log(
			'error',
			'VALIDATE-HIERARCHY',
			`Failed to validate hierarchy: ${error.message}`
		);
		process.exit(1);
	}
}

/**
 * Command to validate Notion hierarchy integrity
 * @param {Object} options - Command options
 */
export async function validateNotionHierarchyIntegrityCommand(options = {}) {
	const { projectRoot: providedRoot } = options;

	try {
		const taskMaster = await initTaskMaster(providedRoot);
		const projectRoot = taskMaster.getProjectRoot();

		if (!projectRoot) {
			log(
				'error',
				'VALIDATE-HIERARCHY',
				'Project root not found. Please run this command from a TaskMaster project directory.'
			);
			process.exit(1);
		}

		await validateNotionHierarchyIntegrity(projectRoot);
	} catch (error) {
		log(
			'error',
			'VALIDATE-HIERARCHY',
			`Failed to validate hierarchy: ${error.message}`
		);
		process.exit(1);
	}
}

/**
 * Command to repair Notion hierarchy
 * @param {Object} options - Command options
 */
export async function repairNotionHierarchyCommand(options = {}) {
	const { projectRoot: providedRoot, dryRun = false } = options;

	try {
		const taskMaster = await initTaskMaster(providedRoot);
		const projectRoot = taskMaster.getProjectRoot();

		if (!projectRoot) {
			log(
				'error',
				'REPAIR-HIERARCHY',
				'Project root not found. Please run this command from a TaskMaster project directory.'
			);
			process.exit(1);
		}

		await repairNotionHierarchy(projectRoot, { dryRun });
	} catch (error) {
		log(
			'error',
			'REPAIR-HIERARCHY',
			`Failed to repair hierarchy: ${error.message}`
		);
		process.exit(1);
	}
}
