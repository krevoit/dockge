<template>
    <div>
        <div v-if="settingsLoaded" class="my-4">
            <!-- Channels -->
            <div class="mb-4">
                <h5>{{ $t("Channels") }}</h5>

                <div v-if="channels.length > 0" class="channel-list mb-3">
                    <div v-for="(channel, index) in channels" :key="channel.id" class="channel-row" :class="{ disabled: !channel.enabled }">
                        <div class="form-check form-switch m-0" :title="channel.enabled ? $t('Enabled') : $t('Disabled')">
                            <input
                                v-model="channel.enabled"
                                class="form-check-input"
                                type="checkbox"
                                role="switch"
                                :aria-label="$t('Enabled')"
                                @change="saveSettings()"
                            />
                        </div>
                        <div class="channel-info">
                            <div class="channel-name">{{ channel.name }}</div>
                            <div v-if="channel.name !== providerName(channel.type)" class="channel-type">{{ providerName(channel.type) }}</div>
                        </div>
                        <div class="channel-actions">
                            <button class="btn btn-normal btn-sm" type="button" :disabled="testingId === channel.id" @click="sendTest(channel)">
                                <font-awesome-icon :icon="testingId === channel.id ? 'spinner' : 'bullhorn'" :spin="testingId === channel.id" />
                                <span class="label">{{ $t("Test") }}</span>
                            </button>
                            <button class="btn btn-normal btn-sm" type="button" @click="editChannel(index)">
                                <font-awesome-icon icon="pen" />
                                <span class="label">{{ $t("Edit") }}</span>
                            </button>
                            <button class="btn btn-outline-danger btn-sm" type="button" :aria-label="$t('delete')" @click="deleteChannel(index)">
                                <font-awesome-icon icon="trash" />
                            </button>
                        </div>
                    </div>
                </div>
                <p v-else-if="!editing" class="form-text">{{ $t("noNotificationChannels") }}</p>

                <button v-if="!editing" class="btn btn-normal" type="button" :disabled="channels.length >= maxChannels" @click="addChannel">
                    <font-awesome-icon icon="plus" class="me-1" />
                    {{ $t("Add channel") }}
                </button>

                <!-- Channel editor -->
                <form v-if="editing" class="channel-editor" autocomplete="off" @submit.prevent="saveChannel">
                    <h6 class="mb-3">{{ editingIndex === null ? $t("Add channel") : $t("Edit channel") }}</h6>
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label" for="channelType">{{ $t("Type") }}</label>
                            <select id="channelType" v-model="editing.type" class="form-select" @change="onTypeChange">
                                <option v-for="provider in providers" :key="provider.type" :value="provider.type">{{ provider.name }}</option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label" for="channelName">{{ $t("Name") }}</label>
                            <input id="channelName" v-model.trim="editing.name" class="form-control" maxlength="60" :placeholder="currentProvider.name" />
                        </div>
                        <div v-for="field in currentProvider.fields" :key="editing.type + field.key" class="col-12">
                            <label class="form-label" :for="'field-' + field.key">{{ field.label }}</label>
                            <input
                                :id="'field-' + field.key"
                                v-model.trim="editing.config[field.key]"
                                class="form-control"
                                :type="field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'"
                                :required="field.required"
                                :placeholder="field.placeholder"
                                autocomplete="off"
                                spellcheck="false"
                            />
                            <div v-if="field.help" class="form-text">{{ field.help }}</div>
                        </div>
                    </div>

                    <div class="d-flex flex-wrap gap-2 mt-3">
                        <button class="btn btn-primary" type="submit">{{ $t("Save") }}</button>
                        <button class="btn btn-normal" type="button" :disabled="testingId === 'editor'" @click="sendTest(editing, 'editor')">
                            <font-awesome-icon :icon="testingId === 'editor' ? 'spinner' : 'bullhorn'" :spin="testingId === 'editor'" class="me-1" />
                            {{ $t("Send test notification") }}
                        </button>
                        <button class="btn btn-normal" type="button" @click="cancelEdit">{{ $t("Cancel") }}</button>
                    </div>
                </form>
            </div>

            <form autocomplete="off" @submit.prevent="saveSettings()">
                <!-- Events -->
                <div class="mb-4">
                    <h5>{{ $t("Notify me when") }}</h5>

                    <div class="form-check mb-2">
                        <label>
                            <input v-model="settings.notifyImageUpdates" class="form-check-input" type="checkbox" />
                            {{ $t("A stack has image updates available") }}
                        </label>
                        <div class="form-text">{{ $t("notifyImageUpdatesHelp") }}</div>
                    </div>

                    <div class="form-check mb-2">
                        <label>
                            <input v-model="settings.notifyContainerCrash" class="form-check-input" type="checkbox" />
                            {{ $t("A container crashes or runs out of memory") }}
                        </label>
                        <div class="form-text">{{ $t("notifyContainerCrashHelp") }}</div>
                    </div>

                    <div class="form-check mb-2">
                        <label>
                            <input v-model="settings.notifyContainerUnhealthy" class="form-check-input" type="checkbox" />
                            {{ $t("A container becomes unhealthy (and when it recovers)") }}
                        </label>
                    </div>
                </div>

                <!-- Loop protection -->
                <div class="mb-4">
                    <h5>{{ $t("Repeat protection") }}</h5>
                    <div class="row g-3">
                        <div class="col-sm-6 col-lg-4">
                            <label class="form-label" for="notificationCooldownMinutes">{{ $t("Cooldown (minutes)") }}</label>
                            <input
                                id="notificationCooldownMinutes"
                                v-model.number="settings.notificationCooldownMinutes"
                                class="form-control"
                                type="number"
                                min="1"
                                max="1440"
                                step="1"
                            />
                        </div>
                    </div>
                    <div class="form-text">
                        {{ $t("notificationCooldownHelp") }}
                    </div>
                </div>

                <div>
                    <button class="btn btn-primary" type="submit">
                        {{ $t("Save") }}
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<script>
import { getNotificationProvider, MAX_NOTIFICATION_CHANNELS, NOTIFICATION_PROVIDERS } from "../../../../common/notification-providers";

export default {
    data() {
        return {
            providers: NOTIFICATION_PROVIDERS,
            maxChannels: MAX_NOTIFICATION_CHANNELS,
            editing: null,
            editingIndex: null,
            testingId: null,
        };
    },

    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        },
        channels() {
            return this.settings.notificationChannels || [];
        },
        currentProvider() {
            return getNotificationProvider(this.editing?.type) || NOTIFICATION_PROVIDERS[0];
        },
    },

    methods: {
        providerName(type) {
            return getNotificationProvider(type)?.name || type;
        },

        defaultConfig(type) {
            const config = {};
            for (const field of getNotificationProvider(type)?.fields || []) {
                config[field.key] = field.default || "";
            }
            return config;
        },

        addChannel() {
            const type = NOTIFICATION_PROVIDERS[0].type;
            this.editingIndex = null;
            this.editing = {
                id: "",
                name: "",
                type,
                enabled: true,
                config: this.defaultConfig(type),
            };
        },

        editChannel(index) {
            const channel = this.channels[index];
            this.editingIndex = index;
            this.editing = {
                ...channel,
                config: {
                    ...this.defaultConfig(channel.type),
                    ...channel.config,
                },
            };
        },

        onTypeChange() {
            this.editing.config = this.defaultConfig(this.editing.type);
        },

        cancelEdit() {
            this.editing = null;
            this.editingIndex = null;
        },

        saveChannel() {
            const channel = {
                ...this.editing,
                name: this.editing.name || this.currentProvider.name,
            };
            const list = [ ...this.channels ];
            if (this.editingIndex === null) {
                list.push(channel);
            } else {
                list[this.editingIndex] = channel;
            }
            this.settings.notificationChannels = list;
            this.saveSettings((res) => {
                if (res?.ok) {
                    this.cancelEdit();
                }
            });
        },

        deleteChannel(index) {
            const channel = this.channels[index];
            if (!confirm(this.$t("confirmDeleteChannel", { name: channel.name }))) {
                return;
            }
            this.settings.notificationChannels = this.channels.filter((_, i) => i !== index);
            if (this.editingIndex === index) {
                this.cancelEdit();
            }
            this.saveSettings();
        },

        sendTest(channel, testingId = channel.id) {
            this.testingId = testingId;
            this.$root.getSocket().emit("sendTestNotification", channel, (res) => {
                this.testingId = null;
                this.$root.toastRes(res);
            });
        },
    },
};
</script>

<style scoped lang="scss">
.channel-list {
    border: 1px solid var(--ct-292e35);
    border-radius: 6px;
}

.channel-row {
    align-items: center;
    display: flex;
    gap: 12px;
    padding: 10px 12px;

    & + & {
        border-top: 1px solid var(--ct-292e35);
    }

    &.disabled .channel-info {
        opacity: 0.55;
    }
}

.channel-info {
    flex: 1;
    min-width: 0;
}

.channel-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.channel-type {
    color: var(--ct-89919c);
    font-size: 12px;
}

.channel-actions {
    display: flex;
    flex-shrink: 0;
    gap: 6px;

    .btn {
        align-items: center;
        display: inline-flex;
        gap: 5px;
    }
}

.channel-editor {
    border: 1px solid var(--ct-292e35);
    border-radius: 6px;
    padding: 14px;
}

@media (max-width: 576px) {
    .channel-actions .label {
        display: none;
    }
}
</style>
