"""Explicit local-only reset. Preserves complete User rows and creates an external SQLite backup."""
import argparse
import datetime
from pathlib import Path
import sqlite3

parser = argparse.ArgumentParser()
parser.add_argument('--confirm-reset', action='store_true')
parser.add_argument('--backup-directory', required=True)
args = parser.parse_args()
if not args.confirm_reset:
    parser.error('Pass --confirm-reset to replace operational records while preserving users.')
root = Path(__file__).resolve().parent.parent
working = (root / 'backend/prisma/dev.db').resolve()
fixture = (root / 'backend/demo/demo.db').resolve()
backup_dir = Path(args.backup_directory).resolve()
if backup_dir == root or root in backup_dir.parents:
    parser.error('The backup directory must be outside the repository.')
if not working.exists() or not fixture.exists():
    parser.error('Working database and demo fixture must both exist.')
backup_dir.mkdir(parents=True, exist_ok=True)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
backup_path = backup_dir / ('finance-before-cycles-' + stamp + '.db')
source = sqlite3.connect(working)
source.row_factory = sqlite3.Row
users = [dict(row) for row in source.execute('SELECT * FROM User ORDER BY id')]
backup = sqlite3.connect(backup_path)
source.backup(backup)
backup.close()
prepared = sqlite3.connect(':memory:')
seed = sqlite3.connect('file:' + fixture.as_posix() + '?mode=ro', uri=True)
seed.backup(prepared)
seed.close()
fixture_ids = {row[0] for row in prepared.execute('SELECT id FROM User')}
if not fixture_ids.issubset({row['id'] for row in users}):
    raise RuntimeError('Refresh the approved account snapshot before resetting: fixture users differ from local users.')
columns = [row[1] for row in prepared.execute('PRAGMA table_info(User)')]
quoted = ','.join('"' + column + '"' for column in columns)
with prepared:
    for user in users:
        prepared.execute('INSERT INTO User (' + quoted + ') VALUES (' + ','.join('?' for _ in columns) + ') ON CONFLICT(id) DO UPDATE SET ' + ','.join('"' + column + '"=excluded."' + column + '"' for column in columns if column != 'id'), [user[column] for column in columns])
prepared.row_factory = sqlite3.Row
assert [dict(row) for row in prepared.execute('SELECT * FROM User ORDER BY id')] == users
assert prepared.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert not prepared.execute('PRAGMA foreign_key_check').fetchall()
# SQLite backup replaces the destination transactionally; live services must be restarted afterward.
prepared.backup(source)
assert [dict(row) for row in source.execute('SELECT * FROM User ORDER BY id')] == users
source.close()
prepared.close()
print('Course/cycle data reset. All User fields preserved exactly. Backup:', backup_path)
