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

export { Skeleton, ProjectCardSkeleton, ResultCardSkeleton, ScanRowSkeleton }
