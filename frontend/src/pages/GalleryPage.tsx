import { useState, useEffect } from 'react'
import { Image as ImageIcon, Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { GalleryView } from '@/components/gallery/GalleryView'
import { Document, API_BASE } from '@/lib/api'

export function GalleryPage() {
    const [documents, setDocuments] = useState<Document[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchInput, setSearchInput] = useState('')

    // Load all media documents
    useEffect(() => {
        const fetchMedia = async () => {
            setIsLoading(true)
            try {
                // Fetch images
                const response = await fetch(`${API_BASE}/documents/?file_types=image&limit=200`)
                if (response.ok) {
                    const data = await response.json()
                    setDocuments(data.documents || [])
                }
            } catch (err) {
                console.error('Failed to fetch media:', err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchMedia()
    }, [])

    // Search media with OCR text
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!searchInput.trim()) {
            // Reset to all media
            setSearchQuery('')
            return
        }
        setIsLoading(true)
        try {
            const response = await fetch(`${API_BASE}/search/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: searchInput,
                    file_types: ['image'],
                    limit: 100
                })
            })
            if (response.ok) {
                const data = await response.json()
                // Extract document IDs and fetch full documents
                const docIds = data.results.map((r: { document_id: number }) => r.document_id)
                if (docIds.length > 0) {
                    // For now, map search results to Documents
                    const searchDocs: Document[] = data.results.map((r: { document_id: number; file_name: string; file_path: string; file_type: string }) => ({
                        id: r.document_id,
                        file_name: r.file_name,
                        file_path: r.file_path,
                        file_type: r.file_type as 'image',
                        file_size: 0,
                        text_length: 0,
                        has_ocr: true,
                        file_modified_at: null,
                        indexed_at: ''
                    }))
                    setDocuments(searchDocs)
                } else {
                    setDocuments([])
                }
                setSearchQuery(searchInput)
            }
        } catch (err) {
            console.error('Search failed:', err)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b bg-card/50">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5 text-primary" />
                        <h1 className="text-lg font-semibold">Galerie Média</h1>
                    </div>

                    {/* Search bar */}
                    <form onSubmit={handleSearch} className="flex-1 max-w-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Rechercher dans les images (OCR)..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </form>

                    {searchQuery && (
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => { setSearchInput(''); setSearchQuery(''); window.location.reload() }}
                        >
                            Réinitialiser
                        </Button>
                    )}
                </div>

                {searchQuery && (
                    <p className="text-sm text-muted-foreground mt-2">
                        Résultats pour "{searchQuery}" dans les images
                    </p>
                )}
            </div>

            {/* Gallery Content */}
            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <GalleryView 
                    documents={documents}
                    className="flex-1"
                />
            )}
        </div>
    )
}
