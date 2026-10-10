import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Сайт Полины · локальный API', description: 'Серверная основа учебной платформы' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ru"><body style={{ fontFamily: 'system-ui', maxWidth: 760, margin: '60px auto', padding: 24, lineHeight: 1.7 }}>{children}</body></html>;
}
