export interface InternalIPAllocation {
    serviceName : string;
    ipAddress : string;
}

function isPlainObject(value : unknown) : value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function servicesOf(config : unknown) : Array<[string, Record<string, unknown>]> {
    if (!isPlainObject(config) || !isPlainObject(config.services)) {
        return [];
    }

    return Object.entries(config.services).filter(([ , service ]) => isPlainObject(service)) as Array<[
        string,
        Record<string, unknown>
    ]>;
}

function networkSettings(service : Record<string, unknown>, networkName : string) : unknown {
    if (Array.isArray(service.networks)) {
        return service.networks.includes(networkName) ? {} : undefined;
    }

    if (isPlainObject(service.networks) && Object.hasOwn(service.networks, networkName)) {
        return service.networks[networkName];
    }

    return undefined;
}

function hasNetwork(service : Record<string, unknown>, networkName : string) : boolean {
    return networkSettings(service, networkName) !== undefined;
}

function staticIPAddress(settings : unknown) : string | undefined {
    if (!isPlainObject(settings) || typeof settings.ipv4_address !== "string") {
        return undefined;
    }
    return settings.ipv4_address;
}

/**
 * Services that are connected to the shared network but do not yet have a
 * fixed IPv4 address. The order is the Compose service order, which makes
 * automatic allocation deterministic for a new Stack.
 */
export function servicesNeedingInternalIP(config : unknown, networkName : string) : string[] {
    if (!networkName) {
        return [];
    }

    return servicesOf(config)
        .filter(([ , service ]) => !service.network_mode && hasNetwork(service, networkName))
        .filter(([ , service ]) => !staticIPAddress(networkSettings(service, networkName)))
        .map(([ serviceName ]) => serviceName);
}

/**
 * ComposeMgt-compatible allocation order: keep the service subnet's low
 * addresses available for Docker, then use .100-.254 followed by .2-.99.
 */
export function internalIPCandidates(prefix : string, reservedSuffixes : ReadonlySet<number> = new Set([ 254 ])) : string[] {
    const suffixes = [
        ...Array.from({ length: 155 }, (_, index) => index + 100),
        ...Array.from({ length: 98 }, (_, index) => index + 2),
    ];

    return suffixes
        .filter(suffix => !reservedSuffixes.has(suffix))
        .map(suffix => `${prefix}.${suffix}`);
}

export function findAvailableInternalIP(
    prefix : string,
    usedAddresses : ReadonlySet<string>,
    reservedSuffixes : ReadonlySet<number> = new Set([ 254 ])
) : string | undefined {
    return internalIPCandidates(prefix, reservedSuffixes)
        .find(address => !usedAddresses.has(address));
}

function serviceNetworksWithAddress(
    service : Record<string, unknown>,
    networkName : string,
    ipAddress : string
) : Record<string, unknown> | undefined {
    if (Array.isArray(service.networks)) {
        if (!service.networks.includes(networkName)) {
            return undefined;
        }

        const networks : Record<string, unknown> = {};
        for (const network of service.networks) {
            if (typeof network === "string") {
                networks[network] = {};
            }
        }
        networks[networkName] = { ipv4_address: ipAddress };
        return networks;
    }

    if (!isPlainObject(service.networks) || !Object.hasOwn(service.networks, networkName)) {
        return undefined;
    }

    const networkConfig = service.networks[networkName];
    if (isPlainObject(networkConfig)) {
        return {
            ...networkConfig,
            ipv4_address: ipAddress,
        };
    }

    return {
        [networkName]: {
            ipv4_address: ipAddress,
        },
    };
}

/** Apply returned addresses to a plain Compose object. */
export function applyInternalIPAllocations(
    config : unknown,
    networkName : string,
    allocations : readonly InternalIPAllocation[]
) : number {
    if (!isPlainObject(config) || !isPlainObject(config.services)) {
        return 0;
    }

    let changed = 0;
    for (const allocation of allocations) {
        const service = config.services[allocation.serviceName];
        if (!isPlainObject(service)) {
            continue;
        }

        const networks = serviceNetworksWithAddress(service, networkName, allocation.ipAddress);
        if (!networks) {
            continue;
        }

        service.networks = networks;
        changed += 1;
    }
    return changed;
}

/**
 * Structural subset of the yaml Document API used by the frontend. Keeping
 * this here lets the editor preserve comments and formatting while changing
 * only the service network nodes.
 */
export interface InternalIPComposeDocument {
    toJS() : unknown;
    getIn(path : Array<string | number>) : unknown;
    setIn(path : Array<string | number>, value : unknown) : void;
    createNode(value : unknown) : unknown;
}

export function applyInternalIPAllocationsToDoc(
    doc : InternalIPComposeDocument,
    networkName : string,
    allocations : readonly InternalIPAllocation[]
) : number {
    const config = doc.toJS();
    if (!isPlainObject(config) || !isPlainObject(config.services)) {
        return 0;
    }

    let changed = 0;
    for (const allocation of allocations) {
        const service = config.services[allocation.serviceName];
        if (!isPlainObject(service) || !hasNetwork(service, networkName)) {
            continue;
        }

        const networksPath = [ "services", allocation.serviceName, "networks" ];
        if (Array.isArray(service.networks)) {
            const converted : Record<string, unknown> = {};
            for (const network of service.networks) {
                if (typeof network === "string") {
                    converted[network] = {};
                }
            }
            converted[networkName] = { ipv4_address: allocation.ipAddress };
            doc.setIn(networksPath, doc.createNode(converted));
        } else {
            const serviceNetworks = service.networks as Record<string, unknown>;
            const existing = serviceNetworks[networkName];
            const value = isPlainObject(existing)
                ? {
                    ...existing,
                    ipv4_address: allocation.ipAddress,
                }
                : { ipv4_address: allocation.ipAddress };
            doc.setIn([ ...networksPath, networkName ], doc.createNode(value));
        }
        changed += 1;
    }
    return changed;
}
