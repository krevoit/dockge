<template>
    <div>
        <form v-if="settingsLoaded" class="my-4" autocomplete="off" @submit.prevent="saveSettings()">
            <!-- Webhook -->
            <div class="mb-4">
                <h5>{{ $t("Webhook") }}</h5>

                <div class="row g-3">
                    <div class="col-lg-8">
                        <label class="form-label" for="notificationWebhookUrl">{{ $t("Webhook URL") }}</label>
                        <input
                            id="notificationWebhookUrl"
                            v-model.trim="settings.notificationWebhookUrl"
                            class="form-control"
                            type="url"
                            placeholder="https://example.com/webhook"
                            spellcheck="false"
                        />
                    </div>
                    <div class="col-lg-4">
                        <label class="form-label" for="notificationWebhookFormat">{{ $t("Format") }}</label>
                        <select id="notificationWebhookFormat" v-model="settings.notificationWebhookFormat" class="form-select">
                            <option value="json">{{ $t("Generic JSON") }}</option>
                            <option value="discord">Discord</option>
                            <option value="slack">{{ $t("Slack / Mattermost") }}</option>
                        </select>
                    </div>
                </div>

                <div class="form-text">
                    {{ $t("notificationWebhookHelp") }}
                </div>

                <div class="mt-3">
                    <button class="btn btn-normal" type="button" :disabled="testing || !settings.notificationWebhookUrl" @click="sendTest">
                        <font-awesome-icon :icon="testing ? 'spinner' : 'bullhorn'" :spin="testing" class="me-1" />
                        {{ $t("Send test notification") }}
                    </button>
                </div>
            </div>

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
</template>

<script>
export default {
    data() {
        return {
            testing: false,
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
    },

    watch: {
        // Discord and Slack reject the generic JSON body, so pick their format when their URL is pasted
        "settings.notificationWebhookUrl"(url) {
            if (/^https:\/\/(\w+\.)?discord(app)?\.com\/api\/webhooks\//i.test(url || "")) {
                this.settings.notificationWebhookFormat = "discord";
            } else if (/^https:\/\/hooks\.slack\.com\//i.test(url || "")) {
                this.settings.notificationWebhookFormat = "slack";
            }
        },
    },

    methods: {
        sendTest() {
            this.testing = true;
            this.$root.getSocket().emit("sendTestNotification", this.settings.notificationWebhookUrl, this.settings.notificationWebhookFormat, (res) => {
                this.testing = false;
                this.$root.toastRes(res);
            });
        },
    },
};
</script>
