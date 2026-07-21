/**
 * Automatic Port Allocation Utility for ARK Server Manager (ASA & ASE)
 */

export interface ServerPortConfig {
    gamePort: number;
    queryPort: number;
    rconPort: number;
}

export interface MinimalServerProfile {
    id?: number | string;
    ports?: {
        gamePort?: number;
        queryPort?: number;
        rconPort?: number;
    };
    port?: number;
    queryPort?: number;
    rconPort?: number;
}

/**
 * Collects all ports currently configured across all existing server profiles.
 */
export function getUsedPorts(
    servers: MinimalServerProfile[],
    excludeServerId?: number | string
): Set<number> {
    const used = new Set<number>();

    for (const server of servers) {
        if (excludeServerId !== undefined && (server.id === excludeServerId || String(server.id) === String(excludeServerId))) {
            continue;
        }

        const gp = Number(server.ports?.gamePort ?? server.port ?? 7777);
        const qp = Number(server.ports?.queryPort ?? server.queryPort ?? 27015);
        const rp = Number(server.ports?.rconPort ?? server.rconPort ?? 32330);

        if (gp > 0) {
            used.add(gp);
            used.add(gp + 1); // Raw Port (Game Port + 1)
        }
        if (qp > 0) {
            used.add(qp);
        }
        if (rp > 0) {
            used.add(rp);
        }
    }

    return used;
}

/**
 * Checks if a specific set of ports has any conflicts against existing servers.
 */
export function hasPortConflicts(
    gamePort: number,
    queryPort: number,
    rconPort: number,
    existingServers: MinimalServerProfile[],
    excludeServerId?: number | string
): { hasConflict: boolean; conflictingPorts: string[] } {
    const used = getUsedPorts(existingServers, excludeServerId);
    const conflictingPorts: string[] = [];

    if (used.has(gamePort)) conflictingPorts.push(`Game Port (${gamePort})`);
    if (used.has(gamePort + 1)) conflictingPorts.push(`Raw Port (${gamePort + 1})`);
    if (used.has(queryPort)) conflictingPorts.push(`Query Port (${queryPort})`);
    if (used.has(rconPort)) conflictingPorts.push(`RCON Port (${rconPort})`);

    // Check internal duplicates
    if (gamePort === queryPort) conflictingPorts.push(`Game & Query Duplicate (${gamePort})`);
    if (gamePort === rconPort) conflictingPorts.push(`Game & RCON Duplicate (${gamePort})`);
    if (queryPort === rconPort) conflictingPorts.push(`Query & RCON Duplicate (${queryPort})`);

    return {
        hasConflict: conflictingPorts.length > 0,
        conflictingPorts
    };
}

/**
 * Automatically calculates the next available non-conflicting ports for a server.
 * Increments ports automatically to find a completely free, collision-free slot.
 */
export function allocateNextAvailablePorts(
    existingServers: MinimalServerProfile[],
    options: {
        desiredGamePort?: number;
        desiredQueryPort?: number;
        desiredRconPort?: number;
        excludeServerId?: number | string;
        isAse?: boolean;
    } = {}
): ServerPortConfig {
    const used = getUsedPorts(existingServers, options.excludeServerId);

    let gamePort = options.desiredGamePort && options.desiredGamePort > 0 ? options.desiredGamePort : 7777;
    let queryPort = options.desiredQueryPort && options.desiredQueryPort > 0 ? options.desiredQueryPort : 27015;
    let rconPort = options.desiredRconPort && options.desiredRconPort > 0 ? options.desiredRconPort : (options.isAse ? 27020 : 32330);

    // Increment Game Port (step of 2 to keep Game + Raw clean) until free
    while (used.has(gamePort) || used.has(gamePort + 1)) {
        gamePort += 2;
    }

    // Increment Query Port until free and non-colliding
    while (used.has(queryPort) || queryPort === gamePort || queryPort === gamePort + 1) {
        queryPort += 1;
    }

    // Increment RCON Port until free and non-colliding
    while (
        used.has(rconPort) ||
        rconPort === gamePort ||
        rconPort === gamePort + 1 ||
        rconPort === queryPort
    ) {
        rconPort += 1;
    }

    return {
        gamePort,
        queryPort,
        rconPort
    };
}
