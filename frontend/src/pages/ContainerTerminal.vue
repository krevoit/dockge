<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 class="mb-3">{{ pageTitle }} - {{ serviceName }} ({{ stackName }})</h1>

            <div v-if="!isLogs" class="mb-3">
                <router-link :to="sh" class="btn btn-normal me-2">{{ $t("Switch to sh") }}</router-link>
            </div>

            <Terminal class="terminal" :rows="20" :mode="terminalMode" :name="terminalName" :stack-name="stackName" :service-name="serviceName" :shell="shell" :endpoint="endpoint"></Terminal>
        </div>
    </transition>
</template>

<script>
import { getContainerExecTerminalName, getContainerLogsTerminalName } from "../../../common/util-common";

export default {
    components: {
    },
    data() {
        return {

        };
    },
    computed: {
        stackName() {
            return this.$route.params.stackName;
        },
        endpoint() {
            return this.$route.params.endpoint || "";
        },
        shell() {
            return this.$route.params.type;
        },
        isLogs() {
            return this.$route.params.type === "logs";
        },
        pageTitle() {
            return this.isLogs ? this.$t("logs") : this.$t("terminal");
        },
        terminalMode() {
            return this.isLogs ? "containerLogs" : "interactive";
        },
        serviceName() {
            return this.$route.params.serviceName;
        },
        terminalName() {
            if (this.isLogs) {
                return getContainerLogsTerminalName(this.endpoint, this.stackName, this.serviceName);
            }
            return getContainerExecTerminalName(this.endpoint, this.stackName, this.serviceName, 0);
        },
        sh() {
            let endpoint = this.$route.params.endpoint;

            let data = {
                name: "containerTerminal",
                params: {
                    stackName: this.stackName,
                    serviceName: this.serviceName,
                    type: "sh",
                },
            };

            if (endpoint) {
                data.name = "containerTerminalEndpoint";
                data.params.endpoint = endpoint;
            }

            return data;
        },
    },
    mounted() {

    },
    methods: {

    }
};
</script>

<style scoped lang="scss">
.terminal {
    height: 410px;
}
</style>
