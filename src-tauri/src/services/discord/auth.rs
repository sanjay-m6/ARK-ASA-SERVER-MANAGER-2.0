// Centralized authorization & role permission guard
#![allow(dead_code)]
use super::types::RoleTier;
use crate::services::discord_bridge::DiscordBridgeConfig;
use serenity::all::{Member, Permissions, UserId};

pub struct AuthGuard;

impl AuthGuard {
    /// Resolve the RoleTier for a member in a guild
    pub fn resolve_role_tier(
        member: Option<&Member>,
        user_id: UserId,
        guild_owner_id: Option<UserId>,
        config: &DiscordBridgeConfig,
    ) -> RoleTier {
        // Guild owner always has Owner tier
        if let Some(owner_id) = guild_owner_id {
            if owner_id == user_id {
                return RoleTier::Owner;
            }
        }

        if let Some(m) = member {
            // Check Discord Administrator permission on member
            if let Some(permissions) = m.permissions {
                if permissions.contains(Permissions::ADMINISTRATOR) {
                    return RoleTier::Owner;
                }
            }

            // Check configured Admin Role IDs
            for role_id in &m.roles {
                let r_str = role_id.to_string();
                if config.admin_role_ids.iter().any(|a| a.trim() == r_str) {
                    return RoleTier::Admin;
                }
            }

            // Check configured Moderator Role IDs
            for role_id in &m.roles {
                let r_str = role_id.to_string();
                if config.moderator_role_ids.iter().any(|m_id| m_id.trim() == r_str) {
                    return RoleTier::Moderator;
                }
            }
        }

        // If no admin or moderator roles are configured, fail closed to Player unless Administrator
        RoleTier::Player
    }

    /// Verify if a member meets the required minimum RoleTier (fail-closed)
    pub fn check_permission(
        member: Option<&Member>,
        user_id: UserId,
        guild_owner_id: Option<UserId>,
        config: &DiscordBridgeConfig,
        required_tier: RoleTier,
    ) -> bool {
        let user_tier = Self::resolve_role_tier(member, user_id, guild_owner_id, config);
        user_tier >= required_tier
    }

    /// Check permission for standard Discord manager actions
    pub fn can_execute_action(action: &str, tier: RoleTier) -> (bool, &'static str) {
        match action {
            "status" | "players" | "player" | "link" => (true, "Authorized"),
            "cross_chat" => (true, "Authorized"),
            "rcon_read" | "rcon_list" | "broadcast" => {
                if tier >= RoleTier::Moderator {
                    (true, "Authorized")
                } else {
                    (false, "Requires Moderator role or higher.")
                }
            }
            "backup" | "kick" | "whitelist_apply" | "whitelist_view" => {
                if tier >= RoleTier::Moderator {
                    (true, "Authorized")
                } else {
                    (false, "Requires Moderator role or higher.")
                }
            }
            "start" | "stop" | "restart" | "update" | "ban" | "whitelist_approve" | "start_all" | "stop_all" | "restart_all" | "update_all" => {
                if tier >= RoleTier::Admin {
                    (true, "Authorized")
                } else {
                    (false, "Requires Administrator role or Server Owner.")
                }
            }
            "setup" => {
                if tier >= RoleTier::Owner {
                    (true, "Authorized")
                } else {
                    (false, "The `/setup` wizard requires Discord Administrator permissions or Server Ownership.")
                }
            }
            _ => (false, "Action not recognized or permitted."),
        }
    }

    /// Allowed commands for Discord RCON execution (prevent destructive system injection)
    pub fn is_allowed_rcon_command(command: &str, tier: RoleTier) -> (bool, &'static str) {
        let trimmed = command.trim();
        let first_word = trimmed.split_whitespace().next().unwrap_or("").to_lowercase();

        // High-risk commands restricted strictly to Admin or Owner
        let admin_only_commands = [
            "exit", "quit", "shutdown", "doexit", "kickplayer", "banplayer", "unbanplayer",
            "destroywilddinos", "destroyall", "killplayer", "giveitem", "givearmortome",
            "givedinotome", "givecreativemode", "cheat"
        ];
        if admin_only_commands.contains(&first_word.as_str()) {
            if tier >= RoleTier::Admin {
                return (true, "Authorized admin RCON command");
            } else {
                return (false, "This RCON command requires Administrator or Server Owner permissions.");
            }
        }

        // Standard operational commands allowed for Moderator and above
        let standard_commands = [
            "saveworld", "serverchat", "broadcast", "listplayers", "getgamelog",
            "playersonline", "getchat", "custom", "allowplayertojoinnonode", "disallowplayertojoinnonode"
        ];
        if standard_commands.contains(&first_word.as_str()) {
            if tier >= RoleTier::Moderator {
                return (true, "Authorized RCON command");
            } else {
                return (false, "RCON execution requires Moderator role or higher.");
            }
        }

        if tier >= RoleTier::Admin {
            (true, "Authorized custom RCON command (Admin)")
        } else {
            (false, "Unknown or restricted RCON command. Contact a server administrator.")
        }
    }
}
