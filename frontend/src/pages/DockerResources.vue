<template>
    <transition name="slide-fade" appear>
        <div class="container-fluid resources-page">
            <div class="d-flex align-items-center justify-content-between mb-3">
                <h1 class="mb-0">{{ $t("resources") }}</h1>
                <button class="btn btn-normal" :disabled="loading" @click="loadResources">
                    <font-awesome-icon icon="arrows-rotate" class="me-1" />
                    {{ $t("refresh") }}
                </button>
            </div>

            <div class="btn-group mb-3" role="group">
                <button class="btn" :class="activeTab === 'containers' ? 'btn-primary' : 'btn-normal'" @click="activeTab = 'containers'">
                    {{ $tc("container", 2) }}
                    <span class="badge bg-secondary ms-1">{{ containers.length }}</span>
                </button>
                <button class="btn" :class="activeTab === 'networks' ? 'btn-primary' : 'btn-normal'" @click="activeTab = 'networks'">
                    {{ $tc("network", 2) }}
                    <span class="badge bg-secondary ms-1">{{ networks.length }}</span>
                </button>
                <button class="btn" :class="activeTab === 'volumes' ? 'btn-primary' : 'btn-normal'" @click="activeTab = 'volumes'">
                    {{ $tc("volume", 2) }}
                    <span class="badge bg-secondary ms-1">{{ volumes.length }}</span>
                </button>
            </div>

            <div v-if="loading" class="shadow-box big-padding">{{ $t("loading") }}</div>

            <div v-else-if="activeTab === 'containers'" class="resource-list">
                <div v-for="container in containers" :key="container.id" class="shadow-box big-padding resource-row">
                    <div class="resource-main">
                        <div>
                            <div class="resource-title">
                                {{ container.name }}
                                <span v-if="container.isolated" class="badge bg-warning text-dark ms-2">{{ $t("isolated") }}</span>
                            </div>
                            <div class="resource-subtitle">{{ container.image }}</div>
                        </div>
                        <button class="btn btn-sm btn-danger" @click="deleteResource('container', container.name)">
                            <font-awesome-icon icon="trash" />
                        </button>
                    </div>
                    <div class="resource-grid">
                        <div><strong>{{ $t("status") }}</strong><span>{{ container.status }}</span></div>
                        <div><strong>{{ $tc("network", 2) }}</strong><span>{{ formatList(container.networks) }}</span></div>
                        <div><strong>{{ $tc("port", 2) }}</strong><span>{{ container.ports || $t("notAvailableShort") }}</span></div>
                        <div><strong>{{ $tc("volume", 2) }}</strong><span>{{ formatMounts(container.mounts) }}</span></div>
                    </div>
                </div>
            </div>

            <div v-else-if="activeTab === 'networks'" class="resource-list">
                <div class="shadow-box big-padding resource-row">
                    <h4 class="mb-3">{{ $t("createNetwork") }}</h4>
                    <div class="create-grid">
                        <input v-model="newNetwork.name" class="form-control" :placeholder="$t('Network name...')" />
                        <select v-model="newNetwork.driver" class="form-select">
                            <option value="bridge">bridge</option>
                            <option value="macvlan">macvlan</option>
                            <option value="ipvlan">ipvlan</option>
                            <option value="overlay">overlay</option>
                        </select>
                        <input v-model="newNetwork.subnet" class="form-control" placeholder="Subnet e.g. 192.168.50.0/24" />
                        <input v-model="newNetwork.gateway" class="form-control" placeholder="Gateway e.g. 192.168.50.1" />
                        <input v-model="newNetwork.parent" class="form-control" placeholder="Parent interface e.g. eth0" />
                        <div class="create-switches">
                            <label class="form-check">
                                <input v-model="newNetwork.internal" class="form-check-input" type="checkbox" />
                                <span class="form-check-label">{{ $t("internal") }}</span>
                            </label>
                            <label class="form-check">
                                <input v-model="newNetwork.attachable" class="form-check-input" type="checkbox" />
                                <span class="form-check-label">{{ $t("attachable") }}</span>
                            </label>
                        </div>
                    </div>
                    <button class="btn btn-primary mt-3" :disabled="creatingNetwork || !newNetwork.name" @click="createNetwork">
                        <font-awesome-icon icon="plus" class="me-1" />
                        {{ $t("createNetwork") }}
                    </button>
                </div>

                <div v-for="network in networks" :key="network.id" class="shadow-box big-padding resource-row">
                    <div class="resource-main">
                        <div>
                            <div class="resource-title">
                                {{ network.name }}
                                <span v-if="network.isolated" class="badge bg-warning text-dark ms-2">{{ $t("isolated") }}</span>
                                <span v-if="network.internal" class="badge bg-info text-dark ms-1">{{ $t("internal") }}</span>
                                <span v-if="network.attachable" class="badge bg-secondary ms-1">{{ $t("attachable") }}</span>
                            </div>
                            <div class="resource-subtitle">{{ network.driver }} / {{ network.scope }}</div>
                        </div>
                        <button class="btn btn-sm btn-danger" :disabled="isBuiltInNetwork(network.name)" @click="deleteResource('network', network.name)">
                            <font-awesome-icon icon="trash" />
                        </button>
                    </div>
                    <div class="resource-grid">
                        <div><strong>{{ $t("driver") }}</strong><span>{{ network.driver }}</span></div>
                        <div><strong>{{ $t("scope") }}</strong><span>{{ network.scope }}</span></div>
                        <div><strong>IPAM</strong><span>{{ formatIPAM(network.ipam) }}</span></div>
                        <div><strong>{{ $t("options") }}</strong><span>{{ formatObject(network.options) }}</span></div>
                        <div><strong>{{ $tc("container", 2) }}</strong><span>{{ network.containers.length }}</span></div>
                    </div>
                </div>
            </div>

            <div v-else class="resource-list">
                <div v-for="volume in volumes" :key="volume.name" class="shadow-box big-padding resource-row">
                    <div class="resource-main">
                        <div>
                            <div class="resource-title">{{ volume.name }}</div>
                            <div class="resource-subtitle">{{ volume.driver }} / {{ volume.scope }}</div>
                        </div>
                        <button class="btn btn-sm btn-danger" @click="deleteResource('volume', volume.name)">
                            <font-awesome-icon icon="trash" />
                        </button>
                    </div>
                    <div class="resource-grid">
                        <div><strong>{{ $t("driver") }}</strong><span>{{ volume.driver }}</span></div>
                        <div><strong>{{ $t("scope") }}</strong><span>{{ volume.scope }}</span></div>
                        <div><strong>{{ $t("mountpoint") }}</strong><span>{{ volume.mountpoint }}</span></div>
                        <div><strong>{{ $t("options") }}</strong><span>{{ formatObject(volume.options) }}</span></div>
                    </div>
                </div>
            </div>
        </div>
    </transition>
</template>

<script>
export default {
    data() {
        return {
            activeTab: "containers",
            loading: true,
            containers: [],
            networks: [],
            volumes: [],
            creatingNetwork: false,
            newNetwork: {
                name: "",
                driver: "bridge",
                internal: false,
                attachable: false,
                subnet: "",
                gateway: "",
                parent: "",
            },
        };
    },
    mounted() {
        this.loadResources();
    },
    methods: {
        loadResources() {
            this.loading = true;
            this.$root.emitAgent("", "dockerResources", (res) => {
                this.loading = false;
                if (!res.ok) {
                    this.$root.toastRes(res);
                    return;
                }
                this.containers = res.resources.containers;
                this.networks = res.resources.networks;
                this.volumes = res.resources.volumes;
            });
        },
        deleteResource(type, name) {
            if (!confirm(`${this.$t("deleteDockerResourceMsg")} ${name}?`)) {
                return;
            }
            this.$root.emitAgent("", "deleteDockerResource", type, name, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadResources();
                }
            });
        },
        createNetwork() {
            this.creatingNetwork = true;
            const payload = {
                ...this.newNetwork,
                subnet: this.newNetwork.subnet.trim(),
                gateway: this.newNetwork.gateway.trim(),
                parent: this.newNetwork.parent.trim(),
            };
            this.$root.emitAgent("", "createDockerNetwork", payload, (res) => {
                this.creatingNetwork = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.newNetwork = {
                        name: "",
                        driver: "bridge",
                        internal: false,
                        attachable: false,
                        subnet: "",
                        gateway: "",
                        parent: "",
                    };
                    this.loadResources();
                }
            });
        },
        formatList(list) {
            if (!list || list.length === 0) {
                return this.$t("notAvailableShort");
            }
            return list.join(", ");
        },
        formatMounts(mounts) {
            if (!mounts || mounts.length === 0) {
                return this.$t("notAvailableShort");
            }
            return mounts.map(mount => `${mount.name} -> ${mount.destination}`).join(", ");
        },
        formatIPAM(ipam) {
            if (!ipam || ipam.length === 0) {
                return this.$t("notAvailableShort");
            }
            return ipam.map(row => [ row.Subnet, row.Gateway ].filter(Boolean).join(" / ")).join(", ");
        },
        formatObject(obj) {
            if (!obj || Object.keys(obj).length === 0) {
                return this.$t("notAvailableShort");
            }
            return Object.entries(obj).map(([ key, value ]) => `${key}: ${value}`).join(", ");
        },
        isBuiltInNetwork(name) {
            return [ "bridge", "host", "none" ].includes(name);
        },
    },
};
</script>

<style scoped lang="scss">
.resources-page {
    width: 98%;
}

.resource-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.resource-row {
    border-radius: 8px;
}

.resource-main {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
}

.resource-title {
    font-size: 1.05rem;
    font-weight: 600;
    word-break: break-word;
}

.resource-subtitle {
    color: #6c757d;
    font-size: 0.85rem;
    word-break: break-word;
}

.resource-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px 16px;

    div {
        min-width: 0;
    }

    strong {
        display: block;
        font-size: 0.75rem;
        color: #6c757d;
        text-transform: uppercase;
    }

    span {
        display: block;
        word-break: break-word;
    }
}

.create-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
}

.create-switches {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 38px;
}
</style>
