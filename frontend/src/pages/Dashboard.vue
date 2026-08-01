<template>
    <div class="container-fluid dashboard-shell">
        <DashboardSidebar />
        <div ref="container" class="dashboard-content mb-3">
            <!-- Add :key to disable vue router re-use the same component -->
            <router-view :key="$route.fullPath" :calculatedHeight="height" />
        </div>
    </div>
</template>

<script>
import DashboardSidebar from "../components/DashboardSidebar.vue";

export default {
    components: {
        DashboardSidebar,
    },
    data() {
        return {
            height: 0
        };
    },
    mounted() {
        this.height = this.$refs.container.offsetHeight;
    },
};
</script>

<style lang="scss" scoped>
.container-fluid {
    width: 100%;
}

.dashboard-shell {
    display: grid;
    grid-template-columns: 252px minmax(0, 1fr);
    align-items: start;
    gap: 14px;
    max-width: 1600px;
    margin: 0 auto;
}

.dashboard-content {
    min-width: 0;
    width: 100%;
}

@media (max-width: 991px) {
    .dashboard-shell {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
