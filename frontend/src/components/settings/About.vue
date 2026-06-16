<template>
    <div class="d-flex justify-content-center align-items-center">
        <div class="logo d-flex flex-column justify-content-center align-items-center">
            <object class="my-4" width="200" height="200" data="/icon.svg" />
            <div class="fs-4 fw-bold">Dockge</div>
            <div>{{ $t("Version") }}: {{ $root.info.version }}</div>
            <div class="frontend-version">{{ $t("Frontend Version") }}: {{ $root.frontendVersion }}</div>

            <div v-if="!$root.isFrontendBackendVersionMatched" class="alert alert-warning mt-4" role="alert">
                ⚠️ {{ $t("Frontend Version do not match backend version!") }}
            </div>

            <div class="my-3 update-link">
                <a href="https://github.com/krevoit/dockge" target="_blank" rel="noopener">github.com/krevoit/dockge</a>
            </div>

            <div class="docker-update-checks">
                <h5>{{ $t("Docker Image Update Checks") }}</h5>

                <div v-for="item in dockerImageChecks" :key="item.tag" class="docker-update-check">
                    <button class="btn btn-normal btn-sm" :disabled="item.loading" @click="checkDockerImageUpdate(item.tag)">
                        <font-awesome-icon icon="arrows-rotate" class="me-1" />
                        {{ $t("Check for updates to", [ item.image ]) }}
                    </button>
                    <div v-if="item.result" class="docker-update-result" :class="item.resultClass">
                        {{ item.result }}
                    </div>
                </div>
            </div>

            <div class="mt-1">
                <div class="form-check">
                    <label><input v-model="settings.checkUpdate" type="checkbox" @change="saveSettings()" /> {{ $t("Show update if available") }}</label>
                </div>

                <div class="form-check">
                    <label><input v-model="settings.checkBeta" type="checkbox" :disabled="!settings.checkUpdate" @change="saveSettings()" /> {{ $t("Also check beta release") }}</label>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            imageChecks: {
                latest: {
                    loading: false,
                    result: "",
                    resultClass: "",
                },
                dev: {
                    loading: false,
                    result: "",
                    resultClass: "",
                },
            },
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
        dockerImageChecks() {
            return [ "latest", "dev" ].map(tag => ({
                tag,
                image: `krevoit/dockge:${tag}`,
                loading: this.imageChecks[tag].loading,
                result: this.imageChecks[tag].result,
                resultClass: this.imageChecks[tag].resultClass,
            }));
        },
    },

    watch: {

    },

    methods: {
        checkDockerImageUpdate(tag) {
            const check = this.imageChecks[tag];
            check.loading = true;
            check.result = "";
            check.resultClass = "";

            this.$root.getSocket().emit("checkDockerImageUpdate", tag, (res) => {
                check.loading = false;

                if (!res.ok) {
                    check.result = res.msg;
                    check.resultClass = "text-danger";
                    return;
                }

                if (res.upToDate === true) {
                    check.result = this.$t("Docker image is up to date");
                    check.resultClass = "text-success";
                } else if (res.upToDate === false) {
                    check.result = this.$t("Docker image update available");
                    check.resultClass = "text-warning";
                } else {
                    check.result = this.$t("Local Docker image was not found");
                    check.resultClass = "text-muted";
                }
            });
        },
    }
};
</script>

<style lang="scss" scoped>
.logo {
    margin: 4em 1em;
}

.update-link {
    font-size: 0.8em;
}

.docker-update-checks {
    margin: 1rem 0;
    width: min(420px, 100%);
}

.docker-update-check {
    margin-top: 0.6rem;
}

.docker-update-result {
    font-size: 0.8em;
    margin-top: 0.25rem;
}

.frontend-version {
    font-size: 0.9em;
    color: #cccccc;

    .dark & {
        color: #333333;
    }
}

</style>
