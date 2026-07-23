<template>
    <div class="shadow-box big-padding mb-3 container">
        <div class="container-header">
            <div class="container-summary">
                <div class="title-row">
                    <h4>{{ name }}</h4>
                    <span v-if="hasUpdate" class="update-indicator" :title="updateTitle">
                        <font-awesome-icon icon="cloud-arrow-down" />
                        {{ $t("updateAvailable") }}
                    </span>
                </div>
                <div class="image mb-2">
                    <span class="me-1">{{ imageName }}:</span><span class="tag">{{ imageTag }}</span>
                </div>
                <div>
                    <span class="badge me-1" :class="bgStyle">{{ status }}</span>

                    <a v-for="port in envsubstService.ports" :key="port" :href="parsePort(port).url" target="_blank">
                        <span class="badge me-1 bg-secondary">{{ parsePort(port).display }}</span>
                    </a>
                </div>
            </div>

            <div class="function">
                <div class="action-group" role="group">
                    <router-link v-if="status === 'running' || status === 'healthy'" class="btn btn-normal action-btn" :to="terminalRouteLink" disabled="">
                        <font-awesome-icon icon="terminal" />
                        {{ $t("console") }}
                    </router-link>
                    <router-link class="btn btn-normal action-btn" :to="logsRouteLink">
                        <font-awesome-icon icon="stream" />
                        {{ $t("logs") }}
                    </router-link>
                    <button
                        v-if="status !== 'running' && status !== 'healthy'"
                        class="btn btn-primary action-btn"
                        :disabled="processing"
                        @click="startService"
                    >
                        <font-awesome-icon icon="play" />
                        {{ $t("startStack") }}
                    </button>
                    <button
                        v-if="status === 'running' || status === 'healthy' || status === 'unhealthy'"
                        class="btn btn-normal action-btn"
                        :disabled="processing"
                        @click="stopService"
                    >
                        <font-awesome-icon icon="stop" />
                        {{ $t("stopStack") }}
                    </button>
                    <button
                        v-if="status === 'running' || status === 'healthy' || status === 'unhealthy'"
                        class="btn btn-normal action-btn"
                        :disabled="processing"
                        @click="restartService"
                    >
                        <font-awesome-icon icon="rotate" />
                        {{ $t("restartStack") }}
                    </button>
                </div>
            </div>
        </div>

        <div v-if="statsInstances.length > 0" class="mt-2">
            <div class="d-flex align-items-center gap-3">
                <template v-if="!expandedStats">
                    <div class="stats">
                        {{ $t('CPU') }}: {{ statsInstances[0].CPUPerc }}
                    </div>
                    <div class="stats">
                        {{ $t('memoryAbbreviated') }}: {{ statsInstances[0].MemUsage }}
                    </div>
                </template>
                <div class="d-flex flex-grow-1 justify-content-end">
                    <button class="btn btn-sm btn-normal" @click="expandedStats = !expandedStats">
                        <font-awesome-icon :icon="expandedStats ? 'chevron-up' : 'chevron-down'" />
                    </button>
                </div>
            </div>
            <transition name="slide-fade" appear>
                <div v-if="expandedStats" class="d-flex flex-column gap-3 mt-2">
                    <DockerStat
                        v-for="stat in statsInstances"
                        :key="stat.Name"
                        :stat="stat"
                    />
                </div>
            </transition>
        </div>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { parseDockerPort } from "../../../common/util-common";
import DockerStat from "./DockerStat.vue";

export default defineComponent({
    components: {
        FontAwesomeIcon,
        DockerStat
    },
    props: {
        name: {
            type: String,
            required: true,
        },
        serviceStatus: {
            type: Object,
            default: null,
        },
        dockerStats: {
            type: Object,
            default: null,
        },
        updateServices: {
            type: Array,
            default: () => [],
        },
        processing: {
            type: Boolean,
            default: false,
        }
    },
    emits: [
        "start-service",
        "stop-service",
        "restart-service"
    ],
    data() {
        return {
            expandedStats: false,
        };
    },
    computed: {
        bgStyle() {
            if (this.status === "running" || this.status === "healthy") {
                return "bg-primary";
            } else if (this.status === "unhealthy") {
                return "bg-danger";
            } else {
                return "bg-secondary";
            }
        },

        terminalRouteLink() {
            if (this.endpoint) {
                return {
                    name: "containerTerminalEndpoint",
                    params: {
                        endpoint: this.endpoint,
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            } else {
                return {
                    name: "containerTerminal",
                    params: {
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            }
        },

        logsRouteLink() {
            if (this.endpoint) {
                return {
                    name: "containerTerminalEndpoint",
                    params: {
                        endpoint: this.endpoint,
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "logs",
                    },
                };
            } else {
                return {
                    name: "containerTerminal",
                    params: {
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "logs",
                    },
                };
            }
        },

        endpoint() {
            return this.$parent.$parent.endpoint;
        },

        stack() {
            return this.$parent.$parent.stack;
        },

        stackName() {
            return this.$parent.$parent.stack.name;
        },

        service() {
            if (!this.jsonObject.services[this.name]) {
                return {};
            }
            return this.jsonObject.services[this.name];
        },

        jsonObject() {
            return this.$parent.$parent.jsonConfig;
        },

        envsubstJSONConfig() {
            return this.$parent.$parent.envsubstJSONConfig;
        },

        envsubstService() {
            if (!this.envsubstJSONConfig.services[this.name]) {
                return {};
            }
            return this.envsubstJSONConfig.services[this.name];
        },

        imageName() {
            if (this.envsubstService.image) {
                return this.envsubstService.image.split(":")[0];
            } else {
                return "";
            }
        },

        imageTag() {
            if (this.envsubstService.image) {
                let tag = this.envsubstService.image.split(":")[1];

                if (tag) {
                    return tag;
                } else {
                    return "latest";
                }
            } else {
                return "";
            }
        },
        hasUpdate() {
            return this.updateServices.includes(this.name);
        },
        updateTitle() {
            return `${this.$t("updateAvailable")}: ${this.envsubstService.image || this.name}`;
        },
        statsInstances() {
            if (!this.serviceStatus) {
                return [];
            }

            return this.serviceStatus
                .map(s => this.dockerStats[s.name])
                .filter(s => !!s)
                .sort((a, b) => a.Name.localeCompare(b.Name));
        },
        status() {
            if (!this.serviceStatus) {
                return "N/A";
            }
            return this.serviceStatus[0].status;
        }
    },
    methods: {
        parsePort(port) {
            if (this.stack.endpoint) {
                return parseDockerPort(port, this.stack.primaryHostname);
            } else {
                let hostname = this.$root.info.primaryHostname || location.hostname;
                return parseDockerPort(port, hostname);
            }
        },
        startService() {
            this.$emit("start-service", this.name);
        },
        stopService() {
            this.$emit("stop-service", this.name);
        },
        restartService() {
            this.$emit("restart-service", this.name);
        }

    }
});
</script>

<style scoped lang="scss">
@import "../styles/vars";

.container {
    background: #111318 !important;
    border-color: #292e35 !important;
    border-radius: 6px !important;
    margin-bottom: 8px !important;
    max-width: none;
    padding: 10px 12px !important;

    .container-header {
        align-items: center;
        display: grid;
        gap: 12px;
        grid-template-columns: minmax(210px, 1fr) auto;
    }

    .container-summary {
        min-width: 0;
    }

    .title-row {
        align-items: center;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;

        h4 {
            color: #e5e8ec;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 0;
            max-width: 100%;
            overflow-wrap: anywhere;
        }
    }

    .image {
        color: #89919c;
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        margin: 3px 0 5px !important;
        overflow-wrap: anywhere;

        .tag {
            color: #aeb5bf;
        }
    }

    .function {
        display: flex;
        min-width: 0;
        justify-content: end;
    }

    .action-group {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        justify-content: end;
    }

    .action-btn {
        align-items: center;
        border-radius: 5px !important;
        display: inline-flex;
        gap: 0.35rem;
        font-size: 12px;
        line-height: 1.2;
        min-height: 30px;
        padding: 0.3rem 0.55rem;

        svg {
            flex: 0 0 auto;
            font-size: 0.9rem;
            height: 0.9rem;
            width: 0.9rem;
        }
    }

    .update-indicator {
        align-items: center;
        color: #d8aa51;
        display: inline-flex;
        font-size: 0.78rem;
        font-weight: 600;
        gap: 0.25rem;
        line-height: 1.2;

        svg {
            height: 0.78rem;
            width: 0.78rem;
        }
    }

    .stats {
        color: #a8b3c1;
        font-size: 12px;
    }

}

@media (max-width: 980px) {
    .container .container-header {
        align-items: start;
        grid-template-columns: 1fr;
    }

    .container .function,
    .container .action-group { justify-content: start; }
}
</style>
