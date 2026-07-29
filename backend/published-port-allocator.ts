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
    });
    const ids = (list.stdout?.toString() || "").split("\n").map(value => value.trim()).filter(Boolean);
    if (ids.length === 0) {
        return result;
    }

    const inspected = await childProcessAsync.spawn("docker", [ "container", "inspect", ...ids ], {
        encoding: "utf-8",
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

export async function allocatePublishedPort(
    server : DockgeServer,
    targetPortValue : unknown,
    protocolValue : unknown,
    currentEditorPorts : unknown
) : Promise<PublishedPortAllocation> {
    const targetPort = Number(targetPortValue);
    if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
        throw new ValidationError("Target port must be an integer from 1 to 65535.");
    }
    if (protocolValue !== "tcp" && protocolValue !== "udp") {
        throw new ValidationError("Protocol must be tcp or udp.");
    }
    if (!Array.isArray(currentEditorPorts)) {
        throw new ValidationError("Current editor ports must be an array.");
    }
    if (!server.getPublishedHostIPValue()) {
        throw new ValidationError(
            `${server.config.publishedHostIPVariable} must be set to a valid IPv4 address in Dockge global.env.`
        );
    }

    const protocol = protocolValue as PublishedPortProtocol;
    const used = await collectDockerBindings();
    for (const key of await collectSavedStackBindings(server)) {
        used.add(key);
    }
    for (const binding of extractPublishedPortBindings(currentEditorPorts)) {
        used.add(publishedPortKey(binding.port, binding.protocol));
    }

    const reserved = activeReservations(server);
    const publishedPort = findAvailablePublishedPort(
        server.config.publishedPortStart,
        server.config.publishedPortEnd,
        protocol,
        used,
        reserved
    );
    if (publishedPort !== undefined) {
        reserved.set(publishedPortKey(publishedPort, protocol), Date.now());
        return {
            publishedPort,
            targetPort,
            protocol,
            mapping: formatPublishedPortMapping(
                server.config.publishedHostIPVariable,
                publishedPort,
                targetPort,
                protocol
            ),
        };
    }

    throw new ValidationError(
        `No available ${protocol.toUpperCase()} port in ${server.config.publishedPortStart}-${server.config.publishedPortEnd}.`
    );
}
