<template>
    <div class="operations-settings">
        <div class="operations-grid">
            <section class="operation-card docker-run-card">
                <header>
                    <div>
                        <span class="operation-kicker">COMPOSE TOOL</span>
                        <h3><font-awesome-icon icon="terminal" /> {{ $t("Docker Run") }}</h3>
                    </div>
                </header>
                <textarea
                    v-model="dockerRunCommand"
                    rows="5"
                    placeholder="docker run -d -p 8080:80 --name app nginx:latest"
                ></textarea>
                <button type="button" class="btn btn-primary btn-sm" @click="convertDockerRun">
                    {{ $t("Convert to Compose") }}
                </button>
            </section>

            <section class="operation-card quick-actions-card">
                <header>
                    <div>
                        <span class="operation-kicker">SYSTEM TOOLS</span>
                        <h3>{{ $t("managementTools") }}</h3>
                    </div>
                </header>
                <div class="quick-actions">
                    <button type="button" :class="{ active: showConsole }" @click="toggleConsole">
                        <font-awesome-icon icon="terminal" />
                        <span><strong>{{ $t("console") }}</strong><small>{{ $t("consoleSettingsHelp") }}</small></span>
                        <font-awesome-icon icon="chevron-circle-right" />
                    </button>
                    <router-link to="/settings/globalEnv">
                        <font-awesome-icon icon="file" />
                        <span><strong>{{ $t("GlobalEnv") }}</strong><small>{{ $t("globalEnvSettingsHelp") }}</small></span>
                        <font-awesome-icon icon="chevron-circle-right" />
                    </router-link>
                    <button type="button" :disabled="refreshing" @click="scanFolder">
                        <font-awesome-icon icon="arrows-rotate" :spin="refreshing" />
                        <span><strong>{{ $t("scanFolder") }}</strong><small>{{ $t("scanFolderSettingsHelp") }}</small></span>
                        <font-awesome-icon icon="chevron-circle-right" />
                    </button>
                </div>
            </section>
        </div>

        <section v-if="showConsole" class="operation-card console-card">
            <header>
                <div>
                    <span class="operation-kicker">SYSTEM TERMINAL</span>
                    <h3>{{ $t("console") }}</h3>
                </div>
                <button type="button" class="close-tool" :aria-label="$t('cancel')" @click="showConsole = false">
                    <font-awesome-icon icon="times" />
                </button>
            </header>
            <Terminal class="settings-terminal" :rows="16" mode="mainTerminal" name="console" endpoint="" />
        </section>

        <section class="operation-card agents-card">
            <header>
                <div>
                    <span class="operation-kicker">REMOTE ENDPOINTS</span>
                    <h3><font-awesome-icon icon="link" /> {{ $tc("dockgeAgent", 2) }}</h3>
                </div>
                <span class="agent-summary">{{ onlineAgentCount }}/{{ agentCount }} ONLINE</span>
            </header>

            <div class="agent-list">
                <div v-for="(agentItem, endpoint) in $root.agentList" :key="endpoint" class="agent-row">
                    <span class="agent-dot" :class="$root.agentStatusList[endpoint]"></span>
                    <div class="agent-details">
                        <strong>{{ agentName(agentItem, endpoint) }}</strong>
                        <small>{{ endpoint || $t("currentEndpoint") }}</small>
                    </div>
                    <span class="agent-status">{{ $root.agentStatusList[endpoint] || "unknown" }}</span>
                    <div class="agent-actions">
                        <button v-if="agentItem.name" type="button" @click="beginAgentEdit(agentItem)"><font-awesome-icon icon="pen" /></button>
                        <button v-if="endpoint !== ''" type="button" class="danger" @click="removeAgent(agentItem.url)"><font-awesome-icon icon="trash" /></button>
                    </div>
                </div>
            </div>

            <form v-if="editingAgentUrl" class="agent-edit-form" @submit.prevent="updateAgentName">
                <input v-model="editingAgentName" type="text" class="form-control form-control-sm" required>
                <button type="submit" class="btn btn-primary btn-sm"><font-awesome-icon icon="save" /> {{ $t("saveStackDraft") }}</button>
                <button type="button" class="btn btn-normal btn-sm" @click="cancelAgentEdit">{{ $t("cancel") }}</button>
            </form>

            <button v-if="!showAgentForm" type="button" class="btn btn-normal btn-sm add-agent-btn" @click="showAgentForm = true">
                <font-awesome-icon icon="plus" /> {{ $t("addAgent") }}
            </button>

            <form v-else class="agent-form" @submit.prevent="addAgent">
                <input v-model="agent.url" type="url" class="form-control form-control-sm" required placeholder="http://127.0.0.1:5001">
                <input v-model="agent.username" type="text" class="form-control form-control-sm" required :placeholder="$t('Username')">
                <input v-model="agent.password" type="password" class="form-control form-control-sm" required autocomplete="new-password" :placeholder="$t('Password')">
                <input v-model="agent.name" type="text" class="form-control form-control-sm" placeholder="Friendly name">
                <div class="agent-form-actions">
                    <button type="submit" class="btn btn-primary btn-sm" :disabled="connectingAgent">
                        {{ connectingAgent ? $t("connecting") : $t("connect") }}
                    </button>
                    <button type="button" class="btn btn-normal btn-sm" @click="showAgentForm = false">{{ $t("cancel") }}</button>
                </div>
            </form>
        </section>
    </div>
</template>

<script>
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { ALL_ENDPOINTS } from "../../../../common/util-common";
import Terminal from "../Terminal.vue";

export default {
    components: {
        FontAwesomeIcon,
        Terminal,
    },
    data() {
        return {
            dockerRunCommand: "",
            refreshing: false,
            showConsole: false,
            showAgentForm: false,
            connectingAgent: false,
            editingAgentUrl: "",
            editingAgentName: "",
            agent: {
                url: "http://",
                username: "",
                password: "",
                name: "",
            },
        };
    },
    computed: {
        agentCount() {
            return Object.keys(this.$root.agentList || {}).length;
        },
        onlineAgentCount() {
            return Object.values(this.$root.agentStatusList || {}).filter(status => status === "online").length;
        },
    },
    methods: {
        convertDockerRun() {
            if (!this.dockerRunCommand.trim() || this.dockerRunCommand.trim() === "docker run") {
                this.$root.toastError("Please enter a docker run command");
                return;
            }
            this.$root.getSocket().emit("composerize", this.dockerRunCommand, (res) => {
                if (res.ok) {
                    this.$root.composeTemplate = res.composeTemplate;
                    this.$router.push("/compose");
                } else {
                    this.$root.toastRes(res);
                }
            });
        },
        toggleConsole() {
            if (this.showConsole) {
                this.showConsole = false;
                return;
            }
            this.$root.emitAgent("", "checkMainTerminal", (res) => {
                if (res.ok) {
                    this.showConsole = true;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },
        scanFolder() {
            this.refreshing = true;
            this.$root.emitAgent(ALL_ENDPOINTS, "requestStackList", (res) => {
                this.refreshing = false;
                this.$root.toastRes(res);
            });
        },
        agentName(agent, endpoint) {
            return agent.name || endpoint || this.$t("currentEndpoint");
        },
        addAgent() {
            this.connectingAgent = true;
            this.$root.getSocket().emit("addAgent", this.agent, (res) => {
                this.connectingAgent = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        url: "http://",
                        username: "",
                        password: "",
                        name: "",
                    };
                }
            });
        },
        beginAgentEdit(agent) {
            this.editingAgentUrl = agent.url;
            this.editingAgentName = agent.name;
        },
        cancelAgentEdit() {
            this.editingAgentUrl = "";
            this.editingAgentName = "";
        },
        updateAgentName() {
            this.$root.getSocket().emit("updateAgent", this.editingAgentUrl, this.editingAgentName, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.cancelAgentEdit();
                }
            });
        },
        removeAgent(url) {
            if (!confirm(this.$t("removeAgentMsg"))) {
                return;
            }
            this.$root.getSocket().emit("removeAgent", url, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    const endpoint = new URL(url).host;
                    delete this.$root.allAgentStackList[endpoint];
                }
            });
        },
    },
};
</script>

<style scoped lang="scss">
.operations-settings {
    display: grid;
    gap: 12px;
    padding: 14px 0 4px;
}

.operations-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.operation-card {
    min-width: 0;
    padding: 13px;
    border: 1px solid #28313d;
    border-radius: 7px;
    background: #10161e;

    > header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 11px;

        h3 {
            margin: 2px 0 0;
            color: #e7edf3;
            font-size: 0.9rem;
        }
    }
}

.operation-kicker,
.agent-summary {
    color: #62d9f5;
    font-family: var(--font-mono);
    font-size: 0.55rem;
    letter-spacing: 0.08em;
}

.docker-run-card {
    display: grid;
    gap: 9px;

    textarea {
        width: 100%;
        resize: vertical;
        padding: 9px;
        border: 1px solid #2a3542;
        border-radius: 5px;
        outline: 0;
        background: #080d13;
        color: #9acff0;
        font-family: var(--font-mono);
        font-size: 0.69rem;

        &:focus {
            border-color: #38bdf8;
        }
    }

    .btn {
        justify-self: end;
    }
}

.quick-actions {
    display: grid;
    gap: 6px;

    button,
    a {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px;
        width: 100%;
        padding: 8px 9px;
        border: 1px solid #293746;
        border-radius: 5px;
        background: #0b1016;
        color: #8ecff3;
        text-align: left;
        text-decoration: none;

        &:hover,
        &.active {
            border-color: #3c6480;
            background: #13202c;
        }

        span {
            display: flex;
            min-width: 0;
            flex-direction: column;
        }

        strong {
            color: #dbe5ec;
            font-size: 0.72rem;
        }

        small {
            overflow: hidden;
            color: #64748b;
            font-size: 0.59rem;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }
}

.close-tool {
    width: 28px;
    height: 28px;
    border: 1px solid #2d3947;
    border-radius: 5px;
    background: #131b25;
    color: #94a3b8;
}

.settings-terminal {
    height: 330px;
}

.agent-list {
    display: grid;
    gap: 5px;
}

.agent-row {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 9px;
    min-height: 42px;
    padding: 6px 9px;
    border: 1px solid #263441;
    border-radius: 5px;
    background: #0b1016;
}

.agent-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #64748b;

    &.online {
        background: #34d399;
        box-shadow: 0 0 7px rgba(52, 211, 153, 0.55);
    }

    &.offline {
        background: #ef4444;
    }
}

.agent-details {
    display: flex;
    min-width: 0;
    flex-direction: column;

    strong,
    small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    strong {
        color: #dbe5ec;
        font-size: 0.72rem;
    }

    small {
        color: #64748b;
        font-family: var(--font-mono);
        font-size: 0.58rem;
    }
}

.agent-status {
    color: #7f93a5;
    font-family: var(--font-mono);
    font-size: 0.57rem;
    text-transform: uppercase;
}

.agent-actions {
    display: flex;
    gap: 3px;

    button {
        width: 26px;
        height: 26px;
        border: 1px solid #2b3947;
        border-radius: 4px;
        background: #131b25;
        color: #8aa0b3;

        &.danger:hover {
            color: #ef4444;
        }
    }
}

.agent-edit-form,
.agent-form {
    display: grid;
    gap: 7px;
    margin-top: 9px;
    padding: 10px;
    border: 1px solid #2b3e50;
    border-radius: 5px;
    background: #0b1016;
}

.agent-edit-form {
    grid-template-columns: minmax(0, 1fr) auto auto;
}

.agent-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.agent-form-actions {
    display: flex;
    gap: 6px;
    grid-column: 1 / -1;
    justify-content: flex-end;
}

.add-agent-btn {
    margin-top: 9px;
}

@media (max-width: 900px) {
    .operations-grid,
    .agent-form {
        grid-template-columns: minmax(0, 1fr);
    }

    .agent-form-actions {
        grid-column: auto;
    }
}
</style>
