/**
 * notion-commands.js
 * Notion integration commands for Task Master CLI
 */

import path from 'path';
import { log } from './utils.js';
import { validateNotionSync, resetNotionDatabase, repairNotion } from './notion.js';
import { initTaskMaster } from '../../src/task-master.js';
import chalk from 'chalk';


/**
 * Command to validate Notion synchronization
 * @param {Object} options - Command options
 */
export async function validateNotionSyncCommand(options = {}) {
    const { projectRoot: providedRoot } = options;
    
    try {
        const taskMaster = await initTaskMaster(providedRoot);
        const projectRoot = taskMaster.getProjectRoot();
        
        if (!projectRoot) {
            log('error', 'VALIDATE', 'Project root not found. Please run this command from a TaskMaster project directory.');
            process.exit(1);
        }

        log('info', 'VALIDATE', '🔍 Checking Notion synchronization status...');
        
        const report = await validateNotionSync(projectRoot);
        
        if (report.success) {
            console.log('\n' + chalk.bold('📊 Notion Sync Health Check'));
            console.log('═' + '═'.repeat(35));
            console.log(`📝 Local tasks: ${chalk.cyan(report.localTaskCount)}`);
            console.log(`📄 Notion pages: ${chalk.cyan(report.notionPageCount)}`);
            console.log(`🔗 Notion task IDs: ${chalk.cyan(report.notionTaskIdCount)}`);
            
            // Show issues if any
            const hasIssues = report.duplicatesInNotion.length > 0 || 
                             report.missingInNotion.length > 0 || 
                             report.extraInNotion.length > 0 || 
                             report.mappingIssues.length > 0;
            
            if (hasIssues) {
                console.log('\n' + chalk.yellow('🔧 Found some sync differences:'));
                
                if (report.duplicatesInNotion.length > 0) {
                    console.log(`  ${chalk.red('🔄')} ${report.duplicatesInNotion.length} tasks have duplicate pages in Notion`);
                    if (options.verbose) {
                        report.duplicatesInNotion.forEach(dup => {
                            console.log(`    - TaskID ${dup.taskId}: ${dup.pageCount} pages`);
                        });
                    }
                }
                
                if (report.missingInNotion.length > 0) {
                    console.log(`  ${chalk.yellow('📤')} ${report.missingInNotion.length} tasks not yet synced to Notion`);
                    if (options.verbose) {
                        report.missingInNotion.slice(0, 10).forEach(taskId => {
                            console.log(`    - TaskID ${taskId}`);
                        });
                        if (report.missingInNotion.length > 10) {
                            console.log(`    ... and ${report.missingInNotion.length - 10} more`);
                        }
                    }
                }
                
                if (report.extraInNotion.length > 0) {
                    console.log(`  ${chalk.blue('📥')} ${report.extraInNotion.length} extra pages found in Notion`);
                    if (options.verbose) {
                        report.extraInNotion.slice(0, 10).forEach(taskId => {
                            console.log(`    - TaskID ${taskId}`);
                        });
                        if (report.extraInNotion.length > 10) {
                            console.log(`    ... and ${report.extraInNotion.length - 10} more`);
                        }
                    }
                }
                
                if (report.mappingIssues.length > 0) {
                    console.log(`  ${chalk.magenta('🔗')} ${report.mappingIssues.length} mapping differences detected`);
                    if (options.verbose) {
                        report.mappingIssues.forEach(issue => {
                            console.log(`    - [${issue.tag}] ${issue.taskId}: ${issue.issue}`);
                        });
                    }
                }
                
                console.log(`\n${chalk.green('💡 Quick fix:')} Run ${chalk.bold('task-master repair-notion')} to sync everything up!`);
                
            } else {
                console.log(`\n${chalk.green('✅ Perfect sync!')} Your local tasks and Notion are perfectly aligned! 🎉`);
            }
            
        } else {
            log('error', 'VALIDATE', `Failed to validate sync: ${report.error}`);
            process.exit(1);
        }
        
    } catch (error) {
        log('error', 'VALIDATE', `Failed to validate Notion sync: ${error.message}`);
        process.exit(1);
    }
}


/**
 * Command to completely reset the Notion database by archiving all pages and recreating from local tasks
 * @param {Object} options - Command options
 */
export async function resetNotionCommand(options = {}) {
    const { projectRoot: providedRoot } = options;
    
    try {
        const taskMaster = await initTaskMaster(providedRoot);
        const projectRoot = taskMaster.getProjectRoot();
        
        if (!projectRoot) {
            log('error', 'RESET', 'Project root not found. Please run this command from a TaskMaster project directory.');
            process.exit(1);
        }

        log('info', 'RESET', 'Starting complete Notion database reset...');
        log('warn', 'RESET', 'This will archive ALL existing pages in Notion and recreate them from local tasks.');
        
        const result = await resetNotionDatabase(projectRoot);
        
        if (result.success) {
            log('success', 'RESET', result.message);
        } else {
            log('error', 'RESET', `Reset failed: ${result.error}`);
            process.exit(1);
        }
        
    } catch (error) {
        log('error', 'RESET', `Failed to reset Notion database: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Command to repair Notion database comprehensively
 * Combines duplicate removal and missing task synchronization
 * @param {Object} options - Command options
 */
export async function repairNotionCommand(options = {}) {
    const { dryRun = false, projectRoot: providedRoot } = options;
    
    try {
        const taskMaster = await initTaskMaster(providedRoot);
        const projectRoot = taskMaster.getProjectRoot();
        
        if (!projectRoot) {
            log('error', 'REPAIR', 'Project root not found. Please run this command from a TaskMaster project directory.');
            process.exit(1);
        }

        log('info', 'REPAIR', `${dryRun ? '[DRY RUN] ' : ''}Starting comprehensive Notion repair...`);
        
        const result = await repairNotion(projectRoot, { dryRun });
        
        if (result.success) {
            log('success', 'REPAIR', result.summary);
            
            // Detailed reporting
            if (result.duplicatesFound > 0) {
                console.log(`\n${chalk.yellow('Duplicates:')} ${result.duplicatesFound} taskids had duplicates`);
                if (!dryRun && result.duplicatesRemoved > 0) {
                    console.log(`  → Removed ${result.duplicatesRemoved} duplicate pages`);
                }
            }
            
            if (result.tasksAdded > 0 || (dryRun && result.additionDetails.length > 0)) {
                const count = dryRun ? result.additionDetails.length : result.tasksAdded;
                console.log(`\n${chalk.blue('Missing Tasks:')} ${count} tasks ${dryRun ? 'would be' : 'were'} added to Notion`);
            }
            
            if (result.pagesWithoutTaskId > 0) {
                console.log(`\n${chalk.yellow('Warning:')} ${result.pagesWithoutTaskId} pages found without taskid property`);
            }
            
            // Summary stats
            console.log(`\n${chalk.green('Summary:')}`);
            console.log(`  Local Tasks: ${result.localTaskCount}`);
            console.log(`  Notion Pages: ${result.notionPageCount}`);
            if (dryRun) {
                console.log(`  ${chalk.cyan('[DRY RUN]')} No actual changes made`);
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