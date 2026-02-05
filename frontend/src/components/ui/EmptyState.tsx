import { FolderSearch, ArrowRight, FileText, Image, FileCode } from 'lucide-react'
import { ProjectSelector } from '@/components/projects/ProjectSelector'
import { useProjects, Project } from '@/hooks/useProjects'

interface EmptyStateProps {
    onStartScan: (projectPath?: string) => void
}

export function EmptyState({ onStartScan }: EmptyStateProps) {
    const { projects, isLoading, documentsPath, selectedProject, setSelectedProject } = useProjects()

    const handleStartScan = () => {
        if (selectedProject) {
            onStartScan(selectedProject.path)
        } else {
            onStartScan()
        }
    }

    const handleSelectProject = (project: Project) => {
        setSelectedProject(project)
    }

    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-2xl w-full">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="mx-auto w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                        <FolderSearch className="w-12 h-12 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold mb-3">Aucun document indexé</h2>
                    <p className="text-muted-foreground leading-relaxed">
                        Sélectionnez un projet à analyser puis lancez le scan pour indexer les documents.
                    </p>
                </div>

                {/* Project Selector */}
                {projects.length > 0 && (
                    <div className="mb-8">
                        <ProjectSelector
                            projects={projects}
                            selectedProject={selectedProject}
                            onSelect={handleSelectProject}
                            isLoading={isLoading}
                            documentsPath={documentsPath}
                        />
                    </div>
                )}

                {/* No projects message */}
                {!isLoading && projects.length === 0 && (
                    <div className="text-center mb-8 p-6 border rounded-lg bg-muted/20">
                        <p className="text-muted-foreground mb-2">
                            Aucun projet trouvé dans <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{documentsPath}</code>
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Créez des dossiers pour organiser vos investigations
                        </p>
                    </div>
                )}

                {/* Supported file types */}
                <div className="flex justify-center gap-6 mb-8">
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
                <div className="text-center">
                    <button
                        onClick={handleStartScan}
                        disabled={projects.length > 0 && !selectedProject}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {selectedProject 
                            ? `Scanner "${selectedProject.name}"`
                            : projects.length > 0 
                                ? 'Sélectionnez un projet'
                                : 'Lancer mon premier scan'
                        }
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Workflow explanation */}
                <div className="mt-10 pt-8 border-t border-border">
                    <h3 className="text-sm font-medium mb-4 text-center">Comment ça fonctionne ?</h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="text-center">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mx-auto mb-2 text-xs font-bold">1</div>
                            <p className="text-muted-foreground">Scan du projet</p>
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
