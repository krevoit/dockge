############################################
# Build in Golang
############################################
# Go 1.27 (supported release; 1.22 is EOL)
FROM golang:1.27.3-trixie
WORKDIR /app
ARG TARGETPLATFORM
COPY ./extra/healthcheck.go ./extra/healthcheck.go

# Compile healthcheck.go
RUN go build -x -o ./extra/healthcheck ./extra/healthcheck.go
