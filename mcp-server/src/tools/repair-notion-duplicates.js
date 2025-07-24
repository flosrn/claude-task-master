/**
 * tools/repair-notion-duplicates.js
 * Tool to repair Notion database by removing duplicate tasks
 */

import { z } from 'zod';
import { repairNotionDuplicates } from '../../../scripts/modules/notion.js';
import {
    createErrorResponse,
    handleApiResult,
    withNormalizedProjectRoot
} from './utils.js';

/**
 * Register the repairNotionDuplicates tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerRepairNotionDuplicatesTool(server) {
    server.addTool({
        name: 'repair_notion_duplicates',
        description: 'Repair Notion database by removing duplicate tasks based on taskid property. Keeps the most recently created page for each unique taskid.',
        parameters: z.object({
            projectRoot: z
                .string()
                .describe('The directory of the project. Must be an absolute path.'),
            dryRun: z
                .boolean()
                .optional()
                .default(false)
                .describe('Show what would be removed without actually removing anything'),
            forceSync: z
                .boolean()
                .optional()
                .default(true)
                .describe('Force complete resynchronization after cleanup')
        }),
        execute: withNormalizedProjectRoot(async (args, { log, session }) => {
            try {
                log.info(`Repairing Notion duplicates with args: ${JSON.stringify(args)}`);
                
                const result = await repairNotionDuplicates(args.projectRoot, {
                    dryRun: args.dryRun,
                    forceSync: args.forceSync
                });
                
                if (result.success) {
                    const message = result.dryRun 
                        ? `[DRY RUN] Found ${result.totalDuplicatesFound} duplicate pages that would be removed`
                        : `Successfully removed ${result.duplicatesRemoved} duplicate pages`;
                    
                    log.info(message);
                    
                    return {
                        success: true,
                        duplicatesRemoved: result.duplicatesRemoved,
                        totalDuplicatesFound: result.totalDuplicatesFound,
                        dryRun: result.dryRun,
                        details: result.details,
                        message: message
                    };
                } else {
                    log.error(`Failed to repair Notion duplicates: ${result.error}`);
                    return createErrorResponse(result.error);
                }
            } catch (error) {
                log.error(`Error repairing Notion duplicates: ${error.message}`);
                return createErrorResponse(error.message);
            }
        })
    });
}