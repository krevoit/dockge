<template>
    <div :class="classes">
        <div v-if="! $root.socketIO.connected && ! $root.socketIO.firstConnect" class="lost-connection">
            <div class="container-fluid">
                {{ $root.socketIO.connectionErrorMsg }}
                <div v-if="$root.socketIO.showReverseProxyGuide">
                    {{ $t("reverseProxyMsg1") }} <a href="https://github.com/louislam/uptime-kuma/wiki/Reverse-Proxy" target="_blank">{{ $t("reverseProxyMsg2") }}</a>
                </div>
            </div>
        </div>

        <!-- Desktop header -->
        <header v-if="! $root.isMobile || $root.loggedIn" class="app-rail">
            <router-link to="/" class="app-brand">
                <object class="brand-mark" width="40" height="40" data="/icon.svg" />
                <span class="fs-4 title">Dockge</span>
            </router-link>

            <label v-if="$root.loggedIn" class="header-agent-select">
                <span class="agent-online-dot"></span>
                <select v-model="headerAgent" aria-label="Agent" @change="selectHeaderAgent">
                    <option value="">{{ $t("currentEndpoint") }}</option>
                    <option v-for="agent in headerAgentOptions" :key="agent.endpoint" :value="agent.endpoint">
                        {{ agent.label }}
                    </option>
                </select>
            </label>

            <form v-if="$root.loggedIn" class="global-search" @submit.prevent="openGlobalSearchResult">
                <font-awesome-icon icon="search" />
                <input v-model="globalSearch" type="search" :placeholder="$t('searchStacks')" aria-label="Search stacks" />
                <kbd>⌘K</kbd>
            </form>

            <a v-if="hasNewVersion" target="_blank" href="https://github.com/krevoit/dockge/releases" class="btn btn-warning me-3">
                <font-awesome-icon icon="arrow-alt-circle-up" /> {{ $t("newUpdate") }}
            </a>

            <ul class="nav nav-pills rail-nav">
                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/" class="nav-link">
                        <font-awesome-icon icon="home" /> {{ $t("home") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn && $root.isMobile" class="nav-item me-2">
                    <router-link to="/stacks" class="nav-link">
                        <font-awesome-icon icon="list" /> {{ $t("Stacks") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/console" class="nav-link">
                        <font-awesome-icon icon="terminal" /> {{ $t("console") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/resources" class="nav-link">
                        <font-awesome-icon icon="warehouse" /> {{ $t("resources") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item">
                    <div class="dropdown dropdown-profile-pic">
                        <div class="nav-link" data-bs-toggle="dropdown">
                            <div class="profile-pic">{{ $root.usernameFirstChar }}</div>
                            <font-awesome-icon icon="angle-down" />
                        </div>

                        <!-- Header's Dropdown Menu -->
                        <ul class="dropdown-menu">
                            <!-- Username -->
                            <li>
                                <i18n-t v-if="$root.username != null" tag="span" keypath="signedInDisp" class="dropdown-item-text">
                                    <strong>{{ $root.username }}</strong>
                                </i18n-t>
                                <span v-if="$root.username == null" class="dropdown-item-text">{{ $t("signedInDispDisabled") }}</span>
                            </li>

                            <li><hr class="dropdown-divider"></li>

                            <!-- Functions -->

                            <!--<li>
                                <router-link to="/registry" class="dropdown-item" :class="{ active: $route.path.includes('settings') }">
                                    <font-awesome-icon icon="warehouse" /> {{ $t("registry") }}
                                </router-link>
                            </li>-->

                            <li>
                                <button class="dropdown-item" @click="scanFolder">
                                    <font-awesome-icon icon="arrows-rotate" /> {{ $t("scanFolder") }}
                                </button>
                            </li>

                            <li>
                                <router-link to="/settings/general" class="dropdown-item" :class="{ active: $route.path.includes('settings') }">
                                    <font-awesome-icon icon="cog" /> {{ $t("Settings") }}
                                </router-link>
                            </li>

                            <li>
                                <button class="dropdown-item" @click="$root.logout">
                                    <font-awesome-icon icon="sign-out-alt" />
                                    {{ $t("Logout") }}
                                </button>
                            </li>
                        </ul>
                    </div>
                </li>
            </ul>
        </header>

        <main class="app-stage">
            <div v-if="$root.socketIO.connecting" class="container mt-5">
                <h4>{{ $t("connecting...") }}</h4>
            </div>

            <router-view v-if="$root.loggedIn" />
            <Login v-if="! $root.loggedIn && $root.allowLoginDialog" />
        </main>
    </div>
</template>

<script>
import Login from "../components/Login.vue";
import { compareVersions } from "compare-versions";
import { ALL_ENDPOINTS } from "../../../common/util-common";

export default {

    components: {
        Login,
    },

    data() {
        return {
            globalSearch: "",
            headerAgent: "",
        };
    },

    computed: {

        // Theme or Mobile
        classes() {
            const classes = {};
            classes[this.$root.theme] = true;
            classes["mobile"] = this.$root.isMobile;
            return classes;
        },

        hasNewVersion() {
            if (this.$root.info.latestVersion && this.$root.info.version) {
                return compareVersions(this.$root.info.latestVersion, this.$root.info.version) >= 1;
            } else {
                return false;
            }
        },

        headerAgentOptions() {
            return Object.entries(this.$root.agentList)
                .filter(([ endpoint ]) => endpoint !== "")
                .map(([ endpoint, agent ]) => ({
                    endpoint,
                    label: agent.name || agent.url || endpoint,
                }));
        },

    },

    watch: {

    },

    mounted() {

    },

    beforeUnmount() {

    },

    methods: {
        openGlobalSearchResult() {
            const query = this.globalSearch.trim().toLowerCase();
            if (!query) {
                return;
            }
            const stack = Object.values(this.$root.completeStackList)
                .find(item => item.name.toLowerCase().includes(query));
            if (stack) {
                this.$router.push(stack.endpoint ? `/compose/${stack.name}/${stack.endpoint}` : `/compose/${stack.name}`);
                this.globalSearch = "";
            }
        },
        selectHeaderAgent() {
            const stack = Object.values(this.$root.completeStackList)
                .find(item => (item.endpoint || "") === this.headerAgent);
            if (stack) {
                this.$router.push(stack.endpoint ? `/compose/${stack.name}/${stack.endpoint}` : `/compose/${stack.name}`);
            }
        },
        scanFolder() {
            this.$root.emitAgent(ALL_ENDPOINTS, "requestStackList", (res) => {
                this.$root.toastRes(res);
            });
        },
    },

};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.app-rail {
    align-items: center;
    background: #111317;
    border-bottom: 1px solid #2b2f36;
    display: flex;
    flex-direction: row;
    gap: 14px;
    height: 62px;
    left: 0;
    padding: 0 18px;
    position: fixed;
    top: 0;
    width: 100%;
    z-index: 1020;
}

.app-brand {
    align-items: center;
    color: #f0f2f5;
    display: flex;
    flex-direction: row;
    margin: 0;
    text-decoration: none;
}

.brand-mark {
    display: block;
    height: 28px;
    margin-right: 9px;
    pointer-events: none;
    width: 28px;
}

.title {
    color: #f0f2f5;
    font-size: 19px !important;
    font-weight: 600;
    letter-spacing: -0.018em;
}

.fork-label {
    color: #7a8089;
    font-size: 9px;
    margin-top: 1px;
}

.rail-nav {
    display: flex;
    flex: 0 0 auto;
    flex-direction: row;
    gap: 3px;
    margin: 0;
    width: auto;

    .nav-item { margin: 0 !important; }

    .nav-item:not(:last-child) { display: none; }

    .nav-link {
        align-items: center;
        border: 0;
        border-radius: 0;
        color: #6e747c;
        display: flex;
        flex-direction: row;
        font-size: 11px;
        gap: 6px;
        justify-content: center;
        margin: 0;
        min-height: 38px;
        padding: 5px 8px;
        width: auto;

        svg { font-size: 19px; }

        &:hover {
            background: #e9ebee;
            color: #1c1f23;
        }

        &.router-link-exact-active,
        &.active {
            background: rgba($primary, 0.12);
            border-color: transparent;
            border-radius: 7px;
            color: $primary;
        }
    }

    .dropdown-profile-pic {
        margin-top: auto;
    }
}

.app-stage {
    margin-left: 0;
    min-height: 100vh;
    padding-top: 62px;
}

.lost-connection {
    padding: 5px;
    background-color: crimson;
    color: white;
    position: fixed;
    width: 100%;
    left: 0;
    z-index: 99999;
}

.header-agent-select {
    align-items: center;
    background: #17191d;
    border: 1px solid #30343c;
    border-radius: 6px;
    display: flex;
    height: 36px;
    padding: 0 9px;

    select {
        appearance: auto;
        background: transparent;
        border: 0;
        color: #d9dde3;
        font-size: 13px;
        min-width: 112px;
        outline: 0;
        padding: 0 18px 0 7px;
    }
}

.agent-online-dot {
    background: #65c58f;
    border-radius: 50%;
    height: 7px;
    width: 7px;
}

.global-search {
    align-items: center;
    background: #0d0f12;
    border: 1px solid #2b2f36;
    border-radius: 6px;
    color: #7f8792;
    display: flex;
    height: 36px;
    margin: 0 auto;
    max-width: 500px;
    padding: 0 10px;
    width: min(42vw, 500px);

    input {
        background: transparent;
        border: 0;
        color: #e1e4e8;
        flex: 1;
        font-size: 13px;
        outline: 0;
        padding: 0 9px;
    }

    kbd {
        background: #22262c;
        color: #929aa5;
        font-size: 10px;
    }
}

// Profile Pic Button with Dropdown
.dropdown-profile-pic {
    user-select: none;

    .nav-link {
        cursor: pointer;
        display: flex;
        gap: 6px;
        align-items: center;
        background: transparent;
        border-left: 0;
        padding: 8px;

        &:hover {
            background-color: #e9ebee;
        }
    }

    .dropdown-menu {
        transition: all 0.2s;
        padding-left: 0;
        padding-bottom: 0;
        bottom: auto !important;
        left: auto !important;
        margin: 8px 0 0 !important;
        min-width: 230px;
        position: absolute !important;
        right: 0 !important;
        top: 100% !important;
        transform: none !important;
        border-radius: 7px;
        overflow: hidden;

        .dropdown-divider {
            margin: 0;
            border-top: 1px solid rgba(0, 0, 0, 0.4);
            background-color: transparent;
        }

        .dropdown-item-text {
            font-size: 14px;
            padding-bottom: 0.7rem;
        }

        .dropdown-item {
            padding: 0.7rem 1rem;
        }

        .dark & {
            background-color: $dark-bg;
            color: $dark-font-color;
            border-color: $dark-border-color;

            .dropdown-item {
                color: $dark-font-color;

                &.active {
                    color: $dark-font-color2;
                    background-color: $highlight !important;
                }

                &:hover {
                    background-color: $dark-bg2;
                }
            }
        }
    }

    .profile-pic {
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        background-color: #313743;
        width: 30px;
        height: 30px;
        margin-right: 5px;
        border-radius: 50rem;
        font-weight: 600;
        font-size: 12px;
    }
}

.dark {
    .app-rail {
        background-color: $dark-header-bg;
        border-bottom-color: $dark-border-color;
    }

    .app-brand .title { color: #f0f2f5; }
    .fork-label { color: $dark-font-color3 !important; }

    .rail-nav .nav-link {
        color: #8b9098;

        &:hover { background: #1c1f22; color: #f1f2f3; }

        &.router-link-exact-active,
        &.active {
            background: rgba($primary, 0.09);
            color: $primary;
        }
    }

    .dropdown-profile-pic .nav-link:hover { background: #1c1f22; }
}

@media (max-width: 767px) {
    .app-rail {
        border-bottom: 1px solid #d9dce1;
        border-right: 0;
        flex-direction: row;
        height: 60px;
        padding: 0 8px;
        width: 100%;
    }

    .app-brand {
        flex-direction: row;
        margin: 0 auto 0 0;

        .brand-mark { height: 30px; margin: 0 7px 0 0; width: 30px; }
        .fork-label { display: none; }
    }

    .header-agent-select,
    .global-search { display: none; }

    .rail-nav {
        flex: 0 1 auto;
        flex-direction: row;

        .nav-item:not(:last-child) { display: block; }

        .nav-link {
            border-bottom: 2px solid transparent;
            border-left: 0;
            font-size: 0;
            min-height: 60px;
            min-width: 48px;

            &.router-link-exact-active,
            &.active { border-bottom-color: $primary; }
        }
    }

    .dropdown-profile-pic { display: none; }

    .app-stage { margin-left: 0; padding-top: 60px; }

    .lost-connection { left: 0; width: 100%; }

    .dark .app-rail {
        border-bottom-color: $dark-border-color;
    }
}
</style>
