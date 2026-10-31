# Security Policy

## Reporting a vulnerability

Please report security issues privately through GitHub: open the [Security tab](https://github.com/krevoit/dockge/security) and choose **Report a vulnerability**.

Don't open a public issue or discuss the problem in public before it's fixed. Include the version or image digest you tested, the steps to reproduce, and what an attacker could do with it.

Reports through third-party bug bounty platforms aren't accepted.

## Supported versions

Only the current `latest` image (built from the `next-dev` branch) receives fixes.

## Scope

Anyone who can sign in to Dockge controls Docker on the host, which is effectively root. Reports about what a signed-in user can do are only in scope where they cross a boundary Dockge is meant to enforce, for example:

- reaching anything without signing in, or bypassing single sign-on, `DISABLE_PASSWORD_LOGIN`, the login rate limit or the CAPTCHA;
- leaving the stacks folder or a stack's folder through the API (path traversal, symlinks);
- injecting commands or options into the `docker` and `docker compose` commands Dockge runs;
- one browser session reading another session's downloads, or tokens leaking through URLs or logs.
