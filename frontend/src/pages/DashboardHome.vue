<template>
    <transition ref="tableContainer" name="slide-fade" appear>
        <div v-if="$route.name === 'DashboardHome'" class="dashboard-home-wrapper">
            <div class="d-flex align-items-center justify-content-between mb-4">
                <div>
                    <h1 class="page-title mb-1">{{ $t("home") }}</h1>
                    <p class="text-muted mb-0 fs-6">Manage and monitor all your Docker Compose stacks</p>
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="row g-3 mb-4">
                <div class="col-md-4">
                    <div class="stat-card stat-card-active p-4">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="stat-label">{{ $t("active") }}</span>
                            <span class="stat-icon-wrapper active-icon">
                                <font-awesome-icon icon="circle-check" />
                            </span>
                        </div>
                        <div class="stat-value text-active">{{ activeNum }}</div>
                        <div class="stat-subtitle">Running stacks</div>
                    </div>
                </div>

                <div class="col-md-4">
                    <div class="stat-card stat-card-exited p-4">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="stat-label">{{ $t("exited") }}</span>
                            <span class="stat-icon-wrapper exited-icon">
                                <font-awesome-icon icon="circle-xmark" />
                            </span>
                        </div>
                        <div class="stat-value text-exited">{{ exitedNum }}</div>
                        <div class="stat-subtitle">Stopped / exited stacks</div>
                    </div>
                </div>

                <div class="col-md-4">
                    <div class="stat-card stat-card-inactive p-4">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="stat-label">{{ $t("inactive") }}</span>
                            <span class="stat-icon-wrapper inactive-icon">
                                <font-awesome-icon icon="pause-circle" />
                            </span>
                        </div>
                        <div class="stat-value text-inactive">{{ inactiveNum }}</div>
                        <div class="stat-subtitle">Inactive / uncreated stacks</div>
                    </div>
                </div>
            </div>

            <div class="row g-4">
                <!-- Left: Docker Run to Compose Converter -->
                <div class="col-lg-7">
                    <div class="card-modern p-4">
                        <div class="card-header-custom mb-3 d-flex align-items-center justify-content-between">
                            <div>
                                <h3 class="mb-1 text-white fs-5 fw-bold">
                                    <font-awesome-icon icon="terminal" class="me-2 text-info" />
                                    {{ $t("Docker Run") }}
                                </h3>
                                <span class="text-muted fs-6">Convert any <code>docker run</code> CLI command into a Compose file</span>
                            </div>
                        </div>

                        <div class="mb-3">
                            <textarea
                                id="name"
                                v-model="dockerRunCommand"
                                type="text"
                                class="form-control docker-run-editor"
                                required
                                placeholder="docker run -d -p 8080:80 --name my-app nginx:latest"
                                rows="5"
                            ></textarea>
                        </div>

                        <div class="d-flex align-items-center justify-content-between">
                            <span class="text-muted fs-7">Supports environment variables, volume mounts, & port mappings</span>
                            <button class="btn btn-primary px-4 py-2" @click="convertDockerRun">
                                <font-awesome-icon icon="wand-magic-sparkles" class="me-1" />
                                {{ $t("Convert to Compose") }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Right: Agent Management -->
                <div class="col-lg-5">
                    <div class="card-modern p-4">
                        <div class="card-header-custom mb-3 d-flex align-items-center justify-content-between">
                            <h3 class="mb-0 text-white fs-5 fw-bold">
                                <font-awesome-icon icon="network-wired" class="me-2 text-info" />
                                {{ $tc("dockgeAgent", 2) }}
                            </h3>
                            <span class="badge bg-warning text-dark px-2 py-1 fs-7 fw-semibold">BETA</span>
                        </div>

                        <div v-for="(agentItem, endpoint) in $root.agentList" :key="endpoint" class="agent-item p-3 mb-2 d-flex align-items-center justify-content-between">
                            <div class="d-flex align-items-center gap-2">
                                <!-- Agent Status -->
                                <template v-if="$root.agentStatusList[endpoint]">
                                    <span v-if="$root.agentStatusList[endpoint] === 'online'" class="badge-modern badge-modern-success">{{ $t("agentOnline") }}</span>
                                    <span v-else-if="$root.agentStatusList[endpoint] === 'offline'" class="badge-modern badge-modern-danger">{{ $t("agentOffline") }}</span>
                                    <span v-else class="badge-modern badge-modern-neutral">{{ $t($root.agentStatusList[endpoint]) }}</span>
                                </template>

                                <!-- Agent Display Name -->
                                <template v-if="$root.agentStatusList[endpoint]">
                                    <span v-if="endpoint === '' && agentItem.name === ''" class="fw-semibold text-light">Current Endpoint</span>
                                    <span v-else-if="agentItem.name === ''" class="fw-semibold text-light">{{ endpoint }}</span>
                                    <span v-else class="fw-semibold text-light">{{ agentItem.name }}</span>
                                </template>
                            </div>

                            <div class="d-flex align-items-center gap-2">
                                <!-- Edit Name -->
                                <button v-if="agentItem.name !== ''" class="btn-icon" title="Edit Agent" @click="showEditAgentNameDialog[agentItem.name] = !showEditAgentNameDialog[agentItem.Name]">
                                    <font-awesome-icon icon="pen-to-square" />
                                </button>

                                <!-- Remove Button -->
                                <button v-if="endpoint !== ''" class="btn-icon btn-icon-danger" title="Remove Agent" @click="showRemoveAgentDialog[agentItem.url] = !showRemoveAgentDialog[agentItem.url]">
                                    <font-awesome-icon icon="trash" />
                                </button>
                            </div>

                            <!-- Edit Dialog -->
                            <BModal v-model="showEditAgentNameDialog[agentItem.name]" :no-close-on-backdrop="true" :close-on-esc="true" :okTitle="$t('Update Name')" okVariant="info" @ok="updateName(agentItem.url, agentItem.updatedName)">
                                <label for="Update Name" class="form-label">Current value: {{ $t(agentItem.name) }}</label>
                                <input id="updatedName" v-model="agentItem.updatedName" type="text" class="form-control" optional>
                            </BModal>

                            <!-- Remove Agent Dialog -->
                            <BModal v-model="showRemoveAgentDialog[agentItem.url]" :okTitle="$t('removeAgent')" okVariant="danger" @ok="removeAgent(agentItem.url)">
                                <p>{{ agentItem.url }}</p>
                                {{ $t("removeAgentMsg") }}
                            </BModal>
                        </div>

                        <div class="mt-3">
                            <button v-if="!showAgentForm" class="btn btn-outline-light btn-sm w-100 py-2" @click="showAgentForm = !showAgentForm">
                                <font-awesome-icon icon="plus" class="me-1" /> {{ $t("addAgent") }}
                            </button>
                        </div>

                        <!-- Add Agent Form -->
                        <form v-if="showAgentForm" class="mt-3 p-3 border border-secondary border-opacity-25 rounded-3 bg-dark-subtle" @submit.prevent="addAgent">
                            <div class="mb-2">
                                <label for="url" class="form-label fs-7">{{ $t("dockgeURL") }}</label>
                                <input id="url" v-model="agent.url" type="url" class="form-control form-control-sm" required placeholder="http://">
                            </div>

                            <div class="mb-2">
                                <label for="username" class="form-label fs-7">{{ $t("Username") }}</label>
                                <input id="username" v-model="agent.username" type="text" class="form-control form-control-sm" required>
                            </div>

                            <div class="mb-2">
                                <label for="password" class="form-label fs-7">{{ $t("Password") }}</label>
                                <input id="password" v-model="agent.password" type="password" class="form-control form-control-sm" required autocomplete="new-password">
                            </div>

                            <div class="mb-3">
                                <label for="name" class="form-label fs-7">{{ $t("Friendly Name") }}</label>
                                <input id="name" v-model="agent.name" type="text" class="form-control form-control-sm" optional>
                            </div>

                            <div class="d-flex gap-2">
                                <button type="submit" class="btn btn-primary btn-sm flex-grow-1" :disabled="connectingAgent">
                                    <template v-if="connectingAgent">{{ $t("connecting") }}</template>
                                    <template v-else>{{ $t("connect") }}</template>
                                </button>
                                <button type="button" class="btn btn-secondary btn-sm" @click="showAgentForm = false">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </transition>
    <router-view ref="child" />
</template>

<script>
import { statusNameShort } from "../../../common/util-common";

export default {
    components: {

    },
    props: {
        calculatedHeight: {
            type: Number,
            default: 0
        }
    },
    data() {
        return {
            page: 1,
            perPage: 25,
            initialPerPage: 25,
            paginationConfig: {
                hideCount: true,
                chunksNavigation: "scroll",
            },
            importantHeartBeatListLength: 0,
            displayedRecords: [],
            dockerRunCommand: "",
            showAgentForm: false,
            showRemoveAgentDialog: {},
            showEditAgentNameDialog: {},
            connectingAgent: false,
            agent: {
                url: "http://",
                username: "",
                password: "",
                name: "",
                updatedName: "",
            }
        };
    },

    computed: {
        activeNum() {
            return this.getStatusNum("active");
        },
        inactiveNum() {
            return this.getStatusNum("inactive");
        },
        exitedNum() {
            return this.getStatusNum("exited");
        },
    },

    watch: {
        perPage() {
            this.$nextTick(() => {
                this.getImportantHeartbeatListPaged();
            });
        },

        page() {
            this.getImportantHeartbeatListPaged();
        },
    },

    mounted() {
        this.initialPerPage = this.perPage;

        window.addEventListener("resize", this.updatePerPage);
        this.updatePerPage();
    },

    beforeUnmount() {
        window.removeEventListener("resize", this.updatePerPage);
    },

    methods: {

        addAgent() {
            this.connectingAgent = true;
            this.$root.getSocket().emit("addAgent", this.agent, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        url: "http://",
                        username: "",
                        password: "",
                    };
                }

                this.connectingAgent = false;
            });
        },

        removeAgent(url) {
            this.$root.getSocket().emit("removeAgent", url, (res) => {
                if (res.ok) {
                    this.$root.toastRes(res);

                    let urlObj = new URL(url);
                    let endpoint = urlObj.host;

                    // Remove the stack list and status list of the removed agent
                    delete this.$root.allAgentStackList[endpoint];
                }
            });
        },

        updateName(url, updatedName) {
            this.$root.getSocket().emit("updateAgent", url, updatedName, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        updatedName: "",
                    };
                }
            });
        },

        getStatusNum(statusName) {
            let num = 0;

            for (let stackName in this.$root.completeStackList) {
                const stack = this.$root.completeStackList[stackName];
                if (statusNameShort(stack.status) === statusName) {
                    num += 1;
                }
            }
            return num;
        },

        convertDockerRun() {
            if (this.dockerRunCommand.trim() === "docker run") {
                throw new Error("Please enter a docker run command");
            }

            // composerize is working in dev, but after "vite build", it is not working
            // So pass to backend to do the conversion
            this.$root.getSocket().emit("composerize", this.dockerRunCommand, (res) => {
                if (res.ok) {
                    this.$root.composeTemplate = res.composeTemplate;
                    this.$router.push("/compose");
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /**
         * Updates the displayed records when a new important heartbeat arrives.
         * @param {object} heartbeat - The heartbeat object received.
         * @returns {void}
         */
        onNewImportantHeartbeat(heartbeat) {
            if (this.page === 1) {
                this.displayedRecords.unshift(heartbeat);
                if (this.displayedRecords.length > this.perPage) {
                    this.displayedRecords.pop();
                }
                this.importantHeartBeatListLength += 1;
            }
        },

        /**
         * Retrieves the length of the important heartbeat list for all monitors.
         * @returns {void}
         */
        getImportantHeartbeatListLength() {
            this.$root.getSocket().emit("monitorImportantHeartbeatListCount", null, (res) => {
                if (res.ok) {
                    this.importantHeartBeatListLength = res.count;
                    this.getImportantHeartbeatListPaged();
                }
            });
        },

        /**
         * Retrieves the important heartbeat list for the current page.
         * @returns {void}
         */
        getImportantHeartbeatListPaged() {
            const offset = (this.page - 1) * this.perPage;
            this.$root.getSocket().emit("monitorImportantHeartbeatListPaged", null, offset, this.perPage, (res) => {
                if (res.ok) {
                    this.displayedRecords = res.data;
                }
            });
        },

        /**
         * Updates the number of items shown per page based on the available height.
         * @returns {void}
         */
        updatePerPage() {
            const tableContainer = this.$refs.tableContainer;
            const tableContainerHeight = tableContainer.offsetHeight;
            const availableHeight = window.innerHeight - tableContainerHeight;
            const additionalPerPage = Math.floor(availableHeight / 58);

            if (additionalPerPage > 0) {
                this.perPage = Math.max(this.initialPerPage, this.perPage + additionalPerPage);
            } else {
                this.perPage = this.initialPerPage;
            }

        },
    }
};
</script>

<style lang="scss" scoped>
@import "../styles/vars";
@import "../styles/design-tokens.scss";

.dashboard-home-wrapper {
    padding: 4px;
}

.page-title {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
    background: linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

// Stat cards
.stat-card {
    background: rgba(22, 29, 38, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-xl);
    transition: all var(--transition-base);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);

    &:hover {
        transform: translateY(-3px);
        box-shadow: 0 14px 35px rgba(0, 0, 0, 0.35);
        border-color: rgba(255, 255, 255, 0.15);
    }

    .stat-label {
        font-size: var(--text-xs);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: var(--tracking-wide);
        color: #94a3b8;
    }

    .stat-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 50%;

        &.active-icon {
            color: #10b981;
            background: rgba(16, 185, 129, 0.15);
        }
        &.exited-icon {
            color: #ef4444;
            background: rgba(239, 68, 68, 0.15);
        }
        &.inactive-icon {
            color: #64748b;
            background: rgba(100, 116, 139, 0.15);
        }
    }

    .stat-value {
        font-family: var(--font-display);
        font-size: 2.25rem;
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: -0.03em;
        margin-bottom: 4px;

        &.text-active {
            color: #10b981;
            text-shadow: 0 0 18px rgba(16, 185, 129, 0.35);
        }
        &.text-exited {
            color: #ef4444;
            text-shadow: 0 0 18px rgba(239, 68, 68, 0.35);
        }
        &.text-inactive {
            color: #64748b;
        }
    }

    .stat-subtitle {
        font-size: var(--text-xs);
        color: #64748b;
    }
}

// Docker Run editor
.card-modern {
    background: rgba(22, 29, 38, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-xl);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
}

.docker-run-editor {
    background: rgba(10, 15, 20, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-lg);
    color: #38bdf8;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.6;
    padding: 14px 16px;
    transition: all var(--transition-fast);

    &::placeholder {
        color: #475569;
    }

    &:focus {
        background: rgba(10, 15, 20, 0.95);
        border-color: #38bdf8;
        box-shadow: 0 0 15px rgba(56, 189, 248, 0.25);
        outline: none;
    }
}

// Agent Items
.agent-item {
    background: rgba(15, 20, 25, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-lg);
    transition: all var(--transition-fast);

    &:hover {
        background: rgba(15, 20, 25, 0.85);
        border-color: rgba(255, 255, 255, 0.12);
    }
}

.btn-icon {
    background: transparent;
    border: none;
    color: #64748b;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);

    &:hover {
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.1);
    }

    &-danger:hover {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
    }
}

.fs-7 {
    font-size: 0.75rem;
}
</style>
