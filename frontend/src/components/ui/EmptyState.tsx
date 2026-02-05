import { FolderSearch, ArrowRight, FileText, Image, FileCode } from 'lucide-react'

interface EmptyStateProps {
    onStartScan: () => void
}

export function EmptyState({ onStartScan }: EmptyStateProps) {
    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-lg text-center">
                {/* Illustration */}
                <div className="mx-auto w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                    <FolderSearch className="w-12 h-12 text-primary" />
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold mb-3">Aucun document indexé</h2>

                {/* Description */}
                <p className="text-muted-foreground mb-6 leading-relaxed">
                    Scannez un dossier contenant vos documents pour les indexer et commencer à chercher dans leur contenu.
                </p>

                {/* Supported file types */}
                <div className="flex justify-center gap-4 mb-8">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="w-4 h-4 text-red-400" />
                        <span>PDF</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Image className="w-4 h-4 text-blue-400" />
                        <span>Images</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileCode className="w-4 h-4 text-green-400" />
                        <span>Texte</span>
                    </div>
                </div>

                {/* CTA Button */}
                <button
                    onClick={onStartScan}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                    Lancer mon premier scan
                    <ArrowRight className="w-4 h-4" />
                </button>

                {/* Workflow explanation */}
                <div className="mt-10 pt-8 border-t border-border">
                    <h3 className="text-sm font-medium mb-4">Comment ça fonctionne ?</h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="text-center">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mx-auto mb-2 text-xs font-bold">1</div>
                            <p className="text-muted-foreground">Scan du dossier</p>
                        </div>
                        <div className="text-center">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mx-auto mb-2 text-xs font-bold">2</div>
                            <p className="text-muted-foreground">Extraction du texte</p>
                        </div>
                        <div className="text-center">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mx-auto mb-2 text-xs font-bold">3</div>
                            <p className="text-muted-foreground">Recherche hybride</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
