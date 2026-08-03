import fs from "node:fs";
import path from "node:path";
import childProcessAsync from "promisify-child-process";
import type { DockgeServer } from "./dockge-server";
import { ValidationError } from "./util-server";
import { log } from "./log";
import { acceptedComposeFileNames } from "../common/util-common";
import {
    extractPublishedPortBindings,
    findAvailablePublishedPort,
    formatPublishedPortMapping,
    publishedPortKey
} from "../common/published-port";
import type { PublishedPortProtocol } from "../common/published-port";

const RESERVATION_TTL_MS = 10 * 60 * 1000;
const reservations = new WeakMap<DockgeServer, Map<string, number>>();

async function collectDockerBindings() : Promise<Set<string>> {
    const result = new Set<string>();
    const list = await childProcessAsync.spawn("docker", [ "container", "ls", "--all", "--quiet" ], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    const ids = (list.stdout?.toString() || "").split("\n").map(value => value.trim()).filter(Boolean);
    if (ids.length === 0) {
        return result;
    }

    const inspected = await childProcessAsync.spawn("docker", [ "container", "inspect", ...ids ], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    const containers = JSON.parse(inspected.stdout?.toString() || "[]") as Array<Record<string, unknown>>;
    for (const container of containers) {
        const hostConfig = container.HostConfig as Record<string, unknown> | undefined;
        const portBindings = hostConfig?.PortBindings as Record<string, unknown> | undefined;
        if (!portBindings) {
            continue;
        }

        for (const [ containerPort, rawBindings ] of Object.entries(portBindings)) {
            const protocolValue = containerPort.split("/").pop();
            if (protocolValue !== "tcp" && protocolValue !== "udp") {
                continue;
            }
            if (!Array.isArray(rawBindings)) {
                continue;
            }
            for (const rawBinding of rawBindings) {
                if (!rawBinding || typeof rawBinding !== "object") {
                    continue;
                }
                const hostPort = Number((rawBinding as Record<string, unknown>).HostPort);
                if (Number.isInteger(hostPort) && hostPort >= 1 && hostPort <= 65535) {
                    result.add(publishedPortKey(hostPort, protocolValue));
                }
            }
        }
    }
    return result;
}

async function collectSavedStackBindings(server : DockgeServer) : Promise<Set<string>> {
    const result = new Set<string>();
    const entries = await fs.promises.readdir(server.stacksDir, { withFileTypes: true });
    const globalEnvPath = path.join(server.stacksDir, "global.env");

    for (const entry of entries) {
        const stackPath = path.join(server.stacksDir, entry.name);
        let stackStat;
        try {
            stackStat = await fs.promises.stat(stackPath);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.warn("port-allocation", `Cannot inspect ${stackPath}: ${message}`);
            throw new ValidationError(
                `Cannot inspect ${entry.name} while checking saved Stack ports.`
            );
        }
        if (!stackStat.isDirectory()) {
            continue;
        }

        const composeFile = acceptedComposeFileNames
            .map(fileName => path.join(stackPath, fileName))
            .find(fileName => fs.existsSync(fileName));
        if (!composeFile) {
            continue;
        }

        try {
            const stackEnvPath = path.join(stackPath, ".env");
            const composeArgs = [ "compose" ];
            if (fs.existsSync(globalEnvPath)) {
                composeArgs.push("--env-file", globalEnvPath);
            }
            if (fs.existsSync(stackEnvPath)) {
                composeArgs.push("--env-file", stackEnvPath);
            }
            composeArgs.push("--file", composeFile, "config", "--format", "json");

            // Compose is the source of truth for interpolation, anchors,
            // profiles and short/long port syntax. If it cannot resolve a
            // saved Stack, allocation fails closed below.
            const configured = await childProcessAsync.spawn("docker", composeArgs, {
                cwd: stackPath,
                encoding: "utf-8",
            });
            const document = JSON.parse(configured.stdout?.toString() || "{}");
            const services = document?.services;
            if (!services || typeof services !== "object") {
                continue;
            }
            for (const service of Object.values(services) as Array<Record<string, unknown>>) {
                for (const binding of extractPublishedPortBindings(service?.ports)) {
                    result.add(publishedPortKey(binding.port, binding.protocol));
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new ValidationError(
                `Cannot inspect saved Stack ${entry.name} for published ports: ${message}`
            );
        }
    }
    return result;
}

function activeReservations(server : DockgeServer) : Map<string, number> {
    let serverReservations = reservations.get(server);
    if (!serverReservations) {
        serverReservations = new Map<string, number>();
        reservations.set(server, serverReservations);
    }

    const now = Date.now();
    for (const [ key, timestamp ] of serverReservations) {
        if (now - timestamp > RESERVATION_TTL_MS) {
            serverReservations.delete(key);
        }
    }
    return serverReservations;
}

export interface PublishedPortAllocation {
    publishedPort : number;
    targetPort : number;
    protocol : PublishedPortProtocol;
    mapping : string;
}

/**
 * Every host port already taken: by a running container, by a saved Stack, and
 * by whatever is currently in the editor. Fails closed — a Stack that cannot be
 * inspected aborts allocation rather than risking a collision.
 */
async function collectUsedPorts(server : DockgeServer, currentEditorPorts : unknown) : Promise<Set<string>> {
    const used = await collectDockerBindings();
    for (const key of await collectSavedStackBindings(server)) {
        used.add(key);
    }
    for (const binding of extractPublishedPortBindings(currentEditorPorts)) {
        used.add(publishedPortKey(binding.port, binding.protocol));
    }
    return used;
}

function requireHostIP(server : DockgeServer) : void {
    if (!server.getPublishedHostIPValue()) {
        throw new ValidationError(
            `${server.config.publishedHostIPVariable} must be set to a valid IPv4 address in Dockge Global Variables.`
        );
    }
}

function parseTargetPort(value : unknown) : number {
    const targetPort = Number(value);
    if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
        throw new ValidationError("Target port must be an integer from 1 to 65535.");
    }
    return targetPort;
}

function parsePublishedPort(value : unknown) : number {
    const publishedPort = Number(value);
    if (!Number.isInteger(publishedPort) || publishedPort < 1 || publishedPort > 65535) {
        throw new ValidationError("Published port must be an integer from 1 to 65535.");
    }
    return publishedPort;
}

function parseProtocolValue(value : unknown) : PublishedPortProtocol {
    if (value !== "tcp" && value !== "udp") {
        throw new ValidationError("Protocol must be tcp or udp.");
    }
    return value;
}

function takeNextPort(
    server : DockgeServer,
    protocol : PublishedPortProtocol,
    used : Set<string>,
    reserved : Map<string, number>
) : number {
    const publishedPort = findAvailablePublishedPort(
        server.config.publishedPortStart,
        server.config.publishedPortEnd,
        protocol,
        used,
        reserved
    );
    if (publishedPort === undefined) {
        throw new ValidationError(
            `No available ${protocol.toUpperCase()} port in ${server.config.publishedPortStart}-${server.config.publishedPortEnd}.`
        );
    }

    reserved.set(publishedPortKey(publishedPort, protocol), Date.now());
    // Also mark it used so a batch request cannot hand out the same port twice.
    used.add(publishedPortKey(publishedPort, protocol));
    return publishedPort;
}

function takeRequestedPort(
    publishedPortValue : unknown,
    protocol : PublishedPortProtocol,
    used : Set<string>,
    reserved : Map<string, number>
) : number {
    const publishedPort = parsePublishedPort(publishedPortValue);
    const key = publishedPortKey(publishedPort, protocol);
    if (used.has(key) || reserved.has(key)) {
        throw new ValidationError(
            `Published ${protocol.toUpperCase()} port ${publishedPort} is already in use.`
        );
    }

    reserved.set(key, Date.now());
    used.add(key);
    return publishedPort;
}

export async function allocatePublishedPort(
    server : DockgeServer,
    targetPortValue : unknown,
    protocolValue : unknown,
    currentEditorPorts : unknown,
    requestedPublishedPortValue ?: unknown
) : Promise<PublishedPortAllocation> {
    const targetPort = parseTargetPort(targetPortValue);
    const protocol = parseProtocolValue(protocolValue);
    if (!Array.isArray(currentEditorPorts)) {
        throw new ValidationError("Current editor ports must be an array.");
    }
    requireHostIP(server);

    const used = await collectUsedPorts(server, currentEditorPorts);
    const reserved = activeReservations(server);
    const publishedPort = requestedPublishedPortValue === undefined || requestedPublishedPortValue === ""
        ? takeNextPort(server, protocol, used, reserved)
        : takeRequestedPort(requestedPublishedPortValue, protocol, used, reserved);

    return {
        publishedPort,
        targetPort,
        protocol,
        mapping: formatPublishedPortMapping(
            server.config.publishedHostIPVariable,
            publishedPort,
            targetPort,
            protocol,
            server.getPublishedHostIPValue()
        ),
    };
}

export interface PublishedPortRequest {
    serviceName : string;
    index : number;
    targetPort : number;
    protocol : PublishedPortProtocol;
}

export interface BatchPublishedPortAllocation extends PublishedPortRequest {
    publishedPort : number;
}

function parseBatchRequests(value : unknown) : PublishedPortRequest[] {
    if (!Array.isArray(value)) {
        throw new ValidationError("Port requests must be an array.");
    }
    if (value.length > 64) {
        throw new ValidationError("Cannot allocate more than 64 ports at once.");
    }

    return value.map((item) => {
        if (!item || typeof item !== "object") {
            throw new ValidationError("Each port request must be an object.");
        }
        const request = item as Record<string, unknown>;
        if (typeof request.serviceName !== "string" || request.serviceName === "") {
            throw new ValidationError("Each port request needs a service name.");
        }
        if (!Number.isInteger(request.index) || (request.index as number) < 0) {
            throw new ValidationError("Each port request needs a non-negative index.");
        }
        return {
            serviceName: request.serviceName,
            index: request.index as number,
            targetPort: parseTargetPort(request.targetPort),
            protocol: parseProtocolValue(request.protocol),
        };
    });
}

/**
 * Allocate several ports against one snapshot of used ports, so a multi-service
 * paste gets distinct host ports in a single round trip.
 */
export async function allocatePublishedPorts(
    server : DockgeServer,
    requestsValue : unknown,
    currentEditorPorts : unknown
) : Promise<BatchPublishedPortAllocation[]> {
    const requests = parseBatchRequests(requestsValue);
    if (!Array.isArray(currentEditorPorts)) {
        throw new ValidationError("Current editor ports must be an array.");
    }
    if (requests.length === 0) {
        return [];
    }
    requireHostIP(server);

    const used = await collectUsedPorts(server, currentEditorPorts);
    const reserved = activeReservations(server);

    return requests.map(request => ({
        ...request,
        publishedPort: takeNextPort(server, request.protocol, used, reserved),
    }));
}
