import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Bot, User, FileText, Trash2, Sparkles, AlertTriangle, RefreshCw, ExternalLink, Plus, MessageSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/contexts/I18nContext'
import { authFetch } from '@/lib/auth'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ── Citation helpers ──

/** Convert [1], [2] etc. in AI text to markdown links that ReactMarkdown can render */
function preprocessCitations(text: string): string {
    return text.replace(/\[(\d+)\]/g, (_match, num) => `[⁺${num}](cite:${num})`)
}

/** Small superscript badge for inline citations */
function CitationBadge({ num, onHover, onClick }: { num: number; onHover: (n: number | null) => void; onClick: (n: number) => void }) {
    return (
        <button
            className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-primary/20 text-primary hover:bg-primary/40 transition-colors align-super mx-0.5 cursor-pointer border-0"
            onMouseEnter={() => onHover(num)}
            onMouseLeave={() => onHover(null)}
            onClick={(e) => { e.stopPropagation(); onClick(num) }}
            title={`Source ${num}`}
        >
            {num}
        </button>
    )
}

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
    timestamp?: string
}

interface DocumentContext {
    document_id: number
    file_name: string
    snippet: string
    relevance_score: number
}

// ── Conversation persistence ──
interface Conversation {
    id: string
    title: string
    messages: ChatMessage[]
    contexts: DocumentContext[]
    createdAt: string
    updatedAt: string
}

const STORAGE_KEY = 'archon-conversations'

function loadConversations(): Conversation[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

function saveConversations(convos: Conversation[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos))
}

function createConversation(): Conversation {
    return {
        id: crypto.randomUUID(),
        title: '',
        messages: [],
        contexts: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }
}

export function ChatPage() {
    const [conversations, setConversations] = useState<Conversation[]>(() => {
        const loaded = loadConversations()
        return loaded.length > 0 ? loaded : [createConversation()]
    })
    const [activeId, setActiveId] = useState<string>(() => {
        const loaded = loadConversations()
        return loaded.length > 0 ? loaded[0].id : conversations[0]?.id || ''
    })
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isStreaming, setIsStreaming] = useState(false)
    const [chatError, setChatError] = useState<string | null>(null)
    const [showSidebar, setShowSidebar] = useState(true)
    const [highlightedSource, setHighlightedSource] = useState<number | null>(null)
    const lastUserInputRef = useRef<string>('')
    const abortControllerRef = useRef<AbortController | null>(null)
    const activeRequestIdRef = useRef(0)
    const scrollRef = useRef<HTMLDivElement>(null)
    const navigate = useNavigate()
    const { t } = useTranslation()

    // Derived state from conversations
    const activeConvo = conversations.find(c => c.id === activeId) || conversations[0]
    const messages = activeConvo?.messages || []
    const contexts = activeConvo?.contexts || []

    // Persist conversations
    useEffect(() => {
        saveConversations(conversations)
    }, [conversations])

    // Auto-scroll on new messages
    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const updateConversation = useCallback((id: string, updates: Partial<Conversation>) => {
        setConversations(prev =>
            prev.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c)
        )
    }, [])

    const cancelActiveRequest = useCallback(() => {
        if (!abortControllerRef.current) return

        activeRequestIdRef.current += 1
        abortControllerRef.current.abort()
        abortControllerRef.current = null
        setIsLoading(false)
        setIsStreaming(false)

        const lastMessage = messages[messages.length - 1]
        if (lastMessage?.role === 'assistant' && !lastMessage.content) {
            updateConversation(activeId, { messages: messages.slice(0, -1) })
        }
    }, [activeId, messages, updateConversation])

    useEffect(() => {
        return () => {
            activeRequestIdRef.current += 1
            abortControllerRef.current?.abort()
            abortControllerRef.current = null
        }
    }, [])

    // Citation callbacks
    const handleCitationHover = useCallback((num: number | null) => {
        setHighlightedSource(num)
    }, [])

    const handleCitationClick = useCallback((num: number) => {
        const idx = num - 1
        if (idx >= 0 && idx < contexts.length) {
            navigate(`/?doc=${contexts[idx].document_id}`)
        }
    }, [contexts, navigate])

    // ReactMarkdown components with citation support
    const markdownComponents = useMemo(() => ({
        p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
        ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
        li: ({ children }: { children?: React.ReactNode }) => <li className="mb-0.5">{children}</li>,
        strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
        code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
            const isBlock = className?.includes('language-')
            return isBlock ? (
                <pre className="bg-background/50 rounded p-2 my-2 overflow-x-auto text-xs"><code>{children}</code></pre>
            ) : (
                <code className="bg-background/50 rounded px-1 py-0.5 text-xs">{children}</code>
            )
        },
        a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
            // Handle citation links (cite:N)
            if (href?.startsWith('cite:')) {
                const num = parseInt(href.replace('cite:', ''), 10)
                if (!isNaN(num)) {
                    return <CitationBadge num={num} onHover={handleCitationHover} onClick={handleCitationClick} />
                }
            }
            return (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">{children}</a>
            )
        },
        h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
        h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-base font-bold mb-1.5">{children}</h2>,
        h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
    }), [handleCitationHover, handleCitationClick])

    const sendMessage = async () => {
        const q = input.trim()
        if (!q || isLoading) return
        setChatError(null)
        lastUserInputRef.current = q
        setInput('')

        const targetConversationId = activeId
        const requestId = activeRequestIdRef.current + 1
        activeRequestIdRef.current = requestId

        abortControllerRef.current?.abort()
        const controller = new AbortController()
        abortControllerRef.current = controller

        const isCurrentRequest = () => activeRequestIdRef.current === requestId
        setIsLoading(true)
        setIsStreaming(true)

        const userMsg: ChatMessage = { role: 'user', content: q, timestamp: new Date().toISOString() }
        const newMessages = [...messages, userMsg]

        // Auto-title: use first user message
        const title = activeConvo?.title || q.slice(0, 50) + (q.length > 50 ? '…' : '')
        updateConversation(targetConversationId, { messages: newMessages, title })

        // Add placeholder for assistant response
        const withPlaceholder = [...newMessages, { role: 'assistant' as const, content: '' }]
        updateConversation(targetConversationId, { messages: withPlaceholder, title })

        try {
            const response = await authFetch('/api/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Id': targetConversationId,
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify({ message: q }),
                signal: controller.signal,
            })

            if (!response.ok) {
                const err = await response.json().catch(() => ({}))
                throw new Error(err.message || err.detail || `Error ${response.status}`)
            }

            const reader = response.body?.getReader()
            if (!reader) {
                throw new Error(t('chat.error'))
            }

            const decoder = new TextDecoder()
            let fullContent = ''
            let newContexts: DocumentContext[] = [...contexts]
            let buffer = ''
            let receivedDone = false

            const asObject = (value: unknown): Record<string, unknown> | null => {
                if (!value || typeof value !== 'object' || Array.isArray(value)) return null
                return value as Record<string, unknown>
            }

            const asContexts = (value: unknown): DocumentContext[] | null => {
                if (!Array.isArray(value)) return null
                return value as DocumentContext[]
            }

            const handleSseEvent = (rawEvent: string) => {
                if (!isCurrentRequest()) return

                let eventName: string | null = null
                const dataLines: string[] = []

                for (const line of rawEvent.split('\n')) {
                    if (!line || line.startsWith(':')) continue
                    if (line.startsWith('event:')) {
                        eventName = line.slice(6).trim()
                    } else if (line.startsWith('data:')) {
                        dataLines.push(line.slice(5).trimStart())
                    }
                }

                const data = dataLines.join('\n')
                if (!data) return
                if (data === '[DONE]') {
                    receivedDone = true
                    return
                }

                let payload: Record<string, unknown> | null = null
                try {
                    payload = asObject(JSON.parse(data))
                } catch {
                    if (eventName !== 'token') return
                }

                const payloadType = typeof payload?.type === 'string' ? payload.type : null
                let tokenChunk = ''
                let contextsUpdate: DocumentContext[] | null = null
                let doneEvent = false

                if (eventName === 'token') {
                    if (typeof payload?.token === 'string') {
                        tokenChunk = payload.token
                    } else if (typeof payload?.content === 'string') {
                        tokenChunk = payload.content
                    } else if (!payload) {
                        tokenChunk = data
                    }
                } else if (eventName === 'contexts') {
                    contextsUpdate = asContexts(payload?.contexts) || asContexts(payload?.documents)
                } else if (eventName === 'done') {
                    doneEvent = true
                    contextsUpdate = asContexts(payload?.contexts) || asContexts(payload?.documents)
                }

                if (!tokenChunk) {
                    if (typeof payload?.token === 'string') {
                        tokenChunk = payload.token
                    } else if (payloadType === 'token' && typeof payload?.content === 'string') {
                        tokenChunk = payload.content
                    }
                }

                if (!contextsUpdate) {
                    contextsUpdate =
                        asContexts(payload?.contexts) ||
                        asContexts(payload?.documents) ||
                        (payloadType === 'sources' ? asContexts(payload?.documents) : null) ||
                        (payloadType === 'contexts' ? asContexts(payload?.contexts) : null)
                }

                if (!doneEvent) {
                    doneEvent = payload?.done === true || payloadType === 'done'
                }

                if (tokenChunk) {
                    fullContent += tokenChunk
                    const updatedMsgs = [...newMessages, { role: 'assistant' as const, content: fullContent }]
                    updateConversation(targetConversationId, { messages: updatedMsgs })
                }

                if (contextsUpdate) {
                    newContexts = contextsUpdate
                    updateConversation(targetConversationId, { contexts: newContexts })
                }

                if (doneEvent) {
                    receivedDone = true
                }
            }

            const flushBuffer = (flushRemainder = false) => {
                buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

                let separatorIndex = buffer.indexOf('\n\n')
                while (separatorIndex !== -1) {
                    const rawEvent = buffer.slice(0, separatorIndex)
                    buffer = buffer.slice(separatorIndex + 2)
                    if (rawEvent.trim()) {
                        handleSseEvent(rawEvent)
                    }
                    if (receivedDone || !isCurrentRequest()) return
                    separatorIndex = buffer.indexOf('\n\n')
                }

                if (flushRemainder && buffer.trim()) {
                    handleSseEvent(buffer)
                    buffer = ''
                }
            }

            while (!receivedDone) {
                const { done, value } = await reader.read()

                if (!isCurrentRequest()) {
                    await reader.cancel().catch(() => undefined)
                    return
                }

                if (done) {
                    buffer += decoder.decode()
                    flushBuffer(true)
                    break
                }

                buffer += decoder.decode(value, { stream: true })
                flushBuffer()
            }

            if (receivedDone) {
                await reader.cancel().catch(() => undefined)
            }

            if (!isCurrentRequest()) return
            const finalMessages = [...newMessages, { role: 'assistant' as const, content: fullContent }]
            updateConversation(targetConversationId, { messages: finalMessages, contexts: newContexts })
        } catch (err) {
            if (!isCurrentRequest()) return
            if (err instanceof DOMException && err.name === 'AbortError') {
                updateConversation(targetConversationId, { messages: newMessages })
                return
            }
            const errorMsg = err instanceof Error ? err.message : t('chat.error')
            setChatError(errorMsg)
            // Remove placeholder on error
            updateConversation(targetConversationId, { messages: newMessages })
        } finally {
            if (isCurrentRequest()) {
                setIsLoading(false)
                setIsStreaming(false)
                abortControllerRef.current = null
            }
        }
    }

    const handleNewConversation = () => {
        cancelActiveRequest()
        const newConvo = createConversation()
        setConversations(prev => [newConvo, ...prev])
        setActiveId(newConvo.id)
        setChatError(null)
    }

    const handleDeleteConversation = async (id: string) => {
        if (id === activeId) {
            cancelActiveRequest()
        }

        try {
            await authFetch('/api/chat/clear', {
                method: 'POST',
                headers: { 'X-Session-Id': id },
            })
        } catch { /* best effort */ }

        setConversations(prev => {
            const filtered = prev.filter(c => c.id !== id)
            if (filtered.length === 0) {
                const fresh = createConversation()
                setActiveId(fresh.id)
                return [fresh]
            }
            if (id === activeId) {
                setActiveId(filtered[0].id)
            }
            return filtered
        })
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const suggestions = [
        { icon: '📋', text: t('chat.suggestion1') },
        { icon: '👤', text: t('chat.suggestion2') },
        { icon: '🔗', text: t('chat.suggestion3') },
        { icon: '📅', text: t('chat.suggestion4') },
    ]

    return (
        <div className="h-full flex">
            {/* ═══ Conversation Sidebar ═══ */}
            <div className={cn(
                "border-r bg-card/30 flex flex-col transition-all duration-200",
                showSidebar ? "w-64" : "w-0 overflow-hidden"
            )}>
                <div className="p-3 border-b flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {t('chat.conversations')}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewConversation} title={t('chat.newConversation')}>
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                </div>

                <ScrollArea className="flex-1">
                    <div className="p-1.5 space-y-0.5">
                        {conversations.map(convo => (
                            <div
                                key={convo.id}
                                className={cn(
                                    "group flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors text-sm",
                                    convo.id === activeId
                                        ? "bg-primary/10 text-primary"
                                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                )}
                                onClick={() => {
                                    if (convo.id !== activeId) {
                                        cancelActiveRequest()
                                    }
                                    setActiveId(convo.id)
                                    setChatError(null)
                                }}
                            >
                                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate flex-1 text-xs">
                                    {convo.title || t('chat.newConversation')}
                                </span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteConversation(convo.id) }}
                                    className="hidden group-hover:block shrink-0 text-muted-foreground hover:text-red-500 transition-colors"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            {/* ═══ Main Chat Area ═══ */}
            <div className="flex-1 flex flex-col p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSidebar(!showSidebar)}>
                            {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                        </Button>
                        <Sparkles className="h-6 w-6 text-primary" />
                        <h2 className="text-2xl font-semibold">{t('chat.title')}</h2>
                        <Badge variant="secondary">{t('chat.ragEnabled')}</Badge>
                    </div>
                </div>

                {/* Messages */}
                <Card className="flex-1 mb-4 p-4 overflow-hidden">
                    <ScrollArea className="h-full pr-4">
                        {messages.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                <div className="text-center max-w-md">
                                    <Bot className="h-16 w-16 mx-auto mb-4 opacity-20" />
                                    <p className="text-lg font-medium">{t('chat.investigationAssistant')}</p>
                                    <p className="text-sm mt-2 mb-6">
                                        {t('chat.askAboutDocs')}<br/>
                                        {t('chat.autoContext')}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2 text-left">
                                        {suggestions.map((suggestion, i) => (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    setInput(suggestion.text)
                                                    setTimeout(() => sendMessage(), 100)
                                                }}
                                                className="p-3 text-xs rounded-lg border bg-card/50 hover:bg-accent/50 transition-colors text-left flex items-start gap-2"
                                            >
                                                <span>{suggestion.icon}</span>
                                                <span>{suggestion.text}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {messages.map((msg, idx) => (
                                    <div
                                        key={idx}
                                        className={cn(
                                            "flex gap-3",
                                            msg.role === 'user' ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        {msg.role === 'assistant' && (
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                <Bot className="h-4 w-4 text-primary" />
                                            </div>
                                        )}
                                        <div
                                            className={cn(
                                                "max-w-[80%] rounded-lg px-4 py-3",
                                                msg.role === 'user' 
                                                    ? "bg-primary text-primary-foreground" 
                                                    : "bg-muted"
                                            )}
                                        >
                                            {msg.role === 'assistant' ? (
                                                <div className="text-sm">
                                                    {msg.content ? (
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm]}
                                                            components={markdownComponents}
                                                        >
                                                            {preprocessCitations(msg.content)}
                                                        </ReactMarkdown>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-muted-foreground">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                                                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                                                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                                                        </span>
                                                    )}
                                                    {isStreaming && idx === messages.length - 1 && (
                                                        <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                                            )}
                                        </div>
                                        {msg.role === 'user' && (
                                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                                                <User className="h-4 w-4" />
                                            </div>
                                        )}
                                    </div>
                                ))}

                                <div ref={scrollRef} />
                            </div>
                        )}
                    </ScrollArea>
                </Card>

                {/* Error banner */}
                {chatError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-red-500">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span className="text-sm">{chatError}</span>
                        </div>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-1.5 shrink-0"
                            onClick={() => {
                                setChatError(null)
                                if (lastUserInputRef.current) {
                                    setInput(lastUserInputRef.current)
                                    setTimeout(() => {
                                        const retryInput = lastUserInputRef.current
                                        if (retryInput) {
                                            updateConversation(activeId, {
                                                messages: messages.slice(0, -1)
                                            })
                                            setInput(retryInput)
                                        }
                                    }, 0)
                                }
                            }}
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            {t('common.retry')}
                        </Button>
                    </div>
                )}

                {/* Input */}
                <div className="flex gap-2">
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={t('chat.placeholder')}
                        className="flex-1"
                        disabled={isLoading}
                    />
                    <Button onClick={sendMessage} disabled={isLoading || !input.trim()}>
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* ═══ Context Sidebar ═══ */}
            <div className="w-80 border-l bg-card/30 p-4 overflow-auto">
                <div className="flex items-center gap-2 mb-4">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-medium">{t('chat.usedDocuments')}</h3>
                </div>
                
                {contexts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('chat.docsAfterQuestion')}
                    </p>
                ) : (
                    <div className="space-y-3">
                        {contexts.map((ctx, idx) => (
                            <Card 
                                key={idx} 
                                className={cn(
                                    "p-3 cursor-pointer hover:bg-accent/50 transition-all",
                                    highlightedSource === idx + 1 && "ring-2 ring-primary bg-primary/5"
                                )}
                                onClick={() => navigate(`/?doc=${ctx.document_id}`)}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold shrink-0">
                                            {idx + 1}
                                        </span>
                                        <span className="text-sm font-medium truncate text-primary hover:underline" title={ctx.file_name}>
                                            {ctx.file_name}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Badge variant="outline" className="text-xs">
                                            {Math.round(ctx.relevance_score * 100)}%
                                        </Badge>
                                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-3">
                                    {ctx.snippet}
                                </p>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
