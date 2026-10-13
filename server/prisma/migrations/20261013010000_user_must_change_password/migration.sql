-- Admin-forced password reset: the account logs in normally, but the web app blocks
-- everything else until a new password is set (see routes/auth.ts's PUT /me).
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
