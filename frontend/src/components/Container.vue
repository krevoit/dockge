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
                    <span class="badge me-1" :class="bgStyle">{{ status === "N/A" ? $t("notDeployed") : status }}</span>

                    <a v-for="port in envsubstService.ports" :key="port" :href="parsePort(port).url" target="_blank">
                        <span class="badge me-1 bg-secondary">{{ parsePort(port).display }}</span>
                    </a>
                </div>
            </div>

            <div v-if="runtimeActions || creationMode" class="function">
                <div class="action-group" role="group">
                    <router-link v-if="runtimeActions && (status === 'running' || status === 'healthy')" class="btn btn-normal action-btn" :to="terminalRouteLink" title="Open web terminal">
                        <font-awesome-icon icon="terminal" />
                        <span>{{ $t("console") }}</span>
                    </router-link>
                    <router-link v-if="runtimeActions" class="btn btn-normal action-btn" :to="logsRouteLink">
                        <font-awesome-icon icon="stream" />
                        {{ $t("logs") }}
                    </router-link>
                    <button
                        v-if="runtimeActions && status !== 'running' && status !== 'healthy'"
                        class="btn btn-primary action-btn"
                        :disabled="processing"
                        @click="startService"
                    >
                        <font-awesome-icon icon="play" />
                        {{ $t("startStack") }}
                    </button>
                    <button
                        v-if="runtimeActions && (status === 'running' || status === 'healthy' || status === 'unhealthy')"
                        class="btn btn-normal action-btn"
                        :disabled="processing"
                        @click="stopService"
                    >
                        <font-awesome-icon icon="stop" />
                        {{ $t("stopStack") }}
                    </button>
                    <button
                        v-if="runtimeActions && (status === 'running' || status === 'healthy' || status === 'unhealthy')"
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

        <div v-if="isEditMode" class="mt-2">
            <button class="btn btn-normal btn-sm action-btn me-2" :aria-expanded="showConfig" @click="showConfig = !showConfig">
                <font-awesome-icon :icon="showConfig ? 'chevron-up' : 'edit'" />
                {{ $t("Edit") }}
            </button>
            <button class="btn btn-outline-danger btn-sm action-btn me-2" @click="remove">
                <font-awesome-icon icon="trash" />
                {{ $t("deleteContainer") }}
            </button>
        </div>
        <div v-else-if="liveStats" class="mt-2">
            <div class="live-stats">
                <div class="meter" :title="cpuTitle">
                    <div class="meter-head">
                        <span class="meter-label">{{ $t("CPU") }}</span>
                        <span class="meter-value">{{ formatPercent(liveStats.cpu) }}</span>
                    </div>
                    <Sparkline class="meter-spark cpu" :values="cpuHistory" :min-scale="1" />
                    <div class="meter-bar">
                        <div class="meter-fill cpu" :class="levelClass(cpuBarPercent)" :style="{ width: cpuBarPercent + '%' }"></div>
                    </div>
                </div>
                <div class="meter" :title="memTitle">
                    <div class="meter-head">
                        <span class="meter-label">{{ $t("memory") }}</span>
                        <span class="meter-value">
                            {{ formatBytes(liveStats.mem) }}<span v-if="liveStats.memLimit" class="meter-limit"> / {{ formatBytes(liveStats.memLimit) }}</span>
                        </span>
                    </div>
                    <Sparkline class="meter-spark mem" :values="memHistory" />
                    <div class="meter-bar">
                        <div class="meter-fill mem" :class="levelClass(memBarPercent)" :style="{ width: memBarPercent + '%' }"></div>
                    </div>
                </div>
                <button class="btn btn-sm btn-normal stats-toggle" :aria-expanded="expandedStats" :title="$t('networkIO') + ' / ' + $t('blockIO')" @click="expandedStats = !expandedStats">
                    <font-awesome-icon :icon="expandedStats ? 'chevron-up' : 'chevron-down'" />
                </button>
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

        <!-- next-dev restored: per-service GUI editing (upstream feature).
             Works on jsonConfig.services[name] via ArrayInput/ArraySelect. -->
        <transition name="slide-fade" appear>
            <div v-if="isEditMode && showConfig" class="config mt-3">
                <div>
                    <label class="form-label">{{ $t("dockerImage") }}</label>
                    <input v-model="service.image" class="form-control" list="image-datalist" placeholder="nginx:latest" />
                    <datalist id="image-datalist">
                        <option value="louislam/uptime-kuma:1" />
                    </datalist>
                </div>
                <div>
                    <label class="form-label">{{ $t("restartPolicy") }}</label>
                    <select v-model="restartPolicy" class="form-select">
                        <option value="">{{ $t("restartPolicyNotSet") }}</option>
                        <option value="always">{{ $t("restartPolicyAlways") }}</option>
                        <option value="unless-stopped">{{ $t("restartPolicyUnlessStopped") }}</option>
                        <option value="on-failure">{{ $t("restartPolicyOnFailure") }}</option>
                        <option value="no">{{ $t("restartPolicyNo") }}</option>
                    </select>
                </div>
                <div>
                    <label class="form-label">{{ $t("port", 2) }}</label>
                    <ArrayInput name="ports" :display-name="$t('port')" placeholder="HOST:CONTAINER" />
                </div>
                <div>
                    <label class="form-label">{{ $t("volume", 2) }}</label>
                    <ArrayInput name="volumes" :display-name="$t('volume')" placeholder="HOST:CONTAINER" />
                </div>
                <div class="span-2">
                    <label class="form-label">{{ $t("environmentVariable", 2) }}</label>
                    <ArrayInput name="environment" :display-name="$t('environmentVariable')" placeholder="KEY=VALUE" allow-map />
                </div>
                <div>
                    <label class="form-label">{{ $t("network", 2) }}</label>
                    <div v-if="networkList.length === 0 && service.networks && service.networks.length > 0" class="text-warning mb-3">
                        {{ $t("NoNetworksAvailable") }}
                    </div>
                    <ArraySelect name="networks" :display-name="$t('network')" placeholder="Network Name" :options="networkList" />
                    <div class="form-text">{{ $t("serviceNetworksHelp") }}</div>
                </div>
                <div>
                    <label class="form-label">{{ $t("dependsOn") }}</label>
                    <ArrayInput name="depends_on" :display-name="$t('dependsOn')" :placeholder="$t('containerName')" />
                </div>
            </div>
        </transition>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { parseDockerPort } from "../../../common/util-common";
import DockerStat from "./DockerStat.vue";
import Sparkline from "./Sparkline.vue";
import { formatBytes, formatPercent, summarizeDockerStats } from "../util-frontend";
import ArrayInput from "./ArrayInput.vue";
import ArraySelect from "./ArraySelect.vue";

export default defineComponent({
    components: {
        FontAwesomeIcon,
        DockerStat,
        Sparkline,
        ArrayInput,
        ArraySelect
    },
    props: {
        name: {
            type: String,
            required: true,
        },
        isEditMode: {
            type: Boolean,
            default: false,
        },
        serviceStatus: {
            type: Object,
            default: null,
        },
        dockerStats: {
            type: Object,
            default: null,
        },
        // { ncpu, memTotal } of the Docker host (missing on older agents)
        dockerHost: {
            type: Object,
            default: null,
        },
        // Recent { cpu, mem } samples for this service, newest last
        statsHistory: {
            type: Array,
            default: () => [],
        },
        updateServices: {
            type: Array,
            default: () => [],
        },
        runtimeActions: {
            type: Boolean,
            default: true,
        },
        creationMode: {
            type: Boolean,
            default: false,
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
            showConfig: false,
        };
    },
    computed: {
        networkList() {
            const nets = this.jsonObject?.networks || {};
            return Object.keys(nets);
        },
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
        liveStats() {
            if (this.statsInstances.length === 0) {
                return null;
            }
            const summary = summarizeDockerStats(this.statsInstances);
            // Without a memory limit docker reports the host's total memory for every replica
            const hostMem = this.dockerHost?.memTotal;
            if (hostMem && summary.memLimit > hostMem) {
                summary.memLimit = hostMem;
            }
            return summary;
        },
        cpuBarPercent() {
            // docker stats reports CPU relative to one core; scale the bar to the whole host
            const cores = this.dockerHost?.ncpu || 1;
            return Math.min(100, this.liveStats.cpu / cores);
        },
        memBarPercent() {
            if (!this.liveStats.memLimit) {
                return 0;
            }
            return Math.min(100, this.liveStats.mem / this.liveStats.memLimit * 100);
        },
        cpuHistory() {
            return this.statsHistory.map(s => s.cpu);
        },
        memHistory() {
            return this.statsHistory.map(s => s.mem);
        },
        cpuTitle() {
            const cores = this.dockerHost?.ncpu;
            return cores ? this.$t("cpuStatTitle", { cores }) : this.$t("CPU");
        },
        memTitle() {
            return this.$t("memStatTitle", { percent: this.memBarPercent.toFixed(1) });
        },
        restartPolicy: {
            get() {
                return this.service.restart ?? "";
            },
            set(value) {
                if (value) {
                    this.service.restart = value;
                } else {
                    delete this.service.restart;
                }
            },
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
        formatBytes,
        formatPercent,
        levelClass(percent) {
            if (percent >= 95) {
                return "danger";
            }
            if (percent >= 85) {
                return "warn";
            }
            return "";
        },
        parsePort(port) {
            if (this.stack.endpoint) {
                return parseDockerPort(port, this.stack.primaryHostname);
            } else {
                let hostname = this.$root.info.primaryHostname || location.hostname;
                return parseDockerPort(port, hostname);
            }
        },
        remove() {
            // next-dev restored: delete service from compose JSON (edit mode)
            if (!confirm(`Delete container ${this.name}?`)) {
                return;
            }
            delete this.jsonObject.services[this.name];
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
    background: var(--ct-111318) !important;
    border-color: var(--ct-292e35) !important;
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
            color: var(--ct-e5e8ec);
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 0;
            max-width: 100%;
            overflow-wrap: anywhere;
        }
    }

    .image {
        color: var(--ct-89919c);
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        margin: 3px 0 5px !important;
        overflow-wrap: anywhere;

        .tag {
            color: var(--ct-aeb5bf);
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

    .terminal-preview {
        cursor: not-allowed;
        opacity: 0.72;
    }

    .update-indicator {
        align-items: center;
        color: var(--ct-d8aa51);
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

    .config {
        border-top: 1px solid var(--ct-292e35);
        display: grid;
        gap: 16px 20px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        padding-top: 14px;

        .span-2 {
            grid-column: 1 / -1;
        }

        .form-label {
            color: var(--ct-89919c);
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 6px;
        }

        .form-text {
            font-size: 12px;
        }
    }

    .live-stats {
        align-items: end;
        border-top: 1px solid var(--ct-292e35);
        display: grid;
        gap: 16px;
        grid-template-columns: 1fr 1fr auto;
        padding-top: 8px;
    }

    .meter {
        min-width: 0;
    }

    .meter-head {
        align-items: baseline;
        display: flex;
        gap: 8px;
        justify-content: space-between;
        margin-bottom: 2px;
    }

    .meter-label {
        color: var(--ct-89919c);
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .meter-value {
        color: var(--ct-e5e8ec);
        font-family: "JetBrains Mono", monospace;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    .meter-limit {
        color: var(--ct-89919c);
    }

    .meter-spark {
        --spark-height: 26px;

        &.cpu {
            color: var(--stat-cpu);
        }

        &.mem {
            color: var(--stat-mem);
        }
    }

    .meter-bar {
        background: var(--stat-track);
        border-radius: 2px;
        height: 3px;
        margin-top: 3px;
        overflow: hidden;
    }

    .meter-fill {
        border-radius: 2px;
        height: 100%;
        transition: width 0.6s ease;

        &.cpu {
            background: var(--stat-cpu);
        }

        &.mem {
            background: var(--stat-mem);
        }

        &.warn {
            background: var(--stat-warn);
        }

        &.danger {
            background: var(--stat-danger);
        }
    }

    .stats-toggle {
        align-self: center;
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

@media (max-width: 767px) {
    .container .config {
        grid-template-columns: minmax(0, 1fr);
    }
}

@media (max-width: 576px) {
    .container .live-stats {
        gap: 10px;
        grid-template-columns: 1fr 1fr auto;
    }

    .container .meter-value {
        font-size: 11px;
    }

    .container .meter-limit {
        display: none;
    }
}
</style>

<style lang="scss">
// Container card colours: dark values are the original design, light values for the light theme
:root, .light {
    --ct-111318: #ffffff;
    --ct-292e35: #e1e4e8;
    --ct-89919c: #5f656d;
    --ct-a8b3c1: #5f656d;
    --ct-aeb5bf: #5f656d;
    --ct-d8aa51: #9a6a10;
    --ct-e5e8ec: #1d232b;
}

.dark {
    --ct-111318: #111318;
    --ct-292e35: #292e35;
    --ct-89919c: #89919c;
    --ct-a8b3c1: #a8b3c1;
    --ct-aeb5bf: #aeb5bf;
    --ct-d8aa51: #d8aa51;
    --ct-e5e8ec: #e5e8ec;
}
</style>
