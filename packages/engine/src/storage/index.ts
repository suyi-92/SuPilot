import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Host, Task } from '@supilot/contracts'

export class Store {
  private db: DatabaseSync
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true })
    this.db = new DatabaseSync(join(directory, 'supilot.sqlite'))
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS hosts (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      PRAGMA user_version=1;`)
    for (const task of this.tasks()) {
      if (task.state === 'running' || task.state === 'cancel-requested') {
        task.state = 'unknown'
        task.message = '上次应用或 Engine 非正常退出，远端完成情况未知。只读检查可手动重新执行。'
        task.finishedAt = new Date().toISOString()
        task.steps.forEach((s) => {
          if (s.state === 'running') s.state = 'unknown'
        })
        this.saveTask(task)
      }
    }
  }
  hosts(): Host[] {
    return this.db
      .prepare('SELECT body FROM hosts ORDER BY rowid')
      .all()
      .map((r) => JSON.parse(r.body as string))
  }
  tasks(): Task[] {
    return this.db
      .prepare('SELECT body FROM tasks ORDER BY rowid DESC LIMIT 200')
      .all()
      .map((r) => JSON.parse(r.body as string))
  }
  saveHost(host: Host) {
    this.db
      .prepare('INSERT INTO hosts VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
      .run(host.id, JSON.stringify(host))
  }
  deleteHost(id: string) {
    this.db.prepare('DELETE FROM hosts WHERE id=?').run(id)
  }
  saveTask(task: Task) {
    this.db
      .prepare('INSERT INTO tasks VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body')
      .run(task.id, JSON.stringify(task))
  }
  prune() {
    this.db.exec(
      'DELETE FROM tasks WHERE rowid NOT IN (SELECT rowid FROM tasks ORDER BY rowid DESC LIMIT 200)'
    )
  }
  close() {
    this.db.close()
  }
}
