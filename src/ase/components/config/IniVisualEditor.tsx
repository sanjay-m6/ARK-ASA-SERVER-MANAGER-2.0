import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAseConfigStore } from '../../stores/aseConfigStore';

export default function IniVisualEditor({ activeTab, searchQuery }: { activeTab: string, searchQuery: string }) {
  const { currentData, updateEntry } = useAseConfigStore();

  const getVal = (section: string, key: string, def: string | number | boolean): string => {
    const sec = currentData?.sections.find((s: any) => s.name === section);
    const entry = sec?.entries.find((e: any) => e.key === key);
    return entry ? entry.value : String(def);
  };

  const setVal = (section: string, key: string, value: string) => {
    updateEntry(section, key, value);
  };

  const schema = useMemo(() => [
    // GENERAL
    { tab: 'general', section: 'ServerSettings', type: 'text', key: 'SessionName', label: 'Session Name', desc: 'The name displayed in the server browser', def: 'My ASE Server' },
    { tab: 'general', section: 'ServerSettings', type: 'text', key: 'ServerPassword', label: 'Server Password', desc: 'Leave blank for open server', def: '' },
    { tab: 'general', section: 'ServerSettings', type: 'text', key: 'ServerAdminPassword', label: 'Admin Password', desc: 'Used for in-game admin commands', def: 'admin123' },
    { tab: 'general', section: 'ServerSettings', type: 'number', key: 'MaxPlayers', label: 'Max Players', def: 70 },
    { tab: 'general', section: 'ServerSettings', type: 'toggle', key: 'ServerPVE', label: 'PvE Mode', desc: 'Disables player vs player combat and structure damage', def: false },
    { tab: 'general', section: 'ServerSettings', type: 'toggle', key: 'RCONEnabled', label: 'Enable RCON', def: true },
    { tab: 'general', section: 'ServerSettings', type: 'number', key: 'RCONPort', label: 'RCON Port', def: 27020 },
    { tab: 'general', section: 'ServerSettings', type: 'toggle', key: 'BattlEyeEnforcer', label: 'BattlEye Anti-Cheat', desc: 'Requires client restart if changed', def: true },
    { tab: 'general', section: 'MessageOfTheDay', type: 'textarea', key: 'Message', label: 'Message of the Day (MOTD)', desc: 'The message shown to players when they join the server', def: '' },
    { tab: 'general', section: 'MessageOfTheDay', type: 'number', key: 'Duration', label: 'MOTD Duration (Secs)', desc: 'How long the message stays on screen', def: 20 },

    // RATES
    { tab: 'rates', section: 'ServerSettings', type: 'number', key: 'XPMultiplier', label: 'XP Multiplier', desc: 'Global experience gain rate', step: 0.1, def: 1.0 },
    { tab: 'rates', section: 'ServerSettings', type: 'number', key: 'TamingSpeedMultiplier', label: 'Taming Speed', desc: 'Faster taming process', step: 0.1, def: 1.0 },
    { tab: 'rates', section: 'ServerSettings', type: 'number', key: 'HarvestAmountMultiplier', label: 'Harvest Amount', desc: 'Amount of resources gathered per hit', step: 0.1, def: 1.0 },
    { tab: 'rates', section: 'ServerSettings', type: 'number', key: 'HarvestHealthMultiplier', label: 'Harvest Node Health', desc: 'Durability of resource nodes', step: 0.1, def: 1.0 },
    { tab: 'rates', section: 'ServerSettings', type: 'number', key: 'ResourcesRespawnPeriodMultiplier', label: 'Resource Respawn Period', desc: 'Lower means faster respawn', step: 0.1, def: 1.0 },
    { tab: 'rates', section: 'ServerSettings', type: 'number', key: 'ItemStackSizeMultiplier', label: 'Item Stack Size', step: 0.1, def: 1.0 },
    { tab: 'rates', section: 'ServerSettings', type: 'number', key: 'DifficultyOffset', label: 'Difficulty Offset', desc: 'Base difficulty scale (0.0 - 1.0)', step: 0.1, def: 1.0 },
    { tab: 'rates', section: 'ServerSettings', type: 'number', key: 'OverrideOfficialDifficulty', label: 'Override Official Difficulty', desc: 'Max wild dino level multiplier (e.g. 5.0 = lvl 150)', step: 0.1, def: 5.0 },

    // PLAYER
    { tab: 'player', section: 'ServerSettings', type: 'toggle', key: 'AllowThirdPersonPlayer', label: 'Allow Third Person', def: true },
    { tab: 'player', section: 'ServerSettings', type: 'toggle', key: 'ServerCrosshair', label: 'Show Crosshair', def: true },
    { tab: 'player', section: 'ServerSettings', type: 'toggle', key: 'ShowMapPlayerLocation', label: 'Show Player on Map', def: true },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'PlayerCharacterFoodDrainMultiplier', label: 'Player Food Drain', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'PlayerCharacterWaterDrainMultiplier', label: 'Player Water Drain', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'PlayerCharacterStaminaDrainMultiplier', label: 'Player Stamina Drain', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'PlayerCharacterHealthRecoveryMultiplier', label: 'Player Health Recovery', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'PlayerResistanceMultiplier', label: 'Player Resistance', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'PlayerDamageMultiplier', label: 'Player Damage', step: 0.1, def: 1.0 },
    
    // DINO
    { tab: 'player', section: 'ServerSettings', type: 'toggle', key: 'AllowFlyerCarryPvE', label: 'Allow Flyer Carry in PvE', def: false },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'DinoDamageMultiplier', label: 'Dino Damage', desc: 'Global wild/tamed damage multiplier', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'DinoResistanceMultiplier', label: 'Dino Resistance', desc: 'Lower means dinos take less damage', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'DinoCharacterFoodDrainMultiplier', label: 'Dino Food Drain', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'DinoCharacterHealthRecoveryMultiplier', label: 'Dino Health Recovery', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'WildDinoTorporDrainMultiplier', label: 'Wild Dino Torpor Drain', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'TamedDinoTorporDrainMultiplier', label: 'Tamed Dino Torpor Drain', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'DinoCountMultiplier', label: 'Dino Count Multiplier', step: 0.1, def: 1.0 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'MaxTamedDinos', label: 'Max Tamed Dinos (Global)', def: 5000 },
    { tab: 'player', section: 'ServerSettings', type: 'number', key: 'MaxPersonalTamedDinos', label: 'Max Personal Tamed Dinos', def: 40 },
    { tab: 'player', section: 'ServerSettings', type: 'toggle', key: 'AllowUnclaimDinos', label: 'Allow Unclaim Dinos', def: false },
    { tab: 'player', section: 'ServerSettings', type: 'toggle', key: 'DisableDinoBreeding', label: 'Disable Dino Breeding', def: false },
    { tab: 'player', section: 'ServerSettings', type: 'toggle', key: 'UseDinoLevelUpAnimations', label: 'Use Dino Level-Up Animations', def: true },

    // BREEDING
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'MatingIntervalMultiplier', label: 'Mating Interval', desc: 'Lower means dinos can mate sooner', step: 0.1, def: 1.0 },
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'EggHatchSpeedMultiplier', label: 'Egg Hatch Speed', desc: 'Higher means faster hatching/gestation', step: 0.1, def: 1.0 },
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'BabyMatureSpeedMultiplier', label: 'Baby Mature Speed', desc: 'Higher means babies grow faster', step: 0.1, def: 1.0 },
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'BabyFoodConsumptionSpeedMultiplier', label: 'Baby Food Consumption', desc: 'Lower means babies eat less', step: 0.1, def: 1.0 },
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'BabyCuddleIntervalMultiplier', label: 'Cuddle Interval', desc: 'Lower means imprint requests happen sooner', step: 0.1, def: 1.0 },
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'BabyImprintAmountMultiplier', label: 'Imprint Amount', desc: 'Higher means more % per imprint', step: 0.1, def: 1.0 },
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'BabyCuddleGracePeriodMultiplier', label: 'Cuddle Grace Period', step: 0.1, def: 1.0 },
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'BabyCuddleLoseImprintQualitySpeedMultiplier', label: 'Imprint Quality Loss Speed', step: 0.1, def: 1.0 },
    { tab: 'breeding', section: 'ServerSettings', type: 'toggle', key: 'AllowAnyoneBabyImprintCuddle', label: 'Anyone Can Imprint', desc: 'Allow tribe members to imprint babies', def: false },
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'MutagenLevelBoost', label: 'Mutagen Level Boost (Wild)', def: 5 },
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'MutagenLevelBoost_Bred', label: 'Mutagen Level Boost (Bred)', def: 1 },
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'MaxImprintLimit', label: 'Max Imprint Limit', step: 0.1, def: 1.0 },

    // STRUCTURES
    { tab: 'structures', section: 'ServerSettings', type: 'number', key: 'TheMaxStructuresInRange', label: 'Max Structures in Range', desc: 'Engine limit for structures rendered at once', def: 10500 },
    { tab: 'structures', section: 'ServerSettings', type: 'number', key: 'PerPlatformMaxStructuresMultiplier', label: 'Platform Saddle Limit Multiplier', step: 0.1, def: 1.0 },
    { tab: 'structures', section: 'ServerSettings', type: 'number', key: 'StructureDamageMultiplier', label: 'Structure Damage', step: 0.1, def: 1.0 },
    { tab: 'structures', section: 'ServerSettings', type: 'number', key: 'StructureResistanceMultiplier', label: 'Structure Resistance', step: 0.1, def: 1.0 },
    { tab: 'structures', section: 'ServerSettings', type: 'toggle', key: 'DisableStructureDecayPvE', label: 'Disable PvE Decay', def: false },
    { tab: 'structures', section: 'ServerSettings', type: 'number', key: 'AutoDestroyOldStructuresMultiplier', label: 'Auto Destroy Old Structures Multiplier', step: 0.1, def: 0.0 },
    { tab: 'structures', section: 'ServerSettings', type: 'toggle', key: 'PvEAllowStructuresAtSupplyDrops', label: 'Allow Structures at Drops (PvE)', def: false },
    { tab: 'structures', section: 'ServerSettings', type: 'toggle', key: 'AutoDestroyDecayedDinos', label: 'Auto-Destroy Decayed Dinos', def: false },
    { tab: 'structures', section: 'ServerSettings', type: 'toggle', key: 'ForceAllStructureLocking', label: 'Force All Structure Locking', def: false },
    { tab: 'structures', section: 'ServerSettings', type: 'toggle', key: 'AllowIntegratedSPlusStructures', label: 'Allow S+ Integrated Structures', def: true },
    { tab: 'structures', section: 'ServerSettings', type: 'toggle', key: 'EnableExtraStructurePreventionVolumes', label: 'Extra Structure Prevention Volumes', def: false },

    // PVP RULES
    { tab: 'pvp', section: 'ServerSettings', type: 'toggle', key: 'AllowCaveBuildingPvP', label: 'Allow Cave Building (PvP)', def: false },
    { tab: 'pvp', section: 'ServerSettings', type: 'toggle', key: 'DisableRailgunPVP', label: 'Disable Railgun in PvP', def: false },
    { tab: 'pvp', section: 'ServerSettings', type: 'toggle', key: 'EnablePvPGamma', label: 'Enable PvP Gamma', def: false },
    { tab: 'pvp', section: 'ServerSettings', type: 'toggle', key: 'PvPStructureDecay', label: 'PvP Structure Decay', def: false },
    { tab: 'pvp', section: 'ServerSettings', type: 'toggle', key: 'PvPDinoDecay', label: 'PvP Dino Decay', def: false },
    { tab: 'pvp', section: 'ServerSettings', type: 'number', key: 'GlobalPoweredBatteryDurabilityDecreasePerSecond', label: 'Battery Durability Decrease/Sec', step: 0.1, def: 4.0 },

    // TRIBE
    { tab: 'tribe', section: 'ServerSettings', type: 'toggle', key: 'PreventTribeAlliances', label: 'Prevent Tribe Alliances', def: false },
    { tab: 'tribe', section: 'ServerSettings', type: 'toggle', key: 'AllowTribeAlliance', label: 'Allow Tribe Alliances', def: true },
    { tab: 'tribe', section: 'ServerSettings', type: 'toggle', key: 'AllowTribeWarfare', label: 'Allow Tribe Warfare', def: false },
    { tab: 'tribe', section: 'ServerSettings', type: 'number', key: 'MaxTribeLogs', label: 'Max Tribe Logs', def: 100 },
    { tab: 'tribe', section: 'ServerSettings', type: 'number', key: 'MaxNumberOfPlayersInTribe', label: 'Max Players per Tribe (0 = no limit)', def: 0 },

    // TRANSFER
    { tab: 'transfer', section: 'ServerSettings', type: 'number', key: 'MaxTributeDinos', label: 'Max Tribute Dinos', def: 20 },
    { tab: 'transfer', section: 'ServerSettings', type: 'number', key: 'MaxTributeItems', label: 'Max Tribute Items', def: 50 },
    { tab: 'transfer', section: 'ServerSettings', type: 'toggle', key: 'NoTributeDownloads', label: 'No Tribute Downloads', def: false },
    { tab: 'transfer', section: 'ServerSettings', type: 'toggle', key: 'PreventDownloadSurvivors', label: 'Prevent Download Survivors', def: false },
    { tab: 'transfer', section: 'ServerSettings', type: 'toggle', key: 'PreventDownloadItems', label: 'Prevent Download Items', def: false },
    { tab: 'transfer', section: 'ServerSettings', type: 'toggle', key: 'PreventDownloadDinos', label: 'Prevent Download Dinos', def: false },
    { tab: 'transfer', section: 'ServerSettings', type: 'toggle', key: 'PreventUploadSurvivors', label: 'Prevent Upload Survivors', def: false },
    { tab: 'transfer', section: 'ServerSettings', type: 'toggle', key: 'PreventUploadItems', label: 'Prevent Upload Items', def: false },
    { tab: 'transfer', section: 'ServerSettings', type: 'toggle', key: 'PreventUploadDinos', label: 'Prevent Upload Dinos', def: false },
    { tab: 'transfer', section: 'ServerSettings', type: 'toggle', key: 'CrossARKAllowForeignDinoDownloads', label: 'CrossARK Allow Foreign Dino Downloads', def: false },

    // ENVIRONMENT
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'DayCycleSpeedScale', label: 'Day Cycle Speed', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'DayTimeSpeedScale', label: 'Day Time Speed', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'NightTimeSpeedScale', label: 'Night Time Speed', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'SpoilingTimeMultiplier', label: 'Spoiling Time Multiplier', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'ItemDecompositionTimeMultiplier', label: 'Item Decomposition Time', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'CorpseDecompositionTimeMultiplier', label: 'Corpse Decomposition Time', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'CropGrowthSpeedMultiplier', label: 'Crop Growth Speed', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'CropDecaySpeedMultiplier', label: 'Crop Decay Speed', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'LayEggIntervalMultiplier', label: 'Lay Egg Interval', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'PoopIntervalMultiplier', label: 'Poop Interval', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'HairGrowthSpeedMultiplier', label: 'Hair Growth Speed', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'KillXPMultiplier', label: 'Kill XP Multiplier', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'HarvestXPMultiplier', label: 'Harvest XP Multiplier', step: 0.1, def: 1.0 },
    { tab: 'environment', section: 'ServerSettings', type: 'number', key: 'CraftXPMultiplier', label: 'Craft XP Multiplier', step: 0.1, def: 1.0 },

    // ADMIN
    { tab: 'admin', section: 'ServerSettings', type: 'text', key: 'AdminList', label: 'Admin Steam IDs', desc: 'Comma separated', def: '' },
    { tab: 'admin', section: 'ServerSettings', type: 'text', key: 'BadWordFilter', label: 'Bad Word Filter', desc: 'Comma separated', def: '' },
    { tab: 'admin', section: 'ServerSettings', type: 'toggle', key: 'EnableCreativeMode', label: 'Enable Creative Mode', def: false },
    { tab: 'admin', section: 'ServerSettings', type: 'toggle', key: 'ServerForceNoHUD', label: 'Force No HUD', def: false },
    { tab: 'admin', section: 'ServerSettings', type: 'number', key: 'KickIdlePlayerPeriod', label: 'Kick Idle Player Period (Secs)', def: 3600 },
    { tab: 'admin', section: 'ServerSettings', type: 'number', key: 'DestroyTamesOverLevelClamp', label: 'Destroy Tames Over Level Clamp', desc: '0 = disabled', def: 0 },
    { tab: 'admin', section: 'ServerSettings', type: 'toggle', key: 'UseSecureSpawnRules', label: 'Use Secure Spawn Rules', def: false },
    { tab: 'admin', section: 'ServerSettings', type: 'toggle', key: 'UseItemDupeCheck', label: 'Use Item Dupe Check', def: false },

    // ADVANCED
    { tab: 'advanced', section: 'ServerSettings', type: 'toggle', key: 'DisableWeatherFog', label: 'Disable Fog', def: false },
    { tab: 'advanced', section: 'ServerSettings', type: 'number', key: 'AutoSavePeriodMinutes', label: 'Auto-Save Period (Mins)', step: 1.0, def: 15.0 },
    { tab: 'advanced', section: 'ServerSettings', type: 'select', key: 'ActiveEvent', label: 'Active Event', desc: 'Predefined holiday events', options: [
      { label: 'None', value: '' },
      { label: 'Easter', value: 'Easter' },
      { label: 'Summer', value: 'Summer' },
      { label: 'Winter Wonderland', value: 'WinterWonderland' },
      { label: 'Fear Evolved (Halloween)', value: 'FearEvolved' },
      { label: 'Turkey Trial (Thanksgiving)', value: 'TurkeyTrial' },
      { label: 'Valentine', value: 'Valentine' },
      { label: 'Anniversary', value: 'Anniversary' }
    ], def: '' },
    { tab: 'advanced', section: 'ASM2', type: 'text', key: 'LauncherArgs', label: 'Custom Launcher Args', desc: 'Additional command line arguments', def: '' },
    { tab: 'advanced', section: 'ASM2', type: 'toggle', key: 'UseAllAvailableCores', label: 'Use All Cores', def: true },
    { tab: 'advanced', section: 'ASM2', type: 'toggle', key: 'UseLowMemory', label: 'Low Memory Mode', def: false },
    { tab: 'advanced', section: 'ASM2', type: 'toggle', key: 'NoBattlEye', label: 'Disable BattlEye (Launcher Arg)', def: false },
    { tab: 'advanced', section: 'ServerSettings', type: 'text', key: 'ActiveMods', label: 'Active Mods', desc: 'Comma-separated Workshop IDs', def: '' },
  ], []);

  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const query = searchQuery.toLowerCase();
    return schema.filter(f => f.label.toLowerCase().includes(query) || f.key.toLowerCase().includes(query) || f.desc?.toLowerCase().includes(query));
  }, [searchQuery, schema]);

  const Field = ({ label, children, description }: { label: string; children: React.ReactNode; description?: string }) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 border-b border-white/5 last:border-b-0">
      <div>
        <span className="text-sm text-slate-300 font-medium">{label}</span>
        {description && <p className="text-xs text-slate-500 mt-1 max-w-[280px]">{description}</p>}
      </div>
      <div className="sm:w-64 shrink-0">{children}</div>
    </div>
  );

  const Toggle = ({ field }: { field: any }) => {
    const value = getVal(field.section, field.key, field.def);
    const isTrue = value === 'True' || value === 'true' || value === '1';
    return (
      <Field label={field.label} description={field.desc}>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); setVal(field.section, field.key, isTrue ? 'False' : 'True'); }}
          className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-all ${isTrue ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400 border border-white/10 hover:border-white/20'}`}
        >
          {isTrue ? 'Enabled' : 'Disabled'}
        </button>
      </Field>
    );
  };

  const NumberInput = ({ field }: { field: any }) => {
    const value = getVal(field.section, field.key, field.def);
    return (
      <Field label={field.label} description={field.desc}>
        <input type="number" step={field.step || 1} value={Number(value)} onChange={e => setVal(field.section, field.key, e.target.value)} className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors" />
      </Field>
    );
  };

  const TextInput = ({ field }: { field: any }) => {
    const value = getVal(field.section, field.key, field.def);
    return (
      <Field label={field.label} description={field.desc}>
        <input type="text" value={String(value)} onChange={e => setVal(field.section, field.key, e.target.value)} className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors" />
      </Field>
    );
  };

  const TextAreaInput = ({ field }: { field: any }) => {
    const value = getVal(field.section, field.key, field.def);
    const [customColor, setCustomColor] = useState('#e2a85c');
    const [showGradientBuilder, setShowGradientBuilder] = useState(false);
    const [gradientText, setGradientText] = useState('');
    const [gradColor1, setGradColor1] = useState('#f59e0b');
    const [gradColor2, setGradColor2] = useState('#3b82f6');
    const [gradMode, setGradMode] = useState<'char' | 'word'>('char');

    const hexToArkColor = (hex: string): string => {
      const cleanHex = hex.replace(/^#/, '');
      if (cleanHex.length !== 6) return '1,1,1,1';
      const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
      const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
      const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
      return `${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)},1`;
    };

    const interpolateHex = (color1: string, color2: string, ratio: number): string => {
      const c1 = color1.replace('#', '');
      const c2 = color2.replace('#', '');
      const r1 = parseInt(c1.substring(0, 2), 16);
      const g1 = parseInt(c1.substring(2, 4), 16);
      const b1 = parseInt(c1.substring(4, 6), 16);
      const r2 = parseInt(c2.substring(0, 2), 16);
      const g2 = parseInt(c2.substring(2, 4), 16);
      const b2 = parseInt(c2.substring(4, 6), 16);

      const r = Math.round(r1 + (r2 - r1) * ratio);
      const g = Math.round(g1 + (g2 - g1) * ratio);
      const b = Math.round(b1 + (b2 - b1) * ratio);

      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    };

    const interpolateColors = (color1: string, color2: string, steps: number): string[] => {
      const c1 = color1.replace('#', '');
      const c2 = color2.replace('#', '');
      const r1 = parseInt(c1.substring(0, 2), 16);
      const g1 = parseInt(c1.substring(2, 4), 16);
      const b1 = parseInt(c1.substring(4, 6), 16);
      const r2 = parseInt(c2.substring(0, 2), 16);
      const g2 = parseInt(c2.substring(2, 4), 16);
      const b2 = parseInt(c2.substring(4, 6), 16);

      const colors = [];
      for (let i = 0; i < steps; i++) {
        const ratio = steps > 1 ? i / (steps - 1) : 0.5;
        const r = (r1 + (r2 - r1) * ratio) / 255;
        const g = (g1 + (g2 - g1) * ratio) / 255;
        const b = (b1 + (b2 - b1) * ratio) / 255;
        colors.push(`${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)},1`);
      }
      return colors;
    };

    const insertColorTag = (colorStr: string) => {
      const textarea = document.getElementById(`textarea-${field.key}`) as HTMLTextAreaElement;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentText = String(value);
      const selectedText = currentText.substring(start, end);

      const replacement = `<RichColor Color="${colorStr}">${selectedText || 'Text'}</>`;
      const newText = currentText.substring(0, start) + replacement + currentText.substring(end);
      
      setVal(field.section, field.key, newText);

      setTimeout(() => {
        textarea.focus();
        const newCursorPos = start + `<RichColor Color="${colorStr}">`.length + (selectedText ? selectedText.length : 4);
        textarea.setSelectionRange(
          selectedText ? newCursorPos : start + `<RichColor Color="${colorStr}">`.length,
          selectedText ? newCursorPos : start + `<RichColor Color="${colorStr}">`.length + 4
        );
      }, 50);
    };

    const insertNewline = () => {
      const textarea = document.getElementById(`textarea-${field.key}`) as HTMLTextAreaElement;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentText = String(value);

      const newText = currentText.substring(0, start) + '\\n' + currentText.substring(end);
      setVal(field.section, field.key, newText);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + 2, start + 2);
      }, 50);
    };

    const generateGradientTags = (): string => {
      if (!gradientText) return '';
      
      if (gradMode === 'char') {
        const chars = Array.from(gradientText);
        const colors = interpolateColors(gradColor1, gradColor2, chars.length);
        return chars.map((char, i) => {
          if (char === ' ') return ' ';
          return `<RichColor Color="${colors[i]}">${char}</>`;
        }).join('');
      } else {
        const words = gradientText.split(' ');
        const colors = interpolateColors(gradColor1, gradColor2, words.length);
        return words.map((word, i) => {
          return `<RichColor Color="${colors[i]}">${word}</>`;
        }).join(' ');
      }
    };

    const insertGradientTag = () => {
      const generated = generateGradientTags();
      if (!generated) return;

      const textarea = document.getElementById(`textarea-${field.key}`) as HTMLTextAreaElement;
      if (!textarea) {
        setVal(field.section, field.key, String(value) + generated);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentText = String(value);

      const newText = currentText.substring(0, start) + generated + currentText.substring(end);
      setVal(field.section, field.key, newText);
      setShowGradientBuilder(false);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + generated.length, start + generated.length);
      }, 50);
    };

    const renderGradPreview = () => {
      if (!gradientText) return null;
      if (gradMode === 'char') {
        const chars = Array.from(gradientText);
        return chars.map((char, i) => {
          const ratio = chars.length > 1 ? i / (chars.length - 1) : 0.5;
          const style = { color: interpolateHex(gradColor1, gradColor2, ratio) };
          return (
            <span key={i} style={style}>
              {char}
            </span>
          );
        });
      } else {
        const words = gradientText.split(' ');
        return words.map((word, i) => {
          const ratio = words.length > 1 ? i / (words.length - 1) : 0.5;
          const style = { color: interpolateHex(gradColor1, gradColor2, ratio) };
          return (
            <span key={i} style={style} className="mr-1">
              {word}
            </span>
          );
        });
      }
    };

    const renderMotdPreview = (text: string) => {
      if (!text) return <span className="text-slate-500 italic text-xs">No message entered yet.</span>;

      const lines = text.split('\\n');

      return lines.map((line, lineIdx) => {
        const elements: React.ReactNode[] = [];
        const regex = /<RichColor\s+Color="([^"]+)">([\s\S]*?)<\/>/gi;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(line)) !== null) {
          const matchIndex = match.index;
          if (matchIndex > lastIndex) {
            elements.push(<span key={lastIndex}>{line.substring(lastIndex, matchIndex)}</span>);
          }

          const colorParts = match[1].split(',').map(c => parseFloat(c.trim()));
          const textVal = match[2];

          if (colorParts.length >= 3) {
            const r = Math.round((colorParts[0] || 0) * 255);
            const g = Math.round((colorParts[1] || 0) * 255);
            const b = Math.round((colorParts[2] || 0) * 255);
            const a = colorParts[3] !== undefined ? colorParts[3] : 1;
            const style = { color: `rgba(${r}, ${g}, ${b}, ${a})` };

            elements.push(
              <span key={matchIndex} style={style} className="font-bold">
                {textVal}
              </span>
            );
          } else {
            elements.push(<span key={matchIndex}>{match[0]}</span>);
          }

          lastIndex = regex.lastIndex;
        }

        if (lastIndex < line.length) {
          elements.push(<span key={lastIndex}>{line.substring(lastIndex)}</span>);
        }

        return (
          <div key={lineIdx} className="min-h-[1.2em]">
            {elements.length > 0 ? elements : <span className="opacity-0">.</span>}
          </div>
        );
      });
    };

    return (
      <Field label={field.label} description={field.desc}>
        <div className="w-full flex flex-col gap-2">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-900/60 p-2 rounded-t-xl border border-white/5 border-b-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 select-none mr-1">Colors:</span>
            {[
              { name: 'Red', color: '1,0,0,1', bg: 'bg-red-500' },
              { name: 'Green', color: '0,1,0,1', bg: 'bg-emerald-500' },
              { name: 'Blue', color: '0,0.5,1,1', bg: 'bg-blue-500' },
              { name: 'Yellow', color: '1,1,0,1', bg: 'bg-amber-400' },
              { name: 'Orange', color: '1,0.65,0,1', bg: 'bg-orange-500' },
              { name: 'Cyan', color: '0,1,1,1', bg: 'bg-cyan-400' },
              { name: 'White', color: '1,1,1,1', bg: 'bg-white' },
            ].map(c => (
              <button
                key={c.name}
                type="button"
                onClick={() => insertColorTag(c.color)}
                className={`w-5 h-5 rounded-full border border-white/10 hover:scale-110 active:scale-95 transition-all shadow-sm ${c.bg}`}
                title={`Format selection to ${c.name}`}
              />
            ))}

            {/* Custom Color Picker */}
            <label
              className="w-5 h-5 rounded-full border border-white/10 hover:scale-110 active:scale-95 transition-all shadow-sm cursor-pointer flex items-center justify-center relative"
              style={{ background: 'linear-gradient(to right, red, orange, yellow, green, blue, indigo, violet)' }}
              title="Choose custom color"
            >
              <input
                type="color"
                value={customColor}
                onChange={(e) => {
                  const arkColor = hexToArkColor(e.target.value);
                  insertColorTag(arkColor);
                  setCustomColor(e.target.value);
                }}
                className="sr-only opacity-0 absolute w-0 h-0 cursor-pointer"
              />
            </label>

            <div className="h-4 w-px bg-slate-800 mx-1" />

            <button
              type="button"
              onClick={insertNewline}
              className="px-2.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white border border-white/5 text-[10px] font-bold transition-colors"
              title="Insert literal newline \n tag"
            >
              + New Line (\n)
            </button>

            <button
              type="button"
              onClick={() => {
                const textarea = document.getElementById(`textarea-${field.key}`) as HTMLTextAreaElement;
                if (textarea) {
                  const selected = String(value).substring(textarea.selectionStart, textarea.selectionEnd);
                  if (selected) {
                    setGradientText(selected);
                  }
                }
                setShowGradientBuilder(!showGradientBuilder);
              }}
              className={`px-2.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${showGradientBuilder ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-white/5'}`}
              title="Create beautiful multi-color gradient text"
            >
              🎨 Gradient Builder
            </button>
          </div>

          {/* Gradient Builder Panel */}
          {showGradientBuilder && (
            <div className="flex flex-col gap-3 bg-slate-900/40 p-3 rounded-lg border border-white/5 mb-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400">Multi-Color Gradient Builder</span>
                <span className="text-[10px] text-slate-500">Generates ArkML color codes dynamically</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Input Text */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Text to Colorize</label>
                  <input
                    type="text"
                    value={gradientText}
                    onChange={e => setGradientText(e.target.value)}
                    placeholder="Enter text to make gradient..."
                    className="px-3 py-1.5 bg-slate-950/60 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500/40"
                  />
                </div>

                {/* Mode & Colors */}
                <div className="flex items-end gap-3">
                  {/* Colors */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Colors (Start → End)</label>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <label className="w-8 h-8 rounded-lg border border-white/10 hover:border-white/20 transition-all shadow-sm cursor-pointer flex items-center justify-center border-dashed" style={{ backgroundColor: gradColor1 }}>
                          <input type="color" value={gradColor1} onChange={e => setGradColor1(e.target.value)} className="sr-only opacity-0 absolute w-0 h-0" />
                        </label>
                      </div>
                      <span className="text-slate-500 text-xs">→</span>
                      <div className="relative">
                        <label className="w-8 h-8 rounded-lg border border-white/10 hover:border-white/20 transition-all shadow-sm cursor-pointer flex items-center justify-center border-dashed" style={{ backgroundColor: gradColor2 }}>
                          <input type="color" value={gradColor2} onChange={e => setGradColor2(e.target.value)} className="sr-only opacity-0 absolute w-0 h-0" />
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Mode Toggle */}
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Spread Mode</label>
                    <div className="flex rounded-lg overflow-hidden border border-white/10 bg-slate-950/60 p-0.5">
                      <button
                        type="button"
                        onClick={() => setGradMode('char')}
                        className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${gradMode === 'char' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'text-slate-400 hover:text-white'}`}
                      >
                        Smooth (Letter)
                      </button>
                      <button
                        type="button"
                        onClick={() => setGradMode('word')}
                        className={`flex-1 py-1 text-[10px] font-bold rounded transition-all ${gradMode === 'word' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'text-slate-400 hover:text-white'}`}
                      >
                        Bold (Word)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Preview */}
              {gradientText && (
                <div className="flex flex-col gap-1 bg-slate-950/30 p-2.5 rounded-lg border border-white/5">
                  <span className="text-[9px] font-bold text-slate-500 uppercase">Live Builder Preview</span>
                  <div className="text-sm font-semibold tracking-wide flex flex-wrap select-none">
                    {renderGradPreview()}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setShowGradientBuilder(false)}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-350 text-xs font-medium transition-colors border border-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!gradientText}
                  onClick={insertGradientTag}
                  className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-amber-500/20"
                >
                  Insert Gradient
                </button>
              </div>
            </div>
          )}

          {/* Text Area */}
          <textarea
            id={`textarea-${field.key}`}
            value={String(value)}
            onChange={e => setVal(field.section, field.key, e.target.value)}
            placeholder={field.desc || 'Enter server welcome message...'}
            rows={4}
            className="w-full px-3 py-2 bg-slate-850/50 border border-white/10 rounded-b-xl text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors resize-y min-h-[90px]"
          />

          {/* Real-time Game Preview */}
          <div className="mt-1 flex flex-col gap-1.5 bg-slate-950/40 border border-white/5 rounded-2xl p-4">
            <div className="text-[10px] uppercase font-black text-slate-500 tracking-wider flex items-center justify-between">
              <span>In-Game Broadcast Preview</span>
              <span className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold px-1.5 py-0.5 rounded">Real-Time</span>
            </div>
            <div className="text-sm font-semibold tracking-wide leading-relaxed p-2.5 rounded-xl bg-black/30 border border-slate-900/60 font-sans break-words select-none max-h-[150px] overflow-y-auto custom-scrollbar text-left">
              {renderMotdPreview(String(value))}
            </div>
          </div>
        </div>
      </Field>
    );
  };

  const SelectInput = ({ field }: { field: any }) => {
    const value = getVal(field.section, field.key, field.def);
    return (
      <Field label={field.label} description={field.desc}>
        <div className="relative">
          <select value={String(value)} onChange={e => setVal(field.section, field.key, e.target.value)} className="w-full appearance-none px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors">
            {field.options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </Field>
    );
  };

  const renderField = (field: any) => {
    if (field.type === 'text') return <TextInput key={`${field.section}-${field.key}`} field={field} />;
    if (field.type === 'textarea') return <TextAreaInput key={`${field.section}-${field.key}`} field={field} />;
    if (field.type === 'number') return <NumberInput key={`${field.section}-${field.key}`} field={field} />;
    if (field.type === 'toggle') return <Toggle key={`${field.section}-${field.key}`} field={field} />;
    if (field.type === 'select') return <SelectInput key={`${field.section}-${field.key}`} field={field} />;
    return null;
  };

  if (activeTab === 'search') {
    return (
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-amber-500 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">Search Results</h3>
        {searchResults.length > 0 ? searchResults.map(renderField) : (
          <p className="text-slate-400 text-sm italic py-4">No settings found matching "{searchQuery}"</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {schema.filter(f => f.tab === activeTab).map(renderField)}
    </div>
  );
}
