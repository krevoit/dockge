<template>
    <transition name="slide-fade" appear>
        <div>
            <div class="d-flex align-items-center justify-content-between mb-3">
                <h1 class="mb-0">{{ $t("files") }} - {{ serviceName }} ({{ stackName }})</h1>
                <button class="btn btn-normal" :disabled="loading" @click="loadFiles">
                    <font-awesome-icon icon="arrows-rotate" class="me-1" />
                    {{ $t("refresh") }}
                </button>
            </div>

            <div class="input-group mb-3">
                <button class="btn btn-normal" :disabled="currentPath === '/'" @click="goUp">
                    ..
                </button>
                <input v-model="pathInput" class="form-control" @keyup.enter="openPath(pathInput)" />
                <button class="btn btn-primary" @click="openPath(pathInput)">
                    {{ $t("open") }}
                </button>
            </div>

            <div class="shadow-box big-padding mb-3 upload-panel">
                <h4>{{ $t("uploadFile") }}</h4>
                <div class="upload-grid">
                    <input ref="uploadInput" class="form-control" type="file" @change="selectUploadFile" />
                    <input v-model="uploadFilename" class="form-control" :placeholder="$t('fileName')" />
                    <button class="btn btn-primary" :disabled="uploading || !uploadFile" @click="uploadSelectedFile">
                        <font-awesome-icon icon="upload" class="me-1" />
                        {{ $t("upload") }}
                    </button>
                </div>
                <div class="form-text">{{ currentPath }}</div>
            </div>

            <div v-if="loading" class="shadow-box big-padding">{{ $t("loading") }}</div>

            <div v-else class="shadow-box file-manager">
                <table class="table table-hover mb-0">
                    <thead>
                        <tr>
                            <th>{{ $t("fileName") }}</th>
                            <th>{{ $t("type") }}</th>
                            <th>{{ $t("size") }}</th>
                            <th>{{ $t("permissions") }}</th>
                            <th>{{ $t("modified") }}</th>
                            <th class="text-end">{{ $t("actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="entry in entries" :key="entry.name">
                            <td>
                                <button v-if="entry.type === 'directory'" class="btn btn-link p-0" @click="openPath(joinPath(currentPath, entry.name))">
                                    {{ entry.name }}
                                </button>
                                <span v-else>{{ entry.name }}</span>
                            </td>
                            <td>{{ entry.type }}</td>
                            <td>{{ formatSize(entry.size) }}</td>
                            <td>{{ entry.mode || $t("notAvailableShort") }}</td>
                            <td>{{ entry.modified || $t("notAvailableShort") }}</td>
                            <td class="text-end">
                                <div class="btn-group">
                                    <button v-if="entry.type !== 'directory'" class="btn btn-sm btn-normal" @click="readFile(joinPath(currentPath, entry.name))">
                                        <font-awesome-icon icon="eye" />
                                    </button>
                                    <button v-if="entry.type !== 'directory'" class="btn btn-sm btn-normal" @click="downloadFile(joinPath(currentPath, entry.name))">
                                        <font-awesome-icon icon="download" />
                                    </button>
                                    <button class="btn btn-sm btn-normal" @click="showChmod(joinPath(currentPath, entry.name), entry.mode)">
                                        <font-awesome-icon icon="wrench" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div v-if="selectedFile" class="shadow-box big-padding mt-3">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <h4 class="mb-0">{{ selectedFile }}</h4>
                    <div>
                        <button class="btn btn-primary me-2" :disabled="saving" @click="saveFile">
                            <font-awesome-icon icon="save" class="me-1" />
                            {{ $t("Save") }}
                        </button>
                        <button class="btn btn-normal" @click="selectedFile = ''">
                            <font-awesome-icon icon="times" />
                        </button>
                    </div>
                </div>
                <textarea v-model="fileContent" class="form-control file-editor" spellcheck="false"></textarea>
            </div>

            <div v-if="chmodPath" class="shadow-box big-padding mt-3 chmod-panel">
                <h4>{{ $t("changePermissions") }}</h4>
                <div class="input-group">
                    <input v-model="chmodMode" class="form-control" placeholder="0644" @keyup.enter="chmodFile" />
                    <button class="btn btn-primary" @click="chmodFile">{{ $t("Save") }}</button>
                    <button class="btn btn-normal" @click="chmodPath = ''">{{ $t("cancel") }}</button>
                </div>
                <div class="form-text">{{ chmodPath }}</div>
            </div>
        </div>
    </transition>
</template>

<script>
export default {
    data() {
        return {
            loading: true,
            saving: false,
            currentPath: "/",
            pathInput: "/",
            entries: [],
            selectedFile: "",
            fileContent: "",
            chmodPath: "",
            chmodMode: "",
            uploadFile: null,
            uploadFilename: "",
            uploading: false,
        };
    },
    computed: {
        stackName() {
            return this.$route.params.stackName;
        },
        endpoint() {
            return this.$route.params.endpoint || "";
        },
        serviceName() {
            return this.$route.params.serviceName;
        },
    },
    mounted() {
        this.loadFiles();
    },
    methods: {
        loadFiles() {
            this.loading = true;
            this.$root.emitAgent(this.endpoint, "containerFileList", this.stackName, this.serviceName, this.currentPath, (res) => {
                this.loading = false;
                if (!res.ok) {
                    this.$root.toastRes(res);
                    return;
                }
                this.entries = res.entries;
                this.currentPath = res.path;
                this.pathInput = res.path;
            });
        },
        openPath(path) {
            if (!path.startsWith("/")) {
                path = this.joinPath(this.currentPath, path);
            }
            this.currentPath = this.cleanPath(path);
            this.pathInput = this.currentPath;
            this.selectedFile = "";
            this.loadFiles();
        },
        goUp() {
            const parts = this.currentPath.split("/").filter(Boolean);
            parts.pop();
            this.openPath("/" + parts.join("/"));
        },
        joinPath(base, name) {
            if (base === "/") {
                return "/" + name;
            }
            return `${base}/${name}`;
        },
        cleanPath(path) {
            const parts = path.split("/").filter(part => part && part !== ".");
            const cleaned = [];
            for (const part of parts) {
                if (part === "..") {
                    cleaned.pop();
                } else {
                    cleaned.push(part);
                }
            }
            return "/" + cleaned.join("/");
        },
        readFile(path) {
            this.$root.emitAgent(this.endpoint, "containerFileRead", this.stackName, this.serviceName, path, (res) => {
                if (!res.ok) {
                    this.$root.toastRes(res);
                    return;
                }
                this.selectedFile = path;
                this.fileContent = res.content;
            });
        },
        saveFile() {
            this.saving = true;
            this.$root.emitAgent(this.endpoint, "containerFileWrite", this.stackName, this.serviceName, this.selectedFile, this.fileContent, (res) => {
                this.saving = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadFiles();
                }
            });
        },
        downloadFile(path) {
            this.$root.emitAgent(this.endpoint, "containerFileDownload", this.stackName, this.serviceName, path, (res) => {
                if (!res.ok) {
                    this.$root.toastRes(res);
                    return;
                }
                const link = document.createElement("a");
                link.href = `data:application/octet-stream;base64,${res.contentBase64}`;
                link.download = res.filename;
                link.click();
            });
        },
        showChmod(path, mode) {
            this.chmodPath = path;
            this.chmodMode = mode || "";
        },
        chmodFile() {
            this.$root.emitAgent(this.endpoint, "containerFileChmod", this.stackName, this.serviceName, this.chmodPath, this.chmodMode, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.chmodPath = "";
                    this.loadFiles();
                }
            });
        },
        selectUploadFile(event) {
            const file = event.target.files?.[0];
            this.uploadFile = file || null;
            this.uploadFilename = file?.name || "";
        },
        uploadSelectedFile() {
            if (!this.uploadFile) {
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || "");
                const contentBase64 = result.split(",")[1] || "";
                this.uploading = true;
                this.$root.emitAgent(this.endpoint, "containerFileUpload", this.stackName, this.serviceName, this.currentPath, this.uploadFilename, contentBase64, (res) => {
                    this.uploading = false;
                    this.$root.toastRes(res);
                    if (res.ok) {
                        this.uploadFile = null;
                        this.uploadFilename = "";
                        if (this.$refs.uploadInput) {
                            this.$refs.uploadInput.value = "";
                        }
                        this.loadFiles();
                    }
                });
            };
            reader.readAsDataURL(this.uploadFile);
        },
        formatSize(size) {
            if (size < 1024) {
                return `${size} B`;
            }
            if (size < 1024 * 1024) {
                return `${(size / 1024).toFixed(1)} KB`;
            }
            return `${(size / 1024 / 1024).toFixed(1)} MB`;
        },
    },
};
</script>

<style scoped lang="scss">
.file-manager {
    overflow-x: auto;
}

.file-editor {
    min-height: 420px;
    font-family: "JetBrains Mono", monospace;
    font-size: 0.9rem;
}

.chmod-panel {
    max-width: 560px;
}

.upload-panel {
    h4 {
        font-size: 1rem;
    }
}

.upload-grid {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(180px, 280px) auto;
    gap: 8px;
}

@media (max-width: 760px) {
    .upload-grid {
        grid-template-columns: 1fr;
    }
}
</style>
