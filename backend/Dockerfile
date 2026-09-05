# CI/ローカルでビルド・テストを再現可能にするための開発用イメージ。
# 本番実行はLambda(zipデプロイ)であり、このイメージ自体は本番稼働させない
# (常時稼働コンテナはコスト要件と矛盾するため)。
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

CMD ["npm", "test"]
