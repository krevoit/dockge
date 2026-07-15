<template>
    <div>
        <form class="my-4" autocomplete="off" @submit.prevent="saveGeneral">
            <!-- Client side Timezone -->
            <div v-if="false" class="mb-4">
                <label for="timezone" class="form-label">
                    {{ $t("Display Timezone") }}
                </label>
                <select id="timezone" v-model="$root.userTimezone" class="form-select">
                    <option value="auto">
                        {{ $t("Auto") }}: {{ guessTimezone }}
                    </option>
                    <option
                        v-for="(timezone, index) in timezoneList"
                        :key="index"
                        :value="timezone.value"
                    >
                        {{ timezone.name }}
                    </option>
                </select>
            </div>

            <!-- Server Timezone -->
            <div v-if="false" class="mb-4">
                <label for="timezone" class="form-label">
                    {{ $t("Server Timezone") }}
                </label>
                <select id="timezone" v-model="settings.serverTimezone" class="form-select">
                    <option value="UTC">UTC</option>
                    <option
                        v-for="(timezone, index) in timezoneList"
                        :key="index"
                        :value="timezone.value"
                    >
                        {{ timezone.name }}
                    </option>
                </select>
            </div>

            <!-- Primary Hostname -->
            <div class="mb-4">
                <label class="form-label" for="primaryBaseURL">
                    {{ $t("primaryHostname") }}
                </label>

                <div class="input-group mb-3">
                    <input
                        v-model="settings.primaryHostname"
                        class="form-control"
                        :placeholder="$t(`CurrentHostname`)"
                    />
                    <button class="btn btn-outline-primary" type="button" @click="autoGetPrimaryHostname">
                        {{ $t("autoGet") }}
                    </button>
                </div>

                <div class="form-text"></div>
            </div>

            <!-- Stack Image Update Checks -->
            <div class="mb-4">
                <h5>{{ $t("Stack Image Update Checks") }}</h5>

                <div class="form-check mb-3">
                    <label>
                        <input v-model="settings.stackUpdateCheckEnabled" class="form-check-input" type="checkbox" />
                        {{ $t("Enable scheduled stack image update checks") }}
                    </label>
                </div>

                <div class="row g-3">
                    <div class="col-sm-6 col-lg-4">
                        <label class="form-label" for="stackUpdateCheckIntervalHours">
                            {{ $t("Check interval (hours)") }}
                        </label>
                        <input
                            id="stackUpdateCheckIntervalHours"
                            v-model.number="settings.stackUpdateCheckIntervalHours"
                            class="form-control"
                            type="number"
                            min="1"
                            max="168"
                            step="1"
                            :disabled="!settings.stackUpdateCheckEnabled"
                        />
                    </div>
                </div>

                <div class="mt-3">
                    <button class="btn btn-normal me-2" type="button" :disabled="checkingUpdates" @click="checkStackUpdatesNow">
                        <font-awesome-icon icon="arrows-rotate" class="me-1" />
                        {{ $t("Check updates now") }}
                    </button>
                    <span v-if="checkingUpdates" class="form-text">{{ $t("Checking for updates...") }}</span>
                </div>
            </div>

            <!-- Save Button -->
            <div>
                <button class="btn btn-primary" type="submit">
                    {{ $t("Save") }}
                </button>
            </div>
        </form>
    </div>
</template>

<script>

import dayjs from "dayjs";
import { timezoneList } from "../../util-frontend";

export default {
    components: {

    },

    data() {
        return {
            timezoneList: timezoneList(),
            checkingUpdates: false,
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
        guessTimezone() {
            return dayjs.tz.guess();
        }
    },

    methods: {
        /** Save the settings */
        saveGeneral() {
            localStorage.timezone = this.$root.userTimezone;
            this.saveSettings();
        },
        /** Get the base URL of the application */
        autoGetPrimaryHostname() {
            this.settings.primaryHostname = location.hostname;
        },
        checkStackUpdatesNow() {
            this.checkingUpdates = true;
            this.$root.getSocket().emit("checkStackImageUpdates", (res) => {
                this.checkingUpdates = false;
                this.$root.toastRes(res);
            });
        },
    },
};
</script>
