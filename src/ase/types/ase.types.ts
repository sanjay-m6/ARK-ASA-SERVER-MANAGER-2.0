// ASE-specific TypeScript types — completely separate from ASA types

export type AseMapName =
  | 'TheIsland'
  | 'ScorchedEarth_P'
  | 'Aberration_P'
  | 'Extinction'
  | 'Genesis'
  | 'Gen2'
  | 'TheCenter'
  | 'Ragnarok'
  | 'Valguero_P'
  | 'CrystalIsles'
  | 'LostIsland'
  | 'Fjordur'
  | 'Aquatic';

export type AseServerStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed'
  | 'updating'
  | 'online';

export interface AseServer {
  id: number;
  name: string;
  installPath: string;
  mapName: AseMapName;
  port: number;
  queryPort: number;
  rconPort: number;
  rconPassword: string;
  maxPlayers: number;
  serverPassword: string;
  adminPassword: string;
  sessionName: string;
  activeMods: string;
  clusterId: string;
  battleye: boolean;
  extraArgs: string;
  status: AseServerStatus;
  processId?: number;
  createdAt: string;
  updatedAt: string;
  autoStart?: boolean;
  autoStop?: boolean;
  intelligentMode?: boolean;
  startupDelay?: number;
  startupPriority?: number;
}

export interface AseWorkshopMod {
  workshopId: string;
  name: string;
  description: string;
  fileSize: number;
  lastUpdated: string;
  subscriberCount: number;
  previewUrl: string;
  tags: string[];
  isInstalled: boolean;
}

export interface AseInstalledMod {
  id: number;
  serverId: number;
  workshopId: string;
  name: string;
  version: string;
  installedAt: string;
  enabled: boolean;
  loadOrder: number;
  // Enhanced metadata fields
  description?: string;
  author?: string;
  previewUrl?: string;
  cachedImageUrl?: string;
  workshopUrl?: string;
  subscribers?: number;
  fileSize?: number;
  timeUpdated?: number;
  timeCreated?: number;
  tags?: string[];
  modStatus?: string;
  downloadStatus?: string;
}

export interface ModValidationReport {
  workshopId: string;
  isValid: boolean;
  issues: string[];
  fileCount: number;
  totalSize: number;
  hasUcas: boolean;
  hasUtoc: boolean;
  hasModFile: boolean;
}

export interface AseCluster {
  id: number;
  name: string;
  clusterDir: string;
  serverIds: number[];
  allowTransferSurvivors: boolean;
  allowTransferItems: boolean;
  allowTransferDinos: boolean;
  createdAt: string;
}

export interface AseGameConfig {
  // ── Identity ──
  sessionName: string;
  serverPassword: string;
  serverAdminPassword: string;
  maxPlayers: number;

  // ── Difficulty ──
  difficultyOffset: number;
  overrideOfficialDifficulty: number;
  MaxDifficulty: boolean;

  // ── Core Rates ──
  xpMultiplier: number;
  tamingSpeedMultiplier: number;
  harvestAmountMultiplier: number;
  harvestHealthMultiplier: number;
  resourcesRespawnPeriodMultiplier: number;
  itemStackSizeMultiplier: number;

  // ── Player Stats ──
  playerCharacterFoodDrainMultiplier: number;
  playerCharacterWaterDrainMultiplier: number;
  playerCharacterStaminaDrainMultiplier: number;
  playerCharacterHealthRecoveryMultiplier: number;
  playerDamageMultiplier: number;
  playerResistanceMultiplier: number;

  // ── Dino Stats ──
  dinoCharacterFoodDrainMultiplier: number;
  dinoCharacterHealthRecoveryMultiplier: number;
  dinoDamageMultiplier: number;
  dinoResistanceMultiplier: number;
  maxTamedDinos: number;
  dinoCountMultiplier: number;
  wildDinoTorporDrainMultiplier: number;
  tamedDinoTorporDrainMultiplier: number;
  passiveTameIntervalMultiplier: number;
  useSingleplayerSettings: boolean;
  disableDinoBreeding: boolean;
  allowUnclaimDinos: boolean;
  useDinoLevelUpAnimations: boolean;
  maxPersonalTamedDinos: number;
  personalTamedDinosSaddleStructureCost: number;

  // ── Breeding (Game.ini) ──
  eggHatchSpeedMultiplier: number;
  babyMatureSpeedMultiplier: number;
  babyCuddleIntervalMultiplier: number;
  babyImprintAmountMultiplier: number;
  matingIntervalMultiplier: number;
  babyFoodConsumptionSpeedMultiplier: number;
  babyCuddleGracePeriodMultiplier: number;
  babyCuddleLoseImprintQualitySpeedMultiplier: number;
  mutagenLevelBoost: number;
  mutagenLevelBoostBred: number;
  maxImprintLimit: number;

  // ── Structures ──
  theMaxStructuresInRange: number;
  structureDamageMultiplier: number;
  structureResistanceMultiplier: number;
  perPlatformMaxStructuresMultiplier: number;
  autoDestroyDecayedDinos: boolean;
  disableStructureDecayPve: boolean;
  pveAllowStructuresAtSupplyDrops: boolean;
  forceAllStructureLocking: boolean;
  autoDestroyOldStructuresMultiplier: number;
  structurePickupTimeAfterPlacement: number;
  structurePickupHoldDuration: number;
  allowIntegratedSpinetAttachment: boolean;
  ignoreLimitMaxStructuresInRangeTypeFlag: boolean;
  ignoreStructuresPreventionVolumes: boolean;
  bDisableStructurePlacementCollision: boolean;

  // ── PvP Rules ──
  serverPve: boolean;
  allowCaveBuildingPvp: boolean;
  disableRailgunPvp: boolean;
  enablePvpGamma: boolean;
  pvpStructureDecay: boolean;
  pvpDinoDecay: boolean;
  globalPoweredBatteryDurabilityDecreasePerSecond: number;
  PreventOfflinePvP: boolean;
  PreventOfflinePvPInterval: number;

  // ── Player Rules ──
  allowThirdPersonPlayer: boolean;
  serverCrosshair: boolean;
  showMapPlayerLocation: boolean;
  allowFlyerCarryPve: boolean;
  disableWeatherFog: boolean;
  allowAnyoneBabyImprintCuddle: boolean;
  allowHitMarkers: boolean;
  enableExtraStructurePreventionVolumes: boolean;
  showFloatingDamageText: boolean;
  forceFlyerexplosives: boolean;
  bUseCorpseLocator: boolean;
  bShowStatusTypes: boolean;
  bAllowUnlimitedRespecs: boolean;

  // ── Tribe Settings ──
  preventTribeAlliances: boolean;
  allowTribeAlliance: boolean;
  allowTribeWarfare: boolean;
  maxTribeLogs: number;
  maxNumberOfPlayersInTribe: number;

  // ── Tribute / Transfer ──
  maxTributeDinos: number;
  maxTributeItems: number;
  noTributeDownloads: boolean;
  preventDownloadSurvivors: boolean;
  preventDownloadItems: boolean;
  preventDownloadDinos: boolean;
  preventUploadSurvivors: boolean;
  preventUploadItems: boolean;
  preventUploadDinos: boolean;
  disableCustomFoldersInTributeInventories: boolean;
  crossarkAllowForeignDinoDownloads: boolean;

  // ── Environment ──
  dayCycleSpeedScale: number;
  dayTimeSpeedScale: number;
  nightTimeSpeedScale: number;
  spoilingTimeMultiplier: number;
  itemDecompositionTimeMultiplier: number;
  corpseDecompositionTimeMultiplier: number;
  cropGrowthSpeedMultiplier: number;
  cropDecaySpeedMultiplier: number;
  layEggIntervalMultiplier: number;
  poopIntervalMultiplier: number;
  hairGrowthSpeedMultiplier: number;
  customRecipeEffectivenessMultiplier: number;
  customRecipeSkillMultiplier: number;
  fishingLootQualityMultiplier: number;
  supplyCrateLootQualityMultiplier: number;
  globalSpoilingTimeMultiplier: number;
  globalItemDecompositionTimeMultiplier: number;
  globalCorpseDecompositionTimeMultiplier: number;
  killXpMultiplier: number;
  harvestXpMultiplier: number;
  craftXpMultiplier: number;
  genericXpMultiplier: number;
  specialXpMultiplier: number;

  // ── Hexagons (Genesis) ──
  maxHexagonsPerCharacter: number;
  hexagonRewardMultiplier: number;

  // ── Engrams ──
  autoUnlockAllEngrams: boolean;
  onlyAllowSpecifiedEngrams: boolean;
  overrideNamedEngramEntries: string;
  configOverrideItemCraftingCosts: string;

  // ── Network / Admin ──
  rconEnabled: boolean;
  rconPort: number;
  battleEyeEnforcer: boolean;
  enableCreativeMode: boolean;
  serverForceNoHud: boolean;
  kickIdlePlayerPeriod: number;
  destroyTamesOverLevelClamp: number;
  SpectatorPassword: string;

  // ── Mods ──
  activeMods: string;

  // ── MOTD ──
  motd: string;
  motdDuration: number;

  // ── Auto-save ──
  autoSavePeriodMinutes: number;

  // ── Events ──
  activeEvent: string;
  eventColorsChanceOverride: number;

  // ── Administration ──
  badWordFilter: string;
  adminList: string;
  customDynamicConfigUrl: string;
  customLiveTuningUrl: string;
  useSecureSpawnRules: boolean;
  useItemDupeCheck: boolean;
  secureSendArkPayload: boolean;
  culture: string;

  // ── Launcher ──
  launcherArgs: string;
  useAllAvailableCores: boolean;
  useLowMemory: boolean;
  noBattleEye: boolean;

  // ── Ragnarok-specific ──
  ragnarokVolcanoIntensity: number;
  ragnarokVolcanoInterval: number;
  enableRagnarokSettings: boolean;

  // ── Fjordur-specific ──
  useFjordurTraversalBuff: boolean;
  enableFjordurSettings: boolean;

  // ── Adjustable Spawner ──
  adjustableMutagenSpawnDelayMultiplier: number;

  // ── Chat & Voice ──
  globalVoiceChat: boolean;
  proximityVoiceChat: boolean;
  alwaysNotifyPlayerJoined: boolean;
  alwaysNotifyPlayerLeft: boolean;
  serverAdminCommandLogging: boolean;

  // ── PvP & PvE Advanced ──
  bDisableFriendlyFire: boolean;
  nonPermanentDiseases: boolean;
  preventDiseases: boolean;
  allowCryoCooldownOnPvE: boolean;
  disableCryopodEnemyCheck: boolean;
  pvpZoneStructureDamageMultiplier: number;
  structureDamageRepairCooldown: number;

  // ── Harvesting & Core Rates ──
  clampResourceHarvestDamage: boolean;
  optimizedHarvestingHealth: boolean;
  tamedDinoHarvestingDamageMultiplier: number;
  dinoTurretDamageMultiplier: number;
  tamedDinoCharacterFoodDrainMultiplier: number;
  wildDinoCharacterFoodDrainMultiplier: number;

  // ── Decay & Platforms ──
  structureDecayPeriodMultiplier: number;
  pveDinoDecayPeriodMultiplier: number;
  fastDecayUnsnappedCoreStructures: boolean;
  bAllowPlatformSaddleMultiFloors: boolean;

  // ── Advanced Environment/Flyers ──
  allowFlyingStaminaRecovery: boolean;
  flyerPlatformMaxStructuresMultiplier: number;
}

export interface AseBackup {
  id: number;
  serverId: number;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AseScheduledTask {
  id: number;
  serverId: number;
  taskType: 'restart' | 'update' | 'backup' | 'wipe_dinos';
  cronExpr: string;
  enabled: boolean;
  lastRun?: string;
}

export interface AseServerPorts {
  gamePort: number;
  rawPort: number;     // auto = gamePort + 1
  queryPort: number;
  rconPort: number;
}
