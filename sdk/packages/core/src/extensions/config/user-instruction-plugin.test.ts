import type {
	AgentExtensionCommand,
	AgentExtensionSkill,
	AgentTool,
	AgentToolContext,
} from "@cline/shared";
import { describe, expect, it } from "vitest";
import { createUserInstructionConfigWatcher } from "./user-instruction-config-loader";
import {
	createUserInstructionPlugin,
	createUserInstructionSkillsExecutor,
} from "./user-instruction-plugin";

describe("user instruction plugin registered skills", () => {
	async function createEmptyWatcher() {
		const watcher = createUserInstructionConfigWatcher({
			skills: { directories: [] },
			rules: { directories: [] },
			workflows: { directories: [] },
		});
		await watcher.refreshAll();
		return watcher;
	}

	const registeredSkills: AgentExtensionSkill[] = [
		{
			name: "plugin-review",
			description: "Review with plugin guidance",
			instructions: "Follow the plugin review checklist.",
			source: "review-plugin",
		},
	];

	const toolContext: AgentToolContext = {
		agentId: "agent-1",
		conversationId: "conversation-1",
		iteration: 1,
	};

	it("executes registered plugin skills through the skills executor", async () => {
		const watcher = await createEmptyWatcher();
		try {
			const executor = createUserInstructionSkillsExecutor(
				watcher,
				Promise.resolve(),
				undefined,
				() => registeredSkills,
			);

			expect(executor.configuredSkills).toEqual([
				{
					id: "review-plugin:plugin-review",
					name: "plugin-review",
					description: "Review with plugin guidance",
					disabled: false,
				},
			]);
			await expect(
				executor("plugin-review", "src/index.ts", toolContext),
			).resolves.toContain("Follow the plugin review checklist.");
		} finally {
			watcher.stop();
		}
	});

	it("registers plugin skills as a tool and slash command", async () => {
		const watcher = await createEmptyWatcher();
		try {
			const tools: AgentTool[] = [];
			const commands: AgentExtensionCommand[] = [];
			const extension = createUserInstructionPlugin({
				watcher,
				includeSkills: true,
				registerSkillsTool: true,
			});
			const api = {
				registerTool: (tool: AgentTool) => tools.push(tool),
				registerCommand: (command: AgentExtensionCommand) =>
					commands.push(command),
				registerRule: () => {},
				registerSkill: () => {},
				registerMessageBuilder: () => {},
				registerProvider: () => {},
				registerAutomationEventType: () => {},
				getRegisteredSkills: () => registeredSkills,
			};

			await extension.setup?.(api, {});

			expect(tools.map((tool) => tool.name)).toEqual(["skills"]);
			expect(tools[0]?.description).toContain("plugin-review");
			expect(commands.map((command) => command.name)).toEqual([
				"plugin-review",
			]);
			expect(commands[0]?.handler?.("now")).toBe(
				"Follow the plugin review checklist.\n\nnow",
			);
		} finally {
			watcher.stop();
		}
	});
});
