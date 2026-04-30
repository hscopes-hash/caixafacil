'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { Send, Sparkles, Volume2, VolumeX, Mic, MicOff, Settings2, Plus, X, Trash2, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Instrucao {
  id: string;
  instrucao: string;
  criadoEm: string;
}

// ==================== TTS - Text to Speech ====================
function speak(text: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  let clean = text
    .replace(/^\d+\.\s/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/[|[\]{}]/g, '')
    .trim();
  if (clean && !/[.!?]$/.test(clean)) clean += '.';
  if (!clean) return;
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = 'pt-BR';
  utterance.rate = 1.05;
  utterance.pitch = 1;

  const voices = window.speechSynthesis.getVoices();
  const ptVoice = voices.find(v => v.lang.startsWith('pt'));
  if (ptVoice) utterance.voice = ptVoice;

  window.speechSynthesis.speak(utterance);
}

// ==================== STT - Speech to Text ====================
type SpeechRecognitionStatus = 'idle' | 'listening' | 'processing';

function getSpeechRecognition(): (typeof window.SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

// Gerar ID de sessao unico
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export default function ChatIAPage() {
  const { empresa, token: authToken } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [micStatus, setMicStatus] = useState<SpeechRecognitionStatus>('idle');
  const [sessaoId, setSessaoId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceTriggeredRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Estado para confirmacao de acoes destrutivas
  const [confirmingMsgIndex, setConfirmingMsgIndex] = useState<number | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<{ acao: string; dados: Record<string, unknown> } | null>(null);
  const [confirmingLoading, setConfirmingLoading] = useState(false);

  // Instrucoes permanentes
  const [showInstrucoes, setShowInstrucoes] = useState(false);
  const [instrucoes, setInstrucoes] = useState<Instrucao[]>([]);
  const [loadingInstrucoes, setLoadingInstrucoes] = useState(false);
  const [novaInstrucao, setNovaInstrucao] = useState('');
  const [savingInstrucao, setSavingInstrucao] = useState(false);

  // Inicializar sessao
  useEffect(() => {
    if (!sessaoId) {
      setSessaoId(generateSessionId());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carregar vozes disponiveis
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Limpar TTS ao desmontar
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // ==================== Instrucoes ====================
  const loadInstrucoes = useCallback(async () => {
    if (!empresa?.id) return;
    setLoadingInstrucoes(true);
    try {
      const res = await fetch(`/api/chat-ia/instrucoes?empresaId=${empresa.id}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      const data = await res.json();
      setInstrucoes(data.instrucoes || []);
    } catch {
      setInstrucoes([]);
    } finally {
      setLoadingInstrucoes(false);
    }
  }, [empresa?.id]);

  // Carregar instrucoes ao abrir o painel
  useEffect(() => {
    if (showInstrucoes && empresa?.id) {
      loadInstrucoes();
    }
  }, [showInstrucoes, empresa?.id, loadInstrucoes]);

  const handleAddInstrucao = async () => {
    if (!novaInstrucao.trim() || !empresa?.id || savingInstrucao) return;

    setSavingInstrucao(true);
    try {
      const res = await fetch('/api/chat-ia/instrucoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
          empresaId: empresa.id,
          instrucao: novaInstrucao.trim(),
        }),
      });

      if (res.ok) {
        setNovaInstrucao('');
        toast.success('Instrucao salva com sucesso!');
        loadInstrucoes();
      } else {
        toast.error('Erro ao salvar instrucao');
      }
    } catch {
      toast.error('Erro ao salvar instrucao');
    } finally {
      setSavingInstrucao(false);
    }
  };

  const handleRemoveInstrucao = async (id: string) => {
    if (!empresa?.id) return;
    try {
      const res = await fetch(`/api/chat-ia/instrucoes?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (res.ok) {
        toast.success('Instrucao removida');
        setInstrucoes(prev => prev.filter(i => i.id !== id));
      }
    } catch {
      toast.error('Erro ao remover');
    }
  };

  // ==================== Microfone ====================
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setMicStatus('idle');
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setMicStatus('idle');
      return;
    }

    // Parar TTS enquanto escuta
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setMicStatus('listening');

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onend = () => {
      voiceTriggeredRef.current = true;
      setMicStatus('idle');
    };

    recognition.onerror = () => setMicStatus('idle');

    recognitionRef.current = recognition;
    recognition.start();
  }, [input]);

  const toggleMic = () => {
    if (micStatus === 'listening') {
      stopListening();
    } else {
      startListening();
    }
  };

  // Enviar automaticamente quando para de escutar
  useEffect(() => {
    if (micStatus === 'idle' && voiceTriggeredRef.current && input.trim() && !loading) {
      voiceTriggeredRef.current = false;
      const timer = setTimeout(() => {
        sendMessage();
      }, 400);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micStatus, input, loading]);

  // ==================== Confirmar acao destrutiva ====================
  const handleConfirm = async () => {
    if (!confirmingAction || confirmingMsgIndex === null || confirmingLoading) return;
    setConfirmingLoading(true);

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    try {
      const res = await fetch('/api/chat-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
          empresaId: empresa.id,
          confirmAction: confirmingAction,
          sessaoId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages(prev => {
          const updated = [...prev];
          updated[confirmingMsgIndex] = {
            ...updated[confirmingMsgIndex],
            content: updated[confirmingMsgIndex].content + '\n\nErro: ' + (data.error || 'Erro ao executar acao.'),
          };
          return updated;
        });
      } else {
        const resultText = data.text || 'Acao executada com sucesso.';
        setMessages(prev => {
          const updated = [...prev];
          updated[confirmingMsgIndex] = {
            ...updated[confirmingMsgIndex],
            content: resultText,
          };
          return updated;
        });
        if (voiceOn) {
          speak(resultText);
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[confirmingMsgIndex] = {
          ...updated[confirmingMsgIndex],
          content: updated[confirmingMsgIndex].content + '\n\nErro de conexao.',
        };
        return updated;
      });
    } finally {
      setConfirmingMsgIndex(null);
      setConfirmingAction(null);
      setConfirmingLoading(false);
    }
  };

  const handleCancel = () => {
    if (confirmingMsgIndex === null) return;

    setMessages(prev => {
      const updated = [...prev];
      updated[confirmingMsgIndex] = {
        ...updated[confirmingMsgIndex],
        content: updated[confirmingMsgIndex].content + '\n\nAcao cancelada.',
      };
      return updated;
    });

    setConfirmingMsgIndex(null);
    setConfirmingAction(null);
  };

  // ==================== Enviar mensagem ====================
  const sendMessage = async () => {
    if (!input.trim() || !empresa?.id || loading) return;

    stopListening();

    let currentSessaoId = sessaoId;
    if (!currentSessaoId) {
      currentSessaoId = generateSessionId();
      setSessaoId(currentSessaoId);
    }

    const userMsg = input.trim();
    setInput('');

    const newMessages = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    // Criar AbortController para permitir cancelamento
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    try {
      const historyToSend = messages.slice(-10);

      const res = await fetch('/api/chat-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        signal: controller.signal,
        body: JSON.stringify({
          mensagem: userMsg,
          empresaId: empresa.id,
          messages: historyToSend,
          sessaoId: currentSessaoId,
        }),
      });

      const data = await res.json();
      const responseText = data.text || 'Sem resposta.';

      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error || 'Erro ao processar mensagem.' }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
        if (voiceOn) {
          speak(responseText);
        }

        if (data.requiresConfirmation && data.pendingAction) {
          const assistantIndex = newMessages.length;
          setConfirmingMsgIndex(assistantIndex);
          setConfirmingAction(data.pendingAction);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Comando cancelado.' }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Erro de conexao. Tente novamente.' }]);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const cancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Tambem parar TTS se estiver falando
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const toggleVoice = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setVoiceOn(prev => !prev);
  };

  const hasSpeechRecognition = typeof window !== 'undefined' && !!getSpeechRecognition();

  return (
    <div className="flex flex-col h-full -m-3 border-2 border-orange-400/40 shadow-lg shadow-orange-400/10 rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold">CaixaFacil IA</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowInstrucoes(!showInstrucoes)}
            className={`p-2 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-1.5 ${showInstrucoes ? 'bg-white/20' : ''}`}
            title="Instrucoes permanentes"
          >
            <Settings2 className="w-4 h-4" />
            <span className="text-xs hidden sm:inline">Instrucoes</span>
            {instrucoes.length > 0 && (
              <Badge variant="secondary" className="bg-white/25 text-white border-0 text-xs px-1.5 py-0.5 min-w-[18px] text-center">
                {instrucoes.length}
              </Badge>
            )}
          </button>
          <button
            onClick={toggleVoice}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            title={voiceOn ? 'Desativar voz' : 'Ativar voz'}
          >
            {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 opacity-60" />}
          </button>
        </div>
      </div>

      {/* Painel de Instrucoes Permanentes */}
      {showInstrucoes && (
        <div className="border-b border-border bg-muted/30 shrink-0">
          <div className="max-h-48 overflow-y-auto">
            {/* Lista de instrucoes */}
            <div className="px-4 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Instrucoes Permanentes</p>
                {instrucoes.length > 0 && (
                  <span className="text-xs text-muted-foreground">{instrucoes.length} ativa{instrucoes.length !== 1 ? 's' : ''}</span>
                )}
              </div>

              {loadingInstrucoes ? (
                <div className="flex items-center justify-center py-3">
                  <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : instrucoes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  Nenhuma instrucao definida. Adicione regras que a IA sempre seguira.
                </p>
              ) : (
                <div className="space-y-1.5 mb-3">
                  {instrucoes.map((inst) => (
                    <div key={inst.id} className="flex items-start gap-2 p-2 bg-card rounded-lg border border-border group">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-foreground flex-1 break-words">{inst.instrucao}</p>
                      <button
                        onClick={() => handleRemoveInstrucao(inst.id)}
                        className="p-1 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="Remover instrucao"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Formulario para adicionar */}
            <div className="px-4 pb-3">
              <div className="flex gap-2">
                <Input
                  value={novaInstrucao}
                  onChange={(e) => setNovaInstrucao(e.target.value)}
                  placeholder="Ex: Sempre responder em tom formal..."
                  className="flex-1 h-8 text-xs"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddInstrucao(); } }}
                  maxLength={500}
                />
                <Button
                  onClick={handleAddInstrucao}
                  disabled={!novaInstrucao.trim() || savingInstrucao}
                  size="sm"
                  className="h-8 px-3 bg-amber-500 hover:bg-amber-600"
                >
                  {savingInstrucao ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/60 mt-1">
                A IA seguira estas instrucoes em todas as conversas.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowInstrucoes(false)}
            className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border"
          >
            <ChevronUp className="w-3 h-3" />
            Ocultar instrucoes
          </button>
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 overscroll-contain touch-pan-y"
      >
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-lg font-bold text-foreground mb-2">Ola! Sou o assistente do CaixaFacil</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Posso ajudar com clientes, maquinas, fluxo de caixa, pagamentos e muito mais.
              </p>
              <p className="text-xs text-amber-500/60 mt-3">Lembro das nossas conversas anteriores.</p>
              <div className="flex items-center justify-center gap-4 mt-4">
                {voiceOn && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-500/50 bg-amber-500/10 px-3 py-1.5 rounded-full">
                    <Volume2 className="w-3.5 h-3.5" /> Voz ativada
                  </span>
                )}
                {hasSpeechRecognition && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-500/50 bg-amber-500/10 px-3 py-1.5 rounded-full">
                    <Mic className="w-3.5 h-3.5" /> Microfone disponivel
                  </span>
                )}
              </div>

              {/* Sugestoes rapidas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6 max-w-md mx-auto">
                {[
                  'Quais clientes estao bloqueados?',
                  'Resumo financeiro do mes',
                  'Listar maquinas por cliente',
                  'Quanto devo receber esta semana?',
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(suggestion); }}
                    className="text-left text-xs px-3 py-2.5 bg-muted hover:bg-muted/80 rounded-xl border border-border transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] sm:max-w-[75%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-br-md shadow-sm'
                  : 'bg-muted text-foreground rounded-bl-md border border-border'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Botoes de confirmacao para acoes destrutivas */}
          {confirmingMsgIndex !== null && confirmingMsgIndex < messages.length && (
            <div className="flex justify-start">
              <div className="flex gap-2 mt-1 ml-1">
                <button
                  onClick={handleConfirm}
                  disabled={confirmingLoading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-xl flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {confirmingLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Executando...
                    </>
                  ) : (
                    'Confirmar'
                  )}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={confirmingLoading}
                  className="px-4 py-2 bg-red-500/80 hover:bg-red-600 text-white text-sm rounded-xl disabled:opacity-50 transition-colors shadow-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted px-4 py-3 rounded-2xl rounded-bl-md border border-border">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <button
                    onClick={cancelRequest}
                    className="text-xs text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Indicador de escuta */}
      {micStatus === 'listening' && (
        <div className="px-4 py-2 flex items-center gap-2 text-sm text-amber-500 shrink-0 border-t border-border bg-amber-500/5">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <span className="font-medium">Ouvindo...</span>
          </div>
          {input && (
            <span className="text-muted-foreground text-xs truncate">{input}</span>
          )}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0 bg-card safe-area-bottom">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2 max-w-2xl mx-auto">
          {hasSpeechRecognition && (
            <button
              type="button"
              onClick={toggleMic}
              disabled={loading}
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                micStatus === 'listening'
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-muted text-muted-foreground hover:bg-amber-500/20 hover:text-amber-500'
              }`}
              title={micStatus === 'listening' ? 'Parar de ouvir' : 'Falar'}
            >
              {micStatus === 'listening' ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte qualquer coisa..."
            className="flex-1 h-10 text-sm rounded-xl"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-10 h-10 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white flex items-center justify-center disabled:opacity-50 shrink-0 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
