import { FolderSearch, ArrowRight, FileText, Image, FileCode } from 'lucide-react'
import { ProjectSelector } from '@/components/projects/ProjectSelector'
import { useTranslation } from '@/contexts/I18nContext'
import { useProject, type Project } from '@/contexts/ProjectContext'

interface EmptyStateProps {
    onStartScan: (projectPath?: string) => void
}

export function EmptyState({ onStartScan }: EmptyStateProps) {
    const { projects, isLoading, documentsPath, selectedProject, selectProject } = useProject()
    const { t } = useTranslation()

    const handleStartScan = () => {
        if (selectedProject) {
            onStartScan(selectedProject.path)
        } else {
            onStartScan()
        }
    }

    const handleSelectProject = (project: Project) => {
        selectProject(project)
    }

    const getScanButtonLabel = () => {
        if (selectedProject) return t('empty.scanProject').replace('{name}', selectedProject.name)
        if (projects.length > 0) return t('empty.selectAProject')
        return t('empty.firstScan')
    }

    return (
        <div className="flex-1 flex items-center justify-center p-8 retro-grid">
            <div className="max-w-2xl w-full">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="mx-auto w-24 h-24 rounded-full bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] flex items-center justify-center mb-6 hud-glow">
                        <FolderSearch className="w-12 h-12 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold mb-3 hud-text-glow">{t('empty.noDocuments')}</h2>
                    <p className="text-muted-foreground leading-relaxed">
                        {t('empty.selectProject')}
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
                    <div className="text-center mb-8 p-6 rounded-lg rui-glass-panel">
                        <p className="text-muted-foreground mb-2">
                            {t('empty.noProjects')} <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{documentsPath}</code>
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {t('empty.createFolders')}
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
                        <span>{t('empty.images')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileCode className="w-4 h-4 text-green-400" />
                        <span>{t('empty.text')}</span>
                    </div>
                </div>

                {/* CTA Button */}
                <div className="text-center">
                    <button
                        onClick={handleStartScan}
                        disabled={projects.length > 0 && !selectedProject}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {getScanButtonLabel()}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Workflow explanation */}
                <div className="mt-10 pt-8 border-t border-border">
                    <h3 className="text-sm font-medium mb-4 text-center">{t('empty.howItWorks')}</h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="text-center">
                            <div className="w-8 h-8 rounded-full bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.3)] flex items-center justify-center mx-auto mb-2 text-xs font-bold text-[#F59E0B]">1</div>
                            <p className="text-muted-foreground">{t('empty.step1')}</p>
                        </div>
                        <div className="text-center">
                            <div className="w-8 h-8 rounded-full bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.3)] flex items-center justify-center mx-auto mb-2 text-xs font-bold text-[#F59E0B]">2</div>
                            <p className="text-muted-foreground">{t('empty.step2')}</p>
                        </div>
                        <div className="text-center">
                            <div className="w-8 h-8 rounded-full bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.3)] flex items-center justify-center mx-auto mb-2 text-xs font-bold text-[#F59E0B]">3</div>
                            <p className="text-muted-foreground">{t('empty.step3')}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
