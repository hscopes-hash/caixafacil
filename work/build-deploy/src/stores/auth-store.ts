'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type NivelAcesso = 'ADMINISTRADOR' | 'SUPERVISOR' | 'OPERADOR';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  foto?: string;
  ativo: boolean;
  nivelAcesso: NivelAcesso;
  empresaId: string;
  ultimoAcesso?: string;
}

export interface PreferenciasUsuario {
  uiScale: number;
  impressoraTipo?: string | null;
  impressoraPreset?: string | null;
  impressoraConexao?: string | null;
  impressoraServicoUUID?: string | null;
  impressoraCharUUID?: string | null;
  impressoraChunkSize?: number | null;
}

export interface Empresa {
  id: string;
  nome: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
  logo?: string;
  ativa: boolean;
  plano: string;
  bloqueada: boolean;
  llmApiKey?: string;
  llmModel?: string;
  llmApiKeyGemini?: string;
  llmApiKeyGlm?: string;
  llmApiKeyOpenrouter?: string;
  uiScale?: number;
  // PIX Banco
  pixChaveTipo?: string;
  pixChave?: string;
  pixMerchantNome?: string;
  pixMerchantCidade?: string;
  pixBancoNome?: string;
  // Mercado Pago
  mercadopagoAccessToken?: string;
  mercadopagoPublicKey?: string;
  // Configuração de operação
  permitirDigitacaoLeitura?: boolean;
}

interface AuthState {
  usuario: Usuario | null;
  empresa: Empresa | null;
  token: string | null;
  isAuthenticated: boolean;
  preferencias: PreferenciasUsuario | null;
  login: (usuario: Usuario, empresa: Empresa, token: string, preferencias?: PreferenciasUsuario | null) => void;
  logout: () => void;
  updateUsuario: (usuario: Partial<Usuario>) => void;
  updateEmpresa: (empresa: Partial<Empresa>) => void;
  updatePreferencias: (preferencias: Partial<PreferenciasUsuario>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      usuario: null,
      empresa: null,
      token: null,
      isAuthenticated: false,
      preferencias: null,
      login: (usuario, empresa, token, preferencias = null) =>
        set({ usuario, empresa, token, isAuthenticated: true, preferencias }),
      logout: () =>
        set({ usuario: null, empresa: null, token: null, isAuthenticated: false, preferencias: null }),
      updateUsuario: (usuarioData) =>
        set((state) => ({
          usuario: state.usuario ? { ...state.usuario, ...usuarioData } : null,
        })),
      updateEmpresa: (empresaData) =>
        set((state) => ({
          empresa: state.empresa ? { ...state.empresa, ...empresaData } : null,
        })),
      updatePreferencias: (preferenciasData) =>
        set((state) => ({
          preferencias: state.preferencias
            ? { ...state.preferencias, ...preferenciasData }
            : { uiScale: 1.0, ...preferenciasData },
        })),
    }),
    {
      name: 'caixafacil-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        usuario: state.usuario,
        empresa: state.empresa,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        preferencias: state.preferencias,
      }),
    }
  )
);

// Limpar sessao persistida de versoes anteriores (auth-storage no localStorage)
if (typeof window !== 'undefined') {
  try { localStorage.removeItem('auth-storage'); } catch {}
}
