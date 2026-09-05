# FridgeNote — 開発・デプロイ用ショートカット集
#
# Terraform/AWS CLIはこのマシンにネイティブインストールしていない前提で、
# すべてDocker経由(hashicorp/terraform, amazon/aws-cli)で実行する。
# `~/.aws` を読み取り専用でマウントするので、実際の認証情報はここには出てこない。
#
# 使い方: `make help`

SHELL := /bin/bash
.PHONY: help \
	backend-install backend-build backend-test backend-package backend-ci \
	infra-fmt infra-init infra-validate infra-plan infra-apply infra-output infra-clean \
	mobile-install mobile-typecheck mobile-start eas-init eas-build-ios eas-build-list \
	check-consistency \
	health deploy-plan deploy-apply clean

PROJECT_ROOT   := $(CURDIR)
TF_IMAGE       := hashicorp/terraform:1.9.0
AWS_CLI_IMAGE  := amazon/aws-cli
ALERT_EMAIL    ?= soramiyazaki2000@gmail.com
GH_REPO        := MiyazakiSora1234/FridgeNote

# git-bash(MSYS)がDocker引数中のUnix風パス(/workspace等)を勝手に
# Windowsパスへ変換してしまう問題を避けるため、Docker呼び出しはすべて
# MSYS_NO_PATHCONV=1 を付ける。
DOCKER := MSYS_NO_PATHCONV=1 docker

help:
	@echo "FridgeNote tasks"
	@echo ""
	@echo "  backend-install   install backend deps"
	@echo "  backend-build     tsc build"
	@echo "  backend-test      unit + integration tests (vitest)"
	@echo "  backend-package   bundle for Lambda via esbuild (dist/api.js, dist/analyzerWorker.js)"
	@echo "  backend-ci        install + build + test"
	@echo ""
	@echo "  infra-fmt         terraform fmt"
	@echo "  infra-init        terraform init (S3 backend)"
	@echo "  infra-validate    terraform validate"
	@echo "  infra-plan        terraform plan (runs backend-package first)"
	@echo "  infra-apply       terraform apply (runs backend-package first; review plan first!)"
	@echo "  infra-output      terraform output"
	@echo "  infra-clean       remove .terraform/ etc."
	@echo ""
	@echo "  mobile-install    install mobile deps"
	@echo "  mobile-typecheck  tsc --noEmit"
	@echo "  mobile-start      start Expo dev server (for Expo Go)"
	@echo "  eas-init          create/link the EAS project"
	@echo "  eas-build-ios     iOS EAS build (preview / internal distribution)"
	@echo "  eas-build-list    list recent EAS builds"
	@echo ""
	@echo "  check-consistency verify backend/mobile shared constants haven't drifted"
	@echo ""
	@echo "  health            curl the deployed API's /v1/health"
	@echo "  deploy-plan       trigger deploy.yml workflow_dispatch, plan only"
	@echo "  deploy-apply      trigger deploy.yml workflow_dispatch, with apply"
	@echo ""
	@echo "  clean             remove backend/mobile build artifacts"
	@echo ""
	@echo "Note: comments in this Makefile are in Japanese (UTF-8); this help text is"
	@echo "kept ASCII-only to avoid mojibake on Windows consoles using codepage 932."

# ---- backend --------------------------------------------------------------

backend-install:
	cd backend && npm install

backend-build:
	cd backend && npm run build

backend-test:
	cd backend && npm test

backend-package: backend-build
	cd backend && npm run package:api && npm run package:worker

backend-ci: backend-install backend-build backend-test

# ---- infra (Terraform via Docker) -----------------------------------------

infra-fmt:
	$(DOCKER) run --rm -v "$(PROJECT_ROOT)/infra:/workspace" -w /workspace $(TF_IMAGE) fmt -recursive

infra-init:
	$(DOCKER) run --rm \
		-v "$(PROJECT_ROOT):/workspace" \
		-v ~/.aws:/root/.aws:ro \
		-w /workspace/infra \
		$(TF_IMAGE) init

infra-validate:
	$(DOCKER) run --rm -v "$(PROJECT_ROOT)/infra:/workspace" -w /workspace $(TF_IMAGE) validate

infra-plan: backend-package
	$(DOCKER) run --rm \
		-v "$(PROJECT_ROOT):/workspace" \
		-v ~/.aws:/root/.aws:ro \
		-w /workspace/infra \
		$(TF_IMAGE) plan -var="alert_email=$(ALERT_EMAIL)"

# 破壊的・課金対象の操作なので、実行前に必ず infra-plan の内容を自分の目で確認すること。
infra-apply: backend-package
	$(DOCKER) run --rm \
		-v "$(PROJECT_ROOT):/workspace" \
		-v ~/.aws:/root/.aws:ro \
		-w /workspace/infra \
		$(TF_IMAGE) apply -var="alert_email=$(ALERT_EMAIL)"

infra-output:
	$(DOCKER) run --rm \
		-v "$(PROJECT_ROOT):/workspace" \
		-v ~/.aws:/root/.aws:ro \
		-w /workspace/infra \
		$(TF_IMAGE) output

infra-clean:
	rm -rf infra/.terraform infra/build infra/tfplan*

# ---- mobile -----------------------------------------------------------------

mobile-install:
	cd mobile && npm install

mobile-typecheck:
	cd mobile && npm run typecheck

mobile-start:
	cd mobile && npx expo start

eas-init:
	cd mobile && npx eas-cli init --non-interactive

# 初回は配布用証明書が無いため `cd mobile && npx eas-cli build --platform ios --profile preview`
# を対話モードで一度実行してApple IDでのログインを済ませておくこと(README参照)。
eas-build-ios:
	cd mobile && npx eas-cli build --platform ios --profile preview --non-interactive

eas-build-list:
	cd mobile && npx eas-cli build:list --platform ios --limit 5

# ---- shared constants --------------------------------------------------------

check-consistency:
	node scripts/check-shared-constants.mjs

# ---- misc -------------------------------------------------------------------

health:
	@API_URL=$$($(DOCKER) run --rm -v "$(PROJECT_ROOT):/workspace" -v ~/.aws:/root/.aws:ro -w /workspace/infra $(TF_IMAGE) output -raw api_base_url); \
	echo "GET $$API_URL/v1/health"; \
	curl -s -w "\nHTTP_STATUS=%{http_code}\n" "$$API_URL/v1/health"

deploy-plan:
	gh workflow run deploy.yml --repo $(GH_REPO) -f apply=false

deploy-apply:
	gh workflow run deploy.yml --repo $(GH_REPO) -f apply=true

clean: infra-clean
	rm -rf backend/dist mobile/.expo mobile/dist mobile/web-build
