# Database Migrations

Production changes should be applied through ordered migration files in this
directory, not by rerunning `database/schema.sql` against a live database.

Use:

```bash
python scripts/migrate.py --env prod
```

The runner records applied files in `SchemaMigrations`. Each migration should be
append-only and idempotency should be handled by the migration table, not by
editing old files.

For a local destructive reset, run `database/reset_dev.sql` first, then the base
schema/data/routines in the README order.

