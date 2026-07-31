<template>
    <div :class="classes">
        <div v-if="! $root.socketIO.connected && ! $root.socketIO.firstConnect" class="lost-connection">
            <div class="container-fluid d-flex align-items-center justify-content-between">
                <span>
                    <font-awesome-icon icon="triangle-exclamation" class="me-2" />
                    {{ $root.socketIO.connectionErrorMsg }}
                </span>
                <div v-if="$root.socketIO.showReverseProxyGuide">
                    {{ $t("reverseProxyMsg1") }} <a href="https://github.com/louislam/uptime-kuma/wiki/Reverse-Proxy" target="_blank">{{ $t("reverseProxyMsg2") }}</a>
                </div>
            </div>
        </div>

        <!-- Modern Header Navbar -->
        <header v-if="! $root.isMobile" class="modern-header px-4 py-3 mb-4">
            <div class="header-inner d-flex align-items-center justify-content-between">
                <!-- Brand Logo & Badge -->
                <router-link to="/" class="brand-link d-flex align-items-center text-decoration-none">
                    <div class="logo-wrapper me-3">
                        <object class="logo-icon" width="32" height="32" data="/icon.svg" />
                    </div>
                    <div class="brand-text">
                        <span class="title">Dockge</span>
                        <span class="version-tag badge rounded-pill bg-dark-subtle ms-2" style="font-size: 11px;">v{{ $root.info.version || '1.5.0' }}</span>
                    </div>
                </router-link>

                <div class="d-flex align-items-center gap-3">
                    <!-- Update Pill -->
                    <a v-if="hasNewVersion" target="_blank" href="https://github.com/louislam/dockge/releases" class="btn btn-warning update-btn btn-sm">
                        <font-awesome-icon icon="arrow-alt-circle-up" class="me-1" /> {{ $t("newUpdate") }}
                    </a>

                    <!-- Nav items -->
                    <ul class="nav nav-pills align-items-center gap-2 m-0">
                        <li v-if="$root.loggedIn" class="nav-item">
                            <router-link to="/" class="nav-link px-3 py-2">
                                <font-awesome-icon icon="home" class="me-1" /> {{ $t("home") }}
                            </router-link>
                        </li>

                        <li v-if="$root.loggedIn" class="nav-item">
                            <router-link to="/console" class="nav-link px-3 py-2">
                                <font-awesome-icon icon="terminal" class="me-1" /> {{ $t("console") }}
                            </router-link>
                        </li>

                        <li v-if="$root.loggedIn" class="nav-item">
                            <div class="dropdown dropdown-profile-pic">
                                <div class="nav-link profile-trigger px-3 py-2" data-bs-toggle="dropdown">
                                    <div class="profile-pic">{{ $root.usernameFirstChar }}</div>
                                    <font-awesome-icon icon="angle-down" class="ms-1 dropdown-arrow" />
                                </div>

                                <!-- Header's Dropdown Menu -->
                                <ul class="dropdown-menu dropdown-menu-end shadow-lg">
                                    <!-- Username -->
                                    <li class="px-3 py-2">
                                        <i18n-t v-if="$root.username != null" tag="span" keypath="signedInDisp" class="dropdown-item-text">
                                            <strong class="text-info">{{ $root.username }}</strong>
                                        </i18n-t>
                                        <span v-if="$root.username == null" class="dropdown-item-text text-muted">{{ $t("signedInDispDisabled") }}</span>
                                    </li>

                                    <li><hr class="dropdown-divider my-1"></li>

                                    <li>
                                        <button class="dropdown-item py-2" @click="scanFolder">
                                            <font-awesome-icon icon="arrows-rotate" class="me-2 text-primary" /> {{ $t("scanFolder") }}
                                        </button>
                                    </li>

                                    <li>
                                        <router-link to="/settings/general" class="dropdown-item py-2" :class="{ active: $route.path.includes('settings') }">
                                            <font-awesome-icon icon="cog" class="me-2 text-primary" /> {{ $t("Settings") }}
                                        </router-link>
                                    </li>

                                    <li><hr class="dropdown-divider my-1"></li>

                                    <li>
                                        <button class="dropdown-item py-2 text-danger" @click="$root.logout">
                                            <font-awesome-icon icon="sign-out-alt" class="me-2" />
                                            {{ $t("Logout") }}
                                        </button>
                                    </li>
                                </ul>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </header>

        <main class="main-content">
            <div v-if="$root.socketIO.connecting" class="container mt-5 text-center">
                <div class="spinner-border text-info mb-3" role="status"></div>
                <h4 class="text-muted">{{ $t("connecting...") }}</h4>
            </div>

            <router-view v-if="$root.loggedIn" />
            <Login v-if="! $root.loggedIn && $root.allowLoginDialog" />
        </main>
    </div>
</template>

<script>
import Login from "../components/Login.vue";
import { compareVersions } from "compare-versions";
import { ALL_ENDPOINTS } from "../../../common/util-common";

export default {

    components: {
        Login,
    },

    data() {
        return {

        };
    },

    computed: {

        // Theme or Mobile
        classes() {
            const classes = {};
            classes[this.$root.theme] = true;
            classes["mobile"] = this.$root.isMobile;
            return classes;
        },

        hasNewVersion() {
            if (this.$root.info.latestVersion && this.$root.info.version) {
                return compareVersions(this.$root.info.latestVersion, this.$root.info.version) >= 1;
            } else {
                return false;
            }
        },

    },

    watch: {

    },

    mounted() {

    },

    beforeUnmount() {

    },

    methods: {
        scanFolder() {
            this.$root.emitAgent(ALL_ENDPOINTS, "requestStackList", (res) => {
                this.$root.toastRes(res);
            });
        },
    },

};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";
@import "../styles/design-tokens.scss";

.modern-header {
    background: rgba(15, 20, 25, 0.75);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    position: sticky;
    top: 0;
    z-index: 1000;

    .header-inner {
        max-width: 1600px;
        margin: 0 auto;
    }
}

.brand-link {
    .logo-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        border-radius: var(--radius-base);
        background: rgba(56, 189, 248, 0.1);
        border: 1px solid rgba(56, 189, 248, 0.2);
        transition: all var(--transition-fast);

        &:hover {
            transform: scale(1.05);
            border-color: rgba(56, 189, 248, 0.4);
            box-shadow: var(--glow-cyan);
        }
    }

    .title {
        font-family: var(--font-display);
        font-size: var(--text-xl);
        font-weight: 700;
        letter-spacing: var(--tracking-tight);
        background: linear-gradient(135deg, #38bdf8 0%, #6ee7b7 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }
}

.nav-pills {
    .nav-link {
        color: #94a3b8;
        font-weight: 500;
        font-size: var(--text-sm);
        border-radius: var(--radius-pill);
        transition: all var(--transition-fast);

        &:hover {
            color: #f8fafc;
            background: rgba(255, 255, 255, 0.06);
        }

        &.router-link-exact-active, &.active {
            color: #0f1419;
            background: linear-gradient(135deg, #38bdf8 0%, #6ee7b7 100%);
            font-weight: 600;
            box-shadow: 0 0 15px rgba(56, 189, 248, 0.3);
        }
    }
}

.dropdown-profile-pic {
    user-select: none;

    .profile-trigger {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        border-radius: var(--radius-pill);
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        transition: all var(--transition-fast);

        &:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.15);
        }
    }

    .profile-pic {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #0f1419;
        background: linear-gradient(135deg, #38bdf8 0%, #6ee7b7 100%);
        width: 26px;
        height: 26px;
        border-radius: 50%;
        font-weight: 700;
        font-size: 11px;
    }

    .dropdown-menu {
        background: rgba(22, 29, 38, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-xl);
        padding: 8px;
        min-width: 200px;
        margin-top: 8px !important;

        .dropdown-item {
            color: #cbd5e1;
            font-size: var(--text-sm);
            border-radius: var(--radius-lg);
            transition: all var(--transition-fast);

            &:hover {
                color: #f8fafc;
                background: rgba(255, 255, 255, 0.08);
                transform: translateX(2px);
            }

            &.active {
                background: rgba(56, 189, 248, 0.15);
                color: #38bdf8;
            }
        }
    }
}

.update-btn {
    border-radius: var(--radius-pill);
    font-size: var(--text-xs);
    font-weight: 600;
    box-shadow: 0 0 15px rgba(245, 158, 11, 0.3);
}

.lost-connection {
    padding: 8px 16px;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
    font-size: var(--text-sm);
    font-weight: 500;
    position: fixed;
    top: 0;
    width: 100%;
    z-index: 99999;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

main.main-content {
    min-height: calc(100vh - 100px);
    max-width: 1600px;
    margin: 0 auto;
    padding: 0 16px;
}
</style>
