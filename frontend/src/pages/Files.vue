<template>
    <transition name="slide-fade" appear>
        <div class="files-page">
            <header class="files-header">
                <div class="files-heading">
                    <h1>{{ $t("Files") }}</h1>
                    <router-link :to="stackLink" class="files-stack-link">{{ stackName }}</router-link>
                </div>
                <div class="files-header-actions">
                    <select v-model="sourceKey" class="form-select form-select-sm files-source" :aria-label="$t('Source')">
                        <option v-if="stackFolderAvailable" value="">{{ $t("Stack folder") }}</option>
                        <option v-for="service in services" :key="service.name" :value="service.name" :disabled="!service.running">
                            {{ $t("containerSource", { name: service.name }) }}{{ service.running ? "" : ` (${$t("notRunning")})` }}
                        </option>
                    </select>
                    <button class="btn btn-sm btn-normal" type="button" :title="logsTitle" @click="downloadLogs">
                        <font-awesome-icon icon="download" class="me-1" />{{ $t("Download logs") }}
                    </button>
                </div>
            </header>

            <div class="files-body" :class="{ viewing: !!selectedEntry }">
                <section class="files-browser">
                    <div class="files-pathbar">
                        <button class="btn btn-sm btn-normal" type="button" :disabled="currentPath === '/'" :title="$t('Parent folder')" @click="goUp">
                            <font-awesome-icon icon="arrow-turn-up" />
                        </button>
                        <form class="files-path-form" @submit.prevent="goTo(pathInput)">
                            <input v-model="pathInput" class="form-control form-control-sm" :aria-label="$t('Path')" spellcheck="false" />
                        </form>
                        <button class="btn btn-sm btn-normal" type="button" :title="$t('Refresh')" @click="loadListing">
                            <font-awesome-icon icon="rotate" :spin="loading" />
                        </button>
                    </div>

                    <div v-if="entries.length > 8" class="files-filter">
                        <font-awesome-icon icon="filter" />
                        <input v-model="filter" type="search" class="form-control form-control-sm" :placeholder="$t('Filter files')" spellcheck="false" />
                    </div>

                    <div v-if="error" class="files-state text-danger">{{ error }}</div>
                    <div v-else-if="loading && entries.length === 0" class="files-state">
                        <font-awesome-icon icon="spinner" spin class="me-2" />{{ $t("Loading…") }}
                    </div>
                    <div v-else-if="entries.length === 0" class="files-state">{{ $t("Empty folder") }}</div>
                    <div v-else class="files-list" role="list">
                        <div
                            v-for="entry in visibleEntries"
                            :key="entry.name"
                            class="files-row"
                            role="listitem"
                            :class="{ selected: selectedEntry && selectedEntry.name === entry.name, disabled: !canOpen(entry) }"
                            :title="entryTitle(entry)"
                            @click="open(entry)"
                        >
                            <font-awesome-icon :icon="entryIcon(entry)" class="files-icon" :class="entryKind(entry)" />
                            <span class="files-name">
                                {{ entry.name }}<span v-if="entry.type === 'link'" class="files-link-mark">↗</span>
                            </span>
                            <span class="files-size">{{ entry.size !== null ? formatBytes(entry.size) : "" }}</span>
                            <span class="files-date">{{ entry.mtime ? formatDate(entry.mtime) : "" }}</span>
                            <button
                                v-if="entryKind(entry) === 'file'"
                                class="btn btn-sm files-download"
                                type="button"
                                :title="$t('Download')"
                                :aria-label="$t('Download') + ' ' + entry.name"
                                @click.stop="download(entry)"
                            >
                                <font-awesome-icon icon="download" />
                            </button>
                            <span v-else class="files-download-placeholder"></span>
                        </div>
                        <div v-if="visibleEntries.length === 0" class="files-state">{{ $t("No matching files") }}</div>
                    </div>
                    <div v-if="truncated" class="files-note">{{ $t("folderTruncated") }}</div>
                </section>

                <section v-if="selectedEntry" class="files-viewer-pane">
                    <FileViewer
                        :key="sourceKey + ':' + selectedPath"
                        :endpoint="endpoint"
                        :stack-name="stackName"
                        :source="source"
                        :file-path="selectedPath"
                        :mtime="selectedEntry.mtime"
                        @close="selectedEntry = null"
                        @download="download(selectedEntry)"
                    />
                </section>
            </div>
        </div>
    </transition>
</template>

<script>
import dayjs from "dayjs";
import { parse } from "yaml";
import FileViewer from "../components/FileViewer.vue";
import { formatBytes } from "../util-frontend";
import { startDownload } from "../downloads";

function joinPath(dir, name) {
    return (dir === "/" ? "" : dir) + "/" + name;
}

export default {
    components: {
        FileViewer,
    },

    data() {
        const query = this.$route.query;
        return {
            sourceKey: typeof query.service === "string" ? query.service : "",
            currentPath: typeof query.path === "string" && query.path ? query.path : "/",
            pathInput: "",
            entries: [],
            truncated: false,
            loading: false,
            error: "",
            filter: "",
            selectedEntry: null,
            pendingFile: typeof query.file === "string" ? query.file : "",
            stackFolderAvailable: false,
            services: [],
            ready: false,
        };
    },

    computed: {
        stackName() {
            return this.$route.params.stackName;
        },

        endpoint() {
            return this.$route.params.endpoint || "";
        },

        stackLink() {
            return this.endpoint ? `/compose/${this.stackName}/${this.endpoint}` : `/compose/${this.stackName}`;
        },

        source() {
            return this.sourceKey ? {
                type: "container",
                service: this.sourceKey,
            } : { type: "stack" };
        },

        selectedPath() {
            return this.selectedEntry ? joinPath(this.currentPath, this.selectedEntry.name) : "";
        },

        visibleEntries() {
            if (!this.filter) {
                return this.entries;
            }
            const needle = this.filter.toLowerCase();
            return this.entries.filter(e => e.name.toLowerCase().includes(needle));
        },

        logsTitle() {
            return this.sourceKey ? this.$t("downloadServiceLogsHelp", { name: this.sourceKey }) : this.$t("downloadStackLogsHelp");
        },
    },

    watch: {
        sourceKey(value, old) {
            if (this.ready && value !== old) {
                this.currentPath = "/";
                this.selectedEntry = null;
                this.loadListing();
            }
        },
    },

    async mounted() {
        document.title = `${this.$t("Files")} - ${this.stackName} - Dockge`;
        await this.loadSources();
        this.ready = true;
        this.loadListing();
    },

    methods: {
        formatBytes,

        formatDate(ms) {
            return dayjs(ms).format("YYYY-MM-DD HH:mm");
        },

        emit(event, ...args) {
            return new Promise((resolve) => this.$root.emitAgent(this.endpoint, event, ...args, resolve));
        },

        async loadSources() {
            const [ stackRes, statusRes ] = await Promise.all([
                this.emit("getStack", this.stackName),
                this.emit("serviceStatusList", this.stackName),
            ]);
            const running = statusRes.ok ? statusRes.serviceStatusList || {} : {};
            const isRunning = (name) => (running[name] || []).some(i => ![ "exited", "dead", "created", "paused", "restarting" ].includes(i.status));

            let names = [];
            if (stackRes.ok) {
                this.stackFolderAvailable = !!stackRes.stack.isManagedByDockge;
                try {
                    names = Object.keys(parse(stackRes.stack.composeYAML || "")?.services || {});
                } catch {
                    // Fall back to the running services
                }
            }
            for (const name of Object.keys(running)) {
                if (!names.includes(name)) {
                    names.push(name);
                }
            }
            this.services = names.map(name => ({
                name,
                running: isRunning(name),
            }));

            // Without a stack folder, start with the first running container
            if (!this.sourceKey && !this.stackFolderAvailable) {
                this.sourceKey = this.services.find(s => s.running)?.name || "";
            }
        },

        async loadListing() {
            this.loading = true;
            this.error = "";
            const res = await this.emit("listFiles", this.stackName, this.source, this.currentPath);
            this.loading = false;
            if (!res.ok) {
                this.error = res.msg;
                this.entries = [];
                this.truncated = false;
            } else {
                this.entries = res.entries;
                this.truncated = res.truncated;
                this.currentPath = res.path;
            }
            this.pathInput = this.currentPath;
            this.filter = "";

            if (this.pendingFile) {
                this.selectedEntry = this.entries.find(e => e.name === this.pendingFile) || null;
                this.pendingFile = "";
            }
            this.syncUrl();
        },

        // Keep the location in the URL without a router navigation (which would remount the page)
        syncUrl() {
            const query = new URLSearchParams();
            if (this.sourceKey) {
                query.set("service", this.sourceKey);
            }
            if (this.currentPath !== "/") {
                query.set("path", this.currentPath);
            }
            if (this.selectedEntry) {
                query.set("file", this.selectedEntry.name);
            }
            const search = query.toString();
            history.replaceState(history.state, "", location.pathname + (search ? "?" + search : ""));
        },

        goTo(path) {
            this.currentPath = path || "/";
            this.selectedEntry = null;
            this.loadListing();
        },

        goUp() {
            const parts = this.currentPath.split("/").filter(Boolean);
            parts.pop();
            this.goTo("/" + parts.join("/"));
        },

        entryKind(entry) {
            if (entry.type === "dir" || (entry.type === "link" && entry.target === "dir")) {
                return "dir";
            }
            if (entry.type === "file" || (entry.type === "link" && entry.target === "file")) {
                return "file";
            }
            return "other";
        },

        canOpen(entry) {
            return this.entryKind(entry) !== "other";
        },

        entryIcon(entry) {
            const kind = this.entryKind(entry);
            if (kind === "dir") {
                return "folder";
            }
            if (kind === "file") {
                return "file-lines";
            }
            return entry.type === "link" ? "unlink" : "file";
        },

        entryTitle(entry) {
            if (entry.type === "link" && entry.target === "outside") {
                return this.$t("linkOutsideStack");
            }
            if (entry.type === "link" && !entry.target) {
                return this.$t("brokenLink");
            }
            if (this.entryKind(entry) === "other") {
                return this.$t("specialFile");
            }
            return "";
        },

        open(entry) {
            const kind = this.entryKind(entry);
            if (kind === "dir") {
                this.goTo(joinPath(this.currentPath, entry.name));
            } else if (kind === "file") {
                this.selectedEntry = entry;
                this.syncUrl();
            }
        },

        download(entry) {
            startDownload(this.$root, this.endpoint, "openFileDownload", this.stackName, this.source, joinPath(this.currentPath, entry.name));
        },

        downloadLogs() {
            startDownload(this.$root, this.endpoint, "openLogDownload", this.stackName, this.sourceKey);
        },
    },
};
</script>

<style scoped lang="scss">
.files-page {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: calc(100vh - 92px);
    min-height: 480px;
}

.files-header {
    align-items: center;
    background: var(--fx-bg);
    border: 1px solid var(--fx-border);
    border-left: 3px solid #6ea8fe;
    border-radius: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    justify-content: space-between;
    padding: 12px 16px;
}

.files-heading {
    align-items: baseline;
    display: flex;
    gap: 12px;
    min-width: 0;

    h1 {
        font-size: 20px;
        font-weight: 650;
        margin: 0;
    }
}

.files-stack-link {
    color: var(--fx-muted);
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    text-decoration: none;

    &:hover {
        text-decoration: underline;
    }
}

.files-header-actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.files-source {
    min-width: 200px;
    width: auto;
}

.files-body {
    display: grid;
    flex: 1;
    gap: 10px;
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;

    &.viewing {
        grid-template-columns: minmax(300px, 2fr) minmax(0, 3fr);
    }
}

.files-browser,
.files-viewer-pane {
    background: var(--fx-bg);
    border: 1px solid var(--fx-border);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
}

.files-pathbar {
    align-items: center;
    border-bottom: 1px solid var(--fx-border);
    display: flex;
    gap: 6px;
    padding: 8px 10px;
}

.files-path-form {
    flex: 1;
    min-width: 0;

    input {
        font-family: "JetBrains Mono", monospace;
        font-size: 12px;
    }
}

.files-filter {
    align-items: center;
    border-bottom: 1px solid var(--fx-border);
    color: var(--fx-muted);
    display: flex;
    gap: 8px;
    padding: 6px 10px;

    input {
        font-size: 12px;
    }
}

.files-list {
    flex: 1;
    overflow: auto;
}

.files-row {
    align-items: center;
    border-bottom: 1px solid var(--fx-border);
    cursor: pointer;
    display: grid;
    font-size: 13px;
    gap: 10px;
    grid-template-columns: 16px minmax(0, 1fr) 72px 118px 28px;
    min-height: 36px;
    padding: 4px 10px;

    &:hover {
        background: var(--fx-row-hover);
    }

    &.selected {
        background: var(--fx-selected);
    }

    &.disabled {
        cursor: default;
        opacity: 0.55;
    }
}

.files-icon {
    color: var(--fx-muted);

    &.dir {
        color: #d8aa51;
    }

    &.file {
        color: #6ea8fe;
    }
}

.files-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.files-link-mark {
    color: var(--fx-muted);
    font-size: 11px;
    margin-left: 4px;
}

.files-size,
.files-date {
    color: var(--fx-muted);
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    text-align: right;
    white-space: nowrap;
}

.files-download {
    color: var(--fx-muted);
    padding: 2px 6px;

    &:hover {
        color: #6ea8fe;
    }
}

.files-state {
    color: var(--fx-muted);
    font-size: 13px;
    padding: 24px 16px;
    text-align: center;
}

.files-note {
    border-top: 1px solid var(--fx-border);
    color: var(--fx-muted);
    font-size: 12px;
    padding: 6px 10px;
}

@media (max-width: 991px) {
    .files-page {
        height: auto;
        min-height: 0;
    }

    .files-body,
    .files-body.viewing {
        grid-template-columns: minmax(0, 1fr);
    }

    // On small screens the viewer replaces the list
    .files-body.viewing .files-browser {
        display: none;
    }

    .files-browser {
        min-height: 60vh;
    }

    // Fixed height so the file scrolls inside the viewer (and opens at the end of a log)
    .files-viewer-pane {
        height: calc(100vh - 230px);
        min-height: 360px;
    }

    .files-row {
        grid-template-columns: 16px minmax(0, 1fr) 64px 28px;
    }

    .files-date {
        display: none;
    }
}
</style>
