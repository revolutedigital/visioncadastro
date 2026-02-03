import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, User, X, Loader } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { API_BASE_URL } from '../../config/api';

interface SearchResult {
  id: string;
  nome: string;
  endereco: string;
  cidade?: string;
  potencialCategoria?: string;
  potencialScore?: number;
}

export function Header() {
  const navigate = useNavigate();
  const { globalSearchQuery, setGlobalSearchQuery } = useApp();
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setShowResults(false);
        setGlobalSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setGlobalSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!globalSearchQuery || globalSearchQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    const timeoutId = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/analysis/clientes?search=${encodeURIComponent(globalSearchQuery)}`
        );
        const data = await response.json();
        if (data.success && data.clientes) {
          setSearchResults(data.clientes.slice(0, 8));
          setShowResults(true);
        }
      } catch (error) {
        console.error('Error searching:', error);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [globalSearchQuery]);

  const handleSelectResult = (clienteId: string) => {
    navigate(`/clientes/${clienteId}`);
    setShowResults(false);
    setGlobalSearchQuery('');
  };

  const handleClearSearch = () => {
    setGlobalSearchQuery('');
    setShowResults(false);
    inputRef.current?.focus();
  };

  return (
    <header className="h-[52px] bg-white border-b border-[#E5E5EA] flex items-center justify-between px-6">
      {/* Left: empty space for breadcrumbs shown in main */}
      <div />

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            value={globalSearchQuery}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            onFocus={() => globalSearchQuery.length >= 2 && setShowResults(true)}
            placeholder="Buscar... ⌘K"
            className="pl-9 pr-9 py-1.5 w-56 border border-[#E5E5EA] bg-surface-secondary rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-zinc-400 transition-colors"
          />
          {globalSearchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {showResults && (
            <div className="absolute top-full mt-2 w-80 bg-white rounded-xl shadow-overlay border border-[#E5E5EA] max-h-80 overflow-y-auto z-50">
              {searching ? (
                <div className="p-4 text-center">
                  <Loader className="w-5 h-5 text-indigo-600 animate-spin mx-auto" />
                  <p className="text-sm text-zinc-500 mt-2">Buscando...</p>
                </div>
              ) : searchResults.length > 0 ? (
                <>
                  <div className="px-3 py-2 border-b border-[#E5E5EA]">
                    <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">
                      {searchResults.length} resultado{searchResults.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelectResult(result.id)}
                      className="w-full text-left px-3 py-2.5 hover:bg-surface-secondary transition-colors border-b border-[#E5E5EA] last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">{result.nome}</p>
                          <p className="text-[11px] text-zinc-500 truncate mt-0.5">{result.endereco}</p>
                        </div>
                        {result.potencialCategoria && (
                          <span
                            className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-medium border flex-shrink-0 ${
                              result.potencialCategoria === 'ALTO'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : result.potencialCategoria === 'MÉDIO'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}
                          >
                            {result.potencialCategoria}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              ) : (
                <div className="p-4 text-center">
                  <p className="text-sm text-zinc-500">Nenhum resultado</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notifications */}
        <button className="relative p-2 text-zinc-400 hover:text-zinc-700 hover:bg-surface-secondary rounded-lg transition-colors">
          <Bell className="w-[18px] h-[18px]" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
        </button>

        {/* User */}
        <button className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-secondary rounded-lg transition-colors">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="text-left hidden lg:block">
            <p className="text-sm font-medium text-zinc-900 leading-tight">Usuário</p>
            <p className="text-[11px] text-zinc-500 leading-tight">Admin</p>
          </div>
        </button>
      </div>
    </header>
  );
}
