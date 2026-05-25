import React, { useState, useEffect, useMemo, memo, useRef } from 'react';
import { FileEdit, Save, RotateCcw, ChevronDown, CheckSquare, Settings2, Users, Flame, Hammer, MonitorPlay, Search, Shield, Globe, Cpu, Map, Download, FileText, Database } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import ServerSelect from '../../components/ui/ServerSelect';
import { readAseConfig, writeAseConfig } from '../utils/aseCommands';
import { AseGameConfig } from '../types/ase.types';
import { EngramOverridesEditor } from '../../components/config/EngramOverridesEditor';
import { CraftingCostEditor } from '../../components/config/CraftingCostEditor';
import { cn } from '../../utils/helpers';

const defaultConfig: AseGameConfig = {
  // Identity
  sessionName: 'My ASE Server', serverPassword: '', serverAdminPassword: 'admin123', maxPlayers: 70,
  // Difficulty
  difficultyOffset: 1.0, overrideOfficialDifficulty: 5.0, MaxDifficulty: false,
  // Core Rates
  xpMultiplier: 1.0, tamingSpeedMultiplier: 1.0, harvestAmountMultiplier: 1.0, harvestHealthMultiplier: 1.0,
  resourcesRespawnPeriodMultiplier: 1.0, itemStackSizeMultiplier: 1.0,
  // Player Stats
  playerCharacterFoodDrainMultiplier: 1.0, playerCharacterWaterDrainMultiplier: 1.0, playerCharacterStaminaDrainMultiplier: 1.0,
  playerCharacterHealthRecoveryMultiplier: 1.0, playerDamageMultiplier: 1.0, playerResistanceMultiplier: 1.0,
  // Dino Stats
  dinoCharacterFoodDrainMultiplier: 1.0, dinoCharacterHealthRecoveryMultiplier: 1.0, dinoDamageMultiplier: 1.0,
  dinoResistanceMultiplier: 1.0, maxTamedDinos: 5000, dinoCountMultiplier: 1.0, wildDinoTorporDrainMultiplier: 1.0,
  tamedDinoTorporDrainMultiplier: 1.0, passiveTameIntervalMultiplier: 1.0, useSingleplayerSettings: false,
  disableDinoBreeding: false, allowUnclaimDinos: false, useDinoLevelUpAnimations: true, maxPersonalTamedDinos: 40,
  personalTamedDinosSaddleStructureCost: 0.0,
  // Breeding
  eggHatchSpeedMultiplier: 1.0, babyMatureSpeedMultiplier: 1.0, babyCuddleIntervalMultiplier: 1.0,
  babyImprintAmountMultiplier: 1.0, matingIntervalMultiplier: 1.0, babyFoodConsumptionSpeedMultiplier: 1.0,
  babyCuddleGracePeriodMultiplier: 1.0, babyCuddleLoseImprintQualitySpeedMultiplier: 1.0, mutagenLevelBoost: 5,
  mutagenLevelBoostBred: 1, maxImprintLimit: 1.0,
  // Structures
  theMaxStructuresInRange: 10500, structureDamageMultiplier: 1.0, structureResistanceMultiplier: 1.0,
  perPlatformMaxStructuresMultiplier: 1.0, autoDestroyDecayedDinos: false, disableStructureDecayPve: false,
  pveAllowStructuresAtSupplyDrops: false, forceAllStructureLocking: false, autoDestroyOldStructuresMultiplier: 0.0,
  structurePickupTimeAfterPlacement: 30.0, structurePickupHoldDuration: 0.5, allowIntegratedSpinetAttachment: true,
  ignoreLimitMaxStructuresInRangeTypeFlag: false, ignoreStructuresPreventionVolumes: false, bDisableStructurePlacementCollision: false,
  // PvP Rules
  serverPve: false, allowCaveBuildingPvp: false, disableRailgunPvp: false, enablePvpGamma: false,
  pvpStructureDecay: false, pvpDinoDecay: false, globalPoweredBatteryDurabilityDecreasePerSecond: 4.0,
  PreventOfflinePvP: false, PreventOfflinePvPInterval: 900,
  // Player Rules
  allowThirdPersonPlayer: true, serverCrosshair: true, showMapPlayerLocation: true, allowFlyerCarryPve: false,
  disableWeatherFog: false, allowAnyoneBabyImprintCuddle: false, allowHitMarkers: true, enableExtraStructurePreventionVolumes: false,
  showFloatingDamageText: false, forceFlyerexplosives: false, bUseCorpseLocator: true, bShowStatusTypes: true,
  bAllowUnlimitedRespecs: false,
  // Tribe Settings
  preventTribeAlliances: false, allowTribeAlliance: true, allowTribeWarfare: false, maxTribeLogs: 100, maxNumberOfPlayersInTribe: 0,
  // Tribute / Transfer
  maxTributeDinos: 20, maxTributeItems: 50, noTributeDownloads: false, preventDownloadSurvivors: false,
  preventDownloadItems: false, preventDownloadDinos: false, preventUploadSurvivors: false, preventUploadItems: false,
  preventUploadDinos: false, disableCustomFoldersInTributeInventories: false, crossarkAllowForeignDinoDownloads: false,
  // Environment
  dayCycleSpeedScale: 1.0, dayTimeSpeedScale: 1.0, nightTimeSpeedScale: 1.0, spoilingTimeMultiplier: 1.0,
  itemDecompositionTimeMultiplier: 1.0, corpseDecompositionTimeMultiplier: 1.0, cropGrowthSpeedMultiplier: 1.0,
  cropDecaySpeedMultiplier: 1.0, layEggIntervalMultiplier: 1.0, poopIntervalMultiplier: 1.0, hairGrowthSpeedMultiplier: 1.0,
  customRecipeEffectivenessMultiplier: 1.0, customRecipeSkillMultiplier: 1.0, fishingLootQualityMultiplier: 1.0,
  supplyCrateLootQualityMultiplier: 1.0, globalSpoilingTimeMultiplier: 1.0, globalItemDecompositionTimeMultiplier: 1.0,
  globalCorpseDecompositionTimeMultiplier: 1.0, killXpMultiplier: 1.0, harvestXpMultiplier: 1.0, craftXpMultiplier: 1.0,
  genericXpMultiplier: 1.0, specialXpMultiplier: 1.0,
  // Hexagons
  maxHexagonsPerCharacter: 2000000.0, hexagonRewardMultiplier: 1.0,
  // Engrams
  autoUnlockAllEngrams: false, onlyAllowSpecifiedEngrams: false, overrideNamedEngramEntries: '', configOverrideItemCraftingCosts: '',
  // Network / Admin
  rconEnabled: true, rconPort: 27020, battleEyeEnforcer: true, enableCreativeMode: false, serverForceNoHud: false,
  kickIdlePlayerPeriod: 3600.0, destroyTamesOverLevelClamp: 0, SpectatorPassword: '',
  // Mods & MOTD & Auto-save
  activeMods: '', motd: '', motdDuration: 20, autoSavePeriodMinutes: 15.0,
  // Events
  activeEvent: '', eventColorsChanceOverride: 0.0,
  // Administration
  badWordFilter: '', adminList: '', customDynamicConfigUrl: '', customLiveTuningUrl: '', useSecureSpawnRules: false,
  useItemDupeCheck: false, secureSendArkPayload: false, culture: '',
  // Launcher
  launcherArgs: '', useAllAvailableCores: true, useLowMemory: false, noBattleEye: false,
  // Specific Maps
  ragnarokVolcanoIntensity: 1.0, ragnarokVolcanoInterval: 0.0, enableRagnarokSettings: false,
  useFjordurTraversalBuff: true, enableFjordurSettings: false, adjustableMutagenSpawnDelayMultiplier: 1.0,
  // Chat & Voice
  globalVoiceChat: false, proximityVoiceChat: false, alwaysNotifyPlayerJoined: false, alwaysNotifyPlayerLeft: false, serverAdminCommandLogging: false,
  // PvP & PvE Advanced
  bDisableFriendlyFire: false, allowCryoCooldownOnPvE: false, disableCryopodEnemyCheck: false, pvpZoneStructureDamageMultiplier: 6.0, structureDamageRepairCooldown: 180.0,
  // Player Stats / Diseases / Food / Flyer
  nonPermanentDiseases: false, preventDiseases: false, tamedDinoCharacterFoodDrainMultiplier: 1.0, wildDinoCharacterFoodDrainMultiplier: 1.0, allowFlyingStaminaRecovery: false,
  // Core Rates
  clampResourceHarvestDamage: false, optimizedHarvestingHealth: false, tamedDinoHarvestingDamageMultiplier: 1.0, dinoTurretDamageMultiplier: 1.0,
  // Structures & Decay
  structureDecayPeriodMultiplier: 1.0, pveDinoDecayPeriodMultiplier: 1.0, fastDecayUnsnappedCoreStructures: false, bAllowPlatformSaddleMultiFloors: false, flyerPlatformMaxStructuresMultiplier: 1.0
};

type ConfigFile = 'GameUserSettings.ini' | 'Game.ini';
type TabType = 'general' | 'rates' | 'player' | 'breeding' | 'structures' | 'pvp' | 'tribe' | 'transfer' | 'environment' | 'engrams' | 'admin' | 'advanced' | 'search';

const FieldWrapper = memo(({ label, description, children, file }: { label: string; description?: string; children: React.ReactNode; file?: string }) => {
  return (
    <div className="bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-white/5 transition-all duration-300 hover:scale-[1.01] hover:border-amber-500/30 hover:shadow-[0_8px_30px_rgba(245,158,11,0.1)] group relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="flex-1 min-w-0 z-10">
        <div className="text-white font-semibold tracking-wide flex items-center gap-2 mb-1.5">{label}</div>
        {description && <div className="text-xs text-slate-400 leading-relaxed font-medium">{description}</div>}
        {file && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] uppercase font-bold text-amber-500/80">
            {file}
          </div>
        )}
      </div>
      <div className="w-full sm:w-64 shrink-0 z-10">{children}</div>
    </div>
  );
});
FieldWrapper.displayName = 'FieldWrapper';

const Toggle = memo(({ label, value, onChange, desc, file }: { label: string; value: boolean; onChange: (v: boolean) => void; desc?: string; file?: string }) => (
  <FieldWrapper label={label} description={desc} file={file}>
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "relative w-16 h-8 rounded-full transition-all duration-300 focus:outline-none flex-shrink-0 ml-auto block",
        value
          ? "bg-gradient-to-r from-amber-500 to-orange-600 shadow-[0_0_15px_rgba(245,158,11,0.4)]"
          : "bg-slate-800 border border-white/10"
      )}
    >
      <span
        className={cn(
          "block w-6 h-6 rounded-full bg-white shadow-lg transform transition-all duration-300",
          value ? "translate-x-9" : "translate-x-1"
        )}
      />
    </button>
  </FieldWrapper>
));
Toggle.displayName = 'Toggle';

const NumberInput = memo(({ label, value, onChange, desc, step = 1, file }: { label: string; value: number; onChange: (v: number) => void; desc?: string; step?: number; file?: string }) => {
  const [localValue, setLocalValue] = useState<string>(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setLocalValue(e.target.value);

  const handleBlur = () => {
    const num = Number(localValue);
    if (!isNaN(num)) onChange(num);
    else setLocalValue(String(value));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  return (
    <FieldWrapper label={label} description={desc} file={file}>
      <input
        type="number"
        step={step}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 font-mono transition-all text-sm placeholder-slate-600"
      />
    </FieldWrapper>
  );
});
NumberInput.displayName = 'NumberInput';

const TextInput = memo(({ label, value, onChange, desc, placeholder, file }: { label: string; value: string; onChange: (v: string) => void; desc?: string; placeholder?: string; file?: string }) => {
  const [localValue, setLocalValue] = useState<string>(value || '');

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setLocalValue(e.target.value);
  const handleBlur = () => onChange(localValue);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  return (
    <FieldWrapper label={label} description={desc} file={file}>
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 font-mono transition-all text-sm placeholder-slate-600"
      />
    </FieldWrapper>
  );
});
TextInput.displayName = 'TextInput';

const SelectInput = memo(({ label, value, onChange, desc, options, file }: { label: string; value: string; onChange: (v: string) => void; desc?: string; options: { label: string; value: string }[]; file?: string }) => (
  <FieldWrapper label={label} description={desc} file={file}>
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer text-sm font-medium"
      >
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  </FieldWrapper>
));
SelectInput.displayName = 'SelectInput';

export default function ASEConfigEditor() {
  const { servers } = useAseServerStore();
  const [selectedServer, setSelectedServer] = useState<number | null>(servers[0]?.id || null);
  const [config, setConfig] = useState<AseGameConfig>(defaultConfig);
  const [activeFile, setActiveFile] = useState<ConfigFile>('GameUserSettings.ini');
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [isDirty, setIsDirty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (selectedServer) loadConfig(selectedServer);
  }, [selectedServer]);

  const loadConfig = async (id: number) => {
    try {
      const c = await readAseConfig(id);
      setConfig({ ...defaultConfig, ...c });
      setIsDirty(false);
    } catch {
      setConfig(defaultConfig);
    }
  };

  const handleSave = async () => {
    if (!selectedServer) return;
    try {
      await writeAseConfig(selectedServer, config);
      setIsDirty(false);
      toast.success('Configuration saved successfully', {
        style: { background: '#10b981', color: '#fff', borderRadius: '12px' }
      });
    } catch (e) {
      toast.error(`Failed to save config: ${e}`);
    }
  };

  const update = (key: keyof AseGameConfig, val: any) => {
    setConfig(prev => ({ ...prev, [key]: val }));
    setIsDirty(true);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportIni = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      parseIniContent(content);
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const parseIniContent = (content: string) => {
    const lines = content.split('\n');
    const newConfig = { ...config };
    let importedCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('[') || trimmed.startsWith(';')) continue;
      
      const equalsIdx = trimmed.indexOf('=');
      if (equalsIdx === -1) continue;
      
      const key = trimmed.substring(0, equalsIdx).trim();
      let valStr = trimmed.substring(equalsIdx + 1).trim();
      
      const field = schema.find(f => f.key === key);
      if (field) {
        let parsedVal: any = valStr;
        
        if (typeof parsedVal === 'string' && parsedVal.startsWith('"') && parsedVal.endsWith('"')) {
           parsedVal = parsedVal.substring(1, parsedVal.length - 1);
        }

        if (field.type === 'number') {
          parsedVal = parseFloat(valStr);
          if (isNaN(parsedVal)) continue;
        } else if (field.type === 'toggle') {
          parsedVal = valStr.toLowerCase() === 'true' || valStr === '1';
        }
        
        (newConfig as any)[key] = parsedVal;
        importedCount++;
      }
    }
    
    if (importedCount > 0) {
      setConfig(newConfig as AseGameConfig);
      setIsDirty(true);
      toast.success(`Imported ${importedCount} settings from INI`, { style: { background: '#10b981', color: '#fff' }});
    } else {
      toast.error('No matching settings found in the file');
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'rates', label: 'Rates & Multipliers', icon: <Flame className="w-4 h-4" /> },
    { id: 'player', label: 'Player & Dino', icon: <Users className="w-4 h-4" /> },
    { id: 'breeding', label: 'Breeding', icon: <CheckSquare className="w-4 h-4" /> },
    { id: 'structures', label: 'Structures', icon: <Hammer className="w-4 h-4" /> },
    { id: 'pvp', label: 'PvP Rules', icon: <Shield className="w-4 h-4" /> },
    { id: 'tribe', label: 'Tribe & Alliances', icon: <Users className="w-4 h-4" /> },
    { id: 'transfer', label: 'Tribute & Transfer', icon: <Globe className="w-4 h-4" /> },
    { id: 'environment', label: 'Environment', icon: <Map className="w-4 h-4" /> },
    { id: 'engrams', label: 'Engrams & Crafting', icon: <Hammer className="w-4 h-4" /> },
    { id: 'admin', label: 'Administration', icon: <MonitorPlay className="w-4 h-4" /> },
    { id: 'advanced', label: 'Advanced', icon: <Cpu className="w-4 h-4" /> },
  ];

  const schema = useMemo(() => [
    // GENERAL - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'general', type: 'text', key: 'sessionName', label: 'Session Name', desc: 'The name displayed in the server browser' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'text', key: 'serverPassword', label: 'Server Password', desc: 'Leave blank for open server' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'text', key: 'serverAdminPassword', label: 'Admin Password', desc: 'Used for in-game admin commands' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'number', key: 'maxPlayers', label: 'Max Players' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'serverPve', label: 'PvE Mode', desc: 'Disables player vs player combat and structure damage' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'rconEnabled', label: 'Enable RCON' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'number', key: 'rconPort', label: 'RCON Port' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'battleEyeEnforcer', label: 'BattlEye Anti-Cheat', desc: 'Requires client restart if changed' },

    // RATES - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'xpMultiplier', label: 'XP Multiplier', desc: 'Global experience gain rate', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'tamingSpeedMultiplier', label: 'Taming Speed', desc: 'Faster taming process', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'harvestAmountMultiplier', label: 'Harvest Amount', desc: 'Amount of resources gathered per hit', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'harvestHealthMultiplier', label: 'Harvest Node Health', desc: 'Durability of resource nodes', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'resourcesRespawnPeriodMultiplier', label: 'Resource Respawn Period', desc: 'Lower means faster respawn', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'itemStackSizeMultiplier', label: 'Item Stack Size', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'difficultyOffset', label: 'Difficulty Offset', desc: 'Base difficulty scale (0.0 - 1.0)', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'overrideOfficialDifficulty', label: 'Override Official Difficulty', desc: 'Max wild dino level multiplier (e.g. 5.0 = lvl 150)', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'toggle', key: 'MaxDifficulty', label: 'Max Difficulty', desc: 'Forces max wild dino level to 150' },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'toggle', key: 'clampResourceHarvestDamage', label: 'Clamp Resource Harvest Damage', desc: 'Clamps harvesting damage to node health' },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'toggle', key: 'optimizedHarvestingHealth', label: 'Optimized Harvesting Health', desc: 'Optimizes resource node health for harvesting' },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'tamedDinoHarvestingDamageMultiplier', label: 'Tamed Dino Harvest Damage', desc: 'Multiplier for resources harvested by tamed dinos', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'dinoTurretDamageMultiplier', label: 'Dino Turret Damage Multiplier', desc: 'Multiplier for damage dealt to dinos by turrets', step: 0.1 },

    // PLAYER - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'allowThirdPersonPlayer', label: 'Allow Third Person' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'serverCrosshair', label: 'Show Crosshair' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'showMapPlayerLocation', label: 'Show Player on Map' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerCharacterFoodDrainMultiplier', label: 'Player Food Drain', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerCharacterWaterDrainMultiplier', label: 'Player Water Drain', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerCharacterStaminaDrainMultiplier', label: 'Player Stamina Drain', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerCharacterHealthRecoveryMultiplier', label: 'Player Health Recovery', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerResistanceMultiplier', label: 'Player Resistance', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerDamageMultiplier', label: 'Player Damage', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'nonPermanentDiseases', label: 'Non-Permanent Diseases', desc: 'Diseases will be cured upon respawning' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'preventDiseases', label: 'Prevent Diseases', desc: 'Completely disables sickness and swamp fever' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'bUseCorpseLocator', label: 'Use Corpse Locator', desc: 'Shows a green beam of light indicating where you died' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'bShowStatusTypes', label: 'Show Status Types', desc: 'Shows buffs/debuffs icons on the HUD' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'bAllowUnlimitedRespecs', label: 'Allow Unlimited Respecs', desc: 'Allows consuming Mindwipe Tonic without cooldown' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'showFloatingDamageText', label: 'Show Floating Damage Text', desc: 'Displays RPG-style damage numbers' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'allowFlyingStaminaRecovery', label: 'Flyer Stamina Recovery', desc: 'Allows flyers to regain stamina when standing on top of them in mid-air' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'allowFlyerCarryPve', label: 'Allow Flyer Carry in PvE' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'dinoDamageMultiplier', label: 'Dino Damage', desc: 'Global wild/tamed damage multiplier', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'dinoResistanceMultiplier', label: 'Dino Resistance', desc: 'Lower means dinos take less damage', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'dinoCharacterFoodDrainMultiplier', label: 'Dino Food Drain', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'dinoCharacterHealthRecoveryMultiplier', label: 'Dino Health Recovery', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'wildDinoTorporDrainMultiplier', label: 'Wild Dino Torpor Drain', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'tamedDinoTorporDrainMultiplier', label: 'Tamed Dino Torpor Drain', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'tamedDinoCharacterFoodDrainMultiplier', label: 'Tamed Dino Food Drain', desc: 'Multiplier for tamed dino food consumption rate', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'wildDinoCharacterFoodDrainMultiplier', label: 'Wild Dino Food Drain', desc: 'Multiplier for wild dino food consumption rate', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'dinoCountMultiplier', label: 'Dino Count Multiplier', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'maxTamedDinos', label: 'Max Tamed Dinos (Global)' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'maxPersonalTamedDinos', label: 'Max Personal Tamed Dinos' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'allowUnclaimDinos', label: 'Allow Unclaim Dinos' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'disableDinoBreeding', label: 'Disable Dino Breeding' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'useDinoLevelUpAnimations', label: 'Use Dino Level-Up Animations' },

    // BREEDING - Game.ini
    { file: 'Game.ini', tab: 'breeding', type: 'number', key: 'matingIntervalMultiplier', label: 'Mating Interval', desc: 'Lower means dinos can mate sooner', step: 0.1 },
    { file: 'Game.ini', tab: 'breeding', type: 'number', key: 'eggHatchSpeedMultiplier', label: 'Egg Hatch Speed', desc: 'Higher means faster hatching/gestation', step: 0.1 },
    { file: 'Game.ini', tab: 'breeding', type: 'number', key: 'babyMatureSpeedMultiplier', label: 'Baby Mature Speed', desc: 'Higher means babies grow faster', step: 0.1 },
    { file: 'Game.ini', tab: 'breeding', type: 'number', key: 'babyFoodConsumptionSpeedMultiplier', label: 'Baby Food Consumption', desc: 'Lower means babies eat less', step: 0.1 },
    { file: 'Game.ini', tab: 'breeding', type: 'number', key: 'babyCuddleIntervalMultiplier', label: 'Cuddle Interval', desc: 'Lower means imprint requests happen sooner', step: 0.1 },
    { file: 'Game.ini', tab: 'breeding', type: 'number', key: 'babyImprintAmountMultiplier', label: 'Imprint Amount', desc: 'Higher means more % per imprint', step: 0.1 },
    { file: 'Game.ini', tab: 'breeding', type: 'number', key: 'babyCuddleGracePeriodMultiplier', label: 'Cuddle Grace Period', step: 0.1 },
    { file: 'Game.ini', tab: 'breeding', type: 'number', key: 'babyCuddleLoseImprintQualitySpeedMultiplier', label: 'Imprint Quality Loss Speed', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'breeding', type: 'toggle', key: 'allowAnyoneBabyImprintCuddle', label: 'Anyone Can Imprint', desc: 'Allow tribe members to imprint babies' },
    { file: 'Game.ini', tab: 'breeding', type: 'number', key: 'mutagenLevelBoost', label: 'Mutagen Level Boost (Wild)' },
    { file: 'Game.ini', tab: 'breeding', type: 'number', key: 'mutagenLevelBoostBred', label: 'Mutagen Level Boost (Bred)' },
    { file: 'Game.ini', tab: 'breeding', type: 'number', key: 'maxImprintLimit', label: 'Max Imprint Limit', step: 0.1 },

    // STRUCTURES - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'number', key: 'theMaxStructuresInRange', label: 'Max Structures in Range', desc: 'Engine limit for structures rendered at once' },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'number', key: 'perPlatformMaxStructuresMultiplier', label: 'Platform Saddle Limit Multiplier', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'number', key: 'structureDamageMultiplier', label: 'Structure Damage', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'number', key: 'structureResistanceMultiplier', label: 'Structure Resistance', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'toggle', key: 'disableStructureDecayPve', label: 'Disable PvE Decay' },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'number', key: 'structureDecayPeriodMultiplier', label: 'Structure Decay Period', desc: 'Higher means structures take longer to decay', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'number', key: 'pveDinoDecayPeriodMultiplier', label: 'PvE Dino Decay Period', desc: 'Higher means dinos take longer to decay in PvE', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'toggle', key: 'fastDecayUnsnappedCoreStructures', label: 'Fast Decay Unsnapped Core', desc: 'Causes unsnapped pillar/foundation core structures to decay quickly' },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'toggle', key: 'bAllowPlatformSaddleMultiFloors', label: 'Allow Platform Multi-Floors', desc: 'Enables building multi-floored layouts on platform saddles' },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'number', key: 'flyerPlatformMaxStructuresMultiplier', label: 'Flyer Platform Structure Limit', desc: 'Multiplier for structure limit specifically on flying platform saddles', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'number', key: 'autoDestroyOldStructuresMultiplier', label: 'Auto Destroy Old Structures Multiplier', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'toggle', key: 'pveAllowStructuresAtSupplyDrops', label: 'Allow Structures at Drops (PvE)' },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'toggle', key: 'autoDestroyDecayedDinos', label: 'Auto-Destroy Decayed Dinos' },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'toggle', key: 'bDisableStructurePlacementCollision', label: 'Disable Structure Placement Collision', desc: 'Allows structures to clip into terrain' },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'toggle', key: 'forceAllStructureLocking', label: 'Force All Structure Locking' },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'toggle', key: 'allowIntegratedSpinetAttachment', label: 'Allow S+ Integrated Structures' },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'toggle', key: 'enableExtraStructurePreventionVolumes', label: 'Extra Structure Prevention Volumes' },

    // PVP RULES
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'allowCaveBuildingPvp', label: 'Allow Cave Building (PvP)' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'disableRailgunPvp', label: 'Disable Railgun in PvP' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'enablePvpGamma', label: 'Enable PvP Gamma' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'PreventOfflinePvP', label: 'Prevent Offline PvP', desc: 'Makes structures and dinos invulnerable when tribe is offline' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'number', key: 'PreventOfflinePvPInterval', label: 'Offline PvP Prevention Interval', desc: 'Time in seconds after logout before protection activates', step: 1.0 },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'pvpStructureDecay', label: 'PvP Structure Decay' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'pvpDinoDecay', label: 'PvP Dino Decay' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'number', key: 'globalPoweredBatteryDurabilityDecreasePerSecond', label: 'Battery Durability Decrease/Sec', step: 0.1 },
    { file: 'Game.ini', tab: 'pvp', type: 'toggle', key: 'bDisableFriendlyFire', label: 'Disable Friendly Fire', desc: 'Prevents damaging tribe members and owned tames' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'allowCryoCooldownOnPvE', label: 'Allow Cryo Cooldown on PvE', desc: 'Enables cryo sickness cooldown on PvE' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'disableCryopodEnemyCheck', label: 'Disable Cryopod Enemy Check', desc: 'Allows deploying cryopods even if enemies are nearby' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'number', key: 'pvpZoneStructureDamageMultiplier', label: 'PvP Zone Structure Damage', desc: 'Damage multiplier for structures inside PvP zones', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'number', key: 'structureDamageRepairCooldown', label: 'Structure Repair Cooldown (s)', desc: 'Cooldown in seconds after structure is damaged before it can be repaired', step: 1.0 },

    // TRIBE - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'tribe', type: 'toggle', key: 'preventTribeAlliances', label: 'Prevent Tribe Alliances' },
    { file: 'GameUserSettings.ini', tab: 'tribe', type: 'toggle', key: 'allowTribeAlliance', label: 'Allow Tribe Alliances' },
    { file: 'GameUserSettings.ini', tab: 'tribe', type: 'toggle', key: 'allowTribeWarfare', label: 'Allow Tribe Warfare' },
    { file: 'GameUserSettings.ini', tab: 'tribe', type: 'number', key: 'maxTribeLogs', label: 'Max Tribe Logs' },
    { file: 'GameUserSettings.ini', tab: 'tribe', type: 'number', key: 'maxNumberOfPlayersInTribe', label: 'Max Players per Tribe (0 = no limit)' },

    // TRANSFER - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'transfer', type: 'number', key: 'maxTributeDinos', label: 'Max Tribute Dinos' },
    { file: 'GameUserSettings.ini', tab: 'transfer', type: 'number', key: 'maxTributeItems', label: 'Max Tribute Items' },
    { file: 'GameUserSettings.ini', tab: 'transfer', type: 'toggle', key: 'noTributeDownloads', label: 'No Tribute Downloads' },
    { file: 'GameUserSettings.ini', tab: 'transfer', type: 'toggle', key: 'preventDownloadSurvivors', label: 'Prevent Download Survivors' },
    { file: 'GameUserSettings.ini', tab: 'transfer', type: 'toggle', key: 'preventDownloadItems', label: 'Prevent Download Items' },
    { file: 'GameUserSettings.ini', tab: 'transfer', type: 'toggle', key: 'preventDownloadDinos', label: 'Prevent Download Dinos' },
    { file: 'GameUserSettings.ini', tab: 'transfer', type: 'toggle', key: 'preventUploadSurvivors', label: 'Prevent Upload Survivors' },
    { file: 'GameUserSettings.ini', tab: 'transfer', type: 'toggle', key: 'preventUploadItems', label: 'Prevent Upload Items' },
    { file: 'GameUserSettings.ini', tab: 'transfer', type: 'toggle', key: 'preventUploadDinos', label: 'Prevent Upload Dinos' },
    { file: 'GameUserSettings.ini', tab: 'transfer', type: 'toggle', key: 'crossarkAllowForeignDinoDownloads', label: 'CrossARK Allow Foreign Dino Downloads' },

    // ENVIRONMENT - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'dayCycleSpeedScale', label: 'Day Cycle Speed', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'dayTimeSpeedScale', label: 'Day Time Speed', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'nightTimeSpeedScale', label: 'Night Time Speed', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'spoilingTimeMultiplier', label: 'Spoiling Time Multiplier', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'itemDecompositionTimeMultiplier', label: 'Item Decomposition Time', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'corpseDecompositionTimeMultiplier', label: 'Corpse Decomposition Time', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'cropGrowthSpeedMultiplier', label: 'Crop Growth Speed', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'cropDecaySpeedMultiplier', label: 'Crop Decay Speed', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'layEggIntervalMultiplier', label: 'Lay Egg Interval', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'poopIntervalMultiplier', label: 'Poop Interval', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'hairGrowthSpeedMultiplier', label: 'Hair Growth Speed', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'killXpMultiplier', label: 'Kill XP Multiplier', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'harvestXpMultiplier', label: 'Harvest XP Multiplier', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'environment', type: 'number', key: 'craftXpMultiplier', label: 'Craft XP Multiplier', step: 0.1 },

    // ENGRAMS & CRAFTING
    { file: 'GameUserSettings.ini', tab: 'engrams', type: 'toggle', key: 'autoUnlockAllEngrams', label: 'Auto Unlock All Engrams', desc: 'Automatically unlocks all engrams as players level up.' },
    { file: 'GameUserSettings.ini', tab: 'engrams', type: 'toggle', key: 'onlyAllowSpecifiedEngrams', label: 'Only Allow Specified Engrams', desc: 'If enabled, locks all engrams except those specifically allowed.' },
    { file: 'GameUserSettings.ini', tab: 'engrams', type: 'toggle', key: 'bAllowUnlimitedRespecs', label: 'Allow Unlimited Respecs', desc: 'Allows consuming Mindwipe Tonic without cooldown.' },
    { file: 'GameUserSettings.ini', tab: 'engrams', type: 'number', key: 'itemStackSizeMultiplier', label: 'Item Stack Size Multiplier', desc: 'Global multiplier for all item stack sizes.', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'engrams', type: 'number', key: 'customRecipeEffectivenessMultiplier', label: 'Custom Recipe Effectiveness', desc: 'Multiplier for the effectiveness of custom crafted food/drink recipes.', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'engrams', type: 'number', key: 'customRecipeSkillMultiplier', label: 'Custom Recipe Crafting Skill Effect', desc: 'Multiplier for the impact of crafting skill on custom recipe stats.', step: 0.1 },
    { file: 'Game.ini', tab: 'engrams', type: 'engram_entries', key: 'overrideNamedEngramEntries', label: 'Engram Overrides' },
    { file: 'Game.ini', tab: 'engrams', type: 'crafting_costs', key: 'configOverrideItemCraftingCosts', label: 'Crafting Cost Overrides' },

    // ADMIN - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'text', key: 'adminList', label: 'Admin Steam IDs', desc: 'Comma separated' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'text', key: 'badWordFilter', label: 'Bad Word Filter', desc: 'Comma separated' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'toggle', key: 'enableCreativeMode', label: 'Enable Creative Mode' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'toggle', key: 'serverForceNoHud', label: 'Force No HUD' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'number', key: 'kickIdlePlayerPeriod', label: 'Kick Idle Player Period (Secs)' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'number', key: 'destroyTamesOverLevelClamp', label: 'Destroy Tames Over Level Clamp', desc: '0 = disabled' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'text', key: 'SpectatorPassword', label: 'Spectator Password', desc: 'Password required to use spectator mode' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'toggle', key: 'useSecureSpawnRules', label: 'Use Secure Spawn Rules' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'toggle', key: 'useItemDupeCheck', label: 'Use Item Dupe Check' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'toggle', key: 'globalVoiceChat', label: 'Global Voice Chat', desc: 'Allows everyone to hear voice communications across the map' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'toggle', key: 'proximityVoiceChat', label: 'Proximity Voice Chat', desc: 'Restricts voice chat to nearby players only' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'toggle', key: 'alwaysNotifyPlayerJoined', label: 'Notify Player Joined', desc: 'Shows a broadcast notification when a player connects' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'toggle', key: 'alwaysNotifyPlayerLeft', label: 'Notify Player Left', desc: 'Shows a broadcast notification when a player disconnects' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'toggle', key: 'serverAdminCommandLogging', label: 'Log Admin Commands', desc: 'Logs all admin command usages to server logs and chat' },

    // ADVANCED - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'disableWeatherFog', label: 'Disable Fog' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'number', key: 'autoSavePeriodMinutes', label: 'Auto-Save Period (Mins)', step: 1.0 },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'text', key: 'motd', label: 'Message of the Day', desc: 'Shown to players when they join' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'number', key: 'motdDuration', label: 'MOTD Duration (Secs)' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'select', key: 'activeEvent', label: 'Active Event', desc: 'Predefined holiday events', options: [
      { label: 'None', value: '' },
      { label: 'Easter', value: 'Easter' },
      { label: 'Summer', value: 'Summer' },
      { label: 'Winter Wonderland', value: 'WinterWonderland' },
      { label: 'Fear Evolved (Halloween)', value: 'FearEvolved' },
      { label: 'Turkey Trial (Thanksgiving)', value: 'TurkeyTrial' },
      { label: 'Valentine', value: 'Valentine' },
      { label: 'Anniversary', value: 'Anniversary' }
    ]},
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'text', key: 'launcherArgs', label: 'Custom Launcher Args', desc: 'Additional command line arguments' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'useAllAvailableCores', label: 'Use All Cores' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'useLowMemory', label: 'Low Memory Mode' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'noBattleEye', label: 'Disable BattlEye (Launcher Arg)' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'text', key: 'activeMods', label: 'Active Mods', desc: 'Comma-separated Workshop IDs' },
  ], []);

  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const query = searchQuery.toLowerCase();
    return schema.filter(f => 
      f.file === activeFile && 
      (f.label.toLowerCase().includes(query) || f.key.toLowerCase().includes(query) || f.desc?.toLowerCase().includes(query))
    );
  }, [searchQuery, schema, activeFile]);

  useEffect(() => {
    if (searchQuery) setActiveTab('search');
    else if (activeTab === 'search') setActiveTab('general');
  }, [searchQuery]);

  // If a tab has no fields for the active file, it shouldn't be rendered.
  const activeFileTabs = useMemo(() => {
    const validTabIds = new Set(schema.filter(f => f.file === activeFile).map(f => f.tab));
    return tabs.filter(t => validTabIds.has(t.id));
  }, [schema, activeFile, tabs]);

  useEffect(() => {
    // If the current tab isn't valid for the new activeFile, switch to the first valid one
    if (activeTab !== 'search' && !activeFileTabs.some(t => t.id === activeTab)) {
      if (activeFileTabs.length > 0) setActiveTab(activeFileTabs[0].id);
    }
  }, [activeFile, activeFileTabs, activeTab]);


  const renderField = (field: any) => {
    if (field.type === 'text') {
      return <TextInput key={field.key} file={field.file} label={field.label} value={config[field.key as keyof AseGameConfig] as string} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} />;
    }
    if (field.type === 'number') {
      return <NumberInput key={field.key} file={field.file} label={field.label} value={config[field.key as keyof AseGameConfig] as number} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} step={field.step} />;
    }
    if (field.type === 'toggle') {
      return <Toggle key={field.key} file={field.file} label={field.label} value={config[field.key as keyof AseGameConfig] as boolean} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} />;
    }
    if (field.type === 'select') {
      return <SelectInput key={field.key} file={field.file} label={field.label!} value={config[field.key as keyof AseGameConfig] as string} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} options={field.options} />;
    }
    if (field.type === 'engram_entries') {
      return (
        <div className="w-full mt-2" key={field.key}>
          <div className="text-white font-semibold tracking-wide flex items-center gap-2 mb-2">{field.label}</div>
          <EngramOverridesEditor value={config.overrideNamedEngramEntries} onChange={(v: string) => update('overrideNamedEngramEntries', v)} />
        </div>
      );
    }
    if (field.type === 'crafting_costs') {
      return (
        <div className="w-full mt-2" key={field.key}>
          <div className="text-white font-semibold tracking-wide flex items-center gap-2 mb-2">{field.label}</div>
          <CraftingCostEditor value={config.configOverrideItemCraftingCosts} onChange={(v: string) => update('configOverrideItemCraftingCosts', v)} />
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Premium Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 p-6 rounded-3xl bg-slate-900/60 border border-white/5 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-5">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl shadow-lg shadow-amber-500/10">
                <FileEdit className="w-7 h-7 text-amber-400" />
              </div>
              ASE Configuration
            </h1>
            <p className="text-sm text-slate-400 mt-2 font-medium">Fine-tune your server settings effortlessly</p>
          </div>

          <div className="flex bg-slate-950/50 p-1.5 rounded-2xl border border-white/5 w-fit">
            <button
              onClick={() => { setActiveFile('GameUserSettings.ini'); setSearchQuery(''); }}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 flex items-center gap-2",
                activeFile === 'GameUserSettings.ini' 
                  ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20" 
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <FileText className="w-4 h-4" /> GameUserSettings.ini
            </button>
            <button
              onClick={() => { setActiveFile('Game.ini'); setSearchQuery(''); }}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-bold tracking-wide transition-all duration-300 flex items-center gap-2",
                activeFile === 'Game.ini' 
                  ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20" 
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Database className="w-4 h-4" /> Game.ini
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 relative z-10">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-amber-500 transition-colors" />
            <input 
              type="text" 
              placeholder={`Search ${activeFile}...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-11 pr-4 py-3 bg-slate-950/80 border border-white/10 rounded-2xl text-sm font-semibold text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 w-72 transition-all duration-300 shadow-inner"
            />
          </div>

          {servers.length > 0 && (
            <ServerSelect
              value={selectedServer}
              onChange={setSelectedServer}
              servers={servers}
              accentColor="amber"
            />
          )}

          <input type="file" accept=".ini" className="hidden" ref={fileInputRef} onChange={handleImportIni} />
          
          <div className="flex bg-slate-950/50 p-1.5 rounded-2xl border border-white/5">
            <button onClick={() => fileInputRef.current?.click()} className="p-3 text-slate-400 hover:text-amber-400 hover:bg-white/5 rounded-xl transition-all" title="Import INI">
              <Download className="w-5 h-5" />
            </button>
            <button onClick={() => setConfig(defaultConfig)} className="p-3 text-slate-400 hover:text-amber-400 hover:bg-white/5 rounded-xl transition-all" title="Reset Default">
              <RotateCcw className="w-5 h-5" />
            </button>
            <button 
              onClick={handleSave} 
              disabled={!isDirty} 
              className="px-5 py-2.5 ml-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:hover:bg-amber-500 text-slate-950 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-amber-500/20"
            >
              <Save className="w-4 h-4" /> Save
            </button>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Modern Sidebar Navigation */}
        <div className="lg:w-64 shrink-0 flex flex-col gap-2 h-[65vh] overflow-y-auto pr-3 custom-scrollbar">
          {activeFileTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
              className={cn(
                "flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-bold transition-all duration-300 border",
                activeTab === tab.id
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[inset_4px_0_0_0_#fbbf24]"
                  : "bg-slate-900/30 border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              {React.cloneElement(tab.icon as React.ReactElement<any>, { 
                className: cn("w-5 h-5 transition-transform duration-300", activeTab === tab.id ? "scale-110" : "")
              })}
              {tab.label}
            </button>
          ))}
          {searchQuery && (
            <button className="flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-bold transition-all bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-[inset_4px_0_0_0_#fbbf24]">
              <Search className="w-5 h-5" /> Search Results
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-slate-900/40 backdrop-blur-sm border border-white/5 rounded-3xl p-6 lg:p-8 h-[65vh] overflow-y-auto custom-scrollbar relative shadow-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + activeFile + searchQuery}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {searchQuery ? (
                searchResults.length > 0 ? (
                  searchResults.map(field => renderField(field))
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <Search className="w-12 h-12 mb-4 opacity-50" />
                    <p className="text-lg font-medium">No matching settings found in {activeFile}</p>
                    <p className="text-sm mt-1">Try a different search term or check the other file tab.</p>
                  </div>
                )
              ) : (
                schema.filter(f => f.file === activeFile && f.tab === activeTab).map(field => renderField(field))
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
