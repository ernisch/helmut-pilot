FROM postgres:17.6-bookworm@sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3
# Build context: the actual Node24.19.0 executable and the repository-pinned
# PostgREST12.2.3 executable (archive SHA256 is recorded in .github/workflows/ci.yml).
# No downloads, package installs or credentials inside the resulting image.
COPY --chmod=755 node /usr/local/bin/node
COPY --chmod=755 postgrest /usr/local/bin/postgrest
