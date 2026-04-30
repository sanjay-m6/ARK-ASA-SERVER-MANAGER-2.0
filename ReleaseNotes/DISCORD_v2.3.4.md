# Discord Announcement — v2.3.4

Copy the text below and paste it into your Discord #announcements channel.
Discord supports markdown formatting natively.

---

```
@everyone

# 🔐 ARK ASA Server Manager — v2.3.4 Hotfix Release

> **Release Date:** April 30, 2026
> **Priority:** 🔴 Critical — Password Security Fix
> **Download:** https://github.com/sanjay-m6/ARK-ASA-SERVER-MANAGER-2.0/releases/tag/v2.3.4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🐛 CRITICAL BUG FIX — Password Corruption

A critical bug was discovered where **server passwords were being merged together** during startup, causing the Admin Password to become corrupted.

### What Was Happening
```
❌ Before Fix:
   Server Password:  Ark123
   Admin Password:   Admin123

   After startup → Admin Password becomes:
   "Admin123?ServerPassword=Ark123"  ← CORRUPTED
```

### What We Fixed
```
✅ After Fix:
   Server Password:  Ark123     ← stays clean
   Admin Password:   Admin123   ← stays clean
   
   Both passwords remain completely separate.
```

### Root Cause
The startup command builder was incorrectly concatenating `ServerAdminPassword` and `ServerPassword` into a single query string instead of treating them as isolated parameters.

### Fix Applied at 3 Layers
- 🔧 **Startup Arguments** — Sanitized password parameters before building launch URL
- 🔧 **Config Sync** — Stripped corrupted data when reading/writing to database
- 🔧 **INI Generation** — Passwords now written unconditionally (supports clearing)

### 🔄 Auto-Repair (No Action Needed!)
If your server had corrupted passwords from previous versions, they will be **automatically detected and repaired** when you open the manager. Just hit **Save** to persist the fix.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🔒 Password Security Improvements

- Passwords are now **masked by default** (shows `••••••••`)
- Added **Show/Hide toggle** (👁️ Eye icon) on both password fields
- You can now **change or clear passwords anytime** without issues
- Clearing a password field and saving properly removes it from the config

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🎨 Advanced Configuration — UI Overhaul

The **Advanced Rules** tab in Config Editor has been completely rebuilt:

### Event Profiles
- ✅ Saved profiles now show in a **selectable list** with LIVE badge
- ✅ **New Profile** button for quick creation
- ✅ Event Mode toggle with clear **ACTIVE/INACTIVE** status indicator
- ✅ Profile name editor with instant save

### Multiplier Controls
- ✅ New **MultiplierSlider** component with visual fill bars
- ✅ **Inline numeric inputs** for precise value editing
- ✅ Color-coded sliders (Indigo/Emerald/Red/Amber)
- ✅ Descriptions under each slider explaining the effect

### Transfer Policy
- ✅ Visual **disabled states** when policy is turned off
- ✅ Better textarea placeholders with example Blueprint Paths
- ✅ Improved Max Quantity slider with same premium design

### General
- ✅ **Toast notifications** on all save/toggle actions
- ✅ **Loading spinners** on async buttons
- ✅ Polished tab navigation matching existing design system

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📦 Files Changed

```
src-tauri/src/commands/config.rs           → Auto-repair corrupted passwords
src-tauri/src/services/config_generator.rs → Unconditional password writing
src-tauri/src/services/process_manager.rs  → Launch argument sanitization
src/components/config/ConfigBuilder.tsx    → Masked password inputs
src/components/server/AdvancedConfigDashboard.tsx → Full UI rebuild
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ⬆️ How to Update

1. Download the latest `.msi` from the **Releases** page
2. Run the installer — it will upgrade in-place
3. Open the manager → Your passwords will be auto-repaired
4. Click **Save** in Config Editor to persist the fix

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> 💬 Found a bug? Report it in #bug-reports
> 💡 Have a suggestion? Post in #suggestions
> ⭐ Enjoying the manager? Star us on GitHub!
```
