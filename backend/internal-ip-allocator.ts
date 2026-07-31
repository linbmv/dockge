import fs from "node:fs";
import path from "node:path";
import { isIPv4 } from "node:net";
import childProcessAsync from "promisify-child-process";
import dotenv from "dotenv";
import type { DockgeServer } from "./dockge-server";
import { acceptedComposeFileNames } from "../common/util-common";
import {
    findAvailableInternalIP,
    servicesNeedingInternalIP,
    type InternalIPAllocation,
} from "../common/internal-ip";
import { ValidationError } from "./util-server";

const INTERNAL_IP_RESERVED_SUFFIXES = new Set([ 254 ]);
const reservations = new WeakMap<DockgeServer, Map<string, number>>();
const RESERVATION_TTL_MS = 10 * 60 * 1000;

interface NetworkContainer {
    IPv4Address?: unknown;
}

interface DockerNetwork {
    IPAM?: {
        Config?: Array<{
            Subnet?: unknown;
            Gateway?: unknown;
        }>;
    };
    Containers?: Record<string, NetworkContainer>;
}

interface NetworkDetails {
    networkName : string;
    subnet : string;
    gateway? : string;
    prefix : string;
    usedAddresses : Set<string>;
}

function isPlainObject(value : unknown) : value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseIPv4(value : unknown) : string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const address = value.split("/")[0].trim();
    return isIPv4(address) ? address : undefined;
}

function ipv4ToNumber(address : string) : number {
    return address.split(".").reduce((result, octet) => (result * 256) + Number(octet), 0) >>> 0;
}

function numberToIPv4(value : number) : string {
    return [
        (value >>> 24) & 255,
        (value >>> 16) & 255,
        (value >>> 8) & 255,
        value & 255,
    ].join(".");
}

function parseSubnet(value : unknown) : { address : string; prefixLength : number } | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const [ address, prefixLengthValue ] = value.split("/");
    const prefixLength = Number(prefixLengthValue);
    if (!isIPv4(address) || !Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
        return undefined;
    }

    return {
        address,
        prefixLength,
    };
}

function isAddressInSubnet(address : string, subnet : string) : boolean {
    const parsed = parseSubnet(subnet);
    if (!parsed || !isIPv4(address)) {
        return false;
    }

    const mask = parsed.prefixLength === 0
        ? 0
        : (0xffffffff << (32 - parsed.prefixLength)) >>> 0;
    return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(parsed.address) & mask);
}

function configuredPrefix(server : DockgeServer, subnet : string) : string | undefined {
    let environment : Record<string, string> = {};
    const globalEnvPath = path.join(server.stacksDir, "global.env");
    try {
        environment = dotenv.parse(fs.readFileSync(globalEnvPath));
    } catch {
        // The network subnet is the source of truth when global.env is absent.
    }

    const configured = environment.SUBNET_PREFIX?.trim();
    if (configured && /^\d+\.\d+\.\d+$/.test(configured) && isAddressInSubnet(`${configured}.2`, subnet)) {
        return configured;
    }

    const parsed = parseSubnet(subnet);
    if (!parsed) {
        return undefined;
    }

    const networkAddress = numberToIPv4(
        ipv4ToNumber(parsed.address) & (parsed.prefixLength === 0
            ? 0
            : (0xffffffff << (32 - parsed.prefixLength)) >>> 0)
    );
    return networkAddress.split(".").slice(0, 3).join(".");
}

async function inspectNetwork(networkName : string) : Promise<DockerNetwork> {
    const result = await childProcessAsync.spawn("docker", [ "network", "inspect", networkName ], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
    });
    const networks = JSON.parse(result.stdout?.toString() || "[]") as unknown;
    if (!Array.isArray(networks) || !isPlainObject(networks[0])) {
        throw new ValidationError(`Docker network ${networkName} was not found.`);
    }
    return networks[0] as DockerNetwork;
}

async function getNetworkDetails(server : DockgeServer) : Promise<NetworkDetails | undefined> {
    const networkName = server.config.defaultExternalNetwork;
    if (!networkName) {
        return undefined;
    }

    const network = await inspectNetwork(networkName);
    const ipamConfig = network.IPAM?.Config?.find(config => typeof config.Subnet === "string");
    const subnet = ipamConfig?.Subnet;
    const parsedSubnet = parseSubnet(subnet);
    const prefix = typeof subnet === "string" ? configuredPrefix(server, subnet) : undefined;
    if (!parsedSubnet || !prefix || !isAddressInSubnet(`${prefix}.100`, `${parsedSubnet.address}/${parsedSubnet.prefixLength}`)) {
        throw new ValidationError(`Docker network ${networkName} does not have a usable IPv4 subnet.`);
    }

    const usedAddresses = new Set<string>();
    const gateway = parseIPv4(ipamConfig?.Gateway);
    if (gateway) {
        usedAddresses.add(gateway);
    }

    for (const container of Object.values(network.Containers || {})) {
        const address = parseIPv4(container.IPv4Address);
        if (address) {
            usedAddresses.add(address);
        }
    }

    return {
        networkName,
        subnet: `${parsedSubnet.address}/${parsedSubnet.prefixLength}`,
        gateway,
        prefix,
        usedAddresses,
    };
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

function staticAddressesFromConfig(config : unknown, networkName : string) : Set<string> {
    const result = new Set<string>();
    if (!isPlainObject(config) || !isPlainObject(config.services)) {
        return result;
    }

    for (const service of Object.values(config.services)) {
        if (!isPlainObject(service) || !isPlainObject(service.networks)) {
            continue;
        }
        const network = service.networks[networkName];
        if (!isPlainObject(network)) {
            continue;
        }
        const address = parseIPv4(network.ipv4_address);
        if (address) {
            result.add(address);
        }
    }
    return result;
}

function composeConfigArgs(composeFile : string, globalEnvPath : string, stackEnvPath : string) : string[] {
    const args = [ "compose" ];
    if (fs.existsSync(globalEnvPath)) {
        args.push("--env-file", globalEnvPath);
    }
    if (fs.existsSync(stackEnvPath)) {
        args.push("--env-file", stackEnvPath);
    }
    args.push("--file", composeFile, "config", "--format", "json");
    return args;
}

async function collectSavedStackAddresses(server : DockgeServer, networkName : string) : Promise<Set<string>> {
    const result = new Set<string>();
    const globalEnvPath = path.join(server.stacksDir, "global.env");
    let entries : fs.Dirent[];
    try {
        entries = await fs.promises.readdir(server.stacksDir, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return result;
        }
        throw error;
    }

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }

        const stackPath = path.join(server.stacksDir, entry.name);
        const composeFile = acceptedComposeFileNames
            .map(fileName => path.join(stackPath, fileName))
            .find(fileName => fs.existsSync(fileName));
        if (!composeFile) {
            continue;
        }

        const configured = await childProcessAsync.spawn(
            "docker",
            composeConfigArgs(composeFile, globalEnvPath, path.join(stackPath, ".env")),
            {
                cwd: stackPath,
                encoding: "utf-8",
                maxBuffer: 10 * 1024 * 1024,
            }
        );
        const config = JSON.parse(configured.stdout?.toString() || "{}");
        for (const address of staticAddressesFromConfig(config, networkName)) {
            result.add(address);
        }
    }
    return result;
}

function editorConfigs(value : unknown) : unknown[] {
    if (Array.isArray(value)) {
        return value;
    }
    return [ value ];
}

function requestedServiceNames(value : unknown, networkName : string) : string[] {
    const configs = editorConfigs(value);
    const first = configs[0];
    const names = servicesNeedingInternalIP(first, networkName);
    return names.filter(name => !configs.some(config => !servicesNeedingInternalIP(config, networkName).includes(name)));
}

function reserveEditorAddresses(usedAddresses : Set<string>, value : unknown, networkName : string) : void {
    for (const config of editorConfigs(value)) {
        for (const address of staticAddressesFromConfig(config, networkName)) {
            usedAddresses.add(address);
        }
    }
}

function reserveRequestedAddress(
    server : DockgeServer,
    networkName : string,
    prefix : string,
    usedAddresses : Set<string>
) : string {
    const address = findAvailableInternalIP(
        prefix,
        usedAddresses,
        INTERNAL_IP_RESERVED_SUFFIXES
    );
    if (!address) {
        throw new ValidationError(`No available internal IP address in the ${networkName} service range.`);
    }

    usedAddresses.add(address);
    activeReservations(server).set(`${networkName}:${address}`, Date.now());
    return address;
}

export async function allocateInternalIPs(
    server : DockgeServer,
    currentEditorConfig : unknown
) : Promise<InternalIPAllocation[]> {
    const details = await getNetworkDetails(server);
    if (!details) {
        return [];
    }

    for (const address of await collectSavedStackAddresses(server, details.networkName)) {
        details.usedAddresses.add(address);
    }
    reserveEditorAddresses(details.usedAddresses, currentEditorConfig, details.networkName);

    const allocations : InternalIPAllocation[] = [];
    for (const serviceName of requestedServiceNames(currentEditorConfig, details.networkName)) {
        allocations.push({
            serviceName,
            ipAddress: reserveRequestedAddress(server, details.networkName, details.prefix, details.usedAddresses),
        });
    }
    return allocations;
}

export async function getInternalIPDefaults(server : DockgeServer) : Promise<{
    networkName : string;
    subnet : string;
    prefix : string;
}> {
    const details = await getNetworkDetails(server);
    return {
        networkName: details?.networkName || server.config.defaultExternalNetwork,
        subnet: details?.subnet || "",
        prefix: details?.prefix || "",
    };
}
