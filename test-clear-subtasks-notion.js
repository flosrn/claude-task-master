#!/usr/bin/env node

/**
 * Test script for clear-subtasks with Notion synchronization
 * This script simulates the clear-subtasks operation and verifies Notion sync
 */

import { clearSubtasks } from './scripts/modules/task-manager.js';
import { readJSON } from './scripts/modules/utils.js';
import path from 'path';

async function testClearSubtasksWithNotion() {
	console.log('🧪 Testing clear-subtasks with Notion sync...\n');

	const projectRoot = process.cwd();
	const tasksPath = path.join(projectRoot, '.taskmaster', 'tasks.json');

	console.log(`📂 Project root: ${projectRoot}`);
	console.log(`📄 Tasks file: ${tasksPath}`);

	// Check if tasks file exists
	try {
		const data = readJSON(tasksPath, projectRoot);
		console.log(`✅ Tasks file found with ${data.tasks?.length || 0} tasks`);

		// Look for tasks with subtasks
		const tasksWithSubtasks =
			data.tasks?.filter((task) => task.subtasks && task.subtasks.length > 0) ||
			[];

		if (tasksWithSubtasks.length === 0) {
			console.log('⚠️  No tasks with subtasks found. Creating a test task...');
			console.log(
				'Please run this test on a project that has tasks with subtasks.'
			);
			return;
		}

		console.log(`🎯 Found ${tasksWithSubtasks.length} tasks with subtasks:`);
		tasksWithSubtasks.forEach((task) => {
			console.log(
				`  - Task ${task.id}: "${task.title}" (${task.subtasks.length} subtasks)`
			);
		});

		// Test with the first task that has subtasks
		const testTask = tasksWithSubtasks[0];
		console.log(`\n🚀 Testing clear-subtasks on task ${testTask.id}...`);

		try {
			await clearSubtasks(tasksPath, testTask.id.toString(), { projectRoot });
			console.log('✅ clear-subtasks completed successfully!');
			console.log('   - Local subtasks should be cleared');
			console.log('   - Notion pages should be archived/deleted');
			console.log('   - Future syncs should not have mapping errors');
		} catch (error) {
			console.error('❌ Error during clear-subtasks:', error.message);
			if (error.message.includes('Notion')) {
				console.log('💡 This might be expected if Notion is not configured');
			}
		}
	} catch (error) {
		console.error('❌ Error reading tasks file:', error.message);
		console.log(`
💡 To test this fix:
1. Make sure you have a .taskmaster/tasks.json file with tasks that have subtasks
2. Configure Notion integration with NOTION_TOKEN and NOTION_DATABASE_ID in .env
3. Run this test script again
        `);
	}
}

// Run the test
testClearSubtasksWithNotion().catch(console.error);
