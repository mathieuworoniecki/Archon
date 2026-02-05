import { useState, useCallback } from 'react'
import { Star, Trash2, Eye, Filter } from 'lucide-react'
import { useFavorites } from '@/hooks/useFavorites'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'
import { removeFavorite, getTags, Tag } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'

export function FavoritesPage() {
    const { favorites, total, isLoading, refetch } = useFavorites()
    const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null)
    const [tags, setTags] = useState<Tag[]>([])
    const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])

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
                <div className="animate-pulse text-muted-foreground">Chargement des favoris...</div>
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
                            <h2 className="font-semibold">Mes Favoris</h2>
                            <Badge variant="secondary">{total}</Badge>
                        </div>
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

                {/* Favorites List */}
                <ScrollArea className="flex-1">
                    {favorites.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <Star className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <p className="font-medium">Aucun favori</p>
                            <p className="text-sm mt-1">
                                {selectedTagIds.length > 0 
                                    ? "Aucun favori avec ces étiquettes" 
                                    : "Ajoutez des documents à vos favoris pour les retrouver ici"
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
                                                    {fav.document?.file_name ?? 'Document inconnu'}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {fav.document?.file_path}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                                                    <span>{formatFileSize(fav.document?.file_size ?? 0)}</span>
                                                    <span>•</span>
                                                    <span>Ajouté {new Date(fav.created_at).toLocaleDateString()}</span>
                                                </div>
                                                
                                                {/* Tags */}
                                                {fav.tags && fav.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {fav.tags.map(tag => (
                                                            <Badge
                                                                key={tag.id}
                                                                variant="outline"
                                                                className="text-xs px-1.5 py-0"
                                                                style={{ borderColor: tag.color, color: tag.color }}
                                                            >
                                                                {tag.name}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Notes */}
                                                {fav.notes && (
                                                    <p className="text-xs text-muted-foreground mt-2 italic line-clamp-2">
                                                        "{fav.notes}"
                                                    </p>
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
