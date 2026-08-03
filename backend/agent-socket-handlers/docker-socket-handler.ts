import { AgentSocketHandler } from "../agent-socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { Stack } from "../stack";
import { AgentSocket } from "../../common/agent-socket";
import { allocatePublishedPort, allocatePublishedPorts } from "../published-port-allocator";
import { allocateInternalIPs, getInternalIPDefaults } from "../internal-ip-allocator";
import { stackFileUploadManager } from "../stack-file-upload";
import { copyServerProject, inspectServerProject } from "../server-project";
import { promises as fsAsync } from "node:fs";
import os from "node:os";
import { parseDocument } from "yaml";
import {
    applyInternalIPAllocationsToDoc,
    servicesNeedingInternalIP,
} from "../../common/internal-ip";

export class DockerSocketHandler extends AgentSocketHandler {
    create(socket : DockgeSocket, server : DockgeServer, agentSocket : AgentSocket) {
        // Do not call super.create()

        agentSocket.on("deployStack", async (name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, callback) => {
            try {
                checkLogin(socket);
                const stack = await this.saveStack(server, name, composeYAML, composeENV, isAdd);
                await stack.deploy(socket);
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Deployed",
                    msgi18n: true,
                }, callback);
                stack.joinCombinedTerminal(socket);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("saveStack", async (name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, callback) => {
            try {
                checkLogin(socket);
                await this.saveStack(server, name, composeYAML, composeENV, isAdd);
                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("prepareStackBindMounts", async (stackName : unknown, preparations : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.prepareBindMountSources(preparations);
                callbackResult({
                    ok: true,
                    msg: "bindMountSourcesPrepared",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("inspectServerProject", async (projectPath : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof projectPath !== "string") {
                    throw new ValidationError("Project path must be a string");
                }
                const project = await inspectServerProject(server.config.projectsDir, projectPath.trim());
                callbackResult({
                    ok: true,
                    project,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("importServerProject", async (name : unknown, projectPath : unknown, composeYAML : unknown, composeENV : unknown, deploy : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof name !== "string" || typeof projectPath !== "string") {
                    throw new ValidationError("Stack name and project path must be strings");
                }
                if (typeof composeYAML !== "string" || typeof composeENV !== "string") {
                    throw new ValidationError("Compose YAML and ENV must be strings");
                }
                if (typeof deploy !== "boolean") {
                    throw new ValidationError("Deploy must be a boolean");
                }

                new Stack(server, name, composeYAML, composeENV, true).validate();
                await copyServerProject(
                    server.config.projectsDir,
                    server.stacksDir,
                    name,
                    projectPath.trim()
                );

                let stack : Stack;
                try {
                    stack = await this.saveStack(server, name, composeYAML, composeENV, false);
                } catch (error) {
                    await fsAsync.rm(new Stack(server, name).path, {
                        recursive: true,
                        force: true,
                    });
                    throw error;
                }

                server.sendStackList();
                if (deploy) {
                    await stack.deploy(socket);
                    stack.joinCombinedTerminal(socket);
                }

                callbackResult({
                    ok: true,
                    msg: deploy ? "Deployed" : "Saved",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("beginStackFileUpload", async (name : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof name !== "string") {
                    throw new ValidationError("Name must be a string");
                }
                const uploadID = await stackFileUploadManager.begin(server.stacksDir, socket.id, name);
                callbackResult({
                    ok: true,
                    uploadID,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("uploadStackFileChunk", async (uploadID : unknown, relativePath : unknown, offset : unknown, chunk : unknown, callback) => {
            try {
                checkLogin(socket);
                await stackFileUploadManager.writeChunk(socket.id, uploadID, relativePath, offset, chunk);
                callbackResult({ ok: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("finishStackFileUpload", async (uploadID : unknown, composeYAML : unknown, composeENV : unknown, deploy : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof composeYAML !== "string") {
                    throw new ValidationError("Compose YAML must be a string");
                }
                if (typeof composeENV !== "string") {
                    throw new ValidationError("Compose ENV must be a string");
                }
                if (typeof deploy !== "boolean") {
                    throw new ValidationError("Deploy must be a boolean");
                }

                new Stack(server, "upload-validation", composeYAML, composeENV, true).validate();
                const sessionStackName = await stackFileUploadManager.finish(socket.id, uploadID);
                const stack = await this.saveStack(server, sessionStackName, composeYAML, composeENV, false);
                server.sendStackList();
                if (deploy) {
                    await stack.deploy(socket);
                    stack.joinCombinedTerminal(socket);
                }

                callbackResult({
                    ok: true,
                    msg: deploy ? "Deployed" : "Saved",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("cancelStackFileUpload", async (uploadID : unknown, callback) => {
            try {
                checkLogin(socket);
                await stackFileUploadManager.cancel(socket.id, uploadID);
                callbackResult({ ok: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("disconnect", () => {
            void stackFileUploadManager.cancelForSocket(socket.id);
        });

        agentSocket.on("deleteStack", async (name : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof(name) !== "string") {
                    throw new ValidationError("Name must be a string");
                }
                const stack = await Stack.getStack(server, name);

                try {
                    await stack.delete(socket);
                } catch (e) {
                    server.sendStackList();
                    throw e;
                }

                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Deleted",
                    msgi18n: true,
                }, callback);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }
                const stack = await Stack.getStack(server, stackName);

                if (stack.isManagedByDockge) {
                    stack.joinCombinedTerminal(socket);
                }

                callbackResult({
                    ok: true,
                    stack: await stack.toJSON(socket.endpoint),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // requestStackList
        agentSocket.on("requestStackList", async (callback) => {
            try {
                checkLogin(socket);
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // startStack
        agentSocket.on("startStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.start(socket);
                callbackResult({
                    ok: true,
                    msg: "Started",
                    msgi18n: true,
                }, callback);
                server.sendStackList();

                stack.joinCombinedTerminal(socket);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        // stopStack
        agentSocket.on("stopStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.stop(socket);
                callbackResult({
                    ok: true,
                    msg: "Stopped",
                    msgi18n: true,
                }, callback);
                server.sendStackList();

                stack.leaveCombinedTerminal(socket);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // restartStack
        agentSocket.on("restartStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.restart(socket);
                callbackResult({
                    ok: true,
                    msg: "Restarted",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // updateStack
        agentSocket.on("updateStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.update(socket);
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("gitPullAndBuildStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.gitPullAndBuild(socket);
                callbackResult({
                    ok: true,
                    msg: "gitPullAndBuildSuccess",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // down stack
        agentSocket.on("downStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.down(socket);
                callbackResult({
                    ok: true,
                    msg: "Downed",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Services status
        agentSocket.on("serviceStatusList", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName, true);
                const serviceStatusList = Object.fromEntries(await stack.getServiceStatusList());
                callbackResult({
                    ok: true,
                    serviceStatusList,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Docker stats
        agentSocket.on("dockerStats", async (callback) => {
            try {
                checkLogin(socket);

                const dockerStats = Object.fromEntries(await server.getDockerStats());
                callbackResult({
                    ok: true,
                    dockerStats,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Host information for the dashboard sidebar. This is deliberately
        // read-only and stays on the agent that owns the Docker socket.
        agentSocket.on("hostStats", async (callback) => {
            try {
                checkLogin(socket);

                const cpuCount = Math.max(os.cpus().length, 1);
                const loadAverage = os.loadavg()[0] || 0;
                const totalMemoryBytes = os.totalmem();
                const freeMemoryBytes = os.freemem();
                const hostInterfaces = os.networkInterfaces();
                let detectedHostIP = "";

                for (const addresses of Object.values(hostInterfaces)) {
                    const address = addresses?.find(item => item.family === "IPv4" && !item.internal);
                    if (address?.address) {
                        detectedHostIP = address.address;
                        break;
                    }
                }

                let subnet = "";
                try {
                    subnet = (await getInternalIPDefaults(server)).subnet;
                } catch {
                    // Docker network information is optional for the card.
                }

                callbackResult({
                    ok: true,
                    hostStats: {
                        hostname: os.hostname(),
                        hostIP: server.getPublishedHostIPValue() || detectedHostIP,
                        subnet,
                        platform: `${os.platform()} (${os.release()})`,
                        cpuCount,
                        cpuLoadPercent: Math.round(Math.min(loadAverage / cpuCount * 100, 100) * 10) / 10,
                        totalMemoryBytes,
                        usedMemoryBytes: Math.max(totalMemoryBytes - freeMemoryBytes, 0),
                        memoryPercent: Math.round((totalMemoryBytes - freeMemoryBytes) / totalMemoryBytes * 1000) / 10,
                        uptimeSeconds: os.uptime(),
                    },
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Start a service
        agentSocket.on("startService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof (stackName) !== "string" || typeof (serviceName) !== "string") {
                    throw new ValidationError("Stack name and service name must be strings");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.startService(socket, serviceName);
                stack.joinCombinedTerminal(socket); // Ensure the combined terminal is joined
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " started"
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Stop a service
        agentSocket.on("stopService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof (stackName) !== "string" || typeof (serviceName) !== "string") {
                    throw new ValidationError("Stack name and service name must be strings");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.stopService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " stopped"
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("restartService", async (stackName: unknown, serviceName: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof stackName !== "string" || typeof serviceName !== "string") {
                    throw new Error("Invalid stackName or serviceName");
                }

                const stack = await Stack.getStack(server, stackName, true);
                await stack.restartService(socket, serviceName);
                callbackResult({
                    ok: true,
                    msg: "Service " + serviceName + " restarted"
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // getExternalNetworkList
        agentSocket.on("getDockerNetworkList", async (callback) => {
            try {
                checkLogin(socket);
                const dockerNetworkList = await server.getDockerNetworkList();
                callbackResult({
                    ok: true,
                    dockerNetworkList,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("ensureDefaultExternalNetwork", async (callback) => {
            try {
                checkLogin(socket);
                if (!server.config.defaultExternalNetwork) {
                    throw new ValidationError("No default external network is configured.");
                }

                const result = await server.ensureDefaultExternalNetwork();
                callbackResult({
                    ok: true,
                    result,
                    defaultExternalNetwork: server.config.defaultExternalNetwork,
                    defaultExternalNetworkExists: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getStackDefaults", async (callback) => {
            try {
                checkLogin(socket);
                let defaultExternalNetworkExists = false;
                if (server.config.defaultExternalNetwork) {
                    try {
                        const dockerNetworkList = await server.getDockerNetworkList();
                        defaultExternalNetworkExists = dockerNetworkList.includes(server.config.defaultExternalNetwork);
                    } catch {
                        // Keep the editor usable while Docker is unavailable. The
                        // explicit create action will report the actionable error.
                    }
                }
                let internalIPDefaults = {
                    networkName: server.config.defaultExternalNetwork,
                    subnet: "",
                    prefix: "",
                };
                try {
                    internalIPDefaults = await getInternalIPDefaults(server);
                } catch {
                    // Keep the other editor defaults available while Docker is
                    // unavailable or the configured network has not been created.
                }
                callbackResult({
                    ok: true,
                    defaults: {
                        defaultExternalNetwork: server.config.defaultExternalNetwork,
                        defaultExternalNetworkExists,
                        publishedHostIPVariable: server.config.publishedHostIPVariable,
                        publishedHostIPValue: server.getPublishedHostIPValue(),
                        publishedPortStart: server.config.publishedPortStart,
                        publishedPortEnd: server.config.publishedPortEnd,
                        projectsDir: server.config.projectsDir,
                        internalIPNetwork: internalIPDefaults.networkName,
                        internalIPSubnet: internalIPDefaults.subnet,
                        internalIPPrefix: internalIPDefaults.prefix,
                    },
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("allocateInternalIPs", async (currentEditorConfig : unknown, callback) => {
            try {
                checkLogin(socket);
                const allocations = await allocateInternalIPs(server, currentEditorConfig);
                callbackResult({
                    ok: true,
                    allocations,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("allocatePublishedPort", async (
            targetPort : unknown,
            protocol : unknown,
            currentEditorPorts : unknown,
            requestedPublishedPortOrCallback : unknown,
            callbackMaybe : unknown
        ) => {
            const hasRequestedPort = typeof requestedPublishedPortOrCallback !== "function";
            const requestedPublishedPort = hasRequestedPort ? requestedPublishedPortOrCallback : undefined;
            const callback = (hasRequestedPort ? callbackMaybe : requestedPublishedPortOrCallback) as unknown;
            try {
                checkLogin(socket);
                const allocation = await allocatePublishedPort(
                    server,
                    targetPort,
                    protocol,
                    currentEditorPorts,
                    requestedPublishedPort
                );
                callbackResult({
                    ok: true,
                    allocation,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("allocatePublishedPorts", async (requests : unknown, currentEditorPorts : unknown, callback) => {
            try {
                checkLogin(socket);
                const allocations = await allocatePublishedPorts(server, requests, currentEditorPorts);
                callbackResult({
                    ok: true,
                    allocations,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

    async saveStack(server : DockgeServer, name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown) : Promise<Stack> {
        // Check types
        if (typeof(name) !== "string") {
            throw new ValidationError("Name must be a string");
        }
        if (typeof(composeYAML) !== "string") {
            throw new ValidationError("Compose YAML must be a string");
        }
        if (typeof(composeENV) !== "string") {
            throw new ValidationError("Compose ENV must be a string");
        }
        if (typeof(isAdd) !== "boolean") {
            throw new ValidationError("isAdd must be a boolean");
        }

        const preparedComposeYAML = await this.prepareInternalIPComposeYAML(server, composeYAML);
        const stack = new Stack(server, name, preparedComposeYAML, composeENV, false);
        await stack.save(isAdd);
        return stack;
    }

    private async prepareInternalIPComposeYAML(server : DockgeServer, composeYAML : string) : Promise<string> {
        const networkName = server.config.defaultExternalNetwork;
        if (!networkName) {
            return composeYAML;
        }

        const document = parseDocument(composeYAML);
        if (document.errors.length > 0) {
            return composeYAML;
        }

        const config = document.toJS();
        if (servicesNeedingInternalIP(config, networkName).length === 0) {
            return composeYAML;
        }

        const allocations = await allocateInternalIPs(server, config);
        if (allocations.length === 0) {
            return composeYAML;
        }

        applyInternalIPAllocationsToDoc(document, networkName, allocations);
        return document.toString();
    }

}
