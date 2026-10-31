<template>
    <div class="file-viewer">
        <div class="viewer-header">
            <button class="btn btn-sm btn-normal viewer-back" type="button" :title="$t('Back')" @click="$emit('close')">
                <font-awesome-icon icon="arrow-left" />
            </button>
            <div class="viewer-title">
                <div class="viewer-name" :title="filePath">{{ fileName }}</div>
                <div class="viewer-meta">{{ meta }}</div>
            </div>
            <button class="btn btn-sm btn-normal" type="button" @click="$emit('download')">
                <font-awesome-icon icon="download" class="me-1" />{{ $t("Download") }}
            </button>
            <button class="btn btn-sm btn-normal viewer-close" type="button" :title="$t('Close')" @click="$emit('close')">
                <font-awesome-icon icon="times" />
            </button>
        </div>

        <div v-if="!binary && !error" class="viewer-toolbar">
            <div class="viewer-filter">
                <font-awesome-icon icon="filter" />
                <input v-model="filter" type="search" class="form-control form-control-sm" :placeholder="$t('Filter lines')" spellcheck="false" />
                <span v-if="filter" class="filter-count">{{ $t("matchingLines", { count: visibleLines.length }) }}</span>
            </div>
            <div class="form-check form-switch m-0" :title="$t('followHelp')">
                <input id="viewer-follow" v-model="follow" class="form-check-input" type="checkbox" role="switch" />
                <label class="form-check-label" for="viewer-follow">{{ $t("Follow") }}</label>
            </div>
            <div class="form-check form-switch m-0">
                <input id="viewer-wrap" v-model="wrap" class="form-check-input" type="checkbox" role="switch" />
                <label class="form-check-label" for="viewer-wrap">{{ $t("Wrap") }}</label>
            </div>
        </div>

        <div v-if="loading && !bytes" class="viewer-state">
            <font-awesome-icon icon="spinner" spin class="me-2" />{{ $t("Loading…") }}
        </div>
        <div v-else-if="error" class="viewer-state text-danger">{{ error }}</div>
        <div v-else-if="binary" class="viewer-state">
            <p>{{ $t("binaryFileHelp") }}</p>
            <button class="btn btn-primary btn-sm" type="button" @click="$emit('download')">
                <font-awesome-icon icon="download" class="me-1" />{{ $t("Download") }}
            </button>
        </div>
        <template v-else>
            <div v-if="start > 0" class="viewer-earlier">
                <span>{{ $t("showingLastBytes", { shown: formatBytes(end - start), total: formatBytes(size) }) }}</span>
                <button v-if="canLoadEarlier" class="btn btn-link btn-sm p-0" type="button" :disabled="loading" @click="loadEarlier">{{ $t("Load earlier") }}</button>
            </div>
            <pre ref="content" class="viewer-content" :class="{ wrap }" @scroll="onScroll">{{ visibleText }}</pre>
            <div v-if="size === 0" class="viewer-state">{{ $t("Empty file") }}</div>
        </template>
    </div>
</template>

<script>
import dayjs from "dayjs";
import { formatBytes } from "../util-frontend";

const PAGE_BYTES = 512 * 1024;
const MAX_LOADED_BYTES = 8 * 1024 * 1024;
const FOLLOW_INTERVAL_MS = 2000;

function concatBytes(a, b) {
    const result = new Uint8Array(a.length + b.length);
    result.set(a, 0);
    result.set(b, a.length);
    return result;
}

export default {
    props: {
        endpoint: {
            type: String,
            default: "",
        },
        stackName: {
            type: String,
            required: true,
        },
        source: {
            type: Object,
            required: true,
        },
        filePath: {
            type: String,
            required: true,
        },
        mtime: {
            type: Number,
            default: null,
        },
    },

    emits: [ "close", "download" ],

    data() {
        return {
            bytes: null,
            start: 0,
            end: 0,
            size: 0,
            loading: false,
            error: "",
            binary: false,
            filter: "",
            follow: false,
            wrap: true,
            atBottom: true,
            timer: null,
        };
    },

    computed: {
        fileName() {
            return this.filePath.split("/").pop();
        },

        meta() {
            const parts = [];
            if (this.bytes) {
                parts.push(formatBytes(this.size));
            }
            if (this.mtime) {
                parts.push(dayjs(this.mtime).format("YYYY-MM-DD HH:mm"));
            }
            return parts.join(" · ");
        },

        text() {
            if (!this.bytes) {
                return "";
            }
            let text = new TextDecoder("utf-8").decode(this.bytes);
            // Starting mid-file: drop the partial first line
            if (this.start > 0) {
                const newline = text.indexOf("\n");
                text = newline >= 0 ? text.slice(newline + 1) : text;
            }
            return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
        },

        visibleLines() {
            const lines = this.text.split("\n");
            if (!this.filter) {
                return lines;
            }
            const needle = this.filter.toLowerCase();
            return lines.filter(line => line.toLowerCase().includes(needle));
        },

        visibleText() {
            return this.filter ? this.visibleLines.join("\n") : this.text;
        },

        canLoadEarlier() {
            return this.start > 0 && this.end - this.start < MAX_LOADED_BYTES;
        },
    },

    watch: {
        filePath() {
            this.load();
        },

        follow(value) {
            clearInterval(this.timer);
            if (value) {
                this.timer = setInterval(() => this.poll(), FOLLOW_INTERVAL_MS);
                this.poll();
            }
        },

        visibleText() {
            if (this.atBottom) {
                this.$nextTick(() => this.scrollToBottom());
            }
        },
    },

    mounted() {
        this.load();
    },

    unmounted() {
        clearInterval(this.timer);
    },

    methods: {
        formatBytes,

        read(request) {
            return new Promise((resolve) => {
                this.$root.emitAgent(this.endpoint, "readFile", this.stackName, this.source, this.filePath, request, resolve);
            });
        },

        async load() {
            this.loading = true;
            this.error = "";
            this.binary = false;
            this.bytes = null;
            this.atBottom = true;
            const res = await this.read({
                from: "end",
                bytes: PAGE_BYTES,
            });
            this.loading = false;
            if (!res.ok) {
                this.error = res.msg;
                return;
            }
            const data = new Uint8Array(res.data);
            // A NUL byte in the first 8 KiB means it isn't a text file
            this.binary = data.subarray(0, 8192).includes(0);
            this.bytes = data;
            this.start = res.start;
            this.end = res.end;
            this.size = res.size;
            this.$nextTick(() => this.scrollToBottom());
        },

        async loadEarlier() {
            this.loading = true;
            const res = await this.read({
                from: "before",
                offset: this.start,
                bytes: PAGE_BYTES,
            });
            this.loading = false;
            if (!res.ok) {
                this.$root.toastError(res.msg);
                return;
            }
            const content = this.$refs.content;
            const fromBottom = content ? content.scrollHeight - content.scrollTop : 0;
            this.atBottom = false;
            this.bytes = concatBytes(new Uint8Array(res.data), this.bytes);
            this.start = res.start;
            // Keep the visible lines in place
            this.$nextTick(() => {
                if (content) {
                    content.scrollTop = content.scrollHeight - fromBottom;
                }
            });
        },

        async poll() {
            if (this.loading || !this.bytes || this.binary) {
                return;
            }
            const res = await this.read({
                from: "offset",
                offset: this.end,
                bytes: 1024 * 1024,
            });
            if (!res.ok) {
                return;
            }
            if (res.size < this.end) {
                // Truncated or rotated: start over from the end
                this.load();
                return;
            }
            this.size = res.size;
            if (res.data.byteLength > 0) {
                this.bytes = concatBytes(this.bytes, new Uint8Array(res.data));
                this.end = res.end;
                // Keep at most MAX_LOADED_BYTES, dropping the oldest
                if (this.bytes.length > MAX_LOADED_BYTES) {
                    const drop = this.bytes.length - MAX_LOADED_BYTES;
                    this.bytes = this.bytes.slice(drop);
                    this.start += drop;
                }
            }
        },

        onScroll() {
            const content = this.$refs.content;
            if (content) {
                this.atBottom = content.scrollHeight - content.scrollTop - content.clientHeight < 24;
            }
        },

        scrollToBottom() {
            const content = this.$refs.content;
            if (content) {
                content.scrollTop = content.scrollHeight;
            }
        },
    },
};
</script>

<style scoped lang="scss">
.file-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
}

.viewer-header {
    align-items: center;
    border-bottom: 1px solid var(--fx-border);
    display: flex;
    gap: 8px;
    padding: 10px 12px;
}

.viewer-back {
    display: none;
}

.viewer-title {
    flex: 1;
    min-width: 0;
}

.viewer-name {
    font-family: "JetBrains Mono", monospace;
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.viewer-meta {
    color: var(--fx-muted);
    font-size: 12px;
}

.viewer-toolbar {
    align-items: center;
    border-bottom: 1px solid var(--fx-border);
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    padding: 8px 12px;

    .form-check-label {
        font-size: 12px;
    }
}

.viewer-filter {
    align-items: center;
    color: var(--fx-muted);
    display: flex;
    flex: 1;
    gap: 8px;
    min-width: 180px;

    input {
        font-size: 12px;
    }
}

.filter-count {
    font-size: 12px;
    white-space: nowrap;
}

.viewer-earlier {
    align-items: center;
    border-bottom: 1px solid var(--fx-border);
    color: var(--fx-muted);
    display: flex;
    font-size: 12px;
    gap: 10px;
    padding: 6px 12px;

    .btn-link {
        font-size: 12px;
    }
}

.viewer-content {
    background: var(--fx-code-bg);
    color: var(--fx-code-text);
    flex: 1;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    line-height: 1.55;
    margin: 0;
    min-height: 200px;
    overflow: auto;
    padding: 10px 12px;
    white-space: pre;

    &.wrap {
        overflow-wrap: anywhere;
        white-space: pre-wrap;
    }
}

.viewer-state {
    color: var(--fx-muted);
    font-size: 13px;
    padding: 24px 16px;
    text-align: center;
}

@media (max-width: 991px) {
    .viewer-back {
        display: inline-flex;
    }

    .viewer-close {
        display: none;
    }
}
</style>
