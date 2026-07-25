# Tools

**Tools** is a side pocket in Finn for occasional utilities that act on your data directly. Open it
from the header, or press <kbd>T</kbd>. Each tool is a tile; clicking one opens it in a modal.

Today it holds a single tool: the SQL editor.

## SQL editor

Sometimes a value needs a quick fix and walking through the UI is slower than saying what you mean.
The SQL editor is for those moments — it is not a database administration console.

* **Table hints:** the sidebar lists every table with its row count and columns. Click a column to
  insert its name, or use the shortcut under each table to start a `SELECT`.
* **Autocompletion:** tables and columns complete as you type, including after a `table.` prefix.
* **Dry run first:** the default action runs your statements inside a transaction, reports what
  would change, then rolls back. Nothing is saved until you press **Apply**.
* **Statement builder:** click any result cell to compose an `UPDATE` for it, condition included —
  see below. JSON cells open a collapsible tree instead of showing a wall of text.
* **Drafts and history:** whatever is in the editor survives closing the modal, and applied queries
  are kept in **History**.

The inspector panel stays open while you run queries, so you can iterate on a statement without
losing your place. It follows the same cell into each new result; if a run stops returning that
cell, the panel keeps what it had and says the values are from an earlier result.

Read-only queries show their rows and nothing else. The dry-run and applied banners appear only when
a statement could actually change data.

### Building a statement from a result cell

Click any cell in a result table and a panel opens on the right that writes the `UPDATE` for you.
It knows which table and column the cell came from, even through aliases, joins and CTEs, because
SQLite reports that for every result column. Computed columns such as `count(*)` belong to no table,
so the panel says so instead of guessing.

The panel gives you:

* **Set to** — pre-filled with the value currently stored, so you edit the new value rather than
  typing the whole statement.
* **Where** — a column, an operator and its operands. The condition starts on the row you clicked,
  using a primary key when the result carries one. **Alt-click** a cell instead to start the
  condition on *that* column, which is the quicker route to a range.
* A live preview of the statement, and **Insert statement** to drop it into the editor on its own
  line.

Nothing is executed by the panel. The statement lands in the editor, where the usual dry run tells
you how many rows it would touch before you commit anything.

#### Ranges and other conditions

The operator list covers `=`, `<>`, `>`, `>=`, `<`, `<=`, `BETWEEN`, `IN`, `LIKE`, `IS NULL` and
`IS NOT NULL`. Choosing **BETWEEN** pre-fills the bounds with the lowest and highest values the
result already shows for that column, so a query returning six months turns into a range over
exactly those months:

```sql
UPDATE snapshots
SET duration_seconds = 300
WHERE month BETWEEN '2026-02' AND '2026-07';
```

`IN` takes a comma-separated list. Numbers stay unquoted so comparisons work numerically, text is
quoted and escaped, and a bare `NULL` becomes the keyword. Text you quote yourself is passed through
untouched when you want manual control.

An unfinished condition never produces a bare `UPDATE`: the preview shows
`WHERE /* add a condition */` rather than a statement that would rewrite the whole table.

### Working with JSON

`snapshots.data` and `settings.value` hold JSON, which is painful to read as one long line and
error-prone to edit by hand. Selecting a JSON cell adds a tree to the same panel:

* Browse the value, expanding only the parts you care about.
* Click any node to target it. The path is shown, for example `$.organizations[0].name`, with keys
  quoted where SQLite needs it.
* The builder then writes a `json_set` assignment instead of a plain one, and **`json_extract`**
  is offered as a second action for use in a `SELECT`.

```sql
UPDATE snapshots
SET data = json_set(data, '$.organizations[0].name', 'Alfa-Bank')
WHERE month = '2026-07';
```

Picking a whole object or array works too. Its replacement is wrapped in `json()`, which matters:
without it SQLite would store the value as a quoted string rather than as nested JSON.

```sql
UPDATE snapshots
SET data = json_set(data, '$.rates', json('{"USD":80,"EUR":88.6,"RUB":1}'))
WHERE month = '2026-07';
```

#### Conditions on JSON

The **Where** section has a second mode for JSON columns: instead of comparing a table column, it
compares a value inside the document. Pick a node in the tree and press **Use in Where**, or type a
path yourself.

A fixed path compares one position:

```sql
WHERE json_extract(data, '$.rates.USD') > 80
```

That is rarely what you want for arrays. An organization sits at whatever index it happens to
occupy, and that index differs between snapshots — so `$.organizations[0].id` matches only the rows
where it landed first. Tick **Match any element of the array** and the condition scans the whole
array instead:

```sql
UPDATE snapshots
SET data = json_set(data, '$.organizations[0].name', 'Alfa-Bank')
WHERE EXISTS (
  SELECT 1 FROM json_each(data, '$.organizations')
  WHERE json_extract(value, '$.id') = 'ad2c48a2-5cd4-4bf9-8712-087485a904d0'
);
```

The difference is not subtle: in the demo data `$.organizations[0].name = 'Binance'` matches no rows
at all, while the scan finds it in all ten snapshots.

The box is ticked automatically when the path contains an array index, and disabled when it has none
to scan. Values follow the same rules as elsewhere — a numeric id stays unquoted so it compares
against a JSON number, while a uuid is quoted.

#### Updating the matching element, not a fixed index

By default the `SET` side writes to the literal path you picked, `$.organizations[0].name` — so
scanning chooses *which rows* to touch, but always changes the element sitting at index 0. That is
usually not what you want, since the organization occupies a different index in different snapshots.

Tick **Update every matching element, not just this index** and the array is rebuilt instead, with
the same test deciding which elements change:

```sql
UPDATE snapshots
SET data = json_set(data, '$.organizations',
  (SELECT json_group_array(
     CASE WHEN json_extract(value, '$.id') = 'ad2c48a2-5cd4-4bf9-8712-087485a904d0'
          THEN json_set(value, '$.name', 'Alfa-Bank')
          ELSE value END)
   FROM json_each(data, '$.organizations')))
WHERE EXISTS (SELECT 1 FROM json_each(data, '$.organizations')
              WHERE json_extract(value, '$.id') = 'ad2c48a2-5cd4-4bf9-8712-087485a904d0');
```

Elements that do not match pass through untouched, and matching elements keep every other field —
only the one you targeted changes. If the same id appears more than once in an array, all of its
occurrences are updated.

The option needs the `SET` path and the condition to sit in the same array, so set the condition
first: select the identifying node (`id`), press **Use in Where**, then select the node you want to
change (`name`). Until both line up the checkbox stays disabled and explains what is missing.

> [!NOTE]
> The `WHERE EXISTS` is still worth keeping even though the rebuild is harmless for non-matching
> rows. Without it every row is rewritten, and the dry run reports the whole table rather than the
> rows you actually care about.

> [!TIP]
> Elements are passed through as bare `value`. Wrapping them in `json(value)` looks tidier and is a
> common suggestion, but it fails with *malformed JSON* on arrays of plain strings — such as the
> balance tag lists in this schema.

### Shortcuts

The keyboard button in the editor's header lists these in place, with the modifier shown for your
platform.

| Shortcut | Action |
| --- | --- |
| <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Dry run |
| <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> | Apply and commit |
| <kbd>Ctrl</kbd> + <kbd>Space</kbd> | Suggest tables and columns |
| <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>/</kbd> | Comment or uncomment the selection |
| <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>F</kbd> | Find in the editor |
| <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo, with <kbd>Shift</kbd> to redo |
| Click a result cell | Build an `UPDATE` from it |
| <kbd>Alt</kbd> + click | Same, but condition on that column instead of the key |
| <kbd>Esc</kbd> | Close the editor |

### What it is allowed to do

The editor may **read anything** and **change rows in tables that already exist**. That is the whole
scope. Everything else is refused:

| Allowed | Refused |
| --- | --- |
| `SELECT`, `WITH … SELECT`, `EXPLAIN` | `CREATE`, `DROP`, `ALTER` (tables, indexes, views, triggers) |
| `INSERT`, `UPDATE`, `DELETE`, `REPLACE` | `ATTACH`, `DETACH`, `PRAGMA`, `VACUUM`, `REINDEX`, `ANALYZE` |
| Reading `schema_migrations` | Writing to `schema_migrations` or any `sqlite_*` table |
| SQLite's JSON functions (`json_set`, `json_extract`, …) | `load_extension`, `readfile`, `writefile` |

This is enforced by SQLite's own [authorizer callback][authorizer], which runs while each statement
is compiled. It cannot be worked around by hiding a statement behind a comment, a chained statement,
or a subquery — the check happens inside the database engine, not by inspecting the text.

A second check rejects statements by their leading keyword before they ever reach SQLite. It catches
the few commands the authorizer is not consulted about (a bare `VACUUM`, `REINDEX` or `ANALYZE`) and
produces a clearer message than SQLite's terse refusal.

### Safety behaviour

* **Everything runs in a transaction.** A batch is all-or-nothing: if the third statement fails, the
  first two are rolled back too.
* **A restore point is created before the first write** of each run, using your configured
  [backup targets](backups.md). If every target fails, nothing is applied and you are offered the
  choice to continue without one. Backups must be enabled in `config.yml` for this to happen; in
  `--demo` mode it is skipped.
* **Results are capped** at 500 rows per statement, and a statement is cancelled after 15 seconds.
* **Local only.** The endpoints refuse any request that does not come from the loopback interface
  with a local `Origin`, so no page you happen to have open elsewhere in the browser can reach them.

> [!NOTE]
> `schema_migrations` is deliberately read-only: it records which migrations have run, and editing it
> can stop Finn from starting. If you ever genuinely need to change it, use the `sqlite3` CLI against
> the database file.

### Recipes

Statements you would rather write by hand. Snapshot payloads are JSON, so SQLite's JSON functions do
most of the work.

Rename an organization across every snapshot:

```sql
UPDATE snapshots
SET data = replace(data, '"AlfaBank"', '"Alfa-Bank"')
WHERE data LIKE '%AlfaBank%';
```

Inspect the exchange rates stored in one snapshot:

```sql
SELECT month, json_extract(data, '$.rates') AS rates
FROM snapshots
ORDER BY month DESC
LIMIT 6;
```

Fix a single mistyped cash flow amount:

```sql
UPDATE flow_entries SET amount = 1250.00 WHERE id = 42;
```

Always dry run first and read the row count before applying — `WHERE` clauses are easy to get wrong.

[authorizer]: https://sqlite.org/c3ref/set_authorizer.html

[Back to the README](../README.md)
