<template>
    <div class="shadow-box big-padding mb-3 container">
        <div class="container-summary">
            <div class="container-identity">
                <span class="meta-label">{{ $t("containerName") }}</span>
                <h4>{{ name }}</h4>
                <div v-if="imageName || imageTag" class="image">
                    <span class="me-1">{{ imageName }}:</span><span class="tag">{{ imageTag }}</span>
                </div>
            </div>

            <div v-if="!isEditMode" class="container-details">
                <div class="container-detail">
                    <span class="meta-label">{{ $t("internalIP") }}</span>
                    <code v-if="internalIPAddress" class="ip-value">{{ internalIPAddress }}</code>
                    <span v-else class="muted-value">—</span>
                </div>
                <div class="container-detail container-ports">
                    <span class="meta-label">{{ $tc("port", 2) }}</span>
                    <div class="port-values">
                        <a v-for="port in (ports ?? envsubstService.ports)" :key="port" :href="parsePort(port).url" target="_blank">
                            <span class="badge bg-secondary">{{ parsePort(port).display }}</span>
                        </a>
                        <span v-if="!(ports ?? envsubstService.ports)?.length" class="muted-value">—</span>
                    </div>
                </div>
            </div>

            <div v-if="!isEditMode" class="container-status">
                <span class="badge" :class="bgStyle">{{ status }}</span>
            </div>
        </div>

        <div v-if="!isEditMode && serviceCount > 1" class="container-actionbar">
            <div class="function">
                <div class="btn-group" role="group">
                    <router-link v-if="serviceCount > 1 && !isEditMode && (status === 'running' || status === 'healthy' || status === 'unhealthy')" class="btn btn-normal" :to="terminalRouteLink">
                        <font-awesome-icon icon="terminal" />
                        Bash
                    </router-link>
                    <button
                        v-if="serviceCount > 1 && !isEditMode && status !== 'running' && status !== 'healthy'"
                        class="btn btn-primary"
                        :disabled="processing"
                        @click="startService"
                    >
                        <font-awesome-icon icon="play" class="me-1" />
                        {{ $t("startStack") }}
                    </button>
                    <button
                        v-if="serviceCount > 1 && !isEditMode && (status === 'running' || status === 'healthy' || status === 'unhealthy')"
                        class="btn btn-normal"
                        :disabled="processing"
                        @click="restartService"
                    >
                        <font-awesome-icon icon="rotate" class="me-1" />
                        {{ $t("restartStack") }}
                    </button>
                    <button
                        v-if="serviceCount > 1 && !isEditMode && (status === 'running' || status === 'healthy' || status === 'unhealthy')"
                        class="btn btn-normal"
                        :disabled="processing"
                        @click="stopService"
                    >
                        <font-awesome-icon icon="pause" class="me-1" />
                        {{ $t("stopStack") }}
                    </button>
                </div>
            </div>
        </div>

        <div v-if="isEditMode" class="mt-2">
            <button class="btn btn-normal me-2" @click="showConfig = !showConfig">
                <font-awesome-icon icon="edit" />
                {{ $t("Edit") }}
            </button>
            <button v-if="false" class="btn btn-normal me-2">Rename</button>
            <button class="btn btn-danger me-2" @click="remove">
                <font-awesome-icon icon="trash" />
                {{ $t("deleteContainer") }}
            </button>
        </div>
        <div v-else-if="statsInstances.length > 0" class="mt-2">
            <div class="d-flex align-items-center gap-3">
                <template v-if="!expandedStats">
                    <div class="stats">
                        {{ $t('CPU') }}: {{ statsInstances[0].CPUPerc }}
                    </div>
                    <div class="stats">
                        {{ $t('memoryAbbreviated') }}: {{ statsInstances[0].MemUsage }}
                    </div>
                </template>
                <div class="d-flex flex-grow-1 justify-content-end">
                    <button class="btn btn-sm btn-normal" @click="expandedStats = !expandedStats">
                        <font-awesome-icon :icon="expandedStats ? 'chevron-up' : 'chevron-down'" />
                    </button>
                </div>
            </div>
            <transition name="slide-fade" appear>
                <div v-if="expandedStats" class="d-flex flex-column gap-3 mt-2">
                    <DockerStat
                        v-for="stat in statsInstances"
                        :key="stat.Name"
                        :stat="stat"
                    />
                </div>
            </transition>
        </div>

        <transition name="slide-fade" appear>
            <div v-if="isEditMode && showConfig" class="config mt-3">
                <!-- Image -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("dockerImage") }}
                    </label>
                    <div class="input-group mb-3">
                        <input
                            v-model="service.image"
                            class="form-control"
                            list="image-datalist"
                        />
                    </div>

                    <!-- TODO: Search online: https://hub.docker.com/api/content/v1/products/search?q=louislam%2Fuptime&source=community&page=1&page_size=4 -->
                    <datalist id="image-datalist">
                        <option value="louislam/uptime-kuma:1" />
                    </datalist>
                    <div class="form-text"></div>
                </div>

                <!-- Ports -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("port", 2) }}
                    </label>
                    <ArrayInput name="ports" :display-name="$t('port')" placeholder="HOST:CONTAINER" />
                    <div class="input-group mt-3">
                        <input
                            v-model.number="allocationTargetPort"
                            type="number"
                            min="1"
                            max="65535"
                            class="form-control"
                            :placeholder="$t('containerTargetPort')"
                            @keyup.enter="allocatePublishedPort"
                        />
                        <select v-model="allocationProtocol" class="form-select protocol-select" :aria-label="$t('publishedPortProtocol')">
                            <option value="tcp">TCP</option>
                            <option value="udp">UDP</option>
                        </select>
                        <button
                            class="btn btn-normal"
                            :disabled="allocatingPort || !allocationTargetPort || !stackDefaults.publishedHostIPValue"
                            @click="allocatePublishedPort"
                        >
                            <span v-if="allocatingPort" class="spinner-border spinner-border-sm me-1"></span>
                            {{ $t("allocateTailnetPort") }}
                        </button>
                    </div>
                    <div v-if="stackDefaults.publishedHostIPValue" class="form-text">
                        {{ $t("allocateTailnetPortHelp", [
                            stackDefaults.publishedHostIPVariable,
                            stackDefaults.publishedPortStart,
                            stackDefaults.publishedPortEnd,
                        ]) }}
                    </div>
                    <div v-else class="form-text text-warning">
                        {{ $t("publishedHostIPMissing", [ stackDefaults.publishedHostIPVariable ]) }}
                    </div>
                </div>

                <!-- Volumes -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("volume", 2) }}
                    </label>
                    <ArrayInput name="volumes" :display-name="$t('volume')" placeholder="HOST:CONTAINER" />
                </div>

                <!-- Restart Policy -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("restartPolicy") }}
                    </label>
                    <select v-model="service.restart" class="form-select">
                        <option value="always">{{ $t("restartPolicyAlways") }}</option>
                        <option value="unless-stopped">{{ $t("restartPolicyUnlessStopped") }}</option>
                        <option value="on-failure">{{ $t("restartPolicyOnFailure") }}</option>
                        <option value="no">{{ $t("restartPolicyNo") }}</option>
                    </select>
                </div>

                <!-- Environment Variables -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("environmentVariable", 2) }}
                    </label>
                    <ArrayInput name="environment" :display-name="$t('environmentVariable')" placeholder="KEY=VALUE" />
                </div>

                <!-- Container Name -->
                <div v-if="false" class="mb-4">
                    <label class="form-label">
                        {{ $t("containerName") }}
                    </label>
                    <div class="input-group mb-3">
                        <input
                            v-model="service.container_name"
                            class="form-control"
                        />
                    </div>
                    <div class="form-text"></div>
                </div>

                <!-- Network -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("network", 2) }}
                    </label>

                    <div v-if="networkList.length === 0 && service.networks && service.networks.length > 0" class="text-warning mb-3">
                        {{ $t("NoNetworksAvailable") }}
                    </div>

                    <ArraySelect name="networks" :display-name="$t('network')" placeholder="Network Name" :options="networkList" />
                </div>

                <!-- Depends on -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("dependsOn") }}
                    </label>
                    <ArrayInput name="depends_on" :display-name="$t('dependsOn')" :placeholder="$t(`containerName`)" />
                </div>
            </div>
        </transition>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { parseDockerPort } from "../../../common/util-common";
import DockerStat from "./DockerStat.vue";

export default defineComponent({
    components: {
        FontAwesomeIcon,
        DockerStat
    },
    props: {
        name: {
            type: String,
            required: true,
        },
        isEditMode: {
            type: Boolean,
            default: false,
        },
        first: {
            type: Boolean,
            default: false,
        },
        serviceStatus: {
            type: Object,
            default: null,
        },
        dockerStats: {
            type: Object,
            default: null
        }
    },
    emits: [
        "start-service",
        "stop-service",
        "restart-service"
    ],
    data() {
        return {
            showConfig: false,
            expandedStats: false,
            allocationTargetPort: "",
            allocationProtocol: "tcp",
            allocatingPort: false,
        };
    },
    computed: {

        networkList() {
            let list = [];
            for (const networkName in this.jsonObject.networks) {
                list.push(networkName);
            }
            return list;
        },

        bgStyle() {
            if (this.status === "running" || this.status === "healthy") {
                return "bg-primary";
            } else if (this.status === "unhealthy") {
                return "bg-danger";
            } else {
                return "bg-secondary";
            }
        },

        terminalRouteLink() {
            if (this.endpoint) {
                return {
                    name: "containerTerminalEndpoint",
                    params: {
                        endpoint: this.endpoint,
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            } else {
                return {
                    name: "containerTerminal",
                    params: {
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            }
        },

        endpoint() {
            return this.$parent.$parent.endpoint;
        },

        stack() {
            return this.$parent.$parent.stack;
        },

        stackName() {
            return this.$parent.$parent.stack.name;
        },

        stackDefaults() {
            return this.$parent.$parent.stackDefaults;
        },

        service() {
            if (!this.jsonObject.services[this.name]) {
                return {};
            }
            return this.jsonObject.services[this.name];
        },

        serviceCount() {
            return Object.keys(this.jsonObject.services).length;
        },

        jsonObject() {
            return this.$parent.$parent.jsonConfig;
        },

        envsubstJSONConfig() {
            return this.$parent.$parent.envsubstJSONConfig;
        },

        envsubstService() {
            if (!this.envsubstJSONConfig.services[this.name]) {
                return {};
            }
            return this.envsubstJSONConfig.services[this.name];
        },

        imageName() {
            if (this.envsubstService.image) {
                return this.envsubstService.image.split(":")[0];
            } else {
                return "";
            }
        },

        imageTag() {
            if (this.envsubstService.image) {
                let tag = this.envsubstService.image.split(":")[1];

                if (tag) {
                    return tag;
                } else {
                    return "latest";
                }
            } else {
                return "";
            }
        },
        internalIPAddress() {
            const actual = Array.isArray(this.serviceStatus)
                ? this.serviceStatus.find(instance => typeof instance.internalIP === "string")?.internalIP
                : undefined;
            if (actual) {
                return actual;
            }

            const networkName = this.stackDefaults.internalIPNetwork || this.stackDefaults.defaultExternalNetwork;
            const networks = this.envsubstService.networks ?? this.service.networks;
            if (!networkName || !networks || Array.isArray(networks) || typeof networks !== "object") {
                return "";
            }

            const network = networks[networkName];
            return network && typeof network === "object" && typeof network.ipv4_address === "string"
                ? network.ipv4_address
                : "";
        },
        statsInstances() {
            if (!this.serviceStatus) {
                return [];
            }

            return this.serviceStatus
                .map(s => this.dockerStats[s.name])
                .filter(s => !!s)
                .sort((a, b) => a.Name.localeCompare(b.Name));
        },
        status() {
            if (!this.serviceStatus) {
                return "N/A";
            }
            return this.serviceStatus[0].status;
        }
    },
    mounted() {
        if (this.first) {
            //this.showConfig = true;
        }
    },
    methods: {
        parsePort(port) {
            if (this.stack.endpoint) {
                return parseDockerPort(port, this.stack.primaryHostname);
            } else {
                let hostname = this.$root.info.primaryHostname || location.hostname;
                return parseDockerPort(port, hostname);
            }
        },
        remove() {
            delete this.jsonObject.services[this.name];
        },
        startService() {
            this.$emit("start-service", this.name);
        },
        stopService() {
            this.$emit("stop-service", this.name);
        },
        restartService() {
            this.$emit("restart-service", this.name);
        },
        collectCurrentEditorPorts() {
            const ports = [];
            for (const config of [ this.jsonObject, this.envsubstJSONConfig ]) {
                for (const service of Object.values(config.services ?? {})) {
                    if (service && typeof service === "object" && Array.isArray(service.ports)) {
                        ports.push(...service.ports);
                    }
                }
            }
            return ports;
        },
        allocatePublishedPort() {
            const targetPort = Number(this.allocationTargetPort);
            if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
                this.$root.toastError(this.$t("invalidContainerTargetPort"));
                return;
            }
            if (this.service.ports !== undefined && !Array.isArray(this.service.ports)) {
                this.$root.toastError(this.$t("publishedPortListInvalid"));
                return;
            }

            this.allocatingPort = true;
            this.$root.emitAgent(
                this.endpoint,
                "allocatePublishedPort",
                targetPort,
                this.allocationProtocol,
                this.collectCurrentEditorPorts(),
                (res) => {
                    this.allocatingPort = false;
                    if (!res?.ok || !res.allocation) {
                        if (res) {
                            this.$root.toastRes(res);
                        }
                        return;
                    }

                    if (this.service.ports === undefined) {
                        this.service.ports = [];
                    }
                    if (!Array.isArray(this.service.ports)) {
                        this.$root.toastError(this.$t("publishedPortListInvalid"));
                        return;
                    }

                    this.service.ports.push(res.allocation.mapping);
                    this.allocationTargetPort = "";
                    this.$root.toastSuccess(this.$t("publishedPortAllocated", [
                        res.allocation.publishedPort,
                        res.allocation.targetPort,
                    ]));
                }
            );
        }

    }
});
</script>

<style scoped lang="scss">
@import "../styles/vars";
@import "../styles/design-tokens.scss";

.container {
    background: #10161e;
    border: 1px solid #28313d;
    border-radius: 8px;
    padding: 12px;
    box-shadow: none;
    transition: border-color 120ms ease, background-color 120ms ease;

    &:hover {
        border-color: #3b4b5d;
        background: #121a23;
    }

    .container-summary {
        display: grid;
        grid-template-columns: minmax(180px, 0.85fr) minmax(0, 1.8fr) max-content;
        gap: 16px;
        align-items: center;
    }

    .container-identity,
    .container-details {
        min-width: 0;
    }

    .container-actionbar {
        display: flex;
        justify-content: flex-start;
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #28313d;
    }

    .container-details {
        display: grid;
        grid-template-columns: minmax(120px, 0.8fr) minmax(0, 1.4fr);
        width: 100%;
        align-items: center;
        gap: 12px;
    }

    .container-detail {
        min-width: 0;
    }

    .container-status {
        justify-self: end;
        white-space: nowrap;
    }

    .meta-label {
        display: block;
        margin-bottom: 3px;
        color: #718096;
        font-size: 0.7rem;
        line-height: 1.1;
        white-space: nowrap;
    }

    .ip-value {
        color: #d7e4ef;
        font-family: var(--font-mono);
        font-size: 0.8rem;
    }

    .muted-value {
        color: #64748b;
    }

    .port-values {
        display: flex;
        min-width: 0;
        flex-wrap: wrap;
        gap: 4px;

        a {
            display: block;
            min-width: 0;
            max-width: 100%;
        }
    }

    h4 {
        margin-bottom: 4px;
        font-size: 0.95rem;
        line-height: 1.2;
    }

    .badge {
        max-width: 100%;
        overflow: hidden;
        padding: 3px 6px;
        border-radius: 4px;
        font-size: 0.7rem;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
    }

    .image {
        font-size: 0.8rem;
        color: #8c99a8;
        font-family: var(--font-mono);

        .tag {
            color: #9acff0;
            font-weight: 600;
        }
    }

    .function {
        align-content: center;
        display: flex;
        align-items: center;
        justify-content: flex-start;
    }

    .stats {
        font-size: 0.75rem;
        color: #8c99a8;
        font-family: var(--font-mono);
    }

    .protocol-select {
        max-width: 95px;
    }
}

@media (max-width: 900px) {
    .container .container-summary {
        grid-template-columns: 1fr;
        gap: 10px;
    }

    .container .container-details {
        grid-template-columns: minmax(120px, 0.8fr) minmax(0, 1.4fr);
        gap: 16px;
    }

    .container .container-actionbar {
        margin-top: 8px;
    }
}

@media (max-width: 550px) {
    .container .container-summary {
        display: block;
    }

    .container .container-details {
        grid-template-columns: 1fr 1fr;
    }

    .container .container-status {
        justify-self: start;
    }

    .container .container-actionbar,
    .container .container-details {
        margin-top: 10px;
    }

    .container .function {
        justify-content: flex-start;
    }
}
</style>
