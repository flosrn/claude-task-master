/**
 * notion-commands.js
 * Notion integration commands for Task Master CLI
 */

import path from 'path';
import { log } from './utils.js';
import { repairNotionDuplicates, validateNotionSync, forceFullNotionSync } from './notion.js';
import { initTaskMaster } from '../../src/task-master.js';
import chalk from 'chalk';

/**
 * Command to repair Notion database duplicates
 * @param {Object} options - Command options
 */
export async function repairNotionDuplicatesCommand(options = {}) {
    const { dryRun = false, forceSync = true, projectRoot: providedRoot } = options;
    
    try {
        const taskMaster = await initTaskMaster(providedRoot);
        const projectRoot = taskMaster.getProjectRoot();
        
        if (!projectRoot) {
            log('error', 'REPAIR', 'Project root not found. Please run this command from a TaskMaster project directory.');
            process.exit(1);
        }

        log('info', 'REPAIR', `${dryRun ? '[DRY RUN] ' : ''}Starting Notion duplicate repair...`);
        
        const result = await repairNotionDuplicates(projectRoot, { dryRun, forceSync });
        
        if (result.success) {
            if (result.duplicatesRemoved === 0) {
                log('success', 'REPAIR', 'No duplicates found in Notion database');
            } else {
                const message = dryRun 
                    ? `[DRY RUN] Found ${result.totalDuplicatesFound} duplicate pages that would be removed`
                    : `Successfully removed ${result.duplicatesRemoved} duplicate pages`;
                log('success', 'REPAIR', message);
                
                if (!dryRun && result.details.length > 0) {
                    console.log('\nRemoved duplicates:');
                    result.details.forEach(detail => {
                        const status = detail.error ? chalk.red('FAILED') : chalk.green('SUCCESS');
                        console.log(`  [${status}] TaskID ${detail.taskId}: ${detail.title} (${detail.pageId})`);
                        if (detail.error) {
                            console.log(`    Error: ${detail.error}`);
                        }
                    });
                }
            }
        } else {
            log('error', 'REPAIR', `Failed to repair duplicates: ${result.error}`);
            process.exit(1);
        }
        
    } catch (error) {
        log('error', 'REPAIR', `Failed to repair Notion duplicates: ${error.message}`);
        process.exit(1);
    }
}

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

        log('info', 'VALIDATE', 'Validating Notion synchronization...');
        
        const report = await validateNotionSync(projectRoot);
        
        if (report.success) {
            console.log('\n' + chalk.bold('Notion Sync Validation Report'));
            console.log('=' + '='.repeat(35));
            console.log(`Local tasks: ${report.localTaskCount}`);
            console.log(`Notion pages: ${report.notionPageCount}`);
            console.log(`Notion task IDs: ${report.notionTaskIdCount}`);
            
            // Show issues if any
            const hasIssues = report.duplicatesInNotion.length > 0 || 
                             report.missingInNotion.length > 0 || 
                             report.extraInNotion.length > 0 || 
                             report.mappingIssues.length > 0;
            
            if (hasIssues) {
                console.log('\n' + chalk.yellow('Issues Found:'));
                
                if (report.duplicatesInNotion.length > 0) {
                    console.log(`  ${chalk.red('●')} ${report.duplicatesInNotion.length} taskids with duplicates in Notion`);
                    if (options.verbose) {
                        report.duplicatesInNotion.forEach(dup => {
                            console.log(`    - TaskID ${dup.taskId}: ${dup.pageCount} pages`);
                        });
                    }
                }
                
                if (report.missingInNotion.length > 0) {
                    console.log(`  ${chalk.yellow('●')} ${report.missingInNotion.length} tasks missing in Notion`);
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
                    console.log(`  ${chalk.blue('●')} ${report.extraInNotion.length} extra tasks in Notion`);
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
                    console.log(`  ${chalk.magenta('●')} ${report.mappingIssues.length} mapping consistency issues`);
                    if (options.verbose) {
                        report.mappingIssues.forEach(issue => {
                            console.log(`    - [${issue.tag}] ${issue.taskId}: ${issue.issue}`);
                        });
                    }
                }
                
                console.log(`\n${chalk.yellow('Recommendation:')} Run 'task-master repair-notion-duplicates' to fix duplicate issues.`);
                
            } else {
                console.log(`\n${chalk.green('✓')} No issues found - Notion sync is healthy!`);
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
 * Command to force full Notion synchronization
 * @param {Object} options - Command options
 */
export async function forceNotionSyncCommand(options = {}) {
    const { projectRoot: providedRoot } = options;
    
    try {
        const taskMaster = await initTaskMaster(providedRoot);
        const projectRoot = taskMaster.getProjectRoot();
        
        if (!projectRoot) {
            log('error', 'SYNC', 'Project root not found. Please run this command from a TaskMaster project directory.');
            process.exit(1);
        }

        log('info', 'SYNC', 'Starting forced full Notion synchronization...');
        
        await forceFullNotionSync(projectRoot);
        
        log('success', 'SYNC', 'Forced full synchronization completed successfully');
        
    } catch (error) {
        log('error', 'SYNC', `Failed to force sync: ${error.message}`);
        process.exit(1);
    }
}