<template>
    <router-link :to="url" :class="{ 'dim' : !stack.isManagedByDockge }" :style="gridStyle" class="item">
        <div class="stack-name-cell">
            <Uptime :stack="stack" :fixed-width="true" />
            <div class="title">
                <span>{{ stackName }}</span>
            </div>
        </div>
        <span v-if="showAgent" class="endpoint">{{ endpointDisplay }}</span>
        <span v-if="showStatus" class="status-text">{{ statusText }}</span>
        <span v-if="showUpdates" class="update-cell">
            <font-awesome-icon v-if="stack.hasUpdates" class="update-indicator" icon="cloud-arrow-down" :title="updateTitle" />
            <span v-else>—</span>
        </span>
    </router-link>
</template>

<script>
import Uptime from "./Uptime.vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { statusNameShort } from "../../../common/util-common";

export default {
    components: {
        Uptime,
        FontAwesomeIcon
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
        showAgent: {
            type: Boolean,
            default: true,
        },
        showStatus: {
            type: Boolean,
            default: true,
        },
        showUpdates: {
            type: Boolean,
            default: true,
        },
        gridStyle: {
            type: Object,
            default: () => ({}),
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
        },
        updateTitle() {
            if (this.stack.updateServices?.length > 0) {
                return `${this.$t("updateAvailable")}: ${this.stack.updateServices.join(", ")}`;
            }
            return this.$t("updateAvailable");
        },
        statusText() {
            return this.$t(statusNameShort(this.stack?.status));
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

.small-padding {
    padding-left: 5px !important;
    padding-right: 5px !important;
}

.collapse-padding {
    padding-left: 8px !important;
    padding-right: 2px !important;
}

.item {
    text-decoration: none;
    display: flex;
    display: grid;
    gap: 8px;
    align-items: center;
    min-height: 43px;
    border-bottom: 1px solid #302e29;
    border-left: 2px solid transparent;
    border-radius: 0;
    transition: all ease-in-out 0.15s;
    width: 100%;
    padding: 5px 8px 5px 10px;
    &.disabled {
        opacity: 0.3;
    }
    &:hover {
        background-color: rgba($primary, 0.07);
    }
    &.active {
        background-color: rgba($primary, 0.17);
        border-left-color: $primary;
    }
    .stack-name-cell {
        align-items: center;
        display: flex;
        gap: 10px;
        min-width: 0;
    }

    .title {
        color: #262a2f;
        font-size: 11px;
        font-weight: 570;
        line-height: 1.25;

        .dark & { color: #e2e4e7; }
    }
    .update-indicator {
        color: #df8a43;
        font-size: 11px;
    }
    .endpoint {
        font-family: "JetBrains Mono", monospace;
        font-size: 10px;
        color: $dark-font-color3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.status-text {
    color: #979188;
    font-size: 10px;
    text-transform: capitalize;
}

.update-cell {
    color: $dark-font-color3;
    font-size: 10px;
    text-align: center;
}

.collapsed {
    transform: rotate(-90deg);
}

.animated {
    transition: all 0.2s $easing-in;
}

.select-input-wrapper {
    float: left;
    margin-top: 15px;
    margin-left: 3px;
    margin-right: 10px;
    padding-left: 4px;
    position: relative;
    z-index: 15;
}

.dim {
    opacity: 0.5;
}

</style>
