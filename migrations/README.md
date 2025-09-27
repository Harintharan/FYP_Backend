# Database Migration System

This folder contains database migration scripts for the supply chain backend application. Migrations ensure database schema changes are applied consistently across all environments.

## Structure

- `index.js`: Main migration runner script that runs all pending migrations in order
- `01_initial_schema.js`: Creates the initial database tables
- `02_seed_data.js`: Adds seed data like sample checkpoints
- `03_add_tracking_columns.js`: Adds temperature tracking columns to product and batch tables

## Running Migrations

To run all pending migrations:

```bash
npm run migrate
```

This command will:

1. Create a `migrations` table in the database to track which migrations have been run
2. Check which migrations have already been applied
3. Run only the new migrations in the correct order

## Creating New Migrations

To create a new migration:

1. Create a new file in the migrations folder with a numeric prefix (e.g., `04_add_new_table.js`)
2. Follow the existing migration pattern with a `migrate` function that accepts a pool parameter
3. Use transactions for safety (BEGIN/COMMIT/ROLLBACK)
4. Insert a record into the migrations table when successful

Example:

```javascript
const migrate = async (pool) => {
  try {
    await pool.query("BEGIN");

    // Your migration SQL here
    await pool.query(`
      CREATE TABLE IF NOT EXISTS new_table (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    // Record this migration as run
    await pool.query(
      "INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
      ["04_add_new_table"]
    );

    await pool.query("COMMIT");
    console.log("✅ Migration completed successfully");
    return true;
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("❌ Migration failed:", error);
    return false;
  }
};

module.exports = { migrate };
```

## Best Practices

1. Always use transactions in migrations
2. Make migrations idempotent (can be run multiple times safely)
3. Use `IF NOT EXISTS` or `ON CONFLICT` clauses
4. Keep each migration focused on a single logical change
5. Never modify existing migrations after they've been run in any environment
