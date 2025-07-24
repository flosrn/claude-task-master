/**
 * tools/force-notion-sync.js
 * Tool to force complete Notion synchronization
 */

import { z } from 'zod';
import { forceFullNotionSync } from '../../../scripts/modules/notion.js';
import {
    createErrorResponse,
    handleApiResult,
    withNormalizedProjectRoot
} from './utils.js';

/**
 * Register the forceNotionSync tool with the MCP server
 * @param {Object} server - FastMCP server instance
 */
export function registerForceNotionSyncTool(server) {
    server.addTool({
        name: 'force_notion_sync',
        description: 'Force a complete resynchronization with Notion by treating all local tasks as new. This ensures all local tasks are represented in Notion.',
        parameters: z.object({
            projectRoot: z
                .string()
                .describe('The directory of the project. Must be an absolute path.')
        }),
        execute: withNormalizedProjectRoot(async (args, { log, session }) => {
            try {
                log.info(`Forcing full Notion sync for project: ${args.projectRoot}`);
                
                await forceFullNotionSync(args.projectRoot);
                
                const message = 'Forced full synchronization completed successfully';
                log.info(message);
                
                return {
                    success: true,
                    message: message
                };
            } catch (error) {
                log.error(`Error forcing Notion sync: ${error.message}`);
                return createErrorResponse(error.message);
            }
        })
    });
}