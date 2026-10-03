FROM gradle:8-jdk17 AS deps
USER root
WORKDIR /server
COPY build.gradle.kts settings.gradle.kts gradle.properties ./
RUN gradle --no-daemon dependencies

FROM deps AS builder
COPY . ./
RUN gradle --no-daemon installDist

FROM eclipse-temurin:17-jre
COPY --from=builder /server/build/install/auto-novel-server /server
ENV LANG=C.UTF-8
EXPOSE 8080
CMD ["/server/bin/auto-novel-server"]
