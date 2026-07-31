<template>
    <div class="shadow-box-modern mb-3" :style="boxStyle">
        <div class="list-header">
            <!-- Search bar -->
            <div class="search-container mb-2">
                <div class="search-wrapper">
                    <font-awesome-icon icon="search" class="search-icon" />
                    <input
                        v-model="searchText"
                        class="form-control search-input"
                        :placeholder="$t('Search...')"
                        autocomplete="off"
                    />
                    <button v-if="searchText !== ''" type="button" class="btn-clear" @click="clearSearchText">
                        <font-awesome-icon icon="times" />
                    </button>
                </div>
            </div>

            <!-- Status filter chips -->
            <div class="status-filters d-flex align-items-center gap-1">
                <button
                    class="filter-chip"
                    :class="{ active: selectedStatusFilter === 'all' }"
                    @click="selectedStatusFilter = 'all'"
                >
                    {{ $t("All") || "All" }}
                </button>
                <button
                    class="filter-chip filter-chip-active"
                    :class="{ active: selectedStatusFilter === 'active' }"
                    @click="selectedStatusFilter = 'active'"
                >
                    <span class="dot dot-active"></span>
                    {{ $t("active") }}
                </button>
                <button
                    class="filter-chip filter-chip-exited"
                    :class="{ active: selectedStatusFilter === 'exited' }"
                    @click="selectedStatusFilter = 'exited'"
                >
                    <span class="dot dot-exited"></span>
                    {{ $t("exited") }}
                </button>
                <button
                    class="filter-chip filter-chip-inactive"
                    :class="{ active: selectedStatusFilter === 'inactive' }"
                    @click="selectedStatusFilter = 'inactive'"
                >
                    <span class="dot dot-inactive"></span>
                    {{ $t("inactive") }}
                </button>
            </div>
        </div>

        <div ref="stackList" class="stack-list" :class="{ scrollbar: scrollbar }" :style="stackListStyle">
            <div v-if="agentStackList[0] && agentStackList[0].stacks.length === 0" class="text-center py-4 text-muted">
                <p class="mb-2">{{ $t("No stacks found") || "No stacks found" }}</p>
                <router-link to="/compose" class="btn btn-sm btn-primary">
                    <font-awesome-icon icon="plus" class="me-1" /> {{ $t("addFirstStackMsg") }}
                </router-link>
            </div>
            <div v-for="(agent, agentIndex) in agentStackList" :key="agentIndex" class="stack-list-inner">
                <div
                    v-if="$root.agentCount > 1" class="p-2 agent-select"
                    @click="closedAgents.set(agent.endpoint, !closedAgents.get(agent.endpoint))"
                >
                    <span class="me-1">
                        <font-awesome-icon v-show="closedAgents.get(agent.endpoint)" icon="chevron-circle-right" />
                        <font-awesome-icon v-show="!closedAgents.get(agent.endpoint)" icon="chevron-circle-down" />
                    </span>
                    <span v-if="agent.endpoint === 'current'">{{ $t("currentEndpoint") }}</span>
                    <span v-else>{{ agent.endpoint }}</span>
                </div>
                <StackListItem
                    v-for="(item, index) in agent.stacks"
                    v-show="$root.agentCount === 1 || !closedAgents.get(agent.endpoint)" :key="index" :stack="item" :isSelectMode="selectMode"
                    :isSelected="isSelected" :select="select" :deselect="deselect"
                />
            </div>
        </div>
    </div>

    <Confirm ref="confirmPause" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="pauseSelected">
        {{ $t("pauseStackMsg") }}
    </Confirm>
</template>

<script>
import Confirm from "../components/Confirm.vue";
import StackListItem from "../components/StackListItem.vue";
import { CREATED_FILE, CREATED_STACK, EXITED, RUNNING, UNKNOWN, statusNameShort } from "../../../common/util-common";

export default {
    components: {
        Confirm,
        StackListItem,
    },
    props: {
        /** Should the scrollbar be shown */
        scrollbar: {
            type: Boolean,
        },
    },
    data() {
        return {
            searchText: "",
            selectedStatusFilter: "all",
            selectMode: false,
            selectAll: false,
            disableSelectAllWatcher: false,
            selectedStacks: {},
            windowTop: 0,
            filterState: {
                status: null,
                active: null,
                tags: null,
            },
            closedAgents: new Map(),
        };
    },
    computed: {
        /**
         * Improve the sticky appearance of the list by increasing its
         * height as user scrolls down.
         * Not used on mobile.
         * @returns {object} Style for stack list
         */
        boxStyle() {
            if (window.innerWidth > 550) {
                return {
                    height: `calc(100vh - 160px + ${this.windowTop}px)`,
                };
            } else {
                return {
                    height: "calc(100vh - 160px)",
                };
            }

        },

        /**
         * Returns a sorted list of stacks based on the applied filters and search text.
         * @returns {Array} The sorted list of stacks.
         */
        agentStackList() {
            let result = Object.values(this.$root.completeStackList);

            result = result.filter(stack => {
                // filter by search text
                // finds stack name, tag name or tag value
                let searchTextMatch = true;
                if (this.searchText !== "") {
                    const loweredSearchText = this.searchText.toLowerCase();
                    searchTextMatch =
                        stack.name.toLowerCase().includes(loweredSearchText)
                        || stack.tags.find(tag => tag.name.toLowerCase().includes(loweredSearchText)
                            || tag.value?.toLowerCase().includes(loweredSearchText));
                }

                // filter by selected status chip
                let statusMatch = true;
                if (this.selectedStatusFilter !== "all") {
                    statusMatch = statusNameShort(stack.status) === this.selectedStatusFilter;
                }

                // filter by active
                let activeMatch = true;
                if (this.filterState.active != null && this.filterState.active.length > 0) {
                    activeMatch = this.filterState.active.includes(stack.active);
                }

                // filter by tags
                let tagsMatch = true;
                if (this.filterState.tags != null && this.filterState.tags.length > 0) {
                    tagsMatch = stack.tags.map(tag => tag.tag_id) // convert to array of tag IDs
                        .filter(stackTagId => this.filterState.tags.includes(stackTagId)) // perform Array Intersaction between filter and stack's tags
                        .length > 0;
                }

                return searchTextMatch && activeMatch && tagsMatch && statusMatch;
            });

            result.sort((m1, m2) => {

                // sort by managed by dockge
                if (m1.isManagedByDockge && !m2.isManagedByDockge) {
                    return -1;
                } else if (!m1.isManagedByDockge && m2.isManagedByDockge) {
                    return 1;
                }

                // sort by status
                if (m1.status !== m2.status) {
                    if (m2.status === RUNNING) {
                        return 1;
                    } else if (m1.status === RUNNING) {
                        return -1;
                    } else if (m2.status === EXITED) {
                        return 1;
                    } else if (m1.status === EXITED) {
                        return -1;
                    } else if (m2.status === CREATED_STACK) {
                        return 1;
                    } else if (m1.status === CREATED_STACK) {
                        return -1;
                    } else if (m2.status === CREATED_FILE) {
                        return 1;
                    } else if (m1.status === CREATED_FILE) {
                        return -1;
                    } else if (m2.status === UNKNOWN) {
                        return 1;
                    } else if (m1.status === UNKNOWN) {
                        return -1;
                    }
                }
                return m1.name.localeCompare(m2.name);
            });

            // Group stacks by endpoint, sorting them so the local endpoint is first
            // and the rest are sorted alphabetically
            result = [
                ...result.reduce((acc, stack) => {
                    const endpoint = stack.endpoint || "current";
                    if (!acc.has(endpoint)) {
                        acc.set(endpoint, []);
                    }
                    acc.get(endpoint).push(stack);
                    return acc;
                }, new Map()).entries()
            ].map(([ endpoint, stacks ]) => ({
                endpoint,
                stacks
            })).sort((a, b) => {
                if (a.endpoint === "current" && b.endpoint !== "current") {
                    return -1;
                } else if (a.endpoint !== "current" && b.endpoint === "current") {
                    return 1;
                }
                return a.endpoint.localeCompare(b.endpoint);
            });

            return result;
        },

        isDarkTheme() {
            return document.body.classList.contains("dark");
        },

        stackListStyle() {
            //let listHeaderHeight = 107;
            let listHeaderHeight = 60;

            if (this.selectMode) {
                listHeaderHeight += 42;
            }

            return {
                "height": `calc(100% - ${listHeaderHeight}px)`
            };
        },

        selectedStackCount() {
            return Object.keys(this.selectedStacks).length;
        },

        /**
         * Determines if any filters are active.
         * @returns {boolean} True if any filter is active, false otherwise.
         */
        filtersActive() {
            return this.filterState.status != null || this.filterState.active != null || this.filterState.tags != null || this.searchText !== "";
        }
    },
    watch: {
        searchText() {
            for (let stack of this.agentStackList) {
                if (!this.selectedStacks[stack.id]) {
                    if (this.selectAll) {
                        this.disableSelectAllWatcher = true;
                        this.selectAll = false;
                    }
                    break;
                }
            }
        },
        selectAll() {
            if (!this.disableSelectAllWatcher) {
                this.selectedStacks = {};

                if (this.selectAll) {
                    this.agentStackList.forEach((item) => {
                        this.selectedStacks[item.id] = true;
                    });
                }
            } else {
                this.disableSelectAllWatcher = false;
            }
        },
        selectMode() {
            if (!this.selectMode) {
                this.selectAll = false;
                this.selectedStacks = {};
            }
        },
    },
    mounted() {
        window.addEventListener("scroll", this.onScroll);
    },
    beforeUnmount() {
        window.removeEventListener("scroll", this.onScroll);
    },
    methods: {
        /**
         * Handle user scroll
         * @returns {void}
         */
        onScroll() {
            if (window.top.scrollY <= 133) {
                this.windowTop = window.top.scrollY;
            } else {
                this.windowTop = 133;
            }
        },

        /**
         * Clear the search bar
         * @returns {void}
         */
        clearSearchText() {
            this.searchText = "";
        },
        /**
         * Update the StackList Filter
         * @param {object} newFilter Object with new filter
         * @returns {void}
         */
        updateFilter(newFilter) {
            this.filterState = newFilter;
        },
        /**
         * Deselect a stack
         * @param {number} id ID of stack
         * @returns {void}
         */
        deselect(id) {
            delete this.selectedStacks[id];
        },
        /**
         * Select a stack
         * @param {number} id ID of stack
         * @returns {void}
         */
        select(id) {
            this.selectedStacks[id] = true;
        },
        /**
         * Determine if stack is selected
         * @param {number} id ID of stack
         * @returns {bool} Is the stack selected?
         */
        isSelected(id) {
            return id in this.selectedStacks;
        },
        /**
         * Disable select mode and reset selection
         * @returns {void}
         */
        cancelSelectMode() {
            this.selectMode = false;
            this.selectedStacks = {};
        },
        /**
         * Show dialog to confirm pause
         * @returns {void}
         */
        pauseDialog() {
            this.$refs.confirmPause.show();
        },
        /**
         * Pause each selected stack
         * @returns {void}
         */
        pauseSelected() {
            Object.keys(this.selectedStacks)
                .filter(id => this.$root.stackList[id].active)
                .forEach(id => this.$root.getSocket().emit("pauseStack", id, () => { }));

            this.cancelSelectMode();
        },
        /**
         * Resume each selected stack
         * @returns {void}
         */
        resumeSelected() {
            Object.keys(this.selectedStacks)
                .filter(id => !this.$root.stackList[id].active)
                .forEach(id => this.$root.getSocket().emit("resumeStack", id, () => { }));

            this.cancelSelectMode();
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";
@import "../styles/design-tokens.scss";

.shadow-box-modern {
    background: rgba(22, 29, 38, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-xl);
    padding: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    position: sticky;
    top: 80px;
    height: calc(100vh - 120px);
    display: flex;
    flex-direction: column;
}

.list-header {
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.search-container {
    width: 100%;
}

.search-wrapper {
    position: relative;
    display: flex;
    align-items: center;

    .search-icon {
        position: absolute;
        left: 12px;
        color: #64748b;
        font-size: 13px;
        pointer-events: none;
    }

    .search-input {
        width: 100%;
        padding-left: 36px;
        padding-right: 32px;
        height: 38px;
        background: rgba(15, 20, 25, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-pill);
        color: #f8fafc;
        font-size: var(--text-xs);
        transition: all var(--transition-fast);

        &::placeholder {
            color: #64748b;
        }

        &:focus {
            background: rgba(15, 20, 25, 0.9);
            border-color: #38bdf8;
            box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
            outline: none;
        }
    }

    .btn-clear {
        position: absolute;
        right: 10px;
        background: transparent;
        border: none;
        color: #64748b;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        cursor: pointer;
        transition: color var(--transition-fast);

        &:hover {
            color: #f8fafc;
        }
    }
}

.status-filters {
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
    &::-webkit-scrollbar {
        display: none;
    }
}

.filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 500;
    border-radius: var(--radius-pill);
    background: rgba(255, 255, 255, 0.04);
    color: #94a3b8;
    border: 1px solid rgba(255, 255, 255, 0.06);
    cursor: pointer;
    white-space: nowrap;
    transition: all var(--transition-fast);

    &:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #f8fafc;
    }

    &.active {
        background: rgba(56, 189, 248, 0.15);
        color: #38bdf8;
        border-color: rgba(56, 189, 248, 0.3);
        font-weight: 600;
    }

    .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        display: inline-block;

        &-active { background-color: #10b981; }
        &-exited { background-color: #ef4444; }
        &-inactive { background-color: #64748b; }
    }
}

.stack-list {
    flex: 1;
    overflow-y: auto;
    padding-right: 4px;

    &.scrollbar {
        &::-webkit-scrollbar {
            width: 6px;
        }
        &::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
        }
    }
}

.agent-select {
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    padding: 6px 8px;
    display: flex;
    align-items: center;
    user-select: none;

    &:hover {
        color: #94a3b8;
    }
}
</style>
