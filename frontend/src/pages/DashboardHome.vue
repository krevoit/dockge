<template>
    <transition ref="tableContainer" name="slide-fade" appear>
        <div v-if="$route.name === 'DashboardHome'" class="overview-page">
            <header class="overview-header">
                <h1>{{ $t("overview") }}</h1>
                <div class="status-summary" :aria-label="$t('Status')">
                    <span class="running"><i></i>{{ $t("active") }} <strong>{{ activeNum }}</strong></span>
                    <span class="exited"><i></i>{{ $t("exited") }} <strong>{{ exitedNum }}</strong></span>
                    <span class="inactive"><i></i>{{ $t("inactive") }} <strong>{{ inactiveNum }}</strong></span>
                </div>
            </header>

            <div class="overview-grid">
                <section class="converter-panel">
                    <div class="panel-heading">
                        <div>
                            <h2>{{ $t("dockerRunToCompose") }}</h2>
                            <p>{{ $t("dockerRunDescription") }}</p>
                        </div>
                    </div>

                    <div class="command-editor">
                        <div class="editor-bar"><span>docker run command</span><span>Ln 1, Col 1</span></div>
                        <div class="editor-body">
                            <span class="line-number">1</span>
                            <textarea id="docker-run" v-model="dockerRunCommand" type="text" class="docker-run" required placeholder="docker run ..."></textarea>
                        </div>
                    </div>

                    <p class="editor-help">{{ $t("dockerRunHelp") }}</p>
                    <div class="converter-actions">
                        <button class="btn btn-link" :disabled="!dockerRunCommand" @click="dockerRunCommand = ''">{{ $t("clear") }}</button>
                        <button class="btn btn-primary" @click="convertDockerRun">{{ $t("convert") }}</button>
                    </div>
                </section>

                <section class="agents-panel">
                    <div class="panel-heading agent-panel-heading">
                        <h2>{{ $tc("dockgeAgent", 2) }}</h2>
                        <button v-if="!showAgentForm" class="btn btn-link" @click="showAgentForm = true">
                            <font-awesome-icon icon="plus" /> {{ $t("addAgent") }}
                        </button>
                    </div>

                    <div class="agent-table-head">
                        <span>{{ $t("Agent") }}</span><span>{{ $t("address") }}</span><span>{{ $t("Status") }}</span><span></span>
                    </div>

                    <div v-for="(agentItem, endpoint) in $root.agentList" :key="endpoint" class="agent-row">
                        <strong>{{ agentItem.name || (endpoint === "" ? $t("currentEndpoint") : endpoint) }}</strong>
                        <span class="agent-address">{{ agentItem.url || "127.0.0.1" }}</span>
                        <span v-if="$root.agentStatusList[endpoint]" class="agent-status" :class="$root.agentStatusList[endpoint]">
                            <i></i>{{ $t($root.agentStatusList[endpoint] === "online" ? "agentOnline" : $root.agentStatusList[endpoint] === "offline" ? "agentOffline" : $root.agentStatusList[endpoint]) }}
                        </span>
                        <div class="agent-actions">
                            <button v-if="agentItem.name !== ''" class="icon-button" :aria-label="$t('Update Name')" @click="showEditAgentNameDialog[agentItem.name] = !showEditAgentNameDialog[agentItem.name]">
                                <font-awesome-icon icon="pen-to-square" />
                            </button>

                            <!-- Edit Dialog -->
                            <BModal v-model="showEditAgentNameDialog[agentItem.name]" :no-close-on-backdrop="true" :close-on-esc="true" :okTitle="$t('Update Name')" okVariant="info" @ok="updateName(agentItem.url, agentItem.updatedName)">
                                <label for="Update Name" class="form-label">Current value: {{ $t(agentItem.name) }}</label>
                                <input id="updatedName" v-model="agentItem.updatedName" type="text" class="form-control" optional>
                            </BModal>

                            <button v-if="endpoint !== ''" class="icon-button" :aria-label="$t('removeAgent')" @click="showRemoveAgentDialog[agentItem.url] = !showRemoveAgentDialog[agentItem.url]">
                                <font-awesome-icon icon="trash" />
                            </button>

                            <!-- Remove Agent Dialog -->
                            <BModal v-model="showRemoveAgentDialog[agentItem.url]" :okTitle="$t('removeAgent')" okVariant="danger" @ok="removeAgent(agentItem.url)">
                                <p>{{ agentItem.url }}</p>
                                {{ $t("removeAgentMsg") }}
                            </BModal>
                        </div>
                    </div>

                    <form v-if="showAgentForm" class="agent-form" @submit.prevent="addAgent">
                        <div class="agent-form-title">
                            <strong>{{ $t("addAgent") }}</strong>
                            <button type="button" class="icon-button" @click="showAgentForm = false"><font-awesome-icon icon="times" /></button>
                        </div>
                        <div class="mb-3">
                            <label for="url" class="form-label">{{ $t("dockgeURL") }}</label>
                            <input id="url" v-model="agent.url" type="url" class="form-control" required placeholder="http://">
                        </div>

                        <div class="mb-3">
                            <label for="username" class="form-label">{{ $t("Username") }}</label>
                            <input id="username" v-model="agent.username" type="text" class="form-control" required>
                        </div>

                        <div class="mb-3">
                            <label for="password" class="form-label">{{ $t("Password") }}</label>
                            <input id="password" v-model="agent.password" type="password" class="form-control" required autocomplete="new-password">
                        </div>

                        <div class="mb-3">
                            <label for="name" class="form-label">{{ $t("Friendly Name") }}</label>
                            <input id="name" v-model="agent.name" type="text" class="form-control" optional>
                        </div>

                        <button type="submit" class="btn btn-primary" :disabled="connectingAgent">
                            <template v-if="connectingAgent">{{ $t("connecting") }}</template>
                            <template v-else>{{ $t("connect") }}</template>
                        </button>
                    </form>
                </section>
            </div>
        </div>
    </transition>
    <router-view ref="child" />
</template>

<script>
import { statusNameShort } from "../../../common/util-common";

export default {
    components: {

    },
    props: {
        calculatedHeight: {
            type: Number,
            default: 0
        }
    },
    data() {
        return {
            page: 1,
            perPage: 25,
            initialPerPage: 25,
            paginationConfig: {
                hideCount: true,
                chunksNavigation: "scroll",
            },
            importantHeartBeatListLength: 0,
            displayedRecords: [],
            dockerRunCommand: "",
            showAgentForm: false,
            showRemoveAgentDialog: {},
            showEditAgentNameDialog: {},
            connectingAgent: false,
            agent: {
                url: "http://",
                username: "",
                password: "",
                name: "",
                updatedName: "",
            }
        };
    },

    computed: {
        activeNum() {
            return this.getStatusNum("active");
        },
        inactiveNum() {
            return this.getStatusNum("inactive");
        },
        exitedNum() {
            return this.getStatusNum("exited");
        },
    },

    watch: {
        perPage() {
            this.$nextTick(() => {
                this.getImportantHeartbeatListPaged();
            });
        },

        page() {
            this.getImportantHeartbeatListPaged();
        },
    },

    mounted() {
        this.initialPerPage = this.perPage;

        window.addEventListener("resize", this.updatePerPage);
        this.updatePerPage();
    },

    beforeUnmount() {
        window.removeEventListener("resize", this.updatePerPage);
    },

    methods: {

        addAgent() {
            this.connectingAgent = true;
            this.$root.getSocket().emit("addAgent", this.agent, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        url: "http://",
                        username: "",
                        password: "",
                    };
                }

                this.connectingAgent = false;
            });
        },

        removeAgent(url) {
            this.$root.getSocket().emit("removeAgent", url, (res) => {
                if (res.ok) {
                    this.$root.toastRes(res);

                    let urlObj = new URL(url);
                    let endpoint = urlObj.host;

                    // Remove the stack list and status list of the removed agent
                    delete this.$root.allAgentStackList[endpoint];
                }
            });
        },

        updateName(url, updatedName) {
            this.$root.getSocket().emit("updateAgent", url, updatedName, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        updatedName: "",
                    };
                }
            });
        },

        getStatusNum(statusName) {
            let num = 0;

            for (let stackName in this.$root.completeStackList) {
                const stack = this.$root.completeStackList[stackName];
                if (statusNameShort(stack.status) === statusName) {
                    num += 1;
                }
            }
            return num;
        },

        convertDockerRun() {
            if (this.dockerRunCommand.trim() === "docker run") {
                throw new Error("Please enter a docker run command");
            }

            // composerize is working in dev, but after "vite build", it is not working
            // So pass to backend to do the conversion
            this.$root.getSocket().emit("composerize", this.dockerRunCommand, (res) => {
                if (res.ok) {
                    this.$root.composeTemplate = res.composeTemplate;
                    this.$router.push("/compose");
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /**
         * Updates the displayed records when a new important heartbeat arrives.
         * @param {object} heartbeat - The heartbeat object received.
         * @returns {void}
         */
        onNewImportantHeartbeat(heartbeat) {
            if (this.page === 1) {
                this.displayedRecords.unshift(heartbeat);
                if (this.displayedRecords.length > this.perPage) {
                    this.displayedRecords.pop();
                }
                this.importantHeartBeatListLength += 1;
            }
        },

        /**
         * Retrieves the length of the important heartbeat list for all monitors.
         * @returns {void}
         */
        getImportantHeartbeatListLength() {
            this.$root.getSocket().emit("monitorImportantHeartbeatListCount", null, (res) => {
                if (res.ok) {
                    this.importantHeartBeatListLength = res.count;
                    this.getImportantHeartbeatListPaged();
                }
            });
        },

        /**
         * Retrieves the important heartbeat list for the current page.
         * @returns {void}
         */
        getImportantHeartbeatListPaged() {
            const offset = (this.page - 1) * this.perPage;
            this.$root.getSocket().emit("monitorImportantHeartbeatListPaged", null, offset, this.perPage, (res) => {
                if (res.ok) {
                    this.displayedRecords = res.data;
                }
            });
        },

        /**
         * Updates the number of items shown per page based on the available height.
         * @returns {void}
         */
        updatePerPage() {
            const tableContainer = this.$refs.tableContainer;
            const tableContainerHeight = tableContainer.offsetHeight;
            const availableHeight = window.innerHeight - tableContainerHeight;
            const additionalPerPage = Math.floor(availableHeight / 58);

            if (additionalPerPage > 0) {
                this.perPage = Math.max(this.initialPerPage, this.perPage + additionalPerPage);
            } else {
                this.perPage = this.initialPerPage;
            }

        },
    }
};
</script>

<style lang="scss" scoped>
@import "../styles/vars";

.overview-page { margin: 0 auto; max-width: 1320px; }

.overview-header {
    align-items: center;
    border-bottom: 1px solid #d9dce1;
    display: flex;
    justify-content: space-between;
    margin: 0 -18px;
    padding: 0 18px 12px;

    h1 { margin: 0; }
}

.status-summary {
    align-items: center;
    color: #6f757d;
    display: flex;
    font-size: 12px;
    gap: 0;

    span {
        align-items: center;
        display: flex;
        gap: 7px;
        padding: 0 12px;

        &:first-child { padding-left: 0; }
        & + span { border-left: 1px solid #d0d4d9; }
    }

    i { background: #90969e; border-radius: 50%; height: 8px; width: 8px; }
    strong { color: #272b30; font-family: "JetBrains Mono", monospace; font-weight: 500; }
    .running i { background: #69c84b; }
    .exited i { background: #e1ad29; }
}

.overview-grid {
    align-items: start;
    display: grid;
    gap: 12px;
    grid-template-columns: minmax(0, 1.1fr) minmax(340px, 0.9fr);
    padding-top: 12px;
}

.converter-panel,
.agents-panel {
    background: #fff;
    border: 1px solid #d9dce1;
    border-radius: 11px;
    min-height: 390px;
    padding: 16px;
}

.converter-panel {
    margin: 0;
}

.agents-panel { margin: 0; }

.panel-heading {
    align-items: center;
    border-bottom: 1px solid #d9dce1;
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    min-height: 34px;
    padding-bottom: 10px;

    h2 { margin: 0; }
    p { color: #737982; font-size: 12px; margin: 5px 0 0; }
}

.agent-panel-heading .btn,
.converter-actions .btn-link {
    color: $primary;
    min-height: auto;
    padding: 4px;
    text-decoration: none;
}

.command-editor {
    border: 1px solid #45494f;
    border-radius: 8px;
    overflow: hidden;
}

.editor-bar {
    align-items: center;
    background: #1a1c1f;
    border-bottom: 1px solid #45494f;
    color: #8d929a;
    display: flex;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    justify-content: space-between;
    min-height: 34px;
    padding: 0 12px;
}

.editor-body {
    background: #111315;
    display: grid;
    grid-template-columns: 36px 1fr;
    min-height: 240px;
}

.line-number {
    border-right: 1px solid #292c30;
    color: #626871;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    padding-top: 15px;
    text-align: center;
}

.docker-run {
    background: transparent;
    border: 0;
    color: #d9dce0;
    font-family: "JetBrains Mono", monospace;
    font-size: 13px;
    min-height: 240px;
    outline: 0;
    padding: 14px;
    resize: vertical;
}

.editor-help { color: #777d85; font-size: 11px; margin: 9px 0; }

.converter-actions {
    align-items: center;
    display: flex;
    gap: 12px;
    justify-content: flex-end;
}

.agent-table-head,
.agent-row {
    align-items: center;
    display: grid;
    gap: 12px;
    grid-template-columns: minmax(80px, 0.8fr) minmax(130px, 1.2fr) 76px 48px;
}

.agent-table-head {
    border-bottom: 1px solid #d9dce1;
    color: #777d85;
    font-size: 10px;
    padding: 0 7px 10px;
    text-transform: uppercase;
}

.agent-row {
    border-bottom: 1px solid #e0e3e6;
    font-size: 12px;
    min-height: 44px;
    padding: 0 7px;

    strong { font-weight: 550; }
}

.agent-address {
    color: #747a82;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.agent-status {
    align-items: center;
    color: #727880;
    display: flex;
    font-size: 11px;
    gap: 6px;
    justify-self: start;
    padding: 3px 7px;
    border-radius: 999px;
    background: rgba(123, 129, 137, 0.1);

    i { background: #7b8189; border-radius: 50%; height: 7px; width: 7px; }
    &.online { background: rgba(105, 200, 75, 0.1); }
    &.online i { background: #69c84b; }
    &.offline { background: rgba($danger, 0.1); }
    &.offline i { background: $danger; }
}

.agent-actions { display: flex; }

.icon-button {
    background: transparent;
    border: 0;
    border-radius: 4px;
    color: #777d85;
    height: 28px;
    width: 28px;

    &:hover { background: #eceef1; color: #262a2f; }
}

.agent-form {
    border-top: 1px solid #d9dce1;
    margin-top: 18px;
    padding: 18px 7px;
}

.agent-form-title {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin-bottom: 14px;
}

.dark {
    .overview-header,
    .panel-heading,
    .agent-table-head,
    .agent-row,
    .agent-form { border-color: $dark-border-color; }

    .status-summary {
        color: $dark-font-color;

        span + span { border-color: $dark-border-color; }
        strong { color: #e1e3e6; }
    }

    .panel-heading p,
    .editor-help,
    .agent-address { color: $dark-font-color3; }

    .icon-button:hover { background: #222529; color: #f0f1f2; }

    .converter-panel,
    .agents-panel {
        background: #1a1916;
        border-color: #35332e;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
    }

    .editor-bar { background: #1f1d19; border-color: #3b3832; }
    .editor-body { background: #121210; }
}

@media (max-width: 1120px) {
    .overview-grid { grid-template-columns: 1fr; }
    .converter-panel { margin: 0; }
    .agents-panel { margin: 0; }
    .dark .agents-panel { border-color: $dark-border-color; }
}

@media (max-width: 767px) {
    .overview-header { align-items: flex-start; flex-direction: column; gap: 10px; margin-inline: -14px; padding-inline: 14px; }
    .converter-panel, .agents-panel { min-height: 0; padding: 14px; }
    .overview-grid { min-height: auto; }
    .agent-table-head { display: none; }
    .agent-row { grid-template-columns: minmax(80px, 1fr) 80px 48px; }
    .agent-address { display: none; }
}

</style>
