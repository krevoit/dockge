import crypto from "node:crypto";
import type { Request } from "express";
import * as client from "openid-client";
import { R } from "redbean-node";
import { log } from "./log";
import { Settings } from "./settings";
import { generatePasswordHash } from "./password-hash";
import { User } from "./models/user";

/**
 * Single sign-on with OpenID Connect (authorization code flow with PKCE), configured with environment variables:
 *
 *   OIDC_ISSUER_URL         Issuer, e.g. https://auth.example.com/application/o/dockge/ (required)
 *   OIDC_CLIENT_ID          Client ID (required)
 *   OIDC_CLIENT_SECRET      Client secret (leave empty for a public client)
 *   OIDC_REDIRECT_URI       https://dockge.example.com/auth/oidc/callback (default: derived from the request)
 *   OIDC_PROVIDER_NAME      Shown as "Sign in with <name>" (default: SSO)
 *   OIDC_SCOPES             Default: openid profile email
 *   OIDC_TOKEN_AUTH_METHOD  client_secret_basic (default) or client_secret_post
 *   OIDC_ALLOW_HTTP         true: allow a plain http issuer (testing only)
 *   DISABLE_PASSWORD_LOGIN  true: only single sign-on (ignored unless OIDC is configured correctly)
 *
 * Every successful sign-in logs in as the Dockge user (the account created at setup, whatever its name),
 * so who may sign in is decided by the provider
 * (e.g. which users or groups are assigned to the client).
 */

const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_LOGINS = 500;
const LOGIN_CODE_TTL_MS = 60 * 1000;

export const OIDC_STATE_COOKIE = "dockge_oidc_state";

interface OidcSettings {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    providerName: string;
    scopes: string;
    tokenAuthMethod: "client_secret_basic" | "client_secret_post";
    allowHttp: boolean;
}

interface StartedLogin {
    url: URL;
    state: string;
}

interface LoginCode {
    userId: number;
    createdAt: number;
}

interface PendingLogin {
    codeVerifier: string;
    nonce: string;
    redirectUri: string;
    createdAt: number;
}

/**
 * A sign-in failure with a short code the login page can explain
 */
export class OidcLoginError extends Error {
    constructor(public readonly code : string, message : string) {
        super(message);
    }
}

function envTrue(name : string) : boolean {
    return [ "true", "1", "yes" ].includes((process.env[name] || "").trim().toLowerCase());
}

export class OidcManager {
    readonly settings? : OidcSettings;
    protected readonly passwordLoginDisabledByEnv = envTrue("DISABLE_PASSWORD_LOGIN");
    protected configuration? : client.Configuration;
    protected discovering? : Promise<client.Configuration>;
    protected pending = new Map<string, PendingLogin>();
    protected loginCodes = new Map<string, LoginCode>();

    constructor() {
        this.settings = this.readSettings();

        if (this.passwordLoginDisabledByEnv) {
            if (this.settings) {
                log.info("auth", "Password login is disabled, only single sign-on is allowed");
            } else {
                log.warn("auth", "DISABLE_PASSWORD_LOGIN is ignored because OIDC is not configured correctly");
            }
        }
    }

    get enabled() : boolean {
        return !!this.settings;
    }

    get providerName() : string {
        return this.settings?.providerName || "SSO";
    }

    /**
     * Password login stays on unless OIDC works, so a configuration mistake can't lock everyone out
     */
    get passwordLoginEnabled() : boolean {
        return !(this.passwordLoginDisabledByEnv && this.enabled);
    }

    protected readSettings() : OidcSettings | undefined {
        const issuerUrl = (process.env.OIDC_ISSUER_URL || "").trim();
        const clientId = (process.env.OIDC_CLIENT_ID || "").trim();
        if (!issuerUrl && !clientId) {
            return undefined;
        }

        const fail = (message : string) => {
            log.error("auth", `OIDC is disabled: ${message}`);
            return undefined;
        };

        if (!issuerUrl || !clientId) {
            return fail("OIDC_ISSUER_URL and OIDC_CLIENT_ID are both required");
        }

        let issuer : URL;
        try {
            issuer = new URL(issuerUrl);
        } catch {
            return fail("OIDC_ISSUER_URL is not a valid URL");
        }
        const allowHttp = envTrue("OIDC_ALLOW_HTTP");
        if (issuer.protocol !== "https:" && !(issuer.protocol === "http:" && allowHttp)) {
            return fail("OIDC_ISSUER_URL must use https (set OIDC_ALLOW_HTTP=true only for testing)");
        }

        const redirectUri = (process.env.OIDC_REDIRECT_URI || "").trim();
        if (redirectUri) {
            try {
                const url = new URL(redirectUri);
                if (url.protocol !== "https:" && url.protocol !== "http:") {
                    throw new Error();
                }
            } catch {
                return fail("OIDC_REDIRECT_URI is not a valid URL");
            }
        }

        const scopes = new Set((process.env.OIDC_SCOPES || "openid profile email").split(/[\s,]+/).filter(Boolean));
        scopes.add("openid");

        const tokenAuthMethod = process.env.OIDC_TOKEN_AUTH_METHOD === "client_secret_post" ? "client_secret_post" : "client_secret_basic";

        log.info("auth", `OIDC single sign-on enabled (issuer ${issuer.href})`);
        if (allowHttp && issuer.protocol === "http:") {
            log.warn("auth", "OIDC issuer uses plain http; only use this for testing");
        }

        return {
            issuerUrl: issuer.href,
            clientId,
            clientSecret: process.env.OIDC_CLIENT_SECRET || "",
            redirectUri,
            providerName: (process.env.OIDC_PROVIDER_NAME || "").trim().slice(0, 40) || "SSO",
            scopes: [ ...scopes ].join(" "),
            tokenAuthMethod,
            allowHttp,
        };
    }

    /**
     * Fetch the provider's discovery document (cached; retried on the next login if it failed)
     */
    async getConfiguration() : Promise<client.Configuration> {
        const settings = this.requireSettings();
        if (this.configuration) {
            return this.configuration;
        }
        if (!this.discovering) {
            const clientAuth = !settings.clientSecret
                ? client.None()
                : settings.tokenAuthMethod === "client_secret_post"
                    ? client.ClientSecretPost(settings.clientSecret)
                    : client.ClientSecretBasic(settings.clientSecret);
            this.discovering = client.discovery(
                new URL(settings.issuerUrl),
                settings.clientId,
                undefined,
                clientAuth,
                settings.allowHttp ? { execute: [ client.allowInsecureRequests ] } : undefined
            );
        }
        try {
            this.configuration = await this.discovering;
            return this.configuration;
        } finally {
            this.discovering = undefined;
        }
    }

    /**
     * The callback URL registered at the provider
     */
    async getRedirectUri(req : Request) : Promise<string> {
        const settings = this.requireSettings();
        if (settings.redirectUri) {
            return settings.redirectUri;
        }
        const trustProxy = !!await Settings.get("trustProxy");
        const forwardedHost = trustProxy ? String(req.headers["x-forwarded-host"] || "").split(",")[0].trim() : "";
        const host = forwardedHost || req.headers.host || "";
        if (!/^([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(:\d{1,5})?$/.test(host)) {
            throw new OidcLoginError("login_failed", "Cannot build the redirect URI from the Host header; set OIDC_REDIRECT_URI");
        }
        const protocol = await this.isHttps(req) ? "https" : "http";
        return `${protocol}://${host}/auth/oidc/callback`;
    }

    async isHttps(req : Request) : Promise<boolean> {
        if (req.secure) {
            return true;
        }
        if (await Settings.get("trustProxy")) {
            return String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
        }
        return false;
    }

    /**
     * Start a sign-in: returns the provider URL to redirect to, and the state to bind to the browser
     */
    async startLogin(redirectUri : string) : Promise<StartedLogin> {
        const settings = this.requireSettings();
        const configuration = await this.getConfiguration();

        const codeVerifier = client.randomPKCECodeVerifier();
        const state = client.randomState();
        const nonce = client.randomNonce();
        const url = client.buildAuthorizationUrl(configuration, {
            redirect_uri: redirectUri,
            scope: settings.scopes,
            state,
            nonce,
            code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
            code_challenge_method: "S256",
        });

        this.prune();
        // Unauthenticated users can start logins, so keep the map bounded
        while (this.pending.size >= MAX_PENDING_LOGINS) {
            const oldest = this.pending.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.pending.delete(oldest);
        }
        this.pending.set(state, {
            codeVerifier,
            nonce,
            redirectUri,
            createdAt: Date.now(),
        });

        return {
            url,
            state,
        };
    }

    /**
     * Finish a sign-in from the provider's redirect and return the Dockge user to log in as
     * @param callbackUrl The callback request URL (only its query string is used)
     * @param cookieState The state from the cookie set by startLogin
     */
    async finishLogin(callbackUrl : URL, cookieState : string | undefined) : Promise<User> {
        this.requireSettings();
        const state = callbackUrl.searchParams.get("state") || "";
        const pending = this.pending.get(state);
        this.pending.delete(state);

        // The state must come back to the same browser that started the login (prevents login CSRF)
        if (!state || !cookieState || state.length !== cookieState.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) {
            throw new OidcLoginError("state_mismatch", "State does not match the browser that started the login");
        }
        if (!pending || Date.now() - pending.createdAt > STATE_TTL_MS) {
            throw new OidcLoginError("expired", "Login expired or was already used");
        }

        const configuration = await this.getConfiguration();
        const currentUrl = new URL(pending.redirectUri);
        currentUrl.search = callbackUrl.search;

        const tokens = await client.authorizationCodeGrant(configuration, currentUrl, {
            pkceCodeVerifier: pending.codeVerifier,
            expectedState: state,
            expectedNonce: pending.nonce,
            idTokenExpected: true,
        });

        const claims = tokens.claims();
        if (!claims) {
            throw new OidcLoginError("login_failed", "The provider did not return an ID token");
        }

        const user = await this.getLoginUser(claims);
        log.info("auth", `${this.describe(claims)} signed in as ${user.username}`);
        return user;
    }

    /**
     * The Dockge user every single sign-on logs in as: the first active account, whatever its name.
     * On a fresh install it is created here (named after the SSO identity), since there is no setup
     * page when password login is disabled.
     */
    protected async getLoginUser(claims : Record<string, unknown>) : Promise<User> {
        const user = await R.findOne("user", " active = 1 ORDER BY id ") as User | null;
        if (user) {
            return user;
        }
        if (await R.findOne("user")) {
            throw new OidcLoginError("user_inactive", "The Dockge user is deactivated");
        }

        const name = [ claims.preferred_username, claims.email ].find(v => typeof v === "string" && v.trim()) as string | undefined;
        const created = R.dispense("user") as User;
        created.username = name ? name.trim().slice(0, 100) : "admin";
        // Unusable random password; set one with `npm run reset-password` to use password login
        created.password = generatePasswordHash(crypto.randomBytes(32).toString("hex"));
        await R.store(created);
        log.info("auth", `Created user ${created.username} on the first single sign-on`);
        return created;
    }

    /**
     * A single-use code the browser exchanges for a session token over the socket,
     * so the token itself never appears in a URL
     */
    issueLoginCode(userId : number) : string {
        this.prune();
        const code = crypto.randomBytes(32).toString("base64url");
        this.loginCodes.set(code, {
            userId,
            createdAt: Date.now(),
        });
        return code;
    }

    redeemLoginCode(code : unknown) : number | undefined {
        if (typeof code !== "string") {
            return undefined;
        }
        const entry = this.loginCodes.get(code);
        this.loginCodes.delete(code);
        if (!entry || Date.now() - entry.createdAt > LOGIN_CODE_TTL_MS) {
            return undefined;
        }
        return entry.userId;
    }

    describe(claims : Record<string, unknown>) : string {
        const name = claims.preferred_username || claims.email || claims.sub;
        return `OIDC user ${name}`;
    }

    protected prune() {
        const now = Date.now();
        for (const [ state, entry ] of this.pending) {
            if (now - entry.createdAt > STATE_TTL_MS) {
                this.pending.delete(state);
            }
        }
        for (const [ code, entry ] of this.loginCodes) {
            if (now - entry.createdAt > LOGIN_CODE_TTL_MS) {
                this.loginCodes.delete(code);
            }
        }
    }

    protected requireSettings() : OidcSettings {
        if (!this.settings) {
            throw new OidcLoginError("not_configured", "OIDC is not configured");
        }
        return this.settings;
    }
}
