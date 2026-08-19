# AWS Console and secrets guide

This guide deploys the API with **Amazon RDS for MySQL**, **Amazon S3**, and either **ECS Fargate** or another Node.js host. The API supports other storage vendors; this page describes the AWS path.

## 1. Create AWS resources in the Console

1. Choose one AWS Region and record its name (for example `us-east-1`).
2. Create an S3 bucket with Block Public Access enabled, default encryption (SSE-S3 or SSE-KMS), and versioning optional. The DMS performs its own versioning.
3. Create an RDS MySQL 8 database in private subnets. Allow inbound TCP 3306 only from the backend security group. Run `sql/schema.sql` and `sql/seed.sql` from a controlled migration job; never expose RDS publicly.
4. Create an ECS cluster, task definition, and service (Fargate). Put tasks in private subnets behind an Application Load Balancer. Allow the ALB to reach the task port (default 3000).
5. Create an IAM task role. Give it only the required bucket actions: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, and `s3:ListBucket` scoped to this bucket/prefix. Add `kms:Decrypt` only when using a customer-managed KMS key.
6. Create CloudWatch log group `/dms/backend`, enable container logging, health checks, and alarms for 5xx responses and unhealthy targets.

## 2. Recommended secret store: Secrets Manager

In **AWS Console → Secrets Manager → Store a new secret → Other type of secret**, create `dms/prod/backend` as key/value JSON:

```json
{
  "DB_HOST": "dms-prod.xxxxxx.us-east-1.rds.amazonaws.com",
  "DB_PORT": "3306",
  "DB_NAME": "document_service",
  "DB_USER": "dms_app",
  "DB_PASSWORD": "replace-with-generated-password",
  "S3_ACCESS_KEY": "not-needed-when-using-task-role",
  "S3_SECRET_KEY": "not-needed-when-using-task-role",
  "AUTH_JWT_SECRET": "replace-with-a-long-random-value"
}
```

Prefer the ECS task role instead of static S3 keys. In **ECS → Task definition → Container → Environment variables**, use **Secrets** and map each JSON key to its Secrets Manager ARN. Grant the ECS execution/task role `secretsmanager:GetSecretValue` for this secret and `kms:Decrypt` if it uses a customer KMS key. Rotate `DB_PASSWORD` and JWT secrets with a tested rollout.

## 3. Alternative: SSM Parameter Store

In **Systems Manager → Parameter Store**, create `SecureString` parameters such as `/dms/prod/DB_PASSWORD`, `/dms/prod/AUTH_JWT_SECRET`, and `/dms/prod/DB_HOST`. In ECS map them under container **Secrets**. Grant `ssm:GetParameters` for only `/dms/prod/*` and `kms:Decrypt` for the parameter key. `SecureString` is the secret store type; do not use plain `String` for passwords or tokens.

## 4. Non-secret runtime settings

Set these as normal ECS environment variables (or SSM String parameters): `NODE_ENV=production`, `PORT=3000`, `HOST=0.0.0.0`, `AUTH_DISABLED=false`, `STORAGE_PROVIDER=s3`, `S3_BUCKET=<bucket>`, `AWS_REGION=<region>`, and `SIGNED_URL_TTL_SECONDS=900`. For tenant storage configuration, store only references such as `accessKeyRef`; never store secret values in MySQL.

## 5. Verification checklist

- `GET /api/health` returns healthy through the ALB.
- `GET /api-docs` loads, and protected calls include the configured `idtoken` plus `x-tenant-id`.
- Upload and download signed URLs work from outside the VPC without making the bucket public.
- CloudTrail, RDS backups, S3 lifecycle rules, and CloudWatch alarms are enabled.
- Secrets are absent from Git, Docker images, logs, Swagger examples, and client-side environment files.
