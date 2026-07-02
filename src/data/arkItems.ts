export interface ArkItem {
  id: string;
  name: string;
  category: string;
}

export const arkItems: ArkItem[] = [
  // Resources
  { id: 'PrimalItemResource_Wood_C', name: 'Wood', category: 'Resources' },
  { id: 'PrimalItemResource_Stone_C', name: 'Stone', category: 'Resources' },
  { id: 'PrimalItemResource_Flint_C', name: 'Flint', category: 'Resources' },
  { id: 'PrimalItemResource_Thatch_C', name: 'Thatch', category: 'Resources' },
  { id: 'PrimalItemResource_Hide_C', name: 'Hide', category: 'Resources' },
  { id: 'PrimalItemResource_Fiber_C', name: 'Fiber', category: 'Resources' },
  { id: 'PrimalItemResource_Metal_C', name: 'Metal', category: 'Resources' },
  { id: 'PrimalItemResource_MetalIngot_C', name: 'Metal Ingot', category: 'Resources' },
  { id: 'PrimalItemResource_Crystal_C', name: 'Crystal', category: 'Resources' },
  { id: 'PrimalItemResource_Obsidian_C', name: 'Obsidian', category: 'Resources' },
  { id: 'PrimalItemResource_Oil_C', name: 'Oil', category: 'Resources' },
  { id: 'PrimalItemResource_Polymer_C', name: 'Polymer', category: 'Resources' },
  { id: 'PrimalItemResource_Polymer_Organic_C', name: 'Organic Polymer', category: 'Resources' },
  { id: 'PrimalItemResource_Pelt_C', name: 'Pelt', category: 'Resources' },
  { id: 'PrimalItemResource_ChitinPaste_C', name: 'Cementing Paste', category: 'Resources' },
  { id: 'PrimalItemResource_Chitin_C', name: 'Chitin', category: 'Resources' },
  { id: 'PrimalItemResource_Keratin_C', name: 'Keratin', category: 'Resources' },
  { id: 'PrimalItemResource_Sparkpowder_C', name: 'Sparkpowder', category: 'Resources' },
  { id: 'PrimalItemResource_Gunpowder_C', name: 'Gunpowder', category: 'Resources' },
  { id: 'PrimalItemResource_Element_C', name: 'Element', category: 'Resources' },
  
  // Consumables
  { id: 'PrimalItemConsumable_RawMeat_C', name: 'Raw Meat', category: 'Consumables' },
  { id: 'PrimalItemConsumable_CookedMeat_C', name: 'Cooked Meat', category: 'Consumables' },
  { id: 'PrimalItemConsumable_RawPrimeMeat_C', name: 'Raw Prime Meat', category: 'Consumables' },
  { id: 'PrimalItemConsumable_CookedPrimeMeat_C', name: 'Cooked Prime Meat', category: 'Consumables' },
  { id: 'PrimalItemConsumable_Berry_Amarberry_C', name: 'Amarberry', category: 'Consumables' },
  { id: 'PrimalItemConsumable_Berry_Azulberry_C', name: 'Azulberry', category: 'Consumables' },
  { id: 'PrimalItemConsumable_Berry_Tintoberry_C', name: 'Tintoberry', category: 'Consumables' },
  { id: 'PrimalItemConsumable_Berry_Mejoberry_C', name: 'Mejoberry', category: 'Consumables' },
  { id: 'PrimalItemConsumable_Berry_Narcoberry_C', name: 'Narcoberry', category: 'Consumables' },
  { id: 'PrimalItemConsumable_Berry_Stimberry_C', name: 'Stimberry', category: 'Consumables' },
  { id: 'PrimalItemConsumable_Narcotic_C', name: 'Narcotic', category: 'Consumables' },
  { id: 'PrimalItemConsumable_Stimulant_C', name: 'Stimulant', category: 'Consumables' },
  { id: 'PrimalItemConsumable_HealSoup_C', name: 'Medical Brew', category: 'Consumables' },
  { id: 'PrimalItemConsumable_StaminaSoup_C', name: 'Energy Brew', category: 'Consumables' },

  // Weapons & Tools
  { id: 'PrimalItem_WeaponStonePick_C', name: 'Stone Pick', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponStoneHatchet_C', name: 'Stone Hatchet', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponMetalPick_C', name: 'Metal Pick', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponMetalHatchet_C', name: 'Metal Hatchet', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponTorch_C', name: 'Torch', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponBow_C', name: 'Bow', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponCrossbow_C', name: 'Crossbow', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponCompoundBow_C', name: 'Compound Bow', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponPike_C', name: 'Pike', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponSword_C', name: 'Sword', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponShotgun_C', name: 'Shotgun', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponMachinedShotgun_C', name: 'Pump-Action Shotgun', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponRifle_C', name: 'Longneck Rifle', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponMachinedSniper_C', name: 'Fabricated Sniper Rifle', category: 'Weapons & Tools' },
  { id: 'PrimalItem_WeaponAssaultRifle_C', name: 'Assault Rifle', category: 'Weapons & Tools' },

  // Ammo
  { id: 'PrimalItemAmmo_ArrowStone_C', name: 'Stone Arrow', category: 'Ammo' },
  { id: 'PrimalItemAmmo_ArrowTranq_C', name: 'Tranq Arrow', category: 'Ammo' },
  { id: 'PrimalItemAmmo_TranqDart_C', name: 'Tranq Dart', category: 'Ammo' },
  { id: 'PrimalItemAmmo_RefinedTranqDart_C', name: 'Shocking Tranq Dart', category: 'Ammo' },
  { id: 'PrimalItemAmmo_SimpleBullet_C', name: 'Simple Bullet', category: 'Ammo' },
  { id: 'PrimalItemAmmo_SimpleShotgunBullet_C', name: 'Simple Shotgun Ammo', category: 'Ammo' },
  { id: 'PrimalItemAmmo_SimpleRifleBullet_C', name: 'Simple Rifle Ammo', category: 'Ammo' },
  { id: 'PrimalItemAmmo_AdvancedBullet_C', name: 'Advanced Bullet', category: 'Ammo' },
  { id: 'PrimalItemAmmo_AdvancedRifleBullet_C', name: 'Advanced Rifle Bullet', category: 'Ammo' },

  // Armor (Flak)
  { id: 'PrimalItemArmor_FlakHelmet_C', name: 'Flak Helmet', category: 'Armor' },
  { id: 'PrimalItemArmor_FlakShirt_C', name: 'Flak Chestpiece', category: 'Armor' },
  { id: 'PrimalItemArmor_FlakPants_C', name: 'Flak Leggings', category: 'Armor' },
  { id: 'PrimalItemArmor_FlakGloves_C', name: 'Flak Gauntlets', category: 'Armor' },
  { id: 'PrimalItemArmor_FlakBoots_C', name: 'Flak Boots', category: 'Armor' },

  // Armor (Riot)
  { id: 'PrimalItemArmor_RiotHelmet_C', name: 'Riot Helmet', category: 'Armor' },
  { id: 'PrimalItemArmor_RiotShirt_C', name: 'Riot Chestpiece', category: 'Armor' },
  { id: 'PrimalItemArmor_RiotPants_C', name: 'Riot Leggings', category: 'Armor' },
  { id: 'PrimalItemArmor_RiotGloves_C', name: 'Riot Gauntlets', category: 'Armor' },
  { id: 'PrimalItemArmor_RiotBoots_C', name: 'Riot Boots', category: 'Armor' },

  // Saddles
  { id: 'PrimalItemArmor_RexSaddle_C', name: 'Rex Saddle', category: 'Saddles' },
  { id: 'PrimalItemArmor_SpinoSaddle_C', name: 'Spino Saddle', category: 'Saddles' },
  { id: 'PrimalItemArmor_TherizinosaurusSaddle_C', name: 'Therizinosaurus Saddle', category: 'Saddles' },
  { id: 'PrimalItemArmor_PteroSaddle_C', name: 'Pteranodon Saddle', category: 'Saddles' },
  { id: 'PrimalItemArmor_ArgentavisSaddle_C', name: 'Argentavis Saddle', category: 'Saddles' },
  { id: 'PrimalItemArmor_QuetzSaddle_C', name: 'Quetzal Saddle', category: 'Saddles' }
];

export const arkSupplyCrates: ArkItem[] = [
  // White/Level 3
  { id: 'SupplyCrate_Level03_C', name: 'White Beacon', category: 'Beacons' },
  { id: 'SupplyCrate_Level03_Double_C', name: 'White Beacon (Double)', category: 'Beacons' },
  
  // Green/Level 15
  { id: 'SupplyCrate_Level15_C', name: 'Green Beacon', category: 'Beacons' },
  { id: 'SupplyCrate_Level15_Double_C', name: 'Green Beacon (Double)', category: 'Beacons' },
  
  // Blue/Level 25
  { id: 'SupplyCrate_Level25_C', name: 'Blue Beacon', category: 'Beacons' },
  { id: 'SupplyCrate_Level25_Double_C', name: 'Blue Beacon (Double)', category: 'Beacons' },
  
  // Purple/Level 35
  { id: 'SupplyCrate_Level35_C', name: 'Purple Beacon', category: 'Beacons' },
  { id: 'SupplyCrate_Level35_Double_C', name: 'Purple Beacon (Double)', category: 'Beacons' },
  
  // Yellow/Level 45
  { id: 'SupplyCrate_Level45_C', name: 'Yellow Beacon', category: 'Beacons' },
  { id: 'SupplyCrate_Level45_Double_C', name: 'Yellow Beacon (Double)', category: 'Beacons' },
  
  // Red/Level 60
  { id: 'SupplyCrate_Level60_C', name: 'Red Beacon', category: 'Beacons' },
  { id: 'SupplyCrate_Level60_Double_C', name: 'Red Beacon (Double)', category: 'Beacons' },

  // Cave Drops
  { id: 'SupplyCrate_Cave_QualityTier1_C', name: 'Cave Drop (Tier 1 - Green)', category: 'Cave Drops' },
  { id: 'SupplyCrate_Cave_QualityTier2_C', name: 'Cave Drop (Tier 2 - Blue)', category: 'Cave Drops' },
  { id: 'SupplyCrate_Cave_QualityTier3_C', name: 'Cave Drop (Tier 3 - Yellow)', category: 'Cave Drops' },
  { id: 'SupplyCrate_Cave_QualityTier4_C', name: 'Cave Drop (Tier 4 - Red)', category: 'Cave Drops' },
  
  // Deep Sea
  { id: 'SupplyCrate_OceanInstant_C', name: 'Deep Sea Loot Crate', category: 'Special' }
];
