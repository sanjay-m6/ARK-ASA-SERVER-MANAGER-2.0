# In-Game Administrator & Cheat Commands Guide

This guide explains how to authenticate as a server administrator inside ARK: Survival Ascended (ASA) and ARK: Survival Evolved (ASE), execute admin cheat commands, and configure permanent admin whitelisting.

---

## 1. Setting Up Your Admin Password

Before you can log in as an administrator in-game, you must configure a `ServerAdminPassword` for your server.

1. In **ARK Server Manager**, go to your server's **Config Editor** or **Server Settings**.
2. Locate the **Admin Password** (`ServerAdminPassword`) field under **Server Settings**.
3. Choose a secure alphanumeric password (avoid special characters like `?` or `=` to prevent INI corruption).
4. Save and start your server.

---

## 2. In-Game Console Authentication (`enablecheats`)

Whenever you connect to your server, you can authenticate for that session using the in-game console.

### Opening the Console by Platform

* **PC (Steam / Windows):**
  * **ARK: Survival Ascended (ASA):** Press `ESC` → **Settings** → **Advanced** tab → Set **Console Access** to **ON**. Then press `~` (Tilde), `'` (Apostrophe), or `Tab` to open the console bar at the bottom.
  * **ARK: Survival Evolved (ASE):** Press `Tab` (press once for 1-line bar, twice for full console log) or `~` (Tilde).
* **Xbox Series X/S & Xbox One:**
  * Pause the game (`Menu` button), then press **`LB + RB + X + Y`** simultaneously.
* **PlayStation 5 & PlayStation 4:**
  * Pause the game (`Options` button), then press **`L1 + R1 + Square + Triangle`** simultaneously.

### The Authentication Command

Type the following command into the console and press **Enter** (or click **Request Admin** on consoles):

```text
enablecheats <YourServerAdminPassword>
```

> **Example:** If your password is `AdminSecret123`, type:
> ```text
> enablecheats AdminSecret123
> ```

Once entered, you will have administrator rights for that game session until you disconnect.

---

## 3. Essential Admin Commands Cheatsheet

Once authenticated, prefix admin commands with `cheat` or `admincheat`:

### Player Controls & Godmode
| Command | Effect |
| :--- | :--- |
| `cheat gcm` | **Creative Mode:** Grants god mode, infinite weight, all engrams, and free instant crafting. |
| `cheat god` | **Invincibility:** Protects player against all damage sources. |
| `cheat fly` | **Free Flight:** Allows moving freely in any direction without falling. |
| `cheat walk` | **Walk:** Disables fly/ghost mode and restores ground gravity. |
| `cheat ghost` | **Noclip:** Allows flying and phasing through walls, meshes, and terrain. |
| `cheat infinitestats` | Refills and locks Health, Stamina, Oxygen, Food, Water, and clears Torpor. |
| `cheat GiveCreativeModeToTarget` | Grants Creative Mode to the player character in your crosshair. |

### Dinosaurs & Taming
| Command | Effect |
| :--- | :--- |
| `cheat DoTame` | Instantly tames the creature in your crosshair with 100% effectiveness. |
| `cheat ForceTame` | Instantly tames the targeted creature and allows riding without a saddle. |
| `cheat DestroyWildDinos` | **Wild Dino Wipe:** Kills all untamed wild dinos to trigger map-wide fresh spawns. |
| `cheat Kill` | Kills the targeted creature or player in your crosshair. |
| `cheat DestroyMyTarget` | Instantly deletes targeted creature or structure without death cache. |

### Server & World Management
| Command | Effect |
| :--- | :--- |
| `cheat SaveWorld` | Forces the server to immediately write a world save to disk. |
| `cheat SetTimeOfDay 12:00` | Changes map time to noon (12:00 PM). |
| `cheat SetTimeOfDay 00:00` | Changes map time to midnight (12:00 AM). |
| `cheat Broadcast <message>` | Displays a full-screen notification banner to all connected players. |
| `cheat Teleport` | Teleports your survivor in the direction your crosshair is pointing. |

---

## 4. Permanent Admin Whitelist (Auto-Admin on Join)

To avoid typing `enablecheats` every time you log in, you can add your account ID to the dedicated server whitelist files:

### For ARK: Survival Ascended (ASA)
ASA uses 32-character crossplay **EOS Account IDs**:
1. Open your server's folder:
   ```text
   ShooterGame\Saved\AllowedCheaterAccountIDs.txt
   ```
2. Add your 32-character EOS ID (one ID per line).
3. Save the file and restart your server.

### For ARK: Survival Evolved (ASE)
ASE uses 17-digit **Steam64 IDs**:
1. Open your server's folder:
   ```text
   ShooterGame\Saved\AllowedCheaterSteamIDs.txt
   ```
   *(Or use the built-in **Player Management** tab in ARK Server Manager)*
2. Add your 17-digit Steam64 ID (one ID per line).
3. Save the file and restart your server.
