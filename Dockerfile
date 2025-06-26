ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bullseye

ENV NODE_ENV development

WORKDIR /backend

# Copy the rest of the source files into the image.
COPY . .

# Install dependencies.
RUN npm install --include-dev

# Expose the port that the application listens on.
EXPOSE 3333

# Start your dev server
CMD ["npm", "run", "dev"]
