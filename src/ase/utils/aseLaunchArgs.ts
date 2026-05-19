import type { AseServer, AseGameConfig } from '../types/ase.types';

/**
 * Build the ASE launch command arguments for ShooterGameServer.exe.
 * 
 * ASE uses a single "travel URL" string as the first argument:
 *   MapName?listen?SessionName=...?Port=...?QueryPort=...
 * Followed by dash flags like -server -log -NoBattlEye
 */
export function buildAseLaunchArgs(server: AseServer, config?: AseGameConfig): string[] {
    const params: string[] = [
        server.mapName,
        'listen',
        `SessionName=${server.sessionName}`,
        `Port=${server.port}`,
        `QueryPort=${server.queryPort}`,
        `MaxPlayers=${server.maxPlayers}`,
        'RCONEnabled=True',
        `RCONPort=${server.rconPort}`,
    ];

    if (server.serverPassword) {
        params.push(`ServerPassword=${server.serverPassword}`);
    }

    if (server.adminPassword) {
        params.push(`ServerAdminPassword=${server.adminPassword}`);
    }

    // Build the travel URL (joined by ?)
    const travelUrl = params.join('?');

    // Build dash flags
    const flags: string[] = ['-server', '-log'];

    if (!server.battleye) {
        flags.push('-NoBattlEye');
    }

    if (server.clusterId) {
        flags.push(`-clusterid=${server.clusterId}`);
    }

    if (server.extraArgs) {
        flags.push(...server.extraArgs.split(/\s+/).filter(Boolean));
    }

    if (config) {
        if (config.activeEvent) {
            flags.push(`-ActiveEvent=${config.activeEvent}`);
        }
        if (config.noBattleEye && server.battleye) {
            flags.push('-NoBattlEye');
        }
        if (config.useAllAvailableCores) {
            flags.push('-USEALLAVAILABLECORES');
        }
        if (config.useLowMemory) {
            flags.push('-nomansky');
            flags.push('-lowmemory');
        }
        if (config.launcherArgs) {
            flags.push(...config.launcherArgs.split(/\s+/).filter(Boolean));
        }
    }

    return [travelUrl, ...flags];
}

/**
 * Build the full command line string for display purposes.
 */
export function buildAseCommandLine(server: AseServer, config?: AseGameConfig): string {
    const args = buildAseLaunchArgs(server, config);
    const exePath = `"${server.installPath}\\ShooterGame\\Binaries\\Win64\\ShooterGameServer.exe"`;
    return `${exePath} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`;
}

/**
 * Suggest the next available port group for a new ASE server.
 * ASE uses: Game (7777), Raw (7778 = game+1), Query (27015), RCON (27020)
 */
export function suggestNextAsePorts(existingServers: AseServer[]): {
    gamePort: number;
    queryPort: number;
    rconPort: number;
} {
    if (existingServers.length === 0) {
        return { gamePort: 7777, queryPort: 27015, rconPort: 27020 };
    }

    const usedGamePorts = new Set(existingServers.map(s => s.port));
    const usedQueryPorts = new Set(existingServers.map(s => s.queryPort));
    const usedRconPorts = new Set(existingServers.map(s => s.rconPort));

    let gamePort = 7777;
    while (usedGamePorts.has(gamePort) || usedGamePorts.has(gamePort + 1)) {
        gamePort += 2; // Game port uses port and port+1
    }

    let queryPort = 27015;
    while (usedQueryPorts.has(queryPort)) {
        queryPort += 1;
    }

    let rconPort = 27020;
    while (usedRconPorts.has(rconPort)) {
        rconPort += 1;
    }

    return { gamePort, queryPort, rconPort };
}
