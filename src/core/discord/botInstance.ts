import { DiscordBot } from './bot';

let botInstance: DiscordBot | null = null;

export function setBotInstance(bot: DiscordBot): void {
    botInstance = bot;
}

export function getBotInstance(): DiscordBot | null {
    return botInstance;
}

