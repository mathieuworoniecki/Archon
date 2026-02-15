import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FolderOpen, Scan, Search, Calendar, ArrowRight } from 'lucide-react'

const ONBOARDING_KEY = 'archon_onboarding_v1_dismissed'

type Step = {
    id: string
    title: string
    description: string
    ctaLabel: string
    ctaTo: string
    icon: React.ReactNode
}

function markDismissed() {
    try {
        localStorage.setItem(ONBOARDING_KEY, '1')
    } catch {
        // ignore
    }
}

export function isOnboardingDismissed(): boolean {
    try {
        return localStorage.getItem(ONBOARDING_KEY) === '1'
    } catch {
        return false
    }
}

export function OnboardingDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const navigate = useNavigate()
    const [stepIndex, setStepIndex] = useState(0)

    const steps: Step[] = useMemo(() => ([
        {
            id: 'projects',
            title: '1. Choisir un projet',
            description: "Sélectionnez le dossier à analyser. C'est votre espace d'enquête.",
            ctaLabel: 'Voir les projets',
            ctaTo: '/projects',
            icon: <FolderOpen className="h-4 w-4" />,
        },
        {
            id: 'scan',
            title: '2. Lancer un scan',
            description: "Archon indexe et enrichit les fichiers (OCR, entités, embeddings). Vous pouvez estimer le volume avant de démarrer.",
            ctaLabel: 'Aller aux scans',
            ctaTo: '/scans',
            icon: <Scan className="h-4 w-4" />,
        },
        {
            id: 'documents',
            title: '3. Explorer les documents',
            description: "La page Documents est le hub: grille pour parcourir, vue détails pour lire et prouver.",
            ctaLabel: 'Ouvrir Documents',
            ctaTo: '/',
            icon: <Search className="h-4 w-4" />,
        },
        {
            id: 'timeline',
            title: '4. Relier (Timeline)',
            description: "Cliquez une période pour obtenir la liste de documents et ouvrir la preuve instantanément.",
            ctaLabel: 'Ouvrir Timeline',
            ctaTo: '/timeline',
            icon: <Calendar className="h-4 w-4" />,
        },
    ]), [])

    const step = steps[Math.min(stepIndex, steps.length - 1)]!
    const progressLabel = `${stepIndex + 1}/${steps.length}`

    const goNext = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1))
    const goPrev = () => setStepIndex((i) => Math.max(i - 1, 0))

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) markDismissed()
                onOpenChange(next)
            }}
        >
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <div className="flex items-center justify-between gap-3">
                        <DialogTitle className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center h-8 w-8 rounded-md border bg-card/40">
                                {step.icon}
                            </span>
                            Démarrage rapide
                        </DialogTitle>
                        <Badge variant="outline" className="text-[10px] tabular-nums">{progressLabel}</Badge>
                    </div>
                    <DialogDescription>
                        Pour prendre Archon en main sans friction.
                    </DialogDescription>
                </DialogHeader>

                <div className="rounded-lg border bg-card/30 p-4">
                    <p className="text-sm font-semibold">{step.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                    <div className="mt-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={goPrev}
                                disabled={stepIndex === 0}
                            >
                                Précédent
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={goNext}
                                disabled={stepIndex >= steps.length - 1}
                            >
                                Suivant
                            </Button>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    markDismissed()
                                    onOpenChange(false)
                                }}
                                className="text-muted-foreground"
                            >
                                Ne plus afficher
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                    navigate(step.ctaTo)
                                    if (stepIndex < steps.length - 1) goNext()
                                }}
                                className="gap-1.5"
                            >
                                {step.ctaLabel}
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

