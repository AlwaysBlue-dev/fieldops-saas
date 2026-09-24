-- Commit new InvoiceStatus enum values first.
-- PostgreSQL forbids using newly added enum values until the transaction that
-- added them has committed (Prisma runs each migration in its own transaction).
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PREPARING';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_REPORTED';
