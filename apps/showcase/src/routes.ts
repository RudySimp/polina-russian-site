export const routes = ['/', '/oge/', '/ege/', '/theory/', '/theory/odnorodnye/', '/theory/ne-prilagatelnye/', '/theory/udarenie/', '/practice/', '/practice/ege-punctuation/', '/practice/ege-stress/', '/practice/oge-syntax/', '/progress/', '/sources/', '/about/'];
export const basePath = '/polina-russian-site';
export const href = (path: string) => `${basePath}${path}`;
export function currentPath(pathname: string): string {
  const path = pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
  return path.endsWith('/') ? path : `${path}/`;
}
