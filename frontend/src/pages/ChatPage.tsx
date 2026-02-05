import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, FileText, Trash2, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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

interface ChatResponse {
    response: string
    contexts: DocumentContext[]
    message_count: number
    rag_enabled: boolean
}

export function ChatPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [contexts, setContexts] = useState<DocumentContext[]>([])
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // Scroll to bottom on new messages
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

        setMessages(prev => [...prev, userMessage])
        setInput('')
        setIsLoading(true)

        try {
            const response = await fetch('/api/chat/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: input,
                    use_rag: true,
                    context_limit: 5,
                    include_history: true
                })
            })

            if (response.ok) {
                const data: ChatResponse = await response.json()
                
                const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: data.response,
                    timestamp: new Date().toISOString()
                }
                
                setMessages(prev => [...prev, assistantMessage])
                setContexts(data.contexts)
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: 'Erreur lors de la communication avec l\'assistant.',
                    timestamp: new Date().toISOString()
                }])
            }
        } catch (error) {
            console.error('Chat error:', error)
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Impossible de contacter le serveur.',
                timestamp: new Date().toISOString()
            }])
        } finally {
            setIsLoading(false)
        }
    }

    const clearHistory = async () => {
        try {
            await fetch('/api/chat/clear', { method: 'POST' })
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

    return (
        <div className="h-full flex">
            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Sparkles className="h-6 w-6 text-primary" />
                        <h2 className="text-2xl font-semibold">Assistant IA</h2>
                        <Badge variant="secondary">RAG activé</Badge>
                    </div>
                    <Button variant="outline" size="sm" onClick={clearHistory}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Effacer
                    </Button>
                </div>

                {/* Messages */}
                <Card className="flex-1 mb-4 p-4 overflow-hidden">
                    <ScrollArea className="h-full pr-4">
                        {messages.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-muted-foreground">
                                <div className="text-center">
                                    <Bot className="h-16 w-16 mx-auto mb-4 opacity-20" />
                                    <p className="text-lg font-medium">Assistant d'Investigation</p>
                                    <p className="text-sm mt-2">
                                        Posez des questions sur vos documents.<br/>
                                        L'IA recherchera automatiquement le contexte pertinent.
                                    </p>
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
                                            <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                                        </div>
                                        {msg.role === 'user' && (
                                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                                                <User className="h-4 w-4" />
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex gap-3 justify-start">
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                            <Bot className="h-4 w-4 text-primary" />
                                        </div>
                                        <div className="bg-muted rounded-lg px-4 py-3">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        </div>
                                    </div>
                                )}
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
                        placeholder="Posez une question sur vos documents..."
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
                    <h3 className="font-medium">Documents utilisés</h3>
                </div>
                
                {contexts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Les documents pertinents apparaîtront ici après votre première question.
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
