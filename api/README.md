# FieldKeel — API

NestJS ESM API for **FieldKeel**. PostgreSQL is the source of truth; object storage and SMTP are environment-configured.

See `../docs/` for architecture, security, and commercial model. Local secrets live in `.env` (not committed); use `.env.example` as a template.

```bash
fnm use 24.14.1
npm install
npm run start:dev
```
