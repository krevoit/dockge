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
                <button class="btn" :class="activeTab === 'images' ? 'btn-primary' : 'btn-normal'" @click="activeTab = 'images'">
                    {{ $tc("image", 2) }}
                    <span class="badge bg-secondary ms-1">{{ images.length }}</span>
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
                    <div class="driver-options mt-3">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <h5 class="mb-0">{{ $t("driverOptions") }}</h5>
                            <button class="btn btn-sm btn-normal" @click="addNetworkOption">
                                <font-awesome-icon icon="plus" class="me-1" />
                                {{ $t("addOption") }}
                            </button>
                        </div>
                        <div v-for="(option, index) in newNetwork.options" :key="index" class="option-row">
                            <input v-model="option.key" class="form-control" :placeholder="$t('key')" />
                            <input v-model="option.value" class="form-control" :placeholder="$t('value')" />
                            <button class="btn btn-sm btn-danger" @click="removeNetworkOption(index)">
                                <font-awesome-icon icon="trash" />
                            </button>
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
                                <span v-if="network.unused" class="badge bg-secondary ms-1">{{ $t("unused") }}</span>
                                <span v-if="network.internal" class="badge bg-info text-dark ms-1">{{ $t("internal") }}</span>
                                <span v-if="network.attachable" class="badge bg-secondary ms-1">{{ $t("attachable") }}</span>
                            </div>
                            <div class="resource-subtitle">{{ network.driver }} / {{ network.scope }}</div>
                        </div>
                        <button v-if="!isBuiltInNetwork(network.name)" class="btn btn-sm btn-danger" @click="deleteResource('network', network.name)">
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
                    <div v-if="canManageNetwork(network.name)" class="network-members mt-3">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <h5 class="mb-0">{{ $t("networkMembers") }}</h5>
                            <div class="network-connect">
                                <select v-model="selectedNetworkContainers[network.name]" class="form-select form-select-sm">
                                    <option value="">{{ $t("selectContainer") }}</option>
                                    <option v-for="container in availableContainersForNetwork(network)" :key="container.id" :value="container.name">
                                        {{ container.name }}
                                    </option>
                                </select>
                                <button class="btn btn-sm btn-primary" :disabled="!selectedNetworkContainers[network.name]" @click="connectNetwork(network.name)">
                                    <font-awesome-icon icon="link" />
                                </button>
                            </div>
                        </div>
                        <div v-if="network.containers.length === 0" class="resource-subtitle">{{ $t("notAvailableShort") }}</div>
                        <div v-else class="member-list">
                            <div v-for="container in network.containers" :key="container.id" class="member-row">
                                <div>
                                    <strong>{{ container.name }}</strong>
                                    <span>{{ container.ipv4 || container.ipv6 || $t("notAvailableShort") }}</span>
                                </div>
                                <button class="btn btn-sm btn-normal" @click="disconnectNetwork(network.name, container.name)">
                                    <font-awesome-icon icon="unlink" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else-if="activeTab === 'volumes'" class="resource-list">
                <div v-for="volume in volumes" :key="volume.name" class="shadow-box big-padding resource-row">
                    <div class="resource-main">
                        <div>
                            <div class="resource-title">
                                {{ volume.name }}
                                <span v-if="volume.unused" class="badge bg-secondary ms-2">{{ $t("unused") }}</span>
                            </div>
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
                        <div><strong>{{ $t("usedBy") }}</strong><span>{{ formatList(volume.usedBy) }}</span></div>
                    </div>
                </div>
            </div>

            <div v-if="!loading && activeTab === 'images'" class="resource-list">
                <div v-for="image in images" :key="image.id + image.name" class="shadow-box big-padding resource-row">
                    <div class="resource-main">
                        <div>
                            <div class="resource-title">
                                {{ image.name }}
                                <span v-if="image.unused" class="badge bg-secondary ms-2">{{ $t("unused") }}</span>
                                <span v-if="image.dangling" class="badge bg-warning text-dark ms-1">{{ $t("dangling") }}</span>
                            </div>
                            <div class="resource-subtitle">{{ image.id }}</div>
                        </div>
                        <button class="btn btn-sm btn-danger" @click="deleteResource('image', image.name)">
                            <font-awesome-icon icon="trash" />
                        </button>
                    </div>
                    <div class="resource-grid">
                        <div><strong>{{ $t("repository") }}</strong><span>{{ image.repository }}</span></div>
                        <div><strong>{{ $t("tag") }}</strong><span>{{ image.tag }}</span></div>
                        <div><strong>{{ $t("size") }}</strong><span>{{ image.size }}</span></div>
                        <div><strong>{{ $t("createdAt") }}</strong><span>{{ image.createdAt }}</span></div>
                        <div><strong>{{ $t("usedBy") }}</strong><span>{{ image.usedBy.length }}</span></div>
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
            images: [],
            selectedNetworkContainers: {},
            creatingNetwork: false,
            newNetwork: {
                name: "",
                driver: "bridge",
                internal: false,
                attachable: false,
                subnet: "",
                gateway: "",
                parent: "",
                options: [],
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
                this.images = res.resources.images || [];
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
                options: this.newNetwork.options
                    .map(option => ({
                        key: option.key.trim(),
                        value: option.value.trim(),
                    }))
                    .filter(option => option.key && option.value),
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
                        options: [],
                    };
                    this.loadResources();
                }
            });
        },
        addNetworkOption() {
            this.newNetwork.options.push({
                key: "",
                value: "",
            });
        },
        removeNetworkOption(index) {
            this.newNetwork.options.splice(index, 1);
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
        canManageNetwork(name) {
            return ![ "host", "none" ].includes(name);
        },
        availableContainersForNetwork(network) {
            const attached = new Set(network.containers.map(container => container.name));
            return this.containers.filter(container => !attached.has(container.name));
        },
        connectNetwork(networkName) {
            const containerName = this.selectedNetworkContainers[networkName];
            if (!containerName) {
                return;
            }
            this.$root.emitAgent("", "connectDockerNetwork", networkName, containerName, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.selectedNetworkContainers[networkName] = "";
                    this.loadResources();
                }
            });
        },
        disconnectNetwork(networkName, containerName) {
            this.$root.emitAgent("", "disconnectDockerNetwork", networkName, containerName, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadResources();
                }
            });
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

.driver-options {
    h5 {
        font-size: 0.95rem;
    }
}

.option-row {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) minmax(160px, 2fr) auto;
    gap: 8px;
    margin-top: 8px;
}

.network-members {
    border-top: 1px solid rgba(128, 128, 128, 0.18);
    padding-top: 12px;
}

.network-connect {
    display: grid;
    grid-template-columns: minmax(180px, 260px) auto;
    gap: 8px;
}

.member-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 8px;
}

.member-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid rgba(128, 128, 128, 0.18);
    border-radius: 8px;
    padding: 8px 10px;

    strong,
    span {
        display: block;
        word-break: break-word;
    }

    span {
        color: #6c757d;
        font-size: 0.8rem;
    }
}

@media (max-width: 640px) {
    .option-row,
    .network-connect {
        grid-template-columns: 1fr;
    }
}
</style>
