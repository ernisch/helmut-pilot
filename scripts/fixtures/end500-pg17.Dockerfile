FROM postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3 AS cron-build
# Nur fuer isolierte Tests mit echtem pg_cron, nicht fuer Production.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update && \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends curl build-essential postgresql-server-dev-17; \
    else apt-get update && apt-get install -y --no-install-recommends curl build-essential postgresql-server-dev-17; fi && \
    if [ -f /run/secrets/proxy_ca ]; then \
      curl --cacert /run/secrets/proxy_ca -fsSL https://github.com/citusdata/pg_cron/archive/refs/tags/v1.6.4.tar.gz -o /tmp/pg_cron.tar.gz; \
    else curl -fsSL https://github.com/citusdata/pg_cron/archive/refs/tags/v1.6.4.tar.gz -o /tmp/pg_cron.tar.gz; fi && \
    echo '52d1850ee7beb85a4cb7185731ef4e5a90d1de216709d8988324b0d02e76af61  /tmp/pg_cron.tar.gz' | sha256sum -c - && \
    tar -xzf /tmp/pg_cron.tar.gz -C /tmp && \
    make -C /tmp/pg_cron-1.6.4 && make -C /tmp/pg_cron-1.6.4 install && \
    rm -rf /tmp/pg_cron* && \
    rm -rf /var/lib/apt/lists/*

# Buildwerkzeuge duerfen den ausfuehrenden Datenbankserver nicht aktualisieren.
FROM postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3
COPY --from=cron-build /usr/lib/postgresql/17/lib/pg_cron.so /usr/lib/postgresql/17/lib/pg_cron.so
COPY --from=cron-build /usr/share/postgresql/17/extension/pg_cron* /usr/share/postgresql/17/extension/
