import { SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from 'discord.js';
import { addRepoCommand } from './addRepo';
import { listReposCommand } from './listRepos';
import { configureBranchCommand } from './configureBranch';
import { removeRepoCommand } from './removeRepo';
import { bugCommands } from '../../bugs/commands';

export interface Command {
    data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
    execute: (interaction: any) => Promise<void>;
    autocomplete?: (interaction: any) => Promise<void>;
}

export function registerCommands(): Command[] {
    return [
        addRepoCommand,
        listReposCommand,
        configureBranchCommand,
        removeRepoCommand,
        ...bugCommands,
    ];
}

