import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, WheelEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowDown, ArrowLeft, Bot, Braces, CircleStop, RefreshCw, RotateCcw, Send, Server, Sparkles, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_URL } from '../types';
import type { AIResponseStyle, LocalAIContextFilter, LocalAIContextPreview, LocalAIStatus } from '../types';
import { SearchableSelect } from './components/graphs/SearchableSelect';
import { StickyPageHeader } from './components/StickyPageHeader';
import { AIContextPreviewModal } from './components/AIContextPreviewModal';
import { useEscapeToDashboard } from '../hooks/useEscapeToDashboard';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const suggestions = [
  'Какие месяцы сильнее всего повлияли на мой капитал?',
  'Как менялась валютная структура портфеля?',
  'Найди необычные изменения и объясни их по комментариям.',
  'Сравни органический рост и влияние курсов за последний год.'
];

const CONTEXT_PRESETS = [
  { value: '1', label: '1M', filter: { months: 1 } },
  { value: '2', label: '2M', filter: { months: 2 } },
  { value: '3', label: '3M', filter: { months: 3 } },
  { value: '6', label: '6M', filter: { months: 6 } },
  { value: '12', label: '1Y', filter: { months: 12 } },
  { value: '24', label: '2Y', filter: { months: 24 } },
  { value: 'all', label: 'ALL', filter: {} }
] as const;
const CONTEXT_PRESET_LABELS = CONTEXT_PRESETS.map(preset => preset.label);
const RESPONSE_STYLES: Array<{ value: AIResponseStyle; label: string }> = [
  { value: 'strict', label: 'Strict' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'playful', label: 'Playful' }
];
const RESPONSE_STYLE_LABELS = RESPONSE_STYLES.map(style => style.label);

type ContextPreset = typeof CONTEXT_PRESETS[number]['value'] | 'custom';
const DEFAULT_CONTEXT_FILTER: LocalAIContextFilter = { months: 12 };
const CHAT_STORAGE_KEY = 'finn-ai-chat-v1';
const MAX_STORED_MESSAGES = 100;

type StoredChat = {
  messages: ChatMessage[];
  draft: string;
  contextPreset: ContextPreset;
  contextFilter: LocalAIContextFilter;
  customFromMonth: string;
  customToMonth: string;
  responseStyle: AIResponseStyle;
  hideOrganizations: boolean;
};

const isContextPreset = (value: unknown): value is ContextPreset =>
  value === '1' || value === '2' || value === '3' || value === '6' || value === '12' || value === '24' || value === 'all' || value === 'custom';

const loadStoredChat = (): StoredChat => {
  const fallback: StoredChat = {
    messages: [],
    draft: '',
    contextPreset: '12',
    contextFilter: DEFAULT_CONTEXT_FILTER,
    customFromMonth: '',
    customToMonth: '',
    responseStyle: 'balanced',
    hideOrganizations: false
  };

  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return fallback;
    const stored = JSON.parse(raw) as Partial<StoredChat>;
    const messages = Array.isArray(stored.messages)
      ? stored.messages.filter((message): message is ChatMessage =>
        !!message &&
        typeof message.id === 'string' &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.length > 0
      ).slice(-MAX_STORED_MESSAGES)
      : [];
    const contextFilter = stored.contextFilter && typeof stored.contextFilter === 'object'
      ? stored.contextFilter
      : DEFAULT_CONTEXT_FILTER;

    return {
      messages,
      draft: typeof stored.draft === 'string' ? stored.draft : '',
      contextPreset: isContextPreset(stored.contextPreset) ? stored.contextPreset : '12',
      contextFilter,
      customFromMonth: typeof stored.customFromMonth === 'string' ? stored.customFromMonth : '',
      customToMonth: typeof stored.customToMonth === 'string' ? stored.customToMonth : '',
      responseStyle: stored.responseStyle === 'strict' || stored.responseStyle === 'playful' ? stored.responseStyle : 'balanced',
      hideOrganizations: stored.hideOrganizations === true
    };
  } catch {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    return fallback;
  }
};

const makeMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const formatContextSize = (bytes: number) => {
  if (!bytes) return '0 KB';
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const readResponseError = async (response: Response) => {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
};

export default function AIChat() {
  useEscapeToDashboard();
  const restoredChat = useMemo(loadStoredChat, []);
  const [status, setStatus] = useState<LocalAIStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>(restoredChat.messages);
  const [draft, setDraft] = useState(restoredChat.draft);
  const [generating, setGenerating] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [contextPreset, setContextPreset] = useState<ContextPreset>(restoredChat.contextPreset);
  const [contextFilter, setContextFilter] = useState<LocalAIContextFilter>(restoredChat.contextFilter);
  const [customFromMonth, setCustomFromMonth] = useState(restoredChat.customFromMonth);
  const [customToMonth, setCustomToMonth] = useState(restoredChat.customToMonth);
  const [responseStyle, setResponseStyle] = useState<AIResponseStyle>(restoredChat.responseStyle);
  const [hideOrganizations, setHideOrganizations] = useState(restoredChat.hideOrganizations);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [showContextPreview, setShowContextPreview] = useState(false);
  const [contextPreview, setContextPreview] = useState<LocalAIContextPreview | null>(null);
  const [contextPreviewLoading, setContextPreviewLoading] = useState(false);
  const [contextPreviewError, setContextPreviewError] = useState('');
  const [contextPreviewIncludesRequest, setContextPreviewIncludesRequest] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const statusRequestIdRef = useRef(0);
  const responseIdRef = useRef('');
  const messagesListRef = useRef<HTMLDivElement | null>(null);
  const followOutputRef = useRef(true);
  const autoScrollFrameRef = useRef<number | null>(null);
  const lastUserScrollDirectionRef = useRef(0);
  const jumpingToLatestRef = useRef(false);
  const initialContextFilterRef = useRef(restoredChat.contextFilter);
  const initialHideOrganizationsRef = useRef(restoredChat.hideOrganizations);

  const refreshStatus = async (filter = contextFilter, hideOrganizationNames = hideOrganizations) => {
    const requestId = ++statusRequestIdRef.current;
    setStatusLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.months) params.set('months', String(filter.months));
      if (filter.fromMonth) params.set('fromMonth', filter.fromMonth);
      if (filter.toMonth) params.set('toMonth', filter.toMonth);
      if (hideOrganizationNames) params.set('hideOrganizations', 'true');
      const query = params.size > 0 ? `?${params.toString()}` : '';
      const response = await fetch(`${API_URL}/ai/status${query}`);
      if (!response.ok) throw new Error(await readResponseError(response));
      const nextStatus = await response.json() as LocalAIStatus;
      if (requestId === statusRequestIdRef.current) setStatus(nextStatus);
    } catch (statusError) {
      if (requestId !== statusRequestIdRef.current) return;
      setStatus({
        enabled: true,
        connected: false,
        baseUrl: 'http://127.0.0.1:1234/v1',
        selectedModel: '',
        models: [],
        snapshotCount: 0,
        contextBytes: 0,
        dataFingerprint: '',
        availableMonths: [],
        error: statusError instanceof Error ? statusError.message : 'Failed to check local AI'
      });
    } finally {
      if (requestId === statusRequestIdRef.current) setStatusLoading(false);
    }
  };

  useEffect(() => {
    void refreshStatus(initialContextFilterRef.current, initialHideOrganizationsRef.current);
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const storedMessages = generating && messages.at(-1)?.role === 'assistant'
      ? messages.slice(0, -1)
      : messages;
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
        messages: storedMessages.slice(-MAX_STORED_MESSAGES),
        draft,
        contextPreset,
        contextFilter,
        customFromMonth,
        customToMonth,
        responseStyle,
        hideOrganizations
      } satisfies StoredChat));
    } catch {
      // Chat persistence is best-effort; an unavailable/full local storage must not break the assistant.
    }
  }, [contextFilter, contextPreset, customFromMonth, customToMonth, draft, generating, hideOrganizations, messages, responseStyle]);

  useEffect(() => {
    if (!followOutputRef.current) return;
    if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current);
    autoScrollFrameRef.current = window.requestAnimationFrame(() => {
      autoScrollFrameRef.current = null;
      const container = messagesListRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => {
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, [messages, thinking]);

  const statusLabel = useMemo(() => {
    if (statusLoading) return 'Checking LM Studio…';
    if (!status?.enabled) return 'Local AI disabled';
    if (!status.connected) return 'LM Studio unavailable';
    return status.selectedModel || 'Connected';
  }, [status, statusLoading]);

  const replaceAssistantMessage = (id: string, content: string) => {
    setMessages(current => current.map(message => message.id === id ? { ...message, content } : message));
  };

  const prepareForContextChange = () => {
    abortRef.current?.abort();
    responseIdRef.current = '';
    setError('');
  };

  const applyContextFilter = (filter: LocalAIContextFilter, preset: ContextPreset) => {
    prepareForContextChange();
    setContextFilter(filter);
    setContextPreset(preset);
    void refreshStatus(filter);
  };

  const updateCustomRange = (fromMonth: string, toMonth: string) => {
    let normalizedTo = toMonth;
    if (fromMonth && normalizedTo && normalizedTo < fromMonth) normalizedTo = fromMonth;
    setCustomFromMonth(fromMonth);
    setCustomToMonth(normalizedTo);
    applyContextFilter({ fromMonth: fromMonth || undefined, toMonth: normalizedTo || undefined }, 'custom');
  };

  const pauseOutputFollowing = () => {
    jumpingToLatestRef.current = false;
    followOutputRef.current = false;
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    setShowJumpToLatest(true);
  };

  const handleMessagesWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) {
      lastUserScrollDirectionRef.current = -1;
      pauseOutputFollowing();
    } else if (event.deltaY > 0) {
      lastUserScrollDirectionRef.current = 1;
    }
  };

  const handleMessagesScroll = () => {
    const container = messagesListRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (jumpingToLatestRef.current) {
      if (distanceFromBottom < 8) jumpingToLatestRef.current = false;
      return;
    }
    if (followOutputRef.current && distanceFromBottom >= 72) {
      pauseOutputFollowing();
      return;
    }
    if (!followOutputRef.current && lastUserScrollDirectionRef.current > 0 && distanceFromBottom < 8) {
      followOutputRef.current = true;
      lastUserScrollDirectionRef.current = 0;
      setShowJumpToLatest(false);
    }
  };

  const applyPreset = (filter: LocalAIContextFilter, preset: ContextPreset) => {
    setCustomFromMonth('');
    setCustomToMonth('');
    applyContextFilter(filter, preset);
  };

  const scrollToLatest = () => {
    const container = messagesListRef.current;
    if (!container) return;
    jumpingToLatestRef.current = true;
    followOutputRef.current = true;
    lastUserScrollDirectionRef.current = 0;
    setShowJumpToLatest(false);
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  };

  const openContextPreview = async (requestText = '') => {
    const includeRequest = !status?.connected && !!requestText.trim();
    setShowContextPreview(true);
    setContextPreviewLoading(true);
    setContextPreviewError('');
    setContextPreviewIncludesRequest(includeRequest);
    try {
      const params = new URLSearchParams({ responseStyle });
      if (contextFilter.months) params.set('months', String(contextFilter.months));
      if (contextFilter.fromMonth) params.set('fromMonth', contextFilter.fromMonth);
      if (contextFilter.toMonth) params.set('toMonth', contextFilter.toMonth);
      if (hideOrganizations) params.set('hideOrganizations', 'true');
      const response = await fetch(`${API_URL}/ai/context?${params.toString()}`);
      if (!response.ok) throw new Error(await readResponseError(response));
      const nextPreview = await response.json() as LocalAIContextPreview;
      if (includeRequest) {
        const prompt = `${nextPreview.prompt}\n\n<USER_REQUEST>\n${requestText.trim()}\n</USER_REQUEST>`;
        setContextPreview({ ...nextPreview, prompt, bytes: prompt.length });
      } else {
        setContextPreview(nextPreview);
      }
    } catch (previewError) {
      setContextPreviewError(previewError instanceof Error ? previewError.message : 'Failed to prepare context');
    } finally {
      setContextPreviewLoading(false);
    }
  };

  const handleResponseStyleChange = (label: string) => {
    const style = RESPONSE_STYLES.find(candidate => candidate.label === label)?.value;
    if (!style || style === responseStyle) return;
    responseIdRef.current = '';
    setResponseStyle(style);
    setError('');
  };

  const handleHideOrganizationsChange = (hidden: boolean) => {
    prepareForContextChange();
    setHideOrganizations(hidden);
    void refreshStatus(contextFilter, hidden);
  };

  const sendMessage = async (text = draft) => {
    const content = text.trim();
    if (!content || generating || !status?.connected) return;

    const userMessage: ChatMessage = { id: makeMessageId(), role: 'user', content };
    const assistantMessage: ChatMessage = { id: makeMessageId(), role: 'assistant', content: '' };
    const history = [...messages, userMessage];
    setMessages([...history, assistantMessage]);
    setDraft('');
    setError('');
    setGenerating(true);
    setThinking(false);
    followOutputRef.current = true;
    jumpingToLatestRef.current = false;
    setShowJumpToLatest(false);

    const controller = new AbortController();
    abortRef.current = controller;
    let answer = '';
    let eventBuffer = '';
    let renderTimer: number | null = null;
    const queueAnswerRender = () => {
      if (renderTimer !== null) return;
      renderTimer = window.setTimeout(() => {
        renderTimer = null;
        replaceAssistantMessage(assistantMessage.id, answer);
      }, 100);
    };

    try {
      const response = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(message => ({ role: message.role, content: message.content })),
          responseId: responseIdRef.current,
          dataFingerprint: status.dataFingerprint,
          context: { ...contextFilter, hideOrganizations },
          responseStyle
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(await readResponseError(response));
      if (!response.body) throw new Error('Local AI returned an empty stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        eventBuffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !done });
        const events = eventBuffer.split(/\r?\n\r?\n/);
        eventBuffer = events.pop() || '';

        for (const event of events) {
          const data = event
            .split(/\r?\n/)
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trimStart())
            .join('\n');
          if (!data || data === '[DONE]') continue;
          try {
            const payload = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
              finn?: { responseId?: string; phase?: string };
              error?: string;
            };
            if (payload.finn?.phase === 'reading' && !answer) setThinking(true);
            if (payload.finn?.responseId) responseIdRef.current = payload.finn.responseId;
            if (payload.error) {
              setError(payload.error);
              if (!answer) replaceAssistantMessage(assistantMessage.id, `Could not get an answer: ${payload.error}`);
            }
            const delta = payload.choices?.[0]?.delta;
            if (delta?.reasoning_content && !answer) setThinking(true);
            if (delta?.content) {
              setThinking(false);
              answer += delta.content;
              queueAnswerRender();
            }
          } catch {
            // Ignore non-JSON keepalive events from compatible local servers.
          }
        }
      }
      if (!answer) {
        answer = 'The model finished without returning a visible answer.';
        replaceAssistantMessage(assistantMessage.id, answer);
      } else {
        if (renderTimer !== null) window.clearTimeout(renderTimer);
        renderTimer = null;
        replaceAssistantMessage(assistantMessage.id, answer);
      }
    } catch (sendError) {
      if (sendError instanceof DOMException && sendError.name === 'AbortError') {
        if (!answer) replaceAssistantMessage(assistantMessage.id, 'Generation stopped.');
      } else {
        const message = sendError instanceof Error ? sendError.message : 'Local AI request failed';
        setError(message);
        replaceAssistantMessage(assistantMessage.id, answer || `Could not get an answer: ${message}`);
      }
    } finally {
      if (renderTimer !== null) window.clearTimeout(renderTimer);
      if (answer) replaceAssistantMessage(assistantMessage.id, answer);
      abortRef.current = null;
      setThinking(false);
      setGenerating(false);
    }
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (status?.connected) void sendMessage();
    else void openContextPreview(draft);
  };

  const stopGeneration = () => abortRef.current?.abort();

  const resetChat = () => {
    abortRef.current?.abort();
    responseIdRef.current = '';
    followOutputRef.current = true;
    jumpingToLatestRef.current = false;
    setShowJumpToLatest(false);
    setMessages([]);
    setDraft('');
    setError('');
  };

  const firstAvailableMonth = status?.availableMonths?.[0] || '';
  const lastAvailableMonth = status?.availableMonths?.[status.availableMonths.length - 1] || '';
  const selectedContextLabel = CONTEXT_PRESETS.find(preset => preset.value === contextPreset)?.label || 'Custom';
  const selectedResponseStyleLabel = RESPONSE_STYLES.find(style => style.value === responseStyle)?.label || 'Balanced';
  const selectedStartMonth = contextPreset === 'custom'
    ? customFromMonth
    : contextFilter.months
      ? status?.availableMonths?.[Math.max(0, status.availableMonths.length - contextFilter.months)] || firstAvailableMonth
      : firstAvailableMonth;
  const selectedEndMonth = contextPreset === 'custom' ? customToMonth : lastAvailableMonth;

  const handleContextPresetLabelChange = (label: string) => {
    const preset = CONTEXT_PRESETS.find(candidate => candidate.label === label);
    if (preset) applyPreset({ ...preset.filter }, preset.value);
  };

  return (
    <div className="ai-chat-page">
      <StickyPageHeader marginBottom="0" compactTop>
        <div className="flex items-center gap-4">
          <Link to="/" className="btn" title="Back to dashboard"><ArrowLeft size={18} /></Link>
          <div className="ai-chat-heading-title">
            <div className="flex items-center gap-2">
              <Sparkles size={22} color="var(--accent)" />
              <h2>Finn Assistant</h2>
            </div>
            <p>Private analysis powered by your local model.</p>
          </div>
        </div>
        <div className="ai-chat-header-actions">
          {!!status?.availableMonths.length && (
            <div className="ai-timeframe-control">
              <span>Context:</span>
              <SearchableSelect
                value={selectedContextLabel}
                onChange={handleContextPresetLabelChange}
                options={CONTEXT_PRESET_LABELS}
                placeholder="Period"
                showSearch={false}
                width="84px"
                dropdownWidth="96px"
                disabled={generating || statusLoading}
              />
              <SearchableSelect
                value={selectedStartMonth}
                onChange={value => updateCustomRange(value, selectedEndMonth)}
                options={status.availableMonths}
                placeholder="Start"
                disabled={generating || statusLoading}
              />
              <span className="ai-timeframe-arrow">➔</span>
              <SearchableSelect
                value={selectedEndMonth}
                onChange={value => updateCustomRange(selectedStartMonth, value)}
                options={status.availableMonths.filter(month => !selectedStartMonth || month >= selectedStartMonth)}
                placeholder="End"
                disabled={generating || statusLoading}
              />
            </div>
          )}
          <button className="btn" onClick={() => void refreshStatus(contextFilter)} disabled={statusLoading || generating} title="Refresh connection">
            <RefreshCw size={16} className={statusLoading ? 'ai-spin' : ''} />
          </button>
          <button className="btn" onClick={resetChat} disabled={messages.length === 0 && !generating}>
            <RotateCcw size={16} /> New chat
          </button>
        </div>
      </StickyPageHeader>

      <div className={`ai-status-card ${status?.connected ? 'is-connected' : 'is-prompt-only'}`}>
        <div className="ai-status-main">
          {status?.connected ? <Server size={17} /> : <Braces size={17} color="#93c5fd" />}
          <strong>{statusLabel}</strong>
          <span className={status?.connected ? undefined : 'ai-prompt-only-badge'}>
            {!status?.connected && <Sparkles size={11} />}
            {status?.connected ? 'Local · private' : 'Prompt-only'}
          </span>
        </div>
        {!!status && !statusLoading && (
          <div className="ai-status-controls">
            <div className="ai-status-meta">
              <span>{status.snapshotCount} of {status.availableMonths.length} snapshots</span>
              <span>{formatContextSize(status.contextBytes)} context</span>
              <span>data {status.dataFingerprint}</span>
            </div>
            <div className="ai-response-style-control">
              <span>Tone:</span>
              <SearchableSelect
                value={selectedResponseStyleLabel}
                onChange={handleResponseStyleChange}
                options={RESPONSE_STYLE_LABELS}
                placeholder="Tone"
                showSearch={false}
                width="92px"
                dropdownWidth="110px"
                disabled={generating}
              />
            </div>
            <label className="ai-hide-organizations-control" title="Replace organization names with Organization1, Organization2, and so on">
              <input
                type="checkbox"
                checked={hideOrganizations}
                onChange={event => handleHideOrganizationsChange(event.target.checked)}
                disabled={generating || contextPreviewLoading}
              />
              <span>Hide organizations</span>
            </label>
            <button
              className="btn ai-view-context"
              onClick={() => void openContextPreview(status.connected ? '' : draft)}
              disabled={contextPreviewLoading}
            >
              <Braces size={15} /> {status.connected ? 'View context' : 'View prompt'}
            </button>
          </div>
        )}
      </div>

      <div className="glass-panel ai-chat-shell">
          <div
            ref={messagesListRef}
            className="ai-message-list"
            aria-live="polite"
            onScroll={handleMessagesScroll}
            onWheel={handleMessagesWheel}
            onTouchStart={() => {
              lastUserScrollDirectionRef.current = -1;
              pauseOutputFollowing();
            }}
          >
            {messages.length === 0 ? (
              <div className="ai-welcome">
                <div className="ai-welcome-icon"><Bot size={30} /></div>
                <h3>Ask about your financial history</h3>
                {status?.connected ? (
                  <p>Finn sends your snapshots and precomputed metrics directly to the local model. Nothing is sent to a cloud provider.</p>
                ) : (
                  <div className="ai-prompt-only-notice">
                    <AlertCircle size={19} aria-hidden="true" />
                    <p>No local model is connected. Choose context and tone, write a request, then copy the prepared prompt into ChatGPT, Claude, Gemini, or another AI service. Review the included financial data before sharing it.</p>
                  </div>
                )}
                <div className="ai-suggestions">
                  {suggestions.map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => status?.connected ? void sendMessage(suggestion) : void openContextPreview(suggestion)}
                      disabled={generating || statusLoading}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : messages.map(message => (
              <div key={message.id} className={`ai-message-row is-${message.role}`}>
                <div className="ai-message-avatar">
                  {message.role === 'assistant' ? <Bot size={17} /> : <User size={17} />}
                </div>
                <div className="ai-message-bubble">
                  {message.content ? (
                    message.role === 'assistant' ? (
                      <div className="ai-markdown">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : message.content
                  ) : thinking ? (
                    <div className="ai-thinking" role="status" aria-label="Model is thinking">
                      <span className="ai-thinking-glow" aria-hidden="true" />
                      <span>Thinking</span>
                      <span className="ai-thinking-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  ) : '…'}
                </div>
              </div>
            ))}
          </div>

          {showJumpToLatest && (
            <button className="btn ai-jump-to-latest" onClick={scrollToLatest}>
              <ArrowDown size={15} /> Latest
            </button>
          )}

          {error && <div className="ai-chat-error">{error}</div>}

          <div className="ai-composer">
            <textarea
              className="input"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={handleDraftKeyDown}
              placeholder="Ask Finn about your snapshots…"
              rows={3}
              disabled={generating}
            />
            {generating ? (
              <button className="btn btn-danger ai-send-button" onClick={stopGeneration} title="Stop generation">
                <CircleStop size={18} />
              </button>
            ) : (
              <button
                className="btn btn-primary ai-send-button"
                onClick={() => status?.connected ? void sendMessage() : void openContextPreview(draft)}
                disabled={statusLoading}
                title={status?.connected ? 'Send' : 'View prompt'}
              >
                {status?.connected ? <Send size={18} /> : <Braces size={18} />}
              </button>
            )}
          </div>
          <div className="ai-composer-hint">
            {status?.connected
              ? 'Enter to send · Shift+Enter for a new line · answers may contain mistakes'
              : 'Enter to preview prompt · Shift+Enter for a new line · no model connection required'}
          </div>
        </div>

      {showContextPreview && (
        <AIContextPreviewModal
          preview={contextPreview}
          loading={contextPreviewLoading}
          error={contextPreviewError}
          includesRequest={contextPreviewIncludesRequest}
          onClose={() => setShowContextPreview(false)}
        />
      )}
    </div>
  );
}
