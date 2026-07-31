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

/**
 * Split a Compose short-syntax port mapping on its top-level colons. `${VAR:?msg}`
 * interpolations and bracketed IPv6 hosts contain colons that are not separators.
 */
function splitPortSegments(value : string) : string[] | undefined {
    const segments : string[] = [];
    let current = "";
    let braceDepth = 0;
    let bracketDepth = 0;

    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];

        if (char === "$" && value[index + 1] === "{") {
            braceDepth += 1;
            current += "${";
            index += 1;
            continue;
        }
        if (char === "}" && braceDepth > 0) {
            braceDepth -= 1;
            current += char;
            continue;
        }
        if (char === "[") {
            bracketDepth += 1;
            current += char;
            continue;
        }
        if (char === "]" && bracketDepth > 0) {
            bracketDepth -= 1;
            current += char;
            continue;
        }
        if (char === ":" && braceDepth === 0 && bracketDepth === 0) {
            segments.push(current);
            current = "";
            continue;
        }
        current += char;
    }

    if (braceDepth !== 0 || bracketDepth !== 0) {
        return undefined;
    }
    segments.push(current);
    return segments;
}

function parseSinglePort(value : unknown) : number | undefined {
    if (typeof value === "number") {
        return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : undefined;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
        return undefined;
    }
    const port = Number(trimmed);
    return port >= 1 && port <= 65535 ? port : undefined;
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

/**
 * A Compose short-syntax port mapping broken into its raw parts. Segments keep
 * their original text so `${VAR}` interpolations survive a round trip.
 */
export interface ParsedPortMapping {
    hostIP ?: string;
    published ?: string;
    target : string;
    protocol : PublishedPortProtocol;
}

export function parseShortPortMapping(value : string) : ParsedPortMapping | undefined {
    const segments = splitPortSegments(value.trim());
    if (!segments || segments.length === 0 || segments.length > 3) {
        return undefined;
    }

    // The protocol suffix belongs to the container target, which is always last.
    let last = segments[segments.length - 1];
    let protocol : PublishedPortProtocol = "tcp";
    const protocolSeparator = last.lastIndexOf("/");
    if (protocolSeparator >= 0) {
        protocol = parseProtocol(last.slice(protocolSeparator + 1).trim());
        last = last.slice(0, protocolSeparator);
    }

    if (segments.length === 1) {
        return {
            target: last.trim(),
            protocol
        };
    }
    if (segments.length === 2) {
        return {
            published: segments[0].trim(),
            target: last.trim(),
            protocol
        };
    }
    return {
        hostIP: segments[0].trim(),
        published: segments[1].trim(),
        target: last.trim(),
        protocol,
    };
}

function parseShortSyntax(value : string) : PublishedPortBinding[] {
    // Docker's `docker ps` display form, e.g. `0.0.0.0:21000->80/tcp`.
    const arrowIndex = value.indexOf("->");
    if (arrowIndex >= 0) {
        const protocolSeparator = value.lastIndexOf("/");
        const protocol = parseProtocol(protocolSeparator > arrowIndex ? value.slice(protocolSeparator + 1) : "tcp");
        const hostMapping = value.slice(0, arrowIndex);
        const publishedPart = hostMapping.slice(hostMapping.lastIndexOf(":") + 1);
        return expandPortRange(publishedPart).map(port => ({
            port,
            protocol
        }));
    }

    const mapping = parseShortPortMapping(value);
    // A lone port is a container target port with an automatically assigned
    // runtime port, not a persistent published port.
    if (!mapping || mapping.published === undefined) {
        return [];
    }

    return expandPortRange(mapping.published).map(port => ({
        port,
        protocol: mapping.protocol
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

/**
 * The Compose expression used as the host IP of every managed published port.
 * It fails closed at deploy time when the variable is not set.
 */
export function formatPublishedHostIPExpression(hostIPVariable : string) : string {
    return `\${${hostIPVariable}:?Set ${hostIPVariable} in Dockge Global Variables}`;
}

export function formatPublishedPortMapping(
    hostIPVariable : string,
    publishedPort : number,
    targetPort : number,
    protocol : PublishedPortProtocol
) : string {
    const suffix = protocol === "udp" ? "/udp" : "";
    return `${formatPublishedHostIPExpression(hostIPVariable)}:${publishedPort}:${targetPort}${suffix}`;
}

/**
 * Whether a host IP segment publishes on every interface. Managed rewrites
 * narrow these to the Tailscale address; a literal address is left untouched
 * because it is a deliberate choice by whoever wrote the Compose file.
 */
export function isWildcardHostIP(value : string | undefined) : boolean {
    if (value === undefined) {
        return true;
    }
    const trimmed = value.trim();
    return trimmed === "" || trimmed === "0.0.0.0" || trimmed === "::" || trimmed === "[::]" || trimmed === "*";
}

export function isPlainPort(value : string | undefined) : boolean {
    return parseSinglePort(value) !== undefined;
}

/**
 * Extract the default value from a shell variable expression like `${VAR:-default}`.
 * Returns the default value if present, otherwise undefined.
 */
export function extractVariableDefault(value : string | undefined) : string | undefined {
    if (!value || typeof value !== "string") {
        return undefined;
    }
    // Match ${VAR:-default} or ${VAR:?error} patterns
    const match = value.trim().match(/^\$\{[^}]+:-([^}]+)\}$/);
    return match ? match[1] : undefined;
}

/**
 * Check if a port value is a variable expression with a numeric default.
 * Examples: ${PORT:-8080} → true, ${PORT} → false, 8080 → false
 */
export function isPortVariable(value : string | undefined) : boolean {
    if (!value || typeof value !== "string") {
        return false;
    }
    return /^\$\{[^}]+:-\d+\}$/.test(value.trim());
}

export { parseSinglePort };
