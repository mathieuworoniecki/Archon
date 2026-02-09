import { useState, useCallback, useEffect } from 'react'
import { Star, Trash2, Eye, Filter, Sparkles, Edit3, Loader2, X, Check, Tags, Plus } from 'lucide-react'
import { useFavorites } from '@/hooks/useFavorites'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'
import { removeFavorite, getTags, Tag, updateFavorite, API_BASE } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { useTranslation } from '@/contexts/I18nContext'

export function FavoritesPage() {
    const { favorites, total, isLoading, refetch } = useFavorites()
    const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null)
    const [tags, setTags] = useState<Tag[]>([])
    const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
    const { t } = useTranslation()
    
    // Notes editing state
    const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
    const [editingNoteText, setEditingNoteText] = useState('')
    
    // AI Synthesis state
    const [synthesis, setSynthesis] = useState<string | null>(null)
    const [isSynthesizing, setIsSynthesizing] = useState(false)

    // Fetch tags on mount
    useEffect(() => {
        getTags().then(setTags).catch(console.error)
    }, [])

    const handleRemoveFavorite = useCallback(async (documentId: number) => {
        try {
            await removeFavorite(documentId)
            refetch(selectedTagIds.length > 0 ? selectedTagIds : undefined)
            if (selectedDocumentId === documentId) {
                setSelectedDocumentId(null)
            }
        } catch (err) {
            console.error('Failed to remove favorite:', err)
        }
    }, [refetch, selectedDocumentId, selectedTagIds])

    const toggleTagFilter = useCallback((tagId: number) => {
        setSelectedTagIds(prev => {
            const newIds = prev.includes(tagId)
                ? prev.filter(id => id !== tagId)
                : [...prev, tagId]
            refetch(newIds.length > 0 ? newIds : undefined)
            return newIds
        })
    }, [refetch])

    const startEditingNote = (documentId: number, currentNote: string | null) => {
        setEditingNoteId(documentId)
        setEditingNoteText(currentNote || '')
    }

    const saveNote = async (documentId: number) => {
        try {
            await updateFavorite(documentId, { notes: editingNoteText })
            refetch(selectedTagIds.length > 0 ? selectedTagIds : undefined)
            setEditingNoteId(null)
        } catch (err) {
            console.error('Failed to save note:', err)
        }
    }

    const cancelEditingNote = () => {
        setEditingNoteId(null)
        setEditingNoteText('')
    }

    const toggleFavoriteTag = async (documentId: number, tagId: number, currentTags: Tag[]) => {
        const currentTagIds = currentTags.map(t => t.id)
        const hasTag = currentTagIds.includes(tagId)
        const newTagIds = hasTag
            ? currentTagIds.filter(id => id !== tagId)
            : [...currentTagIds, tagId]
        
        try {
            await updateFavorite(documentId, { tag_ids: newTagIds })
            refetch(selectedTagIds.length > 0 ? selectedTagIds : undefined)
        } catch (err) {
            console.error('Failed to update tags:', err)
        }
    }

    const generateSynthesis = async () => {
        setIsSynthesizing(true)
        try {
            const response = await fetch(`${API_BASE}/favorites/synthesize`, {
                method: 'POST'
            })
            const data = await response.json()
            setSynthesis(data.synthesis)
        } catch (err) {
            console.error('Failed to generate synthesis:', err)
            setSynthesis(t('favorites.synthesisError'))
        } finally {
            setIsSynthesizing(false)
        }
    }

    const getFileTypeIcon = (fileType: string) => {
        switch (fileType) {
            case 'pdf': return '📄'
            case 'image': return '🖼️'
            case 'text': return '📝'
            default: return '📁'
        }
    }

    const formatFileSize = (bytes: number) => {
        if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
        return `${bytes} B`
    }

    if (isLoading && favorites.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="animate-pulse text-muted-foreground">{t('favorites.loadingFavorites')}</div>
            </div>
        )
    }

    return (
        <div className="h-full flex">
            {/* Left Panel - Favorites List */}
            <div className="w-[400px] border-r flex flex-col">
                {/* Header */}
                <div className="p-4 border-b bg-card/30">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                            <h2 className="font-semibold">{t('favorites.title')}</h2>
                            <Badge variant="secondary">{total}</Badge>
                        </div>
                        
                        {/* AI Synthesis Button */}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={generateSynthesis}
                            disabled={isSynthesizing || favorites.length === 0}
                            className="gap-1.5"
                        >
                            {isSynthesizing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Sparkles className="h-4 w-4" />
                            )}
                            {t('favorites.synthesize')}
                        </Button>
                    </div>

                    {/* Tag Filters */}
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            <Filter className="h-4 w-4 text-muted-foreground mr-1" />
                            {tags.map(tag => (
                                <Badge
                                    key={tag.id}
                                    variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
                                    className="cursor-pointer transition-colors"
                                    style={{
                                        backgroundColor: selectedTagIds.includes(tag.id) ? tag.color : undefined,
                                        borderColor: tag.color
                                    }}
                                    onClick={() => toggleTagFilter(tag.id)}
                                >
                                    {tag.name}
                                    {tag.favorite_count !== undefined && (
                                        <span className="ml-1 opacity-70">({tag.favorite_count})</span>
                                    )}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>

                {/* AI Synthesis Display */}
                {synthesis && (
                    <div className="p-3 border-b bg-primary/5">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Sparkles className="h-4 w-4 text-primary" />
                                {t('favorites.synthesisTitle')}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => setSynthesis(null)}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto">
                            {synthesis}
                        </div>
                    </div>
                )}

                {/* Favorites List */}
                <ScrollArea className="flex-1">
                    {favorites.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <Star className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p className="font-medium">{t('favorites.noFavorites')}</p>
                            <p className="text-sm mt-1">
                                {selectedTagIds.length > 0 
                                    ? t('favorites.noFavoritesWithTags')
                                    : t('favorites.addToFavorites')
                                }
                            </p>
                        </div>
                    ) : (
                        <div className="p-2 space-y-2">
                            {favorites.map(fav => (
                                <Card
                                    key={fav.id}
                                    className={cn(
                                        "cursor-pointer transition-all hover:bg-accent/50",
                                        selectedDocumentId === fav.document_id && "ring-2 ring-primary bg-accent"
                                    )}
                                    onClick={() => setSelectedDocumentId(fav.document_id)}
                                >
                                    <CardContent className="p-3">
                                        <div className="flex items-start gap-3">
                                            <span className="text-2xl">
                                                {getFileTypeIcon(fav.document?.file_type ?? 'unknown')}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium truncate">
                                                    {fav.document?.file_name ?? t('favorites.unknownDoc')}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {fav.document?.file_path}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                                                    <span>{formatFileSize(fav.document?.file_size ?? 0)}</span>
                                                    <span>•</span>
                                                    <span>{t('favorites.added')} {new Date(fav.created_at).toLocaleDateString()}</span>
                                                </div>
                                                
                                                {/* Tags */}
                                                <div className="flex flex-wrap items-center gap-1 mt-2">
                                                    {fav.tags && fav.tags.map(tag => (
                                                        <Badge
                                                            key={tag.id}
                                                            variant="outline"
                                                            className="text-xs px-1.5 py-0"
                                                            style={{ borderColor: tag.color, color: tag.color }}
                                                        >
                                                            {tag.name}
                                                        </Badge>
                                                    ))}
                                                    
                                                    {/* Add/Edit Tags Button */}
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-5 w-5 p-0 opacity-50 hover:opacity-100"
                                                                onClick={e => e.stopPropagation()}
                                                            >
                                                                <Plus className="h-3 w-3" />
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent 
                                                            className="w-48 p-2" 
                                                            align="start"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <div className="flex items-center gap-2 mb-2 pb-2 border-b">
                                                                <Tags className="h-4 w-4" />
                                                                <span className="text-sm font-medium">{t('favorites.tags')}</span>
                                                            </div>
                                                            {tags.length === 0 ? (
                                                                <p className="text-xs text-muted-foreground">{t('favorites.noTags')}</p>
                                                            ) : (
                                                                <div className="space-y-1">
                                                                    {tags.map(tag => {
                                                                        const isSelected = fav.tags?.some(t => t.id === tag.id)
                                                                        return (
                                                                            <div
                                                                                key={tag.id}
                                                                                className="flex items-center gap-2 p-1 rounded hover:bg-accent cursor-pointer"
                                                                                onClick={() => toggleFavoriteTag(fav.document_id, tag.id, fav.tags || [])}
                                                                            >
                                                                                <Checkbox checked={isSelected} />
                                                                                <div
                                                                                    className="w-3 h-3 rounded-full"
                                                                                    style={{ backgroundColor: tag.color }}
                                                                                />
                                                                                <span className="text-sm">{tag.name}</span>
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            )}
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>

                                                {/* Notes - View or Edit */}
                                                {editingNoteId === fav.document_id ? (
                                                    <div className="mt-2" onClick={e => e.stopPropagation()}>
                                                        <Textarea
                                                            value={editingNoteText}
                                                            onChange={e => setEditingNoteText(e.target.value)}
                                                            placeholder={t('favorites.addNote')}
                                                            className="text-xs min-h-[60px]"
                                                        />
                                                        <div className="flex gap-1 mt-1">
                                                            <Button
                                                                size="sm"
                                                                className="h-6 text-xs"
                                                                onClick={() => saveNote(fav.document_id)}
                                                            >
                                                                <Check className="h-3 w-3 mr-1" />
                                                                {t('favorites.save')}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-6 text-xs"
                                                                onClick={cancelEditingNote}
                                                            >
                                                                {t('favorites.cancel')}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div 
                                                        className="mt-2 group/note cursor-text"
                                                        onClick={e => {
                                                            e.stopPropagation()
                                                            startEditingNote(fav.document_id, fav.notes)
                                                        }}
                                                    >
                                                        {fav.notes ? (
                                                            <p className="text-xs text-muted-foreground italic line-clamp-2 hover:bg-muted/50 rounded p-1 -m-1">
                                                                "{fav.notes}"
                                                            </p>
                                                        ) : (
                                                            <p className="text-xs text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1">
                                                                <Edit3 className="h-3 w-3" />
                                                                {t('favorites.addNote')}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Actions */}
                                            <div className="flex flex-col gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setSelectedDocumentId(fav.document_id)
                                                    }}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleRemoveFavorite(fav.document_id)
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>

            {/* Right Panel - Document Viewer */}
            <div className="flex-1 bg-card/20">
                <DocumentViewer documentId={selectedDocumentId} />
            </div>
        </div>
    )
}
