CREATE TABLE "assignment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'homework' NOT NULL,
	"exam" text NOT NULL,
	"due_at" timestamp with time zone,
	"feedback_mode" text DEFAULT 'immediate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"results" jsonb NOT NULL,
	"score" integer NOT NULL,
	"max_score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_recipient_id_unique" UNIQUE("recipient_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"student_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam" text NOT NULL,
	"year" integer NOT NULL,
	"status" text NOT NULL,
	"source_url" text NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"response_kind" text NOT NULL,
	"answers" jsonb NOT NULL,
	"policy" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"max_score" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"teacher_id" uuid NOT NULL,
	"exam" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"message" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_recipient_id_unique" UNIQUE("recipient_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"resets_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_version" integer DEFAULT 0 NOT NULL,
	"feedback_released" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"section" text NOT NULL,
	"description" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"exam" text DEFAULT 'EGE' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_login_unique" UNIQUE("login")
);
--> statement-breakpoint
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_recipient_id_assignment_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."assignment_recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_exam_id_exam_versions_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_assignment_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."assignment_recipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_exercise" ON "assignment_items" USING btree ("assignment_id","exercise_id");--> statement-breakpoint
CREATE INDEX "attempts_student" ON "attempts" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_pair" ON "enrollments" USING btree ("teacher_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_year" ON "exam_versions" USING btree ("exam","year");--> statement-breakpoint
CREATE UNIQUE INDEX "recipient_pair" ON "assignment_recipients" USING btree ("assignment_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_version" ON "content_revisions" USING btree ("entity_id","kind","version");