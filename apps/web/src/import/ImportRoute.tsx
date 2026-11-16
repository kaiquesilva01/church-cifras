import type { CatalogApi } from '../catalog/catalogApi';
import { readPdfSuggestion } from '../upload/readPdfSuggestion';
import { ImportPage } from './ImportPage';

// Lazy entry point: the only place that pulls in pdf.js for the batch import.
export default function ImportRoute({ api }: { api: CatalogApi }) {
  return <ImportPage api={api} readPdf={readPdfSuggestion} />;
}
