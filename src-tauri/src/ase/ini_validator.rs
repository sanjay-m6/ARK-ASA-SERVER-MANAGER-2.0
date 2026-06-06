use crate::ase::ini_parser::{IniDocument, IniLine};
use crate::AppState;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub file: String,
    pub section: String,
    pub key: Option<String>,
    pub severity: String, // "Error" or "Warning"
    pub message: String,
    pub line_number: Option<usize>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub is_valid: bool,
    pub issues: Vec<ValidationIssue>,
}

const GAME_INI_KEYS: &[&str] = &[
    "egghatchspeedmultiplier",
    "babymaturespeedmultiplier",
    "babycuddleintervalmultiplier",
    "babyimprintamountmultiplier",
    "matingintervalmultiplier",
    "babyfoodconsumptionspeedmultiplier",
    "babycuddlegraceperiodmultiplier",
    "babycuddleloseimprintqualityspeedmultiplier",
    "mutagenlevelboost",
    "mutagenlevelboost_bred",
    "maximprintlimit",
    "playerbasestatmultipliers",
    "perlevelstatsmultiplier_player",
    "perlevelstatsmultiplier_dinowild",
    "perlevelstatsmultiplier_dinotamed",
    "perlevelstatsmultiplier_dinotamed_add",
    "perlevelstatsmultiplier_dinotamed_affinity",
    "levelexperiencerampoverrides",
    "overridemaxexperiencepointsplayer",
    "overridemaxexperiencedino",
    "harvestresourceitemamountclassmultipliers",
    "dinospawnweightmultipliers",
    "dinoclassdamagemultipliers",
    "dinoclassresistancemultipliers",
    "tameddinoclassdamagemultipliers",
    "tameddinoclassresistancemultipliers",
    "npcreplacements",
    "preventdinotameclassnames",
    "excludedinoclasses",
    "overridenamedengramentries",
    "configoverrideitemcraftingcosts",
    "bdisablefriendlyfire",
    "maxfallspeedmultiplier",
    "configaddnpcspawnentriescontainer",
    "configoverridesupplycrateitems",
];

const GUS_KEYS: &[&str] = &[
    "sessionname",
    "serverpassword",
    "serveradminpassword",
    "maxplayers",
    "difficultyoffset",
    "overrideofficialdifficulty",
    "xpmultiplier",
    "tamingspeedmultiplier",
    "harvestamountmultiplier",
    "harvesthealthmultiplier",
    "resourcesrespawnperiodmultiplier",
    "itemstacksizemultiplier",
    "playercharacterfooddrainmultiplier",
    "playercharacterwaterdrainmultiplier",
    "playercharacterstaminadrainmultiplier",
    "playercharacterhealthrecoverymultiplier",
    "playerdamagemultiplier",
    "playerresistancemultiplier",
    "playerharvestingdamagemultiplier",
    "craftingskillbonusmultiplier",
    "dinocharacterfooddrainmultiplier",
    "dinocharacterhealthrecoverymultiplier",
    "dinodamagemultiplier",
    "dinoresistancemultiplier",
    "maxtameddinos",
    "dinocountmultiplier",
    "wilddinotorpordrainmultiplier",
    "tameddinotorpordrainmultiplier",
    "passivetameintervalmultiplier",
    "usesingleplayersettings",
    "disabledinobreeding",
    "allowunclaimdinos",
    "usedinolevelupanimations",
    "maxpersonaltameddinos",
    "personaltameddinossaddlestructurecost",
    "themaxstructuresinrange",
    "structuredamagemultiplier",
    "structureresistancemultiplier",
    "perplatformmaxstructuresmultiplier",
    "autodestroydecayeddinos",
    "disablestructuredecaypve",
    "pveallowstructuresatsupplydrops",
    "forceallstructurelocking",
    "autodestroyoldstructuresmultiplier",
    "structurepickuptimeafterplacement",
    "structurepickupholdduration",
    "allowintegratedsplusstructures",
    "ignorelimitmaxstructuresinrangetypeflag",
    "ignorestructurespreventionvolumes",
    "serverpve",
    "allowcavebuildingpvp",
    "disablerailgunpvp",
    "enablepvpgamma",
    "pvpstructuredecay",
    "pvpdinodecay",
    "globalpoweredbatterydurabilitydecreasepersecond",
    "allowthirdpersonplayer",
    "servercrosshair",
    "showmapplayerlocation",
    "allowflyercarrypve",
    "disableweatherfog",
    "allowanyonebabyimprintcuddle",
    "allowhitmarkers",
    "enableextrastructurepreventionvolumes",
    "showfloatingdamagetext",
    "forceflyerexplosives",
    "preventtribealliances",
    "allowtribealliance",
    "allowtribewarfare",
    "maxtribelogs",
    "maxnumberofplayersintribe",
    "maxtributedinos",
    "maxtributeitems",
    "notributedownloads",
    "preventdownloadsurvivors",
    "preventdownloaditems",
    "preventdownloaddinos",
    "preventuploadsurvivors",
    "preventuploaditems",
    "preventuploaddinos",
    "disablecustomfoldersintributeinventories",
    "crossarkallowforeigndinodownloads",
    "daycyclespeedscale",
    "daytimespeedscale",
    "nighttimespeedscale",
    "spoilingtimemultiplier",
    "itemdecompositiontimemultiplier",
    "corpsedecompositiontimemultiplier",
    "cropgrowthspeedmultiplier",
    "cropdecayspeedmultiplier",
    "layeggintervalmultiplier",
    "poopintervalmultiplier",
    "hairgrowthspeedmultiplier",
    "customrecipeeffectivenessmultiplier",
    "customrecipeskillmultiplier",
    "fishinglootqualitymultiplier",
    "supplycratelootqualitymultiplier",
    "globalspoilingtimemultiplier",
    "globalitemdecompositiontimemultiplier",
    "globalcorpsedecompositiontimemultiplier",
    "killxpmultiplier",
    "harvestxpmultiplier",
    "craftxpmultiplier",
    "genericxpmultiplier",
    "specialxpmultiplier",
    "maxhexagonspercharacter",
    "hexagonrewardmultiplier",
    "autounlockallengrams",
    "onlyallowspecifiedengrams",
    "rconenabled",
    "rconport",
    "battleeyeenforcer",
    "enablecreativemode",
    "serverforcenohud",
    "kickidleplayerperiod",
    "destroytamesoverlevelclamp",
    "activemods",
    "autosaveperiodminutes",
    "activeevent",
    "eventcolorschanceoverride",
    "badwordfilter",
    "adminlist",
    "customdynamicconfigurl",
    "customlivetuningurl",
    "usesecurespawnrules",
    "useitemdupecheck",
    "securesendarkpayload",
    "culture",
    "launcherargs",
    "useallavailablecores",
    "uselowmemory",
    "nobattleeye",
    "ragnarokvolcanointensity",
    "ragnarokvolcanointerval",
    "enableragnaroksettings",
    "usefjordurtraversalbuff",
    "enablefjordursettings",
    "adjustablemutagenspawndelaymultiplier",
    "maxdifficulty",
    "preventofflinepvp",
    "preventofflinepvpinterval",
    "bdisablestructureplacementcollision",
    "busecorpselocator",
    "bshowstatustypes",
    "ballowunlimitedrespecs",
    "spectatorpassword",
];

// Array keys that can be duplicated legally in Game.ini
const LEGITIMATE_ARRAY_KEYS: &[&str] = &[
    "HarvestResourceItemAmountClassMultipliers",
    "LevelExperienceRampOverrides",
    "DinoSpawnWeightMultipliers",
    "DinoClassDamageMultipliers",
    "DinoClassResistanceMultipliers",
    "TamedDinoClassDamageMultipliers",
    "TamedDinoClassResistanceMultipliers",
    "NPCReplacements",
    "PreventDinoTameClassNames",
    "ExcludeDinoClasses",
    "OverrideNamedEngramEntries",
    "ConfigOverrideItemCraftingCosts",
    "ConfigAddNPCSpawnEntriesContainer",
    "ConfigOverrideSupplyCrateItems",
];

fn get_config_path(install_path: &str) -> PathBuf {
    PathBuf::from(install_path)
        .join("ShooterGame")
        .join("Saved")
        .join("Config")
        .join("WindowsServer")
}

#[tauri::command]
pub async fn validate_ase_config(
    server_id: i64,
    state: State<'_, AppState>,
) -> Result<ValidationResult, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.get_connection().map_err(|e| e.to_string())?;

    let install_path: String = conn
        .query_row(
            "SELECT install_path FROM ase_servers WHERE id = ?1",
            [server_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Server not found: {}", e))?;

    let config_dir = get_config_path(&install_path);
    let gus_path = config_dir.join("GameUserSettings.ini");
    let game_ini_path = config_dir.join("Game.ini");

    let mut issues = Vec::new();

    // 1. Validate GameUserSettings.ini
    if gus_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&gus_path) {
            validate_file(&content, "GameUserSettings.ini", &mut issues);
        }
    }

    // 2. Validate Game.ini
    if game_ini_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&game_ini_path) {
            validate_file(&content, "Game.ini", &mut issues);
        }
    }

    let is_valid = issues.iter().all(|issue| issue.severity != "Error");

    Ok(ValidationResult { is_valid, issues })
}

fn validate_file(content: &str, filename: &str, issues: &mut Vec<ValidationIssue>) {
    let doc = IniDocument::parse(content);
    let mut current_section = String::from("__root__");
    let mut seen_keys: HashMap<String, HashSet<String>> = HashMap::new(); // section -> keys

    for (idx, line) in doc.lines.iter().enumerate() {
        let line_num = idx + 1;
        match line {
            IniLine::SectionHeader { name, .. } => {
                current_section = name.clone();
            }
            IniLine::Entry { key, value, .. } => {
                let key_lower = key.to_lowercase();

                // Check 1: Balanced parentheses
                let open_parens = value.chars().filter(|&c| c == '(').count();
                let close_parens = value.chars().filter(|&c| c == ')').count();
                if open_parens != close_parens {
                    issues.push(ValidationIssue {
                        file: filename.to_string(),
                        section: current_section.clone(),
                        key: Some(key.clone()),
                        severity: "Error".to_string(),
                        message: format!(
                            "Unbalanced parentheses: found {} '(' and {} ')'",
                            open_parens, close_parens
                        ),
                        line_number: Some(line_num),
                    });
                }

                // Check 2: Balanced quotes
                let quotes = value.chars().filter(|&c| c == '"').count();
                if quotes % 2 != 0 {
                    issues.push(ValidationIssue {
                        file: filename.to_string(),
                        section: current_section.clone(),
                        key: Some(key.clone()),
                        severity: "Error".to_string(),
                        message: format!("Unbalanced quotes: found odd number of quotes ({})", quotes),
                        line_number: Some(line_num),
                    });
                }

                // Check 3: Wrong file placement
                if filename == "GameUserSettings.ini" {
                    // Check if key belongs in Game.ini
                    if GAME_INI_KEYS.contains(&key_lower.as_str()) {
                        issues.push(ValidationIssue {
                            file: filename.to_string(),
                            section: current_section.clone(),
                            key: Some(key.clone()),
                            severity: "Warning".to_string(),
                            message: format!(
                                "Key '{}' belongs to Game.ini and is ignored in GameUserSettings.ini",
                                key
                            ),
                            line_number: Some(line_num),
                        });
                    }
                } else if filename == "Game.ini" {
                    // Check if key belongs in GameUserSettings.ini
                    if GUS_KEYS.contains(&key_lower.as_str()) {
                        issues.push(ValidationIssue {
                            file: filename.to_string(),
                            section: current_section.clone(),
                            key: Some(key.clone()),
                            severity: "Warning".to_string(),
                            message: format!(
                                "Key '{}' belongs to GameUserSettings.ini and is ignored in Game.ini",
                                key
                            ),
                            line_number: Some(line_num),
                        });
                    }
                }

                // Check 4: Duplicate keys in the same section
                let is_legit_array = LEGITIMATE_ARRAY_KEYS
                    .iter()
                    .any(|&k| k.to_lowercase() == key_lower);

                if !is_legit_array {
                    let section_keys = seen_keys.entry(current_section.clone()).or_default();
                    if section_keys.contains(&key_lower) {
                        issues.push(ValidationIssue {
                            file: filename.to_string(),
                            section: current_section.clone(),
                            key: Some(key.clone()),
                            severity: "Warning".to_string(),
                            message: format!(
                                "Duplicate key '{}' in section '[{}]' (first entry will be overwritten)",
                                key, current_section
                            ),
                            line_number: Some(line_num),
                        });
                    } else {
                        section_keys.insert(key_lower.clone());
                    }
                }

                // Check 5: Section verification for known keys
                let section_lower = current_section.to_lowercase();
                if filename == "GameUserSettings.ini" {
                    // SessionName must be in ServerSettings or SessionSettings
                    if key_lower == "sessionname"
                        && section_lower != "serversettings"
                        && section_lower != "sessionsettings"
                    {
                        issues.push(ValidationIssue {
                            file: filename.to_string(),
                            section: current_section.clone(),
                            key: Some(key.clone()),
                            severity: "Warning".to_string(),
                            message: format!(
                                "Key '{}' should be in '[ServerSettings]' or '[SessionSettings]' but is in '[{}]'",
                                key, current_section
                            ),
                            line_number: Some(line_num),
                        });
                    }
                    // MaxPlayers must be in ServerSettings or /Script/Engine.GameSession
                    if key_lower == "maxplayers"
                        && section_lower != "serversettings"
                        && section_lower != "/script/engine.gamesession"
                    {
                        issues.push(ValidationIssue {
                            file: filename.to_string(),
                            section: current_section.clone(),
                            key: Some(key.clone()),
                            severity: "Warning".to_string(),
                            message: format!(
                                "Key '{}' should be in '[ServerSettings]' or '[/Script/Engine.GameSession]' but is in '[{}]'",
                                key, current_section
                            ),
                            line_number: Some(line_num),
                        });
                    }
                    // Message and Duration must be in MessageOfTheDay
                    if (key_lower == "message" || key_lower == "duration")
                        && section_lower != "messageoftheday"
                    {
                        issues.push(ValidationIssue {
                            file: filename.to_string(),
                            section: current_section.clone(),
                            key: Some(key.clone()),
                            severity: "Warning".to_string(),
                            message: format!(
                                "Key '{}' should be in '[MessageOfTheDay]' but is in '[{}]'",
                                key, current_section
                            ),
                            line_number: Some(line_num),
                        });
                    }
                } else if filename == "Game.ini" {
                    // All standard Game.ini keys should be in /Script/ShooterGame.ShooterGameMode
                    if GAME_INI_KEYS.contains(&key_lower.as_str())
                        && section_lower != "/script/shootergame.shootergamemode"
                    {
                        issues.push(ValidationIssue {
                            file: filename.to_string(),
                            section: current_section.clone(),
                            key: Some(key.clone()),
                            severity: "Warning".to_string(),
                            message: format!(
                                "Key '{}' should be in '[/Script/ShooterGame.ShooterGameMode]' but is in '[{}]'",
                                key, current_section
                            ),
                            line_number: Some(line_num),
                        });
                    }
                }
            }
            _ => {}
        }
    }
}
