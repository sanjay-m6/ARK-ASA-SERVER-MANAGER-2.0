#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Shell::IsUserAnAdmin;

/// Check if the application is running with Administrator privileges
pub fn is_app_elevated() -> bool {
    #[cfg(target_os = "windows")]
    {
        // Method 1: Windows API (Fastest/Reliable)
        unsafe {
            if IsUserAnAdmin() != 0 {
                return true;
            }
        }

        // Method 2: Fallback to net session (slower but robust)
        // Only if API fails or implies false, double check?
        // Actually IsUserAnAdmin is quite reliable.
        // But for completeness let's stick to API for now as it aligns with existing code.
        false
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On Linux/Mac check uid 0
        unsafe { libc::geteuid() == 0 }
    }
}

/// Command to check admin status from Frontend
#[tauri::command]
pub fn check_is_admin() -> bool {
    is_app_elevated()
}
