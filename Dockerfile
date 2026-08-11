FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY . /srv

# Build files must not be web-served, and a bad config should fail the
# build rather than deploy.
RUN rm -f /srv/Dockerfile /srv/Caddyfile /srv/.dockerignore \
          /srv/README.md /srv/htaccess-apache-only.txt \
 && caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
