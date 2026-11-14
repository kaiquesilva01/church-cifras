import type { CatalogApi } from '../catalog/catalogApi';
import { readPdfSuggestion } from './readPdfSuggestion';
import { UploadPage } from './UploadPage';

// Lazy entry point: the only place that pulls in pdf.js.
export default function UploadRoute({ api }: { api: CatalogApi }) {
  return <UploadPage api={api} readPdf={readPdfSuggestion} />;
}
