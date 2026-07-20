<template>
    <transition name="slide-fade" appear>
        <div>
            <header class="stack-detail-header">
                <div class="stack-identity">
                    <h1 v-if="isAdd">{{ $t("compose") }}</h1>
                    <h1 v-else>{{ stack.name }}</h1>
                    <Uptime v-if="!isAdd" :stack="globalStack" :pill="true" />
                    <span v-if="globalStack?.hasUpdates" class="stack-update-indicator" :title="stackUpdateTitle">
                        {{ globalStack.updateServices?.length || 1 }} {{ $t("updates") }}
                    </span>
                    <span v-if="$root.agentCount > 1 && endpoint !== ''" class="agent-name">
                        {{ endpointDisplay }}
                    </span>
                    <small v-if="!isAdd">/opt/stacks/{{ stack.name }}/{{ stack.composeFileName || 'compose.yaml' }}</small>
                </div>

                <div v-if="stack.isManagedByDockge" class="stack-actions">
                    <button v-if="isEditMode" class="btn btn-primary" :disabled="processing" @click="deployStack">
                        <font-awesome-icon icon="rocket" class="me-1" />
                        {{ $t("deployStack") }}
                    </button>

                    <button v-if="isEditMode" class="btn btn-normal" :disabled="processing" @click="saveStack">
                        <font-awesome-icon icon="save" class="me-1" />
                        {{ $t("saveStackDraft") }}
                    </button>

                    <button v-if="!isEditMode" class="btn btn-secondary" :disabled="processing" @click="enableEditMode">
                        <font-awesome-icon icon="pen" class="me-1" />
                        {{ $t("editStack") }}
                    </button>

                    <button v-if="!isEditMode && !active" class="btn btn-primary" :disabled="processing" @click="startStack">
                        <font-awesome-icon icon="play" class="me-1" />
                        {{ $t("startStack") }}
                    </button>

                    <button v-if="!isEditMode && active" class="btn btn-normal" :disabled="processing" @click="restartStack">
                        <font-awesome-icon icon="rotate" class="me-1" />
                        {{ $t("restartStack") }}
                    </button>

                    <button v-if="!isEditMode" class="btn btn-primary" :disabled="processing" @click="updateStack">
                        <font-awesome-icon icon="cloud-arrow-down" class="me-1" />
                        {{ $t("updateStack") }}
                    </button>

                    <button v-if="!isEditMode && active" class="btn btn-normal" :disabled="processing" @click="stopStack">
                        <font-awesome-icon icon="stop" class="me-1" />
                        {{ $t("stopStack") }}
                    </button>

                    <BDropdown right text="" variant="normal">
                        <BDropdownItem @click="downStack">
                            <font-awesome-icon icon="stop" class="me-1" />
                            {{ $t("downStack") }}
                        </BDropdownItem>
                        <BDropdownItem v-if="!isEditMode && !errorDelete" @click="showDeleteDialog = !showDeleteDialog">
                            <font-awesome-icon icon="trash" class="me-1" /> {{ $t("deleteStack") }}
                        </BDropdownItem>
                        <BDropdownItem v-if="errorDelete" @click="showForceDeleteDialog = !showForceDeleteDialog">
                            <font-awesome-icon icon="trash" class="me-1" /> {{ $t("forceDeleteStack") }}
                        </BDropdownItem>
                    </BDropdown>
                    <button v-if="isEditMode && !isAdd" class="btn btn-normal" :disabled="processing" @click="discardStack">{{ $t("discardStack") }}</button>
                </div>
            </header>

            <!-- URLs -->
            <div v-if="urls.length > 0" class="mb-3">
                <a v-for="(urlItem, index) in urls" :key="index" target="_blank" :href="urlItem.url">
                    <span class="badge bg-secondary me-2">{{ urlItem.display }}</span>
                </a>
            </div>

            <!-- Progress Terminal -->
            <transition name="slide-fade" appear>
                <Terminal
                    v-show="showProgressTerminal"
                    ref="progressTerminal"
                    class="mb-3 terminal"
                    :name="terminalName"
                    :endpoint="endpoint"
                    :rows="progressTerminalRows"
                    @has-data="showProgressTerminal = true; submitted = true;"
                ></Terminal>
            </transition>

            <div v-if="stack.isManagedByDockge" class="stack-content-layout">
                <section class="services-section">
                    <!-- General -->
                    <div v-if="isAdd">
                        <h4 class="mb-3">{{ $t("general") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <!-- Stack Name -->
                            <div>
                                <label for="name" class="form-label">{{ $t("stackName") }}</label>
                                <input id="name" v-model="stack.name" type="text" class="form-control" required @blur="stackNameToLowercase">
                                <div class="form-text">{{ $t("Lowercase only") }}</div>
                            </div>

                            <!-- Endpoint -->
                            <div class="mt-3">
                                <label for="name" class="form-label">{{ $t("dockgeAgent") }}</label>
                                <select v-model="stack.endpoint" class="form-select">
                                    <option v-for="(agent, agentEndpoint) in $root.agentList" :key="agentEndpoint" :value="agentEndpoint" :disabled="$root.agentStatusList[agentEndpoint] != 'online'">
                                        ({{ $root.agentStatusList[agentEndpoint] }}) {{ (agent.name !== '') ? agent.name : agent.url || $t("Current") }}
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Containers -->
                    <div class="section-heading">
                        <div>
                            <h2>{{ $tc("container", 2) }}</h2>
                            <span>{{ Object.keys(jsonConfig.services || {}).length }}</span>
                        </div>
                    </div>

                    <div v-if="isEditMode" class="input-group mb-3">
                        <input
                            v-model="newContainerName"
                            :placeholder="$t(`New Container Name...`)"
                            class="form-control"
                            @keyup.enter="addContainer"
                        />
                        <button class="btn btn-primary" @click="addContainer">
                            {{ $t("addContainer") }}
                        </button>
                    </div>

                    <div ref="containerList" class="container-list">
                        <Container
                            v-for="(service, name) in jsonConfig.services"
                            :key="name"
                            :name="name"
                            :is-edit-mode="isEditMode"
                            :first="name === Object.keys(jsonConfig.services)[0]"
                            :serviceStatus="serviceStatusList[name]"
                            :dockerStats="dockerStats"
                            :update-services="globalStack?.updateServices || []"
                            @start-service="startService"
                            @stop-service="stopService"
                            @restart-service="restartService"
                        />
                    </div>

                    <button v-if="false && isEditMode && jsonConfig.services && Object.keys(jsonConfig.services).length > 0" class="btn btn-normal mb-3" @click="addContainer">{{ $t("addContainer") }}</button>

                    <!-- General -->
                    <div v-if="isEditMode">
                        <h4 class="mb-3">{{ $t("extra") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <!-- URLs -->
                            <div class="mb-4">
                                <label class="form-label">
                                    {{ $tc("url", 2) }}
                                </label>
                                <ArrayInput name="urls" :display-name="$t('url')" placeholder="https://" object-type="x-dockge" />
                            </div>
                        </div>
                    </div>
                </section>
                <section class="configuration-shell">
                    <div class="configuration-heading">
                        <h2>Configuration</h2>
                        <div class="configuration-state">
                            <span v-if="!isEditMode"><font-awesome-icon icon="check" /> Saved</span>
                            <button v-if="!isEditMode" class="btn btn-normal" @click="enableEditMode">
                                <font-awesome-icon icon="pen" class="me-1" /> {{ $t("editStack") }}
                            </button>
                            <button v-else class="btn btn-primary" :disabled="processing" @click="deployStack">
                                <font-awesome-icon icon="save" class="me-1" /> Apply changes
                            </button>
                        </div>
                    </div>
                    <div class="configuration-grid">
                        <div class="compose-pane">
                            <!-- Override YAML editor (only show if file exists) -->
                            <div v-if="stack.composeOverrideYAML && stack.composeOverrideYAML.trim() !== ''">
                                <h4 class="mb-3">{{ stack.composeOverrideFileName || 'compose.override.yaml' }}</h4>
                                <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode}">
                                    <button v-if="isEditMode" v-b-modal.compose-override-editor-modal class="expand-button">
                                        <font-awesome-icon icon="expand" />
                                    </button>
                                    <code-mirror
                                        ref="overrideEditor"
                                        v-model="stack.composeOverrideYAML"
                                        :extensions="extensions"
                                        minimal
                                        wrap
                                        dark
                                        tab
                                        :disabled="!isEditMode"
                                        :hasFocus="editorFocus"
                                        @change="yamlCodeChange"
                                    />
                                </div>
                                <div v-if="isEditMode" class="mb-3">
                                    {{ yamlError }}
                                </div>

                                <!-- Override modal fullscreen editor (CodeMirror) -->
                                <BModal
                                    id="compose-override-editor-modal" :title="stack.composeOverrideFileName || 'compose.override.yaml'"
                                    scrollable size="fullscreen" hide-footer
                                >
                                    <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode}">
                                        <code-mirror
                                            ref="editor"
                                            v-model="stack.composeOverrideYAML"
                                            :extensions="extensions"
                                            minimal
                                            wrap
                                            dark
                                            tab
                                            :disabled="!isEditMode"
                                            :hasFocus="editorFocus"
                                            @change="yamlCodeChange"
                                        />
                                    </div>
                                    <div v-if="isEditMode" class="mb-3">
                                        {{ yamlError }}
                                    </div>
                                </BModal>
                            </div>

                            <h3 class="pane-title">Compose YAML <span>{{ stack.composeFileName }}</span></h3>

                            <!-- YAML editor -->
                            <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode}">
                                <button v-if="isEditMode" v-b-modal.compose-editor-modal class="expand-button">
                                    <font-awesome-icon icon="expand" />
                                </button>
                                <code-mirror
                                    ref="editor"
                                    v-model="stack.composeYAML"
                                    :extensions="extensions"
                                    minimal
                                    wrap
                                    dark
                                    tab
                                    :disabled="!isEditMode"
                                    :hasFocus="editorFocus"
                                    @change="yamlCodeChange"
                                />
                            </div>
                            <div v-if="isEditMode" class="mb-3">
                                {{ yamlError }}
                            </div>

                            <!-- YAML modal fullscreen editor (CodeMirror) -->
                            <BModal id="compose-editor-modal" :title="stack.composeFileName" scrollable size="fullscreen" hide-footer>
                                <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode}">
                                    <code-mirror
                                        ref="editor"
                                        v-model="stack.composeYAML"
                                        :extensions="extensions"
                                        minimal
                                        wrap
                                        dark
                                        tab
                                        :disabled="!isEditMode"
                                        :hasFocus="editorFocus"
                                        @change="yamlCodeChange"
                                    />
                                </div>
                                <div v-if="isEditMode" class="mb-3">
                                    {{ yamlError }}
                                </div>
                            </BModal>
                        </div>
                        <div class="environment-pane">
                            <!-- ENV editor -->
                            <div>
                                <h3 class="pane-title">Environment <span>.env</span></h3>
                                <div class="environment-table">
                                    <div class="environment-table-head"><span>Key</span><span>Value</span></div>
                                    <div v-for="entry in envEntries" :key="entry.lineIndex" class="environment-row">
                                        <code>{{ entry.key }}</code>
                                        <input
                                            v-if="isEditMode"
                                            :value="entry.value"
                                            type="text"
                                            @input="updateEnvEntry(entry, $event.target.value)"
                                        />
                                        <span v-else>{{ entry.maskedValue }}</span>
                                    </div>
                                    <button v-if="isEditMode" v-b-modal.env-editor-modal class="raw-env-button" type="button">
                                        <font-awesome-icon icon="expand" /> Edit raw .env
                                    </button>
                                </div>
                            </div>

                            <!-- ENV modal fullscreen editor (CodeMirror) -->
                            <BModal id="env-editor-modal" title=".env" scrollable size="fullscreen" hide-footer>
                                <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode}">
                                    <code-mirror
                                        ref="editor"
                                        v-model="stack.composeENV"
                                        :extensions="extensionsEnv"
                                        minimal
                                        wrap
                                        dark
                                        tab
                                        :disabled="!isEditMode"
                                        :hasFocus="editorFocus"
                                        @change="yamlCodeChange"
                                    />
                                </div>
                            </BModal>
                        </div>
                    </div>

                    <div v-if="isEditMode">
                        <!-- Volumes -->
                        <div v-if="false">
                            <h4 class="mb-3">{{ $tc("volume", 2) }}</h4>
                            <div class="shadow-box big-padding mb-3">
                            </div>
                        </div>

                        <!-- Networks -->
                        <h4 class="mb-3">{{ $tc("network", 2) }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <NetworkInput />
                        </div>
                    </div>

                    <!-- <div class="shadow-box big-padding mb-3">
                        <div class="mb-3">
                            <label for="name" class="form-label"> Search Templates</label>
                            <input id="name" v-model="name" type="text" class="form-control" placeholder="Search..." required>
                        </div>
                    </div>-->
                </section>

                <section v-show="!isEditMode && !isAdd" class="activity-output-shell" :class="{ expanded: outputExpanded, collapsed: !outputVisible }">
                    <div class="activity-output-heading">
                        <div>
                            <h2>Activity &amp; output</h2>
                            <span><font-awesome-icon icon="check-circle" /> Live</span>
                        </div>
                        <div class="output-actions">
                            <button v-if="outputVisible" class="btn btn-normal output-toggle" type="button" @click="toggleOutputSize">
                                <font-awesome-icon :icon="outputExpanded ? 'chevron-down' : 'expand'" />
                                {{ outputExpanded ? 'Restore' : 'Expand' }}
                            </button>
                            <button class="btn btn-normal output-toggle" type="button" @click="toggleOutputVisibility">
                                <font-awesome-icon :icon="outputVisible ? 'chevron-up' : 'chevron-down'" />
                                {{ outputVisible ? 'Hide' : 'Show output' }}
                            </button>
                        </div>
                    </div>
                    <Terminal
                        v-show="outputVisible"
                        ref="combinedTerminal"
                        class="terminal"
                        :name="combinedTerminalName"
                        :endpoint="endpoint"
                        :rows="combinedTerminalRows"
                        :cols="combinedTerminalCols"
                    ></Terminal>
                </section>
            </div>

            <div v-if="!stack.isManagedByDockge && !processing">
                {{ $t("stackNotManagedByDockgeMsg") }}
            </div>

            <!-- Delete Dialog -->
            <BModal v-model="showDeleteDialog" :cancelTitle="$t('cancel')" :okTitle="$t('deleteStack')" okVariant="danger" @ok="deleteDialog">
                {{ $t("deleteStackMsg") }}
                <div class="form-check mt-4">
                    <label><input v-model="deleteStackFiles" class="form-check-input" type="checkbox" />{{
                        $t("deleteStackFilesConfirmation") }}</label>
                </div>
            </BModal>

            <!-- Force Delete Dialog -->
            <BModal v-model="showForceDeleteDialog" :okTitle="$t('forceDeleteStack')" okVariant="danger" @ok="forceDeleteDialog">
                {{ $t("forceDeleteStackMsg") }}
            </BModal>
        </div>
    </transition>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { yaml } from "@codemirror/lang-yaml";
import { python } from "@codemirror/lang-python";
import { dracula as editorTheme } from "thememirror";
import { lineNumbers, EditorView, Decoration, ViewPlugin } from "@codemirror/view";
import { parseDocument, Document } from "yaml";
import { RangeSetBuilder } from "@codemirror/state";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import {
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    copyYAMLComments, envsubstYAML,
    getCombinedTerminalName,
    getComposeTerminalName,
    PROGRESS_TERMINAL_ROWS,
    RUNNING
} from "../../../common/util-common";
import { BModal } from "bootstrap-vue-next";
import NetworkInput from "../components/NetworkInput.vue";
import dotenv from "dotenv";
import { ref } from "vue";

const template = `
services:
  nginx:
    image: nginx:latest
    restart: unless-stopped
    ports:
      - "8080:80"
`;
const envDefault = "# VARIABLE=value #comment";

let yamlErrorTimeout = null;

let serviceStatusTimeout = null;
let dockerStatsTimeout = null;

// Highlight $VAR and ${VAR}
const variableHighlight = ViewPlugin.fromClass(class {
    constructor(view) {
        this.decorations = this.buildDecorations(view);
    }

    update(update) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view) {
        const builder = new RangeSetBuilder();

        for (const { from, to } of view.visibleRanges) {
            const text = view.state.doc.sliceString(from, to);
            const variableRegex = /\$\{?[A-Za-z0-9_]+\}?/g;
            let match;
            while ((match = variableRegex.exec(text)) !== null) {
                const start = from + match.index;
                const end = start + match[0].length;

                builder.add(
                    start,
                    end,
                    Decoration.mark({ class: "cm-variable-highlight" })
                );
            }
        }

        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

export default {
    components: {
        NetworkInput,
        FontAwesomeIcon,
        CodeMirror,
        BModal,
    },
    beforeRouteUpdate(to, from, next) {
        this.exitConfirm(next);
    },
    beforeRouteLeave(to, from, next) {
        this.exitConfirm(next);
    },
    setup() {
        const editorFocus = ref(false);

        const focusEffectHandler = (state, focusing) => {
            editorFocus.value = focusing;
            return null;
        };

        const extensions = [
            editorTheme,
            yaml(),
            variableHighlight,
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        const extensionsEnv = [
            editorTheme,
            python(),
            variableHighlight,
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        return {
            extensions,
            extensionsEnv,
            editorFocus
        };
    },
    yamlDoc: null,  // For keeping the yaml comments
    data() {
        return {
            jsonConfig: {},
            envsubstJSONConfig: {},
            yamlError: "",
            processing: true,
            showProgressTerminal: false,
            progressTerminalRows: PROGRESS_TERMINAL_ROWS,
            combinedTerminalRows: COMBINED_TERMINAL_ROWS,
            combinedTerminalCols: COMBINED_TERMINAL_COLS,
            stack: {
                composeOverrideYAML: "",
            },
            serviceStatusList: {},
            dockerStats: {},
            errorDelete: false,
            isEditMode: false,
            submitted: false,
            showDeleteDialog: false,
            deleteStackFiles: false,
            showForceDeleteDialog: false,
            newContainerName: "",
            outputVisible: true,
            outputExpanded: false,
            stopServiceStatusTimeout: false,
            stopDockerStatsTimeout: false,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.endpoint);
        },

        urls() {
            if (!this.envsubstJSONConfig["x-dockge"] || !this.envsubstJSONConfig["x-dockge"].urls || !Array.isArray(this.envsubstJSONConfig["x-dockge"].urls)) {
                return [];
            }

            let urls = [];
            for (const url of this.envsubstJSONConfig["x-dockge"].urls) {
                let display;
                try {
                    let obj = new URL(url);
                    let pathname = obj.pathname;
                    if (pathname === "/") {
                        pathname = "";
                    }
                    display = obj.host + pathname + obj.search;
                } catch (e) {
                    display = url;
                }

                urls.push({
                    display,
                    url,
                });
            }
            return urls;
        },

        isAdd() {
            return this.$route.path === "/compose" && !this.submitted;
        },

        /**
         * Get the stack from the global stack list, because it may contain more real-time data like status
         * @return {*}
         */
        globalStack() {
            return this.$root.completeStackList[this.stack.name + "_" + this.endpoint];
        },

        stackUpdateTitle() {
            const services = this.globalStack?.updateServices || [];
            if (services.length > 0) {
                return `${this.$t("updateAvailable")}: ${services.join(", ")}`;
            }
            return this.$t("updateAvailable");
        },

        status() {
            return this.globalStack?.status;
        },

        active() {
            return this.status === RUNNING;
        },

        terminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getComposeTerminalName(this.endpoint, this.stack.name);
        },

        combinedTerminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getCombinedTerminalName(this.endpoint, this.stack.name);
        },

        networks() {
            return this.jsonConfig.networks;
        },

        endpoint() {
            return this.stack.endpoint || this.$route.params.endpoint || "";
        },

        envEntries() {
            return (this.stack.composeENV || "")
                .split(/\r?\n/)
                .map((line, lineIndex) => {
                    const separator = line.indexOf("=");
                    if (separator <= 0 || line.trim().startsWith("#")) {
                        return null;
                    }
                    const key = line.slice(0, separator).trim();
                    const value = line.slice(separator + 1);
                    const sensitive = /(password|secret|token|key)/i.test(key);
                    return {
                        key,
                        value,
                        lineIndex,
                        maskedValue: sensitive ? "••••••••••••" : value,
                    };
                })
                .filter(Boolean);
        },

        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
    },
    watch: {
        "stack.composeYAML": {
            handler() {
                if (this.editorFocus) {
                    console.debug("yaml code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        "stack.composeENV": {
            handler() {
                if (this.editorFocus) {
                    console.debug("env code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        "stack.composeOverrideYAML": {
            handler() {
                if (this.editorFocus) {
                    console.debug("override yaml code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        jsonConfig: {
            handler() {
                if (!this.editorFocus) {
                    console.debug("jsonConfig changed");

                    let doc = new Document(this.jsonConfig);

                    // Stick back the yaml comments
                    if (this.yamlDoc) {
                        copyYAMLComments(doc, this.yamlDoc);
                    }

                    this.stack.composeYAML = doc.toString();
                    this.yamlDoc = doc;
                }
            },
            deep: true,
        },

        $route(to, from) {

        }
    },
    mounted() {
        if (this.isAdd) {
            this.processing = false;
            this.isEditMode = true;

            let composeYAML;
            let composeENV;

            if (this.$root.composeTemplate) {
                composeYAML = this.$root.composeTemplate;
                this.$root.composeTemplate = "";
            } else {
                composeYAML = template;
            }
            if (this.$root.envTemplate) {
                composeENV = this.$root.envTemplate;
                this.$root.envTemplate = "";
            } else {
                composeENV = envDefault;
            }

            // Default Values
            this.stack = {
                name: "",
                composeYAML,
                composeENV,
                isManagedByDockge: true,
                endpoint: "",
            };

            this.yamlCodeChange();

        } else {
            this.stack.name = this.$route.params.stackName;
            this.loadStack();
        }

        this.requestServiceStatus();
        this.requestDockerStats();
    },
    unmounted() {

    },
    methods: {
        toggleOutputSize() {
            this.outputExpanded = !this.outputExpanded;
            this.$nextTick(() => this.$refs.combinedTerminal?.updateTerminalSize());
        },
        toggleOutputVisibility() {
            this.outputVisible = !this.outputVisible;
            if (!this.outputVisible) {
                this.outputExpanded = false;
            }
            this.$nextTick(() => this.$refs.combinedTerminal?.updateTerminalSize());
        },
        updateEnvEntry(entry, value) {
            const lines = (this.stack.composeENV || "").split(/\r?\n/);
            lines[entry.lineIndex] = `${entry.key}=${value}`;
            this.stack.composeENV = lines.join("\n");
        },
        startServiceStatusTimeout() {
            clearTimeout(serviceStatusTimeout);
            serviceStatusTimeout = setTimeout(async () => {
                this.requestServiceStatus();
            }, 5000);
        },

        startDockerStatsTimeout() {
            clearTimeout(dockerStatsTimeout);
            dockerStatsTimeout = setTimeout(async () => {
                this.requestDockerStats();
            }, 5000);
        },

        requestServiceStatus() {
            // Do not request if it is add mode
            if (this.isAdd) {
                return;
            }

            this.$root.emitAgent(this.endpoint, "serviceStatusList", this.stack.name, (res) => {
                if (res.ok) {
                    this.serviceStatusList = res.serviceStatusList;
                }
                if (!this.stopServiceStatusTimeout) {
                    this.startServiceStatusTimeout();
                }
            });
        },

        requestDockerStats() {
            this.$root.emitAgent(this.endpoint, "dockerStats", (res) => {
                if (res.ok) {
                    this.dockerStats = res.dockerStats;
                }
                if (!this.stopDockerStatsTimeout) {
                    this.startDockerStatsTimeout();
                }
            });
        },

        exitConfirm(next) {
            if (this.isEditMode) {
                if (confirm(this.$t("confirmLeaveStack"))) {
                    this.exitAction();
                    next();
                } else {
                    next(false);
                }
            } else {
                this.exitAction();
                next();
            }
        },

        exitAction() {
            console.log("exitAction");
            this.stopServiceStatusTimeout = true;
            this.stopDockerStatsTimeout = true;
            clearTimeout(serviceStatusTimeout);
            clearTimeout(dockerStatsTimeout);

            // Leave Combined Terminal
            console.debug("leaveCombinedTerminal", this.endpoint, this.stack.name);
            this.$root.emitAgent(this.endpoint, "leaveCombinedTerminal", this.stack.name, () => {});
        },

        bindTerminal() {
            this.$refs.progressTerminal?.bind(this.endpoint, this.terminalName);
        },

        loadStack() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "getStack", this.stack.name, (res) => {
                if (res.ok) {
                    this.stack = res.stack;
                    this.yamlCodeChange();
                    this.processing = false;
                    this.bindTerminal();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        deployStack() {
            this.processing = true;

            if (!this.jsonConfig.services) {
                this.$root.toastError("No services found in compose.yaml");
                this.processing = false;
                return;
            }

            // Check if services is object
            if (typeof this.jsonConfig.services !== "object") {
                this.$root.toastError("Services must be an object");
                this.processing = false;
                return;
            }

            let serviceNameList = Object.keys(this.jsonConfig.services);

            // Set the stack name if empty, use the first container name
            if (!this.stack.name && serviceNameList.length > 0) {
                let serviceName = serviceNameList[0];
                let service = this.jsonConfig.services[serviceName];

                if (service && service.container_name) {
                    this.stack.name = service.container_name;
                } else {
                    this.stack.name = serviceName;
                }
            }

            this.bindTerminal();

            this.$root.emitAgent(this.stack.endpoint, "deployStack", this.stack.name, this.stack.composeYAML, this.stack.composeENV, this.stack.composeOverrideYAML || "", this.isAdd, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        saveStack() {
            this.processing = true;

            this.$root.emitAgent(this.stack.endpoint, "saveStack", this.stack.name, this.stack.composeYAML, this.stack.composeENV, this.stack.composeOverrideYAML || "", this.isAdd, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.isEditMode = false;
                    this.$router.push(this.url);
                }
            });
        },

        startStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "startStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        stopStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "stopStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        downStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "downStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        restartStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "restartStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        updateStack() {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "updateStack", this.stack.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        deleteDialog() {
            this.$root.emitAgent(this.endpoint, "deleteStack", this.stack.name, { deleteStackFiles: this.deleteStackFiles }, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.$router.push("/");
                } else {
                    this.errorDelete = true;
                }
            });
        },

        forceDeleteDialog() {
            this.$root.emitAgent(this.endpoint, "forceDeleteStack", this.stack.name, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.$router.push("/");
                }
            });
        },

        discardStack() {
            this.loadStack();
            this.isEditMode = false;
        },

        yamlToJSON(yaml) {
            let doc = parseDocument(yaml);
            if (doc.errors.length > 0) {
                throw doc.errors[0];
            }

            const config = doc.toJS() ?? {};

            // Check data types
            // "services" must be an object
            if (!config.services) {
                config.services = {};
            }

            if (Array.isArray(config.services) || typeof config.services !== "object") {
                throw new Error("Services must be an object");
            }

            return {
                config,
                doc,
            };
        },

        yamlCodeChange() {
            try {
                let { config, doc } = this.yamlToJSON(this.stack.composeYAML);

                this.yamlDoc = doc;
                this.jsonConfig = config;

                let env = dotenv.parse(this.stack.composeENV);
                let envYAML = envsubstYAML(this.stack.composeYAML, env);
                this.envsubstJSONConfig = this.yamlToJSON(envYAML).config;

                clearTimeout(yamlErrorTimeout);
                this.yamlError = "";
            } catch (e) {
                clearTimeout(yamlErrorTimeout);

                if (this.yamlError) {
                    this.yamlError = e.message;

                } else {
                    yamlErrorTimeout = setTimeout(() => {
                        this.yamlError = e.message;
                    }, 3000);
                }
            }
        },

        enableEditMode() {
            this.isEditMode = true;
        },

        checkYAML() {
            // TODO: implement validation
        },

        addContainer() {
            this.checkYAML();

            if (this.jsonConfig.services[this.newContainerName]) {
                this.$root.toastError("Container name already exists");
                return;
            }

            if (!this.newContainerName) {
                this.$root.toastError("Container name cannot be empty");
                return;
            }

            this.jsonConfig.services[this.newContainerName] = {
                restart: "unless-stopped",
            };
            this.newContainerName = "";
            let element = this.$refs.containerList.lastElementChild;
            element.scrollIntoView({
                block: "start",
                behavior: "smooth"
            });
        },

        stackNameToLowercase() {
            this.stack.name = this.stack?.name?.toLowerCase();
        },

        startService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "startService", this.stack.name, serviceName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },

        stopService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "stopService", this.stack.name, serviceName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },

        restartService(serviceName) {
            this.processing = true;

            this.$root.emitAgent(this.endpoint, "restartService", this.stack.name, serviceName, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.requestServiceStatus(); // Refresh service status
                }
            });
        },
    }
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.stack-detail-header {
    align-items: center;
    background: #15171b;
    border: 1px solid #2b2f36;
    border-radius: 8px;
    display: flex;
    gap: 16px;
    justify-content: space-between;
    margin-bottom: 10px;
    min-height: 76px;
    padding: 12px 14px;
}

.stack-identity {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;

    h1 {
        color: #f0f2f5;
        font-size: 21px;
        font-weight: 600;
        line-height: 1;
        margin: 0 4px 0 0;
    }

    small {
        color: #89919c;
        flex-basis: 100%;
        font-family: "JetBrains Mono", monospace;
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.stack-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;

    :deep(.btn-group) { gap: 8px; }
}

.stack-content-layout {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.configuration-shell,
.activity-output-shell,
.services-section {
    background: #15171b;
    border: 1px solid #2b2f36;
    border-radius: 8px;
    overflow: hidden;
}

.services-section { order: 1; }
.configuration-shell { order: 2; }
.activity-output-shell { order: 3; }

.configuration-heading,
.activity-output-heading,
.section-heading {
    align-items: center;
    border-bottom: 1px solid #2b2f36;
    display: flex;
    justify-content: space-between;
    min-height: 48px;
    padding: 8px 12px;

    h2 {
        color: #e7eaee;
        font-size: 15px;
        font-weight: 600;
        margin: 0;
    }
}

.section-heading > div,
.activity-output-heading > div {
    align-items: center;
    display: flex;
    gap: 9px;
}

.section-heading span {
    color: #89919c;
    font-size: 12px;
}

.services-section > .input-group,
.container-list {
    margin-inline: 12px;
}

.container-list {
    padding-top: 10px;
}

.configuration-state {
    align-items: center;
    display: flex;
    gap: 10px;

    > span {
        color: #69c590;
        font-size: 12px;
    }
}

.configuration-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.65fr) minmax(260px, 1fr);
}

.compose-pane,
.environment-pane {
    background: #101216;
    min-width: 0;
}

.compose-pane { border-right: 1px solid #2b2f36; }

.pane-title {
    align-items: center;
    background: #171a1f;
    border-bottom: 1px solid #2b2f36;
    color: #dfe3e8;
    display: flex;
    font-size: 13px;
    font-weight: 600;
    justify-content: space-between;
    margin: 0;
    min-height: 43px;
    padding: 9px 12px;

    span {
        color: #89919c;
        font-family: "JetBrains Mono", monospace;
        font-size: 10px;
        font-weight: 400;
    }
}

.environment-table {
    background: #101216;
    height: 340px;
    overflow: auto;
}

.environment-table-head,
.environment-row {
    align-items: center;
    border-bottom: 1px solid #252930;
    display: grid;
    grid-template-columns: minmax(130px, 1fr) minmax(120px, 1.25fr);
    min-height: 42px;
    padding: 0 11px;
}

.environment-table-head {
    color: #89919c;
    font-size: 11px;
    min-height: 36px;
    font-weight: 500;
}

.environment-row {
    color: #cdd2d9;
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    gap: 9px;

    code {
        color: #d7dce2;
        font-size: inherit;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    input {
        background: #15181d;
        border: 1px solid #343941;
        border-radius: 5px;
        color: #e1e4e8;
        font-family: inherit;
        font-size: inherit;
        min-height: 29px;
        padding: 4px 7px;
        width: 100%;
    }
}

.raw-env-button {
    background: transparent;
    border: 0;
    color: #9ca4af;
    font-size: 12px;
    padding: 11px;
}

.terminal {
    border: 0;
    border-radius: 0;
    height: 176px;
}

.activity-output-shell .terminal { height: 250px; }

.activity-output-heading {
    min-height: 48px;

    span {
        color: #69c590;
        font-size: 12px;
    }
}

.activity-output-shell.expanded .terminal { height: min(56vh, 560px); }
.activity-output-shell.collapsed .activity-output-heading { border-bottom: 0; }

.output-toggle {
    align-items: center;
    display: inline-flex;
    gap: 7px;
}

.output-actions {
    display: flex;
    gap: 7px;
}

:deep(.cm-variable-highlight) {
    color: #7eabe9;
    font-weight: 600;
}

.editor-box {
    border: 0;
    border-radius: 0;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    height: 340px;
    margin: 0 !important;
    padding: 0;

    &.edit-mode {
        background-color: #12151a !important;
    }

    position: relative;
}

:deep(.editor-box .cm-editor) {
    background: #101216;
    height: 340px;
}

:deep(.editor-box .cm-scroller) {
    font-family: "JetBrains Mono", monospace;
    line-height: 1.55;
}

:deep(.editor-box .cm-gutters) {
    background: #13161a;
    border-right-color: #252930;
    color: #68717d;
}

.expand-button {
    all: unset;
    position: absolute;
    right: 15px;
    top: 15px;
    z-index: 10;
}

.expand-button svg {
    width:20px;
    height: 20px;
}

.expand-button:hover {
    color: white;
}

.agent-name {
    color: #929aa5;
    font-size: 11px;
}

.stack-update-indicator {
    background: rgba($primary, 0.12);
    border: 1px solid rgba($primary, 0.35);
    border-radius: 4px;
    color: #e0b25b;
    display: inline-flex;
    font-size: 11px;
    padding: 3px 6px;
    vertical-align: middle;
}

@media (max-width: 1100px) {
    .configuration-grid { grid-template-columns: 1fr; }
    .compose-pane { border-bottom: 1px solid #2b2f36; border-right: 0; }
    .editor-box,
    :deep(.editor-box .cm-editor),
    .environment-table { height: 310px; }
}

@media (min-width: 1101px) and (max-height: 800px) {
    .editor-box,
    :deep(.editor-box .cm-editor),
    .environment-table { height: 230px; }

    .terminal { height: 210px; }
}

@media (max-width: 767px) {
    .stack-detail-header {
        align-items: flex-start;
        flex-direction: column;
    }

    .stack-actions { justify-content: flex-start; }
    .configuration-heading { align-items: flex-start; gap: 8px; }
    .configuration-state { flex-wrap: wrap; justify-content: flex-end; }
}
</style>
