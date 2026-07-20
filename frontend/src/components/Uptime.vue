<template>
    <span :class="className" :title="statusName" :aria-label="statusName">{{ statusName }}</span>
</template>

<script>
import { statusColor, statusNameShort } from "../../../common/util-common";

export default {
    props: {
        stack: {
            type: Object,
            default: null,
        },
        fixedWidth: {
            type: Boolean,
            default: false,
        },
    },

    computed: {
        uptime() {
            return this.$t("notAvailableShort");
        },

        color() {
            return statusColor(this.stack?.status);
        },

        statusName() {
            return this.$t(statusNameShort(this.stack?.status));
        },

        className() {
            let className = `badge rounded-pill bg-${this.color}`;

            if (this.fixedWidth) {
                className += " fixed-width";
            }
            return className;
        },
    },
};
</script>

<style scoped>
.badge {
    border-radius: 2px !important;
    height: 9px;
    min-width: 9px;
    padding: 0;
    width: 9px;
    overflow: hidden;
    text-indent: -999px;
}

.badge.bg-primary {
    background-color: #6bc79b !important;
}

.fixed-width {
    width: 9px;
}
</style>
