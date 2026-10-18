FROM node:20-slim
# o Baileys baixa uma dependência direto do GitHub, por isso o git
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV PORT=3001
EXPOSE 3001
# a sessão do WhatsApp fica em /app/auth (monte um volume aqui)
CMD ["node","server.js"]
