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

    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run build script");
}
