############################################
# Build in Golang
############################################
# Go 1.27 (supported release; 1.22 is EOL). Runs on the build machine and cross-compiles,
# so multi-arch builds don't compile under emulation.
FROM --platform=$BUILDPLATFORM golang:1.27.3-trixie
WORKDIR /app
ARG TARGETOS
ARG TARGETARCH
COPY ./extra/healthcheck.go ./extra/healthcheck.go

# Compile healthcheck.go
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o ./extra/healthcheck ./extra/healthcheck.go
