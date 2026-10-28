import express, { Express, Request, Response, Router as ExpressRouter } from "express";
import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import { log } from "../log";
import { Settings } from "../settings";
import { loginRateLimiter } from "../rate-limiter";
import { OIDC_STATE_COOKIE, OidcLoginError } from "../oidc";

/**
 * /auth/oidc/login redirects to the identity provider, /auth/oidc/callback finishes the login and
 * sends the browser back to the app with a single-use code in the URL fragment
 */
export class OidcRouter extends Router {
    create(_app : Express, server : DockgeServer) : ExpressRouter {
        const router = express.Router();

        router.get("/auth/oidc/login", async (req, res) => {
            if (!server.oidc.enabled) {
                res.status(404).send("Single sign-on is not configured");
                return;
            }
            try {
                const redirectUri = await server.oidc.getRedirectUri(req);
                const { url, state } = await server.oidc.startLogin(redirectUri);
                res.cookie(OIDC_STATE_COOKIE, state, {
                    httpOnly: true,
                    sameSite: "lax",
                    secure: await server.oidc.isHttps(req),
                    maxAge: 10 * 60 * 1000,
                    path: "/auth/oidc",
                });
                res.setHeader("Cache-Control", "no-store");
                res.redirect(url.href);
            } catch (e) {
                log.error("auth", `OIDC login could not start: ${e instanceof Error ? e.message : e}`);
                this.fail(res, e instanceof OidcLoginError ? e.code : "provider_unavailable");
            }
        });

        router.get("/auth/oidc/callback", async (req, res) => {
            res.clearCookie(OIDC_STATE_COOKIE, { path: "/auth/oidc" });
            res.setHeader("Cache-Control", "no-store");
            const clientIP = await this.clientIP(req);

            if (!server.oidc.enabled) {
                res.status(404).send("Single sign-on is not configured");
                return;
            }
            if (await loginRateLimiter.removeTokens(1) < 0) {
                log.warn("auth", `OIDC callback rate limited. IP=${clientIP}`);
                this.fail(res, "rate_limited");
                return;
            }
            if (typeof req.query.error === "string") {
                log.warn("auth", `OIDC provider returned an error: ${req.query.error} ${req.query.error_description ?? ""} IP=${clientIP}`);
                this.fail(res, "denied");
                return;
            }

            try {
                const callbackUrl = new URL(req.originalUrl, "http://localhost");
                const user = await server.oidc.finishLogin(callbackUrl, this.readCookie(req, OIDC_STATE_COOKIE));
                server.needSetup = false;
                log.info("auth", `Successfully logged in user ${user.username} with single sign-on. IP=${clientIP}`);
                res.redirect(`/#oidc_code=${encodeURIComponent(server.oidc.issueLoginCode(user.id))}`);
            } catch (e) {
                const code = e instanceof OidcLoginError ? e.code : "login_failed";
                log.warn("auth", `OIDC login failed (${code}): ${e instanceof Error ? e.message : e} IP=${clientIP}`);
                this.fail(res, code);
            }
        });

        return router;
    }

    protected fail(res : Response, code : string) {
        res.redirect(`/#oidc_error=${encodeURIComponent(code)}`);
    }

    protected readCookie(req : Request, name : string) : string | undefined {
        for (const part of (req.headers.cookie || "").split(";")) {
            const index = part.indexOf("=");
            if (index > 0 && part.slice(0, index).trim() === name) {
                return decodeURIComponent(part.slice(index + 1).trim());
            }
        }
        return undefined;
    }

    protected async clientIP(req : Request) : Promise<string> {
        if (await Settings.get("trustProxy")) {
            const forwarded = req.headers["x-forwarded-for"];
            if (typeof forwarded === "string" && forwarded) {
                return forwarded.split(",")[0].trim();
            }
        }
        return (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
    }
}
