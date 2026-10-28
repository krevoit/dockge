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
 *   DOCKGE_OIDC_ISSUER_URL         Issuer, e.g. https://auth.example.com/application/o/dockge/ (required)
 *   DOCKGE_OIDC_CLIENT_ID          Client ID (required)
 *   DOCKGE_OIDC_CLIENT_SECRET      Client secret (leave empty for a public client)
 *   DOCKGE_OIDC_REDIRECT_URI       https://dockge.example.com/auth/oidc/callback (default: derived from the request)
 *   DOCKGE_OIDC_PROVIDER_NAME      Shown as "Sign in with <name>" (default: SSO)
 *   DOCKGE_OIDC_SCOPES             Default: openid profile email
 *   DOCKGE_OIDC_ALLOWED_GROUPS     Comma-separated groups that may sign in
 *   DOCKGE_OIDC_ALLOWED_EMAILS     Comma-separated emails or @domains that may sign in
 *   DOCKGE_OIDC_ALLOW_ALL_USERS    true: anyone the provider authenticates may sign in
 *   DOCKGE_OIDC_GROUPS_CLAIM       Default: groups
 *   DOCKGE_OIDC_USERNAME_CLAIM     Default: preferred_username
 *   DOCKGE_OIDC_TOKEN_AUTH_METHOD  client_secret_basic (default) or client_secret_post
 *   DOCKGE_OIDC_ALLOW_HTTP         true: allow a plain http issuer (testing only)
 *   DOCKGE_DISABLE_PASSWORD_LOGIN  true: only single sign-on (ignored unless OIDC is configured correctly)
 *
 * Signing in gives full control over Docker on the host, so one of ALLOWED_GROUPS, ALLOWED_EMAILS or
 * ALLOW_ALL_USERS is required; without it OIDC stays disabled.
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
    allowedGroups: string[];
    allowedEmails: string[];
    allowAllUsers: boolean;
    groupsClaim: string;
    usernameClaim: string;
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

function envList(name : string) : string[] {
    return (process.env[name] || "").split(",").map(s => s.trim()).filter(Boolean);
}

function envTrue(name : string) : boolean {
    return [ "true", "1", "yes" ].includes((process.env[name] || "").trim().toLowerCase());
}

export class OidcManager {
    readonly settings? : OidcSettings;
    protected readonly passwordLoginDisabledByEnv = envTrue("DOCKGE_DISABLE_PASSWORD_LOGIN");
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
                log.warn("auth", "DOCKGE_DISABLE_PASSWORD_LOGIN is ignored because OIDC is not configured correctly");
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
        const issuerUrl = (process.env.DOCKGE_OIDC_ISSUER_URL || "").trim();
        const clientId = (process.env.DOCKGE_OIDC_CLIENT_ID || "").trim();
        if (!issuerUrl && !clientId) {
            return undefined;
        }

        const fail = (message : string) => {
            log.error("auth", `OIDC is disabled: ${message}`);
            return undefined;
        };

        if (!issuerUrl || !clientId) {
            return fail("DOCKGE_OIDC_ISSUER_URL and DOCKGE_OIDC_CLIENT_ID are both required");
        }

        let issuer : URL;
        try {
            issuer = new URL(issuerUrl);
        } catch {
            return fail("DOCKGE_OIDC_ISSUER_URL is not a valid URL");
        }
        const allowHttp = envTrue("DOCKGE_OIDC_ALLOW_HTTP");
        if (issuer.protocol !== "https:" && !(issuer.protocol === "http:" && allowHttp)) {
            return fail("DOCKGE_OIDC_ISSUER_URL must use https (set DOCKGE_OIDC_ALLOW_HTTP=true only for testing)");
        }

        const redirectUri = (process.env.DOCKGE_OIDC_REDIRECT_URI || "").trim();
        if (redirectUri) {
            try {
                const url = new URL(redirectUri);
                if (url.protocol !== "https:" && url.protocol !== "http:") {
                    throw new Error();
                }
            } catch {
                return fail("DOCKGE_OIDC_REDIRECT_URI is not a valid URL");
            }
        }

        const allowedGroups = envList("DOCKGE_OIDC_ALLOWED_GROUPS");
        const allowedEmails = envList("DOCKGE_OIDC_ALLOWED_EMAILS").map(e => e.toLowerCase());
        const allowAllUsers = envTrue("DOCKGE_OIDC_ALLOW_ALL_USERS");
        if (!allowAllUsers && allowedGroups.length === 0 && allowedEmails.length === 0) {
            return fail("set DOCKGE_OIDC_ALLOWED_GROUPS or DOCKGE_OIDC_ALLOWED_EMAILS, or DOCKGE_OIDC_ALLOW_ALL_USERS=true if your provider already restricts who can use this client");
        }

        const scopes = new Set((process.env.DOCKGE_OIDC_SCOPES || "openid profile email").split(/[\s,]+/).filter(Boolean));
        scopes.add("openid");

        const tokenAuthMethod = process.env.DOCKGE_OIDC_TOKEN_AUTH_METHOD === "client_secret_post" ? "client_secret_post" : "client_secret_basic";

        log.info("auth", `OIDC single sign-on enabled (issuer ${issuer.href})`);
        if (allowHttp && issuer.protocol === "http:") {
            log.warn("auth", "OIDC issuer uses plain http; only use this for testing");
        }

        return {
            issuerUrl: issuer.href,
            clientId,
            clientSecret: process.env.DOCKGE_OIDC_CLIENT_SECRET || "",
            redirectUri,
            providerName: (process.env.DOCKGE_OIDC_PROVIDER_NAME || "").trim().slice(0, 40) || "SSO",
            scopes: [ ...scopes ].join(" "),
            allowedGroups,
            allowedEmails,
            allowAllUsers,
            groupsClaim: (process.env.DOCKGE_OIDC_GROUPS_CLAIM || "groups").trim(),
            usernameClaim: (process.env.DOCKGE_OIDC_USERNAME_CLAIM || "preferred_username").trim(),
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
            throw new OidcLoginError("login_failed", "Cannot build the redirect URI from the Host header; set DOCKGE_OIDC_REDIRECT_URI");
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
     * Finish a sign-in from the provider's redirect and return the (possibly new) Dockge user
     * @param callbackUrl The callback request URL (only its query string is used)
     * @param cookieState The state from the cookie set by startLogin
     */
    async finishLogin(callbackUrl : URL, cookieState : string | undefined) : Promise<User> {
        const settings = this.requireSettings();
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

        const idClaims = tokens.claims();
        if (!idClaims) {
            throw new OidcLoginError("login_failed", "The provider did not return an ID token");
        }
        let claims : Record<string, unknown> = { ...idClaims };

        // Many providers only put groups and email in the userinfo response
        const needsGroups = settings.allowedGroups.length > 0 && claims[settings.groupsClaim] === undefined;
        const needsEmail = claims.email === undefined;
        if ((needsGroups || needsEmail) && tokens.access_token) {
            try {
                const userInfo = await client.fetchUserInfo(configuration, tokens.access_token, idClaims.sub);
                claims = {
                    ...userInfo,
                    ...claims,
                };
            } catch (e) {
                log.warn("auth", `OIDC userinfo request failed: ${e instanceof Error ? e.message : e}`);
            }
        }

        const identity = this.describe(claims);
        if (!this.isAllowed(claims)) {
            throw new OidcLoginError("access_denied", `${identity} is not in DOCKGE_OIDC_ALLOWED_GROUPS / DOCKGE_OIDC_ALLOWED_EMAILS`);
        }

        return await this.findOrCreateUser(configuration.serverMetadata().issuer, String(idClaims.sub), claims);
    }

    isAllowed(claims : Record<string, unknown>) : boolean {
        const settings = this.requireSettings();
        if (settings.allowAllUsers) {
            return true;
        }

        const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
        if (email && claims.email_verified !== false) {
            const domain = email.slice(email.lastIndexOf("@"));
            if (settings.allowedEmails.includes(email) || settings.allowedEmails.includes(domain)) {
                return true;
            }
        }

        const rawGroups = claims[settings.groupsClaim];
        const groups = Array.isArray(rawGroups) ? rawGroups.map(String) : typeof rawGroups === "string" ? rawGroups.split(/[\s,]+/) : [];
        return groups.some(g => settings.allowedGroups.includes(g));
    }

    protected async findOrCreateUser(issuer : string, subject : string, claims : Record<string, unknown>) : Promise<User> {
        const existing = await R.findOne("user", " oidc_issuer = ? AND oidc_subject = ? ", [ issuer, subject ]) as User | null;
        if (existing) {
            if (!existing.active) {
                throw new OidcLoginError("user_inactive", `User ${existing.username} is deactivated`);
            }
            return existing;
        }

        const settings = this.requireSettings();
        const preferred = [ claims[settings.usernameClaim], claims.preferred_username, claims.email, subject ]
            .find(v => typeof v === "string" && v.trim()) as string;
        const base = preferred.trim().slice(0, 100);

        // Never reuse an existing (e.g. local admin) account just because the name matches
        let username = base;
        for (let i = 2; await R.findOne("user", " username = ? ", [ username ]); i++) {
            if (i > 100) {
                throw new OidcLoginError("login_failed", "Could not pick a unique username");
            }
            username = `${base}-${i}`;
        }

        const user = R.dispense("user") as User;
        user.username = username;
        // Unusable random password: these accounts only sign in with SSO
        user.password = generatePasswordHash(crypto.randomBytes(32).toString("hex"));
        user.oidc_issuer = issuer;
        user.oidc_subject = subject;
        await R.store(user);
        log.info("auth", `Created user ${username} for ${this.describe(claims)}`);
        return user;
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
