# 🐛 ASA Server Manager v2.1.2 - Bug Fix Release

**Release Date:** January 13, 2026

---

## 🔧 Bug Fixes

### 🟢 Fix: GitHub Actions Build Workflow
**Issue:** CI/CD build workflow failed with "Unable to resolve action `tauri-apps/tauri-action@v2`" error.

**Cause:** The `tauri-apps/tauri-action` GitHub Action does not have a `v2` tag. Even though the project uses Tauri 2.0, the action itself is versioned at `v0`.

**Fix:** Updated `.github/workflows/build.yml` to use `tauri-apps/tauri-action@v0`.

---

## ✨ New Features

### 🎨 Enhanced Config Editor
- **Preset Selector** - Quick configuration presets for different server types
- **Array Editor** - Edit array-based config values with an intuitive UI
- **Config Tooltips** - Hover tooltips with descriptions for each setting
- **Code Editor Component** - Improved code editing experience

### 📥 Server Import Dialog
- **Import Server** - Import existing ARK server installations into the manager

---

## 📁 Files Changed
- `.github/workflows/build.yml` - Fixed tauri-action version from v2 to v0
- `src/components/config/ArrayEditor.tsx` - New array editing component
- `src/components/config/ConfigTooltip.tsx` - New tooltip component
- `src/components/config/PresetSelector.tsx` - New preset selector
- `src/components/server/ImportServerDialog.tsx` - New server import dialog
- `src/components/ui/CodeEditor.tsx` - New code editor component
- `src/data/presets.ts` - Configuration presets data
- `src/pages/ConfigEditor.tsx` - Enhanced config editor page
- `src/data/configMappings.ts` - Updated config mappings

---

## ⬇️ Download
Download the latest installer: **ASA Server Manager_2.1.2_x64-setup.exe**

---

## 🙏 Thank You
Thanks for using ASA Server Manager! Report any issues in our [Discord server](https://discord.gg/Pr69DHEnXJ).
