fn main() {
    let mut windows = tauri_build::WindowsAttributes::new();

    // Only embed the "requireAdministrator" manifest in release mode.
    // In debug/dev, we allow the app to launch (asInvoker) so the runtime check
    // can show a helpful dialog instead of the OS just crashing with error 740.
    if std::env::var("PROFILE")
        .map(|v| v == "release")
        .unwrap_or(false)
    {
        windows = windows.app_manifest(include_str!("app.manifest"));
    }

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(windows)
            .plugin(
                "server-org",
                tauri_build::InlinedPlugin::new().commands(&[
                    "create_folder",
                    "get_all_folders",
                    "get_folder_hierarchy",
                    "update_folder",
                    "delete_folder",
                    "add_server_to_folder",
                    "remove_server_from_folder",
                    "get_server_folders",
                    "archive_server",
                    "restore_server",
                    "is_server_archived",
                    "get_archived_servers",
                    "update_server_customization",
                    "get_server_customization",
                    "create_dashboard_layout",
                    "get_user_layouts",
                    "delete_layout",
                    "create_server_group",
                    "get_all_server_groups",
                    "log_server_activity",
                    "get_server_activity_stats",
                    "get_dashboard_statistics",
                    "bulk_move_servers",
                    "bulk_archive_servers",
                    "bulk_tag_servers",
                    "bulk_color_servers",
                    "search_servers",
                    "get_servers_by_status",
                    "get_servers_by_map",
                    "get_servers_by_group",
                    "get_servers_by_tag",
                    "get_active_servers",
                    "get_inactive_servers",
                    "get_organization_snapshot",
                    "export_server_organization",
                    "import_server_organization",
                    "reorder_servers",
                    "assign_server_priority",
                    "auto_archive_inactive_servers",
                    "get_server_comparison_stats",
                ]),
            ),
    )
    .expect("failed to run build script");
}
