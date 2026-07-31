import { promises as fs } from "node:fs";
import path from "node:path";

export type BindMountSourceType = "file" | "directory";

export interface MissingBindMountUse {
    service: string;
    target: string;
}

export interface MissingBindMount {
    source: string;
    displaySource: string;
    uses: MissingBindMountUse[];
    suggestedType: BindMountSourceType;
    canCreate: boolean;
}

export interface BindMountPreparation {
    source: string;
    type: BindMountSourceType;
    content?: string;
}

interface ComposeVolume {
    type?: unknown;
    source?: unknown;
    target?: unknown;
}

interface ComposeService {
    volumes?: unknown;
}

const MAX_INITIAL_FILE_BYTES = 1024 * 1024;

const EXTENSIONLESS_FILE_NAMES = new Set([
    "caddyfile",
    "containerfile",
    "dockerfile",
    "gemfile",
    "jenkinsfile",
    "license",
    "makefile",
    "procfile",
    "readme",
]);

const DOT_FILE_NAMES = new Set([
    ".dockerignore",
    ".env",
    ".gitignore",
    ".htaccess",
    ".npmrc",
]);

export class MissingBindMountError extends Error {
    readonly missingBindMounts: MissingBindMount[];

    constructor(missingBindMounts: MissingBindMount[]) {
        super("missingBindMountsRequireSetup");
        this.missingBindMounts = missingBindMounts;
    }
}

function isObject(value: unknown) : value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingPathError(error: unknown) {
    return isObject(error) && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function isPathInside(parent: string, candidate: string) {
    const relative = path.relative(parent, candidate);
    return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function displayBindSource(stackPath: string, source: string) {
    if (!isPathInside(stackPath, source)) {
        return source;
    }

    const relative = path.relative(stackPath, source);
    return `.${path.sep}${relative}`;
}

export function suggestBindMountSourceType(source: string, target: string) : BindMountSourceType {
    const names = [ path.basename(source), path.posix.basename(target) ];

    for (const originalName of names) {
        const name = originalName.toLowerCase();
        if (EXTENSIONLESS_FILE_NAMES.has(name) || DOT_FILE_NAMES.has(name)) {
            return "file";
        }

        const extension = path.extname(name);
        if (extension && extension !== ".d") {
            return "file";
        }
    }

    return "directory";
}

export async function findMissingBindMounts(composeConfig: unknown, stackPath: string) : Promise<MissingBindMount[]> {
    if (!isObject(composeConfig) || !isObject(composeConfig.services)) {
        return [];
    }

    const normalizedStackPath = path.resolve(stackPath);
    const missingBySource = new Map<string, MissingBindMount>();

    for (const [ serviceName, rawService ] of Object.entries(composeConfig.services)) {
        if (!isObject(rawService)) {
            continue;
        }

        const service = rawService as ComposeService;
        if (!Array.isArray(service.volumes)) {
            continue;
        }

        for (const rawVolume of service.volumes) {
            if (!isObject(rawVolume)) {
                continue;
            }

            const volume = rawVolume as ComposeVolume;
            if (volume.type !== "bind" || typeof volume.source !== "string" || typeof volume.target !== "string") {
                continue;
            }

            const source = path.resolve(normalizedStackPath, volume.source);
            try {
                await fs.stat(source);
                continue;
            } catch (error) {
                if (!isMissingPathError(error)) {
                    throw error;
                }
            }

            let missing = missingBySource.get(source);
            if (!missing) {
                missing = {
                    source,
                    displaySource: displayBindSource(normalizedStackPath, source),
                    uses: [],
                    suggestedType: suggestBindMountSourceType(source, volume.target),
                    canCreate: isPathInside(normalizedStackPath, source),
                };
                missingBySource.set(source, missing);
            }

            missing.uses.push({
                service: serviceName,
                target: volume.target,
            });
        }
    }

    return Array.from(missingBySource.values()).sort((left, right) => left.source.localeCompare(right.source));
}

async function assertCreationStaysInsideStack(stackPath: string, source: string) {
    const normalizedStackPath = path.resolve(stackPath);
    const normalizedSource = path.resolve(source);
    if (!isPathInside(normalizedStackPath, normalizedSource)) {
        throw new Error(`Bind mount source is outside the stack directory: ${source}`);
    }

    const realStackPath = await fs.realpath(normalizedStackPath);
    let ancestor = path.dirname(normalizedSource);
    while (true) {
        try {
            const realAncestor = await fs.realpath(ancestor);
            if (realAncestor !== realStackPath && !isPathInside(realStackPath, realAncestor)) {
                throw new Error(`Bind mount source resolves outside the stack directory: ${source}`);
            }
            return;
        } catch (error) {
            if (!isMissingPathError(error)) {
                throw error;
            }
        }

        const parent = path.dirname(ancestor);
        if (parent === ancestor) {
            throw new Error(`Unable to resolve a safe parent for bind mount source: ${source}`);
        }
        ancestor = parent;
    }
}

async function applyConfiguredOwnership(createdPath: string) {
    if (!process.env.PUID || !process.env.PGID) {
        return;
    }

    const uid = Number(process.env.PUID);
    const gid = Number(process.env.PGID);
    if (!Number.isInteger(uid) || !Number.isInteger(gid)) {
        return;
    }

    await fs.chown(createdPath, uid, gid);
}

export async function prepareBindMountSources(
    stackPath: string,
    missingBindMounts: MissingBindMount[],
    preparations: unknown
) {
    if (!Array.isArray(preparations)) {
        throw new Error("Bind mount preparations must be a list.");
    }

    const missingBySource = new Map(missingBindMounts.map(mount => [ mount.source, mount ]));
    if (preparations.length !== missingBySource.size) {
        throw new Error("Choose a source type for every missing bind mount.");
    }

    const normalizedPreparations: BindMountPreparation[] = preparations.map((rawPreparation) => {
        if (!isObject(rawPreparation) || typeof rawPreparation.source !== "string") {
            throw new Error("Invalid bind mount preparation.");
        }
        if (rawPreparation.type !== "file" && rawPreparation.type !== "directory") {
            throw new Error("Bind mount source type must be file or directory.");
        }
        if (rawPreparation.content !== undefined && typeof rawPreparation.content !== "string") {
            throw new Error("Bind mount file content must be text.");
        }

        const source = path.resolve(rawPreparation.source);
        const missing = missingBySource.get(source);
        if (!missing || !missing.canCreate) {
            throw new Error(`Bind mount source cannot be created by Dockge: ${source}`);
        }

        const content = rawPreparation.content ?? "";
        if (Buffer.byteLength(content) > MAX_INITIAL_FILE_BYTES) {
            throw new Error(`Initial bind mount file content exceeds 1 MiB: ${source}`);
        }

        return {
            source,
            type: rawPreparation.type,
            content,
        };
    });

    const uniqueSources = new Set(normalizedPreparations.map(preparation => preparation.source));
    if (uniqueSources.size !== missingBySource.size) {
        throw new Error("Each missing bind mount source must be prepared exactly once.");
    }

    normalizedPreparations.sort((left, right) => left.source.split(path.sep).length - right.source.split(path.sep).length);

    for (const preparation of normalizedPreparations) {
        await assertCreationStaysInsideStack(stackPath, preparation.source);

        try {
            await fs.lstat(preparation.source);
            throw new Error(`Bind mount source already exists; inspect it before retrying: ${preparation.source}`);
        } catch (error) {
            if (!isMissingPathError(error)) {
                throw error;
            }
        }

        if (preparation.type === "directory") {
            await fs.mkdir(preparation.source, {
                recursive: true,
                mode: 0o755,
            });
        } else {
            await fs.mkdir(path.dirname(preparation.source), {
                recursive: true,
                mode: 0o755,
            });
            await fs.writeFile(preparation.source, preparation.content ?? "", {
                flag: "wx",
                mode: 0o600,
            });
        }

        await applyConfiguredOwnership(preparation.source);
    }
}
