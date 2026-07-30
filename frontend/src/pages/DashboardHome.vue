<template>
    <transition ref="tableContainer" name="slide-fade" appear>
        <div v-if="$route.name === 'DashboardHome'">
            <h1 class="mb-3">
                {{ $t("home") }}
            </h1>

            <div class="row first-row">
                <!-- Left -->
                <div class="col-md-7">
                    <!-- Stats -->
                    <div class="shadow-box big-padding text-center mb-4">
                        <div class="row">
                            <div class="col">
                                <h3>{{ $t("active") }}</h3>
                                <span class="num active">{{ activeNum }}</span>
                            </div>
                            <div class="col">
                                <h3>{{ $t("exited") }}</h3>
                                <span class="num exited">{{ exitedNum }}</span>
                            </div>
                            <div class="col">
                                <h3>{{ $t("inactive") }}</h3>
                                <span class="num inactive">{{ inactiveNum }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Docker Run -->
                    <h2 class="mb-3">{{ $t("Docker Run") }}</h2>
                    <div class="mb-3">
                        <textarea id="name" v-model="dockerRunCommand" type="text" class="form-control docker-run shadow-box" required placeholder="docker run ..."></textarea>
                    </div>

                    <button class="btn-normal btn mb-4" @click="convertDockerRun">{{ $t("Convert to Compose") }}</button>
                </div>
                <!-- Right -->
                <div class="col-md-5">
                    <!-- Agent List -->
                    <div class="shadow-box big-padding">
                        <h4 class="mb-3">{{ $tc("dockgeAgent", 2) }} <span class="badge bg-warning" style="font-size: 12px;">beta</span></h4>

                        <div v-for="(agentItem, endpoint) in $root.agentList" :key="endpoint" class="mb-3 agent">
                            <!-- Agent Status -->
                            <template v-if="$root.agentStatusList[endpoint]">
                                <span v-if="$root.agentStatusList[endpoint] === 'online'" class="badge bg-primary me-2">{{ $t("agentOnline") }}</span>
                                <span v-else-if="$root.agentStatusList[endpoint] === 'offline'" class="badge bg-danger me-2">{{ $t("agentOffline") }}</span>
                                <span v-else class="badge bg-secondary me-2">{{ $t($root.agentStatusList[endpoint]) }}</span>
                            </template>

                            <!-- Agent Display Name -->
                            <template v-if="$root.agentStatusList[endpoint]">
                                <span v-if="endpoint === '' && agentItem.name === ''" class="badge bg-secondary me-2">Current</span>
                                <span v-else-if="agentItem.name === ''" :href="agentItem.url" class="me-2">{{ endpoint }}</span>
                                <span v-else :href="agentItem.url" class="me-2">{{ agentItem.name }}</span>
                            </template>

                            <!-- Edit Name  -->
                            <font-awesome-icon v-if="agentItem.name !== ''" icon="pen-to-square" @click="showEditAgentNameDialog[agentItem.name] = !showEditAgentNameDialog[agentItem.Name]" />

                            <!-- Edit Dialog -->
                            <BModal v-model="showEditAgentNameDialog[agentItem.name]" :no-close-on-backdrop="true" :close-on-esc="true" :okTitle="$t('Update Name')" okVariant="info" @ok="updateName(agentItem.url, agentItem.updatedName)">
                                <label for="Update Name" class="form-label">Current value: {{ $t(agentItem.name) }}</label>
                                <input id="updatedName" v-model="agentItem.updatedName" type="text" class="form-control" optional>
                            </BModal>

                            <!-- Remove Button -->
                            <font-awesome-icon v-if="endpoint !== ''" class="ms-2 remove-agent" icon="trash" @click="showRemoveAgentDialog[agentItem.url] = !showRemoveAgentDialog[agentItem.url]" />

                            <!-- Remove Agent Dialog -->
                            <BModal v-model="showRemoveAgentDialog[agentItem.url]" :okTitle="$t('removeAgent')" okVariant="danger" @ok="removeAgent(agentItem.url)">
                                <p>{{ agentItem.url }}</p>
                                {{ $t("removeAgentMsg") }}
                            </BModal>
                        </div>

                        <button v-if="!showAgentForm" class="btn btn-normal" @click="showAgentForm = !showAgentForm">{{ $t("addAgent") }}</button>

                        <!-- Add Agent Form -->
                        <form v-if="showAgentForm" @submit.prevent="addAgent">
                            <div class="mb-3">
                                <label for="url" class="form-label">{{ $t("dockgeURL") }}</label>
                                <input id="url" v-model="agent.url" type="url" class="form-control" required placeholder="http://">
                            </div>

                            <div class="mb-3">
                                <label for="username" class="form-label">{{ $t("Username") }}</label>
                                <input id="username" v-model="agent.username" type="text" class="form-control" required>
                            </div>

                            <div class="mb-3">
                                <label for="password" class="form-label">{{ $t("Password") }}</label>
                                <input id="password" v-model="agent.password" type="password" class="form-control" required autocomplete="new-password">
                            </div>

                            <div class="mb-3">
                                <label for="name" class="form-label">{{ $t("Friendly Name") }}</label>
                                <input id="name" v-model="agent.name" type="text" class="form-control" optional>
                            </div>

                            <button type="submit" class="btn btn-primary" :disabled="connectingAgent">
                                <template v-if="connectingAgent">{{ $t("connecting") }}</template>
                                <template v-else>{{ $t("connect") }}</template>
                            </button>
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

// ============================================
// Modern Dashboard Home Styles
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

h2 {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 600;
    color: $text-primary;
    margin-bottom: var(--space-4);
    letter-spacing: var(--tracking-tight);
}

h3 {
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 600;
    color: $text-tertiary;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    margin-bottom: var(--space-2);
}

h4 {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    color: $text-primary;
    margin-bottom: var(--space-4);
}

// Stats numbers with modern styling
.num {
    font-family: var(--font-display);
    font-size: var(--text-4xl);
    font-weight: 700;
    display: block;
    margin-top: var(--space-2);
    letter-spacing: var(--tracking-tighter);

    &.active {
        color: $accent-success;
        text-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
    }

    &.exited {
        color: $accent-danger;
        text-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
    }

    &.inactive {
        color: $text-tertiary;
    }
}

// Enhanced shadow-box
.shadow-box {
    background: $surface-raised;
    border: 1px solid $border-subtle;
    border-radius: var(--radius-xl);
    padding: var(--space-8);
    box-shadow: var(--shadow-base);
    transition: all var(--transition-base);

    &:hover {
        border-color: $border-default;
        box-shadow: var(--shadow-md);
    }

    &.big-padding {
        padding: var(--space-10);
    }
}

// Stats row styling
.first-row {
    .shadow-box {
        .row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: var(--space-6);

            .col {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: var(--space-4);
                border-radius: var(--radius-lg);
                transition: all var(--transition-fast);

                &:hover {
                    background: $surface-elevated;
                    transform: translateY(-2px);
                }
            }
        }
    }
}

// Docker run textarea
.docker-run {
    border: 1px solid $border-default;
    border-radius: var(--radius-xl);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    background: $surface-deep;
    color: $text-primary;
    padding: var(--space-6);
    min-height: 150px;
    transition: all var(--transition-base);
    box-shadow: var(--shadow-base);

    &::placeholder {
        color: $text-muted;
    }

    &:focus {
        border-color: $accent-primary;
        box-shadow: var(--glow-cyan);
        background: $surface-base;
        outline: none;
    }

    &:hover {
        border-color: $border-strong;
    }
}

// Agent list styling
.agent {
    display: flex;
    align-items: center;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    transition: all var(--transition-fast);

    &:hover {
        background: $surface-elevated;
    }

    .badge {
        border-radius: var(--radius-pill);
        padding: var(--space-1) var(--space-3);
        font-size: var(--text-xs);
        font-weight: 500;

        &.bg-primary {
            background: rgba(56, 189, 248, 0.2) !important;
            color: $accent-primary;
        }

        &.bg-danger {
            background: rgba(239, 68, 68, 0.2) !important;
            color: $accent-danger;
        }

        &.bg-warning {
            background: rgba(245, 158, 11, 0.2) !important;
            color: $accent-warning;
        }

        &.bg-secondary {
            background: $surface-elevated !important;
            color: $text-secondary;
        }
    }

    svg {
        cursor: pointer;
        color: $text-tertiary;
        transition: color var(--transition-fast);
        margin-left: auto;

        &:hover {
            color: $accent-primary;
        }
    }
}

.remove-agent {
    cursor: pointer;
    color: $text-muted;
    transition: color var(--transition-fast);

    &:hover {
        color: $accent-danger;
    }
}

// Table styling
table {
    font-size: var(--text-sm);
    width: 100%;

    tr {
        transition: all var(--transition-fast);

        &:hover {
            background: $surface-elevated;
        }
    }

    th {
        font-weight: 600;
        color: $text-secondary;
        text-transform: uppercase;
        font-size: var(--text-xs);
        letter-spacing: var(--tracking-wide);
        padding: var(--space-3);
    }

    td {
        padding: var(--space-3);
        color: $text-primary;
    }

    @media (max-width: 550px) {
        table-layout: fixed;
        overflow-wrap: break-word;
    }
}

// Button styling
.btn {
    border-radius: var(--radius-pill);
    font-weight: 500;
    padding: var(--space-3) var(--space-6);
    transition: all var(--transition-fast);
    border: none;

    &.btn-normal {
        background: $surface-elevated;
        color: $text-primary;
        border: 1px solid $border-default;

        &:hover {
            background: $accent-primary;
            color: $surface-deepest;
            border-color: $accent-primary;
            box-shadow: var(--glow-cyan);
            transform: translateY(-1px);
        }
    }
}

// Responsive adjustments
@media (max-width: 768px) {
    .first-row .shadow-box .row {
        grid-template-columns: repeat(1, 1fr);
    }

    h1 {
        font-size: var(--text-2xl);
    }

    .num {
        font-size: var(--text-3xl);
    }
}

.agent {
    a {
        text-decoration: none;
    }
}

</style>
