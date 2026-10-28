<template>
    <div class="form-container">
        <div class="form">
            <form v-if="authOptions" @submit.prevent="submit">
                <h1 class="h3 mb-3 fw-normal" />

                <template v-if="authOptions.oidc && !tokenRequired">
                    <a
                        class="w-100 btn sso-button"
                        :class="authOptions.passwordLogin ? 'btn-outline-primary' : 'btn-primary'"
                        href="/auth/oidc/login"
                        @click="redirecting = true"
                    >
                        <font-awesome-icon :icon="redirecting ? 'spinner' : 'sign-out-alt'" :spin="redirecting" class="me-2" />
                        {{ $t("signInWith", { name: authOptions.oidc.name }) }}
                    </a>
                    <div v-if="authOptions.passwordLogin" class="login-divider my-3">{{ $t("or") }}</div>
                </template>

                <div v-if="!tokenRequired && authOptions.passwordLogin" class="form-floating">
                    <input id="floatingInput" v-model="username" type="text" class="form-control" placeholder="Username" autocomplete="username" required>
                    <label for="floatingInput">{{ $t("Username") }}</label>
                </div>

                <div v-if="!tokenRequired && authOptions.passwordLogin" class="form-floating mt-3">
                    <input id="floatingPassword" v-model="password" type="password" class="form-control" placeholder="Password" autocomplete="current-password" required>
                    <label for="floatingPassword">{{ $t("Password") }}</label>
                </div>

                <div v-if="tokenRequired">
                    <div class="form-floating mt-3">
                        <input id="otp" v-model="token" type="text" maxlength="6" class="form-control" placeholder="123456" autocomplete="one-time-code" required>
                        <label for="otp">{{ $t("Token") }}</label>
                    </div>
                </div>

                <div class="form-check mb-3 mt-3 d-flex justify-content-center pe-4">
                    <div class="form-check">
                        <input id="remember" v-model="$root.remember" type="checkbox" value="remember-me" class="form-check-input">

                        <label class="form-check-label" for="remember">
                            {{ $t("Remember me") }}
                        </label>
                    </div>
                </div>
                <div v-if="siteKey && authOptions.passwordLogin" id="turnstile-widget" ref="turnstile" class="mt-3 mb-3"></div>

                <button v-if="authOptions.passwordLogin" class="w-100 btn btn-primary" type="submit" :disabled="processing">
                    {{ $t("Login") }}
                </button>

                <div v-if="error" class="alert alert-danger mt-3" role="alert">
                    {{ $t(error) }}
                </div>
            </form>
        </div>
    </div>
</template>

<script>
import { consumeHashParam } from "../util-frontend";

export default {
    data() {
        return {
            processing: false,
            username: "",
            password: "",
            token: "",
            res: null,
            tokenRequired: false,
            captchaToken: "",
            siteKey: "",
            authOptions: null,
            redirecting: false,
        };
    },

    computed: {
        error() {
            if (this.res && !this.res.ok) {
                return this.res.msg;
            }
            return this.$root.loginError;
        },
    },

    mounted() {
        const oidcError = consumeHashParam("oidc_error");
        if (oidcError) {
            this.res = {
                ok: false,
                msg: "oidcError_" + oidcError.replace(/[^a-z_]/g, ""),
            };
        }

        // Older servers don't answer; assume password login only
        const fallback = setTimeout(() => {
            this.authOptions ??= {
                passwordLogin: true,
                oidc: null,
            };
        }, 3000);
        this.$root.getSocket().emit("getAuthOptions", (res) => {
            clearTimeout(fallback);
            this.authOptions = res?.ok ? res : {
                passwordLogin: true,
                oidc: null,
            };
        });

        this.getTurnstileSiteKey();
        document.title += " - Login";
    },

    unmounted() {
        document.title = document.title.replace(" - Login", "");
    },

    methods: {
        /**
         * Submit the user details and attempt to log in
         * @returns {void}
         */
        submit() {
            this.processing = true;

            if (this.siteKey && !this.captchaToken) {
                console.error("CAPTCHA token is missing or invalid.");
                this.processing = false;
                this.res = { ok: false,
                    msg: "Invalid CAPTCHA!" };
                this.resetTurnstile(); // Reset the widget
                return;
            }

            this.$root.login(this.username, this.password, this.token, this.captchaToken, (res) => {
                this.processing = false;
                if (res.tokenRequired) {
                    this.tokenRequired = true;
                } else if (!res.ok) {
                    this.res = res;
                    this.resetTurnstile();
                } else {
                    this.res = res;
                }
            });
        },

        resetTurnstile() {
            if (window.turnstile && this.$refs.turnstile) {
                console.log("Resetting Turnstile widget...");
                window.turnstile.reset(this.$refs.turnstile);
                this.captchaToken = ""; // Clear the old token
            }
        },

        getTurnstileSiteKey() {
            this.$root.getTurnstileSiteKey((res) => {
                if (res.ok) {
                    this.siteKey = res.siteKey;
                    if (this.siteKey) {
                        console.log("Turnstile site key is provided. Loading Turnstile script...");
                        const script = document.createElement("script");
                        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
                        script.async = true;
                        script.defer = true;
                        script.onload = () => {
                            console.log("Turnstile script loaded successfully.");
                            this.initializeTurnstile();
                        };
                        script.onerror = () => {
                            console.error("Failed to load Turnstile script.");
                        };
                        document.head.appendChild(script);
                        console.log("Turnstile script loaded...");
                    } else {
                        console.warn("Turnstile site key is not provided. Widget will not be rendered.");
                    }

                } else {
                    console.error("Failed to fetch Turnstile site key from socket:", res.msg);
                }
            });
        },

        /**
         * Initialize the Turnstile widget
         */
        initializeTurnstile() {
            if (window.turnstile) {
                console.log("Initializing Turnstile widget...");
                window.turnstile.render(this.$refs.turnstile, {
                    sitekey: this.siteKey,
                    callback: (token) => {
                        this.captchaToken = token; // Save the token
                    },
                    "error-callback": () => {
                        console.error("Turnstile error occurred");
                        this.captchaToken = null;
                    },
                });
            }
        },

    },
};
</script>

<style lang="scss" scoped>
.form-container {
    display: flex;
    align-items: center;
    padding-top: 40px;
    padding-bottom: 40px;
}

.form-floating {
    > label {
        padding-left: 1.3rem;
    }

    > .form-control {
        padding-left: 1.3rem;

        // The floating label replaces the placeholder (a global placeholder colour made both show)
        &::placeholder {
            color: transparent !important;
        }
    }
}

.sso-button {
    align-items: center;
    display: inline-flex;
    justify-content: center;
}

.login-divider {
    align-items: center;
    color: #8b949e;
    display: flex;
    font-size: 0.85rem;
    gap: 10px;

    &::before,
    &::after {
        border-top: 1px solid currentColor;
        content: "";
        flex: 1;
        opacity: 0.35;
    }
}

.form {
    width: 100%;
    max-width: 330px;
    padding: 15px;
    margin: auto;
    text-align: center;
}
</style>
