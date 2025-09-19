# Hyperledger Caliper base image (latest documented tag)
FROM hyperledger/caliper:0.6.0

# Base image already defines an unprivileged 'caliper' user
USER caliper

WORKDIR /hyperledger/caliper/workspace

# Copy package metadata (keeps build cache warm if npm install is required)
COPY --chown=caliper:caliper package.json package-lock.json ./

# Copy the rest of the workspace; dependencies will be mounted or installed externally
COPY --chown=caliper:caliper . .

# Actual entrypoint/command supplied via docker-compose
