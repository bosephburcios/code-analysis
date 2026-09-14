import type { CodeExcerpt } from './code-excerpts.ts';

export type EvidenceKind = 'external_api' | 'database' | 'api_route' | 'feature' | 'dependency' | 'data_model' | 'ai_service' | 'ui_component';
export type EvidenceItem = CodeExcerpt & {
  kind: EvidenceKind; path: string; blobSha?: string; score: number; reasons: string[];
  method?: string; endpoint?: string; symbol?: string; showCode: boolean;
};
export type EvidenceContext = {
  kind: EvidenceKind; definesComponent: boolean; lines: number[]; names: string[];
  hosts: string[]; packages: string[]; models: string[];
};
export type ComponentEvidence = {
  componentId: string; kind: EvidenceKind; treeSha: string; totalReferences: number; items: EvidenceItem[];
  coverage: { scanned: number; total: number; complete: boolean }; warnings: string[];
};
