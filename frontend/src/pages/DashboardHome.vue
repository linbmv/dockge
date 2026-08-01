<template>
    <transition ref="tableContainer" name="slide-fade" appear>
        <div v-if="$route.path === '/'" class="dashboard-home-wrapper">
            <StackCards />
        </div>
    </transition>
    <router-view ref="child" />
</template>

<script>
import StackCards from "../components/StackCards.vue";

export default {
    components: {
        StackCards,
    },
};
</script>

<style scoped lang="scss">
.dashboard-home-wrapper {
    min-width: 0;
    padding: 0;
}
</style>
