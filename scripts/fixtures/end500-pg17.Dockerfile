FROM postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3
# Nur fuer isolierte Tests mit echtem pg_cron, nicht fuer Production.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update && \
      apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends postgresql-17-cron; \
    else apt-get update && apt-get install -y --no-install-recommends postgresql-17-cron; fi && \
    rm -rf /var/lib/apt/lists/*
