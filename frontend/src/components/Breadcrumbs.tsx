import { ChevronRight, Home } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  path: string;
}

export function Breadcrumbs() {
  const location = useLocation();

  const getBreadcrumbs = (): BreadcrumbItem[] => {
    const paths = location.pathname.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [];
    const pathMap: Record<string, string> = {
      clientes: 'Clientes',
      pipeline: 'Pipeline',
      upload: 'Upload',
      configuracoes: 'Configurações',
    };

    paths.forEach((path, index) => {
      const fullPath = '/' + paths.slice(0, index + 1).join('/');
      const isId = path.match(/^[a-f0-9-]{36}$/i);
      breadcrumbs.push({
        label: isId ? 'Detalhes' : pathMap[path] || path,
        path: fullPath,
      });
    });

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  if (location.pathname === '/') return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-[13px]">
        <li>
          <Link to="/" className="flex items-center text-zinc-400 hover:text-indigo-600 transition-colors" aria-label="Dashboard">
            <Home className="w-3.5 h-3.5" />
          </Link>
        </li>
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <li key={item.path} className="flex items-center gap-1.5">
              <ChevronRight className="w-3 h-3 text-zinc-300" aria-hidden="true" />
              {isLast ? (
                <span className="font-medium text-zinc-900" aria-current="page">{item.label}</span>
              ) : (
                <Link to={item.path} className="text-zinc-400 hover:text-indigo-600 transition-colors">{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
