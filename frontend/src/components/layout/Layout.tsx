import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Breadcrumbs } from '../Breadcrumbs';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

export function Layout() {
  useKeyboardShortcuts();

  return (
    <div className="flex h-screen bg-surface-primary">
      <a href="#main-content" className="skip-to-content">
        Pular para conteúdo principal
      </a>

      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main id="main-content" className="flex-1 overflow-y-auto p-6" tabIndex={-1}>
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>

      <div className="sr-only" role="region" aria-label="Atalhos de teclado disponíveis">
        <p>Alt+D: Dashboard</p>
        <p>Alt+C: Clientes</p>
        <p>Alt+P: Pipeline</p>
        <p>Alt+U: Upload</p>
        <p>ESC: Fechar modais</p>
      </div>
    </div>
  );
}
