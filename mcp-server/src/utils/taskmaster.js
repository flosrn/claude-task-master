/**
 * utils/taskmaster.js
 * Utility functions for running TaskMaster commands from MCP
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run a TaskMaster CLI command from the MCP server
 * @param {Array} commandArgs - Array of command arguments
 * @param {string} cwd - Working directory (optional)
 * @returns {Object} Result object with stdout, stderr, and success status
 */
export function runTaskMasterCommand(commandArgs, cwd = process.cwd()) {
	try {
		// Path to the task-master binary
		const taskMasterPath = path.resolve(__dirname, '../../../bin/task-master.js');
		
		const result = spawnSync('node', [taskMasterPath, ...commandArgs], {
			cwd,
			encoding: 'utf8',
			env: { ...process.env },
		});
		
		return {
			success: result.status === 0,
			stdout: result.stdout || '',
			stderr: result.stderr || '',
			status: result.status
		};
	} catch (error) {
		return {
			success: false,
			stdout: '',
			stderr: error.message,
			status: -1
		};
	}
}