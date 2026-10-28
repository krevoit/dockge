# Multi-arch image build: docker buildx bake --push release
# The release Dockerfile builds FROM krevoit/dockge:base and krevoit/dockge:build-healthcheck;
# the contexts below point those at the targets in this file instead of a registry.

variable "TAGS" {
    default = "krevoit/dockge:local"
}

variable "PLATFORMS" {
    default = "linux/amd64,linux/arm64"
}

target "_common" {
    platforms = split(",", PLATFORMS)
}

target "base" {
    inherits   = ["_common"]
    dockerfile = "docker/Base.Dockerfile"
}

target "healthcheck" {
    inherits   = ["_common"]
    dockerfile = "docker/BuildHealthCheck.Dockerfile"
}

target "release" {
    inherits   = ["_common"]
    dockerfile = "docker/Dockerfile"
    target     = "release"
    contexts = {
        "krevoit/dockge:base"              = "target:base"
        "krevoit/dockge:build-healthcheck" = "target:healthcheck"
    }
    tags = split(",", TAGS)
}
