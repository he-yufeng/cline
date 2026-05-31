import { type AgentExtensionSkill, truncateSplit } from "@cline/shared";
import type {
	SkillConfig,
	UserInstructionConfigWatcher,
	WorkflowConfig,
} from "./user-instruction-config-loader";

export type RuntimeCommandKind = "skill" | "workflow";

export type AvailableRuntimeCommand = {
	id: string;
	name: string;
	instructions: string;
	description?: string;
	kind: RuntimeCommandKind;
};

type CommandRecord = {
	item: SkillConfig | WorkflowConfig;
};

function resolveCommandDescription(
	item: SkillConfig | WorkflowConfig,
	kind: RuntimeCommandKind,
): string | undefined {
	if (item.description?.trim()) {
		return truncateSplit(item.description, ".");
	}
	if (kind === "workflow") {
		return undefined;
	}
	return truncateSplit(item.instructions, ".");
}

function isCommandEnabled(command: SkillConfig | WorkflowConfig): boolean {
	return command.disabled !== true;
}

function normalizeSkillToken(token: string): string {
	return token.trim().replace(/^\/+/, "").toLowerCase();
}

function registeredSkillId(skill: AgentExtensionSkill): string {
	const source = normalizeSkillToken(skill.source ?? "plugin") || "plugin";
	const name = normalizeSkillToken(skill.name);
	return `${source}:${name}`;
}

function listCommandsForKind(
	watcher: UserInstructionConfigWatcher,
	kind: RuntimeCommandKind,
): AvailableRuntimeCommand[] {
	return [...watcher.getSnapshot(kind).entries()]
		.map(([id, record]) => ({ id, record: record as CommandRecord }))
		.filter(({ record }) => isCommandEnabled(record.item))
		.map(({ id, record }) => ({
			id,
			name: record.item.name,
			instructions: record.item.instructions,
			description: resolveCommandDescription(record.item, kind),
			kind,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

function listCommandsForRegisteredSkills(
	registeredSkills: ReadonlyArray<AgentExtensionSkill>,
): AvailableRuntimeCommand[] {
	return registeredSkills
		.filter((skill) => skill.disabled !== true)
		.map((skill) => {
			const name = skill.name.trim();
			const description = skill.description?.trim()
				? truncateSplit(skill.description, ".")
				: truncateSplit(skill.instructions, ".");
			return {
				id: registeredSkillId(skill),
				name,
				instructions: skill.instructions,
				description,
				kind: "skill" as const,
			};
		})
		.filter(
			(command) =>
				command.name.length > 0 && command.instructions.trim().length > 0,
		)
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function listAvailableRuntimeCommandsFromWatcher(
	watcher: UserInstructionConfigWatcher,
	registeredSkills: ReadonlyArray<AgentExtensionSkill> = [],
): AvailableRuntimeCommand[] {
	const byName = new Map<string, AvailableRuntimeCommand>();
	for (const command of [
		...listCommandsForKind(watcher, "workflow"),
		...listCommandsForKind(watcher, "skill"),
		...listCommandsForRegisteredSkills(registeredSkills),
	]) {
		if (!byName.has(command.name)) {
			byName.set(command.name, command);
		}
	}
	return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveRuntimeSlashCommandFromWatcher(
	input: string,
	watcher: UserInstructionConfigWatcher,
): string {
	if (!input.startsWith("/") || input.length < 2) {
		return input;
	}
	const match = input.match(/^\/(\S+)/);
	if (!match) {
		return input;
	}
	const name = match[1];
	if (!name) {
		return input;
	}
	const commandLength = name.length + 1;
	const remainder = input.slice(commandLength);
	const matched = listAvailableRuntimeCommandsFromWatcher(watcher).find(
		(command) => command.name === name,
	);
	return matched ? `${matched.instructions}${remainder}` : input;
}
