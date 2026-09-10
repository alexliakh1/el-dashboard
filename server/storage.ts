// D1 in production; Wrangler persists the identical database locally under .wrangler/.
export interface Database { prepare(sql:string): Statement; }
interface Statement { bind(...args:unknown[]): Statement; first<T>():Promise<T|null>; run():Promise<{meta:{changes:number}}> }
export class Storage {
  constructor(readonly db: Database) {}
  async get<T>(key:string):Promise<T|null> {
    const row=await this.db.prepare('SELECT value FROM commute_state WHERE key = ?').bind(key).first<{value:string}>();
    return row ? JSON.parse(row.value) as T : null;
  }
  async set(key:string,value:unknown) { await this.db.prepare('INSERT INTO commute_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run(); }
  async acquire(name:string, now:number, ttl=120000) {
    const owner=crypto.randomUUID();
    const r=await this.db.prepare('INSERT INTO commute_locks(name,owner,expires) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE commute_locks.expires < ?').bind(name,owner,now+ttl,now).run();
    return r.meta.changes ? owner : null;
  }
  async release(name:string,owner:string) { await this.db.prepare('DELETE FROM commute_locks WHERE name=? AND owner=?').bind(name,owner).run(); }
}
