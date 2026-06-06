export interface InsightConfig {
    text?: string;
}

export interface InsightViewProps {
    config: InsightConfig;
}

/** Text insight card rendered from AI analysis. */
export function InsightView({ config }: InsightViewProps) {
    return (
        <div className="h-full p-4 overflow-auto">
            <p className="text-sm text-midnight-text-body leading-relaxed whitespace-pre-wrap">
                {config.text}
            </p>
        </div>
    );
}

export default InsightView;
