############################################
# Build in Golang
############################################
# next-dev: was golang:1.21.4-bookworm (EOL, unpatched CVEs).
FROM golang:1.22-bookworm
WORKDIR /app
ARG TARGETPLATFORM
COPY ./extra/healthcheck.go ./extra/healthcheck.go

# Compile healthcheck.go
RUN go build -x -o ./extra/healthcheck ./extra/healthcheck.go
