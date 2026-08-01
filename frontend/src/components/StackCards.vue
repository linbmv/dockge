<template>
    <section class="stack-board" aria-label="Docker Compose stacks">
        <div class="stack-board-header">
            <div>
                <span class="board-kicker">STACK CONTROL</span>
                <h1>Compose stacks</h1>
                <p>Manage lifecycle and configuration directly from each Stack card.</p>
            </div>
            <router-link to="/compose" class="btn btn-primary btn-sm">
                <font-awesome-icon icon="plus" class="me-1" />
                {{ $t("compose") }}
            </router-link>
        </div>

        <div class="stack-board-toolbar">
            <div class="stack-search">
                <font-awesome-icon icon="search" />
                <input v-model="searchText" type="search" :placeholder="$t('Search...')" autocomplete="off" />
                <button v-if="searchText" type="button" aria-label="Clear search" @click="searchText = ''">
                    <font-awesome-icon icon="times" />
                </button>
            </div>

            <div class="stack-filters" role="group" aria-label="Stack status filter">
                <button
                    v-for="filter in filters"
                    :key="filter.value"
                    type="button"
                    class="stack-filter"
                    :class="[{ active: statusFilter === filter.value }, `filter-${filter.value}`]"
                    @click="statusFilter = filter.value"
                >
                    <span v-if="filter.value !== 'all'" class="filter-dot"></span>
                    {{ filter.label }}
                    <strong>{{ filter.count }}</strong>
                </button>
            </div>
        </div>

        <div v-if="stacks.length > 0" class="stack-list">
            <article
                v-for="stack in stacks"
                :key="stack.name + '_' + (stack.endpoint || 'current')"
                class="stack-card"
                :class="[`status-${statusName(stack)}`, { unmanaged: !stack.isManagedByDockge }]"
            >
                <div class="stack-card-main">
                    <div class="stack-identity">
                        <div class="stack-name-row">
                            <router-link :to="stackUrl(stack)" class="stack-card-name">
                                {{ stack.name }} <font-awesome-icon icon="chevron-circle-right" />
                            </router-link>
                            <span class="stack-state"><span class="state-dot"></span>{{ $t(statusName(stack)) }}</span>
                        </div>
                        <div class="stack-runtime">
                            <Uptime :stack="stack" :fixed-width="true" />
                            <span v-if="stack.isGitRepository" class="stack-git"><font-awesome-icon icon="wrench" /> GIT</span>
                            <span v-if="$root.agentCount > 1" class="stack-endpoint">{{ endpointLabel(stack) }}</span>
                            <span v-if="!stack.isManagedByDockge" class="stack-unmanaged">UNMANAGED</span>
                        </div>
                    </div>

                    <div
                        v-for="summary in [runtimeSummary(stack)]"
                        :key="summary.key"
                        class="stack-telemetry"
                        :class="{ loading: !summary.loaded }"
                    >
                        <span class="telemetry-live"><span></span> LIVE</span>
                        <div class="telemetry-item telemetry-containers">
                            <font-awesome-icon icon="boxes-stacked" />
                            <span>
                                <small>CONTAINERS</small>
                                <strong>{{ summary.containers }}</strong>
                            </span>
                        </div>
                        <div class="telemetry-item telemetry-cpu">
                            <font-awesome-icon icon="microchip" />
                            <span>
                                <small>CPU</small>
                                <strong>{{ summary.cpu }}</strong>
                            </span>
                        </div>
                        <div class="telemetry-item telemetry-memory">
                            <font-awesome-icon icon="memory" />
                            <span>
                                <small>MEMORY</small>
                                <strong>{{ summary.memory }}</strong>
                            </span>
                        </div>
                        <div class="telemetry-item telemetry-ports" :title="summary.portTitle">
                            <font-awesome-icon icon="network-wired" />
                            <span>
                                <small>PORTS</small>
                                <strong>{{ summary.ports }}</strong>
                            </span>
                        </div>
                    </div>
                    <span v-if="isProcessing(stack)" class="stack-processing">
                        <font-awesome-icon icon="spinner" spin /> PROCESSING
                    </span>
                </div>

                <div class="stack-card-actions">
                    <div class="action-group">
                        <button
                            type="button"
                            class="btn btn-xs stack-action action-edit"
                            :disabled="isProcessing(stack) || !canEdit(stack)"
                            :title="canEdit(stack) ? $t('editStack') : $t('stopBeforeEditing')"
                            @click="openEditor(stack)"
                        >
                            <font-awesome-icon icon="pen" /> {{ $t("editStack") }}
                        </button>
                        <button
                            v-if="canOpenBash(stack)"
                            type="button"
                            class="btn btn-xs stack-action action-console"
                            :disabled="isProcessing(stack)"
                            @click="openBashTerminal(stack)"
                        >
                            <font-awesome-icon icon="terminal" /> Bash
                        </button>
                        <button
                            type="button"
                            class="btn btn-xs stack-action action-console"
                            :disabled="isProcessing(stack) || !stack.isManagedByDockge"
                            @click="openCombinedTerminal(stack)"
                        >
                            <font-awesome-icon icon="terminal" /> {{ $t("terminal") }}
                        </button>
                        <button
                            v-if="!isActive(stack)"
                            type="button"
                            class="btn btn-xs stack-action action-start"
                            :disabled="isProcessing(stack) || !stack.isManagedByDockge"
                            @click="runStackAction(stack, 'startStack')"
                        >
                            <font-awesome-icon icon="play" /> {{ $t("startStack") }}
                        </button>
                        <button
                            v-else
                            type="button"
                            class="btn btn-xs stack-action action-restart"
                            :disabled="isProcessing(stack) || !stack.isManagedByDockge"
                            @click="runStackAction(stack, 'restartStack')"
                        >
                            <font-awesome-icon icon="rotate" /> {{ $t("restartStack") }}
                        </button>
                        <button type="button" class="btn btn-xs stack-action action-update" :disabled="isProcessing(stack) || !stack.isManagedByDockge" @click="runStackAction(stack, 'updateStack')">
                            <font-awesome-icon icon="cloud-arrow-down" /> {{ $t("updateStack") }}
                        </button>
                        <button v-if="stack.isGitRepository" type="button" class="btn btn-xs stack-action action-build" :disabled="isProcessing(stack)" @click="runStackAction(stack, 'gitPullAndBuildStack')">
                            <font-awesome-icon icon="wrench" /> {{ $t("gitPullAndBuildStack") }}
                        </button>
                        <button v-if="isActive(stack)" type="button" class="btn btn-xs stack-action action-stop" :disabled="isProcessing(stack)" @click="runStackAction(stack, 'stopStack')">
                            <font-awesome-icon icon="pause" /> {{ $t("stopStack") }}
                        </button>
                        <button type="button" class="btn btn-xs stack-action action-down" :disabled="isProcessing(stack) || !stack.isManagedByDockge" @click="runStackAction(stack, 'downStack')">
                            <font-awesome-icon icon="stop" /> {{ $t("downStack") }}
                        </button>
                    </div>

                    <div class="action-group action-group-right">
                        <button type="button" class="btn btn-xs stack-action action-delete" :disabled="isProcessing(stack) || !stack.isManagedByDockge" @click="deleteStack(stack)">
                            <font-awesome-icon icon="trash" /> {{ $t("deleteStack") }}
                        </button>
                    </div>
                </div>
            </article>
        </div>

        <div v-else class="stack-empty">
            <span class="empty-mark">//</span>
            <strong>No stacks match the current filter.</strong>
            <span>Try another search or create a new Compose stack.</span>
        </div>

        <Teleport to="body">
            <div v-if="editingStack" class="stack-editor-backdrop" @click.self="closeEditor">
                <section class="stack-editor-dialog" role="dialog" aria-modal="true" :aria-label="$t('editStack')">
                    <header class="stack-editor-header">
                        <div>
                            <span>STACK / EDIT</span>
                            <h2>{{ editingStack.name }}</h2>
                        </div>
                        <button type="button" :aria-label="$t('cancel')" @click="closeEditor"><font-awesome-icon icon="times" /></button>
                    </header>

                    <div class="stack-editor-tabs" role="tablist">
                        <button type="button" :class="{ active: editorTab === 'compose' }" @click="editorTab = 'compose'">
                            {{ editingStack.composeFileName || $t("composeFile") }}
                        </button>
                        <button type="button" :class="{ active: editorTab === 'env' }" @click="editorTab = 'env'">
                            .env
                        </button>
                    </div>

                    <div class="stack-editor-body">
                        <code-mirror
                            v-if="editorTab === 'compose'"
                            v-model="editingStack.composeYAML"
                            :extensions="yamlExtensions"
                            :placeholder="$t('composeEditorPlaceholder')"
                            minimal
                            wrap="true"
                            dark="true"
                            tab="true"
                        />
                        <code-mirror
                            v-else
                            v-model="editingStack.composeENV"
                            :extensions="envExtensions"
                            :placeholder="$t('envEditorPlaceholder')"
                            minimal
                            wrap="true"
                            dark="true"
                            tab="true"
                        />
                    </div>

                    <footer class="stack-editor-footer">
                        <span :class="{ dirty: editorHasUnsavedChanges }">
                            <span class="editor-state-dot"></span>
                            {{ editorHasUnsavedChanges ? $t("unsavedChanges") : $t("noUnsavedChanges") }}
                        </span>
                        <div>
                            <button type="button" class="btn btn-normal btn-sm" :disabled="editorProcessing" @click="closeEditor">
                                {{ $t("discardStack") }}<span v-if="editorHasUnsavedChanges">*</span>
                            </button>
                            <button type="button" class="btn btn-normal btn-sm" :disabled="editorProcessing || !editorHasUnsavedChanges" @click="submitEditor(false)">
                                <font-awesome-icon icon="save" /> {{ $t("saveStackDraft") }}
                            </button>
                            <button type="button" class="btn btn-primary btn-sm" :disabled="editorProcessing" @click="submitEditor(true)">
                                <font-awesome-icon icon="rocket" /> {{ $t("deployStack") }}
                            </button>
                        </div>
                    </footer>
                </section>
            </div>

            <div v-if="terminalDialog" class="stack-editor-backdrop" @click.self="closeTerminalDialog">
                <section class="stack-editor-dialog terminal-dialog" role="dialog" aria-modal="true" :aria-label="$t('terminal')">
                    <header class="stack-editor-header">
                        <div>
                            <span>{{ terminalDialog.mode === "combined" ? "STACK / TERMINAL" : "STACK / BASH" }}</span>
                            <h2>{{ terminalDialog.stackName }}</h2>
                        </div>
                        <button type="button" :aria-label="$t('cancel')" @click="closeTerminalDialog"><font-awesome-icon icon="times" /></button>
                    </header>
                    <div class="card-terminal-wrap">
                        <div v-if="terminalDialog.mode === 'service-select'" class="service-picker">
                            <span>{{ $t("selectBashService") }}</span>
                            <button
                                v-for="serviceName in terminalDialog.serviceNames"
                                :key="serviceName"
                                type="button"
                                class="btn btn-normal"
                                @click="selectBashService(serviceName)"
                            >
                                <font-awesome-icon icon="terminal" /> {{ serviceName }}
                            </button>
                        </div>
                        <Terminal
                            v-else-if="terminalDialog.mode === 'interactive'"
                            class="card-terminal"
                            :rows="20"
                            mode="interactive"
                            :name="cardTerminalName"
                            :endpoint="terminalDialog.endpoint"
                            :stack-name="terminalDialog.stackName"
                            :service-name="terminalDialog.serviceName"
                            shell="bash"
                        />
                        <Terminal
                            v-else
                            class="card-terminal"
                            :rows="combinedTerminalRows"
                            :cols="combinedTerminalCols"
                            :name="cardTerminalName"
                            :endpoint="terminalDialog.endpoint"
                        />
                    </div>
                    <footer class="terminal-dialog-footer">ESC · {{ $t("closeAndReturn") }}</footer>
                </section>
            </div>
        </Teleport>
    </section>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { yaml } from "@codemirror/lang-yaml";
import { python } from "@codemirror/lang-python";
import { lineNumbers } from "@codemirror/view";
import { dracula as editorTheme } from "thememirror";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import {
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    getCombinedTerminalName,
    getContainerExecTerminalName,
    statusNameShort
} from "../../../common/util-common";
import Terminal from "./Terminal.vue";
import Uptime from "./Uptime.vue";

export default {
    components: {
        CodeMirror,
        FontAwesomeIcon,
        Terminal,
        Uptime,
    },
    setup() {
        return {
            yamlExtensions: [ editorTheme, yaml(), lineNumbers() ],
            envExtensions: [ editorTheme, python(), lineNumbers() ],
        };
    },
    data() {
        return {
            searchText: "",
            statusFilter: "all",
            processingStackKey: "",
            editingStack: null,
            editingEndpoint: "",
            editorSnapshot: null,
            editorTab: "compose",
            editorProcessing: false,
            terminalDialog: null,
            combinedTerminalRows: COMBINED_TERMINAL_ROWS,
            combinedTerminalCols: COMBINED_TERMINAL_COLS,
            serviceStatusByStack: {},
            dockerStatsByEndpoint: {},
            runtimeRefreshTimer: null,
            runtimeRefreshInFlight: false,
            runtimeDisposed: false,
        };
    },
    computed: {
        allStacks() {
            return Object.values(this.$root.completeStackList);
        },
        filters() {
            return [
                {
                    value: "all",
                    label: "All",
                    count: this.allStacks.length,
                },
                {
                    value: "active",
                    label: this.$t("active"),
                    count: this.countByStatus("active"),
                },
                {
                    value: "exited",
                    label: this.$t("exited"),
                    count: this.countByStatus("exited"),
                },
                {
                    value: "inactive",
                    label: this.$t("inactive"),
                    count: this.countByStatus("inactive"),
                },
            ];
        },
        stacks() {
            const query = this.searchText.trim().toLowerCase();
            return this.allStacks.filter(stack => {
                const status = statusNameShort(stack.status);
                const matchesStatus = this.statusFilter === "all" || status === this.statusFilter;
                const matchesSearch = !query
                    || stack.name.toLowerCase().includes(query)
                    || (stack.composeFileName || "").toLowerCase().includes(query)
                    || (stack.endpoint || "").toLowerCase().includes(query);
                return matchesStatus && matchesSearch;
            }).sort((a, b) => {
                const order = {
                    active: 0,
                    exited: 1,
                    inactive: 2,
                };
                const statusOrder = (order[statusNameShort(a.status)] ?? 3) - (order[statusNameShort(b.status)] ?? 3);
                return statusOrder || a.name.localeCompare(b.name);
            });
        },
        stackRuntimeSignature() {
            return this.allStacks.map(stack => this.stackKey(stack)).sort().join("|");
        },
        editorHasUnsavedChanges() {
            if (!this.editingStack || !this.editorSnapshot) {
                return false;
            }
            return (this.editingStack.composeYAML || "") !== this.editorSnapshot.composeYAML
                || (this.editingStack.composeENV || "") !== this.editorSnapshot.composeENV;
        },
        cardTerminalName() {
            if (!this.terminalDialog) {
                return "";
            }
            if (this.terminalDialog.mode === "interactive") {
                return getContainerExecTerminalName(
                    this.terminalDialog.endpoint,
                    this.terminalDialog.stackName,
                    this.terminalDialog.serviceName,
                    0
                );
            }
            return getCombinedTerminalName(this.terminalDialog.endpoint, this.terminalDialog.stackName);
        },
    },
    watch: {
        stackRuntimeSignature() {
            this.refreshRuntimeData();
        },
    },
    mounted() {
        window.addEventListener("keydown", this.handleEscapeKey, true);
        this.refreshRuntimeData();
        this.runtimeRefreshTimer = window.setInterval(() => this.refreshRuntimeData(), 10000);
    },
    beforeUnmount() {
        this.runtimeDisposed = true;
        window.clearInterval(this.runtimeRefreshTimer);
        window.removeEventListener("keydown", this.handleEscapeKey, true);
        this.leaveEditorTerminal();
        this.closeTerminalDialog();
    },
    methods: {
        countByStatus(status) {
            return this.allStacks.filter(stack => statusNameShort(stack.status) === status).length;
        },
        statusName(stack) {
            return statusNameShort(stack.status);
        },
        isActive(stack) {
            return this.statusName(stack) === "active";
        },
        canEdit(stack) {
            return stack.isManagedByDockge && !this.isActive(stack);
        },
        canOpenBash(stack) {
            return stack.isManagedByDockge && this.isActive(stack) && stack.serviceNames?.length > 0;
        },
        endpointLabel(stack) {
            return stack.endpoint || "LOCAL HOST";
        },
        stackUrl(stack) {
            return stack.endpoint ? `/compose/${stack.name}/${stack.endpoint}` : `/compose/${stack.name}`;
        },
        stackKey(stack) {
            return `${stack.endpoint || "local"}:${stack.name}`;
        },
        isProcessing(stack) {
            return this.processingStackKey === this.stackKey(stack);
        },
        requestStackStatus(stack) {
            return new Promise((resolve) => {
                let completed = false;
                const finish = (res) => {
                    if (completed) {
                        return;
                    }
                    completed = true;
                    window.clearTimeout(timeout);
                    resolve(res?.ok ? res.serviceStatusList : null);
                };
                const timeout = window.setTimeout(() => finish(null), 8000);
                try {
                    this.$root.emitAgent(stack.endpoint || "", "serviceStatusList", stack.name, finish);
                } catch {
                    finish(null);
                }
            });
        },
        requestEndpointStats(endpoint) {
            return new Promise((resolve) => {
                let completed = false;
                const finish = (res) => {
                    if (completed) {
                        return;
                    }
                    completed = true;
                    window.clearTimeout(timeout);
                    resolve(res?.ok ? res.dockerStats : null);
                };
                const timeout = window.setTimeout(() => finish(null), 8000);
                try {
                    this.$root.emitAgent(endpoint, "dockerStats", finish);
                } catch {
                    finish(null);
                }
            });
        },
        async refreshRuntimeData() {
            if (this.runtimeRefreshInFlight || this.runtimeDisposed) {
                return;
            }
            const stacks = this.allStacks.filter(stack => stack.isManagedByDockge);
            if (stacks.length === 0) {
                return;
            }

            this.runtimeRefreshInFlight = true;
            try {
                const endpoints = [ ...new Set(stacks.map(stack => stack.endpoint || "")) ];
                const [ statusResults, statsResults ] = await Promise.all([
                    Promise.all(stacks.map(async stack => [ this.stackKey(stack), await this.requestStackStatus(stack) ])),
                    Promise.all(endpoints.map(async endpoint => [ endpoint || "local", await this.requestEndpointStats(endpoint) ])),
                ]);
                if (this.runtimeDisposed) {
                    return;
                }
                this.serviceStatusByStack = Object.fromEntries(statusResults.filter(([ , value ]) => value !== null));
                this.dockerStatsByEndpoint = Object.fromEntries(statsResults.filter(([ , value ]) => value !== null));
            } finally {
                this.runtimeRefreshInFlight = false;
            }
        },
        runtimeSummary(stack) {
            const key = this.stackKey(stack);
            if (!stack.isManagedByDockge) {
                return {
                    key: `runtime-${key}`,
                    loaded: false,
                    containers: "—",
                    cpu: "—",
                    memory: "—",
                    ports: "—",
                    portTitle: "",
                };
            }
            const statusList = this.serviceStatusByStack[key];
            const statuses = statusList ? Object.values(statusList).flat() : [];
            const running = statuses.filter(status => [ "running", "healthy", "unhealthy" ].includes(String(status?.status).toLowerCase())).length;
            const total = Math.max(statuses.length, stack.serviceNames?.length || 0);
            const endpointStats = this.dockerStatsByEndpoint[stack.endpoint || "local"] || {};
            const stats = statuses.map(status => endpointStats[status?.name]).filter(Boolean);
            const cpuTotal = stats.reduce((totalCPU, stat) => totalCPU + this.parsePercentage(stat.CPUPerc), 0);
            const memoryTotal = stats.reduce((totalMemory, stat) => totalMemory + this.parseMemoryUsage(stat.MemUsage), 0);
            const ports = this.extractPublishedPorts(statuses);
            return {
                key: `runtime-${key}`,
                loaded: statusList !== undefined,
                containers: `${running} / ${total}`,
                cpu: stats.length > 0 ? `${cpuTotal.toFixed(cpuTotal < 10 ? 1 : 0)}%` : "—",
                memory: stats.length > 0 ? this.formatBytes(memoryTotal) : "—",
                ports: ports.length > 0 ? `${ports.slice(0, 2).join(" · ")}${ports.length > 2 ? ` +${ports.length - 2}` : ""}` : "—",
                portTitle: ports.join(", "),
            };
        },
        parsePercentage(value) {
            const parsed = Number.parseFloat(String(value || "").replace("%", ""));
            return Number.isFinite(parsed) ? parsed : 0;
        },
        parseMemoryUsage(value) {
            const match = String(value || "").split("/")[0].trim().match(/^([\d.]+)\s*([kmgt]?i?b)$/i);
            if (!match) {
                return 0;
            }
            const units = {
                b: 1,
                kb: 1000,
                mb: 1000 ** 2,
                gb: 1000 ** 3,
                tb: 1000 ** 4,
                kib: 1024,
                mib: 1024 ** 2,
                gib: 1024 ** 3,
                tib: 1024 ** 4,
            };
            return Number.parseFloat(match[1]) * (units[match[2].toLowerCase()] || 1);
        },
        formatBytes(bytes) {
            if (!Number.isFinite(bytes) || bytes <= 0) {
                return "0 B";
            }
            const units = [ "B", "KiB", "MiB", "GiB", "TiB" ];
            const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
            const value = bytes / (1024 ** unitIndex);
            return `${value.toFixed(value < 10 && unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
        },
        extractPublishedPorts(statuses) {
            const ports = new Set();
            for (const status of statuses) {
                if (Array.isArray(status?.publishers)) {
                    for (const publisher of status.publishers) {
                        const port = Number(publisher?.PublishedPort ?? publisher?.publishedPort);
                        if (Number.isInteger(port) && port > 0) {
                            const protocol = String(publisher?.Protocol ?? publisher?.protocol ?? "tcp").toUpperCase();
                            ports.add(`${port}/${protocol}`);
                        }
                    }
                }
                if (typeof status?.ports === "string") {
                    for (const match of status.ports.matchAll(/(?:^|[,:\s])(\d+)->\d+\/(tcp|udp)/gi)) {
                        ports.add(`${match[1]}/${match[2].toUpperCase()}`);
                    }
                }
            }
            return [ ...ports ].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
        },
        runStackAction(stack, eventName) {
            this.processingStackKey = this.stackKey(stack);
            this.$root.emitAgent(stack.endpoint || "", eventName, stack.name, (res) => {
                this.processingStackKey = "";
                this.$root.toastRes(res);
                if (res.ok) {
                    this.refreshRuntimeData();
                }
            });
        },
        deleteStack(stack) {
            if (!confirm(this.$t("deleteStackMsg"))) {
                return;
            }
            this.runStackAction(stack, "deleteStack");
        },
        openBashTerminal(stack) {
            if (!this.canOpenBash(stack)) {
                return;
            }
            this.terminalDialog = {
                mode: stack.serviceNames.length === 1 ? "interactive" : "service-select",
                endpoint: stack.endpoint || "",
                stackName: stack.name,
                serviceName: stack.serviceNames.length === 1 ? stack.serviceNames[0] : "",
                serviceNames: stack.serviceNames,
            };
        },
        selectBashService(serviceName) {
            this.terminalDialog = {
                ...this.terminalDialog,
                mode: "interactive",
                serviceName,
            };
        },
        openCombinedTerminal(stack) {
            this.processingStackKey = this.stackKey(stack);
            this.$root.emitAgent(stack.endpoint || "", "getStack", stack.name, (res) => {
                this.processingStackKey = "";
                if (!res.ok) {
                    this.$root.toastRes(res);
                    return;
                }
                this.terminalDialog = {
                    mode: "combined",
                    endpoint: stack.endpoint || "",
                    stackName: stack.name,
                    serviceName: "",
                };
            });
        },
        closeTerminalDialog() {
            if (this.terminalDialog?.mode === "combined") {
                this.$root.emitAgent(
                    this.terminalDialog.endpoint,
                    "leaveCombinedTerminal",
                    this.terminalDialog.stackName,
                    () => {}
                );
            }
            this.terminalDialog = null;
        },
        handleEscapeKey(event) {
            if (event.key !== "Escape") {
                return;
            }
            if (this.editingStack) {
                event.preventDefault();
                this.closeEditor();
            } else if (this.terminalDialog) {
                event.preventDefault();
                this.closeTerminalDialog();
            }
        },
        openEditor(stack) {
            if (!this.canEdit(stack)) {
                this.$root.toastError(this.$t("stopBeforeEditing"));
                return;
            }
            this.processingStackKey = this.stackKey(stack);
            this.$root.emitAgent(stack.endpoint || "", "getStack", stack.name, (res) => {
                this.processingStackKey = "";
                if (!res.ok) {
                    this.$root.toastRes(res);
                    return;
                }
                this.editingEndpoint = stack.endpoint || "";
                this.editingStack = {
                    ...res.stack,
                    composeYAML: res.stack.composeYAML || "",
                    composeENV: res.stack.composeENV || "",
                };
                this.editorSnapshot = {
                    composeYAML: this.editingStack.composeYAML,
                    composeENV: this.editingStack.composeENV,
                };
                this.editorTab = "compose";
            });
        },
        closeEditor() {
            if (this.editorHasUnsavedChanges && !confirm(this.$t("confirmDiscardStack"))) {
                return;
            }
            this.resetEditor();
        },
        resetEditor() {
            this.leaveEditorTerminal();
            this.editingStack = null;
            this.editingEndpoint = "";
            this.editorSnapshot = null;
            this.editorTab = "compose";
            this.editorProcessing = false;
        },
        leaveEditorTerminal() {
            if (!this.editingStack?.name) {
                return;
            }
            this.$root.emitAgent(this.editingEndpoint, "leaveCombinedTerminal", this.editingStack.name, () => {});
        },
        submitEditor(deploy) {
            if (!this.editingStack) {
                return;
            }
            this.editorProcessing = true;
            const eventName = deploy ? "deployStack" : "saveStack";
            this.$root.emitAgent(
                this.editingEndpoint,
                eventName,
                this.editingStack.name,
                this.editingStack.composeYAML,
                this.editingStack.composeENV,
                false,
                (res) => {
                    this.editorProcessing = false;
                    this.$root.toastRes(res);
                    if (res.ok) {
                        this.resetEditor();
                    }
                }
            );
        },
    },
};
</script>

<style scoped lang="scss">
.stack-board {
    min-width: 0;
    padding: 2px 0 12px;
}

.stack-board-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 13px;

    h1 {
        margin: 2px 0 3px;
        color: #f0f3f6;
        font-size: 1.28rem;
        font-weight: 700;
    }

    p {
        margin: 0;
        color: #718096;
        font-size: 0.74rem;
    }
}

.board-kicker {
    color: #62d9f5;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    letter-spacing: 0.1em;
}

.stack-board-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 11px;
}

.stack-search {
    display: flex;
    align-items: center;
    width: min(100%, 350px);
    min-width: 210px;
    height: 32px;
    padding: 0 9px;
    gap: 8px;
    border: 1px solid #2a3542;
    border-radius: 5px;
    background: #0b1016;
    color: #64748b;

    &:focus-within {
        border-color: #4b9cd3;
        box-shadow: 0 0 0 2px rgba(75, 156, 211, 0.12);
    }

    input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: transparent;
        color: #f8fafc;
        font-size: 0.75rem;
    }

    button {
        padding: 2px;
        border: 0;
        background: transparent;
        color: #64748b;
    }
}

.stack-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.stack-filter {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 27px;
    padding: 3px 8px;
    border: 1px solid #2a3542;
    border-radius: 5px;
    background: #10161e;
    color: #94a3b8;
    font-size: 0.68rem;

    &.active {
        border-color: #2f6388;
        background: #20394d;
        color: #8ed0f5;
    }

    strong {
        color: #d7e4ef;
        font-family: var(--font-mono);
        font-size: 0.62rem;
        font-weight: 500;
    }
}

.filter-dot,
.state-dot,
.editor-state-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #64748b;
}

.filter-active .filter-dot,
.status-active .state-dot {
    background: #34d399;
    box-shadow: 0 0 8px rgba(52, 211, 153, 0.55);
}

.filter-exited .filter-dot,
.status-exited .state-dot {
    background: #f05252;
}

.stack-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    align-items: stretch;
}

.stack-card {
    position: relative;
    display: flex;
    min-width: 0;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid #28313d;
    border-radius: 8px;
    background: #10161e;

    &::before {
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: #64748b;
        content: "";
    }

    &.status-active::before {
        background: linear-gradient(180deg, #22d3ee, #34d399);
    }

    &.status-exited::before {
        background: #ef4444;
    }

    &:hover {
        border-color: #3b5268;
    }

    &.unmanaged {
        opacity: 0.72;
    }
}

.stack-card-main {
    position: relative;
    display: flex;
    min-height: 0;
    flex: 1;
    align-items: stretch;
    justify-content: flex-start;
    flex-direction: column;
    gap: 12px;
    padding: 13px 13px 12px 15px;
}

.stack-identity {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
}

.stack-name-row,
.stack-runtime,
.stack-card-actions,
.action-group {
    display: flex;
    align-items: center;
}

.stack-name-row {
    min-width: 0;
    justify-content: space-between;
    gap: 10px;
}

.stack-card-name {
    overflow: hidden;
    color: #f2f5f8;
    font-size: 1.1rem;
    font-weight: 750;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;

    svg {
        color: #4d718b;
        font-size: 0.68rem;
    }

    &:hover {
        color: #8fd8ff;
    }
}

.stack-state {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #94a3b8;
    font-family: var(--font-mono);
    font-size: 0.57rem;
    text-transform: uppercase;
}

.stack-runtime {
    min-height: 20px;
    margin-top: 7px;
    flex-wrap: wrap;
    gap: 6px;

    :deep(.badge) {
        min-width: 58px;
        padding: 3px 7px;
        font-size: 0.62rem;
    }
}

.stack-git,
.stack-endpoint,
.stack-unmanaged {
    color: #8ebfdc;
    font-family: var(--font-mono);
    font-size: 0.56rem;
}

.stack-unmanaged {
    color: #f59e0b;
}

.stack-telemetry {
    display: grid;
    width: 100%;
    min-width: 0;
    max-width: none;
    flex: 0 0 auto;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: center;
    gap: 0;
    margin-top: auto;
    border: 1px solid rgba(61, 86, 108, 0.48);
    border-radius: 6px;
    background:
        linear-gradient(90deg, rgba(34, 211, 238, 0.035), transparent 35%),
        rgba(4, 10, 16, 0.55);
    box-shadow: inset 0 0 18px rgba(19, 70, 96, 0.08);

    &.loading {
        .telemetry-live span {
            background: #64748b;
            box-shadow: none;
        }

        .telemetry-item strong {
            color: #64748b;
        }
    }
}

.telemetry-live {
    display: inline-flex;
    height: 23px;
    grid-column: 1 / -1;
    align-items: center;
    padding: 0 8px;
    gap: 5px;
    border-right: 0;
    border-bottom: 1px solid rgba(61, 86, 108, 0.45);
    color: #5fb8d3;
    font-family: var(--font-mono);
    font-size: 0.5rem;
    letter-spacing: 0.08em;

    span {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #34d399;
        box-shadow: 0 0 7px rgba(52, 211, 153, 0.75);
    }
}

.telemetry-item {
    display: flex;
    min-width: 0;
    height: 36px;
    align-items: center;
    padding: 0 8px;
    gap: 7px;
    border-right: 1px solid rgba(61, 86, 108, 0.32);

    &:last-child {
        border-right: 0;
    }

    small {
        margin-bottom: 2px;
    }

    > svg {
        flex: 0 0 auto;
        color: #53758c;
        font-size: 0.68rem;
    }

    > span {
        display: flex;
        min-width: 0;
        flex-direction: column;
        line-height: 1.05;
    }

    small {
        color: #5d6d7f;
        font-family: var(--font-mono);
        font-size: 0.46rem;
        letter-spacing: 0.06em;
    }

    strong {
        overflow: hidden;
        color: #d7e6ef;
        font-family: var(--font-mono);
        font-size: 0.66rem;
        font-weight: 620;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.telemetry-containers,
.telemetry-cpu {
    border-bottom: 1px solid rgba(61, 86, 108, 0.32);
}

.telemetry-cpu,
.telemetry-ports {
    border-right: 0;
}

.telemetry-containers > svg {
    color: #48c7a1;
}

.telemetry-cpu > svg {
    color: #55b7eb;
}

.telemetry-memory > svg {
    color: #9c8cf1;
}

.telemetry-ports > svg {
    color: #dda854;
}

.stack-card-actions {
    justify-content: flex-start;
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    padding: 8px 11px 10px 15px;
    border-top: 1px solid #28313d;
    background: rgba(4, 8, 13, 0.28);
}

.action-group {
    width: 100%;
    flex-wrap: wrap;
    gap: 4px;
}

.action-group-right {
    width: 100%;
    justify-content: flex-end;
}

.btn-xs {
    min-height: 27px;
    padding: 3px 8px;
    font-size: 0.66rem;
}

.stack-action {
    border: 1px solid #344352;
    background: #18212b;
    box-shadow: none;
    color: #a9b8c6;
    font-weight: 590;

    &:hover:not(:disabled),
    &:focus-visible:not(:disabled) {
        border-color: var(--action-border);
        background: var(--action-hover);
        color: var(--action-text);
        box-shadow: 0 0 0 2px var(--action-ring);
    }

    &:disabled {
        border-color: #29333e;
        background: #121922;
        color: #52606e;
        opacity: 0.72;
    }
}

.action-edit {
    --action-border: #438cb5;
    --action-hover: #19354a;
    --action-text: #9edcff;
    --action-ring: rgba(56, 189, 248, 0.12);
    border-color: #315d77;
    background: #142838;
    color: #83c7e9;
}

.action-console {
    --action-border: #7668c9;
    --action-hover: #2b2652;
    --action-text: #c4b9ff;
    --action-ring: rgba(139, 92, 246, 0.13);
    border-color: #51498b;
    background: #211e3d;
    color: #aea4ee;
}

.action-start {
    --action-border: #36a980;
    --action-hover: #163f34;
    --action-text: #8aebc3;
    --action-ring: rgba(52, 211, 153, 0.13);
    border-color: #27765d;
    background: #143329;
    color: #70d8ae;
}

.action-restart,
.action-update {
    --action-border: #397eb8;
    --action-hover: #183b5c;
    --action-text: #9bd2ff;
    --action-ring: rgba(59, 130, 246, 0.13);
    border-color: #2d5d86;
    background: #152c41;
    color: #86bde8;
}

.action-build {
    --action-border: #a8792f;
    --action-hover: #493416;
    --action-text: #f9d28a;
    --action-ring: rgba(245, 158, 11, 0.13);
    border-color: #725629;
    background: #332817;
    color: #dbb970;
}

.action-stop {
    --action-border: #bd6a32;
    --action-hover: #4a2b18;
    --action-text: #ffc08d;
    --action-ring: rgba(249, 115, 22, 0.13);
    border-color: #804d2b;
    background: #352419;
    color: #e5a16c;
}

.action-down {
    --action-border: #b44c51;
    --action-hover: #4b2025;
    --action-text: #ffadb1;
    --action-ring: rgba(239, 68, 68, 0.13);
    border-color: #74383e;
    background: #331d22;
    color: #df858a;
}

.action-delete {
    --action-border: #ef4444;
    --action-hover: #651f27;
    --action-text: #ffd4d4;
    --action-ring: rgba(239, 68, 68, 0.17);
    border-color: #a6353e;
    background: #4b2026;
    color: #ff9ca2;
}

.stack-processing {
    position: absolute;
    top: 10px;
    right: 13px;
    color: #62d9f5;
    font-family: var(--font-mono);
    font-size: 0.55rem;
    letter-spacing: 0.04em;
}

.terminal-dialog {
    width: min(1120px, 96vw);
}

.card-terminal-wrap {
    min-height: 0;
    flex: 1;
    padding: 12px;
}

.card-terminal {
    height: min(64vh, 520px);
}

.service-picker {
    display: grid;
    gap: 7px;
    padding: 6px;

    > span {
        margin-bottom: 3px;
        color: #718096;
        font-family: var(--font-mono);
        font-size: 0.65rem;
    }

    .btn {
        justify-content: flex-start;
        text-align: left;
    }
}

.terminal-dialog-footer {
    padding: 7px 12px;
    border-top: 1px solid #28313d;
    background: #101720;
    color: #64748b;
    font-family: var(--font-mono);
    font-size: 0.58rem;
    text-align: right;
}

.stack-empty {
    display: flex;
    min-height: 130px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 5px;
    border: 1px dashed #344152;
    border-radius: 8px;
    color: #718096;
    font-size: 0.78rem;

    strong {
        color: #cbd5e1;
    }
}

.empty-mark {
    color: #62d9f5;
    font-family: var(--font-mono);
}

.stack-editor-backdrop {
    position: fixed;
    z-index: 1200;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(2, 6, 10, 0.82);
    backdrop-filter: blur(5px);
}

.stack-editor-dialog {
    display: flex;
    width: min(1100px, 96vw);
    max-height: 92vh;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid #365269;
    border-radius: 9px;
    background: #0d131b;
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.55);
}

.stack-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 13px 16px;
    border-bottom: 1px solid #28313d;

    span {
        color: #62d9f5;
        font-family: var(--font-mono);
        font-size: 0.56rem;
        letter-spacing: 0.08em;
    }

    h2 {
        margin: 2px 0 0;
        color: #f2f5f8;
        font-size: 1rem;
    }

    button {
        width: 30px;
        height: 30px;
        border: 1px solid #2d3947;
        border-radius: 5px;
        background: #131b25;
        color: #94a3b8;
    }
}

.stack-editor-tabs {
    display: flex;
    gap: 4px;
    padding: 7px 12px 0;
    border-bottom: 1px solid #28313d;

    button {
        padding: 7px 11px;
        border: 0;
        border-bottom: 2px solid transparent;
        background: transparent;
        color: #718096;
        font-family: var(--font-mono);
        font-size: 0.67rem;

        &.active {
            border-bottom-color: #38bdf8;
            color: #cdeeff;
        }
    }
}

.stack-editor-body {
    min-height: 0;
    flex: 1;
    overflow: auto;
    padding: 10px 12px;

    :deep(.cm-editor) {
        min-height: min(58vh, 540px);
        border: 1px solid #263544;
        border-radius: 5px;
        font-size: 0.76rem;
    }

    :deep(.cm-scroller) {
        min-height: min(58vh, 540px);
        font-family: var(--font-mono);
    }
}

.stack-editor-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-top: 1px solid #28313d;
    background: #101720;

    > span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #718096;
        font-family: var(--font-mono);
        font-size: 0.62rem;

        &.dirty {
            color: #fbd38d;

            .editor-state-dot {
                background: #f59e0b;
                box-shadow: 0 0 8px rgba(245, 158, 11, 0.55);
            }
        }
    }

    > div {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
}

@media (max-width: 1180px) {
    .stack-list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 760px) {
    .stack-board-header,
    .stack-board-toolbar,
    .stack-editor-footer {
        align-items: stretch;
        flex-direction: column;
    }

    .stack-board-header .btn,
    .stack-search {
        width: 100%;
    }

    .stack-list {
        grid-template-columns: minmax(0, 1fr);
    }

    .stack-name-row {
        align-items: flex-start;
    }

    .stack-telemetry {
        margin-top: 2px;
    }

    .stack-card-actions {
        align-items: stretch;
        flex-direction: column;
    }

    .action-group-right {
        justify-content: flex-start;
    }

    .stack-editor-backdrop {
        padding: 8px;
    }

    .stack-editor-footer > div {
        width: 100%;

        .btn {
            flex: 1;
        }
    }
}
</style>
