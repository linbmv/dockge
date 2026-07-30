<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 v-if="isAdd" class="mb-3">{{ $t("compose") }}</h1>
            <h1 v-else class="mb-3">
                <Uptime :stack="globalStack" :pill="true" /> {{ stack.name }}
                <span v-if="$root.agentCount > 1 && endpoint !== ''" class="agent-name">
                    ({{ endpointDisplay }})
                </span>
            </h1>

            <div v-if="stack.isManagedByDockge" class="mb-3">
                <div class="btn-group me-2" role="group">
                    <button v-if="isEditMode" class="btn btn-primary" :disabled="processing" @click="deployStack">
                        <font-awesome-icon icon="rocket" class="me-1" />
                        {{ $t("deployStack") }}
                    </button>

                    <button v-if="isEditMode" class="btn btn-normal" :disabled="processing" @click="saveStack">
                        <font-awesome-icon icon="save" class="me-1" />
                        {{ $t("saveStackDraft") }}
                    </button>

                    <button v-if="!isEditMode" class="btn btn-secondary" :disabled="processing" @click="enableEditMode">
                        <font-awesome-icon icon="pen" class="me-1" />
                        {{ $t("editStack") }}
                    </button>

                    <button v-if="!isEditMode && !active" class="btn btn-primary" :disabled="processing" @click="startStack">
                        <font-awesome-icon icon="play" class="me-1" />
                        {{ $t("startStack") }}
                    </button>

                    <button v-if="!isEditMode && active" class="btn btn-normal " :disabled="processing" @click="restartStack">
                        <font-awesome-icon icon="rotate" class="me-1" />
                        {{ $t("restartStack") }}
                    </button>

                    <button v-if="!isEditMode" class="btn btn-normal" :disabled="processing" @click="updateStack">
                        <font-awesome-icon icon="cloud-arrow-down" class="me-1" />
                        {{ $t("updateStack") }}
                    </button>

                    <button v-if="!isEditMode && stack.isGitRepository" class="btn btn-normal" :disabled="processing" @click="gitPullAndBuildStack">
                        <font-awesome-icon icon="wrench" class="me-1" />
                        {{ $t("gitPullAndBuildStack") }}
                    </button>

                    <button v-if="!isEditMode && active" class="btn btn-normal" :disabled="processing" @click="stopStack">
                        <font-awesome-icon icon="stop" class="me-1" />
                        {{ $t("stopStack") }}
                    </button>

                    <BDropdown right text="" variant="normal">
                        <BDropdownItem @click="downStack">
                            <font-awesome-icon icon="stop" class="me-1" />
                            {{ $t("downStack") }}
                        </BDropdownItem>
                    </BDropdown>
                </div>

                <button v-if="isEditMode && !isAdd" class="btn btn-normal" :disabled="processing" @click="discardStack">{{ $t("discardStack") }}</button>
                <button v-if="!isEditMode" class="btn btn-danger" :disabled="processing" @click="showDeleteDialog = !showDeleteDialog">
                    <font-awesome-icon icon="trash" class="me-1" />
                    {{ $t("deleteStack") }}
                </button>
            </div>

            <!-- URLs -->
            <div v-if="urls.length > 0" class="mb-3">
                <a v-for="(urlItem, index) in urls" :key="index" target="_blank" :href="urlItem.url">
                    <span class="badge bg-secondary me-2">{{ urlItem.display }}</span>
                </a>
            </div>

            <!-- Progress Terminal -->
            <transition name="slide-fade" appear>
                <Terminal
                    v-show="showProgressTerminal"
                    ref="progressTerminal"
                    class="mb-3 terminal"
                    :name="terminalName"
                    :endpoint="endpoint"
                    :rows="progressTerminalRows"
                    @has-data="showProgressTerminal = true; submitted = true;"
                ></Terminal>
            </transition>

            <div v-if="stack.isManagedByDockge" class="row">
                <div class="col-lg-6">
                    <!-- General -->
                    <div v-if="isAdd">
                        <h4 class="mb-3">{{ $t("general") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <!-- Stack Name -->
                            <div>
                                <label for="name" class="form-label">{{ $t("stackName") }}</label>
                                <input id="name" v-model="stack.name" type="text" class="form-control" required @blur="stackNameToLowercase">
                                <div class="form-text">{{ $t("Lowercase only") }}</div>
                            </div>

                            <!-- Endpoint -->
                            <div class="mt-3">
                                <label for="name" class="form-label">{{ $t("dockgeAgent") }}</label>
                                <select v-model="stack.endpoint" class="form-select">
                                    <option v-for="(agent, agentEndpoint) in $root.agentList" :key="agentEndpoint" :value="agentEndpoint" :disabled="$root.agentStatusList[agentEndpoint] != 'online'">
                                        ({{ $root.agentStatusList[agentEndpoint] }}) {{ (agent.name !== '') ? agent.name : agent.url || $t("Current") }}
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Containers -->
                    <h4 class="mb-3">{{ $tc("container", 2) }}</h4>

                    <div v-if="isEditMode && !isAdd" class="input-group mb-3">
                        <input
                            v-model="newContainerName"
                            :placeholder="$t(`New Container Name...`)"
                            class="form-control"
                            @keyup.enter="addContainer"
                        />
                        <button class="btn btn-primary" @click="addContainer">
                            {{ $t("addContainer") }}
                        </button>
                    </div>

                    <div v-if="isAdd && serviceNames.length === 0" class="shadow-box big-padding mb-3 form-text">
                        {{ $t("noServicesYet") }}
                    </div>

                    <div ref="containerList">
                        <Container
                            v-for="(service, name) in jsonConfig.services"
                            :key="name"
                            :name="name"
                            :is-edit-mode="isEditMode && !isAdd"
                            :first="name === Object.keys(jsonConfig.services)[0]"
                            :serviceStatus="serviceStatusList[name]"
                            :dockerStats="dockerStats"
                            @start-service="startService"
                            @stop-service="stopService"
                            @restart-service="restartService"
                        />
                    </div>

                    <button v-if="false && isEditMode && jsonConfig.services && Object.keys(jsonConfig.services).length > 0" class="btn btn-normal mb-3" @click="addContainer">{{ $t("addContainer") }}</button>

                    <!-- General -->
                    <div v-if="isEditMode && !isAdd">
                        <h4 class="mb-3">{{ $t("extra") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <!-- URLs -->
                            <div class="mb-4">
                                <label class="form-label">
                                    {{ $tc("url", 2) }}
                                </label>
                                <ArrayInput name="urls" :display-name="$t('url')" placeholder="https://" object-type="x-dockge" />
                            </div>
                        </div>
                    </div>

                    <!-- Combined Terminal Output -->
                    <div v-show="!isEditMode">
                        <h4 class="mb-3">{{ $t("terminal") }}</h4>
                        <Terminal
                            ref="combinedTerminal"
                            class="mb-3 terminal"
                            :name="combinedTerminalName"
                            :endpoint="endpoint"
                            :rows="combinedTerminalRows"
                            :cols="combinedTerminalCols"
                            style="height: 315px;"
                        ></Terminal>
                    </div>
                </div>
                <div class="col-lg-6">
                    <h4 class="mb-3">{{ stack.composeFileName }}</h4>

                    <!-- YAML editor -->
                    <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode}">
                        <code-mirror
                            ref="editor"
                            v-model="stack.composeYAML"
                            :extensions="extensions"
                            minimal
                            wrap="true"
                            dark="true"
                            tab="true"
                            :disabled="!isEditMode"
                            :hasFocus="editorFocus"
                            @change="yamlCodeChange"
                        />
                    </div>
                    <div v-if="isEditMode" class="mb-3">
                        {{ yamlError }}
                    </div>

                    <!-- ENV editor -->
                    <div v-if="isEditMode">
                        <h4 class="mb-3">.env</h4>
                        <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode}">
                            <code-mirror
                                ref="editor"
                                v-model="stack.composeENV"
                                :extensions="extensionsEnv"
                                minimal
                                wrap="true"
                                dark="true"
                                tab="true"
                                :disabled="!isEditMode"
                                :hasFocus="editorFocus"
                                @change="yamlCodeChange"
                            />
                        </div>
                    </div>

                    <!-- Network / port presets (shown only in add mode) -->
                    <div v-if="isAdd">
                        <h4 class="mb-3">{{ $t("networkAndPortPresets") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <div class="form-text mb-3">{{ $t("networkAndPortPresetsHelp") }}</div>

                            <div v-if="stackDefaults.defaultExternalNetwork" class="mb-3">
                                <button
                                    class="btn btn-normal me-2"
                                    :disabled="pendingNetworkServices.length === 0"
                                    @click="applyNetworkPreset"
                                >
                                    {{ $t("joinSharedNetwork", [ stackDefaults.defaultExternalNetwork ]) }}
                                </button>
                                <span v-if="pendingNetworkServices.length > 0" class="form-text">
                                    {{ $t("joinSharedNetworkPending", [ pendingNetworkServices.join(", ") ]) }}
                                </span>
                                <span v-else class="form-text">{{ $t("joinSharedNetworkDone") }}</span>
                            </div>

                            <div>
                                <button
                                    class="btn btn-normal me-2"
                                    :disabled="allocatingPorts || portPreset.rewritable.length === 0 || !stackDefaults.publishedHostIPValue"
                                    @click="applyPortPreset"
                                >
                                    <span v-if="allocatingPorts" class="spinner-border spinner-border-sm me-1"></span>
                                    {{ $t("pinPortsToTailnet") }}
                                </button>

                                <div v-if="!stackDefaults.publishedHostIPValue" class="form-text text-warning mt-2">
                                    {{ $t("publishedHostIPMissing", [ stackDefaults.publishedHostIPVariable ]) }}
                                </div>
                                <ul v-else-if="portPreset.rewritable.length > 0" class="preset-list mt-2">
                                    <li v-for="entry in portPreset.rewritable" :key="entry.serviceName + ':' + entry.index">
                                        <code>{{ entry.serviceName }}</code> — {{ entry.original }}
                                    </li>
                                </ul>
                                <div v-else class="form-text mt-2">{{ $t("pinPortsToTailnetDone") }}</div>

                                <ul v-if="portPreset.skipped.length > 0" class="preset-list mt-2 text-warning">
                                    <li v-for="entry in portPreset.skipped" :key="'skip-' + entry.serviceName + ':' + entry.index">
                                        <code>{{ entry.serviceName }}</code> — {{ entry.original }}
                                        <span class="ms-1">({{ $t("portPresetSkip_" + entry.skipReason) }})</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div v-if="isEditMode && !isAdd">
                        <!-- Volumes -->
                        <div v-if="false">
                            <h4 class="mb-3">{{ $tc("volume", 2) }}</h4>
                            <div class="shadow-box big-padding mb-3">
                            </div>
                        </div>

                        <!-- Networks -->
                        <h4 class="mb-3">{{ $tc("network", 2) }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <NetworkInput />
                        </div>
                    </div>

                    <!-- <div class="shadow-box big-padding mb-3">
                        <div class="mb-3">
                            <label for="name" class="form-label"> Search Templates</label>
                            <input id="name" v-model="name" type="text" class="form-control" placeholder="Search..." required>
                        </div>

                        <prism-editor v-if="false" v-model="yamlConfig" class="yaml-editor" :highlight="highlighter" line-numbers @input="yamlCodeChange"></prism-editor>
                    </div>-->
                </div>
            </div>

            <div v-if="!stack.isManagedByDockge && !processing">
                {{ $t("stackNotManagedByDockgeMsg") }}
            </div>

            <!-- Delete Dialog -->
            <BModal v-model="showDeleteDialog" :cancelTitle="$t('cancel')" :okTitle="$t('deleteStack')" okVariant="danger" @ok="deleteDialog">
                {{ $t("deleteStackMsg") }}
            </BModal>
        </div>
    </transition>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { yaml } from "@codemirror/lang-yaml";
import { python } from "@codemirror/lang-python";
import { dracula as editorTheme } from "thememirror";
import { lineNumbers, EditorView } from "@codemirror/view";
import { parseDocument, Document } from "yaml";

import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import {
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    copyYAMLComments, envsubstYAML,
    getCombinedTerminalName,
    getComposeTerminalName,
    PROGRESS_TERMINAL_ROWS,
    RUNNING
} from "../../../common/util-common";
import { BModal } from "bootstrap-vue-next";
import NetworkInput from "../components/NetworkInput.vue";
import dotenv from "dotenv";
import { ref } from "vue";
import { resolveRequiredEnvironmentVariable } from "../../../common/published-port";
import {
    applyDefaultExternalNetworkToDoc,
    applyPortRewritesToDoc,
    planDefaultExternalNetwork,
    planPortPreset
} from "../../../common/compose-preset";

const template = `
services:
  nginx:
    image: nginx:latest
    restart: unless-stopped
    ports:
      - "8080:80"
`;
const homelabTemplate = `
services:
  nginx:
    image: nginx:latest
    restart: unless-stopped
    expose:
      - "80"
`;
const envDefault = "# VARIABLE=value #comment";

let yamlErrorTimeout = null;

let serviceStatusTimeout = null;
let dockerStatsTimeout = null;

export default {
    components: {
        NetworkInput,
        FontAwesomeIcon,
        CodeMirror,
        BModal,
    },
    beforeRouteUpdate(to, from, next) {
        this.exitConfirm(next);
    },
    beforeRouteLeave(to, from, next) {
        this.exitConfirm(next);
    },
    setup() {
        const editorFocus = ref(false);

        const focusEffectHandler = (state, focusing) => {
            editorFocus.value = focusing;
            return null;
        };

        const extensions = [
            editorTheme,
            yaml(),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        const extensionsEnv = [
            editorTheme,
            python(),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        return { extensions,
            extensionsEnv,
            editorFocus };
    },
    yamlDoc: null,  // For keeping the yaml comments
    data() {
        return {
            jsonConfig: {},
            envsubstJSONConfig: {},
            yamlError: "",
            processing: true,
            showProgressTerminal: false,
            progressTerminalRows: PROGRESS_TERMINAL_ROWS,
            combinedTerminalRows: COMBINED_TERMINAL_ROWS,
            combinedTerminalCols: COMBINED_TERMINAL_COLS,
            stack: {

            },
            stackDefaults: {
                defaultExternalNetwork: "",
                publishedHostIPVariable: "TS_HOST_IP",
                publishedHostIPValue: "",
                publishedPortStart: 20000,
                publishedPortEnd: 39999,
            },
            serviceStatusList: {},
            dockerStats: {},
            isEditMode: false,
            submitted: false,
            showDeleteDialog: false,
            newContainerName: "",
            stopServiceStatusTimeout: false,
            stopDockerStatsTimeout: false,
            allocatingPorts: false,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.endpoint);
        },

        urls() {
            if (!this.envsubstJSONConfig["x-dockge"] || !this.envsubstJSONConfig["x-dockge"].urls || !Array.isArray(this.envsubstJSONConfig["x-dockge"].urls)) {
                return [];
            }

            let urls = [];
            for (const url of this.envsubstJSONConfig["x-dockge"].urls) {
                let display;
                try {
                    let obj = new URL(url);
                    let pathname = obj.pathname;
                    if (pathname === "/") {
                        pathname = "";
                    }
                    display = obj.host + pathname + obj.search;
                } catch (e) {
                    display = url;
                }

                urls.push({
                    display,
                    url,
                });
            }
            return urls;
        },

        isAdd() {
            return this.$route.path === "/compose" && !this.submitted;
        },

        serviceNames() {
            if (!this.jsonConfig.services || typeof this.jsonConfig.services !== "object") {
                return [];
            }
            return Object.keys(this.jsonConfig.services);
        },

        /**
         * Which `ports:` entries the Tailnet preset can pin, and which it will
         * leave alone. Recomputed from the editor content, so it always
         * describes what is actually in the YAML right now.
         */
        portPreset() {
            return planPortPreset(this.jsonConfig, this.stackDefaults.publishedHostIPVariable);
        },

        pendingNetworkServices() {
            return planDefaultExternalNetwork(this.jsonConfig, this.stackDefaults.defaultExternalNetwork);
        },

        /**
         * Get the stack from the global stack list, because it may contain more real-time data like status
         * @return {*}
         */
        globalStack() {
            return this.$root.completeStackList[this.stack.name + "_" + this.endpoint];
        },

        status() {
            return this.globalStack?.status;
        },

        active() {
            return this.status === RUNNING;
        },

        terminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getComposeTerminalName(this.endpoint, this.stack.name);
        },

        combinedTerminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getCombinedTerminalName(this.endpoint, this.stack.name);
        },

        networks() {
            return this.jsonConfig.networks;
        },

        endpoint() {
            return this.stack.endpoint || this.$route.params.endpoint || "";
        },

        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
    },
    watch: {
        "stack.composeYAML": {
            handler() {
                if (this.editorFocus) {
                    console.debug("yaml code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        "stack.composeENV": {
            handler() {
                if (this.editorFocus) {
                    console.debug("env code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        jsonConfig: {
            handler() {
                if (!this.editorFocus) {
                    console.debug("jsonConfig changed");

                    let doc = new Document(this.jsonConfig);

                    // Stick back the yaml comments
                    if (this.yamlDoc) {
                        copyYAMLComments(doc, this.yamlDoc);
                    }

                    this.stack.composeYAML = doc.toString();
                    this.yamlDoc = doc;
                }
            },
            deep: true,
        },

        $route(to, from) {

        }
    },
    async mounted() {
        this.stackDefaults = await this.getStackDefaults();

        if (this.isAdd) {
            this.processing = false;
            this.isEditMode = true;

            let composeYAML;
            let composeENV;

            if (this.$root.composeTemplate) {
                composeYAML = this.$root.composeTemplate;
                this.$root.composeTemplate = "";
            } else {
                composeYAML = this.stackDefaults.defaultExternalNetwork ? homelabTemplate : template;
            }
            if (this.$root.envTemplate) {
                composeENV = this.$root.envTemplate;
                this.$root.envTemplate = "";
            } else {
                composeENV = envDefault;
            }

            // Default Values
            this.stack = {
                name: "",
                composeYAML,
                composeENV,
                isManagedByDockge: true,
                endpoint: "",
            };

            this.yamlCodeChange();
            // Only seeds the starter template; pasted content is left untouched
            // until the user applies the preset explicitly.
            this.applyPresetToDocument(
                doc => applyDefaultExternalNetworkToDoc(doc, this.stackDefaults.defaultExternalNetwork)
            );

        } else {
            this.stack.name = this.$route.params.stackName;
            this.loadStack();
        }

        this.requestServiceStatus();
        this.requestDockerStats();
    },
    unmounted() {

    },
    methods: {
        getStackDefaults() {
            return new Promise((resolve) => {
                this.$root.emitAgent(this.endpoint, "getStackDefaults", (res) => {
                    if (res?.ok && res.defaults) {
                        resolve(res.defaults);
                    } else {
                        if (res) {
                            this.$root.toastRes(res);
                        }
                        resolve({
                            defaultExternalNetwork: "",
                            publishedHostIPVariable: "TS_HOST_IP",
                            publishedHostIPValue: "",
                            publishedPortStart: 20000,
                            publishedPortEnd: 39999,
                        });
                    }
                });
            });
        },

        ensureDefaultExternalNetworkForService(service) {
            const networkName = this.stackDefaults.defaultExternalNetwork;
            if (!networkName || service.network_mode) {
                return;
            }

            if (!this.jsonConfig.networks || Array.isArray(this.jsonConfig.networks)) {
                this.jsonConfig.networks = {};
            }
            if (!Object.hasOwn(this.jsonConfig.networks, networkName)) {
                this.jsonConfig.networks[networkName] = {
                    external: true,
                };
            }

            if (!service.networks) {
                service.networks = [ networkName ];
            } else if (Array.isArray(service.networks)) {
                if (!service.networks.includes(networkName)) {
                    service.networks.push(networkName);
                }
            } else if (typeof service.networks === "object" && !Object.hasOwn(service.networks, networkName)) {
                service.networks[networkName] = {};
            }
        },

        /**
         * Run a preset against the YAML document itself, then push the result
         * back into the editor. Going through the document rather than
         * `jsonConfig` keeps the pasted file's comments, key order and quoting.
         */
        applyPresetToDocument(mutate) {
            let doc;
            try {
                doc = parseDocument(this.stack.composeYAML);
                if (doc.errors.length > 0) {
                    throw doc.errors[0];
                }
            } catch (e) {
                this.$root.toastError(e.message || String(e));
                return 0;
            }

            const changed = mutate(doc);
            if (changed > 0) {
                this.stack.composeYAML = doc.toString();
                this.yamlCodeChange();
            }
            return changed;
        },

        applyNetworkPreset() {
            const attached = this.applyPresetToDocument(
                doc => applyDefaultExternalNetworkToDoc(doc, this.stackDefaults.defaultExternalNetwork)
            );
            if (attached > 0) {
                this.$root.toastSuccess(this.$t("networkPresetApplied", [ attached ]));
            }
        },

        collectCurrentEditorPorts() {
            const ports = [];
            for (const config of [ this.jsonConfig, this.envsubstJSONConfig ]) {
                for (const service of Object.values(config.services ?? {})) {
                    if (service && typeof service === "object" && Array.isArray(service.ports)) {
                        ports.push(...service.ports);
                    }
                }
            }
            return ports;
        },

        applyPortPreset() {
            const plan = this.portPreset;
            if (plan.rewritable.length === 0) {
                return;
            }

            const requests = plan.rewritable.map(entry => ({
                serviceName: entry.serviceName,
                index: entry.index,
                targetPort: Number(entry.target),
                protocol: entry.protocol,
            }));

            this.allocatingPorts = true;
            this.$root.emitAgent(
                this.endpoint,
                "allocatePublishedPorts",
                requests,
                this.collectCurrentEditorPorts(),
                (res) => {
                    this.allocatingPorts = false;
                    if (!res?.ok || !Array.isArray(res.allocations)) {
                        if (res) {
                            this.$root.toastRes(res);
                        }
                        return;
                    }

                    const changed = this.applyPresetToDocument(
                        doc => applyPortRewritesToDoc(
                            doc,
                            plan,
                            res.allocations,
                            this.stackDefaults.publishedHostIPVariable
                        )
                    );
                    if (changed > 0) {
                        this.$root.toastSuccess(this.$t("portPresetApplied", [ changed ]));
                    }
                }
            );
        },

        startServiceStatusTimeout() {
            clearTimeout(serviceStatusTimeout);
            serviceStatusTimeout = setTimeout(async () => {
                this.requestServiceStatus();
            }, 5000);
        },

        startDockerStatsTimeout() {
            clearTimeout(dockerStatsTimeout);
            dockerStatsTimeout = setTimeout(async () => {
                this.requestDockerStats();
            }, 5000);
        },

        requestServiceStatus() {
            // Do not request if it is add mode
            if (this.isAdd) {
                return;
            }

            this.$root.emitAgent(this.endpoint, "serviceStatusList", this.stack.name, (res) => {
                if (res.ok) {
                    this.serviceStatusList = res.serviceStatusList;
                }
                if (!this.stopServiceStatusTimeout) {
                    this.startServiceStatusTimeout();
                }
            });
        },

        requestDockerStats() {
            this.$root.emitAgent(this.endpoint, "dockerStats", (res) => {
                if (res.ok) {
                    this.dockerStats = res.dockerStats;
                }
                if (!this.stopDockerStatsTimeout) {
                    this.startDockerStatsTimeout();
                }
            });
        },

        exitConfirm(next) {
            if (this.isEditMode) {
                if (confirm(this.$t("confirmLeaveStack"))) {
                    this.exitAction();
                    next();
                } else {
                    next(false);
                }
            } else {
                this.exitAction();
                next();
            }
        },

        exitAction() {
            console.log("exitAction");
            this.stopServiceStatusTimeout = true;
            this.stopDockerStatsTimeout = true;
            clearTimeout(serviceStatusTimeout);
            clearTimeout(dockerStatsTimeout);

            // Leave Combined Terminal
            console.debug("leaveCombinedTerminal", this.endpoint, this.stack.name);
            this.$root.emitAgent(this.endpoint, "leaveCombinedTerminal", this.stack.name, () => {});
        },

        bindTerminal() {
            this.$refs.progressTerminal?.bind(this.endpoint, this.terminalName);
        },

        loadStack() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "getStack", this.stack.name, (res) => {
                if (res.ok) {
                    this.stack = res.stack;
                    this.yamlCodeChange();
                    this.processing = false;
                    this.bindTerminal();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        deployStack() {
            this.processing = true;

            if (!this.jsonConfig.services) {
                this.$root.toastError("No services found in compose.yaml");
                this.processing = false;
                return;
            }

            // Check if services is object
            if (typeof this.jsonConfig.services !== "object") {
                this.$root.toastError("Services must be an object");
                this.processing = false;
                return;
            }

            let serviceNameList = Object.keys(this.jsonConfig.services);

            // Set the stack name if empty, use the first container name
            if (!this.stack.name && serviceNameList.length > 0) {
                let serviceName = serviceNameList[0];
                let service = this.jsonConfig.services[serviceName];

                if (service && service.container_name) {
                    this.stack.name = service.container_name;
                } else {
                    this.stack.name = serviceName;
                }
            }

            this.bindTerminal();

            this.$root.emitAgent(this.stack.endpoint, "deployStack", this.stack.name, this.stack.composeYAML, this.stack.composeENV, this.isAdd, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        saveStack() {
            this.processing = true;

            this.$root.emitAgent(this.stack.endpoint, "saveStack", this.stack.name, this.stack.composeYAML, this.stack.composeENV, this.isAdd, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        startStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "startStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        stopStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "stopStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        downStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "downStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        restartStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "restartStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        updateStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "updateStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        gitPullAndBuildStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "gitPullAndBuildStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        deleteDialog() {
            this.$root.emitAgent(this.endpoint, "deleteStack", this.stack.name, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.$router.push("/");
                }
            });
        },

        discardStack() {
            this.loadStack();
            this.isEditMode = false;
        },

        yamlToJSON(yaml) {
            let doc = parseDocument(yaml);
            if (doc.errors.length > 0) {
                throw doc.errors[0];
            }

            const config = doc.toJS() ?? {};

            // Check data types
            // "services" must be an object
            if (!config.services) {
                config.services = {};
            }

            if (Array.isArray(config.services) || typeof config.services !== "object") {
                throw new Error("Services must be an object");
            }

            return {
                config,
                doc,
            };
        },

        yamlCodeChange() {
            try {
                let { config, doc } = this.yamlToJSON(this.stack.composeYAML);

                this.yamlDoc = doc;
                this.jsonConfig = config;

                const env = {};
                if (this.stackDefaults.publishedHostIPValue) {
                    env[this.stackDefaults.publishedHostIPVariable] = this.stackDefaults.publishedHostIPValue;
                }
                Object.assign(env, dotenv.parse(this.stack.composeENV));
                const hostIPVariable = this.stackDefaults.publishedHostIPVariable;
                let composeYAMLForPreview = this.stack.composeYAML;
                if (env[hostIPVariable]) {
                    composeYAMLForPreview = resolveRequiredEnvironmentVariable(
                        composeYAMLForPreview,
                        hostIPVariable,
                        env[hostIPVariable]
                    );
                }
                let envYAML = envsubstYAML(composeYAMLForPreview, env);
                this.envsubstJSONConfig = this.yamlToJSON(envYAML).config;

                clearTimeout(yamlErrorTimeout);
                this.yamlError = "";
            } catch (e) {
                clearTimeout(yamlErrorTimeout);

                if (this.yamlError) {
                    this.yamlError = e.message;

                } else {
                    yamlErrorTimeout = setTimeout(() => {
                        this.yamlError = e.message;
                    }, 3000);
                }
            }
        },

        enableEditMode() {
            this.isEditMode = true;
        },

        checkYAML() {

        },

        addContainer() {
            this.checkYAML();

            if (this.jsonConfig.services[this.newContainerName]) {
                this.$root.toastError("Container name already exists");
                return;
            }

            if (!this.newContainerName) {
                this.$root.toastError("Container name cannot be empty");
                return;
            }

            const newService = {
                restart: "unless-stopped",
            };
            this.ensureDefaultExternalNetworkForService(newService);
            this.jsonConfig.services[this.newContainerName] = newService;
            this.newContainerName = "";
            let element = this.$refs.containerList.lastElementChild;
            element.scrollIntoView({
                block: "start",
                behavior: "smooth"
            });
        },

        stackNameToLowercase() {
            this.stack.name = this.stack?.name?.toLowerCase();
        },

        startService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "startService", this.stack.name, serviceName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },

        stopService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "stopService", this.stack.name, serviceName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },

        restartService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "restartService", this.stack.name, serviceName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },
    }
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";
@import "../styles/design-tokens.scss";

// ============================================
// Modern Compose Page Styles
// ============================================

h1 {
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: 600;
    letter-spacing: var(--tracking-tight);
    margin-bottom: var(--space-6);
    background: linear-gradient(135deg, $accent-primary 0%, $accent-support 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

h4 {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    color: $text-primary;
    margin-bottom: var(--space-4);
    letter-spacing: var(--tracking-tight);
}

// Enhanced shadow-box
.shadow-box {
    background: $surface-raised;
    border: 1px solid $border-subtle;
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    box-shadow: var(--shadow-base);
    transition: all var(--transition-base);

    &:hover {
        border-color: $border-default;
        box-shadow: var(--shadow-md);
    }

    &.big-padding {
        padding: var(--space-8);
    }
}

// Button enhancements
.btn {
    border-radius: var(--radius-pill);
    font-weight: 500;
    padding: var(--space-3) var(--space-5);
    transition: all var(--transition-fast);
    border: none;

    &.btn-primary {
        background: $accent-primary;
        color: $surface-deepest;
        box-shadow: var(--glow-cyan);

        &:hover:not(:disabled) {
            background: $accent-primary-hover;
            box-shadow: 0 0 30px rgba(56, 189, 248, 0.5);
            transform: translateY(-1px);
        }

        &:active {
            transform: translateY(0);
        }
    }

    &.btn-secondary {
        background: $surface-elevated;
        color: $text-primary;
        border: 1px solid $border-default;

        &:hover:not(:disabled) {
            background: $surface-raised;
            border-color: $border-strong;
        }
    }

    &.btn-normal {
        background: $surface-elevated;
        color: $text-secondary;
        border: 1px solid $border-subtle;

        &:hover:not(:disabled) {
            background: $surface-raised;
            color: $text-primary;
            border-color: $border-default;
        }
    }

    &.btn-danger {
        background: $accent-danger;
        color: white;

        &:hover:not(:disabled) {
            background: darken($accent-danger, 5%);
            box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
        }
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

// Form enhancements
.form-control, .form-select {
    background: $surface-elevated;
    border: 1px solid $border-default;
    border-radius: var(--radius-lg);
    color: $text-primary;
    padding: var(--space-3) var(--space-4);
    transition: all var(--transition-fast);
    font-size: var(--text-base);

    &::placeholder {
        color: $text-muted;
    }

    &:focus {
        background: $surface-raised;
        border-color: $accent-primary;
        box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.1);
        outline: none;
    }
}

.form-label {
    color: $text-secondary;
    font-weight: 500;
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
}

.form-text {
    color: $text-muted;
    font-size: var(--text-xs);
    margin-top: var(--space-2);
}

// Input group
.input-group {
    display: flex;
    gap: var(--space-2);

    .form-control {
        flex: 1;
        border-radius: var(--radius-lg);
    }

    .btn {
        border-radius: var(--radius-pill);
    }
}

// Terminal styling
.terminal {
    height: 200px;
    background: $surface-deep;
    border: 1px solid $border-subtle;
    border-radius: var(--radius-xl);
    padding: var(--space-4);
    font-family: var(--font-mono);
    box-shadow: var(--shadow-base);
}

// Editor box
.editor-box {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    background: $surface-deep;
    border: 1px solid $border-subtle;
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: var(--shadow-base);
    transition: all var(--transition-base);

    &.edit-mode {
        border-color: $accent-primary;
        box-shadow: var(--glow-cyan);
    }

    &:hover {
        border-color: $border-default;
    }
}

// Paste area
.paste-area {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    background: $surface-elevated;
    border: 2px dashed $border-default;
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    min-height: 200px;
    color: $text-secondary;
    transition: all var(--transition-base);

    &:focus-within {
        border-color: $accent-primary;
        border-style: solid;
        box-shadow: var(--glow-cyan);
        background: $surface-raised;
    }

    &:hover {
        border-color: $border-strong;
        background: $surface-raised;
    }
}

// Preset list
.preset-list {
    font-size: var(--text-sm);
    list-style: none;
    margin-bottom: 0;
    padding-left: 0;

    li {
        padding: var(--space-2) 0;
        color: $text-secondary;
        transition: color var(--transition-fast);

        &:hover {
            color: $text-primary;
        }
    }
}

// Agent name badge
.agent-name {
    display: inline-flex;
    align-items: center;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    font-weight: 500;
    color: $text-muted;
    background: $surface-elevated;
    border-radius: var(--radius-pill);
    margin-left: var(--space-3);
}

// Button group
.btn-group {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;

    .btn {
        border-radius: var(--radius-pill) !important;
    }
}

// Container list styling
div[ref="containerList"] {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

// Animations
@keyframes slideInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.slide-fade-enter-active {
    animation: slideInUp var(--transition-slow);
}

// Responsive adjustments
@media (max-width: 992px) {
    .btn-group {
        width: 100%;

        .btn {
            flex: 1;
            min-width: auto;
        }
    }
}
</style>
