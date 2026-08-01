<template>
    <aside class="dashboard-sidebar" aria-label="Dockge navigation">
        <div class="sidebar-heading">
            <span>CONTROL / MENU</span>
            <strong>Dockge</strong>
        </div>

        <nav class="sidebar-nav">
            <router-link to="/" class="sidebar-link" :class="{ active: $route.path === '/' }">
                <font-awesome-icon icon="home" />
                <span>{{ $t("home") }}</span>
            </router-link>
            <router-link to="/settings/operations" class="sidebar-link" :class="{ active: $route.path.startsWith('/settings') || $route.path.startsWith('/console') }">
                <font-awesome-icon icon="cog" />
                <span>{{ $t("Settings") }}</span>
            </router-link>
        </nav>

        <HostStats class="sidebar-host-stats" />
    </aside>
</template>

<script>
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import HostStats from "./HostStats.vue";

export default {
    components: {
        FontAwesomeIcon,
        HostStats,
    },
};
</script>

<style scoped lang="scss">
.dashboard-sidebar {
    position: sticky;
    top: 66px;
    display: flex;
    max-height: calc(100vh - 78px);
    min-width: 0;
    flex-direction: column;
    align-self: start;
    overflow-y: auto;
    padding: 12px;
    border: 1px solid #28313d;
    border-radius: 8px;
    background: #10161e;
    scrollbar-width: thin;
}

.sidebar-heading {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 3px 6px 12px;
    border-bottom: 1px solid #28313d;

    span {
        color: #62d9f5;
        font-family: var(--font-mono);
        font-size: 0.58rem;
        letter-spacing: 0.1em;
    }

    strong {
        color: #e7edf3;
        font-size: 0.9rem;
    }
}

.sidebar-nav {
    display: grid;
    gap: 4px;
    padding: 10px 0 12px;
}

.sidebar-link {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 38px;
    padding: 7px 9px;
    border: 1px solid transparent;
    border-radius: 5px;
    color: #94a3b8;
    font-size: 0.76rem;
    text-decoration: none;

    &:hover,
    &.active,
    &.router-link-exact-active {
        border-color: #30465b;
        background: #182636;
        color: #d9edf8;
    }

    > svg {
        color: #62b9e7;
    }
}

.sidebar-host-stats {
    margin-top: auto;
}

@media (max-width: 991px) {
    .dashboard-sidebar {
        position: static;
        max-height: none;
    }

    .sidebar-nav {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .sidebar-host-stats {
        margin-top: 8px;
    }
}
</style>
