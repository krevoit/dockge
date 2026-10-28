import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Minimal Docker Registry v2 client used to look up the remote digest of an image.
 * Replaces the skopeo dependency: a HEAD request for the manifest returns the same
 * digest that `skopeo inspect --format '{{ .Digest }}'` printed, and HEAD requests
 * do not count towards Docker Hub pull rate limits.
 */

const MANIFEST_ACCEPT = [
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

const DOCKER_HUB = "docker.io";
const DOCKER_HUB_ALIASES = [ "docker.io", "index.docker.io", "registry-1.docker.io" ];
const DOCKER_HUB_AUTH_KEYS = [ "https://index.docker.io/v1/", "index.docker.io", "docker.io", "registry-1.docker.io" ];

const REGISTRY_PATTERN = /^(localhost|[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+|[A-Za-z0-9-]+:[0-9]+|[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+:[0-9]+)$/;
const REPOSITORY_PATTERN = /^[a-z0-9]+([._-]+[a-z0-9]+)*(\/[a-z0-9]+([._-]+[a-z0-9]+)*)*$/;
const TAG_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const DIGEST_PATTERN = /^[a-z0-9]+([+._-][a-z0-9]+)*:[a-fA-F0-9]{32,}$/;

export interface ImageReference {
    registry: string;
    repository: string;
    tag: string;
    digest?: string;
}

/**
 * Parse an image reference such as `nginx`, `ghcr.io/org/app:1.2` or `repo@sha256:...`
 * using the same defaults as the Docker CLI.
 */
export function parseImageReference(image: string): ImageReference {
    let rest = image.trim();
    let digest: string | undefined;
    let tag = "latest";

    const at = rest.indexOf("@");
    if (at >= 0) {
        digest = rest.slice(at + 1);
        rest = rest.slice(0, at);
    }

    const colon = rest.lastIndexOf(":");
    if (colon > rest.lastIndexOf("/")) {
        tag = rest.slice(colon + 1);
        rest = rest.slice(0, colon);
    }

    let registry = DOCKER_HUB;
    const slash = rest.indexOf("/");
    if (slash > 0) {
        const first = rest.slice(0, slash);
        if (first.includes(".") || first.includes(":") || first === "localhost") {
            registry = DOCKER_HUB_ALIASES.includes(first.toLowerCase()) ? DOCKER_HUB : first;
            rest = rest.slice(slash + 1);
        }
    }

    if (registry === DOCKER_HUB && !rest.includes("/")) {
        rest = "library/" + rest;
    }

    if (!REGISTRY_PATTERN.test(registry) && registry !== DOCKER_HUB) {
        throw new Error(`Invalid registry '${registry}'`);
    }
    if (!REPOSITORY_PATTERN.test(rest)) {
        throw new Error(`Invalid repository '${rest}'`);
    }
    if (!TAG_PATTERN.test(tag)) {
        throw new Error(`Invalid tag '${tag}'`);
    }
    if (digest !== undefined && !DIGEST_PATTERN.test(digest)) {
        throw new Error(`Invalid digest '${digest}'`);
    }

    return {
        registry,
        repository: rest,
        tag,
        digest,
    };
}

/**
 * Get the digest of the manifest (or manifest list) an image reference currently points to.
 */
export async function getRemoteDigest(image: string, timeoutMs = 45 * 1000): Promise<string> {
    const ref = parseImageReference(image);

    // A digest-pinned reference cannot change
    if (ref.digest) {
        return ref.digest;
    }

    const host = ref.registry === DOCKER_HUB ? "registry-1.docker.io" : ref.registry;
    const url = `https://${host}/v2/${ref.repository}/manifests/${encodeURIComponent(ref.tag)}`;
    const signal = AbortSignal.timeout(timeoutMs);
    const headers: Record<string, string> = {
        Accept: MANIFEST_ACCEPT,
    };

    let res = await registryFetch(url, "HEAD", headers, ref, signal);
    let digest = res.ok ? res.headers.get("docker-content-digest") : null;

    // Some registries omit the digest header on HEAD (or reject HEAD), so fall back to GET
    if (!digest && (res.ok || res.status === 405 || res.status === 404)) {
        res = await registryFetch(url, "GET", headers, ref, signal);
        if (res.ok) {
            digest = res.headers.get("docker-content-digest");
            const body = Buffer.from(await res.arrayBuffer());
            if (!digest) {
                digest = "sha256:" + createHash("sha256").update(body).digest("hex");
            }
        }
    }

    if (!res.ok) {
        throw new Error(`Registry ${ref.registry} returned HTTP ${res.status} for ${ref.repository}:${ref.tag}`);
    }
    if (!digest || !DIGEST_PATTERN.test(digest)) {
        throw new Error(`Registry ${ref.registry} returned an invalid digest for ${ref.repository}:${ref.tag}`);
    }
    return digest;
}

/**
 * Fetch from a registry, answering a Bearer or Basic authentication challenge if one is returned.
 */
async function registryFetch(url: string, method: string, headers: Record<string, string>, ref: ImageReference, signal: AbortSignal): Promise<Response> {
    const res = await fetch(url, {
        method,
        headers,
        signal,
    });
    if (res.status !== 401) {
        return res;
    }

    const challenge = res.headers.get("www-authenticate") || "";
    const credentials = await getCredentials(ref.registry);
    let authorization: string | undefined;

    if (/^bearer\s/i.test(challenge)) {
        const params = parseChallenge(challenge);
        if (!params.realm) {
            return res;
        }
        const tokenUrl = new URL(params.realm);
        if (tokenUrl.protocol !== "https:") {
            throw new Error(`Refusing non-HTTPS token endpoint for ${ref.registry}`);
        }
        if (params.service) {
            tokenUrl.searchParams.set("service", params.service);
        }
        tokenUrl.searchParams.set("scope", params.scope || `repository:${ref.repository}:pull`);

        const tokenRes = await fetch(tokenUrl, {
            headers: credentials ? { Authorization: "Basic " + credentials } : {},
            signal,
        });
        if (!tokenRes.ok) {
            throw new Error(`Registry ${ref.registry} token request failed with HTTP ${tokenRes.status}`);
        }
        const body = await tokenRes.json() as TokenResponse;
        const token = typeof body.token === "string" ? body.token : body.access_token;
        if (typeof token !== "string" || !token) {
            throw new Error(`Registry ${ref.registry} did not return a token`);
        }
        authorization = "Bearer " + token;
    } else if (/^basic\s/i.test(challenge) && credentials) {
        authorization = "Basic " + credentials;
    }

    if (!authorization) {
        return res;
    }

    return fetch(url, {
        method,
        headers: {
            ...headers,
            Authorization: authorization,
        },
        signal,
    });
}

function parseChallenge(challenge: string): Record<string, string> {
    const params: Record<string, string> = {};
    for (const match of challenge.matchAll(/([A-Za-z]+)="([^"]*)"/g)) {
        params[match[1].toLowerCase()] = match[2];
    }
    return params;
}

interface TokenResponse {
    token?: unknown;
    access_token?: unknown;
}

interface DockerAuthEntry {
    auth?: string;
    username?: string;
    password?: string;
}

interface DockerConfig {
    auths?: Record<string, DockerAuthEntry>;
    credsStore?: string;
    credHelpers?: Record<string, string>;
}

function readDockerConfig(): DockerConfig {
    const dir = process.env.DOCKER_CONFIG || path.join(os.homedir(), ".docker");
    try {
        const config = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf-8"));
        return config && typeof config === "object" ? config : {};
    } catch {
        return {};
    }
}

/**
 * Look up credentials for a registry the same way the Docker CLI does: credential helpers first,
 * then the `auths` section of ~/.docker/config.json. Returns base64 "user:password" or undefined.
 */
async function getCredentials(registry: string): Promise<string | undefined> {
    const config = readDockerConfig();
    const keys = registry === DOCKER_HUB
        ? DOCKER_HUB_AUTH_KEYS
        : [ registry, `https://${registry}`, `https://${registry}/v1/`, `https://${registry}/v2/` ];

    const helper = keys.map(key => config.credHelpers?.[key]).find(Boolean) || config.credsStore;
    if (helper && /^[A-Za-z0-9_.-]+$/.test(helper)) {
        const fromHelper = await runCredentialHelper(helper, keys[0]);
        if (fromHelper) {
            return fromHelper;
        }
    }

    for (const key of keys) {
        const entry = config.auths?.[key];
        if (entry?.auth) {
            return entry.auth;
        }
        if (entry?.username && entry?.password) {
            return Buffer.from(`${entry.username}:${entry.password}`).toString("base64");
        }
    }
    return undefined;
}

function runCredentialHelper(helper: string, serverUrl: string): Promise<string | undefined> {
    return new Promise((resolve) => {
        const child = spawn(`docker-credential-${helper}`, [ "get" ], {
            stdio: [ "pipe", "pipe", "ignore" ],
            timeout: 10 * 1000,
        });
        let stdout = "";
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.on("error", () => resolve(undefined));
        child.on("close", (code) => {
            if (code !== 0) {
                resolve(undefined);
                return;
            }
            try {
                const { Username, Secret } = JSON.parse(stdout);
                // "<token>" means an identity token, which needs an OAuth exchange we don't support
                if (typeof Username === "string" && typeof Secret === "string" && Username !== "<token>") {
                    resolve(Buffer.from(`${Username}:${Secret}`).toString("base64"));
                    return;
                }
            } catch {
                // Fall through to undefined
            }
            resolve(undefined);
        });
        child.stdin.end(serverUrl);
    });
}
