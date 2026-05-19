import { useMemo } from 'react';
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
    { tab: 'breeding', section: '/Script/ShooterGame.ShooterGameMode', type: 'number', key: 'MutagenLevelBoostBred', label: 'Mutagen Level Boost (Bred)', def: 1 },
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
    { tab: 'advanced', section: 'MessageOfTheDay', type: 'text', key: 'Message', label: 'Message of the Day', desc: 'Shown to players when they join', def: '' },
    { tab: 'advanced', section: 'MessageOfTheDay', type: 'number', key: 'Duration', label: 'MOTD Duration (Secs)', def: 20 },
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
        <button onClick={() => setVal(field.section, field.key, isTrue ? 'False' : 'True')} className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-all ${isTrue ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400 border border-white/10 hover:border-white/20'}`}>
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
