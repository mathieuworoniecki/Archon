import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, FileText, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/contexts/I18nContext'

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



export function ChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [contexts, setContexts] = useState<DocumentContext[]>([])
    const [isStreaming, setIsStreaming] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const sessionIdRef = useRef<string>(crypto.randomUUID())
    const { t } = useTranslation()

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages])

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return

        const userMessage: ChatMessage = {
            role: 'user',
            content: input,
            timestamp: new Date().toISOString()
        }

        const currentInput = input
        setMessages(prev => [...prev, userMessage])
        setInput('')
        setIsLoading(true)
        setIsStreaming(false)

        // Add empty assistant message that we'll stream into
        const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString()
        }
        setMessages(prev => [...prev, assistantMessage])

        try {
            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Id': sessionIdRef.current,
                },
                body: JSON.stringify({
                    message: currentInput,
                    use_rag: true,
                    context_limit: 5,
                    include_history: true
                })
            })

            if (!response.ok || !response.body) {
                setMessages(prev => {
                    const updated = [...prev]
                    updated[updated.length - 1] = { ...updated[updated.length - 1], content: t('chat.errorComm') }
                    return updated
                })
                return
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    try {
                        const data = JSON.parse(line.slice(6))
                        if (data.token) {
                            if (!isStreaming) setIsStreaming(true)
                            setMessages(prev => {
                                const updated = [...prev]
                                const last = updated[updated.length - 1]
                                updated[updated.length - 1] = {
                                    ...last,
                                    content: last.content + data.token
                                }
                                return updated
                            })
                        }
                        if (data.done) {
                            setContexts(data.contexts || [])
                        }
                    } catch {
                        // Skip malformed JSON
                    }
                }
            }
        } catch (error) {
            console.error('Chat error:', error)
            setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: updated[updated.length - 1].content || t('chat.errorServer')
                }
                return updated
            })
        } finally {
            setIsLoading(false)
            setIsStreaming(false)
        }
    }

    const clearHistory = async () => {
        try {
            await fetch('/api/chat/clear', {
                method: 'POST',
                headers: { 'X-Session-Id': sessionIdRef.current },
            })
            setMessages([])
            setContexts([])
        } catch (error) {
            console.error('Clear error:', error)
        }
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
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Sparkles className="h-6 w-6 text-primary" />
                        <h2 className="text-2xl font-semibold">{t('chat.title')}</h2>
                        <Badge variant="secondary">{t('chat.ragEnabled')}</Badge>
                    </div>
                    <Button variant="outline" size="sm" onClick={clearHistory}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('chat.clear')}
                    </Button>
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
                                            <p className="whitespace-pre-wrap text-sm">
                                                {msg.content || (
                                                    <span className="flex items-center gap-1 text-muted-foreground">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                                                    </span>
                                                )}
                                                {isStreaming && idx === messages.length - 1 && msg.role === 'assistant' && (
                                                    <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
                                                )}
                                            </p>
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

            {/* Context Sidebar */}
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
                            <Card key={idx} className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium truncate" title={ctx.file_name}>
                                        {ctx.file_name}
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                        {Math.round(ctx.relevance_score * 100)}%
                                    </Badge>
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
