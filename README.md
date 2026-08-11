# www.roulettewheelbonus.com

Standalone Arabic bonus-wheel landing page for 29Bet. One page, no framework,
no build step — static files served by Caddy in a container.

## Deploy (Railway)

Railway auto-detects the `Dockerfile`. Nothing else to configure.

1. New Project → Deploy from GitHub → this repo
2. Add the custom domain **`www.roulettewheelbonus.com`** in Railway → Settings → Networking
3. In Hostinger DNS: `CNAME  www  →  <your>.up.railway.app`

### Why www and not the apex

The apex `roulettewheelbonus.com` hosts a different site and keeps its A
records. DNS forbids a CNAME/ALIAS on a name that already has A records, so
the apex cannot point at Railway. The wheel therefore lives on `www`, and
every canonical / OG / sitemap URL uses `https://www.roulettewheelbonus.com/`.

Do **not** add an apex→www or www→apex redirect here — the apex is somebody
else's site.

`$PORT` is supplied by Railway; the Caddyfile reads it. TLS is terminated at
Railway's edge, which is why `auto_https off` is set.

## What Caddy does

- Serves the static site
- Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, …)
- Markdown content negotiation: `Accept: text/markdown` returns `index.md`
- Long cache for `?v=`-versioned CSS/JS, no-cache for HTML/Markdown
- gzip + zstd compression

The CSP is scoped to exactly what the page loads: Google Fonts and the Meta
Pixel. **Note:** the Pixel needs `frame-src` and `form-action` to include
`https://www.facebook.com` — it falls back to an iframe and a form POST, and
blocking those silently drops conversion events.

## Files

    index.html            the page
    index.md              Markdown twin for AI agents
    assets/               css, js, images, game tiles
    robots.txt            Content Signals, allows all crawlers
    sitemap.xml           single URL
    llms.txt              site map for language models
    site.webmanifest      PWA metadata
    Caddyfile             server config
    Dockerfile            build
    htaccess-apache-only.txt   NOT used by Railway; for Apache/cPanel hosting

## Local test

    docker build -t rwb .
    docker run --rm -p 8080:8080 -e PORT=8080 rwb
    open http://localhost:8080

## The wheel

The prize is chosen first by weighted draw, then the wheel is animated to stop
on a pocket showing that amount — what the player sees is always what pays out.
Each win issues a unique code (`Bonus-XXXXX-YYYYYY`); the base identifies the
bonus tier, the suffix makes it one-of-a-kind. Prize weights and the WhatsApp
number are at the top of `assets/js/app.js`.

One spin per device, enforced in localStorage. This is a friction layer, not a
guarantee — a different browser or device gets another spin. Note `DEV_TOKEN`
in `app.js` is plaintext and bypasses the lock.
