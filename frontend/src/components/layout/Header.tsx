import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, User, X, Loader } from 'lucide-react';
import { Breadcrumbs } from './Breadcrumbs';
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

  // Handle Ctrl+K keyboard shortcut
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

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
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
          setSearchResults(data.clientes.slice(0, 8)); // Limit to 8 results
          setShowResults(true);
        }
      } catch (error) {
        console.error('Error searching:', error);
      } finally {
        setSearching(false);
      }
    }, 300); // Debounce 300ms

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
    <header className="h-16 bg-gradient-to-r from-white via-indigo-50/30 to-purple-50/30 border-b border-indigo-200/50 flex items-center justify-between px-6 shadow-sm backdrop-blur-sm">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Right side: Search + Notifications + User */}
      <div className="flex items-center space-x-4">
        {/* Search Bar */}
        <div className="relative" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={globalSearchQuery}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            onFocus={() => globalSearchQuery.length >= 2 && setShowResults(true)}
            placeholder="Buscar clientes... (Ctrl+K)"
            className="pl-10 pr-10 py-2 w-64 border border-indigo-200 bg-white/80 backdrop-blur-sm rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 transition-all shadow-sm hover:shadow-md"
          />
          {globalSearchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Search Results Dropdown */}
          {showResults && (
            <div className="absolute top-full mt-2 w-96 bg-white rounded-lg shadow-lg border border-slate-200 max-h-96 overflow-y-auto z-50">
              {searching ? (
                <div className="p-4 text-center">
                  <Loader className="w-5 h-5 text-indigo-600 animate-spin mx-auto" />
                  <p className="text-sm text-slate-600 mt-2">Buscando...</p>
                </div>
              ) : searchResults.length > 0 ? (
                <>
                  <div className="p-2 border-b border-slate-200">
                    <p className="text-xs text-slate-500 px-2">
                      {searchResults.length} resultado{searchResults.length > 1 ? 's' : ''}{' '}
                      encontrado{searchResults.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleSelectResult(result.id)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{result.nome}</p>
                          <p className="text-xs text-slate-500 mt-1">{result.endereco}</p>
                          {result.cidade && (
                            <p className="text-xs text-slate-400 mt-0.5">{result.cidade}</p>
                          )}
                        </div>
                        {result.potencialCategoria && (
                          <span
                            className={`ml-2 px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
                              result.potencialCategoria === 'ALTO'
                                ? 'bg-green-100 text-green-800'
                                : result.potencialCategoria === 'MÉDIO'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
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
                  <p className="text-sm text-slate-600">Nenhum resultado encontrado</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Tente buscar por nome ou endereço
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notifications */}
        <button className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* User Menu */}
        <button className="flex items-center space-x-3 px-3 py-2 hover:bg-indigo-50 rounded-lg transition-all hover:shadow-sm">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center shadow-md">
            <User className="w-5 h-5 text-white" />
          </div>
          <div className="text-left hidden lg:block">
            <p className="text-sm font-medium text-slate-900">Usuário</p>
            <p className="text-xs text-indigo-600 font-medium">Admin</p>
          </div>
        </button>
      </div>
    </header>
  );
}
