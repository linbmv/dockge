<template>
    <router-link :to="url" :class="{ 'dim' : !stack.isManagedByDockge }" class="item">
        <Uptime :stack="stack" :fixed-width="true" class="me-2" />
        <div class="title">
            <span>{{ stackName }}</span>
        </div>
    </router-link>
</template>

<script>
import Uptime from "./Uptime.vue";

export default {
    components: {
        Uptime
    },
    props: {
        /** Stack this represents */
        stack: {
            type: Object,
            default: null,
        },
        /** If the user is in select mode */
        isSelectMode: {
            type: Boolean,
            default: false,
        },
        /** How many ancestors are above this stack */
        depth: {
            type: Number,
            default: 0,
        },
        /** Callback to determine if stack is selected */
        isSelected: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is selected */
        select: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is deselected */
        deselect: {
            type: Function,
            default: () => {}
        },
    },
    data() {
        return {
            isCollapsed: true,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.stack.endpoint);
        },
        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
        depthMargin() {
            return {
                marginLeft: `${31 * this.depth}px`,
            };
        },
        stackName() {
            return this.stack.name;
        }
    },
    watch: {
        isSelectMode() {
            // TODO: Resize the heartbeat bar, but too slow
            // this.$refs.heartbeatBar.resize();
        }
    },
    beforeMount() {

    },
    methods: {
        /**
         * Changes the collapsed value of the current stack and saves
         * it to local storage
         * @returns {void}
         */
        changeCollapsed() {
            this.isCollapsed = !this.isCollapsed;

            // Save collapsed value into local storage
            let storage = window.localStorage.getItem("stackCollapsed");
            let storageObject = {};
            if (storage !== null) {
                storageObject = JSON.parse(storage);
            }
            storageObject[`stack_${this.stack.id}`] = this.isCollapsed;

            window.localStorage.setItem("stackCollapsed", JSON.stringify(storageObject));
        },

        /**
         * Toggle selection of stack
         * @returns {void}
         */
        toggleSelection() {
            if (this.isSelected(this.stack.id)) {
                this.deselect(this.stack.id);
            } else {
                this.select(this.stack.id);
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";
@import "../styles/design-tokens.scss";

.item {
    text-decoration: none;
    display: flex;
    align-items: center;
    min-height: 44px;
    border-radius: var(--radius-lg);
    transition: all var(--transition-fast);
    width: 100%;
    padding: 8px 10px;
    margin-bottom: 4px;
    background: transparent;
    border: 1px solid transparent;
    color: #cbd5e1;

    &.dim {
        opacity: 0.5;
    }

    &:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #f8fafc;
        transform: translateX(2px);
    }

    &.router-link-active, &.active {
        background: rgba(56, 189, 248, 0.12);
        border-color: rgba(56, 189, 248, 0.3);
        color: #38bdf8;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);

        .title span {
            color: #38bdf8;
        }
    }

    .title {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        span {
            font-size: var(--text-sm);
            font-weight: 500;
            color: #e2e8f0;
            transition: color var(--transition-fast);
        }
    }

    .endpoint {
        font-size: var(--text-xs);
        color: #64748b;
    }
}
</style>
