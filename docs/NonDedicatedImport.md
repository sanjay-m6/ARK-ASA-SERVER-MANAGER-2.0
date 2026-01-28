# How to Import Non-Dedicated / Singleplayer Saves

The **ASA Server Manager** allows you to easily import your existing Singleplayer or Non-Dedicated worlds into a Dedicated Server. This is great for migrating from playing with friends on your local machine to a proper 24/7 server.

## 📂 Locating Your Save Files

Before importing, you need to find your current save data.

### Standard Steam Location:
`C:\Program Files (x86)\Steam\steamapps\common\ARK Survival Ascended\ShooterGame\Saved\SavedArks`

Inside this folder, you will generally look for:
- **Map File**: e.g., `TheIsland_WP.ark` (The main world data)
- **Profile Files**: e.g., `LocalPlayer.arkprofile` (Your character) or `123456789.arkprofile`
- **Tribe Files**: e.g., `123456789.arktribe`

## 🚀 How to Import

1. Open **ASA Server Manager**.
2. Ensure you have **Installed a Server** first. The import tool needs a target server to copy files into.
3. Click the **"Import Save"** button in the top right corner of the dashboard.
4. Select your **Target Server** from the dropdown list.
5. Choose your import source:
    - **Select .ark File**: Use this if you only want to copy the world map itself.
    - **Select Save Folder**: Use this to copy the ENTIRE save directory (Map + Players + Tribes). *Recommended for full migration.*
6. Click **Start Import**.

> [!IMPORTANT]
> A backup of your target server's existing save data will be created automatically before any files are overwritten.

## ✅ Verification
After importing:
1. Start your server.
2. Join the server.
3. You should wake up with your character and structures intact.
4. If you are prompted to create a new character, something may have gone wrong with the `LocalPlayer.arkprofile` renaming. You may need to manually rename your uploaded profile to your new SteamID on the server.

## ❌ Common Issues

- **"Map not loading"**: Ensure your server is configured to run the same map as your save file (e.g., TheIsland_WP).
- **"Character missing"**: Non-Dedicated saves often name the host file `LocalPlayer.arkprofile`. Dedicated servers expect the file to be named `[SteamID].arkprofile`. You may need to find your SteamID64 and rename this file manually if the automatic import doesn't catch it.
