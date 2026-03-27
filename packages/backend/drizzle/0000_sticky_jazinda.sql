CREATE TYPE "public"."agent_run_mode" AS ENUM('chat', 'scenario', 'comparison', 'preflight');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('pending', 'preparing', 'running', 'waiting_for_tool', 'tool_executing', 'continuing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."asset_format" AS ENUM('json', 'yaml', 'markdown', 'text', 'csv', 'jsonl');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('system_prompt', 'json_schema', 'output_schema', 'eval_dataset', 'tool_definition', 'rag_preset', 'guardrail_rules', 'connector_template', 'starter_template');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('email', 'google', 'github');--> statement-breakpoint
CREATE TYPE "public"."budget_tier" AS ENUM('free', 'low', 'medium', 'high', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."complexity_level" AS ENUM('simple', 'moderate', 'complex', 'expert');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('tool', 'model', 'prompt_pack', 'workflow_pack', 'business_agent', 'developer_asset', 'local_build', 'stack_preset', 'guide');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('usd');--> statement-breakpoint
CREATE TYPE "public"."deployment_type" AS ENUM('cloud', 'local', 'self_hosted', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."language_support" AS ENUM('ru', 'en', 'multilingual');--> statement-breakpoint
CREATE TYPE "public"."pricing_type" AS ENUM('free', 'paid', 'open_source', 'api_based', 'freemium', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."privacy_type" AS ENUM('public_api', 'private', 'offline', 'zero_retention');--> statement-breakpoint
CREATE TYPE "public"."readiness" AS ENUM('template', 'deployable', 'production_ready');--> statement-breakpoint
CREATE TYPE "public"."response_mode" AS ENUM('text', 'json_object', 'json_schema');--> statement-breakpoint
CREATE TYPE "public"."runtime_type" AS ENUM('ollama', 'lm_studio', 'llama_cpp', 'open_webui', 'vllm', 'other');--> statement-breakpoint
CREATE TYPE "public"."tool_call_status" AS ENUM('pending', 'running', 'success', 'error', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."tool_type" AS ENUM('http_request', 'calculator', 'json_transform', 'template_renderer', 'knowledge_lookup', 'mock_tool', 'webhook_call');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'power_user', 'curator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'private', 'unlisted');--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(512) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"username" varchar(100),
	"name" varchar(255),
	"avatar_url" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "catalog_item_categories" (
	"item_id" uuid NOT NULL,
	"category_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_item_meta" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"pricing_type" "pricing_type",
	"deployment_type" "deployment_type",
	"privacy_type" "privacy_type",
	"language_support" "language_support",
	"difficulty" "difficulty",
	"readiness" "readiness",
	"vendor_name" varchar(255),
	"source_url" text,
	"docs_url" text,
	"github_url" text,
	"website_url" text,
	"metadata_json" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "catalog_item_tags" (
	"item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_item_use_cases" (
	"item_id" uuid NOT NULL,
	"use_case_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "content_type" NOT NULL,
	"title" varchar(500) NOT NULL,
	"slug" varchar(500) NOT NULL,
	"short_description" text,
	"full_description" text,
	"status" "item_status" DEFAULT 'draft' NOT NULL,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"hero_image_url" text,
	"author_user_id" uuid,
	"curated_score" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"seo_title" varchar(255),
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "catalog_items_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"parent_id" uuid,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "use_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	CONSTRAINT "use_cases_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"provider_source" varchar(50) DEFAULT 'openrouter' NOT NULL,
	"external_model_id" varchar(500) NOT NULL,
	"canonical_slug" varchar(500) NOT NULL,
	"display_name" varchar(500) NOT NULL,
	"context_length" integer,
	"tokenizer" varchar(100),
	"modality" varchar(50),
	"input_modalities" jsonb,
	"output_modalities" jsonb,
	"supported_parameters" jsonb,
	"pricing_prompt" numeric(20, 10),
	"pricing_completion" numeric(20, 10),
	"pricing_request" numeric(20, 10),
	"pricing_image" numeric(20, 10),
	"provider_meta_json" jsonb,
	"raw_json" jsonb,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "ai_models_catalog_item_id_unique" UNIQUE("catalog_item_id"),
	CONSTRAINT "ai_models_external_model_id_unique" UNIQUE("external_model_id"),
	CONSTRAINT "ai_models_canonical_slug_unique" UNIQUE("canonical_slug")
);
--> statement-breakpoint
CREATE TABLE "model_price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_model_id" uuid NOT NULL,
	"pricing_prompt" numeric(20, 10),
	"pricing_completion" numeric(20, 10),
	"pricing_request" numeric(20, 10),
	"pricing_image" numeric(20, 10),
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"asset_type" "asset_type" NOT NULL,
	"schema_json" jsonb,
	"content_text" text,
	"download_url" text,
	"format" "asset_format",
	"license" varchar(100),
	"recommended_use_cases" jsonb,
	CONSTRAINT "developer_assets_catalog_item_id_unique" UNIQUE("catalog_item_id")
);
--> statement-breakpoint
CREATE TABLE "local_builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"runtime_type" "runtime_type" NOT NULL,
	"install_steps" text,
	"hardware_requirements" jsonb,
	"os_support" jsonb,
	"model_refs" jsonb,
	"privacy_notes" text,
	"complexity_level" "complexity_level",
	"benchmark_notes" text,
	CONSTRAINT "local_builds_catalog_item_id_unique" UNIQUE("catalog_item_id")
);
--> statement-breakpoint
CREATE TABLE "prompt_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"variables_schema" jsonb,
	"default_system_prompt" text,
	"default_user_prompt" text,
	"output_schema" jsonb,
	"recommended_model_ids" jsonb,
	"import_format" varchar(50),
	"export_format" varchar(50),
	CONSTRAINT "prompt_packs_catalog_item_id_unique" UNIQUE("catalog_item_id")
);
--> statement-breakpoint
CREATE TABLE "stack_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"stack_definition" jsonb NOT NULL,
	"budget_tier" "budget_tier",
	"privacy_tier" "privacy_type",
	"deployment_mode" "deployment_type",
	"recommended_for" jsonb,
	CONSTRAINT "stack_presets_catalog_item_id_unique" UNIQUE("catalog_item_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"workflow_definition" jsonb NOT NULL,
	"variables_schema" jsonb,
	"output_schema" jsonb,
	"recommended_model_ids" jsonb,
	CONSTRAINT "workflow_packs_catalog_item_id_unique" UNIQUE("catalog_item_id")
);
--> statement-breakpoint
CREATE TABLE "agent_test_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"input_json" jsonb NOT NULL,
	"expected_output_schema" jsonb,
	"rubric_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_version_tools" (
	"agent_version_id" uuid NOT NULL,
	"tool_definition_id" uuid NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"config_override_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"model_id" uuid,
	"runtime_engine" varchar(50) DEFAULT 'openrouter_chat' NOT NULL,
	"system_prompt" text,
	"developer_prompt" text,
	"starter_prompt_template" text,
	"variables_schema" jsonb,
	"response_mode" "response_mode" DEFAULT 'text' NOT NULL,
	"response_schema" jsonb,
	"runtime_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"routing_config" jsonb,
	"privacy_config" jsonb,
	"tool_config" jsonb,
	"evaluation_config" jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"source_catalog_item_id" uuid,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255),
	"description" text,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"status" "agent_status" DEFAULT 'draft' NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tool_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"tool_type" "tool_type" NOT NULL,
	"description" text,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb,
	"config_json" jsonb,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tool_definitions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "agent_run_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"role" varchar(50) NOT NULL,
	"content_text" text,
	"content_json" jsonb,
	"token_estimate" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"tool_definition_id" uuid,
	"tool_call_id" varchar(255) NOT NULL,
	"tool_name" varchar(255) NOT NULL,
	"tool_input" jsonb NOT NULL,
	"tool_output" jsonb,
	"status" "tool_call_status" DEFAULT 'pending' NOT NULL,
	"duration_ms" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "agent_run_status" DEFAULT 'pending' NOT NULL,
	"mode" "agent_run_mode" DEFAULT 'chat' NOT NULL,
	"model_id" uuid,
	"provider_name" varchar(100),
	"external_generation_id" varchar(255),
	"external_response_id" varchar(255),
	"session_key" varchar(255),
	"trace_id" varchar(255) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"latency_ms" integer,
	"error_message" text,
	"input_summary" text,
	"output_summary" text,
	"final_output" text,
	"final_output_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "cost_daily_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"agent_id" uuid,
	"model_id" uuid,
	"day" date NOT NULL,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"total_successful_runs" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" bigint DEFAULT 0 NOT NULL,
	"completion_tokens" bigint DEFAULT 0 NOT NULL,
	"reasoning_tokens" bigint DEFAULT 0 NOT NULL,
	"cached_tokens" bigint DEFAULT 0 NOT NULL,
	"actual_cost" numeric(14, 8) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"provider" varchar(100) DEFAULT 'openrouter' NOT NULL,
	"model_external_id" varchar(500) NOT NULL,
	"provider_name" varchar(100),
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer,
	"cached_tokens" integer,
	"total_tokens" integer,
	"estimated_cost" numeric(12, 8),
	"actual_cost" numeric(12, 8),
	"cache_discount" numeric(12, 8),
	"currency" "currency" DEFAULT 'usd' NOT NULL,
	"raw_usage_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_stack_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255),
	"builder_answers" jsonb NOT NULL,
	"recommended_result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_categories" ADD CONSTRAINT "catalog_item_categories_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_categories" ADD CONSTRAINT "catalog_item_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_meta" ADD CONSTRAINT "catalog_item_meta_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_tags" ADD CONSTRAINT "catalog_item_tags_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_tags" ADD CONSTRAINT "catalog_item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_use_cases" ADD CONSTRAINT "catalog_item_use_cases_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_use_cases" ADD CONSTRAINT "catalog_item_use_cases_use_case_id_use_cases_id_fk" FOREIGN KEY ("use_case_id") REFERENCES "public"."use_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_price_snapshots" ADD CONSTRAINT "model_price_snapshots_ai_model_id_ai_models_id_fk" FOREIGN KEY ("ai_model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_assets" ADD CONSTRAINT "developer_assets_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_builds" ADD CONSTRAINT "local_builds_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_packs" ADD CONSTRAINT "prompt_packs_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stack_presets" ADD CONSTRAINT "stack_presets_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_packs" ADD CONSTRAINT "workflow_packs_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_test_scenarios" ADD CONSTRAINT "agent_test_scenarios_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_tools" ADD CONSTRAINT "agent_version_tools_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_version_tools" ADD CONSTRAINT "agent_version_tools_tool_definition_id_tool_definitions_id_fk" FOREIGN KEY ("tool_definition_id") REFERENCES "public"."tool_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_source_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("source_catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_definitions" ADD CONSTRAINT "tool_definitions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_messages" ADD CONSTRAINT "agent_run_messages_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_tool_calls" ADD CONSTRAINT "agent_run_tool_calls_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_tool_calls" ADD CONSTRAINT "agent_run_tool_calls_tool_definition_id_tool_definitions_id_fk" FOREIGN KEY ("tool_definition_id") REFERENCES "public"."tool_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_daily_aggregates" ADD CONSTRAINT "cost_daily_aggregates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_daily_aggregates" ADD CONSTRAINT "cost_daily_aggregates_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_daily_aggregates" ADD CONSTRAINT "cost_daily_aggregates_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_stack_results" ADD CONSTRAINT "saved_stack_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_id_idx" ON "auth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_cat_pk" ON "catalog_item_categories" USING btree ("item_id","category_id");--> statement-breakpoint
CREATE INDEX "catalog_item_cat_category_idx" ON "catalog_item_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "catalog_item_meta_pricing_idx" ON "catalog_item_meta" USING btree ("pricing_type");--> statement-breakpoint
CREATE INDEX "catalog_item_meta_deployment_idx" ON "catalog_item_meta" USING btree ("deployment_type");--> statement-breakpoint
CREATE INDEX "catalog_item_meta_language_idx" ON "catalog_item_meta" USING btree ("language_support");--> statement-breakpoint
CREATE INDEX "catalog_item_meta_privacy_idx" ON "catalog_item_meta" USING btree ("privacy_type");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_tags_pk" ON "catalog_item_tags" USING btree ("item_id","tag_id");--> statement-breakpoint
CREATE INDEX "catalog_item_tags_tag_idx" ON "catalog_item_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_item_uc_pk" ON "catalog_item_use_cases" USING btree ("item_id","use_case_id");--> statement-breakpoint
CREATE INDEX "catalog_item_uc_uc_idx" ON "catalog_item_use_cases" USING btree ("use_case_id");--> statement-breakpoint
CREATE INDEX "catalog_items_type_idx" ON "catalog_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "catalog_items_type_status_vis_idx" ON "catalog_items" USING btree ("type","status","visibility");--> statement-breakpoint
CREATE INDEX "catalog_items_status_vis_published_idx" ON "catalog_items" USING btree ("status","visibility","published_at");--> statement-breakpoint
CREATE INDEX "catalog_items_status_vis_curated_idx" ON "catalog_items" USING btree ("status","visibility","curated_score");--> statement-breakpoint
CREATE INDEX "catalog_items_author_idx" ON "catalog_items" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "ai_models_provider_source_idx" ON "ai_models" USING btree ("provider_source");--> statement-breakpoint
CREATE INDEX "model_price_snapshots_model_date_idx" ON "model_price_snapshots" USING btree ("ai_model_id","captured_at");--> statement-breakpoint
CREATE INDEX "agent_test_scenarios_agent_idx" ON "agent_test_scenarios" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_version_tools_pk" ON "agent_version_tools" USING btree ("agent_version_id","tool_definition_id");--> statement-breakpoint
CREATE INDEX "agent_version_tools_tool_idx" ON "agent_version_tools" USING btree ("tool_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_agent_version_idx" ON "agent_versions" USING btree ("agent_id","version_number");--> statement-breakpoint
CREATE INDEX "agent_versions_model_idx" ON "agent_versions" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "agents_owner_idx" ON "agents" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "agents_owner_status_idx" ON "agents" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "agent_run_messages_run_idx" ON "agent_run_messages" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_run_tool_calls_run_idx" ON "agent_run_tool_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_runs_user_started_idx" ON "agent_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_started_idx" ON "agent_runs" USING btree ("agent_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_runs_version_idx" ON "agent_runs" USING btree ("agent_version_id");--> statement-breakpoint
CREATE INDEX "agent_runs_model_idx" ON "agent_runs" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_runs_session_key_idx" ON "agent_runs" USING btree ("session_key");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_daily_agg_unique_idx" ON "cost_daily_aggregates" USING btree ("user_id","agent_id","model_id","day");--> statement-breakpoint
CREATE INDEX "cost_daily_agg_user_day_idx" ON "cost_daily_aggregates" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "cost_daily_agg_agent_day_idx" ON "cost_daily_aggregates" USING btree ("agent_id","day");--> statement-breakpoint
CREATE INDEX "cost_daily_agg_day_idx" ON "cost_daily_aggregates" USING btree ("day");--> statement-breakpoint
CREATE INDEX "usage_ledger_run_idx" ON "usage_ledger" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "usage_ledger_created_at_idx" ON "usage_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_item_idx" ON "favorites" USING btree ("user_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "favorites_user_idx" ON "favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "favorites_item_idx" ON "favorites" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "saved_stack_results_user_idx" ON "saved_stack_results" USING btree ("user_id");