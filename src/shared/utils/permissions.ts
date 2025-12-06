import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';

/**
 * Verifica si el usuario tiene permisos para ejecutar comandos administrativos
 * Por defecto, solo los administradores pueden ejecutar estos comandos
 */
export function hasAdminPermission(interaction: ChatInputCommandInteraction): boolean {
    if (!interaction.member || !interaction.guild) {
        return false;
    }

    // Si el usuario es el dueño del servidor, siempre tiene permisos
    if (interaction.guild.ownerId === interaction.user.id) {
        return true;
    }

    // Verificar si el usuario tiene permisos de administrador
    const member = interaction.member;
    if ('permissions' in member) {
        const permissions = member.permissions;
        // permissions puede ser string o PermissionsBitField
        if (permissions && typeof permissions === 'object' && 'has' in permissions) {
            return permissions.has(PermissionFlagsBits.Administrator);
        }
    }

    return false;
}

/**
 * Verifica permisos y responde con error si no tiene permisos
 */
export async function requireAdminPermission(interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (!hasAdminPermission(interaction)) {
        await interaction.reply({
            content: '❌ No tienes permisos para ejecutar este comando. Solo los administradores pueden usar este comando.',
            flags: 64, // Ephemeral
        });
        return false;
    }
    return true;
}

