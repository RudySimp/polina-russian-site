import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const dist = resolve('apps/showcase/dist');
const base = '/polina-russian-site/';
const files = readdirSync(dist, { recursive: true }).filter(file => typeof file === 'string');
const htmlFiles = files.filter(file => file.endsWith('.html'));
assert(htmlFiles.length >= 14, 'Не все страницы экспортированы');
assert(existsSync(resolve(dist, '.nojekyll')), 'Отсутствует .nojekyll');
for (const file of htmlFiles) {
  const html = readFileSync(resolve(dist, file), 'utf8');
  assert(html.includes('lang="ru"'), `${file}: язык страницы`);
  for (const [, url] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^(https?:|data:)/.test(url)) continue;
    assert(url.startsWith(base), `${file}: неверный путь ${url}`);
    assert(existsSync(resolve(dist, url.slice(base.length))), `${file}: отсутствует ${url}`);
  }
}
for (const file of files.filter(file => /\.(html|js|css|json)$/.test(file))) {
  const content = readFileSync(resolve(dist, file), 'utf8');
  assert(!/postgres(ql)?:\/\/|password_hash|polina_session|BEGIN (RSA |OPENSSH )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20}/.test(content), `${file}: серверные данные в публичной сборке`);
}
console.log(`Статическая сборка: ${htmlFiles.length} HTML-страниц, ассеты и base path проверены. Серверные секреты не включены.`);
