export interface StackRuntimeTarget {
    name : string;
    internalIP : string;
    internalNetwork : string;
}

function stringValue(value : unknown) : string {
    return typeof value === "string" ? value.trim() : "";
}

/** Extract the real Docker container names and their shared-network addresses. */
export function extractStackRuntimeTargets(statuses : readonly unknown[]) : StackRuntimeTarget[] {
    const targets = new Map<string, StackRuntimeTarget>();

    for (const status of statuses) {
        if (!status || typeof status !== "object" || Array.isArray(status)) {
            continue;
        }

        const record = status as Record<string, unknown>;
        const name = stringValue(record.name);
        if (!name) {
            continue;
        }

        const candidate = {
            name,
            internalIP: stringValue(record.internalIP),
            internalNetwork: stringValue(record.internalNetwork),
        };
        const existing = targets.get(name);
        if (!existing || (!existing.internalIP && candidate.internalIP)) {
            targets.set(name, candidate);
        }
    }

    return [ ...targets.values() ].sort((a, b) => a.name.localeCompare(b.name));
}
