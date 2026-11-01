FROM postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3
# The same ephemeral W15 test image, with the actual matching dependency.
# Public PGDG Debian12/amd64 package: fixed version, size and full SHA256.
# dpkg does not resolve/download/upgrade dependencies or PostgreSQL.
COPY --chmod=755 node /usr/local/bin/node
COPY --chmod=755 postgrest /usr/local/bin/postgrest
COPY pgvector.deb /tmp/helmut-pgvector.deb
RUN echo "acb5569b6a5bb71d5968205a4da15911ff3b2a15a57a2a9d765560882f53e3ea  /tmp/helmut-pgvector.deb" | sha256sum -c - \
 && test "$(stat -c %s /tmp/helmut-pgvector.deb)" = 273396 \
 && dpkg -i /tmp/helmut-pgvector.deb \
 && test "$(dpkg-query -W -f='${Version}' postgresql-17-pgvector)" = '0.8.7-1.pgdg12+1' \
 && test "$(postgres --version | cut -d ' ' -f 3)" = '17.6' \
 && rm /tmp/helmut-pgvector.deb
