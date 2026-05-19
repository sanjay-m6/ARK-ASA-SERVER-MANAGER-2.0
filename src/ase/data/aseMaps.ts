import type { AseMapName } from '../types/ase.types';

// Map images from src/assets/Ase_maps
import islandImg from '../../assets/Ase_maps/island.webp';
import scorchedImg from '../../assets/Ase_maps/Scorched Earth.webp';
import aberrationImg from '../../assets/Ase_maps/Aberration.webp';
import gen1Img from '../../assets/Ase_maps/gen-1.webp';
import gen2Img from '../../assets/Ase_maps/gen-2.webp';
import ragnarockImg from '../../assets/Ase_maps/rangrock.png';
import valgueroImg from '../../assets/Ase_maps/Valguero.png';
import crystalImg from '../../assets/Ase_maps/cryslis.jpg';
import lostIslandImg from '../../assets/Ase_maps/Lostisland.jpg';
import fjordurImg from '../../assets/Ase_maps/fjordur.jpg';
import centerImg from '../../assets/Ase_maps/center.webp';
import extinctionImg from '../../assets/Ase_maps/Extinction.webp';
import aquaticImg from '../../assets/Ase_maps/AQUAtic.png';

export interface AseMapInfo {
  name: string;
  serverArg: AseMapName;
  dlcType: 'Free' | 'Paid DLC' | 'Free DLC';
  description: string;
  image?: string;
  size: string;
}

export const ASE_MAPS: AseMapInfo[] = [
  { name: 'The Island', serverArg: 'TheIsland', dlcType: 'Free', description: 'The original ARK map — tropical island with diverse biomes.', image: islandImg, size: '~8 GB' },
  { name: 'Scorched Earth', serverArg: 'ScorchedEarth_P', dlcType: 'Paid DLC', description: 'Desert survival with extreme heat and electrical storms.', image: scorchedImg, size: '~5 GB' },
  { name: 'Aberration', serverArg: 'Aberration_P', dlcType: 'Paid DLC', description: 'Underground caverns with bioluminescence and radiation zones.', image: aberrationImg, size: '~6 GB' },
  { name: 'Extinction', serverArg: 'Extinction', dlcType: 'Paid DLC', description: 'Ruined Earth with Titans, orbital supply drops, and element veins.', image: extinctionImg, size: '~7 GB' },
  { name: 'Genesis Part 1', serverArg: 'Genesis', dlcType: 'Paid DLC', description: 'Simulation with five unique biomes and mission-based gameplay.', image: gen1Img, size: '~8 GB' },
  { name: 'Genesis Part 2', serverArg: 'Gen2', dlcType: 'Paid DLC', description: 'Colony ship with Rockwell as the main antagonist.', image: gen2Img, size: '~9 GB' },
  { name: 'The Center', serverArg: 'TheCenter', dlcType: 'Free DLC', description: 'Massive island map with floating islands and underwater caves.', image: centerImg, size: '~5 GB' },
  { name: 'Ragnarok', serverArg: 'Ragnarok', dlcType: 'Free DLC', description: 'Huge map with multiple biomes including a volcanic region.', image: ragnarockImg, size: '~7 GB' },
  { name: 'Valguero', serverArg: 'Valguero_P', dlcType: 'Free DLC', description: 'Diverse landscape with a chalk cliff biome and Deinonychus.', image: valgueroImg, size: '~5 GB' },
  { name: 'Crystal Isles', serverArg: 'CrystalIsles', dlcType: 'Free DLC', description: 'Beautiful crystalline landscape with Crystal Wyverns.', image: crystalImg, size: '~6 GB' },
  { name: 'Lost Island', serverArg: 'LostIsland', dlcType: 'Free DLC', description: 'Community-created map with unique creatures.', image: lostIslandImg, size: '~5 GB' },
  { name: 'Fjordur', serverArg: 'Fjordur', dlcType: 'Free DLC', description: 'Norse-themed map with multiple realms and Andrewsarchus.', image: fjordurImg, size: '~6 GB' },
  { name: 'Pre-Aquatica (Aquatic)', serverArg: 'Aquatic', dlcType: 'Free DLC', description: 'Special aquatic mod or custom map before the update.', image: aquaticImg, size: '~6 GB' },
];

/** ASE server branches available via SteamCMD -beta flag */
export interface AseBranch {
  id: string;
  name: string;
  description: string;
  betaFlag: string;
}

export const ASE_BRANCHES: AseBranch[] = [
  { id: 'default', name: 'Default (Latest)', description: 'Current stable release — recommended for most servers', betaFlag: '' },
  { id: 'preaquatica', name: 'Pre-Aquatica', description: 'Server version before the Aquatica update', betaFlag: 'preaquatica' },
  { id: 'experimental', name: 'Experimental', description: 'Bleeding-edge test builds — may be unstable', betaFlag: 'experimental' },
  { id: 'halloween', name: 'Halloween Event', description: 'Special Halloween seasonal event build', betaFlag: 'halloween' },
  { id: 'winterwonderland', name: 'Winter Wonderland', description: 'Holiday event with snow and Raptor Claus', betaFlag: 'winterwonderland' },
  { id: 'eggcellent', name: 'Eggcellent Adventure', description: 'Easter event with Bunny Dodo and egg hunts', betaFlag: 'eggcellent' },
  { id: 'summer', name: 'Summer Bash', description: 'Summer celebration with unique skins', betaFlag: 'summer' },
];

export function getAseMapByArg(serverArg: AseMapName): AseMapInfo | undefined {
  return ASE_MAPS.find((m) => m.serverArg === serverArg);
}

export function getAseMapDisplayName(serverArg: AseMapName): string {
  return getAseMapByArg(serverArg)?.name || serverArg;
}
