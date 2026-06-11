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

            <div class="shadow-box big-padding mb-3 controls-panel">
                <div class="path-row">
                    <button class="btn btn-normal" :disabled="currentPath === '/'" @click="goUp">
                        ..
                    </button>
                    <input v-model="pathInput" class="form-control" @keyup.enter="openPath(pathInput)" />
                    <button class="btn btn-primary" @click="openPath(pathInput)">
                        {{ $t("open") }}
                    </button>
                </div>
                <div class="upload-row">
                    <input ref="uploadInput" class="form-control" type="file" @change="selectUploadFile" />
                    <input v-model="uploadFilename" class="form-control" :placeholder="$t('fileName')" />
                    <button class="btn btn-primary" :disabled="uploading || !uploadFile" @click="uploadSelectedFile">
                        <font-awesome-icon icon="upload" class="me-1" />
                        {{ $t("upload") }}
                    </button>
                </div>
            </div>

            <div v-if="loading" class="shadow-box big-padding">{{ $t("loading") }}</div>

            <div v-else class="shadow-box file-manager">
                <div class="file-header">
                    <span>{{ $t("fileName") }}</span>
                    <span>{{ $t("type") }}</span>
                    <span>{{ $t("size") }}</span>
                    <span>{{ $t("permissions") }}</span>
                    <span>{{ $t("ownerGroup") }}</span>
                    <span>{{ $t("modified") }}</span>
                    <span class="text-end">{{ $t("actions") }}</span>
                </div>
                <div v-for="entry in entries" :key="entry.name" class="file-row">
                    <div class="file-name">
                        <font-awesome-icon :icon="entry.type === 'directory' ? 'folder' : 'file'" class="me-2" />
                        <button v-if="entry.type === 'directory'" class="file-link" @click="openPath(joinPath(currentPath, entry.name))">
                            {{ entry.name }}
                        </button>
                        <span v-else>{{ entry.name }}</span>
                    </div>
                    <div>{{ entry.type }}</div>
                    <div>{{ formatSize(entry.size) }}</div>
                    <div>{{ entry.mode || $t("notAvailableShort") }}</div>
                    <div>{{ formatOwnerGroup(entry) }}</div>
                    <div>{{ formatModified(entry.modified) }}</div>
                    <div class="file-actions">
                        <button v-if="entry.type !== 'directory'" class="btn btn-sm btn-normal" @click="readFile(joinPath(currentPath, entry.name))">
                            <font-awesome-icon icon="eye" />
                        </button>
                        <button v-if="entry.type !== 'directory'" class="btn btn-sm btn-normal" @click="downloadFile(joinPath(currentPath, entry.name))">
                            <font-awesome-icon icon="download" />
                        </button>
                        <button class="btn btn-sm btn-normal" @click="showPermissions(joinPath(currentPath, entry.name), entry)">
                            <font-awesome-icon icon="wrench" />
                        </button>
                    </div>
                </div>
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

            <BModal v-model="showPermissionsModal" :title="$t('changePermissions')" hide-footer>
                <div class="mb-3">
                    <label class="form-label">{{ $t("permissions") }}</label>
                    <input v-model="chmodMode" class="form-control" placeholder="0644" @keyup.enter="chmodFile" />
                </div>
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">{{ $t("owner") }}</label>
                        <input v-model="ownerValue" class="form-control" placeholder="root" />
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="form-label">{{ $t("group") }}</label>
                        <input v-model="groupValue" class="form-control" placeholder="root" />
                    </div>
                </div>
                <div class="form-text mb-3">{{ chmodPath }}</div>
                <div class="d-flex justify-content-end">
                    <button class="btn btn-normal me-2" @click="showPermissionsModal = false">{{ $t("cancel") }}</button>
                    <button class="btn btn-primary" @click="chmodFile">{{ $t("Save") }}</button>
                </div>
            </BModal>
        </div>
    </transition>
</template>

<script>
import { BModal } from "bootstrap-vue-next";

export default {
    components: {
        BModal,
    },
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
            ownerValue: "",
            groupValue: "",
            showPermissionsModal: false,
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
        showPermissions(path, entry) {
            this.chmodPath = path;
            this.chmodMode = entry.mode || "";
            this.ownerValue = entry.owner || "";
            this.groupValue = entry.group || "";
            this.showPermissionsModal = true;
        },
        chmodFile() {
            this.$root.emitAgent(this.endpoint, "containerFileChmod", this.stackName, this.serviceName, this.chmodPath, this.chmodMode, this.ownerValue, this.groupValue, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.chmodPath = "";
                    this.showPermissionsModal = false;
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
        formatModified(modified) {
            if (!modified) {
                return this.$t("notAvailableShort");
            }
            return new Date(modified * 1000).toLocaleString();
        },
        formatOwnerGroup(entry) {
            if (!entry.owner && !entry.group) {
                return this.$t("notAvailableShort");
            }
            return `${entry.owner || ""}:${entry.group || ""}`;
        },
    },
};
</script>

<style scoped lang="scss">
@import "../styles/vars";

.controls-panel {
    display: grid;
    gap: 12px;
}

.path-row,
.upload-row {
    display: grid;
    gap: 8px;
}

.path-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
}

.upload-row {
    grid-template-columns: minmax(220px, 1fr) minmax(180px, 280px) auto;
}

.file-manager {
    overflow-x: auto;
    padding: 0;
}

.file-header,
.file-row {
    display: grid;
    grid-template-columns: minmax(220px, 2fr) 110px 100px 120px 150px 210px 150px;
    gap: 12px;
    align-items: center;
    min-width: 1060px;
    padding: 12px 16px;
}

.file-header {
    border-bottom: 1px solid rgba(128, 128, 128, 0.18);
    color: #6c757d;
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
}

.file-row {
    border-bottom: 1px solid rgba(128, 128, 128, 0.14);

    &:last-child {
        border-bottom: 0;
    }
}

.file-name {
    min-width: 0;
    word-break: break-word;
}

.file-link {
    background: none;
    border: 0;
    color: inherit;
    padding: 0;
    text-align: left;
    text-decoration: underline;
}

.file-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;

    .btn {
        min-width: 38px;
    }
}

.file-editor {
    min-height: 420px;
    font-family: "JetBrains Mono", monospace;
    font-size: 0.9rem;
}

@media (max-width: 760px) {
    .path-row,
    .upload-row {
        grid-template-columns: 1fr;
    }
}
</style>
