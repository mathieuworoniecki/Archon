import { cn } from '@/lib/utils'

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-md bg-muted/50',
                className
            )}
            {...props}
        />
    )
}

/** 3-card grid skeleton for the project dashboard */
function ProjectCardSkeleton() {
    return (
        <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-[60%]" />
                    <Skeleton className="h-3 w-[40%]" />
                </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
            </div>
            <Skeleton className="h-9 w-full rounded-md" />
        </div>
    )
}

/** Single result card skeleton for search results */
function ResultCardSkeleton() {
    return (
        <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-[50%]" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[75%]" />
            <div className="flex gap-2">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full ml-auto" />
            </div>
        </div>
    )
}

/** Scan row skeleton */
function ScanRowSkeleton() {
    return (
        <div className="flex items-center gap-4 p-4 border-b">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-[30%]" />
                <Skeleton className="h-3 w-[50%]" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
        </div>
    )
}

/** Graph placeholder skeleton */
function GraphSkeleton() {
    return (
        <div className="h-full flex flex-col gap-4">
            <div className="flex gap-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-7 w-20 rounded-md" />)}
            </div>
            <div className="flex-1 rounded-xl border bg-card relative overflow-hidden">
                {/* Fake nodes */}
                <Skeleton className="absolute top-[15%] left-[25%] h-10 w-10 rounded-full" />
                <Skeleton className="absolute top-[30%] left-[55%] h-12 w-12 rounded-full" />
                <Skeleton className="absolute top-[55%] left-[35%] h-8 w-8 rounded-full" />
                <Skeleton className="absolute top-[40%] left-[70%] h-14 w-14 rounded-full" />
                <Skeleton className="absolute top-[65%] left-[60%] h-10 w-10 rounded-full" />
                <Skeleton className="absolute top-[20%] left-[80%] h-9 w-9 rounded-full" />
            </div>
        </div>
    )
}

/** Timeline heatmap placeholder skeleton */
function TimelineSkeleton() {
    return (
        <div className="space-y-6">
            {/* Stats cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="rounded-xl border bg-card p-6">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-8 w-8 rounded-lg" />
                            <div className="space-y-2 flex-1">
                                <Skeleton className="h-6 w-16" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {/* Heatmap area */}
            <Skeleton className="h-[300px] w-full rounded-xl" />
        </div>
    )
}

/** Gallery grid placeholder skeleton */
function GalleryGridSkeleton() {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 p-4">
            {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-card overflow-hidden">
                    <Skeleton className="aspect-square w-full" />
                    <div className="p-2 space-y-1.5">
                        <Skeleton className="h-3 w-[70%]" />
                        <Skeleton className="h-3 w-[40%]" />
                    </div>
                </div>
            ))}
        </div>
    )
}

export { Skeleton, ProjectCardSkeleton, ResultCardSkeleton, ScanRowSkeleton, GraphSkeleton, TimelineSkeleton, GalleryGridSkeleton }
