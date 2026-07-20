<template>
    <div class="stack-list-panel" :style="boxStyle">
        <div class="list-header">
            <div class="header-top">
                <!-- TODO -->
                <button
                    v-if="false" class="btn btn-outline-normal ms-2" :class="{ 'active': selectMode }" type="button"
                    @click="selectMode = !selectMode"
                >
                    {{ $t("Select") }}
                </button>

                <div class="placeholder"></div>

                <div class="search-wrapper">
                    <a v-if="searchText == ''" class="search-icon">
                        <font-awesome-icon icon="search" />
                    </a>
                    <a v-if="searchText != ''" class="search-icon" style="cursor: pointer" @click="clearSearchText">
                        <font-awesome-icon icon="times" />
                    </a>
                    <form>
                        <input v-model="searchText" class="form-control search-input" :placeholder="$t('searchStacks')" autocomplete="off" />
                    </form>
                </div>

                <button
                    class="updates-only-toggle"
                    :class="{ active: updatesOnlyActive }"
                    type="button"
                    @click="toggleUpdatesOnly"
                >
                    {{ $t("updateAvailable") }}
                    <span>{{ updateCount }}</span>
                </button>

                <div class="filter-wrapper">
                    <button
                        class="btn btn-link filter-icon-container"
                        type="button"
                        :title="$t('Filter')"
                        @click="filterDropdownOpen = !filterDropdownOpen"
                    >
                        <font-awesome-icon class="filter-icon" :class="{ 'filter-icon-active': filtersActive }" icon="filter" />
                        <span>{{ $t("Filter") }}</span>
                    </button>

                    <div v-if="filterDropdownOpen" class="filter-dropdown">
                        <button class="filter-dropdown-clear" type="button" :disabled="!filtersActive" @click="clearFilters">
                            <font-awesome-icon class="me-2" icon="times" />
                            {{ $t("clearFilter") }}
                        </button>

                        <div class="filter-section">
                            <div class="filter-heading">{{ $t("Status") }}</div>
                            <label v-for="option in statusFilterOptions" :key="option.value" class="filter-option">
                                <input v-model="filterState.status" class="form-check-input" type="checkbox" :value="option.value" />
                                <span>{{ $t(option.label) }}</span>
                            </label>
                        </div>

                        <div v-if="agentFilterOptions.length > 1" class="filter-section">
                            <div class="filter-heading">{{ $t("Agent") }}</div>
                            <label v-for="option in agentFilterOptions" :key="option.value" class="filter-option">
                                <input v-model="filterState.agents" class="form-check-input" type="checkbox" :value="option.value" />
                                <span>{{ option.label }}</span>
                            </label>
                        </div>

                        <div class="filter-section">
                            <div class="filter-heading">{{ $t("Attributes") }}</div>
                            <label class="filter-option">
                                <input v-model="filterState.attributes" class="form-check-input" type="checkbox" value="hasUpdates" />
                                <span>{{ $t("updateAvailable") }}</span>
                            </label>
                            <label class="filter-option">
                                <input v-model="filterState.attributes" class="form-check-input" type="checkbox" value="unmanaged" />
                                <span>{{ $t("Not managed by Dockge") }}</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="filter-wrapper">
                    <button
                        class="btn btn-link filter-icon-container"
                        type="button"
                        :title="$t('columns')"
                        @click="columnDropdownOpen = !columnDropdownOpen"
                    >
                        <font-awesome-icon icon="stream" />
                        <span>{{ $t("columns") }}</span>
                    </button>

                    <div v-if="columnDropdownOpen" class="filter-dropdown column-dropdown">
                        <div class="filter-heading px-3 py-1">{{ $t("visibleColumns") }}</div>
                        <label class="filter-option px-3">
                            <input class="form-check-input" type="checkbox" checked disabled />
                            <span>{{ $t("stackName") }}</span>
                        </label>
                        <label class="filter-option px-3">
                            <input v-model="visibleColumns.agent" class="form-check-input" type="checkbox" />
                            <span>{{ $t("Agent") }}</span>
                        </label>
                        <label class="filter-option px-3">
                            <input v-model="visibleColumns.status" class="form-check-input" type="checkbox" />
                            <span>{{ $t("Status") }}</span>
                        </label>
                        <label class="filter-option px-3">
                            <input v-model="visibleColumns.updates" class="form-check-input" type="checkbox" />
                            <span>{{ $t("updates") }}</span>
                        </label>
                    </div>
                </div>

                <div class="update-all-wrapper">
                    <button class="btn btn-primary" :disabled="processing || flatStackList.length === 0" @click="updateAll">
                        <font-awesome-icon icon="fa-cloud-arrow-down me-1" />
                        {{ $t("updateAll") }}
                    </button>
                </div>
            </div>

            <!-- TODO -->
            <div v-if="false" class="header-filter">
                <!--<StackListFilter :filterState="filterState" @update-filter="updateFilter" />-->
            </div>

            <!-- TODO: Selection Controls -->
            <div v-if="selectMode && false" class="selection-controls px-2 pt-2">
                <input v-model="selectAll" class="form-check-input select-input" type="checkbox" />

                <button class="btn-outline-normal" @click="pauseDialog">
                    <font-awesome-icon icon="pause" size="sm" /> {{ $t("Pause") }}
                </button>
                <button class="btn-outline-normal" @click="resumeSelected">
                    <font-awesome-icon icon="play" size="sm" /> {{ $t("Resume") }}
                </button>

                <span v-if="selectedStackCount > 0">
                    {{ $t("selectedStackCount", [selectedStackCount]) }}
                </span>
            </div>
        </div>

        <div ref="stackList" class="stack-list" :class="{ scrollbar: scrollbar }" :style="stackListStyle">
            <div v-if="flatStackList.length === 0" class="text-center mt-3">
                <router-link to="/compose">{{ $t("addFirstStackMsg") }}</router-link>
            </div>

            <div v-for="(agent, index) in agentStackList" :key="index" class="stack-list-inner">
                <div v-if="index === 0" class="stack-table-head" :style="columnGridStyle">
                    <span>{{ $t("stackName") }}</span>
                    <span v-if="visibleColumns.agent">{{ $t("Agent") }}</span>
                    <span v-if="visibleColumns.status">{{ $t("Status") }}</span>
                    <span v-if="visibleColumns.updates">{{ $t("updates") }}</span>
                </div>
                <div
                    v-if="$root.agentCount > 1"
                    class="p-2 agent-select"
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
                    v-for="(item, i) in agent.stacks"
                    v-show="$root.agentCount === 1 || !closedAgents.get(agent.endpoint)"
                    :key="i"
                    :stack="item"
                    :isSelectMode="selectMode"
                    :isSelected="isSelected"
                    :select="select"
                    :deselect="deselect"
                    :show-agent="visibleColumns.agent"
                    :show-status="visibleColumns.status"
                    :show-updates="visibleColumns.updates"
                    :grid-style="columnGridStyle"
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
import { CREATED_FILE, CREATED_STACK, EXITED, RUNNING, UNKNOWN } from "../../../common/util-common";

export default {
    components: { Confirm,
        StackListItem },
    props: {
        scrollbar: { type: Boolean },
    },
    data() {
        return {
            searchText: "",
            selectMode: false,
            selectAll: false,
            disableSelectAllWatcher: false,
            selectedStacks: {},
            windowTop: 0,
            filterDropdownOpen: false,
            columnDropdownOpen: false,
            visibleColumns: {
                agent: false,
                status: true,
                updates: true,
            },
            filterState: {
                status: [],
                agents: [],
                attributes: [],
            },
            closedAgents: new Map(),
            processing: false,
        };
    },
    computed: {
        boxStyle() {
            if (window.innerWidth > 550) {
                return { height: "calc(100vh - 148px)" };
            } else {
                return { height: "calc(100vh - 120px)" };
            }
        },
        /** Grouped stacks (PR #800 behavior), with filters + sort applied */
        agentStackList() {
            let result = Object.values(this.$root.completeStackList);

            // filter
            result = result.filter(stack => {
                // search text
                let searchTextMatch = true;
                if (this.searchText !== "") {
                    const lowered = this.searchText.toLowerCase();
                    searchTextMatch =
                        stack.name.toLowerCase().includes(lowered) ||
                        stack.tags.find(tag =>
                            tag.name.toLowerCase().includes(lowered) ||
                            tag.value?.toLowerCase().includes(lowered)
                        );
                }

                let statusMatch = true;
                if (this.filterState.status.length > 0) {
                    statusMatch = this.filterState.status.includes(stack.status);
                }

                let agentMatch = true;
                if (this.filterState.agents.length > 0) {
                    agentMatch = this.filterState.agents.includes(stack.endpoint || "current");
                }

                let attributeMatch = true;
                if (this.filterState.attributes.length > 0) {
                    attributeMatch = false;
                    for (const attribute of this.filterState.attributes) {
                        if (attribute === "hasUpdates" && stack.hasUpdates) {
                            attributeMatch = true;
                        }
                        if (attribute === "unmanaged" && !stack.isManagedByDockge) {
                            attributeMatch = true;
                        }
                    }
                }

                return searchTextMatch && statusMatch && agentMatch && attributeMatch;
            });

            // sort
            result.sort((m1, m2) => {
                if (m1.isManagedByDockge && !m2.isManagedByDockge) {
                    return -1;
                }
                if (!m1.isManagedByDockge && m2.isManagedByDockge) {
                    return 1;
                }

                if (m1.status !== m2.status) {
                    if (m2.status === RUNNING) {
                        return 1;
                    }
                    if (m1.status === RUNNING) {
                        return -1;
                    }
                    if (m2.status === EXITED) {
                        return 1;
                    }
                    if (m1.status === EXITED) {
                        return -1;
                    }
                    if (m2.status === CREATED_STACK) {
                        return 1;
                    }
                    if (m1.status === CREATED_STACK) {
                        return -1;
                    }
                    if (m2.status === CREATED_FILE) {
                        return 1;
                    }
                    if (m1.status === CREATED_FILE) {
                        return -1;
                    }
                    if (m2.status === UNKNOWN) {
                        return 1;
                    }
                    if (m1.status === UNKNOWN) {
                        return -1;
                    }
                }
                return m1.name.localeCompare(m2.name);
            });

            // group by endpoint with 'current' first, others alphabetical
            const groups = [
                ...result.reduce((acc, stack) => {
                    const endpoint = stack.endpoint || "current";
                    if (!acc.has(endpoint)) {
                        acc.set(endpoint, []);
                    }
                    acc.get(endpoint).push(stack);
                    return acc;
                }, new Map()).entries()
            ].map(([ endpoint, stacks ]) => ({ endpoint,
                stacks }));

            groups.sort((a, b) => {
                if (a.endpoint === "current" && b.endpoint !== "current") {
                    return -1;
                }
                if (a.endpoint !== "current" && b.endpoint === "current") {
                    return 1;
                }
                return a.endpoint.localeCompare(b.endpoint);
            });

            return groups;
        },
        /** flat list for convenience (button states, updateAll, selection watchers) */
        flatStackList() {
            return this.agentStackList.flatMap(g => g.stacks);
        },
        isDarkTheme() {
            return document.body.classList.contains("dark");
        },
        stackListStyle() {
            let listHeaderHeight = 96;
            if (this.selectMode) {
                listHeaderHeight += 42;
            }
            return { height: `calc(100% - ${listHeaderHeight}px)` };
        },
        columnGridStyle() {
            const columns = [ "minmax(100px, 1fr)" ];
            if (this.visibleColumns.agent) {
                columns.push("minmax(62px, .7fr)");
            }
            if (this.visibleColumns.status) {
                columns.push("68px");
            }
            if (this.visibleColumns.updates) {
                columns.push("34px");
            }
            return { gridTemplateColumns: columns.join(" ") };
        },
        selectedStackCount() {
            return Object.keys(this.selectedStacks).length;
        },
        filtersActive() {
            return this.filterState.status.length > 0 ||
                   this.filterState.agents.length > 0 ||
                   this.filterState.attributes.length > 0 ||
                   this.searchText !== "";
        },
        updatesOnlyActive() {
            return this.filterState.attributes.includes("hasUpdates");
        },
        updateCount() {
            return Object.values(this.$root.completeStackList).filter(stack => stack.hasUpdates).length;
        },
        statusFilterOptions() {
            return [
                { value: RUNNING,
                    label: "active" },
                { value: EXITED,
                    label: "exited" },
                { value: CREATED_STACK,
                    label: "created_stack" },
                { value: CREATED_FILE,
                    label: "inactive" },
                { value: UNKNOWN,
                    label: "unknown" },
            ];
        },
        agentFilterOptions() {
            return Object.values(this.$root.completeStackList)
                .reduce((options, stack) => {
                    const value = stack.endpoint || "current";
                    if (!options.find(option => option.value === value)) {
                        options.push({
                            value,
                            label: value === "current" ? this.$t("currentEndpoint") : value,
                        });
                    }
                    return options;
                }, [])
                .sort((a, b) => {
                    if (a.value === "current") {
                        return -1;
                    }
                    if (b.value === "current") {
                        return 1;
                    }
                    return a.label.localeCompare(b.label);
                });
        },
    },
    watch: {
        visibleColumns: {
            deep: true,
            handler(value) {
                window.localStorage.setItem("stackListColumns", JSON.stringify(value));
            },
        },
        searchText() {
            for (let stack of this.flatStackList) {
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
                    this.flatStackList.forEach((item) => {
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
        const savedColumns = window.localStorage.getItem("stackListColumns");
        if (savedColumns) {
            try {
                this.visibleColumns = { ...this.visibleColumns,
                    ...JSON.parse(savedColumns) };
            } catch {
                window.localStorage.removeItem("stackListColumns");
            }
        }
        window.addEventListener("scroll", this.onScroll);
    },
    beforeUnmount() {
        window.removeEventListener("scroll", this.onScroll);
    },
    methods: {
        toggleUpdatesOnly() {
            const attributes = this.filterState.attributes;
            const index = attributes.indexOf("hasUpdates");
            if (index >= 0) {
                attributes.splice(index, 1);
            } else {
                attributes.push("hasUpdates");
            }
        },
        onScroll() {
            if (window.top.scrollY <= 133) {
                this.windowTop = window.top.scrollY;
            } else {
                this.windowTop = 133;
            }
        },
        clearSearchText() {
            this.searchText = "";
        },
        clearFilters() {
            this.searchText = "";
            this.filterState = {
                status: [],
                agents: [],
                attributes: [],
            };
        },
        deselect(id) {
            delete this.selectedStacks[id];
        },
        select(id) {
            this.selectedStacks[id] = true;
        },
        isSelected(id) {
            return id in this.selectedStacks;
        },
        cancelSelectMode() {
            this.selectMode = false;
            this.selectedStacks = {};
        },
        pauseDialog() {
            this.$refs.confirmPause.show();
        },
        pauseSelected() {
            Object.keys(this.selectedStacks)
                .filter(id => this.$root.stackList[id].active)
                .forEach(id => this.$root.getSocket().emit("pauseStack", id, () => {}));
            this.cancelSelectMode();
        },
        resumeSelected() {
            Object.keys(this.selectedStacks)
                .filter(id => !this.$root.stackList[id].active)
                .forEach(id => this.$root.getSocket().emit("resumeStack", id, () => {}));
            this.cancelSelectMode();
        },
        updateAll() {
            this.processing = true;
            for (let stack of this.flatStackList) {
                this.$root.emitAgent(stack.endpoint, "updateStack", stack.name, (res) => {
                    this.processing = false;
                    this.$root.toastRes(res);
                });
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.stack-list-panel {
    min-height: 0;
}

.small-padding {
    padding-left: 5px !important;
    padding-right: 5px !important;
}

.list-header {
    border-bottom: 1px solid #35332e;
    margin-bottom: 0;
    padding-bottom: 12px;

    .dark & {
        background: transparent;
        border-bottom-color: $dark-border-color;
    }
}

.header-top {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;

    .placeholder { display: none; }
}

.header-filter {
    display: flex;
    align-items: center;
}

@media (max-width: 770px) {
    .list-header {
        margin: -20px;
        margin-bottom: 10px;
        padding: 5px;
    }
}

.search-wrapper {
    display: flex;
    flex: 1;
    align-items: center;
    min-width: 0;
    position: relative;

    form { width: 100%; }
}

.search-icon {
    left: 0;
    padding: 9px 10px;
    position: absolute;
    z-index: 1;
    color: #c0c0c0;

    // Clear filter button (X)
    svg[data-icon="times"] {
        cursor: pointer;
        transition: all ease-in-out 0.1s;

        &:hover {
            opacity: 0.5;
        }
    }
}

.search-input {
    max-width: none;
    padding-left: 34px;
    width: 100%;
}

.filter-wrapper {
    position: relative;
}

.filter-icon-container {
    align-items: center;
    border: 1px solid #3b3832;
    color: #b7b0a6;
    display: flex;
    gap: 7px;
    min-height: 34px;
    padding: 5px 10px;
    text-decoration: none;

    .dark & { border-color: $dark-border-color; }
}

.updates-only-toggle {
    align-items: center;
    background: #1c1b18;
    border: 1px solid #3b3832;
    border-radius: 7px;
    color: #b9b2a8;
    display: flex;
    font-size: 11px;
    gap: 7px;
    min-height: 34px;
    padding: 0 10px;

    span {
        align-items: center;
        background: #302c25;
        border-radius: 10px;
        color: #d9a35b;
        display: inline-flex;
        font-size: 10px;
        height: 18px;
        justify-content: center;
        min-width: 18px;
        padding: 0 5px;
    }

    &.active {
        background: rgba($primary, 0.12);
        border-color: rgba($primary, 0.65);
        color: #e7a366;
    }
}

.filter-icon {
    color: $dark-font-color3;
    cursor: pointer;
}

.filter-icon-active {
    color: $primary;
}

.filter-dropdown {
    background: #201f1b;
    border: 1px solid $dark-border-color;
    border-radius: 9px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
    color: $dark-font-color;
    min-width: 230px;
    padding: 8px 0;
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 10;
}

.column-dropdown { min-width: 190px; }

.filter-dropdown-clear {
    background: transparent;
    border: 0;
    color: $dark-font-color;
    padding: 6px 14px;
    text-align: left;
    width: 100%;

    &:disabled {
        color: $dark-font-color3;
        cursor: not-allowed;
    }
}

.filter-section {
    border-top: 1px solid $dark-border-color;
    margin-top: 6px;
    padding: 8px 14px 2px;
}

.filter-heading {
    color: $dark-font-color;
    font-size: 0.8rem;
    font-weight: 700;
    margin-bottom: 6px;
}

.filter-option {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 8px;
    margin-bottom: 7px;
    white-space: nowrap;
}

.stack-item {
    width: 100%;
}

.tags {
    margin-top: 4px;
    padding-left: 67px;
    display: flex;
    flex-wrap: wrap;
    gap: 0;
}

.bottom-style {
    padding-left: 67px;
    margin-top: 5px;
}

.selection-controls {
    margin-top: 5px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.agent-select {
    border-bottom: 1px solid #302e29;
    border-top: 1px solid #302e29;
    cursor: pointer;
    font-size: 11px;
    font-weight: 620;
    color: #aaa39a;
    min-height: 37px;
    padding: 8px 10px !important;
    display: flex;
    align-items: center;
    user-select: none;
}

.update-all-wrapper {
    display: none;

    .btn {
        background: transparent;
        border: 0;
        color: $primary;
        min-height: 34px;
        padding: 0 4px;
        white-space: nowrap;

        &:hover { color: lighten($primary, 8%); }
    }
}

.stack-list {
    padding-right: 0;
}

.stack-table-head {
    color: #8b857b;
    display: grid;
    font-size: 9px;
    gap: 8px;
    padding: 10px 8px 8px 12px;
    text-transform: uppercase;
}
</style>
