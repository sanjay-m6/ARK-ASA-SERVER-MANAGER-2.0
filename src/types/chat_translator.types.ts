export interface TranslatorConfig {
  serverId: number;
  serverType: 'ASA' | 'ASE';
  enabled: boolean;
  defaultLanguage: string;
  translationApi: 'Google' | 'DeepL' | 'LibreTranslate';
  apiKey?: string;
  translateSystemMessages: boolean;
  cacheTranslations: boolean;
}

export interface TranslatorPlayerPref {
  steamId: string;
  playerName: string;
  selectedLanguage: string;
  serverId: number;
  serverType: 'ASA' | 'ASE';
  lastUpdated: string;
}

export interface TranslatorStats {
  serverId: number;
  serverType: 'ASA' | 'ASE';
  totalCharsTranslated: number;
  totalRequests: number;
  cacheHits: number;
}
