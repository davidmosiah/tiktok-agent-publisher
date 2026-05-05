import fs from 'node:fs';
import path from 'node:path';

export class JsonlStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  file(name) {
    return path.join(this.baseDir, name);
  }

  append(name, obj) {
    fs.appendFileSync(this.file(name), `${JSON.stringify(obj)}\n`, 'utf8');
  }

  readAll(name) {
    const fp = this.file(name);
    if (!fs.existsSync(fp)) return [];
    return fs
      .readFileSync(fp, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  writeAll(name, rows) {
    const fp = this.file(name);
    const content = rows.map((r) => JSON.stringify(r)).join('\n');
    fs.writeFileSync(fp, content ? `${content}\n` : '', 'utf8');
  }

  writeJson(name, obj) {
    fs.writeFileSync(this.file(name), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  }

  readJson(name, fallback = {}) {
    const fp = this.file(name);
    if (!fs.existsSync(fp)) return fallback;
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch {
      return fallback;
    }
  }
}
