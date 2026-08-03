import {
    formatPublishedHostIPExpression,
    isPublishedHostIPExpression,
    isPlainPort,
    isWildcardHostIP,
    parseShortPortMapping,
    parseSinglePort,
    extractVariableDefault,
    isPortVariable
} from "./published-port";
import type { ParsedPortMapping, PublishedPortProtocol } from "./published-port";

export function hasBuildServices(config : unknown) : boolean {
    if (!config || typeof config !== "object") {
        return false;
    }

    const services = (config as Record<string, unknown>).services;
    if (!services || typeof services !== "object" || Array.isArray(services)) {
        return false;
    }

    return Object.values(services).some(service => (
        service !== null &&
        typeof service === "object" &&
        Object.hasOwn(service, "build")
    ));
}

function isRemoteOrAbsoluteBuildContext(context : string) : boolean {
    return context.startsWith("/") ||
        /^[a-z]:[\\/]/i.test(context) ||
        /^[a-z][a-z0-9+.-]*:\/\//i.test(context) ||
        /^git@[^:]+:/i.test(context);
}

export function getRelativeBuildContexts(config : unknown) : string[] {
    if (!config || typeof config !== "object") {
        return [];
    }

    const services = (config as Record<string, unknown>).services;
    if (!services || typeof services !== "object" || Array.isArray(services)) {
        return [];
    }

    const contexts = new Set<string>();
    for (const service of Object.values(services)) {
        if (!service || typeof service !== "object" || !Object.hasOwn(service, "build")) {
            continue;
        }

        const build = (service as Record<string, unknown>).build;
        let context : unknown;
        if (typeof build === "string") {
            context = build;
        } else if (build && typeof build === "object") {
            context = (build as Record<string, unknown>).context ?? ".";
        }

        if (typeof context === "string" && context.length > 0 && !isRemoteOrAbsoluteBuildContext(context)) {
            contexts.add(context);
        }
    }
    return Array.from(contexts);
}

/**
 * The pasted `compose.yaml` and `.env` are the source of truth. These helpers
 * only describe and apply the two adjustments a homelab stack always needs:
 * joining the shared external network, and moving host-published ports onto the
 * Tailscale address in the managed port range.
 *
 * Nothing here reads `expose:`. `expose` means "reachable from other containers",
 * so publishing it to the host would widen the attack surface beyond what the
 * Compose file asked for.
 */

export interface PortPresetEntry {
    serviceName : string;
    /** Index into the service's `ports` array. */
    index : number;
    /** The mapping exactly as written in the Compose file. */
    original : string;
    target : string;
    protocol : PublishedPortProtocol;
    /** The published port, when it is a plain literal we can reason about. */
    publishedPort ?: number;
    hostIP ?: string;
    /** Why this entry cannot be rewritten automatically, if it cannot. */
    skipReason ?: PortPresetSkipReason;
}

export type PortPresetSkipReason =
    | "alreadyManaged"
    | "explicitHostIP"
    | "notLiteral"
    | "unparsable";

export interface PortPresetPlan {
    /** Entries a rewrite would change. */
    rewritable : PortPresetEntry[];
    /** Entries left alone, each with a reason. */
    skipped : PortPresetEntry[];
}

function isPlainObject(value : unknown) : value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function servicesOf(config : unknown) : Array<[string, Record<string, unknown>]> {
    if (!isPlainObject(config) || !isPlainObject(config.services)) {
        return [];
    }
    const result : Array<[string, Record<string, unknown>]> = [];
    for (const [ name, service ] of Object.entries(config.services)) {
        if (isPlainObject(service)) {
            result.push([ name, service ]);
        }
    }
    return result;
}

function classify(
    mapping : ParsedPortMapping | undefined,
    original : string,
    hostIPVariable : string
) : Pick<PortPresetEntry, "target" | "protocol" | "publishedPort" | "hostIP" | "skipReason"> {
    if (!mapping) {
        return {
            target: original,
            protocol: "tcp",
            skipReason: "unparsable",
        };
    }

    const base = {
        target: mapping.target,
        protocol: mapping.protocol,
        hostIP: mapping.hostIP,
        publishedPort: parseSinglePort(mapping.published),
    };

    if (isPublishedHostIPExpression(mapping.hostIP, hostIPVariable)) {
        // Already pinned to the Tailscale address by a previous preset run.
        return {
            ...base,
            skipReason: "alreadyManaged"
        };
    }
    if (!isPlainPort(mapping.target)) {
        return {
            ...base,
            skipReason: "notLiteral"
        };
    }
    if (mapping.published !== undefined && !isPlainPort(mapping.published)) {
        // Check if it's a variable with a default value like ${PORT:-8080}
        if (isPortVariable(mapping.published)) {
            const defaultValue = extractVariableDefault(mapping.published);
            const defaultPort = parseSinglePort(defaultValue);
            if (defaultPort !== undefined) {
                // This is a rewritable variable port
                return {
                    ...base,
                    publishedPort: defaultPort,
                };
            }
        }
        // A range or an interpolation without default. Reassigning it could silently drop ports.
        return {
            ...base,
            skipReason: "notLiteral"
        };
    }
    if (!isWildcardHostIP(mapping.hostIP)) {
        // Someone deliberately bound a specific interface. Respect it.
        return {
            ...base,
            skipReason: "explicitHostIP"
        };
    }
    return base;
}

/**
 * Describe which `ports:` entries the Tailnet preset would rewrite. Long-syntax
 * (mapping object) entries are reported as unparsable rather than rewritten,
 * because they express intent the short form cannot round-trip.
 */
export function planPortPreset(config : unknown, hostIPVariable : string) : PortPresetPlan {
    const rewritable : PortPresetEntry[] = [];
    const skipped : PortPresetEntry[] = [];

    for (const [ serviceName, service ] of servicesOf(config)) {
        if (!Array.isArray(service.ports)) {
            continue;
        }

        service.ports.forEach((item, index) => {
            if (typeof item !== "string") {
                skipped.push({
                    serviceName,
                    index,
                    original: typeof item === "number" ? String(item) : JSON.stringify(item),
                    target: "",
                    protocol: "tcp",
                    skipReason: "unparsable",
                });
                return;
            }

            const entry : PortPresetEntry = {
                serviceName,
                index,
                original: item,
                ...classify(parseShortPortMapping(item), item, hostIPVariable),
            };
            if (entry.skipReason) {
                skipped.push(entry);
            } else {
                rewritable.push(entry);
            }
        });
    }

    return {
        rewritable,
        skipped
    };
}

/**
 * Every host port the Compose file already claims, so a fresh allocation does
 * not collide with a mapping that is staying put.
 */
export function collectReservedPublishedPorts(plan : PortPresetPlan) : Set<string> {
    const result = new Set<string>();
    for (const entry of [ ...plan.rewritable, ...plan.skipped ]) {
        if (entry.publishedPort !== undefined) {
            result.add(`${entry.protocol}:${entry.publishedPort}`);
        }
    }
    return result;
}

export interface PortRewrite {
    serviceName : string;
    index : number;
    publishedPort : number;
}

/**
 * Replace the planned entries in place. Returns the number of mappings changed.
 * Entries whose text no longer matches the plan are left alone, so a stale plan
 * cannot clobber an edit made in the YAML editor meanwhile.
 */
export function applyPortRewrites(
    config : unknown,
    plan : PortPresetPlan,
    rewrites : PortRewrite[],
    hostIPVariable : string,
    hostIPFallback = ""
) : number {
    const hostIPExpression = formatPublishedHostIPExpression(hostIPVariable, hostIPFallback);
    const planned = new Map<string, PortPresetEntry>();
    for (const entry of plan.rewritable) {
        planned.set(`${entry.serviceName}\0${entry.index}`, entry);
    }

    let changed = 0;
    for (const rewrite of rewrites) {
        const entry = planned.get(`${rewrite.serviceName}\0${rewrite.index}`);
        if (!entry) {
            continue;
        }

        const service = (config as Record<string, Record<string, Record<string, unknown>>>)
            ?.services?.[rewrite.serviceName];
        if (!isPlainObject(service) || !Array.isArray(service.ports)) {
            continue;
        }
        if (service.ports[rewrite.index] !== entry.original) {
            continue;
        }

        const suffix = entry.protocol === "udp" ? "/udp" : "";
        service.ports[rewrite.index] =
            `${hostIPExpression}:${rewrite.publishedPort}:${entry.target}${suffix}`;
        changed += 1;
    }
    return changed;
}

/**
 * Attach every service to the shared external network, declaring it if needed.
 * Services using `network_mode` are skipped: Compose rejects combining the two.
 */
export function applyDefaultExternalNetwork(config : unknown, networkName : string) : number {
    if (!networkName || !isPlainObject(config)) {
        return 0;
    }

    const services = servicesOf(config);
    if (services.length === 0) {
        return 0;
    }

    let attached = 0;
    for (const [ , service ] of services) {
        if (service.network_mode) {
            continue;
        }

        if (!Array.isArray(service.networks) && !isPlainObject(service.networks)) {
            service.networks = [ networkName ];
            attached += 1;
        } else if (Array.isArray(service.networks)) {
            if (!service.networks.includes(networkName)) {
                service.networks.push(networkName);
                attached += 1;
            }
        } else if (isPlainObject(service.networks) && !Object.hasOwn(service.networks, networkName)) {
            service.networks[networkName] = {};
            attached += 1;
        }
    }

    if (attached > 0) {
        if (!isPlainObject(config.networks)) {
            config.networks = {};
        }
        const networks = config.networks as Record<string, unknown>;
        if (!Object.hasOwn(networks, networkName)) {
            networks[networkName] = { external: true };
        }
    }

    return attached;
}

/**
 * Services that would join the shared network, for previewing the change.
 */
export function planDefaultExternalNetwork(config : unknown, networkName : string) : string[] {
    if (!networkName) {
        return [];
    }

    const pending : string[] = [];
    for (const [ serviceName, service ] of servicesOf(config)) {
        if (service.network_mode) {
            continue;
        }
        if (Array.isArray(service.networks)) {
            if (!service.networks.includes(networkName)) {
                pending.push(serviceName);
            }
        } else if (isPlainObject(service.networks)) {
            if (!Object.hasOwn(service.networks, networkName)) {
                pending.push(serviceName);
            }
        } else {
            pending.push(serviceName);
        }
    }
    return pending;
}

/**
 * The subset of the `yaml` Document API these helpers need. Declared
 * structurally so `common/` stays free of a hard dependency direction.
 */
export interface ComposeDocument {
    toJS() : unknown;
    getIn(path : Array<string | number>) : unknown;
    setIn(path : Array<string | number>, value : unknown) : void;
    hasIn(path : Array<string | number>) : boolean;
    addIn(path : Array<string | number>, value : unknown) : void;
    createNode(value : unknown) : unknown;
}

/**
 * Apply the rewrites to the YAML document itself rather than to a plain object.
 * Editing in place is what keeps the pasted file's comments, key order and
 * quoting style intact — re-serializing from a plain object loses all three.
 */
export function applyPortRewritesToDoc(
    doc : ComposeDocument,
    plan : PortPresetPlan,
    rewrites : PortRewrite[],
    hostIPVariable : string,
    hostIPFallback = ""
) : number {
    const hostIPExpression = formatPublishedHostIPExpression(hostIPVariable, hostIPFallback);
    const planned = new Map<string, PortPresetEntry>();
    for (const entry of plan.rewritable) {
        planned.set(`${entry.serviceName} ${entry.index}`, entry);
    }

    let changed = 0;
    for (const rewrite of rewrites) {
        const entry = planned.get(`${rewrite.serviceName} ${rewrite.index}`);
        if (!entry) {
            continue;
        }

        const path = [ "services", rewrite.serviceName, "ports", rewrite.index ];
        // A stale plan must not clobber an edit made in the editor meanwhile.
        if (doc.getIn(path) !== entry.original) {
            continue;
        }

        const suffix = entry.protocol === "udp" ? "/udp" : "";
        doc.setIn(path, `${hostIPExpression}:${rewrite.publishedPort}:${entry.target}${suffix}`);
        changed += 1;
    }
    return changed;
}

/**
 * Append one short-syntax published port to a service while preserving the
 * rest of the pasted document. A non-list `ports` value is left untouched so
 * the editor can show the Compose shape error instead of silently rewriting it.
 */
export function appendPublishedPortToDoc(
    doc : ComposeDocument,
    serviceName : string,
    mapping : string
) : number {
    const config = doc.toJS();
    if (!isPlainObject(config) || !isPlainObject(config.services)) {
        return 0;
    }

    const service = config.services[serviceName];
    if (!isPlainObject(service)) {
        return 0;
    }

    const path = [ "services", serviceName, "ports" ];
    if (service.ports === undefined || service.ports === null) {
        doc.setIn(path, doc.createNode([ mapping ]));
        return 1;
    }
    if (!Array.isArray(service.ports) || service.ports.includes(mapping)) {
        return 0;
    }

    doc.addIn(path, mapping);
    return 1;
}

/**
 * Attach every service to the shared external network, editing the document in
 * place so the rest of the pasted file survives untouched.
 */
export function applyDefaultExternalNetworkToDoc(doc : ComposeDocument, networkName : string) : number {
    if (!networkName) {
        return 0;
    }

    const pending = planDefaultExternalNetwork(doc.toJS(), networkName);
    if (pending.length === 0) {
        return 0;
    }

    for (const serviceName of pending) {
        const path = [ "services", serviceName, "networks" ];
        const existing = (doc.toJS() as Record<string, Record<string, Record<string, unknown>>>)
            ?.services?.[serviceName]?.networks;

        if (existing === undefined || existing === null) {
            doc.setIn(path, doc.createNode([ networkName ]));
        } else if (Array.isArray(existing)) {
            doc.addIn(path, networkName);
        } else {
            // Mapping form: `networks: {name: {...}}` needs an empty node so the
            // result stays valid Compose.
            doc.setIn([ ...path, networkName ], doc.createNode({}));
        }
    }

    if (!doc.hasIn([ "networks", networkName ])) {
        doc.setIn([ "networks", networkName ], doc.createNode({ external: true }));
    }

    return pending.length;
}
