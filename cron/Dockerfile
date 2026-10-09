FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node catalyst-source-cron.mjs ./catalyst-source-cron.mjs
RUN test -s ./catalyst-source-cron.mjs
USER node
CMD ["node","catalyst-source-cron.mjs"]
