export type PublishedPortProtocol = "tcp" | "udp";

export interface PublishedPortBinding {
    port : number;
    protocol : PublishedPortProtocol;
}

export interface PublishedPortKeyLookup {
    has(key : string) : boolean;
}

function parseProtocol(value : unknown) : PublishedPortProtocol {
    return value === "udp" ? "udp" : "tcp";
}

function expandPortRange(value : unknown) : number[] {
    if (typeof value === "number") {
        return Number.isInteger(value) && value >= 1 && value <= 65535 ? [ value ] : [];
    }
    if (typeof value !== "string") {
        return [];
    }

    const match = value.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!match) {
        return [];
    }

    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end > 65535 || start > end) {
        return [];
    }

    const ports : number[] = [];
    for (let port = start; port <= end; port += 1) {
        ports.push(port);
    }
    return ports;
}

function parseShortSyntax(value : string) : PublishedPortBinding[] {
    const protocolSeparator = value.lastIndexOf("/");
    const protocol = parseProtocol(protocolSeparator >= 0 ? value.slice(protocolSeparator + 1) : "tcp");
    const mapping = protocolSeparator >= 0 ? value.slice(0, protocolSeparator) : value;

    let publishedPart = "";
    const arrowIndex = mapping.indexOf("->");
    if (arrowIndex >= 0) {
        const hostMapping = mapping.slice(0, arrowIndex);
        publishedPart = hostMapping.slice(hostMapping.lastIndexOf(":") + 1);
    } else {
        const parts = mapping.split(":");
        if (parts.length < 2) {
            // A lone port is a container target port with an automatically
            // assigned runtime port, not a persistent published port.
            return [];
        }
        publishedPart = parts[parts.length - 2];
    }

    return expandPortRange(publishedPart).map(port => ({
        port,
        protocol
    }));
}

/**
 * Extract persistent host-published ports from Compose short/long syntax or
 * Docker's `HOST->CONTAINER/protocol` display form.
 */
export function extractPublishedPortBindings(value : unknown) : PublishedPortBinding[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const result : PublishedPortBinding[] = [];
    for (const item of value) {
        if (typeof item === "string") {
            result.push(...parseShortSyntax(item));
        } else if (item && typeof item === "object") {
            const port = item as Record<string, unknown>;
            const protocol = parseProtocol(port.protocol);
            for (const published of expandPortRange(port.published)) {
                result.push({
                    port: published,
                    protocol
                });
            }
        }
    }
    return result;
}

export function publishedPortKey(port : number, protocol : PublishedPortProtocol) : string {
    return `${protocol}:${port}`;
}

export function findAvailablePublishedPort(
    start : number,
    end : number,
    protocol : PublishedPortProtocol,
    used : PublishedPortKeyLookup,
    reserved : PublishedPortKeyLookup
) : number | undefined {
    for (let port = start; port <= end; port += 1) {
        const key = publishedPortKey(port, protocol);
        if (!used.has(key) && !reserved.has(key)) {
            return port;
        }
    }
    return undefined;
}

/**
 * The frontend envsubst library does not understand Compose's `${VAR:?error}`
 * form. Resolve only the configured host variable for display; the persisted
 * YAML keeps the fail-closed Compose expression.
 */
export function resolveRequiredEnvironmentVariable(
    content : string,
    variableName : string,
    value : string
) : string {
    const escapedName = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\$\\{${escapedName}:\\?[^}]*\\}`, "g");
    return content.replace(pattern, () => value);
}

export function formatPublishedPortMapping(
    hostIPVariable : string,
    publishedPort : number,
    targetPort : number,
    protocol : PublishedPortProtocol
) : string {
    const suffix = protocol === "udp" ? "/udp" : "";
    return `\${${hostIPVariable}:?Set ${hostIPVariable} in Dockge global.env}:${publishedPort}:${targetPort}${suffix}`;
}
