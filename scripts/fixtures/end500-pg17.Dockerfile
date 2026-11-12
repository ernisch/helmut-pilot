FROM postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3 AS cron-build
# Nur fuer isolierte Tests mit echtem pg_cron, nicht fuer Production.
# PG17.12-Header erzeugen fuer PG17.6 ein unladbares pg_cron (heap_datum_check).
# Headerpaket deshalb passend zum fest gebundenen Laufzeitimage archiviert/gepinnt.
RUN --mount=type=secret,id=proxy_ca \
    apt_mit_ca() { if [ -f /run/secrets/proxy_ca ]; then apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca "$@"; else apt-get "$@"; fi; }; \
    curl_mit_ca() { if [ -f /run/secrets/proxy_ca ]; then curl --cacert /run/secrets/proxy_ca -fsSL "$@"; else curl -fsSL "$@"; fi; }; \
    apt_mit_ca update && \
    apt_mit_ca install -y --no-install-recommends ca-certificates curl build-essential && \
    arch="$(dpkg --print-architecture)" && \
    case "$arch" in \
      amd64) header_sha=4657d1fb0a900d7ef0185be78d4a7c418deb6819995f6bde6f17ec3feddb25d1 ;; \
      arm64) header_sha=b01d11a00a269bc48757abbd26db1f6f0eca0577998a5bc3b91de7a7c582b026 ;; \
      *) exit 1 ;; \
    esac && \
    curl_mit_ca "https://apt-archive.postgresql.org/pub/repos/apt/pool/main/p/postgresql-17/postgresql-server-dev-17_17.6-2.pgdg12+1_${arch}.deb" -o /tmp/server-dev.deb && \
    echo "$header_sha  /tmp/server-dev.deb" | sha256sum -c - && \
    apt_mit_ca install -y --no-install-recommends /tmp/server-dev.deb && \
    grep -qx '#define PG_VERSION_NUM 170006' /usr/include/postgresql/17/server/pg_config.h && \
    curl_mit_ca https://github.com/citusdata/pg_cron/archive/refs/tags/v1.6.4.tar.gz -o /tmp/pg_cron.tar.gz && \
    echo '52d1850ee7beb85a4cb7185731ef4e5a90d1de216709d8988324b0d02e76af61  /tmp/pg_cron.tar.gz' | sha256sum -c - && \
    tar -xzf /tmp/pg_cron.tar.gz -C /tmp && \
    make -C /tmp/pg_cron-1.6.4 PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config && \
    make -C /tmp/pg_cron-1.6.4 PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config install && \
    rm -rf /tmp/pg_cron* /tmp/server-dev.deb && \
    rm -rf /var/lib/apt/lists/*

# Buildwerkzeuge duerfen den ausfuehrenden Datenbankserver nicht aktualisieren.
FROM postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3
COPY --from=cron-build /usr/lib/postgresql/17/lib/pg_cron.so /usr/lib/postgresql/17/lib/pg_cron.so
COPY --from=cron-build /usr/share/postgresql/17/extension/pg_cron* /usr/share/postgresql/17/extension/
