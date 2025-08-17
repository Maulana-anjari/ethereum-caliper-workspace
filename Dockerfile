# Use the official Hyperledger Caliper base image
FROM hyperledger/caliper:0.5.0

# Switch to root user to install dependencies
USER root

# Install system dependencies required by the pipeline scripts
# (sudo for keystore copy, jq for JSON parsing, postgresql-client for potential db checks)
RUN apt-get update && apt-get install -y \
    sudo \
    jq \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Set up a non-root user 'caliper' and grant sudo access without a password
# This allows the script's sudo commands to run non-interactively
RUN echo "caliper ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers

# Switch back to the non-root caliper user
USER caliper

# Set the working directory inside the container
WORKDIR /hyperledger/caliper/workspace

# Copy package files and install Node.js dependencies
COPY --chown=caliper:caliper package.json package-lock.json ./
RUN npm install

# Copy the rest of the workspace files
COPY --chown=caliper:caliper . .

# The CMD is specified in the docker-compose file to allow for flexibility

