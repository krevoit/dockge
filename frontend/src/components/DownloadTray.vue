<template>
    <div v-if="downloads.list.length > 0" class="download-tray" role="status" aria-live="polite">
        <div v-for="item in downloads.list" :key="item.key" class="download-item" :class="item.status">
            <font-awesome-icon :icon="icon(item)" :spin="item.status === 'downloading'" class="download-icon" />
            <div class="download-info">
                <div class="download-name" :title="item.name">{{ item.name }}</div>
                <div class="download-detail">{{ detail(item) }}</div>
                <div v-if="item.status === 'downloading'" class="download-bar">
                    <div class="download-fill" :class="{ indeterminate: !item.size }" :style="item.size ? { width: percent(item) + '%' } : {}"></div>
                </div>
            </div>
            <button v-if="item.status === 'downloading'" class="btn btn-sm btn-normal" type="button" :title="$t('Cancel')" @click="item.cancel = true">
                <font-awesome-icon icon="times" />
            </button>
        </div>
    </div>
</template>

<script>
import { downloads } from "../downloads";
import { formatBytes } from "../util-frontend";

export default {
    data() {
        return {
            downloads,
        };
    },

    methods: {
        percent(item) {
            return Math.min(100, item.received / item.size * 100);
        },

        icon(item) {
            return {
                downloading: "spinner",
                saved: "check",
                failed: "exclamation-circle",
                cancelled: "times",
            }[item.status];
        },

        detail(item) {
            if (item.status === "saved") {
                return `${this.$t("Saved")} · ${formatBytes(item.received)}`;
            }
            if (item.status === "failed") {
                return item.error || this.$t("Download failed");
            }
            if (item.status === "cancelled") {
                return this.$t("Cancelled");
            }
            return item.size ? `${formatBytes(item.received)} / ${formatBytes(item.size)}` : formatBytes(item.received);
        },
    },
};
</script>

<style scoped lang="scss">
.download-tray {
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: fixed;
    right: 16px;
    width: min(340px, calc(100vw - 32px));
    z-index: 1080;
}

.download-item {
    align-items: center;
    background: #ffffff;
    border: 1px solid #e1e4e8;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(15, 20, 30, 0.12);
    display: flex;
    gap: 10px;
    padding: 10px 12px;

    .dark & {
        background: #15181d;
        border-color: #2b2f36;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }

    &.saved .download-icon {
        color: #1f9d63;
    }

    &.failed .download-icon {
        color: #dc3545;
    }
}

.download-icon {
    color: #6ea8fe;
    flex: 0 0 16px;
}

.download-info {
    flex: 1;
    min-width: 0;
}

.download-name {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.download-detail {
    color: #8b9098;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.download-bar {
    background: var(--stat-track);
    border-radius: 2px;
    height: 3px;
    margin-top: 6px;
    overflow: hidden;
}

.download-fill {
    background: #6ea8fe;
    height: 100%;
    transition: width 0.3s ease;

    &.indeterminate {
        animation: download-indeterminate 1.2s ease-in-out infinite;
        width: 35%;
    }
}

@keyframes download-indeterminate {
    from { transform: translateX(-100%); }
    to { transform: translateX(300%); }
}
</style>
