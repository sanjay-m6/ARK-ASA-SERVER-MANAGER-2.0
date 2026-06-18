import React, { useState, useEffect, useMemo, memo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Save, RotateCcw, ChevronDown, ChevronUp, Check, Sparkles, CheckSquare, Settings2, Users, Flame, Hammer, MonitorPlay, Search, Shield, Globe, Cpu, Map, Download, FileText, Database, Loader2, Sliders, AlertTriangle, X, ExternalLink, Copy, GraduationCap, BarChart3, RefreshCw, TerminalSquare, Lock, Unlock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useAseServerStore } from '../stores/aseServerStore';
import ServerSelect from '../../components/ui/ServerSelect';
import { readAseConfig, writeAseConfig, updateAseServer, getAseLaunchArguments, syncAseServerFromIni, getAseConfigDiagnostics, readAseIniRaw, writeAseIniRaw, validateAseConfig } from '../utils/aseCommands';
import { AseGameConfig, AseDiagnostics, ValidationResult } from '../types/ase.types';
import { EngramOverridesEditor } from '../../components/config/EngramOverridesEditor';
import { CraftingCostEditor } from '../../components/config/CraftingCostEditor';
import { PresetSelector } from '../../components/config/PresetSelector';
import { ArrayEditor } from '../../components/config/ArrayEditor';
import { ConfigPreset, saveCustomPreset } from '../../data/presets';
import { AseStatMultiplierEditor } from '../components/config/AseStatMultiplierEditor';
import { AseLevelGenerator } from '../components/config/AseLevelGenerator';
import ASEEnvironmentManager from './ASEEnvironmentManager';
import { CodeEditor } from '../../components/ui/CodeEditor';
import { cn } from '../../utils/helpers';
import aseLogo from '../../assets/ASE.png';
import { ASE_MAPS } from '../data/aseMaps';
import { getModdedMapByMapArg, buildLaunchArgs } from '../../data/moddedMapRegistry';

const defaultConfig: AseGameConfig = {
  // Identity
  sessionName: 'My ASE Server', serverPassword: '', serverAdminPassword: 'admin123', maxPlayers: 70, RCONServerLogBuffer: 600,
  // Difficulty
  difficultyOffset: 1.0, overrideOfficialDifficulty: 5.0, MaxDifficulty: false,
  // Core Rates
  xpMultiplier: 1.0, tamingSpeedMultiplier: 1.0, harvestAmountMultiplier: 1.0, harvestHealthMultiplier: 1.0,
  resourcesRespawnPeriodMultiplier: 1.0, itemStackSizeMultiplier: 1.0,
  // Player Stats
  playerCharacterFoodDrainMultiplier: 1.0, playerCharacterWaterDrainMultiplier: 1.0, playerCharacterStaminaDrainMultiplier: 1.0,
  playerCharacterHealthRecoveryMultiplier: 1.0, playerDamageMultiplier: 1.0, playerResistanceMultiplier: 1.0,
  // Dino Stats
  dinoCharacterFoodDrainMultiplier: 1.0, dinoCharacterHealthRecoveryMultiplier: 1.0, dinoCharacterStaminaDrainMultiplier: 1.0, dinoDamageMultiplier: 1.0,
  dinoResistanceMultiplier: 1.0, maxTamedDinos: 5000, dinoCountMultiplier: 1.0, wildDinoTorporDrainMultiplier: 1.0,
  tamedDinoTorporDrainMultiplier: 1.0, passiveTameIntervalMultiplier: 1.0, useSingleplayerSettings: false,
  disableDinoBreeding: false, allowUnclaimDinos: false, useDinoLevelUpAnimations: true, maxPersonalTamedDinos: 40,
  personalTamedDinosSaddleStructureCost: 0.0,
  tamedDinoDamageMultiplier: 1.0,
  tamedDinoResistanceMultiplier: 1.0,
  bUseTameLimitForStructuresOnly: false,
  bAllowRaidDinoFeeding: false,
  raidDinoCharacterFoodDrainMultiplier: 1.0,
  forceAllowCaveFlyers: false,
  preventDinoMateBoost: false,
  disableDinoDecayPve: false,
  allowDinoLevelUpAnimation: true,
  bAllowFlyingStaminaRecovery: false,
  bAllowMultipleAttachedC4: false,
  disableDinoDecayPvp: false,
  bAllowFlyerSpeedLeveling: false,
  bAllowUnclaimDinos: true,
  bDisableDinoRiding: false,
  bDisableDinoTaming: false,
  bDisableDinoBreeding: false,
  dinoSpawnWeightMultipliers: [],
  dinoClassDamageMultipliers: [],
  dinoClassResistanceMultipliers: [],
  tamedDinoClassDamageMultipliers: [],
  tamedDinoClassResistanceMultipliers: [],
  npcReplacements: [],
  preventDinoTameClassNames: [],
  excludeDinoClasses: [],
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
  backupQuantity: 20,
  newSaveGameFormat: false,
  useStore: false,
  backupTransferPlayerDatas: false,
  motdIntervalEnabled: false,
  motdInterval: 60,
  enableExtinctionEvent: false,
  extinctionEventTimeInterval: 30,
  // Events
  activeEvent: '', eventColorsChanceOverride: 0.0,
  // Administration
  badWordFilter: '', adminList: '', customDynamicConfigUrl: '', customLiveTuningUrl: '', useSecureSpawnRules: false,
  useItemDupeCheck: false, secureSendArkPayload: false, culture: '',
  // Launcher
  launcherArgs: '', useAllAvailableCores: true, useLowMemory: false, noBattleEye: false, enableAutomanagedMods: false,
  // Specific Maps
  ragnarokVolcanoIntensity: 1.0, ragnarokVolcanoInterval: 0.0, enableRagnarokSettings: false,
  useFjordurTraversalBuff: true, enableFjordurSettings: false, adjustableMutagenSpawnDelayMultiplier: 1.0,
  // Chat & Voice
  globalVoiceChat: false, proximityVoiceChat: false, alwaysNotifyPlayerJoined: false, alwaysNotifyPlayerLeft: false, serverAdminCommandLogging: false,
  // PvP & PvE Advanced
  bDisableFriendlyFire: false, allowCryoCooldownOnPvE: false, disableCryopodEnemyCheck: false, enableCryoSicknessPvp: true, pvpZoneStructureDamageMultiplier: 6.0, structureDamageRepairCooldown: 180.0,
  // Player Stats / Diseases / Food / Flyer
  nonPermanentDiseases: false, preventDiseases: false, tamedDinoCharacterFoodDrainMultiplier: 1.0, wildDinoCharacterFoodDrainMultiplier: 1.0, allowFlyingStaminaRecovery: false,
  // Core Rates
  clampResourceHarvestDamage: false, optimizedHarvestingHealth: false, tamedDinoHarvestingDamageMultiplier: 1.0, dinoTurretDamageMultiplier: 1.0,
  // Structures & Decay
  structureDecayPeriodMultiplier: 1.0, pveDinoDecayPeriodMultiplier: 1.0, fastDecayUnsnappedCoreStructures: false, bAllowPlatformSaddleMultiFloors: false, flyerPlatformMaxStructuresMultiplier: 1.0,

  // Classic ASM Full Options Integration
  badWordListUrl: '', badWordWhiteListUrl: '', bFilterTribeNames: false, bFilterCharacterNames: false, bFilterChat: false,
  banListUrl: '', useBanListUrl: false, useDynamicConfigUrl: false, useCustomLiveTuningUrl: false,
  kickIdlePlayersPeriod: 3600.0, enableIdleTimeout: false, noPlayervac: false, noAntiSpeedHack: false,
  speedHackCpuBias: 1.0, disableMovementValidation: false, outputServerLogToConsole: true, noHangDet: false,
  noDinos: false, noUnderMeshChecking: false, noUnderMeshKilling: false, enableVivox: false,
  allowSharedConnections: false, creatureUploadIssueProtection: false, additionalDupeProtection: false,
  secureItemDinoSpawningRules: false, forceRespawnDinosOnStartup: false, enableAutoForceRespawnDinos: false,
  autoForceRespawnDinosInterval: 24.0, forceDirectX10: false, forceShaderModel4: false, forceLowMemory: false,
  forceNoManSky: false, useNoMemoryBias: false, stasisKeepControllers: false, serverAllowAnsel: false,
  structureMemoryOptimizations: false, structureStasisGrid: false, enableCrossplay: false,
  enablePublicIpForEpic: false, epicStorePlayersOnly: false, alternateSaveDirectoryName: '',
  clusterDirectoryOverride: '', serverLanguage: '', useClusterDirectoryOverride: false, harvestResourceItemAmountClassMultipliers: '',
  levelExperienceRampOverrides: '', overrideMaxExperiencePointsPlayer: '', overrideMaxExperiencePointsDino: '',

  playerHarvestingDamageMultiplier: 1.0,
  craftingSkillBonusMultiplier: 1.0,
  maxFallSpeedMultiplier: 1.0,
  playerBaseStatMultipliers: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  perLevelStatsMultiplierPlayer: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  perLevelStatsMultiplierDinoWild: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  perLevelStatsMultiplierDinoTamed: [0.2, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.17, 1.0, 1.0, 1.0],
  perLevelStatsMultiplierDinoTamedAdd: [0.14, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.14, 1.0, 1.0, 1.0],
  perLevelStatsMultiplierDinoTamedAffinity: [0.44, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.44, 1.0, 1.0, 1.0],
  mutagenLevelBoostArray: [5, 5, 0, 0, 0, 0, 0, 5, 5, 0, 0, 0],
  mutagenLevelBoostBredArray: [1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
};

type ConfigFile = 'GameUserSettings.ini' | 'Game.ini';
type TabType = 'administration' | 'general' | 'rates' | 'player' | 'breeding' | 'structures' | 'pvp' | 'tribe' | 'transfer' | 'environment' | 'engrams' | 'admin' | 'advanced' | 'server_options' | 'search' | 'diagnostics' | 'stats' | 'levels';

const FieldWrapper = memo(({ label, description, children, file, layout = 'vertical' }: { label: string; description?: string; children: React.ReactNode; file?: string; layout?: 'horizontal' | 'vertical' }) => {
  return (
    <div className={cn(
      "p-5 rounded-2xl border border-slate-800/80 bg-slate-950/20 hover:bg-slate-950/40 transition-all duration-300 hover:scale-[1.01] hover:border-amber-500/35 hover:shadow-[0_4px_25px_rgba(245,158,11,0.05)] group relative flex flex-col justify-between gap-4 w-full min-h-[120px]",
      layout === 'horizontal' ? "sm:flex-row sm:items-start" : "flex-col"
    )}>
      <div className="flex-1 min-w-0 z-10 text-left">
        <div className="text-slate-200 font-bold tracking-wide flex items-center gap-2 mb-1.5 text-sm group-hover:text-white transition-colors">{label}</div>
        {description && <div className="text-xs text-slate-400 leading-relaxed font-medium">{description}</div>}
        {file && (
          <div className="mt-3 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 text-[9px] uppercase font-black text-slate-400 border border-slate-800/80">
            {file}
          </div>
        )}
      </div>
      <div className={cn(
        "z-10",
        layout === 'horizontal' ? "w-auto shrink-0 flex justify-end items-start" : "w-full"
      )}>
        {children}
      </div>
    </div>
  );
});
FieldWrapper.displayName = 'FieldWrapper';

const Toggle = memo(({ label, value, onChange, desc, file }: { label: string; value: boolean; onChange: (v: boolean) => void; desc?: string; file?: string }) => (
  <FieldWrapper label={label} description={desc} file={file} layout="horizontal">
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); onChange(!value); }}
      className={cn(
        "relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none flex-shrink-0 mt-1",
        value
          ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30"
          : "bg-slate-800 border border-slate-700/50"
      )}
    >
      <span
        className={cn(
          "block w-5 h-5 rounded-full bg-white shadow-lg transform transition-all duration-300",
          value ? "translate-x-8" : "translate-x-1"
        )}
      />
    </button>
  </FieldWrapper>
));
Toggle.displayName = 'Toggle';

const NumberInput = memo(({ label, value, onChange, desc, step = 1, file }: { label: string; value: number; onChange: (v: number) => void; desc?: string; step?: number; file?: string }) => {
  const [localValue, setLocalValue] = useState<string>(String(value));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <FieldWrapper label={label} description={desc} file={file} layout="vertical">
      <input
        type="number"
        step={step}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none font-mono transition-all text-sm placeholder-slate-600 shadow-inner"
      />
    </FieldWrapper>
  );
});
NumberInput.displayName = 'NumberInput';

const TextInput = memo(({ label, value, onChange, desc, placeholder, file }: { label: string; value: string; onChange: (v: string) => void; desc?: string; placeholder?: string; file?: string }) => {
  const [localValue, setLocalValue] = useState<string>(value || '');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalValue(value || '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setLocalValue(e.target.value);
  const handleBlur = () => onChange(localValue);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  return (
    <FieldWrapper label={label} description={desc} file={file} layout="vertical">
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none font-mono transition-all text-sm placeholder-slate-600 shadow-inner"
      />
    </FieldWrapper>
  );
});
TextInput.displayName = 'TextInput';

const TextAreaInput = memo(({ label, value, onChange, desc, placeholder, file, idKey }: { label: string; value: string; onChange: (v: string) => void; desc?: string; placeholder?: string; file?: string; idKey: string }) => {
  const [localValue, setLocalValue] = useState<string>(value || '');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalValue(value || '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
    onChange(e.target.value);
  };

  const handleBlur = () => onChange(localValue);

  const insertColorTag = (colorStr: string) => {
    const textarea = document.getElementById(`textarea-${idKey}`) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = localValue;
    const selectedText = currentText.substring(start, end);

    const replacement = `<RichColor Color="${colorStr}">${selectedText || 'Text'}</>`;
    const newText = currentText.substring(0, start) + replacement + currentText.substring(end);
    
    setLocalValue(newText);
    onChange(newText);

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
    const textarea = document.getElementById(`textarea-${idKey}`) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = localValue;

    const newText = currentText.substring(0, start) + '\\n' + currentText.substring(end);
    setLocalValue(newText);
    onChange(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 2, start + 2);
    }, 50);
  };

  return (
    <FieldWrapper label={label} description={desc} file={file} layout="vertical">
      <div className="w-full flex flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950/80 p-2.5 rounded-t-xl border border-slate-800/85 border-b-0">
          <span className="text-[10px] uppercase font-bold text-slate-500 select-none mr-1">MOTD Colors:</span>
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
              className={cn(
                "w-5 h-5 rounded-full border border-white/10 hover:scale-110 active:scale-95 transition-all shadow-sm",
                c.bg
              )}
              title={`Format selection to ${c.name}`}
            />
          ))}
          <div className="h-4 w-px bg-slate-850 mx-1" />
          <button
            type="button"
            onClick={insertNewline}
            className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800/80 text-[10px] font-bold transition-colors"
            title="Insert literal newline \n tag"
          >
            + New Line (\n)
          </button>
        </div>

        {/* Text Area */}
        <textarea
          id={`textarea-${idKey}`}
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder || 'Enter server welcome message... Use \\n for line breaks, or color presets above.'}
          rows={4}
          className="w-full bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 rounded-b-xl px-4 py-3 text-slate-200 focus:outline-none font-mono transition-all text-sm placeholder-slate-650 shadow-inner resize-y min-h-[90px]"
        />

        {/* Real-time Game Preview */}
        <div className="mt-2.5 flex flex-col gap-1.5 bg-slate-950/40 border border-white/5 rounded-2xl p-4">
          <div className="text-[10px] uppercase font-black text-slate-500 tracking-wider flex items-center justify-between">
            <span>In-Game Broadcast Preview</span>
            <span className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold px-1.5 py-0.5 rounded">Real-Time</span>
          </div>
          <div className="text-sm font-semibold tracking-wide leading-relaxed p-2.5 rounded-xl bg-black/30 border border-slate-900/60 font-sans break-words select-none max-h-[150px] overflow-y-auto custom-scrollbar text-left">
            {renderMotdPreview(localValue)}
          </div>
        </div>
      </div>
    </FieldWrapper>
  );
});
TextAreaInput.displayName = 'TextAreaInput';

const SelectInput = memo(({ label, value, onChange, desc, options, file }: { label: string; value: string; onChange: (v: string) => void; desc?: string; options: { label: string; value: string }[]; file?: string }) => (
  <FieldWrapper label={label} description={desc} file={file} layout="vertical">
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 rounded-xl px-4 py-2.5 pr-10 text-slate-200 focus:outline-none transition-all cursor-pointer text-sm font-medium shadow-inner"
      >
        {options.map(opt => <option key={opt.value} value={opt.value} className="bg-[#121225]">{opt.label}</option>)}
      </select>
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  </FieldWrapper>
));
SelectInput.displayName = 'SelectInput';

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

export default function ASEConfigEditor() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { servers } = useAseServerStore();
  const [selectedServer, setSelectedServer] = useState<number | null>(servers[0]?.id || null);

  // Auto-select first server if none selected and servers are available
  useEffect(() => {
    if (location.state?.serverId && servers.some(s => s.id === location.state.serverId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedServer(location.state.serverId);
    } else if (!selectedServer && servers.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedServer(servers[0].id);
    }
  }, [servers, selectedServer, location.state]);

  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [pendingServerSwitch, setPendingServerSwitch] = useState<number | null>(null);
  const [config, setConfig] = useState<AseGameConfig>(defaultConfig);
  const [activeFile, setActiveFile] = useState<ConfigFile>('GameUserSettings.ini');
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [isDirty, setIsDirty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [launchArgs, setLaunchArgs] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<AseDiagnostics | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [editorMode, setEditorMode] = useState<'visual' | 'raw'>('visual');
  const [rawIniContent, setRawIniContent] = useState<string>('');
  const [mapName, setMapName] = useState<string>('TheIsland');

  const [isLoading, setIsLoading] = useState(false);

  // Sidebar resize and collapse states
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const [viewMode, setViewMode] = useState<'visual' | 'raw-gus' | 'raw-game' | 'levels' | 'stats' | 'diagnostics'>('visual');

  // Preset selector states
  const [currentPreset, setCurrentPreset] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  // Peer port lock state
  const [isPeerPortLocked, setIsPeerPortLocked] = useState(true);

  const loadLaunchArgs = async (id: number) => {
    try {
      const args = await getAseLaunchArguments(id);
      setLaunchArgs(args);
    } catch {
      setLaunchArgs([]);
    }
  };

  const loadDiagnostics = async (id: number) => {
    try {
      const diag = await getAseConfigDiagnostics(id);
      setDiagnostics(diag);
    } catch (e) {
      console.error('Failed to load diagnostics:', e);
      setDiagnostics(null);
    }

    setIsValidating(true);
    try {
      const val = await validateAseConfig(id);
      setValidationResult(val);
    } catch (e) {
      console.error('Failed to validate configuration:', e);
      setValidationResult(null);
    } finally {
      setIsValidating(false);
    }
  };

  const loadConfig = async (id: number) => {
    setIsLoading(true);
    try {
      await syncAseServerFromIni(id);
      const c = await readAseConfig(id);
      setConfig({ ...defaultConfig, ...c });
      setIsDirty(false);
    } catch (e) {
      console.error('Failed to load config:', e);
      setConfig(defaultConfig);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedServer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadConfig(selectedServer);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadLaunchArgs(selectedServer);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDiagnostics(selectedServer);
    }
  }, [selectedServer]);

  const [adminState, setAdminState] = useState({
    localIp: '',
    port: 7777,
    peerPort: 7778,
    queryPort: 27015,
    rconPort: 27020,
    activeMods: '',
    totalConversionId: '',
  });

  useEffect(() => {
    if (selectedServer) {
      const serverObj = servers.find(s => s.id === selectedServer);
      if (serverObj) {
        if (!isDirty || mapName === 'TheIsland') {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setMapName(serverObj.mapName || 'TheIsland');
        }

        let localIp = '';
        let peerPort = serverObj.port + 1;
        let totalConversionId = '';
        
        if (serverObj.extraArgs) {
          const multihomeMatch = serverObj.extraArgs.match(/-MultiHome=([\d.]+)/);
          if (multihomeMatch) localIp = multihomeMatch[1];
          
          const peerPortMatch = serverObj.extraArgs.match(/\?PeerPort=(\d+)/);
          if (peerPortMatch) peerPort = parseInt(peerPortMatch[1], 10);
          
          const tcMatch = serverObj.extraArgs.match(/-TotalConversionMod=(\d+)/);
          if (tcMatch) totalConversionId = tcMatch[1];
        }
        
        setAdminState({
          localIp,
          port: serverObj.port || 7777,
          peerPort,
          queryPort: serverObj.queryPort || 27015,
          rconPort: serverObj.rconPort || 27020,
          activeMods: serverObj.activeMods || '',
          totalConversionId,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServer, servers, isDirty]);


  useEffect(() => {
    const fetchRawIni = async () => {
      if (!selectedServer || editorMode !== 'raw') return;
      setIsLoading(true);
      try {
        const raw = await readAseIniRaw(selectedServer, activeFile);
        setRawIniContent(raw);
      } catch (e) {
        toast.error(`Failed to load raw INI: ${e}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRawIni();
  }, [selectedServer, activeFile, editorMode]);

  useEffect(() => {
    if (editorMode === 'visual' && selectedServer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadConfig(selectedServer);
    }
  }, [editorMode, selectedServer]);

  useEffect(() => {
    if (selectedServer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadLaunchArgs(selectedServer);
    }
  }, [config, selectedServer]);

  useEffect(() => {
    if (selectedServer && activeTab === 'diagnostics') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDiagnostics(selectedServer);
    }
  }, [activeTab, selectedServer]);

  const fetchLocalIp = async () => {
    try {
      const ip = await invoke<string>('get_local_ip');
      if (ip && ip !== '127.0.0.1') {
        setAdminState(prev => ({...prev, localIp: ip}));
        setIsDirty(true);
        toast.success(`Detected IP: ${ip}`);
      } else {
        toast.error("Could not determine local IP automatically");
      }
    } catch (err) {
      console.error("Failed to detect IP", err);
      toast.error("Failed to detect local IP");
    }
  };

  const insertMotdColorTag = (colorStr: string) => {
    const textarea = document.getElementById(`motd-textarea`) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = config.motd || '';
    const selectedText = currentText.substring(start, end);

    const replacement = `<RichColor Color="${colorStr}">${selectedText || 'Text'}</>`;
    const newText = currentText.substring(0, start) + replacement + currentText.substring(end);
    
    setConfig({...config, motd: newText});
    setIsDirty(true);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + `<RichColor Color="${colorStr}">`.length + (selectedText ? selectedText.length : 4);
      textarea.setSelectionRange(
        selectedText ? newCursorPos : start + `<RichColor Color="${colorStr}">`.length,
        selectedText ? newCursorPos : start + `<RichColor Color="${colorStr}">`.length + 4
      );
    }, 50);
  };

  const insertMotdNewline = () => {
    const textarea = document.getElementById(`motd-textarea`) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = config.motd || '';

    const newText = currentText.substring(0, start) + '\\n' + currentText.substring(end);
    setConfig({...config, motd: newText});
    setIsDirty(true);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 2, start + 2);
    }, 50);
  };

  const addFirewallRules = async () => {
    if (!selectedServer) return;
    try {
      const toastId = toast.loading('Adding firewall rules (requires admin)...');
      await invoke('create_ase_firewall_rules', { serverId: selectedServer });
      toast.success('Firewall rules added successfully!', { id: toastId });
    } catch (err) {
      console.error("Failed to add firewall rules", err);
      toast.error(`Failed to add firewall rules: ${err}`);
    }
  };

  const handleSave = useCallback(async () => {
    if (!selectedServer) return;
    setIsLoading(true);
    try {
      if (editorMode === 'visual') {
        await writeAseConfig(selectedServer, config);
        
        const server = servers.find(s => s.id === selectedServer);
        if (server) {
          let extraArgs = server.extraArgs || '';
          
          extraArgs = extraArgs.replace(/-MultiHome=[\d.]+\s*/g, '');
          if (adminState.localIp) {
            extraArgs += ` -MultiHome=${adminState.localIp.trim()}`;
          }
          
          extraArgs = extraArgs.replace(/\?PeerPort=\d+\s*/g, '');
          if (adminState.peerPort !== adminState.port + 1) {
            extraArgs += ` ?PeerPort=${adminState.peerPort}`;
          }
          
          extraArgs = extraArgs.replace(/-TotalConversionMod=\d+\s*/g, '');
          if (adminState.totalConversionId) {
            extraArgs += ` -TotalConversionMod=${adminState.totalConversionId.trim()}`;
          }
          
          await updateAseServer(selectedServer, { 
            mapName,
            port: adminState.port,
            queryPort: adminState.queryPort,
            rconPort: adminState.rconPort,
            activeMods: adminState.activeMods,
            extraArgs: extraArgs.trim()
          });
        }
      } else {
        await writeAseIniRaw(selectedServer, activeFile, rawIniContent);
      }
      // Force sync SQLite DB cache with the newly updated raw/visual INI
      await syncAseServerFromIni(selectedServer);
      // Reload configuration state so visual editor is updated
      const c = await readAseConfig(selectedServer);
      setConfig({ ...defaultConfig, ...c });
      setIsDirty(false);
      loadDiagnostics(selectedServer);
      // Refresh servers list to reflect updates in UI
      await useAseServerStore.getState().refreshServers();
      toast.success('Configuration saved successfully', {
        style: { background: '#10b981', color: '#fff', borderRadius: '12px' }
      });
    } catch (e) {
      toast.error(`Failed to save config: ${e}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedServer, editorMode, config, mapName, activeFile, rawIniContent]);

  // Ctrl+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !isLoading) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, isLoading, handleSave]);

  // Unsaved-changes guard on server switch
  const handleServerSwitch = useCallback((newServerId: number | null) => {
    if (isDirty && newServerId !== selectedServer) {
      setPendingServerSwitch(newServerId);
      setShowUnsavedWarning(true);
    } else {
      setSelectedServer(newServerId);
    }
  }, [isDirty, selectedServer]);

  const confirmServerSwitch = useCallback(() => {
    setShowUnsavedWarning(false);
    setIsDirty(false);
    if (pendingServerSwitch !== null) {
      setSelectedServer(pendingServerSwitch);
      setPendingServerSwitch(null);
    }
  }, [pendingServerSwitch]);

  const cancelServerSwitch = useCallback(() => {
    setShowUnsavedWarning(false);
    setPendingServerSwitch(null);
  }, []);

  // Sidebar resize handlers
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= 200 && newWidth <= 500) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleSwitchViewMode = async (mode: 'visual' | 'raw-gus' | 'raw-game' | 'levels' | 'stats' | 'diagnostics') => {
    if (viewMode === mode) return;

    if (mode === 'raw-gus') {
      setActiveFile('GameUserSettings.ini');
      setEditorMode('raw');
    } else if (mode === 'raw-game') {
      setActiveFile('Game.ini');
      setEditorMode('raw');
    } else {
      setEditorMode('visual');
      if (mode === 'levels' || mode === 'stats') {
        setActiveFile('Game.ini');
      } else {
        setActiveFile('GameUserSettings.ini');
      }
      if (mode === 'levels') {
        setActiveTab('levels');
      } else if (mode === 'stats') {
        setActiveTab('stats');
      } else if (mode === 'diagnostics') {
        setActiveTab('diagnostics');
      } else {
        if (activeTab === 'levels' || activeTab === 'stats' || activeTab === 'diagnostics') {
          setActiveTab('general');
        }
      }
    }
    setViewMode(mode);
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  const applyAsePreset = (preset: ConfigPreset, currentConfig: AseGameConfig): AseGameConfig => {
    const updatedConfig = { ...currentConfig } as Record<string, unknown>;
    const presetSettings = {
      ...preset.settings.GameUserSettings,
      ...preset.settings.Game
    };
    const configKeys = Object.keys(updatedConfig) as (keyof AseGameConfig)[];

    Object.entries(presetSettings).forEach(([presetKey, val]) => {
      const matchedKey = configKeys.find(
        k => k.toLowerCase() === presetKey.toLowerCase()
      );
      if (matchedKey) {
        const defaultValue = defaultConfig[matchedKey];
        if (typeof defaultValue === 'boolean') {
          updatedConfig[matchedKey] = val.toLowerCase() === 'true';
        } else if (typeof defaultValue === 'number') {
          updatedConfig[matchedKey] = parseFloat(val);
        } else {
          updatedConfig[matchedKey] = val;
        }
      }
    });
    return updatedConfig as unknown as AseGameConfig;
  };

  const handleApplyPreset = (preset: ConfigPreset) => {
    const newConfig = applyAsePreset(preset, config);
    setConfig(newConfig);
    setIsDirty(true);
    setCurrentPreset(preset.id);
    toast.success(`Preset "${preset.name}" applied`);
  };

  const update = (key: keyof AseGameConfig, val: string | number | boolean | number[] | string[]) => {
    setConfig(prev => ({ ...prev, [key]: val }));
    setIsDirty(true);
  };

  const handleRawChange = (val: string) => {
    setRawIniContent(val);
    setIsDirty(true);
  };

  const [isMapOpen, setIsMapOpen] = useState(false);
  const mapDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mapDropdownRef.current && !mapDropdownRef.current.contains(event.target as Node)) {
        setIsMapOpen(false);
      }
    };
    if (isMapOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMapOpen]);

  const selectedMapMeta = useMemo(() => {
    return ASE_MAPS.find(m => m.serverArg === mapName);
  }, [mapName]);

  const knownValues = useMemo(() => ASE_MAPS.map(m => m.serverArg), []);
  const isCustomValue = mapName !== '' && !knownValues.includes(mapName);
  const dropdownValue = isCustomValue ? '__CUSTOM__' : mapName;

  const groupedMaps = useMemo(() => {
    return {
      official: ASE_MAPS.filter(m => m.dlcType !== 'Workshop Mod'),
      modded: ASE_MAPS.filter(m => m.dlcType === 'Workshop Mod')
    };
  }, []);

  const handleMapChange = (newMap: string) => {
    setMapName(newMap);
    setIsDirty(true);

    // Auto-inject modded map parameters
    const preset = getModdedMapByMapArg(newMap, 'ASE');
    if (preset) {
      const updatedArgs = buildLaunchArgs(preset, config.launcherArgs || '');
      if (updatedArgs !== config.launcherArgs) {
        setConfig(prev => ({
          ...prev,
          launcherArgs: updatedArgs
        }));
        toast.success(`${preset.name} mod launch parameters auto-configured in Advanced tab!`);
      }
    }
  };

  const renderMapSelector = () => {
    return (
      <div className="p-5 rounded-2xl border border-slate-800/80 bg-slate-950/20 hover:bg-slate-950/40 transition-all duration-300 hover:border-amber-500/35 hover:shadow-[0_4px_25px_rgba(245,158,11,0.05)] flex flex-col gap-4 text-left">
        <div className="flex-1 min-w-0">
          <div className="text-slate-200 font-bold tracking-wide flex items-center gap-2 mb-1.5 text-sm group-hover:text-white transition-colors">
            Active Map Profile
          </div>
          <div className="text-xs text-slate-450 leading-relaxed font-medium">
            Select the active map for this ARK: Survival Evolved server instance.
          </div>
        </div>

        {/* Dropdown Container */}
        <div ref={mapDropdownRef} className="relative w-full z-20">
          <button
            type="button"
            onClick={() => setIsMapOpen(!isMapOpen)}
            className="w-full flex items-center justify-between bg-slate-950/60 border border-slate-800 hover:border-amber-500/50 rounded-xl px-4 py-3 text-white transition-all focus:outline-none focus:border-amber-500 focus:shadow-[0_0_15px_rgba(245,158,11,0.15)] text-left cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">
                {selectedMapMeta ? (selectedMapMeta.isModded ? '🏝️' : '🗺️') : (dropdownValue === '__CUSTOM__' ? '✏️' : '🗺️')}
              </span>
              <div>
                <div className="font-semibold text-slate-100 leading-tight">
                  {selectedMapMeta ? selectedMapMeta.name : (mapName || 'Custom Map')}
                </div>
                <div className="text-[10px] text-amber-500 font-semibold tracking-wider uppercase mt-0.5">
                  {selectedMapMeta ? (selectedMapMeta.author ? `${selectedMapMeta.dlcType} • By ${selectedMapMeta.author}` : selectedMapMeta.dlcType) : 'Custom Mod Map'}
                </div>
              </div>
            </div>
            {isMapOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
          </button>

          {/* Options Dropdown */}
          {isMapOpen && (
            <div className="absolute left-0 right-0 mt-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-[380px] overflow-y-auto backdrop-blur-md transition-all duration-200 z-30">
              
              {/* Official Maps */}
              <div className="px-4 py-2 text-[10px] font-bold text-slate-450 uppercase tracking-widest bg-slate-950/40 border-b border-white/5 flex items-center gap-1.5 select-none">
                <Globe className="w-3 h-3 text-amber-500" /> Official Maps
              </div>
              <div className="p-1.5 space-y-0.5">
                {groupedMaps.official.map(m => {
                  const isSelected = mapName === m.serverArg;
                  return (
                    <button
                      key={m.serverArg}
                      type="button"
                      onClick={() => {
                        handleMapChange(m.serverArg);
                        setIsMapOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-150",
                        isSelected 
                          ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium"
                          : "text-slate-355 hover:bg-slate-800/40 border border-transparent hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">🏝️</span>
                        <span>{m.name}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-amber-500" />}
                    </button>
                  );
                })}
              </div>

              {/* Modded Maps */}
              <div className="px-4 py-2 text-[10px] font-bold text-slate-450 uppercase tracking-widest bg-slate-950/40 border-t border-b border-white/5 flex items-center gap-1.5 select-none">
                <Sparkles className="w-3 h-3 text-amber-500" /> Workshop Modded Maps
              </div>
              <div className="p-1.5 space-y-0.5">
                {groupedMaps.modded.map(m => {
                  const isSelected = mapName === m.serverArg;
                  return (
                    <button
                      key={m.serverArg}
                      type="button"
                      onClick={() => {
                        handleMapChange(m.serverArg);
                        setIsMapOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-150",
                        isSelected 
                          ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium"
                          : "text-slate-355 hover:bg-slate-800/40 border border-transparent hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">⚙️</span>
                        <span>{m.name} {m.author && <span className="text-[10px] text-slate-500 font-normal">by {m.author}</span>}</span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-amber-500" />}
                    </button>
                  );
                })}
              </div>

              {/* Custom Selector */}
              <div className="border-t border-white/5 p-1.5">
                <button
                  type="button"
                  onClick={() => {
                    handleMapChange(isCustomValue ? mapName : '');
                    setIsMapOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-150",
                    dropdownValue === '__CUSTOM__' 
                      ? "bg-amber-500/10 border border-amber-500/20 text-amber-400 font-medium"
                      : "text-slate-355 hover:bg-slate-800/40 border border-transparent hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">✏️</span>
                    <span>Custom Map / Mod ID</span>
                  </div>
                  {dropdownValue === '__CUSTOM__' && <Check className="w-4 h-4 text-amber-500" />}
                </button>
              </div>

            </div>
          )}
        </div>

        {/* Custom Map Input Field */}
        {dropdownValue === '__CUSTOM__' && (
          <div className="space-y-2 relative z-10 animate-fadeIn">
            <label className="text-xs font-semibold text-amber-400/90 uppercase tracking-wider">Custom Map Name / Server Argument</label>
            <input
              type="text"
              value={mapName}
              onChange={(e) => handleMapChange(e.target.value)}
              placeholder="e.g. TheIslandReforged"
              className="w-full bg-slate-950/40 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 focus:shadow-[0_0_15px_rgba(245,158,11,0.15)] font-mono text-sm transition-all placeholder-slate-650"
            />
          </div>
        )}

        {/* Thematic Premium Map Preview Card */}
        <div className="relative rounded-2xl overflow-hidden border border-white/5 bg-slate-950 group/card min-h-[190px] flex flex-col justify-end transition-all duration-300 hover:border-amber-500/30 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] select-none">
          {selectedMapMeta ? (
            <>
              {selectedMapMeta.image && (
                <img 
                  src={selectedMapMeta.image} 
                  alt={selectedMapMeta.name} 
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover/card:scale-105" 
                />
              )}
              {/* overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
              
              {/* Badges */}
              <div className="absolute top-3 right-3 flex gap-1.5 items-center z-10">
                <span className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider bg-slate-950/80 border border-white/5 text-slate-300 backdrop-blur-md">
                  {selectedMapMeta.size}
                </span>
                <span 
                  className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider text-slate-950 backdrop-blur-md font-black bg-amber-500"
                >
                  {selectedMapMeta.dlcType}
                </span>
              </div>

              {/* Card Contents */}
              <div className="relative p-4 z-10">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🏝️</span>
                  <h4 className="font-black text-white text-base leading-tight drop-shadow-md">{selectedMapMeta.name}</h4>
                </div>
                {selectedMapMeta.author && (
                  <div className="text-[10px] text-amber-400 font-bold mb-1">
                    By {selectedMapMeta.author}
                  </div>
                )}
                <p className="text-xs text-slate-300 leading-normal drop-shadow-sm line-clamp-2">{selectedMapMeta.description}</p>
                {selectedMapMeta.mapModId && (
                  <div className="mt-2 text-[10px] text-slate-400 font-mono">
                    Mod ID: <span className="text-slate-200">{selectedMapMeta.mapModId}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="relative p-6 z-10 flex flex-col justify-center items-center h-full text-slate-500 bg-slate-950">
              <span className="text-4xl mb-2">🗺️</span>
              <div className="font-bold text-slate-350">Custom Modded Map Selected</div>
              <div className="text-xs text-slate-500 mt-1">Specify custom identifier launch arguments as needed.</div>
            </div>
          )}
        </div>
        
        {/* Total Conversion and Mods */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-300">Total Conversion ID</label>
            <input type="text" value={adminState.totalConversionId} onChange={e => { setAdminState({...adminState, totalConversionId: e.target.value}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" placeholder="Mod ID (e.g. 111111111)" />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-xs font-bold text-slate-300">Active Mod IDs</label>
            <input type="text" value={adminState.activeMods} onChange={e => { setAdminState({...adminState, activeMods: e.target.value}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" placeholder="Comma separated list (e.g. 123456, 789012)" />
            <p className="text-[10px] text-slate-500">List of workshop Mod IDs loaded on server startup. Multiple entries must be comma separated.</p>
          </div>
        </div>
      </div>
    );
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
      const valStr = trimmed.substring(equalsIdx + 1).trim();

      const field = schema.find(f => f.key === key);
      if (field) {
        let parsedVal: string | number | boolean = valStr;

        if (parsedVal.startsWith('"') && parsedVal.endsWith('"')) {
          parsedVal = parsedVal.substring(1, parsedVal.length - 1);
        }

        if (field.type === 'number') {
          const parsedNum = parseFloat(valStr);
          if (isNaN(parsedNum)) continue;
          parsedVal = parsedNum;
        } else if (field.type === 'toggle') {
          parsedVal = valStr.toLowerCase() === 'true' || valStr === '1';
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (newConfig as any)[key] = parsedVal;
        importedCount++;
      }
    }

    if (importedCount > 0) {
      setConfig(newConfig as AseGameConfig);
      setIsDirty(true);
      toast.success(`Imported ${importedCount} settings from INI`, { style: { background: '#10b981', color: '#fff' } });
      
      // Warn user to check the map setting
      setTimeout(() => {
        toast('Please verify your Map setting. It may not sync perfectly from INI imports and might need to be set manually.', {
          icon: '⚠️',
          duration: 6000,
          style: {
            background: '#0f172a', // slate-900
            color: '#fbbf24', // amber-400
            border: '1px solid rgba(245,158,11,0.3)',
            fontSize: '14px',
            maxWidth: '500px'
          }
        });
      }, 500);
    } else {
      toast.error('No matching settings found in the file');
    }
  };

  interface SchemaField {
    file: string;
    tab: string;
    type: string;
    key: string;
    label: string;
    desc?: string;
    step?: number;
    options?: { label: string; value: string }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    template?: Record<string, any>;
  }

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = useMemo(() => [
    { id: 'general', label: 'General', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'server_options', label: 'Server Options', icon: <Cpu className="w-4 h-4" /> },
    { id: 'rates', label: 'Rates & Multipliers', icon: <Flame className="w-4 h-4" /> },
    { id: 'stats', label: 'Stat Multipliers', icon: <Sliders className="w-4 h-4" /> },
    { id: 'levels', label: 'Level Generator', icon: <Flame className="w-4 h-4" /> },
    { id: 'player', label: 'Player & Dino', icon: <Users className="w-4 h-4" /> },
    { id: 'breeding', label: 'Breeding', icon: <CheckSquare className="w-4 h-4" /> },
    { id: 'structures', label: 'Structures', icon: <Hammer className="w-4 h-4" /> },
    { id: 'pvp', label: 'PvP Rules', icon: <Shield className="w-4 h-4" /> },
    { id: 'tribe', label: 'Tribe & Alliances', icon: <Users className="w-4 h-4" /> },
    { id: 'transfer', label: 'Tribute & Transfer', icon: <Globe className="w-4 h-4" /> },
    { id: 'environment', label: 'Environment', icon: <Map className="w-4 h-4" /> },
    { id: 'engrams', label: 'Engrams & Crafting', icon: <Hammer className="w-4 h-4" /> },
    { id: 'admin', label: 'Server Rules', icon: <MonitorPlay className="w-4 h-4" /> },
    { id: 'advanced', label: 'Advanced', icon: <Cpu className="w-4 h-4" /> },
  ], []);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const schema: SchemaField[] = useMemo(() => [
    // GENERAL - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'serverPve', label: 'PvE Mode', desc: 'Disables player vs player combat and structure damage' },
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
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'genericXpMultiplier', label: 'Generic XP Multiplier', desc: 'Multiplier for generic experience gain', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'specialXpMultiplier', label: 'Special XP Multiplier', desc: 'Multiplier for special action experience gain', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'fishingLootQualityMultiplier', label: 'Fishing Loot Quality', desc: 'Multiplier for fishing loot quality', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'supplyCrateLootQualityMultiplier', label: 'Supply Crate Loot Quality', desc: 'Multiplier for supply crate loot quality', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'globalSpoilingTimeMultiplier', label: 'Global Spoiling Time', desc: 'Global multiplier for food spoiling speed', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'globalItemDecompositionTimeMultiplier', label: 'Global Item Decomposition Time', desc: 'Global multiplier for item decomposition time on floor', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'rates', type: 'number', key: 'globalCorpseDecompositionTimeMultiplier', label: 'Global Corpse Decomposition Time', desc: 'Global multiplier for corpse decomposition time on floor', step: 0.1 },

    // PLAYER - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'allowThirdPersonPlayer', label: 'Allow Third Person' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'serverCrosshair', label: 'Show Crosshair' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'showMapPlayerLocation', label: 'Show Player on Map' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerCharacterFoodDrainMultiplier', label: 'Player Food Drain', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerCharacterWaterDrainMultiplier', label: 'Player Water Drain', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerCharacterStaminaDrainMultiplier', label: 'Player Stamina Drain', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerCharacterHealthRecoveryMultiplier', label: 'Player Health Recovery', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerResistanceMultiplier', label: 'Player Resistance', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerDamageMultiplier', label: 'Player Damage', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'playerHarvestingDamageMultiplier', label: 'Player Harvesting Damage Multiplier', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'craftingSkillBonusMultiplier', label: 'Crafting Skill Bonus Multiplier', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'nonPermanentDiseases', label: 'Non-Permanent Diseases', desc: 'Diseases will be cured upon respawning' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'preventDiseases', label: 'Prevent Diseases', desc: 'Completely disables sickness and swamp fever' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'bUseCorpseLocator', label: 'Use Corpse Locator', desc: 'Shows a green beam of light indicating where you died' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'bShowStatusTypes', label: 'Show Status Types', desc: 'Shows buffs/debuffs icons on the HUD' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'bAllowUnlimitedRespecs', label: 'Allow Unlimited Respecs', desc: 'Allows consuming Mindwipe Tonic without cooldown' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'showFloatingDamageText', label: 'Show Floating Damage Text', desc: 'Displays RPG-style damage numbers' },
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
    { file: 'Game.ini', tab: 'player', type: 'number', key: 'maxFallSpeedMultiplier', label: 'Max Fall Speed Multiplier', desc: 'Global limit for fall acceleration speed', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'dinoCharacterStaminaDrainMultiplier', label: 'Dino Stamina Drain Multiplier', desc: 'Multiplier for dino stamina drain rate', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'tamedDinoDamageMultiplier', label: 'Tamed Dino Damage Multiplier', desc: 'Multiplier for damage dealt by tamed dinos', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'tamedDinoResistanceMultiplier', label: 'Tamed Dino Resistance Multiplier', desc: 'Multiplier for resistance (damage taken) of tamed dinos', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'raidDinoCharacterFoodDrainMultiplier', label: 'Raid Dino Food Drain Multiplier', desc: 'Multiplier for food drain of raid/titan class dinos', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'passiveTameIntervalMultiplier', label: 'Passive Tame Interval Multiplier', desc: 'Multiplier for passive taming interval', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'number', key: 'personalTamedDinosSaddleStructureCost', label: 'Personal Tamed Dino Saddle Structure Cost', desc: 'Structure cost modifier for platforms on personal tames', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'bUseTameLimitForStructuresOnly', label: 'Use Tame Limit For Structures Only', desc: 'Restrict tame limits rules to structure-carrying saddles only' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'bAllowRaidDinoFeeding', label: 'Allow Raid Dino Feeding', desc: 'Allow feeding raid/titan dinos so they don\'t starve' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'forceAllowCaveFlyers', label: 'Force Allow Cave Flyers', desc: 'Allow riding flyers inside caves' },
    { file: 'Game.ini', tab: 'player', type: 'toggle', key: 'preventDinoMateBoost', label: 'Prevent Dino Mate Boost', desc: 'Disables mate boosting stat improvements for wild and tamed dinos' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'disableDinoDecayPve', label: 'Disable Dino Decay (PvE)', desc: 'Disable decay timer for tames in PvE mode' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'disableDinoDecayPvp', label: 'Disable Dino Decay (PvP)', desc: 'Disable decay timer for tames in PvP mode' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'allowDinoLevelUpAnimation', label: 'Allow Dino Level-Up Animation', desc: 'Plays the leveling-up sound/particles on dino level-up' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'bAllowFlyingStaminaRecovery', label: 'Allow Flying Stamina Recovery', desc: 'Allows flyers to regenerate stamina in mid-air when standing on them' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'bAllowMultipleAttachedC4', label: 'Allow Multiple Attached C4', desc: 'Allow sticking multiple C4 explosives to a single entity' },
    { file: 'Game.ini', tab: 'player', type: 'toggle', key: 'bAllowFlyerSpeedLeveling', label: 'Allow Flyer Speed Leveling', desc: 'Allow players to allocate stats into flyer speed' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'bAllowUnclaimDinos', label: 'Allow Unclaim Dinos (b)', desc: 'Enables or disables unclaiming dinos' },
    { file: 'Game.ini', tab: 'player', type: 'toggle', key: 'bDisableDinoRiding', label: 'Disable Dino Riding', desc: 'Disable dino riding' },
    { file: 'Game.ini', tab: 'player', type: 'toggle', key: 'bDisableDinoTaming', label: 'Disable Dino Taming', desc: 'Disable taming' },
    { file: 'Game.ini', tab: 'player', type: 'toggle', key: 'bDisableDinoBreeding', label: 'Disable Dino Breeding (b)', desc: 'Disable dino breeding' },
    { file: 'Game.ini', tab: 'player', type: 'array', key: 'dinoSpawnWeightMultipliers', label: 'Dino Spawn Weight Multipliers', desc: 'Customize spawn rate and limit multipliers for specific dino classes.', template: { DinoNameTag: { label: 'Dino Tag/Name', placeholder: 'Dodo' }, SpawnLimitPercentage: { label: 'Spawn Limit %', placeholder: '1.0' }, SpawnWeightMultiplier: { label: 'Spawn Weight Mult', placeholder: '1.0' }, OverrideSpawnLimitPercentage: { label: 'Override Limit % (True/False)', placeholder: 'True' } } },
    { file: 'Game.ini', tab: 'player', type: 'array', key: 'dinoClassDamageMultipliers', label: 'Wild Dino Damage Multipliers', desc: 'Adjust damage dealt by specific wild dino classes.', template: { ClassName: { label: 'Dino Class Name', placeholder: 'Dodo_Character_BP_C' }, Multiplier: { label: 'Damage Multiplier', placeholder: '1.0' } } },
    { file: 'Game.ini', tab: 'player', type: 'array', key: 'dinoClassResistanceMultipliers', label: 'Wild Dino Resistance Multipliers', desc: 'Adjust resistance (damage taken) for specific wild dino classes (lower = more resistant).', template: { ClassName: { label: 'Dino Class Name', placeholder: 'Dodo_Character_BP_C' }, Multiplier: { label: 'Resistance Multiplier', placeholder: '1.0' } } },
    { file: 'Game.ini', tab: 'player', type: 'array', key: 'tamedDinoClassDamageMultipliers', label: 'Tamed Dino Damage Multipliers', desc: 'Adjust damage dealt by specific tamed dino classes.', template: { ClassName: { label: 'Dino Class Name', placeholder: 'Dodo_Character_BP_C' }, Multiplier: { label: 'Damage Multiplier', placeholder: '1.0' } } },
    { file: 'Game.ini', tab: 'player', type: 'array', key: 'tamedDinoClassResistanceMultipliers', label: 'Tamed Dino Resistance Multipliers', desc: 'Adjust resistance (damage taken) for specific tamed dino classes (lower = more resistant).', template: { ClassName: { label: 'Dino Class Name', placeholder: 'Dodo_Character_BP_C' }, Multiplier: { label: 'Resistance Multiplier', placeholder: '1.0' } } },
    { file: 'Game.ini', tab: 'player', type: 'array', key: 'npcReplacements', label: 'NPC Replacements', desc: 'Replace or disable specific dinosaur spawn classes.', template: { FromClassName: { label: 'From Class Name', placeholder: 'Dodo_Character_BP_C' }, ToClassName: { label: 'To Class Name (Empty to disable)', placeholder: 'Saber_Character_BP_C' } } },
    { file: 'Game.ini', tab: 'player', type: 'textarea', key: 'preventDinoTameClassNames', label: 'Prevent Dino Taming Classes', desc: 'List of dino class names that cannot be tamed. Enter one class name per line.' },
    { file: 'Game.ini', tab: 'player', type: 'textarea', key: 'excludeDinoClasses', label: 'Exclude Dino Spawn Classes', desc: 'List of dino class names to prevent from spawning entirely. Enter one class name per line.' },
    { file: 'GameUserSettings.ini', tab: 'player', type: 'toggle', key: 'useSingleplayerSettings', label: 'Use Singleplayer Settings', desc: 'Applies singleplayer stat/rate overrides to scale for solo play' },

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
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'number', key: 'structurePickupTimeAfterPlacement', label: 'Structure Pickup Time Limit (Secs)', desc: 'Time window in seconds to pick up placed structures', step: 1.0 },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'number', key: 'structurePickupHoldDuration', label: 'Structure Pickup Hold Duration (Secs)', desc: 'Duration in seconds a player must hold key to pick up', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'toggle', key: 'ignoreLimitMaxStructuresInRangeTypeFlag', label: 'Ignore Range Limit for Type Flag', desc: 'Disable limits checks for max structures of specific types' },
    { file: 'GameUserSettings.ini', tab: 'structures', type: 'toggle', key: 'ignoreStructuresPreventionVolumes', label: 'Ignore Structure Prevention Volumes', desc: 'Disable spawn-prevention volume blocks for structures' },

    // PVP RULES
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'allowCaveBuildingPvp', label: 'Allow Cave Building (PvP)' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'disableRailgunPvp', label: 'Disable Railgun in PvP' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'enablePvpGamma', label: 'Enable PvP Gamma' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'PreventOfflinePvP', label: 'Prevent Offline PvP', desc: 'Makes structures and dinos invulnerable when tribe is offline' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'number', key: 'PreventOfflinePvPInterval', label: 'Offline PvP Prevention Interval', desc: 'Time in seconds after logout before protection activates', step: 1.0 },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'pvpStructureDecay', label: 'PvP Structure Decay' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'pvpDinoDecay', label: 'PvP Dino Decay' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'number', key: 'globalPoweredBatteryDurabilityDecreasePerSecond', label: 'Battery Durability Decrease/Sec', step: 0.1 },
    { file: 'Game.ini', tab: 'general', type: 'toggle', key: 'bDisableFriendlyFire', label: 'Disable Friendly Fire', desc: 'Prevents damaging tribe members and owned tames' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'allowCryoCooldownOnPvE', label: 'Allow Cryo Cooldown on PvE', desc: 'Enables cryo sickness cooldown on PvE' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'disableCryopodEnemyCheck', label: 'Disable Cryopod Enemy Check', desc: 'Allows deploying cryopods even if enemies are nearby' },
    { file: 'GameUserSettings.ini', tab: 'pvp', type: 'toggle', key: 'enableCryoSicknessPvp', label: 'Enable Cryo Sickness (PvP)', desc: 'Enables cryo sickness cooldown effects on PvP' },
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
    { file: 'GameUserSettings.ini', tab: 'transfer', type: 'toggle', key: 'disableCustomFoldersInTributeInventories', label: 'Disable Custom Folders in Tributes', desc: 'Disables creating custom folders in obelisk/tribute inventories' },

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
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'globalVoiceChat', label: 'Global Voice Chat', desc: 'Allows everyone to hear voice communications across the map' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'proximityVoiceChat', label: 'Proximity Voice Chat', desc: 'Restricts voice chat to nearby players only' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'alwaysNotifyPlayerJoined', label: 'Notify Player Joined', desc: 'Shows a broadcast notification when a player connects' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'alwaysNotifyPlayerLeft', label: 'Notify Player Left', desc: 'Shows a broadcast notification when a player disconnects' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'serverAdminCommandLogging', label: 'Log Admin Commands', desc: 'Logs all admin command usages to server logs and chat' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'toggle', key: 'secureSendArkPayload', label: 'Secure Send ARK Payload', desc: 'Enforces secure validation of network transmission payloads' },
    { file: 'GameUserSettings.ini', tab: 'admin', type: 'text', key: 'culture', label: 'Server Localization/Culture', desc: 'Sets the server localization/culture code (e.g. en, de, fr)' },

    // ADVANCED - GameUserSettings.ini
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'disableWeatherFog', label: 'Disable Fog' },
    {
      file: 'GameUserSettings.ini', tab: 'advanced', type: 'select', key: 'activeEvent', label: 'Active Event', desc: 'Predefined holiday events', options: [
        { label: 'None', value: '' },
        { label: 'Easter', value: 'Easter' },
        { label: 'Summer', value: 'Summer' },
        { label: 'Winter Wonderland', value: 'WinterWonderland' },
        { label: 'Fear Evolved (Halloween)', value: 'FearEvolved' },
        { label: 'Turkey Trial (Thanksgiving)', value: 'TurkeyTrial' },
        { label: 'Valentine', value: 'Valentine' },
        { label: 'Anniversary', value: 'Anniversary' }
      ]
    },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'text', key: 'launcherArgs', label: 'Custom Launcher Args', desc: 'Additional command line arguments' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'useAllAvailableCores', label: 'Use All Cores' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'useLowMemory', label: 'Low Memory Mode' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'noBattleEye', label: 'Disable BattlEye (Launcher Arg)' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'enableAutomanagedMods', label: 'Enable Auto-Managed Mods (Server CMD)', desc: 'If enabled, the server downloads/updates mods via a popup command prompt on startup. Disable to download/install mods silently via the manager.' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'text', key: 'activeMods', label: 'Active Mods', desc: 'Comma-separated Workshop IDs' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'number', key: 'eventColorsChanceOverride', label: 'Event Colors Chance Override', desc: 'Chance factor override for custom event dinosaur color spawns', step: 0.01 },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'number', key: 'ragnarokVolcanoIntensity', label: 'Ragnarok Volcano Intensity', desc: 'Volcano eruption intensity multiplier (Ragnarok map)', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'number', key: 'ragnarokVolcanoInterval', label: 'Ragnarok Volcano Interval', desc: 'Eruption frequency interval in seconds (0 = default)', step: 1.0 },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'enableRagnarokSettings', label: 'Enable Ragnarok Volcano Settings', desc: 'Enables active volcano mechanics on Ragnarok' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'useFjordurTraversalBuff', label: 'Use Fjordur Traversal Buff', desc: 'Enables teleportation traversal mechanics on Fjordur' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'enableFjordurSettings', label: 'Enable Fjordur Specific Settings', desc: 'Enables custom mechanics on Fjordur' },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'number', key: 'adjustableMutagenSpawnDelayMultiplier', label: 'Adjustable Mutagen Spawn Delay Multiplier', desc: 'Delay multiplier for spawn rates of mutagen resources', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'number', key: 'maxHexagonsPerCharacter', label: 'Max Hexagons Per Character', desc: 'Genesis hexagon token max cap', step: 1000.0 },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'number', key: 'hexagonRewardMultiplier', label: 'Hexagon Reward Multiplier', desc: 'Multiplier for Genesis hexagon tokens earned from missions', step: 0.1 },
    { file: 'Game.ini', tab: 'advanced', type: 'text', key: 'harvestResourceItemAmountClassMultipliers', label: 'Harvest Resource Item Amount Class Multipliers', desc: 'Advanced class-level harvest multipliers override string (semicolon-separated)' },

    // SERVER OPTIONS - GameUserSettings.ini (Classic ASM features)
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'useBanListUrl', label: 'Use Ban List URL', desc: 'Download server bans from a remote URL on startup' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'text', key: 'banListUrl', label: 'Ban List URL', desc: 'Remote URL pointing to banlist.txt' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'useDynamicConfigUrl', label: 'Use Dynamic Config URL', desc: 'Sync configuration dynamically from a remote URL' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'text', key: 'customDynamicConfigUrl', label: 'Dynamic Config URL', desc: 'Remote URL pointing to dynamic config file' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'useCustomLiveTuningUrl', label: 'Use Custom Live Tuning URL', desc: 'Download custom live tuning params on boot' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'text', key: 'customLiveTuningUrl', label: 'Custom Live Tuning URL', desc: 'Remote URL pointing to live tuning file' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'text', key: 'badWordListUrl', label: 'Bad Word List URL', desc: 'Remote URL pointing to a list of censored words' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'text', key: 'badWordWhiteListUrl', label: 'Bad Word Whitelist URL', desc: 'Remote URL pointing to a list of allowed words' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'bFilterTribeNames', label: 'Filter Tribe Names', desc: 'Apply bad word filter to tribe names' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'bFilterCharacterNames', label: 'Filter Character Names', desc: 'Apply bad word filter to survivor names' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'bFilterChat', label: 'Filter Chat', desc: 'Apply bad word filter to chat messages' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'enableIdleTimeout', label: 'Enable Idle Timeout', desc: 'Kick players who remain idle' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'number', key: 'kickIdlePlayersPeriod', label: 'Idle Timeout Duration (Secs)', desc: 'Seconds before an idle player is kicked', step: 10.0 },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'noPlayervac', label: 'Disable Valve Anti-Cheat (VAC)', desc: 'Spawns server in insecure mode' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'noAntiSpeedHack', label: 'Disable Anti-Speed Hack Detection', desc: 'Turns off built-in player speed-hack checks' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'number', key: 'speedHackCpuBias', label: 'Anti-Speed Hack Bias', desc: 'Built-in anti-speed hack threshold scale', step: 0.1 },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'disableMovementValidation', label: 'Disable Player Move Physics Optimization', desc: 'Disables movement correction checks' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'outputServerLogToConsole', label: 'Output Server Log to Server Console', desc: 'Streams logging directly into terminal output' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'noHangDet', label: 'Disable Hang Detection', desc: 'Prevent server from restarting if it stops responding briefly' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'noDinos', label: 'No Dinos Mode', desc: 'Prevents any wild or tamed creatures from spawning' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'noUnderMeshChecking', label: 'Disable Under Mesh Checking', desc: 'Disables mesh exploitation prevention checks' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'noUnderMeshKilling', label: 'Disable Under Mesh Killing', desc: 'Prevents server from killing players who clip under mesh' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'enableVivox', label: 'Enable Vivox (In-Game Voice)', desc: 'Uses Vivox spatial sound engine instead of default' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'allowSharedConnections', label: 'Allow Shared Connections', desc: 'Allow multiple clients on the same IP' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'creatureUploadIssueProtection', label: 'Creature Upload Issue Protection', desc: 'Validates payloads when uploading characters' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'additionalDupeProtection', label: 'Additional Dupe Protection', desc: 'Enables deep item duping checking rules' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'secureItemDinoSpawningRules', label: 'Secure Item/Dino Spawning Rules', desc: 'Protects console commands from duplicate spawns' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'forceRespawnDinosOnStartup', label: 'Force Respawn Dinos on Startup', desc: 'Performs a wild dino wipe every boot' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'enableAutoForceRespawnDinos', label: 'Enable Auto Force Respawn Dinos', desc: 'Periodically wipes wild dinos to keep populations fresh' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'number', key: 'autoForceRespawnDinosInterval', label: 'Auto Force Respawn Interval (Hours)', desc: 'Interval between periodic dino wipes', step: 1.0 },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'forceDirectX10', label: 'Force DirectX 10', desc: 'Uses d3d10 instructions' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'forceShaderModel4', label: 'Force Shader Model 4', desc: 'Forces Shader Model 4 rendering limit' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'forceLowMemory', label: 'Force Low Memory Mode', desc: 'Reduces memory usage' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'forceNoManSky', label: 'Force No Man\'s Sky (Low Quality Sky)', desc: 'Disables advanced trueSky clouds' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'useNoMemoryBias', desc: 'Prevents caching in page pools', label: 'Use No Memory Bias' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'stasisKeepControllers', label: 'Stasis Keep Controllers', desc: 'Keeps AI controller structures cached in stasis grid' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'serverAllowAnsel', label: 'Server Allow Ansel', desc: 'Allows connected clients to capture high-fidelity 3D pictures' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'structureMemoryOptimizations', label: 'Structure Memory Optimizations', desc: 'Compacts structure assets memory footprint' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'structureStasisGrid', label: 'Structure Stasis Grid', desc: 'Optimizes stasis grid handling for faster loading' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'enableCrossplay', label: 'Enable Crossplay', desc: 'Allows Epic Games Store and Steam players to join together' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'enablePublicIpForEpic', label: 'Enable Public IP for Epic', desc: 'Resolves server\'s public IP automatically to prevent EGS time-outs' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'toggle', key: 'epicStorePlayersOnly', label: 'Epic Store Players Only', desc: 'Blocks Steam connections completely' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'text', key: 'alternateSaveDirectoryName', label: 'Alternate Save Directory Name', desc: 'Alternate folder name for server savegames' },
    { file: 'GameUserSettings.ini', tab: 'general', type: 'text', key: 'clusterDirectoryOverride', label: 'Cluster Directory Override', desc: 'Absolute custom path for cluster data files' },
    { 
      file: 'GameUserSettings.ini', tab: 'general', type: 'select', key: 'serverLanguage', label: 'Server Language', desc: 'Forces server language',
      options: [
        { label: 'Default', value: '' },
        { label: 'English', value: 'en' },
        { label: 'French', value: 'fr' },
        { label: 'German', value: 'de' },
        { label: 'Italian', value: 'it' },
        { label: 'Spanish', value: 'es' },
        { label: 'Russian', value: 'ru' },
        { label: 'Portuguese', value: 'pt-BR' },
        { label: 'Simplified Chinese', value: 'zh' },
        { label: 'Traditional Chinese', value: 'zh-TW' },
        { label: 'Japanese', value: 'ja' },
        { label: 'Korean', value: 'ko' },
        { label: 'Polish', value: 'pl' },
        { label: 'Turkish', value: 'tr' }
      ]
    },
    { file: 'GameUserSettings.ini', tab: 'advanced', type: 'toggle', key: 'useClusterDirectoryOverride', label: 'Enable Cluster Directory Override', desc: 'Uses ClusterDirectoryOverride instead of default Save directory' },
  ], []);
  const handleSaveCurrentAsPreset = useCallback((name: string, description: string) => {
    const gusSettings: Record<string, string> = {};
    const gameSettings: Record<string, string> = {};

    schema.forEach(field => {
      const val = config[field.key as keyof AseGameConfig];
      if (val !== undefined && val !== null) {
        const valStr = Array.isArray(val) ? JSON.stringify(val) : String(val);
        const presetKey = field.key.charAt(0).toUpperCase() + field.key.slice(1);
        if (field.file === 'GameUserSettings.ini') {
          gusSettings[presetKey] = valStr;
        } else {
          gameSettings[presetKey] = valStr;
        }
      }
    });

    const preset: ConfigPreset = {
      id: `custom_${Date.now()}`,
      name,
      description,
      icon: '⚙️',
      color: 'from-amber-500 to-orange-500',
      settings: {
        GameUserSettings: gusSettings,
        Game: gameSettings
      }
    };

    saveCustomPreset(preset);
    setCurrentPreset(preset.id);
    toast.success('Preset saved successfully');
  }, [config, schema]);

  const tabMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!searchQuery) return counts;
    const query = searchQuery.toLowerCase();
    schema.forEach(field => {
      if (field.file !== activeFile) return;
      const matchLabel = field.label?.toLowerCase().includes(query);
      const matchKey = field.key.toLowerCase().includes(query);
      const matchDesc = field.desc?.toLowerCase().includes(query);
      if (matchLabel || matchKey || matchDesc) {
        counts[field.tab] = (counts[field.tab] || 0) + 1;
      }
    });
    return counts;
  }, [searchQuery, schema, activeFile]);

  const getMatchCount = useCallback((tabId: string, file: string) => {
    if (!searchQuery) return 0;
    const query = searchQuery.toLowerCase();
    return schema.filter(field => 
      field.tab === tabId && 
      field.file === file && 
      (field.label?.toLowerCase().includes(query) ||
       field.key.toLowerCase().includes(query) ||
       field.desc?.toLowerCase().includes(query))
    ).length;
  }, [searchQuery, schema]);

  // Show all tabs in visual mode regardless of activeFile, so the user can configure everything seamlessly!
  const activeFileTabs = useMemo(() => {
    const validTabIds = new Set(schema.map(f => f.tab));
    validTabIds.add('environment');
    const list = tabs.filter(t => 
      validTabIds.has(t.id) || 
      t.id === 'stats' ||
      t.id === 'levels'
    );
    list.push({ id: 'diagnostics', label: 'Diagnostics', icon: <Database className="w-4 h-4" /> });
    return list;
  }, [schema, tabs]);

  useEffect(() => {
    // If the current tab isn't valid for the new activeFile, or if we switched to GameUserSettings.ini while on levels/stats, switch to the first valid one
    const isInvalidTab = !activeFileTabs.some(t => t.id === activeTab);
    const isGameIniSpecificTab = (activeTab === 'levels' || activeTab === 'stats') && activeFile === 'GameUserSettings.ini';

    if (isInvalidTab || isGameIniSpecificTab) {
      if (activeFileTabs.length > 0) {
        const fallbackTab = activeFileTabs.find(t => t.id !== 'levels' && t.id !== 'stats') || activeFileTabs[0];
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveTab(fallbackTab.id);
      }
    }
  }, [activeFile, activeFileTabs, activeTab]);


  const renderField = (field: SchemaField) => {
    if (field.type === 'text') {
      return <TextInput key={field.key} file={field.file} label={field.label} value={config[field.key as keyof AseGameConfig] as string} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} />;
    }
    if (field.type === 'textarea') {
      const isArrayField = Array.isArray(config[field.key as keyof AseGameConfig]);
      const valStr = isArrayField
        ? (config[field.key as keyof AseGameConfig] as string[] || []).join('\n')
        : config[field.key as keyof AseGameConfig] as string || '';

      return (
        <TextAreaInput
          key={field.key}
          idKey={field.key}
          file={field.file}
          label={field.label}
          value={valStr}
          onChange={v => {
            if (isArrayField) {
              const lines = v.split('\n').map(s => s.trim()).filter(s => s !== '');
              update(field.key as keyof AseGameConfig, lines);
            } else {
              update(field.key as keyof AseGameConfig, v);
            }
          }}
          desc={field.desc}
        />
      );
    }
    if (field.type === 'array') {
      const arrayVal = config[field.key as keyof AseGameConfig] as string[] || [];
      return (
        <div className="col-span-1 md:col-span-2 p-5 rounded-2xl border border-slate-800/80 bg-slate-950/20 hover:bg-slate-950/40 transition-all duration-300 hover:border-amber-500/35 hover:shadow-[0_4px_25px_rgba(245,158,11,0.05)] flex flex-col gap-4 text-left" key={field.key}>
          <ArrayEditor
            label={field.label}
            value={arrayVal.join(',')}
            onChange={v => {
              const items = v.match(/\(([^)]+)\)/g) || [];
              update(field.key as keyof AseGameConfig, items);
            }}
            template={field.template || {}}
          />
          {field.desc && <div className="text-xs text-slate-400 leading-relaxed font-medium px-1 italic">{field.desc}</div>}
        </div>
      );
    }
    if (field.type === 'number') {
      return <NumberInput key={field.key} file={field.file} label={field.label} value={config[field.key as keyof AseGameConfig] as number} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} step={field.step} />;
    }
    if (field.type === 'toggle') {
      return <Toggle key={field.key} file={field.file} label={field.label} value={config[field.key as keyof AseGameConfig] as boolean} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} />;
    }
    if (field.type === 'select') {
      return <SelectInput key={field.key} file={field.file} label={field.label!} value={config[field.key as keyof AseGameConfig] as string} onChange={v => update(field.key as keyof AseGameConfig, v)} desc={field.desc} options={field.options || []} />;
    }
    if (field.type === 'engram_entries') {
      return (
        <div className="col-span-1 md:col-span-2 p-5 rounded-2xl border border-slate-800/80 bg-slate-950/20 hover:bg-slate-950/40 transition-all duration-300 hover:border-amber-500/35 hover:shadow-[0_4px_25px_rgba(245,158,11,0.05)] flex flex-col gap-4 text-left" key={field.key}>
          <div className="text-slate-200 font-bold tracking-wide flex items-center gap-2 mb-1 text-sm">{field.label}</div>
          <EngramOverridesEditor value={config.overrideNamedEngramEntries} onChange={(v: string) => update('overrideNamedEngramEntries', v)} />
        </div>
      );
    }
    if (field.type === 'crafting_costs') {
      return (
        <div className="col-span-1 md:col-span-2 p-5 rounded-2xl border border-slate-800/80 bg-slate-950/20 hover:bg-slate-950/40 transition-all duration-300 hover:border-amber-500/35 hover:shadow-[0_4px_25px_rgba(245,158,11,0.05)] flex flex-col gap-4 text-left" key={field.key}>
          <div className="text-slate-200 font-bold tracking-wide flex items-center gap-2 mb-1 text-sm">{field.label}</div>
          <CraftingCostEditor value={config.configOverrideItemCraftingCosts} onChange={(v: string) => update('configOverrideItemCraftingCosts', v)} />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full flex flex-col bg-[#0d0d1a] rounded-2xl overflow-hidden border border-[#1e1e3a] shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-[#1e1e3a]/80 flex flex-col gap-5 bg-[#12121f]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 flex-1">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl border border-amber-500/30 shadow-lg shadow-amber-500/10 flex items-center justify-center bg-slate-950">
                <img src={aseLogo} alt="ARK Survival Evolved" className="w-full h-full object-cover scale-110" />
              </div>
              <span className="bg-gradient-to-r from-white via-amber-200 to-orange-200 bg-clip-text text-transparent">
                ASE Configuration
              </span>
            </h2>

            {servers.length > 0 && (
              <ServerSelect
                value={selectedServer}
                onChange={handleServerSwitch}
                servers={servers}
                accentColor="amber"
              />
            )}

            <div className="h-8 w-px bg-[#2d2d44] mx-2" />

            <PresetSelector
              onApplyPreset={handleApplyPreset}
              currentPreset={currentPreset}
              onSaveCurrentAsPreset={handleSaveCurrentAsPreset}
            />
          </div>

          <div className="flex items-center gap-3">
            <input type="file" accept=".ini" className="hidden" ref={fileInputRef} onChange={handleImportIni} />
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-[#1a1a2e] border-2 border-[#2d2d44] rounded-xl text-slate-400 hover:text-white hover:border-amber-500/50 text-sm flex items-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(245,158,11,0.15)]" title="Import INI">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={() => setConfig(defaultConfig)} className="px-3 py-2 bg-[#1a1a2e] border-2 border-[#2d2d44] rounded-xl text-slate-400 hover:text-white hover:border-amber-500/50 text-sm flex items-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(245,158,11,0.15)]" title="Reset Default">
              <RotateCcw className="w-4 h-4" />
            </button>
            <a
              href="https://ark.wiki.gg/wiki/Server_configuration"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-[#1a1a2e] border-2 border-[#2d2d44] rounded-xl text-slate-400 hover:text-white hover:border-amber-500/50 text-sm flex items-center gap-2 transition-all hover:shadow-[0_0_15px_rgba(245,158,11,0.15)]"
            >
              <ExternalLink className="w-4 h-4" /> {t('configEditor.buttons.wiki', 'Wiki')}
            </a>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('configEditor.buttons.save', 'Save Changes')}
            </button>
          </div>
        </div>

        {/* Navigation Tabs - Modern Pill Style */}
        <div className="flex items-center gap-2 bg-[#0d0d1a] p-2 rounded-2xl self-start border border-[#1e1e3a] max-w-full overflow-x-auto scrollbar-thin">
          <button
            onClick={() => handleSwitchViewMode('visual')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
              viewMode === 'visual'
                ? "bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/20"
                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
            )}
          >
            <Sliders className="w-4 h-4" /> Visual Editor
          </button>
          <button
            onClick={() => handleSwitchViewMode('raw-gus')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
              viewMode === 'raw-gus'
                ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/30"
                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
            )}
          >
            <FileText className="w-4 h-4" /> Raw GameUserSettings.ini
          </button>
          <button
            onClick={() => handleSwitchViewMode('raw-game')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
              viewMode === 'raw-game'
                ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/30"
                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
            )}
          >
            <FileText className="w-4 h-4" /> Raw Game.ini
          </button>
          <button
            onClick={() => handleSwitchViewMode('levels')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
              viewMode === 'levels'
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30"
                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
            )}
          >
            <GraduationCap className="w-4 h-4" /> Level Generator
          </button>
          <button
            onClick={() => handleSwitchViewMode('stats')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
              viewMode === 'stats'
                ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/30"
                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
            )}
          >
            <BarChart3 className="w-4 h-4" /> Stat Multipliers
          </button>
          <button
            onClick={() => handleSwitchViewMode('diagnostics')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 flex-shrink-0",
              viewMode === 'diagnostics'
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/30"
                : "text-slate-400 hover:text-white hover:bg-[#1a1a2e]"
            )}
          >
            <Database className="w-4 h-4" /> Diagnostics
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {['visual', 'levels', 'stats', 'diagnostics'].includes(viewMode) && (
          <>
            {/* Sidebar */}
            <div
              className={cn(
                "bg-[#12121f] border-r-2 border-[#1e1e3a] overflow-hidden relative transition-all duration-300 flex flex-col gap-6 p-4 pr-3 custom-scrollbar",
                isSidebarCollapsed && "w-0 p-0 border-r-0"
              )}
              style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px` }}
            >
              {!isSidebarCollapsed && (
                <>
                  <div className="relative group px-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-amber-500 transition-colors z-10 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search settings..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-white/10 rounded-2xl text-xs font-semibold text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 transition-all duration-300 shadow-inner"
                    />
                  </div>

                  <div className="space-y-6 overflow-y-auto flex-1 pr-1 custom-scrollbar">
                    {[
                      {
                        title: 'GameUserSettings.ini (GUS)',
                        ids: ['general', 'server_options', 'rates', 'player', 'pvp', 'structures', 'tribe', 'transfer', 'environment', 'admin', 'advanced', 'breeding', 'engrams'],
                        fileType: 'GameUserSettings.ini',
                      },
                      {
                        title: 'Game.ini Settings',
                        ids: ['breeding', 'engrams', 'levels', 'stats', 'player', 'pvp'],
                        fileType: 'Game.ini',
                      },
                      {
                        title: 'Utilities',
                        ids: ['diagnostics'],
                        fileType: 'Utilities',
                      }
                    ].map(group => {
                      const groupTabs = activeFileTabs.filter(t => group.ids.includes(t.id as string));
                      if (groupTabs.length === 0) return null;
                      return (
                        <div key={group.title} className="flex flex-col gap-1.5 text-left animate-fadeIn">
                          <h3 className="text-[10px] font-black text-slate-550 uppercase tracking-widest px-3 mb-1">{group.title}</h3>
                          {groupTabs.map(tab => {
                            const isTabActive = activeTab === tab.id;
                            const isActive = isTabActive && (
                              (group.fileType === 'GameUserSettings.ini' && activeFile === 'GameUserSettings.ini') ||
                              (group.fileType === 'Game.ini' && activeFile === 'Game.ini') ||
                              group.fileType === 'Utilities'
                            );
                            const matchCount = group.fileType === 'Utilities' ? 0 : getMatchCount(tab.id, group.fileType);
                            return (
                              <button
                                key={tab.id}
                                onClick={() => {
                                  if (tab.id === 'levels' || tab.id === 'stats' || tab.id === 'diagnostics') {
                                    handleSwitchViewMode(tab.id);
                                  } else {
                                    handleSwitchViewMode('visual');
                                    setActiveTab(tab.id);
                                    if (group.fileType === 'Game.ini') {
                                      setActiveFile('Game.ini');
                                    } else {
                                      setActiveFile('GameUserSettings.ini');
                                    }
                                  }
                                }}
                                className={cn(
                                  "flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 border group text-left",
                                  isActive
                                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-[inset_3px_0_0_0_#fbbf24]"
                                    : "bg-transparent border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                                )}
                              >
                                <span className="flex items-center gap-3">
                                  {React.cloneElement(tab.icon as React.ReactElement<{ className?: string }>, {
                                    className: cn("w-5 h-5 transition-transform duration-300", isActive ? "scale-110" : "group-hover:scale-110 opacity-70")
                                  })}
                                  {tab.label}
                                </span>
                                {searchQuery && matchCount > 0 && (
                                  <span className={cn(
                                    "px-2 py-0.5 text-[10px] font-black rounded-lg transition-colors",
                                    isActive ? "bg-amber-500/25 text-amber-400" : "bg-slate-800 text-slate-450 group-hover:text-slate-350"
                                  )}>
                                    {matchCount}
                                  </span>
                                )}
                                {tab.id === 'diagnostics' && validationResult && validationResult.issues.length > 0 && (
                                  <span className={cn(
                                    "px-2 py-0.5 text-[10px] font-black rounded-lg transition-all border shrink-0",
                                    validationResult.issues.some(i => i.severity === 'Error')
                                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse"
                                      : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  )}>
                                    {validationResult.issues.length}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Resize Handle */}
                  <div
                    className={cn(
                      "absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-amber-500/50 transition-colors z-10",
                      isResizing && "bg-amber-500"
                    )}
                    onMouseDown={startResizing}
                  />
                </>
              )}
            </div>

            {/* Collapse/Expand Button */}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="absolute top-20 left-0 z-20 w-7 h-10 bg-[#1a1a2e] border-2 border-[#2d2d44] text-slate-400 hover:bg-amber-600 hover:border-amber-500 hover:text-white transition-all shadow-lg flex items-center justify-center rounded-r-xl"
              style={{ marginLeft: isSidebarCollapsed ? '0px' : `${sidebarWidth}px` }}
            >
              {isSidebarCollapsed ? '›' : '‹'}
            </button>
          </>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-[#0d0d1a] py-6 pr-6 pl-12 scrollbar-thin scrollbar-thumb-[#2d2d44] scrollbar-track-transparent">
          <AnimatePresence mode="wait">
            {isLoading && !config.sessionName ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-center h-full min-h-[300px]"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 animate-pulse">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                  <span className="text-slate-400 text-sm font-medium">{t('configEditor.loading', 'Loading Settings...')}</span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={viewMode + (viewMode === 'visual' ? activeTab : '') + searchQuery}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {viewMode === 'raw-gus' || viewMode === 'raw-game' ? (
                  <div className="flex flex-col h-full gap-4 min-h-[450px]">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-amber-500" />
                          Raw {activeFile} Editor
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Directly edit the raw INI configuration lines. Make sure to follow correct INI key=value syntax.
                        </p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(rawIniContent)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#252526] hover:bg-[#333] text-slate-300 rounded-md border border-[#3e3e3e] shadow-sm transition-all text-sm font-medium"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                        {t('configEditor.buttons.copy', 'Copy')}
                      </button>
                    </div>
                    <div className="flex-1 h-full min-h-[350px]">
                      <CodeEditor
                        value={rawIniContent}
                        onChange={handleRawChange}
                        className="h-full border-white/5 bg-slate-950/60 rounded-xl"
                      />
                    </div>
                  </div>
                ) : viewMode === 'diagnostics' ? (
                  <div className="space-y-6 animate-fadeIn">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/40 pb-4">
                      <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                          <Database className="w-5 h-5 text-amber-500" />
                          Configuration Diagnostics & Cache
                        </h2>
                        <p className="text-xs text-slate-455 mt-1">Verify profile integrity, parse status, and sync state parameters.</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={async () => {
                            if (!selectedServer) return;
                            setIsLoading(true);
                            try {
                              await syncAseServerFromIni(selectedServer);
                              await loadConfig(selectedServer);
                              await loadDiagnostics(selectedServer);
                              toast.success('Configuration successfully reloaded from disk!', {
                                style: { background: '#10b981', color: '#fff', borderRadius: '12px' }
                              });
                            } catch (e) {
                              toast.error(`Reload failed: ${e}`);
                            } finally {
                              setIsLoading(false);
                            }
                          }}
                          className="px-4 py-2 bg-[#1a1a2e] hover:bg-slate-800 text-slate-200 border border-slate-700/50 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow transition-all duration-300"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reload Configuration
                        </button>

                        <button
                          onClick={async () => {
                            if (!selectedServer) return;
                            setIsLoading(true);
                            try {
                              await syncAseServerFromIni(selectedServer);
                              await loadConfig(selectedServer);
                              await loadDiagnostics(selectedServer);
                              toast.success('Server profile completely rebuilt from raw configuration!', {
                                style: { background: '#10b981', color: '#fff', borderRadius: '12px' }
                              });
                            } catch (e) {
                              toast.error(`Rebuild failed: ${e}`);
                            } finally {
                              setIsLoading(false);
                            }
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-amber-500/10 transition-all duration-300"
                        >
                          <Cpu className="w-3.5 h-3.5" />
                          Force Rebuild Profile
                        </button>
                      </div>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5 flex flex-col justify-between min-h-[100px]">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Cache Status</span>
                        <div className="mt-2 flex items-center gap-2">
                          {diagnostics?.cacheStatus.toLowerCase().includes('fresh') ? (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Fresh (Synced)
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Stale (External edits)
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-2 font-medium">Compares files vs active SQLite db records</span>
                      </div>

                      <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5 flex flex-col justify-between min-h-[100px]">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Configuration Hash</span>
                        <div className="mt-2 text-xs font-mono font-bold text-slate-200 truncate" title={diagnostics?.configHash || 'N/A'}>
                          {diagnostics?.configHash ? diagnostics.configHash.substring(0, 16) + '...' : 'Unknown'}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-2 font-medium">Combined SHA-256 profile integrity check</span>
                      </div>

                      <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5 flex flex-col justify-between min-h-[100px]">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Last Sync Execution</span>
                        <div className="mt-2 text-xs font-mono font-bold text-slate-200">
                          {diagnostics?.lastParsed ? new Date(diagnostics.lastParsed).toLocaleString() : 'Never'}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-2 font-medium">Timestamp of database parity parse</span>
                      </div>
                    </div>

                    {/* Configuration Validation Panel */}
                    <div className="bg-slate-900/35 border border-white/5 p-5 rounded-2xl space-y-4 text-left">
                      <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-amber-500" />
                        Configuration Integrity Check
                      </h3>
                      {isValidating ? (
                        <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                          <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                          Analyzing configuration files...
                        </div>
                      ) : validationResult ? (
                        validationResult.issues.length === 0 ? (
                          <div className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl text-emerald-450 text-xs">
                            <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                            <div>
                              <div className="font-bold text-slate-200">All Checks Passed!</div>
                              <div className="mt-0.5">No structural syntax errors, unbalanced parentheses, or misplaced keys were found in your INI files.</div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="text-[11px] font-semibold text-slate-400">
                              Found {validationResult.issues.length} issue(s) in configuration files:
                            </div>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                              {validationResult.issues.map((issue, idx) => {
                                const isError = issue.severity === 'Error';
                                return (
                                  <div
                                    key={idx}
                                    className={cn(
                                      "flex items-start gap-3 p-3.5 rounded-xl border text-xs leading-normal",
                                      isError
                                        ? "bg-rose-500/5 border-rose-500/20 text-rose-200"
                                        : "bg-amber-500/5 border-amber-500/20 text-amber-200"
                                    )}
                                  >
                                    <AlertTriangle className={cn("w-4.5 h-4.5 shrink-0 mt-0.5", isError ? "text-rose-500" : "text-amber-500")} />
                                    <div className="flex-1 space-y-1">
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider", isError ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30")}>
                                          {issue.severity}
                                        </span>
                                        <span className="font-bold text-slate-200 font-mono text-[10px] bg-slate-950/45 px-1.5 py-0.5 rounded border border-white/5">
                                          {issue.file}
                                        </span>
                                        {issue.lineNumber && (
                                          <span className="text-slate-400 text-[10px] font-mono">
                                            Line {issue.lineNumber}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-mono">
                                        Section: <span className="text-slate-300">[{issue.section}]</span>
                                        {issue.key && <> • Key: <span className="text-slate-300">{issue.key}</span></>}
                                      </div>
                                      <p className="text-slate-300 mt-1">{issue.message}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )
                      ) : (
                        <div className="text-slate-500 text-xs py-2 italic">No validation results loaded.</div>
                      )}
                    </div>

                    {/* File details panel */}
                    <div className="bg-slate-900/35 border border-white/5 p-5 rounded-2xl space-y-4">
                      <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest border-b border-white/5 pb-2">
                        Tracked Source Configuration Files
                      </h3>
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-950/40 p-3 rounded-xl border border-slate-900">
                          <div>
                            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                              {diagnostics?.gusExists ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                              )}
                              GameUserSettings.ini
                            </div>
                            <span className="text-[10px] text-slate-500 mt-0.5 block">Stores general identity, rates, administration, and launcher parameters</span>
                          </div>
                          <div className="text-right sm:text-right flex flex-row sm:flex-col justify-between sm:justify-start gap-4 sm:gap-1 text-[11px] font-mono">
                            <span className="text-slate-400">Size: <b className="text-slate-200">{diagnostics?.gusSize ? (diagnostics.gusSize / 1024).toFixed(2) : '0.00'} KB</b></span>
                            <span className="text-slate-400">Modified: <b className="text-slate-200">{diagnostics?.gusModified ? new Date(diagnostics.gusModified).toLocaleString() : 'N/A'}</b></span>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-950/40 p-3 rounded-xl border border-slate-900">
                          <div>
                            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                              {diagnostics?.gameIniExists ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                              )}
                              Game.ini
                            </div>
                            <span className="text-[10px] text-slate-500 mt-0.5 block">Stores gameplay multipliers, breeding settings, engrams, and crafting overrides</span>
                          </div>
                          <div className="text-right sm:text-right flex flex-row sm:flex-col justify-between sm:justify-start gap-4 sm:gap-1 text-[11px] font-mono">
                            <span className="text-slate-400">Size: <b className="text-slate-200">{diagnostics?.gameIniSize ? (diagnostics.gameIniSize / 1024).toFixed(2) : '0.00'} KB</b></span>
                            <span className="text-slate-400">Modified: <b className="text-slate-200">{diagnostics?.gameIniModified ? new Date(diagnostics.gameIniModified).toLocaleString() : 'N/A'}</b></span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Live launch preview */}
                    <div className="bg-slate-900/35 border border-white/5 p-5 rounded-2xl space-y-3">
                      <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-1.5">
                        <Cpu className="w-4 h-4" /> Live Boot Launch Parameters
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed font-medium">
                        These command line arguments are generated on startup by mapping custom settings variables:
                      </p>
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-355 break-all select-all leading-normal relative">
                        <span className="text-amber-500 select-none mr-2">ShooterGameServer.exe</span>
                        {diagnostics?.activeLaunchArgs && diagnostics.activeLaunchArgs.length > 0
                          ? diagnostics.activeLaunchArgs.join(' ')
                          : 'No arguments detected. Verify directory settings.'}
                      </div>
                    </div>

                    {/* Server Readiness Pre-flight Checks */}
                    <div className="bg-slate-900/35 border border-white/5 p-5 rounded-2xl space-y-3">
                      <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest border-b border-white/5 pb-2 flex items-center gap-1.5">
                        <Shield className="w-4 h-4" /> Server Launch Readiness
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed font-medium">
                        Pre-flight checks to verify the server is ready to launch. Resolve any issues before starting.
                      </p>
                      <div className="space-y-2">
                        {/* Executable check */}
                        <div className="flex items-center gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-900">
                          {diagnostics?.gusExists !== undefined ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                          )}
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-slate-200">Server Executable</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">ShooterGame/Binaries/Win64/ShooterGameServer.exe</div>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            {diagnostics?.gusExists !== undefined ? 'Found' : 'Unknown'}
                          </span>
                        </div>

                        {/* GameUserSettings.ini check */}
                        <div className="flex items-center gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-900">
                          {diagnostics?.gusExists ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                          )}
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-slate-200">GameUserSettings.ini</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">Core server identity, rates, and admin config</div>
                          </div>
                          <span className={`text-[10px] font-bold uppercase ${diagnostics?.gusExists ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {diagnostics?.gusExists ? 'Present' : 'Missing'}
                          </span>
                        </div>

                        {/* Game.ini check */}
                        <div className="flex items-center gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-900">
                          {diagnostics?.gameIniExists ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          )}
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-slate-200">Game.ini</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">Breeding, engrams, and gameplay overrides</div>
                          </div>
                          <span className={`text-[10px] font-bold uppercase ${diagnostics?.gameIniExists ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {diagnostics?.gameIniExists ? 'Present' : 'Will be created on save'}
                          </span>
                        </div>

                        {/* Map validation */}
                        <div className="flex items-center gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-900">
                          {mapName && mapName.trim().length > 0 ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                          )}
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-slate-200">Map Configuration</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {mapName && mapName.trim().length > 0
                                ? `Active map: ${mapName}`
                                : 'No map selected — server will fail to start'}
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold uppercase ${mapName && mapName.trim().length > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {mapName && mapName.trim().length > 0 ? 'Valid' : 'Invalid'}
                          </span>
                        </div>
                      </div>

                      {/* Crash hint */}
                      <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div className="text-[11px] text-slate-400 leading-relaxed">
                            <span className="font-bold text-amber-400">Server crashes with Code 0?</span> This usually means the server files are incomplete or corrupt.
                            Try updating the server via SteamCMD (use the Update button on the dashboard), or verify that the install path contains a complete ARK server installation.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : viewMode === 'stats' ? (
                  <div className="max-w-4xl mx-auto space-y-6">
                    <AseStatMultiplierEditor
                      config={config}
                      onChange={(updated) => {
                        setConfig(updated);
                        setIsDirty(true);
                      }}
                    />
                  </div>
                ) : viewMode === 'levels' ? (
                  <div className="max-w-2xl mx-auto space-y-6">
                    <AseLevelGenerator
                      config={config}
                      onChange={(updated) => {
                        setConfig(updated);
                        setIsDirty(true);
                      }}
                    />
                  </div>
                ) : (
                  /* Visual Editor content */
                  <>
                    {activeTab === 'environment' ? (
                      <ASEEnvironmentManager
                        embedded={true}
                        config={config}
                        onChange={(updated) => {
                          setConfig(updated);
                          setIsDirty(true);
                        }}
                      />
                    ) : (
                      (() => {
                        if (['administration', 'diagnostics', 'stats', 'levels', 'environment'].includes(activeTab)) return null;

                        const tabFields = schema.filter(f => f.tab === activeTab && f.file === activeFile);
                        if (tabFields.length === 0) return null;

                        const filteredFields = tabFields.filter(f => {
                          if (!searchQuery) return true;
                          const q = searchQuery.toLowerCase();
                          return f.label?.toLowerCase().includes(q) ||
                                 f.key.toLowerCase().includes(q) ||
                                 f.desc?.toLowerCase().includes(q);
                        });

                        if (searchQuery && filteredFields.length === 0) {
                          return (
                            <div className="flex flex-col items-center justify-center py-16 px-6 bg-slate-900/20 border border-white/5 rounded-3xl text-center">
                              <Search className="w-10 h-10 text-amber-500/30 mb-3" />
                              <h3 className="text-base font-bold text-white">No matches in "{tabs.find(t => t.id === activeTab)?.label}"</h3>
                              <p className="text-xs text-slate-400 mt-1 max-w-sm">No settings match your search in this category. However, matches were found in these sections:</p>
                              <div className="flex flex-wrap justify-center gap-2 mt-4">
                                {Object.entries(tabMatchCounts).map(([tabId, count]) => {
                                  const targetTab = tabs.find(t => t.id === tabId);
                                  if (!targetTab || count === 0) return null;
                                  return (
                                    <button
                                      key={tabId}
                                      type="button"
                                      onClick={() => setActiveTab(tabId as TabType)}
                                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/50 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                                    >
                                      {targetTab.label}
                                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-black rounded">
                                        {count}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="max-w-5xl mx-auto space-y-8">
                            <div className="space-y-4 text-left animate-fadeIn">
                              <div className="flex items-center gap-3 pb-2 border-b border-white/5 relative">
                                <div className={cn(
                                  "absolute bottom-0 left-0 w-16 h-px",
                                  activeFile === 'GameUserSettings.ini' ? "bg-amber-500" : "bg-orange-500"
                                )}></div>
                                <h3 className={cn(
                                  "text-xs font-black uppercase tracking-widest",
                                  activeFile === 'GameUserSettings.ini' ? "text-amber-550" : "text-orange-500"
                                )}>
                                  {activeFile} Settings
                                </h3>
                              </div>
                              
                              {activeTab === 'general' && activeFile === 'GameUserSettings.ini' && !searchQuery && (
                                <>
                                  <div className="space-y-8 mb-8 animate-fadeIn">
                                    {/* Name and Passwords */}
                                    <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
                                      <h3 className="text-amber-500 font-bold mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
                                        <Settings2 className="w-4 h-4" /> Name and Passwords
                                      </h3>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-1.5">
                                          <label className="text-xs font-bold text-slate-300">Session Name</label>
                                          <input type="text" value={config.sessionName || ''} onChange={e => { setConfig({...config, sessionName: e.target.value}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                          <label className="text-xs font-bold text-slate-300">Server Password</label>
                                          <input type="text" value={config.serverPassword || ''} onChange={e => { setConfig({...config, serverPassword: e.target.value}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" placeholder="Leave blank for public" />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                          <label className="text-xs font-bold text-slate-300">Admin Password</label>
                                          <input type="text" value={config.serverAdminPassword || ''} onChange={e => { setConfig({...config, serverAdminPassword: e.target.value}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                          <label className="text-xs font-bold text-slate-300">Spectator Password</label>
                                          <input type="text" value={config.SpectatorPassword || ''} onChange={e => { setConfig({...config, SpectatorPassword: e.target.value}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Networking */}
                                    <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
                                      <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-amber-500 font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                                          <Globe className="w-4 h-4" /> Networking
                                        </h3>
                                        <button
                                          onClick={addFirewallRules}
                                          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-500 border border-slate-700 hover:border-amber-500/50 rounded-lg text-xs font-semibold transition-colors"
                                        >
                                          <Shield className="w-3 h-3" /> Add Firewall Exception
                                        </button>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                        <div className="flex flex-col gap-1.5 lg:col-span-2">
                                          <label className="text-xs font-bold text-slate-300">Local IP</label>
                                          <div className="flex items-center gap-2">
                                            <input type="text" value={adminState.localIp} onChange={e => { setAdminState({...adminState, localIp: e.target.value}); setIsDirty(true); }} className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" placeholder="e.g. 192.168.1.100" />
                                            <button title="Detect Local IP" onClick={fetchLocalIp} className="p-2.5 bg-slate-950 hover:bg-amber-500/20 text-slate-400 hover:text-amber-500 rounded-xl border border-slate-800 transition-colors flex-shrink-0">
                                              <RefreshCw className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                          <label className="text-xs font-bold text-slate-300">Server Port</label>
                                          <input type="number" value={adminState.port} onChange={e => { 
                                            const newPort = parseInt(e.target.value) || 0;
                                            setAdminState({...adminState, port: newPort, peerPort: isPeerPortLocked ? (newPort ? newPort + 1 : adminState.peerPort) : adminState.peerPort}); 
                                            setIsDirty(true); 
                                          }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                          <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-slate-300">Peer Port</label>
                                          </div>
                                          <div className="relative">
                                            <input 
                                              type="number" 
                                              disabled={isPeerPortLocked} 
                                              value={adminState.peerPort} 
                                              onChange={e => { setAdminState({...adminState, peerPort: parseInt(e.target.value) || 0}); setIsDirty(true); }} 
                                              className="w-full px-4 py-2.5 pr-10 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                                            />
                                            <button 
                                              type="button"
                                              onClick={() => setIsPeerPortLocked(!isPeerPortLocked)}
                                              title={isPeerPortLocked ? "Unlock to edit manually" : "Lock to auto-calculate"}
                                              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${isPeerPortLocked ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'}`}
                                            >
                                              {isPeerPortLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                            </button>
                                          </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                          <label className="text-xs font-bold text-slate-300">Query Port</label>
                                          <input type="number" value={adminState.queryPort} onChange={e => { setAdminState({...adminState, queryPort: parseInt(e.target.value) || 0}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                          <label className="text-xs font-bold text-slate-300">Max Players</label>
                                          <input type="number" value={config.maxPlayers || 70} onChange={e => { setConfig({...config, maxPlayers: parseInt(e.target.value) || 70}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" />
                                        </div>
                                      </div>
                                    </div>

                                    {/* RCON */}
                                    <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
                                      <h3 className="text-amber-500 font-bold mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
                                        <MonitorPlay className="w-4 h-4" /> RCON
                                      </h3>
                                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                        <label className="flex items-center gap-3 p-3 h-[42px] bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-amber-500/30 transition-colors">
                                          <input type="checkbox" checked={adminState.rconPort > 0} onChange={e => { setAdminState({...adminState, rconPort: e.target.checked ? 27020 : 0}); setIsDirty(true); }} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/20 bg-slate-900 border-slate-700" />
                                          <span className="text-sm font-semibold text-slate-200">Enable RCON</span>
                                        </label>
                                        <div className="flex flex-col gap-1.5">
                                          <label className="text-xs font-bold text-slate-300">RCON Port</label>
                                          <input type="number" disabled={adminState.rconPort === 0} value={adminState.rconPort > 0 ? adminState.rconPort : 27020} onChange={e => { setAdminState({...adminState, rconPort: parseInt(e.target.value) || 0}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors disabled:opacity-50" />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                          <label className="text-xs font-bold text-slate-300">Server Log Buffer</label>
                                          <input type="number" value={config.RCONServerLogBuffer || 600} onChange={e => { setConfig({...config, RCONServerLogBuffer: parseInt(e.target.value) || 600}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" />
                                        </div>
                                        <div className="flex flex-col">
                                          <button 
                                            onClick={() => navigate('/ase/rcon', { state: { serverId: selectedServer } })}
                                            disabled={adminState.rconPort === 0}
                                            className="flex items-center justify-center gap-2 px-4 py-2.5 h-[42px] bg-amber-500/10 text-amber-500 border border-amber-500/30 hover:bg-amber-500 hover:text-slate-900 transition-all rounded-xl w-full font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                          >
                                            <TerminalSquare className="w-4 h-4" /> Open RCON
                                          </button>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Saves & Official Settings */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
                                        <h3 className="text-amber-500 font-bold mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
                                          <Save className="w-4 h-4" /> Saves
                                        </h3>
                                        <div className="space-y-4">
                                          <div className="flex flex-col gap-1.5">
                                            <label className="text-xs font-bold text-slate-300">Auto Save Period (Mins)</label>
                                            <input type="number" value={config.autoSavePeriodMinutes || 15} onChange={e => { setConfig({...config, autoSavePeriodMinutes: parseFloat(e.target.value) || 15}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" />
                                          </div>
                                          <div className="flex flex-col gap-1.5">
                                            <label className="text-xs font-bold text-slate-300">Backup Quantity</label>
                                            <input type="number" value={config.backupQuantity || 0} onChange={e => { setConfig({...config, backupQuantity: parseInt(e.target.value) || 0}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" />
                                            <p className="text-[10px] text-slate-500">Number of backup archives to keep. Oldest will be pruned.</p>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
                                        <h3 className="text-amber-500 font-bold mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
                                          <Database className="w-4 h-4" /> Official Save Settings
                                        </h3>
                                        <div className="space-y-3">
                                          <label className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-amber-500/30 transition-colors">
                                            <input type="checkbox" checked={!!config.newSaveGameFormat} onChange={e => { setConfig({...config, newSaveGameFormat: e.target.checked}); setIsDirty(true); }} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/20 bg-slate-900 border-slate-700" />
                                            <span className="text-sm font-semibold text-slate-200">New Save Game Format</span>
                                          </label>
                                          <label className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-amber-500/30 transition-colors">
                                            <input type="checkbox" checked={!!config.useStore} onChange={e => { setConfig({...config, useStore: e.target.checked}); setIsDirty(true); }} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/20 bg-slate-900 border-slate-700" />
                                            <span className="text-sm font-semibold text-slate-200">Use Store</span>
                                          </label>
                                          <label className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-amber-500/30 transition-colors">
                                            <input type="checkbox" checked={!!config.backupTransferPlayerDatas} onChange={e => { setConfig({...config, backupTransferPlayerDatas: e.target.checked}); setIsDirty(true); }} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/20 bg-slate-900 border-slate-700" />
                                            <span className="text-sm font-semibold text-slate-200">Backup Transfer Player Datas</span>
                                          </label>
                                        </div>
                                      </div>
                                    </div>

                                    {/* MOTD and Extinction */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
                                        <h3 className="text-amber-500 font-bold mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
                                          <FileText className="w-4 h-4" /> Message of the Day
                                        </h3>
                                        <div className="space-y-4">
                                          <div className="w-full flex flex-col">
                                            {/* Toolbar */}
                                            <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-2.5 rounded-t-xl border border-slate-800 border-b-0">
                                              <span className="text-[10px] uppercase font-bold text-slate-500 select-none mr-1">MOTD Colors:</span>
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
                                                  onClick={() => insertMotdColorTag(c.color)}
                                                  className={cn(
                                                    "w-5 h-5 rounded-full border border-white/10 hover:scale-110 active:scale-95 transition-all shadow-sm",
                                                    c.bg
                                                  )}
                                                  title={`Format selection to ${c.name}`}
                                                />
                                              ))}
                                              <div className="h-4 w-px bg-slate-800 mx-1" />
                                              <button
                                                type="button"
                                                onClick={insertMotdNewline}
                                                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 text-[10px] font-bold transition-colors"
                                                title="Insert literal newline \n tag"
                                              >
                                                + New Line (\n)
                                              </button>
                                            </div>

                                            {/* Text Area */}
                                            <textarea
                                              id="motd-textarea"
                                              value={config.motd || ''}
                                              onChange={e => { setConfig({...config, motd: e.target.value}); setIsDirty(true); }}
                                              placeholder="Enter server welcome message... Use \n for line breaks, or color presets above."
                                              rows={4}
                                              className="w-full bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 rounded-b-xl px-4 py-3 text-slate-200 focus:outline-none font-mono transition-all text-sm placeholder-slate-600 shadow-inner resize-y min-h-[90px]"
                                            />

                                            {/* Real-time Game Preview */}
                                            <div className="mt-2.5 flex flex-col gap-1.5 bg-slate-950/40 border border-white/5 rounded-2xl p-4">
                                              <div className="text-[10px] uppercase font-black text-slate-500 tracking-wider flex items-center justify-between">
                                                <span>In-Game Broadcast Preview</span>
                                                <span className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold px-1.5 py-0.5 rounded">Real-Time</span>
                                              </div>
                                              <div className="text-sm font-semibold tracking-wide leading-relaxed p-2.5 rounded-xl bg-black/30 border border-slate-900/60 font-sans break-words select-none max-h-[150px] overflow-y-auto custom-scrollbar text-left">
                                                {renderMotdPreview(config.motd || '')}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-2 gap-4">
                                            <div className="flex flex-col gap-1.5">
                                              <label className="text-xs font-bold text-slate-300">Duration</label>
                                              <input type="number" value={config.motdDuration || 0} onChange={e => { setConfig({...config, motdDuration: parseFloat(e.target.value) || 0}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors" />
                                            </div>
                                            <div className="flex flex-col gap-1.5">
                                              <label className="text-xs font-bold text-slate-300">Interval (Mins)</label>
                                              <input type="number" disabled={!config.motdIntervalEnabled} value={config.motdInterval || 0} onChange={e => { setConfig({...config, motdInterval: parseFloat(e.target.value) || 0}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors disabled:opacity-50" />
                                            </div>
                                          </div>
                                          <label className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-amber-500/30 transition-colors">
                                            <input type="checkbox" checked={!!config.motdIntervalEnabled} onChange={e => { setConfig({...config, motdIntervalEnabled: e.target.checked}); setIsDirty(true); }} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/20 bg-slate-900 border-slate-700" />
                                            <span className="text-sm font-semibold text-slate-200">Enable Periodic MOTD</span>
                                          </label>
                                        </div>
                                      </div>
                                      
                                      <div className="bg-slate-900/50 border border-white/5 rounded-3xl p-6">
                                        <h3 className="text-amber-500 font-bold mb-4 uppercase tracking-wider text-sm flex items-center gap-2">
                                          <AlertTriangle className="w-4 h-4" /> Extinction Event
                                        </h3>
                                        <div className="space-y-4">
                                          <label className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-amber-500/30 transition-colors">
                                            <input type="checkbox" checked={!!config.enableExtinctionEvent} onChange={e => { setConfig({...config, enableExtinctionEvent: e.target.checked}); setIsDirty(true); }} className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500/20 bg-slate-900 border-slate-700" />
                                            <span className="text-sm font-semibold text-slate-200">Enable Extinction Event</span>
                                          </label>
                                          <div className="flex flex-col gap-1.5">
                                            <label className="text-xs font-bold text-slate-300">Extinction Interval (Days)</label>
                                            <input type="number" disabled={!config.enableExtinctionEvent} value={config.extinctionEventTimeInterval || 0} onChange={e => { setConfig({...config, extinctionEventTimeInterval: parseFloat(e.target.value) || 0}); setIsDirty(true); }} className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:border-amber-500/50 focus:outline-none transition-colors disabled:opacity-50" />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mb-8">
                                    {renderMapSelector()}
                                  </div>
                                </>
                              )}

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {filteredFields.map(field => renderField(field))}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    )}
                    {activeTab === 'server_options' && (
                      <div className="mt-8 p-6 bg-slate-950/70 border border-amber-500/20 rounded-3xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                        <div className="flex items-center gap-2 mb-3 text-amber-400 font-bold text-sm uppercase tracking-wider">
                          <Cpu className="w-4 h-4" /> Real-time Launch Preview
                        </div>
                        <p className="text-xs text-slate-450 mb-4 leading-relaxed font-medium">
                          This live command line is automatically compiled on server boot based on your settings:
                        </p>
                        <div className="bg-slate-900 border border-white/5 rounded-2xl p-4 font-mono text-xs text-slate-300 break-all select-all leading-normal relative">
                          <span className="text-amber-500 select-none mr-2">ShooterGameServer.exe</span>
                          {launchArgs.join(' ')}
                        </div>
                        {config.enablePublicIpForEpic && (
                          <div className="mt-3 inline-flex items-center gap-2 text-[10px] bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl text-amber-400 font-semibold">
                            <Globe className="w-3.5 h-3.5" /> Note: EGS Crossplay is enabled. Public IP will resolve dynamically on boot to prevent server time-outs.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Floating Sticky Save Bar */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 bg-slate-900/95 backdrop-blur-xl border border-amber-500/30 rounded-2xl shadow-2xl shadow-black/40"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-sm font-semibold text-slate-200">Unsaved changes</span>
              <span className="text-xs text-slate-500 hidden sm:inline">(Ctrl+S to save)</span>
            </div>
            <div className="h-5 w-px bg-slate-700" />
            <button
              onClick={() => {
                if (selectedServer) {
                  loadConfig(selectedServer);
                }
              }}
              className="px-4 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-850 hover:bg-slate-700 border border-slate-700/50 rounded-xl transition-all"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-5 py-1.5 text-sm font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unsaved Changes Warning Modal */}
      <AnimatePresence>
        {showUnsavedWarning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={cancelServerSwitch}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Unsaved Changes</h3>
                  <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                    You have unsaved configuration changes. Switching servers will discard them.
                  </p>
                </div>
                <button onClick={cancelServerSwitch} className="p-1 text-slate-500 hover:text-white transition-colors shrink-0 ml-auto">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={cancelServerSwitch}
                  className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/50 rounded-xl transition-all whitespace-nowrap"
                >
                  Stay Here
                </button>
                <button
                  onClick={async () => {
                    await handleSave();
                    confirmServerSwitch();
                  }}
                  className="px-4 py-2 text-sm font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" /> Save & Switch
                </button>
                <button
                  onClick={confirmServerSwitch}
                  className="px-4 py-2 text-sm font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-all whitespace-nowrap"
                >
                  Discard & Switch
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
