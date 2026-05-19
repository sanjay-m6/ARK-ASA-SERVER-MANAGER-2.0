import { useState, useEffect, useMemo } from 'react';
import { FileEdit, Save, RotateCcw, ChevronDown, CheckSquare, Settings2, Users, Flame, Hammer, MonitorPlay, Search, Shield, Globe, Cpu, Map, Archive } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import ServerSelect from '../../components/ui/ServerSelect';
import { readAseConfig, writeAseConfig } from '../utils/aseCommands';
import type { AseGameConfig } from '../types/ase.types';
import RawIniEditor from '../components/config/RawIniEditor';
import ConfigBackupManager from '../components/config/ConfigBackupManager';

const defaultConfig: AseGameConfig = {
  // Identity
  sessionName: 'My ASE Server', serverPassword: '', serverAdminPassword: 'admin123', maxPlayers: 70,
  // Difficulty
  difficultyOffset: 1.0, overrideOfficialDifficulty: 5.0,
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
  ignoreLimitMaxStructuresInRangeTypeFlag: false, ignoreStructuresPreventionVolumes: false,
  // PvP Rules
  serverPve: false, allowCaveBuildingPvp: false, disableRailgunPvp: false, enablePvpGamma: false,
  pvpStructureDecay: false, pvpDinoDecay: false, globalPoweredBatteryDurabilityDecreasePerSecond: 4.0,
  // Player Rules
  allowThirdPersonPlayer: true, serverCrosshair: true, showMapPlayerLocation: true, allowFlyerCarryPve: false,
  disableWeatherFog: false, allowAnyoneBabyImprintCuddle: false, allowHitMarkers: true, enableExtraStructurePreventionVolumes: false,
  showFloatingDamageText: false, forceFlyerexplosives: false,
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
  autoUnlockAllEngrams: false, onlyAllowSpecifiedEngrams: false,
  // Network / Admin
  rconEnabled: true, rconPort: 27020, battleEyeEnforcer: true, enableCreativeMode: false, serverForceNoHud: false,
  kickIdlePlayerPeriod: 3600.0, destroyTamesOverLevelClamp: 0,
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
  useFjordurTraversalBuff: true, enableFjordurSettings: false, adjustableMutagenSpawnDelayMultiplier: 1.0
};

type TabType = 'general' | 'rates' | 'player' | 'breeding' | 'structures' | 'pvp' | 'tribe' | 'transfer' | 'environment' | 'admin' | 'advanced' | 'raw' | 'backups' | 'search';

export default function ASEConfigEditor() {
  const { servers } = useAseServerStore();
  const [selectedServer, setSelectedServer] = useState<number | null>(servers[0]?.id || null);
  const [config, setConfig] = useState<AseGameConfig>(defaultConfig);
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
      toast.success('Configuration saved successfully');
    } catch (e) {
      toast.error(`Failed to save config: ${e}`);
    }
  };

  const update = (key: keyof AseGameConfig, val: any) => {
    setConfig(prev => ({ ...prev, [key]: val }));
    setIsDirty(true);
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
    { id: 'admin', label: 'Administration', icon: <MonitorPlay className="w-4 h-4" /> },
    { id: 'advanced', label: 'Advanced', icon: <Cpu className="w-4 h-4" /> },
    { id: 'raw', label: 'Raw Editor', icon: <FileEdit className="w-4 h-4" /> },
    { id: 'backups', label: 'Config Backups', icon: <Archive className="w-4 h-4" /> },
  ];

  const Field = ({ label, children, description }: { label: string; children: React.ReactNode; description?: string }) => {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 border-b border-white/5 last:border-b-0">
        <div>
          <span className="text-sm text-slate-300 font-medium">{label}</span>
          {description && <p className="text-xs text-slate-500 mt-1 max-w-[280px]">{description}</p>}
        </div>
        <div className="sm:w-64 shrink-0">{children}</div>
      </div>
    );
  };

  const Toggle = ({ label, value, onChange, desc }: { label: string; value: boolean; onChange: (v: boolean) => void; desc?: string }) => (
    <Field label={label} description={desc}>
      <button onClick={() => onChange(!value)} className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-all ${value ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400 border border-white/10 hover:border-white/20'}`}>
        {value ? 'Enabled' : 'Disabled'}
      </button>
    </Field>
  );

  const NumberInput = ({ label, value, onChange, desc, step = 1 }: { label: string; value: number; onChange: (v: number) => void; desc?: string; step?: number }) => (
    <Field label={label} description={desc}>
      <input type="number" step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
    </Field>
  );

  const TextInput = ({ label, value, onChange, desc, placeholder }: { label: string; value: string; onChange: (v: string) => void; desc?: string; placeholder?: string }) => (
    <Field label={label} description={desc}>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors" />
    </Field>
  );

  const SelectInput = ({ label, value, onChange, desc, options }: { label: string; value: string; onChange: (v: string) => void; desc?: string; options: { label: string; value: string }[] }) => (
    <Field label={label} description={desc}>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)} className="w-full appearance-none px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors">
          {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>
    </Field>
  );

  const schema = useMemo(() => [
    // GENERAL
    { tab: 'general', type: 'text', key: 'sessionName', label: 'Session Name', desc: 'The name displayed in the server browser' },
    { tab: 'general', type: 'text', key: 'serverPassword', label: 'Server Password', desc: 'Leave blank for open server' },
    { tab: 'general', type: 'text', key: 'serverAdminPassword', label: 'Admin Password', desc: 'Used for in-game admin commands' },
    { tab: 'general', type: 'number', key: 'maxPlayers', label: 'Max Players' },
    { tab: 'general', type: 'toggle', key: 'serverPve', label: 'PvE Mode', desc: 'Disables player vs player combat and structure damage' },
    { tab: 'general', type: 'toggle', key: 'rconEnabled', label: 'Enable RCON' },
    { tab: 'general', type: 'number', key: 'rconPort', label: 'RCON Port' },
    { tab: 'general', type: 'toggle', key: 'battleEyeEnforcer', label: 'BattlEye Anti-Cheat', desc: 'Requires client restart if changed' },

    // RATES
    { tab: 'rates', type: 'number', key: 'xpMultiplier', label: 'XP Multiplier', desc: 'Global experience gain rate', step: 0.1 },
    { tab: 'rates', type: 'number', key: 'tamingSpeedMultiplier', label: 'Taming Speed', desc: 'Faster taming process', step: 0.1 },
    { tab: 'rates', type: 'number', key: 'harvestAmountMultiplier', label: 'Harvest Amount', desc: 'Amount of resources gathered per hit', step: 0.1 },
    { tab: 'rates', type: 'number', key: 'harvestHealthMultiplier', label: 'Harvest Node Health', desc: 'Durability of resource nodes', step: 0.1 },
    { tab: 'rates', type: 'number', key: 'resourcesRespawnPeriodMultiplier', label: 'Resource Respawn Period', desc: 'Lower means faster respawn', step: 0.1 },
    { tab: 'rates', type: 'number', key: 'itemStackSizeMultiplier', label: 'Item Stack Size', step: 0.1 },
    { tab: 'rates', type: 'number', key: 'difficultyOffset', label: 'Difficulty Offset', desc: 'Base difficulty scale (0.0 - 1.0)', step: 0.1 },
    { tab: 'rates', type: 'number', key: 'overrideOfficialDifficulty', label: 'Override Official Difficulty', desc: 'Max wild dino level multiplier (e.g. 5.0 = lvl 150)', step: 0.1 },

    // PLAYER
    { tab: 'player', type: 'toggle', key: 'allowThirdPersonPlayer', label: 'Allow Third Person' },
    { tab: 'player', type: 'toggle', key: 'serverCrosshair', label: 'Show Crosshair' },
    { tab: 'player', type: 'toggle', key: 'showMapPlayerLocation', label: 'Show Player on Map' },
    { tab: 'player', type: 'number', key: 'playerCharacterFoodDrainMultiplier', label: 'Player Food Drain', step: 0.1 },
    { tab: 'player', type: 'number', key: 'playerCharacterWaterDrainMultiplier', label: 'Player Water Drain', step: 0.1 },
    { tab: 'player', type: 'number', key: 'playerCharacterStaminaDrainMultiplier', label: 'Player Stamina Drain', step: 0.1 },
    { tab: 'player', type: 'number', key: 'playerCharacterHealthRecoveryMultiplier', label: 'Player Health Recovery', step: 0.1 },
    { tab: 'player', type: 'number', key: 'playerResistanceMultiplier', label: 'Player Resistance', step: 0.1 },
    { tab: 'player', type: 'number', key: 'playerDamageMultiplier', label: 'Player Damage', step: 0.1 },
    
    // DINO
    { tab: 'player', type: 'toggle', key: 'allowFlyerCarryPve', label: 'Allow Flyer Carry in PvE' },
    { tab: 'player', type: 'number', key: 'dinoDamageMultiplier', label: 'Dino Damage', desc: 'Global wild/tamed damage multiplier', step: 0.1 },
    { tab: 'player', type: 'number', key: 'dinoResistanceMultiplier', label: 'Dino Resistance', desc: 'Lower means dinos take less damage', step: 0.1 },
    { tab: 'player', type: 'number', key: 'dinoCharacterFoodDrainMultiplier', label: 'Dino Food Drain', step: 0.1 },
    { tab: 'player', type: 'number', key: 'dinoCharacterHealthRecoveryMultiplier', label: 'Dino Health Recovery', step: 0.1 },
    { tab: 'player', type: 'number', key: 'wildDinoTorporDrainMultiplier', label: 'Wild Dino Torpor Drain', step: 0.1 },
    { tab: 'player', type: 'number', key: 'tamedDinoTorporDrainMultiplier', label: 'Tamed Dino Torpor Drain', step: 0.1 },
    { tab: 'player', type: 'number', key: 'dinoCountMultiplier', label: 'Dino Count Multiplier', step: 0.1 },
    { tab: 'player', type: 'number', key: 'maxTamedDinos', label: 'Max Tamed Dinos (Global)' },
    { tab: 'player', type: 'number', key: 'maxPersonalTamedDinos', label: 'Max Personal Tamed Dinos' },
    { tab: 'player', type: 'toggle', key: 'allowUnclaimDinos', label: 'Allow Unclaim Dinos' },
    { tab: 'player', type: 'toggle', key: 'disableDinoBreeding', label: 'Disable Dino Breeding' },
    { tab: 'player', type: 'toggle', key: 'useDinoLevelUpAnimations', label: 'Use Dino Level-Up Animations' },

    // BREEDING
    { tab: 'breeding', type: 'number', key: 'matingIntervalMultiplier', label: 'Mating Interval', desc: 'Lower means dinos can mate sooner', step: 0.1 },
    { tab: 'breeding', type: 'number', key: 'eggHatchSpeedMultiplier', label: 'Egg Hatch Speed', desc: 'Higher means faster hatching/gestation', step: 0.1 },
    { tab: 'breeding', type: 'number', key: 'babyMatureSpeedMultiplier', label: 'Baby Mature Speed', desc: 'Higher means babies grow faster', step: 0.1 },
    { tab: 'breeding', type: 'number', key: 'babyFoodConsumptionSpeedMultiplier', label: 'Baby Food Consumption', desc: 'Lower means babies eat less', step: 0.1 },
    { tab: 'breeding', type: 'number', key: 'babyCuddleIntervalMultiplier', label: 'Cuddle Interval', desc: 'Lower means imprint requests happen sooner', step: 0.1 },
    { tab: 'breeding', type: 'number', key: 'babyImprintAmountMultiplier', label: 'Imprint Amount', desc: 'Higher means more % per imprint', step: 0.1 },
    { tab: 'breeding', type: 'number', key: 'babyCuddleGracePeriodMultiplier', label: 'Cuddle Grace Period', step: 0.1 },
    { tab: 'breeding', type: 'number', key: 'babyCuddleLoseImprintQualitySpeedMultiplier', label: 'Imprint Quality Loss Speed', step: 0.1 },
    { tab: 'breeding', type: 'toggle', key: 'allowAnyoneBabyImprintCuddle', label: 'Anyone Can Imprint', desc: 'Allow tribe members to imprint babies' },
    { tab: 'breeding', type: 'number', key: 'mutagenLevelBoost', label: 'Mutagen Level Boost (Wild)' },
    { tab: 'breeding', type: 'number', key: 'mutagenLevelBoostBred', label: 'Mutagen Level Boost (Bred)' },
    { tab: 'breeding', type: 'number', key: 'maxImprintLimit', label: 'Max Imprint Limit', step: 0.1 },

    // STRUCTURES
    { tab: 'structures', type: 'number', key: 'theMaxStructuresInRange', label: 'Max Structures in Range', desc: 'Engine limit for structures rendered at once' },
    { tab: 'structures', type: 'number', key: 'perPlatformMaxStructuresMultiplier', label: 'Platform Saddle Limit Multiplier', step: 0.1 },
    { tab: 'structures', type: 'number', key: 'structureDamageMultiplier', label: 'Structure Damage', step: 0.1 },
    { tab: 'structures', type: 'number', key: 'structureResistanceMultiplier', label: 'Structure Resistance', step: 0.1 },
    { tab: 'structures', type: 'toggle', key: 'disableStructureDecayPve', label: 'Disable PvE Decay' },
    { tab: 'structures', type: 'number', key: 'autoDestroyOldStructuresMultiplier', label: 'Auto Destroy Old Structures Multiplier', step: 0.1 },
    { tab: 'structures', type: 'toggle', key: 'pveAllowStructuresAtSupplyDrops', label: 'Allow Structures at Drops (PvE)' },
    { tab: 'structures', type: 'toggle', key: 'autoDestroyDecayedDinos', label: 'Auto-Destroy Decayed Dinos' },
    { tab: 'structures', type: 'toggle', key: 'forceAllStructureLocking', label: 'Force All Structure Locking' },
    { tab: 'structures', type: 'toggle', key: 'allowIntegratedSpinetAttachment', label: 'Allow S+ Integrated Structures' },
    { tab: 'structures', type: 'toggle', key: 'enableExtraStructurePreventionVolumes', label: 'Extra Structure Prevention Volumes' },

    // PVP RULES
    { tab: 'pvp', type: 'toggle', key: 'allowCaveBuildingPvp', label: 'Allow Cave Building (PvP)' },
    { tab: 'pvp', type: 'toggle', key: 'disableRailgunPvp', label: 'Disable Railgun in PvP' },
    { tab: 'pvp', type: 'toggle', key: 'enablePvpGamma', label: 'Enable PvP Gamma' },
    { tab: 'pvp', type: 'toggle', key: 'pvpStructureDecay', label: 'PvP Structure Decay' },
    { tab: 'pvp', type: 'toggle', key: 'pvpDinoDecay', label: 'PvP Dino Decay' },
    { tab: 'pvp', type: 'number', key: 'globalPoweredBatteryDurabilityDecreasePerSecond', label: 'Battery Durability Decrease/Sec', step: 0.1 },

    // TRIBE
    { tab: 'tribe', type: 'toggle', key: 'preventTribeAlliances', label: 'Prevent Tribe Alliances' },
    { tab: 'tribe', type: 'toggle', key: 'allowTribeAlliance', label: 'Allow Tribe Alliances' },
    { tab: 'tribe', type: 'toggle', key: 'allowTribeWarfare', label: 'Allow Tribe Warfare' },
    { tab: 'tribe', type: 'number', key: 'maxTribeLogs', label: 'Max Tribe Logs' },
    { tab: 'tribe', type: 'number', key: 'maxNumberOfPlayersInTribe', label: 'Max Players per Tribe (0 = no limit)' },

    // TRANSFER
    { tab: 'transfer', type: 'number', key: 'maxTributeDinos', label: 'Max Tribute Dinos' },
    { tab: 'transfer', type: 'number', key: 'maxTributeItems', label: 'Max Tribute Items' },
    { tab: 'transfer', type: 'toggle', key: 'noTributeDownloads', label: 'No Tribute Downloads' },
    { tab: 'transfer', type: 'toggle', key: 'preventDownloadSurvivors', label: 'Prevent Download Survivors' },
    { tab: 'transfer', type: 'toggle', key: 'preventDownloadItems', label: 'Prevent Download Items' },
    { tab: 'transfer', type: 'toggle', key: 'preventDownloadDinos', label: 'Prevent Download Dinos' },
    { tab: 'transfer', type: 'toggle', key: 'preventUploadSurvivors', label: 'Prevent Upload Survivors' },
    { tab: 'transfer', type: 'toggle', key: 'preventUploadItems', label: 'Prevent Upload Items' },
    { tab: 'transfer', type: 'toggle', key: 'preventUploadDinos', label: 'Prevent Upload Dinos' },
    { tab: 'transfer', type: 'toggle', key: 'crossarkAllowForeignDinoDownloads', label: 'CrossARK Allow Foreign Dino Downloads' },

    // ENVIRONMENT
    { tab: 'environment', type: 'number', key: 'dayCycleSpeedScale', label: 'Day Cycle Speed', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'dayTimeSpeedScale', label: 'Day Time Speed', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'nightTimeSpeedScale', label: 'Night Time Speed', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'spoilingTimeMultiplier', label: 'Spoiling Time Multiplier', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'itemDecompositionTimeMultiplier', label: 'Item Decomposition Time', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'corpseDecompositionTimeMultiplier', label: 'Corpse Decomposition Time', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'cropGrowthSpeedMultiplier', label: 'Crop Growth Speed', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'cropDecaySpeedMultiplier', label: 'Crop Decay Speed', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'layEggIntervalMultiplier', label: 'Lay Egg Interval', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'poopIntervalMultiplier', label: 'Poop Interval', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'hairGrowthSpeedMultiplier', label: 'Hair Growth Speed', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'killXpMultiplier', label: 'Kill XP Multiplier', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'harvestXpMultiplier', label: 'Harvest XP Multiplier', step: 0.1 },
    { tab: 'environment', type: 'number', key: 'craftXpMultiplier', label: 'Craft XP Multiplier', step: 0.1 },

    // ADMIN
    { tab: 'admin', type: 'text', key: 'adminList', label: 'Admin Steam IDs', desc: 'Comma separated' },
    { tab: 'admin', type: 'text', key: 'badWordFilter', label: 'Bad Word Filter', desc: 'Comma separated' },
    { tab: 'admin', type: 'toggle', key: 'enableCreativeMode', label: 'Enable Creative Mode' },
    { tab: 'admin', type: 'toggle', key: 'serverForceNoHud', label: 'Force No HUD' },
    { tab: 'admin', type: 'number', key: 'kickIdlePlayerPeriod', label: 'Kick Idle Player Period (Secs)' },
    { tab: 'admin', type: 'number', key: 'destroyTamesOverLevelClamp', label: 'Destroy Tames Over Level Clamp', desc: '0 = disabled' },
    { tab: 'admin', type: 'toggle', key: 'useSecureSpawnRules', label: 'Use Secure Spawn Rules' },
    { tab: 'admin', type: 'toggle', key: 'useItemDupeCheck', label: 'Use Item Dupe Check' },

    // ADVANCED
    { tab: 'advanced', type: 'toggle', key: 'disableWeatherFog', label: 'Disable Fog' },
    { tab: 'advanced', type: 'number', key: 'autoSavePeriodMinutes', label: 'Auto-Save Period (Mins)', step: 1.0 },
    { tab: 'advanced', type: 'text', key: 'motd', label: 'Message of the Day', desc: 'Shown to players when they join' },
    { tab: 'advanced', type: 'number', key: 'motdDuration', label: 'MOTD Duration (Secs)' },
    { tab: 'advanced', type: 'select', key: 'activeEvent', label: 'Active Event', desc: 'Predefined holiday events', options: [
      { label: 'None', value: '' },
      { label: 'Easter', value: 'Easter' },
      { label: 'Summer', value: 'Summer' },
      { label: 'Winter Wonderland', value: 'WinterWonderland' },
      { label: 'Fear Evolved (Halloween)', value: 'FearEvolved' },
      { label: 'Turkey Trial (Thanksgiving)', value: 'TurkeyTrial' },
      { label: 'Valentine', value: 'Valentine' },
      { label: 'Anniversary', value: 'Anniversary' }
    ]},
    { tab: 'advanced', type: 'text', key: 'launcherArgs', label: 'Custom Launcher Args', desc: 'Additional command line arguments' },
    { tab: 'advanced', type: 'toggle', key: 'useAllAvailableCores', label: 'Use All Cores' },
    { tab: 'advanced', type: 'toggle', key: 'useLowMemory', label: 'Low Memory Mode' },
    { tab: 'advanced', type: 'toggle', key: 'noBattleEye', label: 'Disable BattlEye (Launcher Arg)' },
    { tab: 'advanced', type: 'text', key: 'activeMods', label: 'Active Mods', desc: 'Comma-separated Workshop IDs' },
  ], []);

  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const query = searchQuery.toLowerCase();
    return schema.filter(f => f.label.toLowerCase().includes(query) || f.key.toLowerCase().includes(query) || f.desc?.toLowerCase().includes(query));
  }, [searchQuery, schema]);

  useEffect(() => {
    if (searchQuery) setActiveTab('search');
    else if (activeTab === 'search') setActiveTab('general');
  }, [searchQuery]);

  const renderField = (field: any) => {
    if (field.type === 'text') {
      return <TextInput key={field.key} label={field.label} value={config[field.key as keyof AseGameConfig] as string} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} />;
    }
    if (field.type === 'number') {
      return <NumberInput key={field.key} label={field.label} value={config[field.key as keyof AseGameConfig] as number} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} step={field.step} />;
    }
    if (field.type === 'toggle') {
      return <Toggle key={field.key} label={field.label} value={config[field.key as keyof AseGameConfig] as boolean} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} />;
    }
    if (field.type === 'select') {
      return <SelectInput key={field.key} label={field.label} value={config[field.key as keyof AseGameConfig] as string} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} options={field.options} />;
    }
    return null;
  };

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 rounded-xl">
              <FileEdit className="w-6 h-6 text-amber-400" />
            </div>
            Configuration Editor
          </h1>
          <p className="text-sm text-slate-400 mt-1">Manage GameUserSettings.ini and Game.ini seamlessly</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search settings..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2.5 bg-[#0A0F1C]/80 border border-white/5 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-300 placeholder-slate-650 focus:outline-none focus:border-amber-500/30 focus:ring-4 focus:ring-amber-500/10 w-64 transition-all duration-300 h-[42px]"
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
          {activeTab !== 'raw' && activeTab !== 'backups' && (
            <>
              <button onClick={() => setConfig(defaultConfig)} className="px-4 py-2.5 text-slate-400 hover:text-white border border-white/10 hover:border-white/20 rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
              <button onClick={handleSave} disabled={!isDirty} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:hover:bg-amber-500 text-slate-900 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-amber-500/20">
                <Save className="w-4 h-4" /> Save Changes
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Navigation Sidebar */}
        <div className="lg:w-64 shrink-0 flex flex-col gap-1.5 h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-amber-500/10 text-amber-400 shadow-[inset_2px_0_0_0_#fbbf24]'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          {searchQuery && (
            <button
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all bg-amber-500/10 text-amber-400 shadow-[inset_2px_0_0_0_#fbbf24]"
            >
              <Search className="w-4 h-4" />
              Search Results ({searchResults.length})
            </button>
          )}
        </div>

        {/* Editor Container */}
        <div className="flex-1 glass-panel rounded-2xl p-6 h-[65vh] overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'search' ? (
              <motion.div key="search" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-1">
                <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">Search Results</h3>
                {searchResults.length > 0 ? searchResults.map(renderField) : (
                  <p className="text-slate-400 text-sm italic py-4">No settings found matching "{searchQuery}"</p>
                )}
              </motion.div>
            ) : activeTab === 'raw' ? (
              <motion.div key="raw" className="h-full" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <RawIniEditor serverId={selectedServer} />
              </motion.div>
            ) : activeTab === 'backups' ? (
              <motion.div key="backups" className="h-full" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <ConfigBackupManager serverId={selectedServer} />
              </motion.div>
            ) : (
              <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-1">
                <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">{tabs.find(t => t.id === activeTab)?.label} Settings</h3>
                {schema.filter(f => f.tab === activeTab).map(renderField)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
